# Agent Specifications — FlipBook Pro Improvements

## Publuu Research Summary
Publuu uses:
- **Canvas-based rendering** for flip animation (not CSS 3D transforms)
- Realistic page curl/fold with dynamic shadows during flip
- Page follows mouse/touch precisely, allowing partial turns
- Full-bleed dark background with radial vignette
- Toolbar at TOP center (not bottom) with: Thumbnails, Share, Download, Audio, Print, Zoom, Notes
- Thumbnail panel as vertical LEFT side panel (not bottom strip)
- Large semi-transparent chevron arrows on far left/right of book
- Animated corner curl hint on initial load
- Page scrubber/slider at bottom center
- Book title top-left, branding top-right
- Zoom mode with dedicated toolbar + pan + slider
- Search functionality with side panel results

## Current Architecture
- `/home/user/workspace/flipbook-pro/` — project root
- Backend: FastAPI at `api/server.py`, SQLite, PID 3214 on port 8000
- `__PORT_8000__` placeholder in frontend JS files gets replaced by deploy_website
- Engine exports: `window.PageFlipEngine` (namespace) and `window.PageFlip` (class)
- `safeStorage` wrapper in app.js uses `window['local' + 'Storage']` trick
- Dashboard `app.js` has inline `api` object (not external api-client.js)

## Critical Bugs Found
1. PageFlip engine init fails silently → falls back to CSS flip
2. CSS flip is just `perspective(1200px) rotateY(-120deg)` — NOT a page fold
3. The `_animateFlip` callback fires at 60% of animation time, cutting off the animation
4. Container setup conflicts with StPageFlip's DOM management
5. No flip hint animation on load
6. Toolbar is at bottom (Publuu has it at top)
