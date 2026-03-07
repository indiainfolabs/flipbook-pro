/**
 * FlipBook Pro — Cloudflare Worker API
 * Mirrors the FastAPI backend endpoints using D1 (SQLite) + R2 (file storage)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message, status = 400) {
  return json({ detail: message }, status);
}

function generateId() {
  return crypto.randomUUID().replace(/-/g, '');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'flipbook-pro-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // Initialize DB on first request
      await initDB(env.DB);

      // Route matching
      if (path === '/api/health') return json({ status: 'ok', service: 'flipbook-pro-api' });

      // Auth routes
      if (path === '/api/auth/register' && method === 'POST') return handleRegister(request, env);
      if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env);
      if (path === '/api/auth/me' && method === 'GET') return handleMe(request, env);

      // Flipbook CRUD
      if (path === '/api/flipbooks' && method === 'GET') return handleListFlipbooks(request, env);
      if (path === '/api/flipbooks' && method === 'POST') return handleCreateFlipbook(request, env);

      const flipbookMatch = path.match(/^\/api\/flipbooks\/([a-f0-9]+)$/);
      if (flipbookMatch && method === 'GET') return handleGetFlipbook(flipbookMatch[1], env);
      if (flipbookMatch && method === 'PUT') return handleUpdateFlipbook(flipbookMatch[1], request, env);
      if (flipbookMatch && method === 'DELETE') return handleDeleteFlipbook(flipbookMatch[1], request, env);

      // Page images
      const pageMatch = path.match(/^\/api\/flipbooks\/([a-f0-9]+)\/pages\/(\d+)$/);
      if (pageMatch && method === 'GET') return handleGetPage(pageMatch[1], parseInt(pageMatch[2]), env);

      const thumbMatch = path.match(/^\/api\/flipbooks\/([a-f0-9]+)\/pages\/(\d+)\/thumb$/);
      if (thumbMatch && method === 'GET') return handleGetThumb(thumbMatch[1], parseInt(thumbMatch[2]), env);

      // Upload
      if (path === '/api/upload' && method === 'POST') return handleUpload(request, env);

      // Analytics
      const analyticsMatch = path.match(/^\/api\/flipbooks\/([a-f0-9]+)\/analytics$/);
      if (analyticsMatch && method === 'GET') return handleGetAnalytics(analyticsMatch[1], env);
      if (analyticsMatch && method === 'POST') return handleTrackView(analyticsMatch[1], request, env);

      // General analytics track endpoint
      if (path === '/api/analytics/track' && method === 'POST') return handleGeneralTrack(request, env);

      // Viewer data
      const viewerMatch = path.match(/^\/api\/viewer\/([a-f0-9]+)$/);
      if (viewerMatch && method === 'GET') return handleViewerData(viewerMatch[1], env, request);

      return error('Not found', 404);
    } catch (e) {
      console.error('API Error:', e);
      return error('Internal server error: ' + e.message, 500);
    }
  }
};

// ============================================================
// Database Initialization
// ============================================================

let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;

  await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT DEFAULT '', plan TEXT DEFAULT 'free', created_at TEXT DEFAULT (datetime('now')))`);

  await db.exec(`CREATE TABLE IF NOT EXISTS flipbooks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT DEFAULT 'Untitled Flipbook', status TEXT DEFAULT 'draft', page_count INTEGER DEFAULT 0, settings TEXT DEFAULT '{}', views INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);

  await db.exec(`CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, flipbook_id TEXT NOT NULL, event TEXT NOT NULL, page_num INTEGER, duration INTEGER, referrer TEXT, user_agent TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id))`);

  dbInitialized = true;
}

// ============================================================
// Auth Helpers
// ============================================================

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function getUserFromToken(token, db) {
  if (!token) return null;
  // Simple token = base64(userId)
  try {
    const userId = atob(token);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return user;
  } catch {
    return null;
  }
}

function makeToken(userId) {
  return btoa(userId);
}

// ============================================================
// Auth Handlers
// ============================================================

async function handleRegister(request, env) {
  const body = await request.json();
  const { email, password, name } = body;

  if (!email || !password) return error('Email and password required');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return error('Email already registered', 409);

  const id = generateId();
  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
  ).bind(id, email.toLowerCase(), passwordHash, name || '').run();

  return json({
    token: makeToken(id),
    user: { id, email: email.toLowerCase(), name: name || '', plan: 'free' }
  }, 201);
}

async function handleLogin(request, env) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) return error('Email and password required');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return error('Invalid credentials', 401);

  const passwordHash = await hashPassword(password);
  if (user.password_hash !== passwordHash) return error('Invalid credentials', 401);

  return json({
    token: makeToken(user.id),
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
  });
}

async function handleMe(request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  return json({ id: user.id, email: user.email, name: user.name, plan: user.plan });
}

// ============================================================
// Flipbook CRUD
// ============================================================

async function handleListFlipbooks(request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(
    'SELECT * FROM flipbooks WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(user.id).all();

  const flipbooks = results.map(f => ({
    ...f,
    settings: JSON.parse(f.settings || '{}')
  }));

  return json({ flipbooks, total: flipbooks.length });
}

async function handleCreateFlipbook(request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json().catch(() => ({}));
  const id = generateId();
  const title = body.title || 'Untitled Flipbook';

  await env.DB.prepare(
    'INSERT INTO flipbooks (id, user_id, title) VALUES (?, ?, ?)'
  ).bind(id, user.id, title).run();

  return json({ id, title, status: 'draft', pageCount: 0 }, 201);
}

async function handleGetFlipbook(id, env) {
  const flipbook = await env.DB.prepare('SELECT * FROM flipbooks WHERE id = ?').bind(id).first();
  if (!flipbook) return error('Flipbook not found', 404);

  return json({
    ...flipbook,
    settings: JSON.parse(flipbook.settings || '{}')
  });
}

async function handleUpdateFlipbook(id, request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json();
  const updates = [];
  const values = [];

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.settings !== undefined) { updates.push('settings = ?'); values.push(JSON.stringify(body.settings)); }

  if (updates.length === 0) return error('No fields to update');

  updates.push("updated_at = datetime('now')");
  values.push(id, user.id);

  await env.DB.prepare(
    `UPDATE flipbooks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
  ).bind(...values).run();

  return json({ success: true });
}

async function handleDeleteFlipbook(id, request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  // Delete from R2
  const list = await env.UPLOADS.list({ prefix: `${id}/` });
  for (const obj of list.objects) {
    await env.UPLOADS.delete(obj.key);
  }

  await env.DB.prepare('DELETE FROM analytics WHERE flipbook_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM flipbooks WHERE id = ? AND user_id = ?').bind(id, user.id).run();

  return json({ success: true });
}

// ============================================================
// Page Images (from R2)
// ============================================================

async function handleGetPage(flipbookId, pageNum, env) {
  const key = `${flipbookId}/page_${pageNum}.webp`;
  const object = await env.UPLOADS.get(key);

  if (!object) {
    // Return a generated placeholder page
    return generatePlaceholderPage(pageNum);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  });
}

async function handleGetThumb(flipbookId, pageNum, env) {
  const key = `${flipbookId}/thumbs/page_${pageNum}_thumb.webp`;
  const object = await env.UPLOADS.get(key);

  if (!object) {
    return generatePlaceholderPage(pageNum, true);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  });
}

function generatePlaceholderPage(pageNum, isThumb = false) {
  const w = isThumb ? 150 : 600;
  const h = isThumb ? 200 : 800;
  const fontSize = isThumb ? 16 : 48;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect fill="#f8fafc" width="${w}" height="${h}"/>
    <rect fill="#e2e8f0" x="${w*0.1}" y="${h*0.08}" width="${w*0.8}" height="${h*0.25}" rx="8"/>
    <text x="${w/2}" y="${h*0.5}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#94a3b8">Page ${pageNum}</text>
    <rect fill="#f1f5f9" x="${w*0.1}" y="${h*0.58}" width="${w*0.75}" height="${h*0.02}" rx="4"/>
    <rect fill="#f1f5f9" x="${w*0.1}" y="${h*0.63}" width="${w*0.6}" height="${h*0.02}" rx="4"/>
    <rect fill="#f1f5f9" x="${w*0.1}" y="${h*0.68}" width="${w*0.7}" height="${h*0.02}" rx="4"/>
    <rect fill="#f1f5f9" x="${w*0.1}" y="${h*0.73}" width="${w*0.5}" height="${h*0.02}" rx="4"/>
  </svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}

// ============================================================
// Upload Handler
// ============================================================

async function handleUpload(request, env) {
  const token = getToken(request);
  const user = await getUserFromToken(token, env.DB);
  if (!user) return error('Unauthorized', 401);

  const formData = await request.formData();
  const file = formData.get('file');
  const flipbookId = formData.get('flipbookId') || generateId();

  if (!file) return error('No file uploaded');

  // Store the raw PDF in R2
  const pdfKey = `${flipbookId}/original.pdf`;
  await env.UPLOADS.put(pdfKey, file.stream(), {
    httpMetadata: { contentType: 'application/pdf' }
  });

  // For demo purposes, create placeholder pages (real implementation would use a PDF renderer)
  const pageCount = 8; // Demo: 8 pages
  
  await env.DB.prepare(
    `INSERT OR REPLACE INTO flipbooks (id, user_id, title, page_count, status, updated_at) 
     VALUES (?, ?, ?, ?, 'published', datetime('now'))`
  ).bind(flipbookId, user.id, file.name?.replace('.pdf', '') || 'Uploaded Flipbook', pageCount).run();

  return json({
    id: flipbookId,
    pageCount,
    title: file.name?.replace('.pdf', '') || 'Uploaded Flipbook',
    status: 'published'
  }, 201);
}

// ============================================================
// Analytics
// ============================================================

async function handleGetAnalytics(flipbookId, env) {
  const flipbook = await env.DB.prepare('SELECT * FROM flipbooks WHERE id = ?').bind(flipbookId).first();
  if (!flipbook) return error('Flipbook not found', 404);

  const { results: events } = await env.DB.prepare(
    'SELECT * FROM analytics WHERE flipbook_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(flipbookId).all();

  return json({
    totalViews: flipbook.views || 0,
    uniqueVisitors: events.length,
    avgDuration: 0,
    events: events
  });
}

async function handleTrackView(flipbookId, request, env) {
  const body = await request.json().catch(() => ({}));

  await env.DB.prepare(
    'INSERT INTO analytics (flipbook_id, event, page_num, duration, referrer, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    flipbookId,
    body.event || 'view',
    body.pageNum || null,
    body.duration || null,
    request.headers.get('Referer') || '',
    request.headers.get('User-Agent') || ''
  ).run();

  await env.DB.prepare(
    'UPDATE flipbooks SET views = views + 1 WHERE id = ?'
  ).bind(flipbookId).run();

  return json({ success: true });
}

// ============================================================
// General Analytics Track (for viewer)
// ============================================================

async function handleGeneralTrack(request, env) {
  const body = await request.json().catch(() => ({}));
  const flipbookId = body.flipbook_id;
  if (!flipbookId) return json({ success: true }); // silently ignore invalid

  await env.DB.prepare(
    'INSERT INTO analytics (flipbook_id, event, page_num, duration, referrer, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    flipbookId,
    body.event_type || body.event || 'view',
    body.page_number || body.pageNum || null,
    body.duration || null,
    body.referrer || request.headers.get('Referer') || '',
    body.user_agent || request.headers.get('User-Agent') || ''
  ).run();

  // Increment view count on the flipbook
  await env.DB.prepare(
    'UPDATE flipbooks SET views = views + 1 WHERE id = ?'
  ).bind(flipbookId).run();

  return json({ success: true });
}

// ============================================================
// Viewer Data (public endpoint for embedded viewer)
// ============================================================

async function handleViewerData(flipbookId, env, request) {
  const flipbook = await env.DB.prepare('SELECT * FROM flipbooks WHERE id = ?').bind(flipbookId).first();
  if (!flipbook) return error('Flipbook not found', 404);

  const settings = JSON.parse(flipbook.settings || '{}');
  const origin = new URL(request.url).origin;

  return json({
    id: flipbook.id,
    title: flipbook.title,
    pageCount: flipbook.page_count || 8,
    status: flipbook.status,
    settings,
    pages: Array.from({ length: flipbook.page_count || 8 }, (_, i) => ({
      num: i + 1,
      pageNumber: i + 1,
      imageUrl: `${origin}/api/flipbooks/${flipbook.id}/pages/${i + 1}`,
      image_url: `${origin}/api/flipbooks/${flipbook.id}/pages/${i + 1}`,
      thumbUrl: `${origin}/api/flipbooks/${flipbook.id}/pages/${i + 1}/thumb`,
      thumb_url: `${origin}/api/flipbooks/${flipbook.id}/pages/${i + 1}/thumb`,
      width: 794,
      height: 1123,
    }))
  });
}
