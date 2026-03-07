# FlipBook Pro

Transform PDFs into stunning interactive flipbooks with realistic page-turning animations.

## Features

- **PDF to Flipbook**: Upload any PDF and instantly create interactive flipbooks
- **Page Flip Animation**: Realistic 3D page-turning effects with smooth physics
- **HD Quality**: Up to 5x zoom with crystal-clear rendering
- **Fast Loading**: Progressive page loading for instant viewing
- **Full Customization**: Brand colors, logos, backgrounds, and more
- **Analytics**: Track views, engagement, and reader behavior
- **Embed Anywhere**: One-click embed codes for any website
- **Mobile Responsive**: Touch-friendly with swipe navigation
- **Share & QR**: Share links, social sharing, and QR code generation

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no build step required)
- **Backend**: Python FastAPI + SQLite
- **Flipbook Engine**: StPageFlip-based custom engine
- **Deployment**: Cloudflare Pages (frontend) + FastAPI (backend)

## Project Structure

```
flipbook-pro/
├── index.html          # Marketing landing page
├── app.html            # Dashboard SPA
├── viewer.html         # Embeddable flipbook viewer
├── style.css           # Landing page styles
├── app.css             # Dashboard styles
├── viewer.css          # Viewer styles
├── base.css            # Design tokens
├── share-enhancements.css
├── js/
│   ├── app.js          # Dashboard application
│   ├── viewer-app.js   # Viewer application
│   ├── page-flip-engine.js  # Flipbook engine
│   ├── api-client.js   # API client
│   ├── analytics.js    # Analytics tracking
│   ├── pdf-processor.js # PDF processing
│   └── utils.js        # Utility functions
├── api/
│   ├── server.py       # FastAPI backend
│   └── requirements.txt
└── ARCHITECTURE.md     # Technical documentation
```

## Getting Started

### Frontend (Static)
Simply serve the root directory with any static file server.

### Backend
```bash
cd api
pip install -r requirements.txt
python server.py
```

## License

MIT

---

Created with [Perplexity Computer](https://www.perplexity.ai/computer)
