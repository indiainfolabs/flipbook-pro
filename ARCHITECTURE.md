# FlipBook Pro — Master Architecture Specification

## Overview
FlipBook Pro is a Publuu-like SaaS that converts PDFs into interactive HTML5 flipbooks with realistic page-turn animations. Users upload PDFs, customize the viewer, and get embed codes / shareable links.

## Tech Stack
- **Runtime**: Vanilla JS (no framework for viewer), HTML5/CSS3 for dashboard
- **Page-Flip Engine**: Custom fork of StPageFlip with all community fixes merged
- **PDF Processing**: pdf.js (client-side rendering to canvas → WebP)
- **Backend API**: Hono v4 on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (page images, assets)
- **Cache**: Cloudflare KV
- **Auth**: Simple email/password with JWT
- **Payments**: Stripe (future phase)

## Project Structure
```
flipbook-pro/
├── index.html              # Landing page / marketing site
├── app.html                # SaaS dashboard (SPA)
├── viewer.html             # Embeddable flipbook viewer
├── base.css                # Base reset + tokens
├── style.css               # Landing page styles
├── app.css                 # Dashboard styles
├── viewer.css              # Viewer styles
├── js/
│   ├── page-flip-engine.js # Combined StPageFlip engine (all fixes)
│   ├── pdf-processor.js    # PDF → page images processor
│   ├── app.js              # Dashboard SPA logic
│   ├── viewer-app.js       # Viewer initialization + controls
│   ├── api-client.js       # API communication layer
│   ├── auth.js             # Authentication logic
│   ├── analytics.js        # View tracking + analytics
│   └── utils.js            # Shared utilities
├── api/
│   └── server.py           # FastAPI backend (for demo/MVP)
├── assets/
│   ├── logo.svg            # FlipBook Pro logo
│   └── icons/              # UI icons
└── vendor/
    └── pdf.js/             # PDF.js library files
```

## Database Schema (D1/SQLite)
```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'free',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Flipbooks
CREATE TABLE flipbooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT 'Untitled',
  slug TEXT UNIQUE,
  description TEXT,
  page_count INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  settings JSON DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  visibility TEXT DEFAULT 'private',
  password TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Pages
CREATE TABLE pages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  flipbook_id TEXT NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  width INTEGER,
  height INTEGER,
  text_content TEXT
);

-- Analytics
CREATE TABLE analytics (
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

-- Hotspots (interactive elements on pages)
CREATE TABLE hotspots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  flipbook_id TEXT NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  config JSON DEFAULT '{}'
);
```

## Flipbook Settings JSON Schema
```json
{
  "viewMode": "flip|scroll|slide",
  "showCover": true,
  "rtl": false,
  "autoPlay": false,
  "autoPlayInterval": 5000,
  "showPageNumbers": true,
  "showThumbnails": true,
  "showDownload": false,
  "showFullscreen": true,
  "showShare": true,
  "showZoom": true,
  "backgroundColor": "#ffffff",
  "flipSound": true,
  "maxShadowOpacity": 0.5,
  "flippingTime": 800,
  "showPageCorners": true,
  "branding": {
    "logo": "",
    "logoLink": "",
    "primaryColor": "#2563eb",
    "showBranding": true
  }
}
```

## API Endpoints
```
POST   /api/auth/register     — Create account
POST   /api/auth/login        — Login, returns JWT
GET    /api/auth/me           — Get current user

GET    /api/flipbooks         — List user's flipbooks
POST   /api/flipbooks         — Create new flipbook
GET    /api/flipbooks/:id     — Get flipbook details
PUT    /api/flipbooks/:id     — Update flipbook settings
DELETE /api/flipbooks/:id     — Delete flipbook

POST   /api/flipbooks/:id/pages — Upload page images
DELETE /api/flipbooks/:id/pages/:pageNum — Delete page

GET    /api/flipbooks/:id/analytics — Get analytics data
POST   /api/analytics/track   — Track viewer event

GET    /api/viewer/:slug      — Get public flipbook data for viewer
```

## Page-Flip Engine Requirements (Dev 1)
Start from SAILgaosai fork, merge in:
1. All bug fixes from research/page-flip-issues.md
2. RTL support from syblock PR#45
3. Soft cover from maxfahl
4. Flip hint from maxfahl
5. flipReverse() from eissapk
6. getMousePos scale fix from portalzine
7. Passive touch events fix
8. NEW: Lazy loading support
9. NEW: Auto-flip/slideshow mode
10. NEW: Sound event hooks
11. NEW: Zoom support
12. NEW: Swipe disable option
13. Export as single UMD/ESM bundle: page-flip-engine.js

## Viewer Requirements (Dev 4)
- Standalone HTML page that loads flipbook data from API
- URL format: /viewer.html?id=SLUG or /viewer.html#SLUG
- Controls: prev/next, page number, thumbnails, fullscreen, zoom, share, download
- Mobile responsive (portrait single-page, landscape two-page)
- Keyboard shortcuts (arrows, space, escape)
- Touch/swipe support
- Loading skeleton while pages load
- Analytics tracking (page views, time on page, interactions)
- Embed mode (iframe-friendly, message API)

## Dashboard Requirements (Dev 3)
- SPA with hash-based routing
- Views: #login, #register, #dashboard, #create, #editor/:id, #analytics/:id, #settings
- Gallery grid with flipbook cards (thumbnail, title, page count, views, status)
- Create flow: Upload PDF → Processing → Configure → Publish
- Editor: Live preview + settings panel (appearance, branding, interactivity, sharing)
- Analytics view: Views over time chart, page heatmap, visitor stats
- Settings: Account, billing, branding defaults
- Dark/light theme
- Responsive design
