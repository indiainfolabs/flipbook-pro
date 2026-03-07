#!/usr/bin/env python3
"""
FlipBook Pro — FastAPI Backend Server
Runs on port 8000. SQLite database at api/flipbook.db.
"""

import os
import sqlite3
import secrets
import uuid
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

import bcrypt
import jwt
from fastapi import (
    FastAPI, HTTPException, Depends, Header, UploadFile, File,
    Form, status, Request, Response
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from PIL import Image
import io

# ─── Configuration ────────────────────────────────────────────────────────────

SECRET_KEY = os.environ.get(
    "FLIPBOOK_SECRET_KEY",
    os.environ.get("JWT_SECRET", secrets.token_hex(32))
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

BASE_DIR = Path(__file__).parent.parent  # /home/user/workspace/flipbook-pro
DB_PATH = Path(__file__).parent / "flipbook.db"
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

THUMB_WIDTH = 200

# Default flipbook settings (used when settings are missing fields)
DEFAULT_FLIPBOOK_SETTINGS = {
    "flipSound": False,
    "autoPlay": False,
    "autoPlayInterval": 3000,
    "showPageCorners": True,
    "maxShadowOpacity": 0.5,
}

# ─── Database setup ───────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            plan TEXT DEFAULT 'free',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS flipbooks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            title TEXT NOT NULL DEFAULT 'Untitled',
            slug TEXT UNIQUE,
            description TEXT,
            page_count INTEGER DEFAULT 0,
            thumbnail_url TEXT,
            settings TEXT DEFAULT '{}',
            status TEXT DEFAULT 'draft',
            visibility TEXT DEFAULT 'private',
            password TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            flipbook_id TEXT NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            thumb_url TEXT,
            width INTEGER,
            height INTEGER,
            text_content TEXT
        );

        CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flipbook_id TEXT NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            page_number INTEGER,
            visitor_id TEXT,
            referrer TEXT,
            user_agent TEXT,
            country TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS hotspots (
            id TEXT PRIMARY KEY,
            flipbook_id TEXT NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            type TEXT NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            config TEXT DEFAULT '{}'
        );
    """)
    conn.commit()
    conn.close()


# Shared connection (created after lifespan)
db_conn: sqlite3.Connection = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_conn
    init_db()
    db_conn = get_db()
    yield
    if db_conn:
        db_conn.close()


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="FlipBook Pro API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# ─── Rate-limit middleware (fake values for demo) ─────────────────────────────

@app.middleware("http")
async def rate_limit_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-RateLimit-Remaining"] = "99"
    response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 3600)
    return response


# ─── Consistent error handler ────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
    }
    error_code = code_map.get(exc.status_code, "ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": error_code,
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            }
        },
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def new_id() -> str:
    return uuid.uuid4().hex


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    """Returns user_id or raises HTTPException."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token)
    row = db_conn.execute(
        "SELECT id, email, name, plan, created_at FROM users WHERE id = ?", [user_id]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)


def generate_slug(title: str, flipbook_id: str) -> str:
    """Generate a URL-safe slug from title + short id."""
    base = "".join(c if c.isalnum() else "-" for c in title.lower()).strip("-")
    base = "-".join(filter(None, base.split("-")))[:40]
    suffix = flipbook_id[:6]
    candidate = f"{base}-{suffix}" if base else suffix
    # Ensure uniqueness
    slug = candidate
    n = 1
    while db_conn.execute("SELECT id FROM flipbooks WHERE slug = ?", [slug]).fetchone():
        slug = f"{candidate}-{n}"
        n += 1
    return slug


def make_thumbnail(image_bytes: bytes, dest_path: Path):
    img = Image.open(io.BytesIO(image_bytes))
    ratio = THUMB_WIDTH / img.width
    new_height = int(img.height * ratio)
    thumb = img.resize((THUMB_WIDTH, new_height), Image.LANCZOS)
    thumb.save(str(dest_path), "WEBP", quality=75)


def snake_to_camel(s: str) -> str:
    """Convert snake_case to camelCase."""
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def to_camel_case_dict(d: dict) -> dict:
    """Recursively convert dict keys from snake_case to camelCase."""
    result = {}
    for key, value in d.items():
        camel_key = snake_to_camel(key)
        if isinstance(value, dict):
            result[camel_key] = to_camel_case_dict(value)
        elif isinstance(value, list):
            result[camel_key] = [
                to_camel_case_dict(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            result[camel_key] = value
    return result


def merge_flipbook_settings(stored_settings: dict) -> dict:
    """Merge stored settings with defaults so all expected fields are present."""
    merged = dict(DEFAULT_FLIPBOOK_SETTINGS)
    merged.update(stored_settings)
    return merged


# ─── Pydantic models ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateFlipbookRequest(BaseModel):
    title: Optional[str] = "Untitled"
    description: Optional[str] = None
    settings: Optional[dict] = {}
    visibility: Optional[str] = "private"


class UpdateFlipbookRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    settings: Optional[dict] = None
    visibility: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None


class TrackEventRequest(BaseModel):
    flipbook_id: str
    event_type: str
    page_number: Optional[int] = None
    visitor_id: Optional[str] = None
    referrer: Optional[str] = None
    user_agent: Optional[str] = None


# ─── Auth Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/register", status_code=201)
def register(body: RegisterRequest):
    # Validate
    if not body.email or "@" not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if not body.password or len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = db_conn.execute(
        "SELECT id FROM users WHERE email = ?", [body.email.lower()]
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = new_id()
    password_hash = hash_password(body.password)
    now = datetime.now(timezone.utc).isoformat()

    db_conn.execute(
        "INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [user_id, body.email.lower(), password_hash, body.name, now, now]
    )
    db_conn.commit()

    token = create_token(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": body.email.lower(),
            "name": body.name,
            "plan": "free",
        }
    }


@app.post("/api/auth/login")
def login(body: LoginRequest):
    row = db_conn.execute(
        "SELECT id, email, password_hash, name, plan FROM users WHERE email = ?",
        [body.email.lower()]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(row["id"])
    return {
        "token": token,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "plan": row["plan"],
        }
    }


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ─── Flipbook CRUD ────────────────────────────────────────────────────────────

@app.get("/api/flipbooks")
def list_flipbooks(current_user: dict = Depends(get_current_user)):
    rows = db_conn.execute(
        """SELECT id, title, slug, description, page_count, thumbnail_url,
                  settings, status, visibility, created_at, updated_at
           FROM flipbooks WHERE user_id = ? ORDER BY created_at DESC""",
        [current_user["id"]]
    ).fetchall()
    result = []
    for r in rows:
        fb = dict(r)
        fb["settings"] = merge_flipbook_settings(json.loads(fb["settings"] or "{}"))
        # attach view count
        views = db_conn.execute(
            "SELECT COUNT(*) as c FROM analytics WHERE flipbook_id = ? AND event_type = 'view'",
            [fb["id"]]
        ).fetchone()["c"]
        fb["view_count"] = views
        result.append(fb)
    return result


@app.post("/api/flipbooks", status_code=201)
def create_flipbook(body: CreateFlipbookRequest, current_user: dict = Depends(get_current_user)):
    flipbook_id = new_id()
    now = datetime.now(timezone.utc).isoformat()
    slug = generate_slug(body.title or "untitled", flipbook_id)
    settings_json = json.dumps(body.settings or {})

    db_conn.execute(
        """INSERT INTO flipbooks
           (id, user_id, title, slug, description, settings, visibility, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [flipbook_id, current_user["id"], body.title, slug, body.description,
         settings_json, body.visibility, now, now]
    )
    db_conn.commit()

    return {
        "id": flipbook_id,
        "slug": slug,
        "title": body.title,
        "description": body.description,
        "settings": merge_flipbook_settings(body.settings or {}),
        "visibility": body.visibility,
        "status": "draft",
        "page_count": 0,
        "created_at": now,
    }


@app.get("/api/flipbooks/{flipbook_id}")
def get_flipbook(flipbook_id: str, current_user: dict = Depends(get_current_user)):
    row = db_conn.execute(
        "SELECT * FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    fb = dict(row)
    fb["settings"] = merge_flipbook_settings(json.loads(fb["settings"] or "{}"))

    pages = db_conn.execute(
        "SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC",
        [flipbook_id]
    ).fetchall()
    fb["pages"] = [dict(p) for p in pages]
    return fb


@app.put("/api/flipbooks/{flipbook_id}")
def update_flipbook(
    flipbook_id: str,
    body: UpdateFlipbookRequest,
    current_user: dict = Depends(get_current_user)
):
    row = db_conn.execute(
        "SELECT id FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    if body.settings is not None:
        updates["settings"] = json.dumps(body.settings)
    if body.visibility is not None:
        updates["visibility"] = body.visibility
    if body.status is not None:
        updates["status"] = body.status
    if body.password is not None:
        updates["password"] = body.password

    if not updates:
        return {"message": "Nothing to update"}

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [flipbook_id]
    db_conn.execute(f"UPDATE flipbooks SET {set_clause} WHERE id = ?", values)
    db_conn.commit()

    # Return updated record
    updated = dict(db_conn.execute("SELECT * FROM flipbooks WHERE id = ?", [flipbook_id]).fetchone())
    updated["settings"] = merge_flipbook_settings(json.loads(updated["settings"] or "{}"))
    return updated


@app.delete("/api/flipbooks/{flipbook_id}", status_code=204)
def delete_flipbook(flipbook_id: str, current_user: dict = Depends(get_current_user)):
    row = db_conn.execute(
        "SELECT id FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    # Remove upload directory
    fb_upload_dir = UPLOADS_DIR / flipbook_id
    if fb_upload_dir.exists():
        import shutil
        shutil.rmtree(str(fb_upload_dir))

    db_conn.execute("DELETE FROM flipbooks WHERE id = ?", [flipbook_id])
    db_conn.commit()
    return None


# ─── Page Upload ──────────────────────────────────────────────────────────────

@app.post("/api/flipbooks/{flipbook_id}/pages", status_code=201)
async def upload_pages(
    flipbook_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    row = db_conn.execute(
        "SELECT id, page_count FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Get current max page number
    max_page_row = db_conn.execute(
        "SELECT COALESCE(MAX(page_number), 0) as mp FROM pages WHERE flipbook_id = ?",
        [flipbook_id]
    ).fetchone()
    next_page_num = max_page_row["mp"] + 1

    upload_dir = UPLOADS_DIR / flipbook_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = upload_dir / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    created_pages = []
    thumbnail_url = None

    for i, file in enumerate(files):
        page_num = next_page_num + i

        # Read file content
        content = await file.read()
        if not content:
            continue
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 20MB per page)")

        # Open with Pillow to validate + get dimensions
        try:
            img = Image.open(io.BytesIO(content))
            width, height = img.size
            # Convert to WEBP
            webp_buffer = io.BytesIO()
            img.save(webp_buffer, "WEBP", quality=85)
            webp_bytes = webp_buffer.getvalue()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file: {file.filename}: {e}")

        # Save main image
        page_filename = f"page_{page_num}.webp"
        page_path = upload_dir / page_filename
        page_path.write_bytes(webp_bytes)

        # Generate thumbnail
        thumb_filename = f"page_{page_num}_thumb.webp"
        thumb_path = thumb_dir / thumb_filename
        make_thumbnail(webp_bytes, thumb_path)

        image_url = f"/uploads/{flipbook_id}/{page_filename}"
        thumb_url = f"/uploads/{flipbook_id}/thumbs/{thumb_filename}"

        if page_num == 1:
            thumbnail_url = thumb_url

        page_id = new_id()
        db_conn.execute(
            """INSERT INTO pages (id, flipbook_id, page_number, image_url, thumb_url, width, height)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [page_id, flipbook_id, page_num, image_url, thumb_url, width, height]
        )
        created_pages.append({
            "id": page_id,
            "page_number": page_num,
            "image_url": image_url,
            "thumb_url": thumb_url,
            "width": width,
            "height": height,
        })

    if not created_pages:
        raise HTTPException(status_code=400, detail="No valid images uploaded")

    # Update flipbook page_count (and thumbnail if first pages)
    total_pages = db_conn.execute(
        "SELECT COUNT(*) as c FROM pages WHERE flipbook_id = ?", [flipbook_id]
    ).fetchone()["c"]

    update_fields = "page_count = ?, updated_at = ?"
    update_vals = [total_pages, datetime.now(timezone.utc).isoformat()]
    if thumbnail_url:
        update_fields += ", thumbnail_url = ?"
        update_vals.append(thumbnail_url)
    update_vals.append(flipbook_id)

    db_conn.execute(f"UPDATE flipbooks SET {update_fields} WHERE id = ?", update_vals)
    db_conn.commit()

    return {"pages": created_pages, "total_pages": total_pages}


@app.delete("/api/flipbooks/{flipbook_id}/pages/{page_num}", status_code=204)
def delete_page(
    flipbook_id: str,
    page_num: int,
    current_user: dict = Depends(get_current_user)
):
    row = db_conn.execute(
        "SELECT id FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    page_row = db_conn.execute(
        "SELECT id, image_url, thumb_url FROM pages WHERE flipbook_id = ? AND page_number = ?",
        [flipbook_id, page_num]
    ).fetchone()
    if not page_row:
        raise HTTPException(status_code=404, detail="Page not found")

    # Remove files
    for url_field in [page_row["image_url"], page_row["thumb_url"]]:
        if url_field:
            file_path = BASE_DIR / url_field.lstrip("/")
            if file_path.exists():
                file_path.unlink()

    db_conn.execute("DELETE FROM pages WHERE id = ?", [page_row["id"]])

    # Recalculate page count
    total = db_conn.execute(
        "SELECT COUNT(*) as c FROM pages WHERE flipbook_id = ?", [flipbook_id]
    ).fetchone()["c"]
    db_conn.execute(
        "UPDATE flipbooks SET page_count = ?, updated_at = ? WHERE id = ?",
        [total, datetime.now(timezone.utc).isoformat(), flipbook_id]
    )
    db_conn.commit()
    return None


# ─── Viewer API (public, no auth) ─────────────────────────────────────────────

@app.get("/api/viewer/{slug}")
def get_viewer(slug: str, request: Request):
    row = db_conn.execute(
        "SELECT * FROM flipbooks WHERE slug = ?", [slug]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    fb = dict(row)
    # Only serve public flipbooks (or draft for preview—check via header)
    if fb["visibility"] == "private":
        # Allow if authenticated owner
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                user_id = decode_token(auth_header.split(" ", 1)[1])
                if fb["user_id"] != user_id:
                    raise HTTPException(status_code=403, detail="This flipbook is private")
            except HTTPException:
                raise HTTPException(status_code=403, detail="This flipbook is private")
        else:
            raise HTTPException(status_code=403, detail="This flipbook is private")

    # Merge stored settings with defaults
    fb["settings"] = merge_flipbook_settings(json.loads(fb["settings"] or "{}"))

    pages = db_conn.execute(
        "SELECT page_number, image_url, thumb_url, width, height FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC",
        [fb["id"]]
    ).fetchall()
    fb["pages"] = [dict(p) for p in pages]

    # Strip sensitive fields
    fb.pop("password", None)
    fb.pop("user_id", None)

    # Convert entire response to camelCase for frontend consumption
    return to_camel_case_dict(fb)


# ─── Analytics ────────────────────────────────────────────────────────────────

@app.post("/api/analytics/track", status_code=201)
def track_event(body: TrackEventRequest, request: Request):
    # Validate event_type
    valid_event_types = {"view", "page_view", "share", "fullscreen", "download", "time_spent"}
    if body.event_type not in valid_event_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event_type. Must be one of: {', '.join(sorted(valid_event_types))}"
        )

    # Verify flipbook exists
    row = db_conn.execute(
        "SELECT id FROM flipbooks WHERE id = ?", [body.flipbook_id]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    # Prefer body fields, fall back to request headers
    user_agent = body.user_agent or request.headers.get("user-agent", "")
    referrer = body.referrer or request.headers.get("referer", "")

    db_conn.execute(
        """INSERT INTO analytics (flipbook_id, event_type, page_number, visitor_id, referrer, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [body.flipbook_id, body.event_type, body.page_number,
         body.visitor_id, referrer, user_agent,
         datetime.now(timezone.utc).isoformat()]
    )
    db_conn.commit()
    return {"recorded": True}


@app.get("/api/flipbooks/{flipbook_id}/analytics")
def get_analytics(flipbook_id: str, current_user: dict = Depends(get_current_user)):
    row = db_conn.execute(
        "SELECT id, title FROM flipbooks WHERE id = ? AND user_id = ?",
        [flipbook_id, current_user["id"]]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Flipbook not found")

    # Total views
    total_views = db_conn.execute(
        "SELECT COUNT(*) as c FROM analytics WHERE flipbook_id = ? AND event_type = 'view'",
        [flipbook_id]
    ).fetchone()["c"]

    # Unique visitors
    unique_visitors = db_conn.execute(
        "SELECT COUNT(DISTINCT visitor_id) as c FROM analytics WHERE flipbook_id = ? AND visitor_id IS NOT NULL",
        [flipbook_id]
    ).fetchone()["c"]

    # Page heatmap: count page_view events per page_number
    heatmap_rows = db_conn.execute(
        """SELECT page_number, COUNT(*) as views
           FROM analytics
           WHERE flipbook_id = ? AND event_type = 'page_view' AND page_number IS NOT NULL
           GROUP BY page_number ORDER BY page_number""",
        [flipbook_id]
    ).fetchall()
    page_heatmap = {r["page_number"]: r["views"] for r in heatmap_rows}

    # Views over last 30 days
    daily_views = db_conn.execute(
        """SELECT date(created_at) as day, COUNT(*) as views
           FROM analytics
           WHERE flipbook_id = ? AND event_type = 'view'
             AND created_at >= date('now', '-30 days')
           GROUP BY day ORDER BY day""",
        [flipbook_id]
    ).fetchall()

    # Average time on flipbook (from 'time_spent' events with page_number storing seconds)
    avg_time_row = db_conn.execute(
        """SELECT AVG(page_number) as avg_sec
           FROM analytics
           WHERE flipbook_id = ? AND event_type = 'time_spent'""",
        [flipbook_id]
    ).fetchone()
    avg_time = avg_time_row["avg_sec"] or 0

    # Recent events (last 100)
    recent = db_conn.execute(
        """SELECT event_type, page_number, visitor_id, created_at
           FROM analytics WHERE flipbook_id = ?
           ORDER BY id DESC LIMIT 100""",
        [flipbook_id]
    ).fetchall()

    return {
        "flipbook_id": flipbook_id,
        "title": row["title"],
        "total_views": total_views,
        "unique_visitors": unique_visitors,
        "avg_time_seconds": round(avg_time, 1),
        "page_heatmap": page_heatmap,
        "daily_views": [dict(r) for r in daily_views],
        "recent_events": [dict(r) for r in recent],
    }


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
