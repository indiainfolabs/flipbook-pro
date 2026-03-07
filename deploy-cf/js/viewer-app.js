/* global PageFlip */
/**
 * FlipBook Pro — Viewer App
 * Standalone embeddable flipbook viewer
 * =====================================================
 */

'use strict';

/* ──────────────────────────────────────────
   Constants & Config
   ────────────────────────────────────────── */
const API = 'https://flipbook-pro-api.socialholic.workers.dev';

const DEMO_FLIPBOOK = {
  id: 'demo',
  title: 'FlipBook Pro — Demo',
  slug: 'demo',
  pageCount: 6,
  settings: {
    viewMode: 'flip',
    showCover: true,
    rtl: false,
    autoPlay: false,
    showPageNumbers: true,
    showThumbnails: true,
    showDownload: false,
    showFullscreen: true,
    showShare: true,
    showZoom: true,
    backgroundColor: '#ffffff',
    flipSound: false,
    flippingTime: 700,
    showPageCorners: true,
    branding: { primaryColor: '#4f7ef7', showBranding: true }
  },
  pages: Array.from({ length: 6 }, (_, i) => ({
    pageNumber: i + 1,
    imageUrl: null,
    thumbUrl: null,
    width: 794,
    height: 1123
  }))
};

const DEMO_COLORS = [
  ['#1e3a5f', '#4f7ef7'],
  ['#2d1b4e', '#a855f7'],
  ['#1a3a2a', '#22c55e'],
  ['#3a1a1a', '#ef4444'],
  ['#2e2a1a', '#f59e0b'],
  ['#1a2a3a', '#06b6d4']
];

const DEMO_LABELS = [
  'Cover', 'Introduction', 'Chapter 1', 'Chapter 2', 'Gallery', 'Back Cover'
];

/* ──────────────────────────────────────────
   LRU Image Cache (Agent 3)
   ────────────────────────────────────────── */
class LRUImageCache {
  constructor(maxSize = 20) {
    this._max = maxSize;
    this._map = new Map();
  }
  has(key) { return this._map.has(key); }
  get(key) {
    if (!this._map.has(key)) return undefined;
    const val = this._map.get(key);
    // Move to end (most recent)
    this._map.delete(key);
    this._map.set(key, val);
    return val;
  }
  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    if (this._map.size > this._max) {
      const oldest = this._map.keys().next().value;
      const oldVal = this._map.get(oldest);
      if (oldVal && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(oldVal); } catch (_e) { /* ignore */ }
      }
      this._map.delete(oldest);
    }
  }
  delete(key) { this._map.delete(key); }
  clear() {
    this._map.forEach(val => {
      if (val && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(val); } catch (_e) { /* ignore */ }
      }
    });
    this._map.clear();
  }
}

/* ──────────────────────────────────────────
   Simple QR Code Generator (no deps)
   ────────────────────────────────────────── */
class SimpleQR {
  static generate(canvas, text, size = 140) {
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    const cellSize = Math.floor(size / 21);
    const offset = Math.floor((size - cellSize * 21) / 2);

    const seed = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = (i) => ((seed * 1664525 + i * 1013904223) >>> 0) % 100;

    ctx.fillStyle = '#000';

    for (let row = 0; row < 21; row++) {
      for (let col = 0; col < 21; col++) {
        let filled = false;

        if (
          (row < 7 && col < 7) ||
          (row < 7 && col > 13) ||
          (row > 13 && col < 7)
        ) {
          if (row < 7 && col < 7) {
            filled = (row === 0 || row === 6 || col === 0 || col === 6) ||
              (row >= 2 && row <= 4 && col >= 2 && col <= 4);
          } else if (row < 7 && col > 13) {
            const r = row; const c = col - 14;
            filled = (r === 0 || r === 6 || c === 0 || c === 6) ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else if (row > 13 && col < 7) {
            const r = row - 14; const c = col;
            filled = (r === 0 || r === 6 || c === 0 || c === 6) ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          }
        } else {
          filled = rng(row * 21 + col) < 50;
        }

        if (filled) {
          ctx.fillRect(
            offset + col * cellSize,
            offset + row * cellSize,
            cellSize - 1,
            cellSize - 1
          );
        }
      }
    }
  }
}

/* ──────────────────────────────────────────
   SVG Icon Library
   ────────────────────────────────────────── */
const ICONS = {
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  compress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="0.5"/><line x1="22" y1="14" x2="22" y2="14.01"/><line x1="22" y1="18" x2="22" y2="22"/><line x1="18" y1="22" x2="18" y2="22.01"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  zoomReset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M8 11h6"/><path d="M11 8v6"/><line x1="6" y1="6" x2="8.5" y2="8.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
};

/* ──────────────────────────────────────────
   Main FlipbookViewer Class
   ────────────────────────────────────────── */
class FlipbookViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;

    // State
    this.flipbook = null;
    this.pages = [];
    this.currentPage = 1;
    this.totalPages = 0;
    this.isFullscreen = false;
    this.thumbnailsOpen = false;
    this.shareModalOpen = false;
    this.toolbarTimeout = null;
    this.toolbarVisible = true;
    this.pageFlipEngine = null;
    this._pageFlipNative = false;
    this.isTwoPage = false;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragOffset = { x: 0, y: 0 };
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.preloadQueue = new Set();
    this.loadedImages = new Set();

    // Zoom – 5 discrete levels (Fit, 150%, 200%, 300%, 500%)
    this.ZOOM_LEVELS = [
      { scale: 1,   label: 'Fit',  css: 'zoom-100' },
      { scale: 1.5, label: '150%', css: 'zoom-150' },
      { scale: 2,   label: '200%', css: 'zoom-200' },
      { scale: 3,   label: '300%', css: 'zoom-300' },
      { scale: 5,   label: '500%', css: 'zoom-500' },
    ];
    this.zoomLevel = 0;          // index into ZOOM_LEVELS
    this.panOffset = { x: 0, y: 0 };
    this._pinchStartDist = 0;
    this._pinchStartZoom = 0;
    this._wheelZoomHandler = null;
    this._pinchHandlers = null;
    this._pageObserver = null;

    // LRU image cache (Agent 3)
    this._imageCache = new LRUImageCache(20);

    // Auto-play state
    this.autoPlaying = false;
    this.autoPlayTimer = null;
    this.autoPlayInterval = 3000;

    // Flip sound
    this._audioCtx = null;
    this._flipSoundBuffer = null;

    // Analytics
    this.visitorId = this._getVisitorId();
    this.slug = null;
    this.flipbookId = null;

    // Elements
    this.container = document.getElementById(containerId);
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBar = document.getElementById('loading-bar');
    this.loadingText = document.getElementById('loading-text');
    this.viewerStage = document.getElementById('viewer-stage');
    this.flipbookContainer = document.getElementById('flipbook-container');
    this.flipbookInner = document.getElementById('flipbook-inner');
    this.toolbar = document.getElementById('viewer-toolbar');
    this.thumbPanel = document.getElementById('thumbnail-panel');
    this.shareModal = document.getElementById('share-modal');
    this.errorScreen = document.getElementById('error-screen');

    // Active share tab
    this._activeShareTab = 'link';
    // Embed dimensions
    this._embedWidth = 800;
    this._embedHeight = 600;

    this._bindMethods();
  }

  _bindMethods() {
    this._onKeydown = this._onKeydown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onFullscreenChange = this._onFullscreenChange.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
  }

  _getVisitorId() {
    if (window.__fpv_visitor) return window.__fpv_visitor;
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.__fpv_visitor = id;
    return id;
  }

  /* ── Initialization ── */
  async init() {
    performance.mark && performance.mark('viewer-init');
    const slug = this._getSlug();
    this._attachGlobalListeners();
    this._createAriaLiveRegion();
    this._setupLoadingEnhancements();

    if (!slug || slug === 'demo') {
      this.setLoadingProgress(10, 'Loading demo flipbook...');
      await this._delay(300);
      this.setLoadingProgress(60, 'Rendering pages...');
      await this._delay(200);
      await this.loadDemoFlipbook();
    } else {
      await this.loadFlipbook(slug);
    }
  }

  /* ── Loading Screen Enhancements (Agent 3) ── */
  _setupLoadingEnhancements() {
    // Show encouraging message after 3 seconds of loading
    this._loadingEncourageTimeout = setTimeout(() => {
      const el = document.getElementById('loading-encourage');
      if (el) {
        const messages = [
          'Almost there\u2026',
          'Preparing your flipbook\u2026',
          'Loading high-quality pages\u2026',
          'Just a moment\u2026',
          'Getting everything ready\u2026'
        ];
        el.textContent = messages[Math.floor(Math.random() * messages.length)];
        el.classList.add('visible');
      }
    }, 3000);
  }

  _clearLoadingEnhancements() {
    if (this._loadingEncourageTimeout) {
      clearTimeout(this._loadingEncourageTimeout);
      this._loadingEncourageTimeout = null;
    }
  }

  _updateLoadingMeta(title, pageCount) {
    const titleEl = document.getElementById('loading-title');
    const countEl = document.getElementById('loading-page-count');
    if (titleEl && title) titleEl.textContent = title;
    if (countEl && pageCount) countEl.textContent = `${pageCount} pages`;
  }

  _getSlug() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id') || params.get('slug');
    const hashSlug = window.location.hash.slice(1);
    return idParam || hashSlug || 'demo';
  }

  setLoadingProgress(pct, text) {
    if (this.loadingBar) {
      this.loadingBar.style.width = pct + '%';
    }
    if (this.loadingText && text) {
      this.loadingText.textContent = text;
    }
  }

  /* ── Aria Live Region for screen readers ── */
  _createAriaLiveRegion() {
    if (document.getElementById('aria-live-region')) return;
    const region = document.createElement('div');
    region.id = 'aria-live-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }

  _announceToScreenReader(message) {
    const region = document.getElementById('aria-live-region');
    if (region) {
      region.textContent = '';
      requestAnimationFrame(() => { region.textContent = message; });
    }
  }

  /* ── SessionStorage cache helpers (Agent 3) ── */
  _getCachedMeta(slug) {
    try {
      const raw = sessionStorage.getItem(`fpv_meta_${slug}`);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      // 30-minute TTL
      if (Date.now() - cached._ts > 30 * 60 * 1000) {
        sessionStorage.removeItem(`fpv_meta_${slug}`);
        return null;
      }
      return cached;
    } catch (_e) { return null; }
  }

  _setCachedMeta(slug, data) {
    try {
      const toStore = {
        title: data.title,
        pageCount: data.pageCount || data.page_count,
        pages: (data.pages || []).map(p => ({
          imageUrl: p.imageUrl || p.image_url,
          thumbUrl: p.thumbUrl || p.thumb_url,
          pageNumber: p.pageNumber || p.page_number,
          width: p.width,
          height: p.height,
        })),
        settings: data.settings,
        id: data.id,
        slug: data.slug,
        _ts: Date.now()
      };
      sessionStorage.setItem(`fpv_meta_${slug}`, JSON.stringify(toStore));
    } catch (_e) { /* sessionStorage full or unavailable */ }
  }

  /* ── Load from API ── */
  async loadFlipbook(slug) {
    this.slug = slug;
    performance.mark && performance.mark('load-flipbook');
    this.setLoadingProgress(10, 'Connecting...');

    // Offline detection (Agent 3)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.showError('You appear to be offline. Please check your connection and try again.');
      return;
    }

    try {
      // Check sessionStorage cache first (Agent 3)
      let data = this._getCachedMeta(slug);
      if (data) {
        this.setLoadingProgress(30, 'Loading from cache...');
      } else {
        const res = await fetch(`${API}/api/viewer/${encodeURIComponent(slug)}`, {
          headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
          if (res.status === 404) throw new Error('Flipbook not found.');
          if (res.status === 403) throw new Error('This flipbook is private.');
          throw new Error(`Server error: ${res.status}`);
        }

        data = await res.json();
        data = data.flipbook || data;
        this._setCachedMeta(slug, data);
      }

      this.setLoadingProgress(40, 'Loading pages...');

      this.flipbook = data;
      this.flipbookId = this.flipbook.id;
      this.pages = this.flipbook.pages || [];
      this.pages = this.pages.map(p => ({
        ...p,
        imageUrl: p.imageUrl || p.image_url || null,
        thumbUrl: p.thumbUrl || p.thumb_url || null,
        pageNumber: p.pageNumber || p.page_number || 0,
        width: p.width || 794,
        height: p.height || 1123,
      }));
      this.totalPages = this.flipbook.pageCount || this.flipbook.page_count || this.pages.length;
      this.slug = this.flipbook.slug || slug;

      // Update loading screen meta (Agent 3)
      this._updateLoadingMeta(this.flipbook.title, this.totalPages);

      this.setLoadingProgress(70, 'Preloading images...');
      performance.mark && performance.mark('preload-critical');
      await this._preloadInitialPages();
      this.setLoadingProgress(100, 'Ready!');
      await this._delay(200);

      this.initEngine(this.pages, this.flipbook.settings || {});
      this.trackEvent('view', {});

    } catch (err) {
      console.error('[FlipbookViewer] Load error:', err);
      if (err.message && err.message.includes('not found')) {
        this._showErrorWithAction(err.message, 'home');
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this._showErrorWithAction('Connection issue. Please check your network and try again.', 'retry');
      } else {
        this.showError(err.message || 'Failed to load flipbook.');
      }
    }
  }

  async loadDemoFlipbook() {
    this.flipbook = DEMO_FLIPBOOK;
    this.flipbookId = 'demo';
    this.slug = 'demo';
    this.pages = DEMO_FLIPBOOK.pages;
    this.pages = this.pages.map(p => ({
      ...p,
      imageUrl: p.imageUrl || p.image_url || null,
      thumbUrl: p.thumbUrl || p.thumb_url || null,
      pageNumber: p.pageNumber || p.page_number || 0,
      width: p.width || 794,
      height: p.height || 1123,
    }));
    this.totalPages = DEMO_FLIPBOOK.pageCount;
    this.setLoadingProgress(100, 'Ready!');
    await this._delay(200);
    this.initEngine(this.pages, DEMO_FLIPBOOK.settings);
  }

  async _preloadInitialPages() {
    const toLoad = this.pages.slice(0, Math.min(4, this.pages.length));
    let loaded = 0;
    const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const promises = toLoad.map(p => new Promise(resolve => {
      if (!p.imageUrl) { resolve(); return; }
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        this.setLoadingProgress(70 + (loaded / toLoad.length) * 25, null);
        resolve();
      };
      img.src = p.imageUrl;
      this.loadedImages.add(p.pageNumber);
    }));
    // Race against a 8-second timeout so the viewer never gets stuck on loading
    await Promise.race([
      Promise.all(promises),
      timeout(8000)
    ]);
  }

  /* ── Engine Init ── */
  initEngine(pages, settings) {
    performance.mark && performance.mark('engine-init');
    this.settings = settings;
    this.isTwoPage = !this._isMobile() && window.innerWidth > 768;

    if (typeof PageFlip !== 'undefined') {
      this._initPageFlipEngine(pages, settings);
    } else {
      this._initCSSFlipEngine(pages, settings);
    }

    this._initTheme();
    this.createToolbar();
    this._createBottomBar();
    this.createThumbnailPanel();
    this.createShareModal();
    this.handleKeyboard();
    this._hideLoading();
    this._clearLoadingEnhancements();
    this._scheduleToolbarHide();
    this._setupTouchEvents();
    this._setupResizeObserver();
    this._setupPageScrubber();
    this._setupDoubleClick();
    this._setupWheelZoom();
    this._setupPinchZoom();
    this._setupPageIntersectionObserver();

    this._initFlipSound();
    this._showInitialFlipHint();
    this._onPageChanged(1);
    this._initBackground();

    // Background preload remaining pages (Agent 3: progressive loading)
    this._backgroundPreloadRemaining();
  }

  /* ── Theme Toggle (Improvement 3) ── */
  _initTheme() {
    const saved = localStorage.getItem('fpv_theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    this._currentTheme = saved;
  }

  toggleTheme() {
    const next = this._currentTheme === 'dark' ? 'light' : 'dark';
    this._currentTheme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem('fpv_theme', next);
    // Update theme button icon
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = next === 'dark' ? ICONS.moon : ICONS.sun;
  }

  /* ── Background Options (Improvement 2) ── */
  _initBackground() {
    const slug = this.slug || 'default';
    const saved = localStorage.getItem(`fpv_bg_${slug}`) || 'blurred';
    this._currentBg = saved;

    // Always set the blurred background image from first page
    if (this.pages[0] && this.pages[0].imageUrl) {
      this._setBlurredBackground(this.pages[0].imageUrl);
    }

    this._applyBackground(saved);
  }

  _applyBackground(bgValue) {
    this._currentBg = bgValue;
    const stage = this.viewerStage;
    if (!stage) return;

    if (bgValue === 'blurred') {
      stage.classList.add('has-bg-image');
      stage.dataset.bgMode = 'blurred';
      stage.style.background = '';
    } else {
      stage.classList.remove('has-bg-image');
      stage.dataset.bgMode = 'solid';
      stage.style.background = bgValue;
    }
  }

  _setBlurredBackground(imageUrl) {
    // Apply blurred background directly on #viewer-stage via custom property
    // This avoids z-index / stacking context issues with child elements
    const stage = this.viewerStage;
    if (!stage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      stage.style.setProperty('--bg-image-url', `url("${imageUrl}")`);
      stage.classList.add('has-bg-image');
    };
    img.onerror = () => {
      // Still try setting — the image may work despite CORS error on preload
      stage.style.setProperty('--bg-image-url', `url("${imageUrl}")`);
      stage.classList.add('has-bg-image');
    };
    img.src = imageUrl;
    // Also set immediately in case image is already cached
    stage.style.setProperty('--bg-image-url', `url("${imageUrl}")`);
    stage.classList.add('has-bg-image');
  }

  _openBgPicker() {
    // Close any existing picker
    const existing = document.getElementById('bg-picker-popover');
    if (existing) { existing.remove(); return; }

    const btn = document.getElementById('btn-palette');
    if (!btn) return;

    const slug = this.slug || 'default';
    const popover = document.createElement('div');
    popover.id = 'bg-picker-popover';
    popover.className = 'bg-picker-popover';
    popover.innerHTML = `
      <div class="bg-picker-title">Background</div>
      <div class="bg-picker-section">
        <div class="bg-picker-label">Blurred Page (Default)</div>
        <div class="bg-picker-options">
          <button class="bg-opt${this._currentBg === 'blurred' ? ' active' : ''}" data-bg="blurred">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#1a1a2e,#16213e);position:relative;overflow:hidden;">
              <span style="position:absolute;inset:0;backdrop-filter:blur(4px);background:rgba(0,0,0,0.4);"></span>
            </span>
            <span class="bg-opt-label">Blurred</span>
          </button>
        </div>
      </div>
      <div class="bg-picker-section">
        <div class="bg-picker-label">Solid Colors</div>
        <div class="bg-picker-options">
          <button class="bg-opt${this._currentBg === '#0a0a14' ? ' active' : ''}" data-bg="#0a0a14">
            <span class="bg-opt-preview" style="background:#0a0a14"></span>
            <span class="bg-opt-label">Dark</span>
          </button>
          <button class="bg-opt${this._currentBg === '#0d1117' ? ' active' : ''}" data-bg="#0d1117">
            <span class="bg-opt-preview" style="background:#0d1117"></span>
            <span class="bg-opt-label">Midnight</span>
          </button>
          <button class="bg-opt${this._currentBg === '#1c1c1c' ? ' active' : ''}" data-bg="#1c1c1c">
            <span class="bg-opt-preview" style="background:#1c1c1c"></span>
            <span class="bg-opt-label">Charcoal</span>
          </button>
          <button class="bg-opt${this._currentBg === '#f5f5f0' ? ' active' : ''}" data-bg="#f5f5f0">
            <span class="bg-opt-preview" style="background:#f5f5f0;border:1px solid #ccc"></span>
            <span class="bg-opt-label">Light</span>
          </button>
        </div>
      </div>
      <div class="bg-picker-section">
        <div class="bg-picker-label">Gradients</div>
        <div class="bg-picker-options">
          <button class="bg-opt" data-bg="linear-gradient(135deg,#0a0a2e,#1a1040)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#0a0a2e,#1a1040)"></span>
            <span class="bg-opt-label">Indigo</span>
          </button>
          <button class="bg-opt" data-bg="linear-gradient(135deg,#1a0a2e,#2d1b4e)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#1a0a2e,#2d1b4e)"></span>
            <span class="bg-opt-label">Purple</span>
          </button>
          <button class="bg-opt" data-bg="linear-gradient(135deg,#0a1a2e,#0d2d40)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#0a1a2e,#0d2d40)"></span>
            <span class="bg-opt-label">Ocean</span>
          </button>
          <button class="bg-opt" data-bg="linear-gradient(135deg,#1a2a0a,#1a3a1a)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#1a2a0a,#1a3a1a)"></span>
            <span class="bg-opt-label">Forest</span>
          </button>
          <button class="bg-opt" data-bg="linear-gradient(135deg,#2a0a0a,#3a1010)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#2a0a0a,#3a1010)"></span>
            <span class="bg-opt-label">Crimson</span>
          </button>
          <button class="bg-opt" data-bg="linear-gradient(135deg,#1a1a1a,#2a2a3a)">
            <span class="bg-opt-preview" style="background:linear-gradient(135deg,#1a1a1a,#2a2a3a)"></span>
            <span class="bg-opt-label">Slate</span>
          </button>
        </div>
      </div>
    `;

    // Position popover above palette button (since toolbar is at top, popover goes below;
    // but if button is near bottom, open above it)
    const rect = btn.getBoundingClientRect();
    popover.style.position = 'fixed';
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow > 320 || spaceBelow > spaceAbove) {
      // Open below
      popover.style.top = (rect.bottom + 8) + 'px';
      popover.style.bottom = 'auto';
    } else {
      // Open above
      popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      popover.style.top = 'auto';
    }
    popover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 260)) + 'px';

    // Wire up options
    popover.querySelectorAll('.bg-opt').forEach(optBtn => {
      optBtn.addEventListener('click', () => {
        const bgVal = optBtn.dataset.bg;
        this._applyBackground(bgVal);
        localStorage.setItem(`fpv_bg_${slug}`, bgVal);
        popover.remove();
      });
    });

    document.body.appendChild(popover);

    // Close on outside click
    setTimeout(() => {
      const closeOnOutside = (e) => {
        if (!popover.contains(e.target) && e.target !== btn) {
          popover.remove();
          document.removeEventListener('click', closeOnOutside);
        }
      };
      document.addEventListener('click', closeOnOutside);
    }, 0);
  }

  /* ── Bottom Bar (Improvement 4D) ── */
  _createBottomBar() {
    // Remove existing scrubber from its position in viewer-stage
    // and integrate into the new bottom bar
    let bar = document.getElementById('viewer-bottom-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'viewer-bottom-bar';
      document.getElementById('viewer-root').appendChild(bar);
    }

    bar.innerHTML = `
      <span class="bottom-bar-page-info" id="bottom-bar-page-info">1 / ${this.totalPages}</span>
      <div class="bottom-bar-scrubber">
        <input type="range" class="page-scrubber-input" id="page-scrubber-input"
          min="1" max="${this.totalPages}" value="1" step="1"
          aria-label="Scrub through pages" />
      </div>
      <button class="tb-btn bottom-bar-fs" id="btn-fullscreen-bottom"
        aria-label="Toggle fullscreen" title="Fullscreen (F)">
        ${ICONS.fullscreen}
      </button>
    `;

    const fsBtn = document.getElementById('btn-fullscreen-bottom');
    if (fsBtn) fsBtn.addEventListener('click', () => this.toggleFullscreen());

    // Hide old scrubber panel (now integrated into bottom bar)
    const oldScrubber = document.getElementById('page-scrubber');
    if (oldScrubber) oldScrubber.style.display = 'none';
  }

  _updateBottomBar() {
    const info = document.getElementById('bottom-bar-page-info');
    if (!info) return;
    // Show page spread format: "X-Y / Z" for two-page, "X / Z" for single
    if (this.isTwoPage && this.totalPages > 1) {
      const left = this.currentPage % 2 === 0 ? this.currentPage - 1 : this.currentPage;
      const right = Math.min(left + 1, this.totalPages);
      if (right > left) {
        info.textContent = `${left}-${right} / ${this.totalPages}`;
      } else {
        info.textContent = `${left} / ${this.totalPages}`;
      }
    } else {
      info.textContent = `${this.currentPage} / ${this.totalPages}`;
    }

    const fsBtn = document.getElementById('btn-fullscreen-bottom');
    if (fsBtn) {
      fsBtn.innerHTML = this.isFullscreen ? ICONS.compress : ICONS.fullscreen;
    }
  }

  /* ── Progressive Background Loading (Agent 3) ── */
  _backgroundPreloadRemaining() {
    // After engine init, preload pages 5+ via requestIdleCallback
    const startFrom = 5;
    if (startFrom > this.totalPages) return;

    const loadNext = (idx) => {
      if (idx > this.totalPages) return;
      const pd = this.pages[idx - 1];
      if (pd && pd.imageUrl && !this.loadedImages.has(idx)) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => this.loadedImages.add(idx);
        img.src = pd.imageUrl;
      }
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => loadNext(idx + 1), { timeout: 2000 });
      } else {
        setTimeout(() => loadNext(idx + 1), 100);
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => loadNext(startFrom), { timeout: 3000 });
    } else {
      setTimeout(() => loadNext(startFrom), 1000);
    }
  }

  /* ── CSS Flip Engine (primary / fallback) ── */
  _initCSSFlipEngine(pages, _settings) {
    const flipEl = this.flipbookInner;
    if (!flipEl) return;

    const aspectRatio = pages[0]
      ? (pages[0].width || 794) / (pages[0].height || 1123)
      : 794 / 1123;

    // Minimal chrome: bottom bar (~44px) + small padding (14px)
    const chromeH = 44 + 14;
    const viewH = window.innerHeight - chromeH;
    const viewW = window.innerWidth - 40;
    let pageH = viewH;
    let pageW = Math.round(pageH * aspectRatio);
    // Constrain by width if book is too wide
    const maxPageW = this.isTwoPage ? viewW / 2 : viewW;
    if (pageW > maxPageW) {
      pageW = maxPageW;
      pageH = Math.round(pageW / aspectRatio);
    }

    const bookW = this.isTwoPage ? pageW * 2 : pageW;

    flipEl.style.width = bookW + 'px';
    flipEl.style.height = pageH + 'px';
    flipEl.style.position = 'relative';
    flipEl.style.perspective = '2000px';
    flipEl.innerHTML = '';

    this._bookW = bookW;
    this._bookH = pageH;
    this._pageW = pageW;
    this._pageH = pageH;
    this._aspectRatio = aspectRatio;

    this._renderBookSpread(1);
    this._addTapZones(flipEl);
  }

  _renderBookSpread(page) {
    const flipEl = this.flipbookInner;
    if (!flipEl) return;

    const bgColor = (this.settings && this.settings.backgroundColor) || '#ffffff';
    flipEl.innerHTML = '';

    if (this.isTwoPage) {
      const leftPage = page % 2 === 0 ? page - 1 : page;
      const rightPage = leftPage + 1;

      const leftEl = this._createPageElement(leftPage, 'left', bgColor);
      const rightEl = this._createPageElement(rightPage, 'right', bgColor);
      const spineEl = document.createElement('div');
      spineEl.className = 'book-spine';

      flipEl.appendChild(leftEl);
      flipEl.appendChild(spineEl);
      flipEl.appendChild(rightEl);
    } else {
      const pageEl = this._createPageElement(page, 'single', bgColor);
      pageEl.style.width = '100%';
      pageEl.style.position = 'relative';
      pageEl.style.left = '0';
      flipEl.appendChild(pageEl);
    }

    if (this.settings && this.settings.showPageCorners !== false) {
      this._addCornerHints(flipEl);
    }

    this._preloadAdjacent(page);
  }

  _createPageElement(pageNum, side, bgColor) {
    const pageData = this.pages[pageNum - 1];
    const el = document.createElement('div');
    el.className = `book-page ${side}`;
    el.dataset.page = pageNum;

    if (side === 'left') {
      el.style.cssText = 'position:absolute;left:0;top:0;width:50%;height:100%;background:' + bgColor;
    } else if (side === 'right') {
      el.style.cssText = 'position:absolute;left:50%;top:0;width:50%;height:100%;background:' + bgColor;
    } else {
      el.style.cssText = 'background:' + bgColor;
    }

    const inner = document.createElement('div');
    inner.className = 'book-page-inner';

    if (pageNum < 1 || pageNum > this.totalPages) {
      inner.style.background = '#f0f0f0';
      el.appendChild(inner);
      return el;
    }

    if (pageData && pageData.imageUrl) {
      // Shimmer placeholder while loading
      const shimmer = document.createElement('div');
      shimmer.className = 'page-shimmer';
      inner.appendChild(shimmer);

      const img = document.createElement('img');
      img.alt = `Page ${pageNum}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      inner.classList.add('img-loading');
      img.onload = () => {
        inner.classList.remove('img-loading');
        if (shimmer.parentNode) shimmer.remove();
      };
      img.onerror = () => {
        this._handleImageError(img, pageNum, inner);
      };
      img.src = pageData.imageUrl;
      inner.appendChild(img);
    } else {
      const placeholder = this._createDemoPage(pageNum);
      inner.appendChild(placeholder);
    }

    el.appendChild(inner);
    return el;
  }

  _createDemoPage(pageNum) {
    const idx = (pageNum - 1) % DEMO_COLORS.length;
    const [bg, accent] = DEMO_COLORS[idx];
    const label = DEMO_LABELS[Math.min(pageNum - 1, DEMO_LABELS.length - 1)];

    const div = document.createElement('div');
    div.style.cssText = `
      width:100%;height:100%;
      background:linear-gradient(160deg,${bg},${bg}dd);
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:16px;padding:32px;
    `;

    const pageLabel = document.createElement('div');
    pageLabel.style.cssText = `
      font-size:11px;font-weight:600;letter-spacing:2px;
      text-transform:uppercase;color:${accent};
      font-family:Inter,system-ui,sans-serif;
      border:1px solid ${accent}44;padding:4px 12px;border-radius:99px;
    `;
    pageLabel.textContent = `Page ${pageNum}`;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size:24px;font-weight:700;color:#fff;
      text-align:center;font-family:Inter,system-ui,sans-serif;
      letter-spacing:-0.5px;
    `;
    title.textContent = label;

    const logo = document.createElement('div');
    logo.style.cssText = `
      margin-top:20px;
      display:flex;align-items:center;gap:8px;
      font-family:Inter,system-ui,sans-serif;
    `;
    logo.innerHTML = `
      <div style="width:28px;height:28px;background:${accent};border-radius:6px;
        display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="5" height="12" rx="1" fill="white" opacity="0.9"/>
          <rect x="9" y="2" width="5" height="12" rx="1" fill="white" opacity="0.6"/>
        </svg>
      </div>
      <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);">FlipBook Pro</span>
    `;

    div.appendChild(pageLabel);
    div.appendChild(title);
    div.appendChild(logo);
    return div;
  }

  _addTapZones(container) {
    const leftZone = document.createElement('div');
    leftZone.className = 'tap-zone tap-zone-left';
    leftZone.setAttribute('role', 'button');
    leftZone.setAttribute('aria-label', 'Previous page');
    leftZone.setAttribute('tabindex', '0');
    leftZone.innerHTML = `<div class="tap-zone-arrow">${ICONS.chevronLeft}</div>`;
    leftZone.addEventListener('click', () => this.prevPage());
    leftZone.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.prevPage(); });

    const rightZone = document.createElement('div');
    rightZone.className = 'tap-zone tap-zone-right';
    rightZone.setAttribute('role', 'button');
    rightZone.setAttribute('aria-label', 'Next page');
    rightZone.setAttribute('tabindex', '0');
    rightZone.innerHTML = `<div class="tap-zone-arrow">${ICONS.chevronRight}</div>`;
    rightZone.addEventListener('click', () => this.nextPage());
    rightZone.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.nextPage(); });

    container.appendChild(leftZone);
    container.appendChild(rightZone);
  }

  _addCornerHints(container) {
    if (this.currentPage > 1) {
      const leftCorner = document.createElement('div');
      leftCorner.className = 'page-corner-hint';
      leftCorner.style.cssText = 'left:0;right:auto;transform:scaleX(-1);position:absolute;bottom:0;z-index:5;';
      container.appendChild(leftCorner);
    }

    if (this.currentPage < this.totalPages) {
      const rightCorner = document.createElement('div');
      rightCorner.className = 'page-corner-hint';
      rightCorner.style.cssText = 'right:0;position:absolute;bottom:0;z-index:5;';
      container.appendChild(rightCorner);
    }
  }

  /* ── Navigation ── */
  goToPage(n) {
    const target = Math.max(1, Math.min(n, this.totalPages));
    if (target === this.currentPage) return;

    if (this._pageFlipNative && this.pageFlipEngine) {
      this.pageFlipEngine.flip(target - 1);
      return;
    }

    const direction = target > this.currentPage ? 'forward' : 'backward';
    this._animateFlip(direction, () => {
      this.currentPage = target;
      this._renderBookSpread(target);
      this._onPageChanged(target);
    });
  }

  nextPage() {
    if (this._pageFlipNative && this.pageFlipEngine) {
      this.pageFlipEngine.flipNext();
      return;
    }
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + (this.isTwoPage ? 2 : 1));
    }
  }

  prevPage() {
    if (this._pageFlipNative && this.pageFlipEngine) {
      this.pageFlipEngine.flipPrev();
      return;
    }
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - (this.isTwoPage ? 2 : 1));
    }
  }

  _animateFlip(direction, callback) {
    const flipEl = this.flipbookInner;
    if (!flipEl) { callback(); return; }

    const flippingTime = (this.settings && this.settings.flippingTime) || 700;

    const page = direction === 'forward'
      ? flipEl.querySelector('.book-page.right, .book-page.single')
      : flipEl.querySelector('.book-page.left, .book-page.single');

    if (page) {
      page.style.transition = `transform ${flippingTime}ms cubic-bezier(0.645,0.045,0.355,1)`;
      page.style.transformOrigin = direction === 'forward' ? 'left center' : 'right center';
      page.style.transform = direction === 'forward'
        ? 'perspective(1200px) rotateY(-120deg)'
        : 'perspective(1200px) rotateY(120deg)';
    }

    setTimeout(() => {
      if (page) {
        page.style.transition = 'none';
        page.style.transform = '';
      }
      callback();
    }, flippingTime * 0.6);
  }

  _onPageChanged(page) {
    this._playFlipSound();
    this.currentPage = page;
    this._updateToolbarState();
    this._updateThumbnails();
    this._updateScrubber();
    this._updateBottomBar();
    this.trackEvent('page_view', { page_number: page });
    this._preloadAdjacent(page);
    // Blurred background: set first page image
    if (page === 1 && this.pages[0] && this.pages[0].imageUrl) {
      this._setBlurredBackground(this.pages[0].imageUrl);
    }
    this._announceToScreenReader(`Page ${page} of ${this.totalPages}`);
  }

  _preloadAdjacent(page) {
    const toPreload = [];
    for (let i = -6; i <= 6; i++) {
      const p = page + i;
      if (p >= 1 && p <= this.totalPages && !this.loadedImages.has(p)) {
        toPreload.push(p);
      }
    }
    toPreload.forEach(p => {
      const pd = this.pages[p - 1];
      if (pd && pd.imageUrl) {
        const img = new Image();
        img.onload = () => this.loadedImages.add(p);
        img.src = pd.imageUrl;
      }
    });
  }

  /* ── Page Scrubber ── */
  _setupPageScrubber() {
    const scrubber = document.getElementById('page-scrubber-input');
    const label = document.getElementById('page-scrubber-label');
    if (!scrubber) return;

    scrubber.max = this.totalPages;
    scrubber.value = this.currentPage;

    scrubber.addEventListener('input', () => {
      const v = parseInt(scrubber.value, 10);
      if (label) label.textContent = `Page ${v} of ${this.totalPages}`;
    });

    scrubber.addEventListener('change', () => {
      const v = parseInt(scrubber.value, 10);
      if (v >= 1 && v <= this.totalPages) {
        this.goToPage(v);
      }
    });

    this._updateScrubber();
  }

  _updateScrubber() {
    const scrubber = document.getElementById('page-scrubber-input');
    const label = document.getElementById('page-scrubber-label');
    if (scrubber) scrubber.value = this.currentPage;
    if (label) label.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
  }

  /* ── Double-click fullscreen ── */
  _setupDoubleClick() {
    if (this.viewerStage) {
      this.viewerStage.addEventListener('dblclick', this._onDblClick);
    }
  }

  _onDblClick(e) {
    // Don't trigger on toolbar, modals, etc.
    if (e.target.closest('#viewer-toolbar') ||
        e.target.closest('#thumbnail-panel') ||
        e.target.closest('.modal-backdrop') ||
        e.target.closest('#shortcuts-overlay')) return;
    this.toggleFullscreen();
  }

  /* ── Toolbar ── */
  createToolbar() {
    const tb = this.toolbar;
    if (!tb) return;

    const s = this.settings || {};

    tb.innerHTML = `
      <div class="toolbar-group">
        <button class="tb-btn tb-btn-nav" id="btn-prev" aria-label="Previous page" title="Previous page (←)">
          ${ICONS.chevronLeft}
        </button>
      </div>

      <div class="toolbar-group">
        <div class="page-input-wrap">
          <input class="page-input" type="number" id="page-input"
            value="1" min="1" max="${this.totalPages}"
            aria-label="Go to page number" />
          <span class="page-sep" aria-hidden="true">/</span>
          <span class="page-total" aria-hidden="true">${this.totalPages}</span>
        </div>
      </div>

      <div class="toolbar-group">
        <button class="tb-btn tb-btn-nav" id="btn-next" aria-label="Next page" title="Next page (→)">
          ${ICONS.chevronRight}
        </button>
      </div>

      <div class="tb-divider" aria-hidden="true"></div>

      ${s.showThumbnails !== false ? `
      <div class="toolbar-group">
        <button class="tb-btn" id="btn-thumbs" data-hide-mobile
          aria-label="Toggle thumbnail panel" title="Thumbnails (T)">
          ${ICONS.grid}
        </button>
      </div>` : ''}

      ${s.showZoom !== false ? `
      <div class="zoom-controls" data-hide-small>
        <button class="tb-btn" id="btn-zoom-out"
          aria-label="Zoom out" title="Zoom out (-)">
          ${ICONS.zoomOut}
        </button>
        <span class="zoom-indicator hidden" id="zoom-pct">Fit</span>
        <button class="tb-btn" id="btn-zoom-in"
          aria-label="Zoom in" title="Zoom in (+)">
          ${ICONS.zoomIn}
        </button>
        <button class="tb-btn zoom-reset" id="btn-zoom-reset"
          aria-label="Reset zoom" title="Reset zoom (Ctrl+0)" style="display:none">
          ${ICONS.zoomReset}
        </button>
      </div>` : ''}

      <div class="tb-divider" aria-hidden="true"></div>

      <div class="toolbar-group">
        <button class="tb-btn" id="btn-autoplay"
          aria-label="Toggle auto-play" title="Auto-play (P)">
          ${ICONS.play}
        </button>

        ${s.showFullscreen !== false ? `
        <button class="tb-btn" id="btn-fullscreen"
          aria-label="Toggle fullscreen" title="Fullscreen (F)">
          ${ICONS.fullscreen}
        </button>` : ''}

        ${s.showShare !== false ? `
        <button class="tb-btn" id="btn-share"
          aria-label="Share flipbook" title="Share">
          ${ICONS.share}
        </button>` : ''}

        ${s.showDownload ? `
        <button class="tb-btn" id="btn-download" data-hide-mobile
          aria-label="Download flipbook" title="Download">
          ${ICONS.download}
        </button>` : ''}

        <button class="tb-btn" id="btn-help" data-hide-mobile
          aria-label="Keyboard shortcuts" title="Shortcuts (?)">
          ${ICONS.help}
        </button>

        <div class="tb-divider" aria-hidden="true"></div>

        <button class="tb-btn" id="btn-palette"
          aria-label="Background options" title="Background">
          ${ICONS.palette}
        </button>

        <button class="tb-btn" id="btn-theme"
          aria-label="Toggle light/dark theme" title="Toggle theme">
          ${this._currentTheme === 'dark' ? ICONS.moon : ICONS.sun}
        </button>
      </div>
    `;

    this._wireToolbarEvents();
    this._updateToolbarState();
  }

  _wireToolbarEvents() {
    const get = (id) => document.getElementById(id);

    const prev = get('btn-prev');
    const next = get('btn-next');
    const input = get('page-input');
    const thumbs = get('btn-thumbs');
    const zoomIn = get('btn-zoom-in');
    const zoomOut = get('btn-zoom-out');
    const zoomReset = get('btn-zoom-reset');
    const fs = get('btn-fullscreen');
    const share = get('btn-share');
    const dl = get('btn-download');
    const autoplay = get('btn-autoplay');
    const help = get('btn-help');

    prev && prev.addEventListener('click', () => this.prevPage());
    next && next.addEventListener('click', () => this.nextPage());

    if (input) {
      input.addEventListener('change', () => {
        const v = parseInt(input.value, 10);
        if (v >= 1 && v <= this.totalPages) this.goToPage(v);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        e.stopPropagation();
      });
      input.addEventListener('focus', () => this._clearToolbarHideTimer());
      input.addEventListener('blur', () => this._scheduleToolbarHide());
    }

    thumbs && thumbs.addEventListener('click', () => this.toggleThumbnails());
    zoomIn && zoomIn.addEventListener('click', () => this.zoomIn());
    zoomOut && zoomOut.addEventListener('click', () => this.zoomOut());
    zoomReset && zoomReset.addEventListener('click', () => this.zoomReset());
    fs && fs.addEventListener('click', () => this.toggleFullscreen());
    share && share.addEventListener('click', () => this.openShareModal());
    dl && dl.addEventListener('click', () => this._handleDownload());
    autoplay && autoplay.addEventListener('click', () => this.toggleAutoPlay());
    help && help.addEventListener('click', () => this._toggleShortcutsOverlay());

    const palette = get('btn-palette');
    const theme = get('btn-theme');
    palette && palette.addEventListener('click', () => this._openBgPicker());
    theme && theme.addEventListener('click', () => this.toggleTheme());
  }

  _updateToolbarState() {
    const input = document.getElementById('page-input');
    const prev = document.getElementById('btn-prev');
    const next = document.getElementById('btn-next');

    if (input) input.value = this.currentPage;

    if (prev) {
      prev.disabled = this.currentPage <= 1;
      prev.setAttribute('aria-disabled', this.currentPage <= 1 ? 'true' : 'false');
    }
    if (next) {
      next.disabled = this.currentPage >= this.totalPages;
      next.setAttribute('aria-disabled', this.currentPage >= this.totalPages ? 'true' : 'false');
    }

    const thumbBtn = document.getElementById('btn-thumbs');
    if (thumbBtn) {
      thumbBtn.classList.toggle('active', this.thumbnailsOpen);
      thumbBtn.setAttribute('aria-pressed', this.thumbnailsOpen ? 'true' : 'false');
    }

    // Update zoom indicator
    this._updateZoomIndicator();

    // Manage scrubber visibility with toolbar
    if (this.viewerStage) {
      this.viewerStage.classList.toggle('scrubber-visible', this.toolbarVisible);
    }
  }

  /* ── Thumbnail Panel ── */
  createThumbnailPanel() {
    const panel = this.thumbPanel;
    if (!panel) return;

    const inner = document.createElement('div');
    inner.className = 'thumb-panel-inner';
    inner.id = 'thumb-inner';
    inner.setAttribute('role', 'listbox');
    inner.setAttribute('aria-label', 'Page thumbnails');

    for (let i = 1; i <= this.totalPages; i++) {
      const pageData = this.pages[i - 1];
      const item = document.createElement('div');
      item.className = 'thumb-item' + (i === this.currentPage ? ' active' : '');
      item.dataset.page = i;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', i === this.currentPage ? 'true' : 'false');
      item.setAttribute('aria-label', `Page ${i}`);
      item.setAttribute('tabindex', '0');

      const wrap = document.createElement('div');
      wrap.className = 'thumb-img-wrap';

      if (pageData && pageData.imageUrl) {
        const img = document.createElement('img');
        img.src = pageData.thumbUrl || pageData.imageUrl;
        img.alt = `Page ${i} thumbnail`;
        img.loading = 'lazy';
        wrap.appendChild(img);
      } else {
        const idx = (i - 1) % DEMO_COLORS.length;
        const [bg, accent] = DEMO_COLORS[idx];
        const ph = document.createElement('div');
        ph.className = 'thumb-placeholder';
        ph.style.background = `linear-gradient(135deg,${bg},${bg}cc)`;
        ph.style.color = accent;
        ph.textContent = i;
        wrap.appendChild(ph);
      }

      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = i;
      label.setAttribute('aria-hidden', 'true');

      item.appendChild(wrap);
      item.appendChild(label);

      const goToPageI = () => {
        this.goToPage(i);
        if (window.innerWidth <= 768) this.toggleThumbnails();
      };
      item.addEventListener('click', goToPageI);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToPageI(); }
      });

      inner.appendChild(item);
    }

    panel.innerHTML = '';
    panel.appendChild(inner);
  }

  _updateThumbnails() {
    const items = document.querySelectorAll('.thumb-item');
    items.forEach(item => {
      const p = parseInt(item.dataset.page, 10);
      const isActive = p === this.currentPage;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Scroll active thumbnail into view
    const active = document.querySelector('.thumb-item.active');
    const inner = document.getElementById('thumb-inner');
    if (active && inner) {
      if (window.innerWidth <= 768) {
        // Horizontal scroll on mobile
        const itemLeft = active.offsetLeft;
        const innerW = inner.clientWidth;
        inner.scrollTo({ left: itemLeft - innerW / 2 + 36, behavior: 'smooth' });
      } else {
        // Vertical scroll on desktop
        const itemTop = active.offsetTop;
        const innerH = inner.clientHeight;
        inner.scrollTo({ top: itemTop - innerH / 2 + 40, behavior: 'smooth' });
      }
    }
  }

  toggleThumbnails() {
    this.thumbnailsOpen = !this.thumbnailsOpen;
    this.thumbPanel && this.thumbPanel.classList.toggle('open', this.thumbnailsOpen);
    this.flipbookContainer && this.flipbookContainer.classList.toggle('thumbnails-open', this.thumbnailsOpen);
    const btn = document.getElementById('btn-thumbs');
    if (btn) {
      btn.classList.toggle('active', this.thumbnailsOpen);
      btn.setAttribute('aria-pressed', this.thumbnailsOpen ? 'true' : 'false');
    }

    if (this.thumbnailsOpen) {
      this._updateThumbnails();
      this._clearToolbarHideTimer();
      this._announceToScreenReader('Thumbnail panel opened');
    } else {
      this._scheduleToolbarHide();
      this._announceToScreenReader('Thumbnail panel closed');
    }
  }

  /* ── Share Modal ── */
  createShareModal() {
    const modal = this.shareModal;
    if (!modal) return;

    const viewUrl = window.location.href.split('?')[0] + '?id=' + (this.slug || 'demo');

    modal.innerHTML = `
      <div class="modal-box" id="share-modal-box" role="document">
        <div class="modal-header">
          <h2 class="modal-title">Share Flipbook</h2>
          <button class="modal-close" id="share-close" aria-label="Close share dialog">${ICONS.x}</button>
        </div>

        <div class="share-tabs" role="tablist" aria-label="Share options">
          <button class="share-tab active" role="tab" aria-selected="true" aria-controls="tab-link" id="tab-btn-link">Link</button>
          <button class="share-tab" role="tab" aria-selected="false" aria-controls="tab-embed" id="tab-btn-embed">Embed</button>
          <button class="share-tab" role="tab" aria-selected="false" aria-controls="tab-social" id="tab-btn-social">Social</button>
          <button class="share-tab" role="tab" aria-selected="false" aria-controls="tab-qr" id="tab-btn-qr">QR Code</button>
        </div>

        <!-- Link Tab -->
        <div class="share-tab-content active" id="tab-link" role="tabpanel" aria-labelledby="tab-btn-link">
          <div class="modal-section">
            <div class="modal-section-label">Direct Link</div>
            <div class="copy-field">
              <input type="text" id="share-url" value="${this._escapeHtml(viewUrl)}" readonly aria-label="Flipbook URL" />
              <button class="copy-btn" id="copy-link-btn" aria-label="Copy link to clipboard">Copy</button>
            </div>
          </div>
        </div>

        <!-- Embed Tab -->
        <div class="share-tab-content" id="tab-embed" role="tabpanel" aria-labelledby="tab-btn-embed">
          <div class="modal-section">
            <div class="modal-section-label">Embed Size</div>
            <div class="embed-size-row">
              <button class="embed-size-btn active" data-w="800" data-h="600">800 × 600</button>
              <button class="embed-size-btn" data-w="640" data-h="480">640 × 480</button>
              <button class="embed-size-btn" data-w="1024" data-h="768">1024 × 768</button>
              <button class="embed-size-btn" data-w="100%" data-h="600">Full width</button>
            </div>
            <div class="modal-section-label">Embed Code</div>
            <div class="embed-code" id="embed-code">
              ${this._escapeHtml(this._getEmbedCode(viewUrl))}
              <button class="embed-copy-btn" id="copy-embed-btn" aria-label="Copy embed code">Copy</button>
            </div>
          </div>
        </div>

        <!-- Social Tab -->
        <div class="share-tab-content" id="tab-social" role="tabpanel" aria-labelledby="tab-btn-social">
          <div class="modal-section">
            <div class="modal-section-label">Share On</div>
            <div class="social-grid">
              <a class="social-btn" id="share-fb" href="#" target="_blank" rel="noopener" aria-label="Share on Facebook">
                ${ICONS.facebook}<span>Facebook</span>
              </a>
              <a class="social-btn" id="share-tw" href="#" target="_blank" rel="noopener" aria-label="Share on X (Twitter)">
                ${ICONS.twitter}<span>X / Twitter</span>
              </a>
              <a class="social-btn" id="share-li" href="#" target="_blank" rel="noopener" aria-label="Share on LinkedIn">
                ${ICONS.linkedin}<span>LinkedIn</span>
              </a>
              <a class="social-btn" id="share-wa" href="#" target="_blank" rel="noopener" aria-label="Share on WhatsApp">
                ${ICONS.whatsapp}<span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        <!-- QR Code Tab -->
        <div class="share-tab-content" id="tab-qr" role="tabpanel" aria-labelledby="tab-btn-qr">
          <div class="modal-section">
            <div class="qr-wrap">
              <canvas id="qr-canvas" aria-label="QR code for flipbook link"></canvas>
              <button class="qr-download-btn" id="qr-download-btn" aria-label="Download QR code">
                ${ICONS.download} Download QR
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._wireShareModal(viewUrl);
  }

  _getEmbedCode(url) {
    return `<iframe src="${url}" width="${this._embedWidth}" height="${this._embedHeight}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>`;
  }

  _wireShareModal(viewUrl) {
    const modal = this.shareModal;

    // Close
    document.getElementById('share-close').addEventListener('click', () => this.closeShareModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeShareModal();
    });

    // Tabs
    const tabs = modal.querySelectorAll('.share-tab');
    const panels = modal.querySelectorAll('.share-tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const panelId = tab.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');

        // Generate QR on first open of QR tab
        if (panelId === 'tab-qr') {
          setTimeout(() => {
            const qrCanvas = document.getElementById('qr-canvas');
            if (qrCanvas) SimpleQR.generate(qrCanvas, viewUrl, 140);
          }, 50);
        }
      });
    });

    // Tab keyboard navigation
    const tabList = modal.querySelector('[role="tablist"]');
    if (tabList) {
      tabList.addEventListener('keydown', (e) => {
        const tabsArr = Array.from(tabs);
        const currentIdx = tabsArr.indexOf(document.activeElement);
        if (currentIdx < 0) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = tabsArr[(currentIdx + 1) % tabsArr.length];
          next.focus();
          next.click();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = tabsArr[(currentIdx - 1 + tabsArr.length) % tabsArr.length];
          prev.focus();
          prev.click();
        }
      });
    }

    // Copy link
    const copyBtn = document.getElementById('copy-link-btn');
    copyBtn && copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(viewUrl).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        this._announceToScreenReader('Link copied to clipboard');
        setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
      });
    });

    // Embed size buttons
    const sizeBtns = modal.querySelectorAll('.embed-size-btn');
    sizeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sizeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._embedWidth = btn.dataset.w;
        this._embedHeight = parseInt(btn.dataset.h, 10);
        const codeEl = document.getElementById('embed-code');
        if (codeEl) {
          const embedBtn = codeEl.querySelector('.embed-copy-btn');
          codeEl.textContent = this._getEmbedCode(viewUrl);
          if (embedBtn) codeEl.appendChild(embedBtn);
        }
      });
    });

    // Copy embed
    const embedCopyBtn = document.getElementById('copy-embed-btn');
    embedCopyBtn && embedCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this._getEmbedCode(viewUrl)).then(() => {
        embedCopyBtn.textContent = 'Copied!';
        embedCopyBtn.classList.add('copied');
        this._announceToScreenReader('Embed code copied to clipboard');
        setTimeout(() => { embedCopyBtn.textContent = 'Copy'; embedCopyBtn.classList.remove('copied'); }, 2000);
      });
    });

    // Social links
    const title = encodeURIComponent(this.flipbook ? this.flipbook.title : 'FlipBook');
    const url = encodeURIComponent(viewUrl);
    const fbBtn = document.getElementById('share-fb');
    const twBtn = document.getElementById('share-tw');
    const liBtn = document.getElementById('share-li');
    const waBtn = document.getElementById('share-wa');

    fbBtn && (fbBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${url}`);
    twBtn && (twBtn.href = `https://twitter.com/intent/tweet?url=${url}&text=${title}`);
    liBtn && (liBtn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`);
    waBtn && (waBtn.href = `https://wa.me/?text=${title}%20${url}`);

    // QR download
    const qrDlBtn = document.getElementById('qr-download-btn');
    qrDlBtn && qrDlBtn.addEventListener('click', () => {
      const qrCanvas = document.getElementById('qr-canvas');
      if (!qrCanvas) return;
      const link = document.createElement('a');
      link.download = 'flipbook-qr.png';
      link.href = qrCanvas.toDataURL('image/png');
      link.click();
    });
  }

  openShareModal() {
    if (this.shareModal) {
      this.createShareModal();
      this.shareModal.classList.add('open');
      this.shareModalOpen = true;
      this._clearToolbarHideTimer();

      // Focus the close button for accessibility
      setTimeout(() => {
        const closeBtn = document.getElementById('share-close');
        if (closeBtn) closeBtn.focus();
      }, 100);
    }
    this.trackEvent('share', {});
  }

  closeShareModal() {
    if (this.shareModal) {
      this.shareModal.classList.remove('open');
      this.shareModalOpen = false;
    }
    this._scheduleToolbarHide();

    // Return focus to the share button
    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) shareBtn.focus();
  }

  /* ── Zoom (5-level HD system) ── */
  zoomIn() {
    if (this.zoomLevel < this.ZOOM_LEVELS.length - 1) {
      this.zoomLevel++;
      this._applyZoom();
    }
  }

  zoomOut() {
    if (this.zoomLevel > 0) {
      this.zoomLevel--;
      this._applyZoom();
    }
  }

  zoomReset() {
    if (this.zoomLevel === 0) return;
    this.zoomLevel = 0;
    this.panOffset = { x: 0, y: 0 };
    this._applyZoom();
  }

  /** Jump to the zoom level whose scale is closest to `targetScale` */
  _setZoomByScale(targetScale) {
    let best = 0;
    let bestDiff = Infinity;
    this.ZOOM_LEVELS.forEach((z, i) => {
      const diff = Math.abs(z.scale - targetScale);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    if (best !== this.zoomLevel) {
      this.zoomLevel = best;
      this._applyZoom();
    }
  }

  _applyZoom() {
    const stage = this.viewerStage;
    if (!stage) return;

    // Remove all zoom classes
    this.ZOOM_LEVELS.forEach(z => stage.classList.remove(z.css));

    const level = this.ZOOM_LEVELS[this.zoomLevel];
    stage.classList.add(level.css);

    // Toggle zoomed / dragging body classes
    stage.classList.toggle('is-zoomed', this.zoomLevel > 0);

    this._showToast(`Zoom: ${level.label}`);
    this._updateZoomIndicator();

    if (this.zoomLevel > 0) {
      this._setupZoomDrag();
      this._requestHighResTiles();
    } else {
      this._teardownZoomDrag();
      this.panOffset = { x: 0, y: 0 };
      if (this.flipbookInner) {
        this.flipbookInner.style.transform = '';
        this.flipbookInner.style.marginLeft = '';
        this.flipbookInner.style.marginTop = '';
      }
    }

    // Show/hide reset button
    const resetBtn = document.getElementById('btn-zoom-reset');
    if (resetBtn) resetBtn.style.display = this.zoomLevel > 0 ? '' : 'none';
  }

  _updateZoomIndicator() {
    const el = document.getElementById('zoom-pct');
    if (!el) return;
    const level = this.ZOOM_LEVELS[this.zoomLevel];
    el.textContent = level.label;
    el.classList.toggle('hidden', this.zoomLevel === 0);
  }

  /** Promote visible page images to full-res when zoomed past 200% */
  _requestHighResTiles() {
    if (this.zoomLevel < 2) return; // only at 200%+
    const imgs = (this.flipbookInner || document).querySelectorAll('.flip-page img, .book-page-inner img');
    imgs.forEach(img => {
      if (img.dataset.hires && img.src !== img.dataset.hires) {
        img.src = img.dataset.hires;
      }
      // Remove lazy loading on visible zoom
      img.loading = 'eager';
    });
  }

  _setupZoomDrag() {
    const inner = this.flipbookInner;
    if (!inner || this._zoomDragBound) return;
    this._zoomDragBound = true;

    const onDown = (e) => {
      if (this.zoomLevel === 0) return;
      this.isDragging = true;
      if (this.viewerStage) this.viewerStage.classList.add('is-dragging');
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragOffset = { ...this.panOffset };
      inner.style.cursor = 'grabbing';
      inner.style.transition = 'none';
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.panOffset = {
        x: this.dragOffset.x + dx,
        y: this.dragOffset.y + dy
      };
      inner.style.marginLeft = this.panOffset.x + 'px';
      inner.style.marginTop = this.panOffset.y + 'px';
    };

    const onUp = () => {
      this.isDragging = false;
      if (this.viewerStage) this.viewerStage.classList.remove('is-dragging');
      inner.style.cursor = 'grab';
    };

    inner.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    inner.style.cursor = 'grab';

    this._zoomDragHandlers = { onDown, onMove, onUp };
  }

  _teardownZoomDrag() {
    const inner = this.flipbookInner;
    if (!inner || !this._zoomDragHandlers) return;
    const { onDown, onMove, onUp } = this._zoomDragHandlers;
    inner.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    inner.style.cursor = '';
    if (this.viewerStage) this.viewerStage.classList.remove('is-dragging');
    this._zoomDragBound = false;
    this._zoomDragHandlers = null;
  }

  /* ── Wheel Zoom (Ctrl+Scroll) ── */
  _setupWheelZoom() {
    const stage = this.viewerStage;
    if (!stage) return;

    this._wheelZoomHandler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) this.zoomIn();
      else if (e.deltaY > 0) this.zoomOut();
    };
    stage.addEventListener('wheel', this._wheelZoomHandler, { passive: false });
  }

  /* ── Pinch-to-Zoom (mobile) ── */
  _setupPinchZoom() {
    const stage = this.viewerStage;
    if (!stage) return;

    const getDistance = (t) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this._pinchStartDist = getDistance(e.touches);
        this._pinchStartZoom = this.zoomLevel;
        stage.classList.add('is-pinching');
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && this._pinchStartDist) {
        e.preventDefault();
        const dist = getDistance(e.touches);
        const ratio = dist / this._pinchStartDist;
        const currentScale = this.ZOOM_LEVELS[this._pinchStartZoom].scale;
        this._setZoomByScale(currentScale * ratio);
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        this._pinchStartDist = 0;
        stage.classList.remove('is-pinching');
      }
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });

    this._pinchHandlers = { onTouchStart, onTouchMove, onTouchEnd };
  }

  /* ── Intersection Observer for lazy page images ── */
  _setupPageIntersectionObserver() {
    if (typeof IntersectionObserver === 'undefined') return;

    this._pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target.querySelector('img[loading="lazy"]');
        if (img && img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.loading = 'eager';
        }
      });
    }, { root: this.flipbookContainer, rootMargin: '200px', threshold: 0.01 });

    // Observe existing flip-page elements
    const pages = (this.flipbookInner || document).querySelectorAll('.flip-page, .book-page');
    pages.forEach(p => this._pageObserver.observe(p));
  }

  /* ── Fullscreen ── */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
    this.trackEvent('fullscreen', { state: !this.isFullscreen ? 'enter' : 'exit' });
  }

  _onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
      btn.innerHTML = this.isFullscreen ? ICONS.compress : ICONS.fullscreen;
      btn.classList.toggle('active', this.isFullscreen);
      btn.setAttribute('aria-pressed', this.isFullscreen ? 'true' : 'false');
    }
    // Update bottom bar fullscreen button
    const fsBtn = document.getElementById('btn-fullscreen-bottom');
    if (fsBtn) {
      fsBtn.innerHTML = this.isFullscreen ? ICONS.compress : ICONS.fullscreen;
      fsBtn.classList.toggle('active', this.isFullscreen);
    }
    this._announceToScreenReader(this.isFullscreen ? 'Fullscreen mode enabled' : 'Fullscreen mode disabled');
    setTimeout(() => this._onResize(), 100);
  }

  /* ── Keyboard ── */
  handleKeyboard() {
    document.addEventListener('keydown', this._onKeydown);
  }

  _onKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ctrl+0 / Cmd+0 — reset zoom
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      this.zoomReset();
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        this.nextPage();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.prevPage();
        break;
      case 'ArrowUp':
      case 'Home':
        e.preventDefault();
        this.goToPage(1);
        break;
      case 'ArrowDown':
      case 'End':
        e.preventDefault();
        this.goToPage(this.totalPages);
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      case 't':
      case 'T':
        this.toggleThumbnails();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case 'Escape':
        if (this.shareModalOpen) { this.closeShareModal(); break; }
        if (this.thumbnailsOpen) { this.toggleThumbnails(); break; }
        if (this.isFullscreen) { document.exitFullscreen(); break; }
        if (this.zoomLevel > 0) { this.zoomReset(); break; }
        break;
      case '?':
        this._toggleShortcutsOverlay();
        break;
      case 'p':
      case 'P':
        this.toggleAutoPlay();
        break;
    }
  }

  _toggleShortcutsOverlay() {
    const overlay = document.getElementById('shortcuts-overlay');
    if (overlay) {
      const isOpen = overlay.classList.toggle('open');
      if (isOpen) {
        this._announceToScreenReader('Keyboard shortcuts overlay opened');
      }
    }
  }

  /* ── Touch / Swipe ── */
  _setupTouchEvents() {
    const stage = this.viewerStage;
    if (!stage) return;

    stage.addEventListener('touchstart', this._onTouchStart, { passive: true });
    stage.addEventListener('touchend', this._onTouchEnd, { passive: true });
    stage.addEventListener('touchmove', this._onTouchMove, { passive: false });

    let lastTap = 0;
    stage.addEventListener('touchend', (e) => {
      if (e.target.closest('#viewer-toolbar') || e.target.closest('.modal-backdrop')) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        this.toggleFullscreen();
      }
      lastTap = now;
    }, { passive: true });
  }

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }
    this._showToolbar();
  }

  _onTouchMove(e) {
    if (this.zoomLevel > 0 && e.touches.length === 1) {
      e.preventDefault();
    }
  }

  _onTouchEnd(e) {
    if (e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 50 && absDx > absDy && this.zoomLevel === 0) {
        if (dx < 0) this.nextPage();
        else this.prevPage();
      }
    }
  }

  /* ── Toolbar Auto-Hide ── */
  _attachGlobalListeners() {
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    window.addEventListener('resize', this._onResize);
  }

  _onMouseMove() {
    this._showToolbar();
    this._scheduleToolbarHide();
  }

  _showToolbar() {
    if (this.toolbar) this.toolbar.classList.remove('hidden');
    this.toolbarVisible = true;
    if (this.viewerStage) this.viewerStage.classList.add('scrubber-visible');
  }

  _scheduleToolbarHide() {
    this._clearToolbarHideTimer();
    this.toolbarTimeout = setTimeout(() => {
      if (!this.thumbnailsOpen && !this.shareModalOpen) {
        const tb = this.toolbar;
        if (tb && !tb.matches(':hover')) {
          this.toolbar.classList.add('hidden');
          this.toolbarVisible = false;
          if (this.viewerStage) this.viewerStage.classList.remove('scrubber-visible');
        }
      }
    }, 3000);
  }

  _clearToolbarHideTimer() {
    clearTimeout(this.toolbarTimeout);
  }

  /* ── Resize Handler ── */
  _onResize() {
    const wasTwoPage = this.isTwoPage;
    this.isTwoPage = !this._isMobile() && window.innerWidth > 768;

    if (this._pageFlipNative && this.pageFlipEngine) {
      if (wasTwoPage !== this.isTwoPage) {
        this.pageFlipEngine.destroy();
        this.pageFlipEngine = null;
        this._pageFlipNative = false;
        this._initPageFlipEngine(this.pages, this.settings || {});
      } else {
        this.pageFlipEngine.update();
      }
      return;
    }

    if (wasTwoPage !== this.isTwoPage) {
      this._initCSSFlipEngine(this.pages, this.settings || {});
    }

    this._recalcBookSize();
  }

  _recalcBookSize() {
    if (this._pageFlipNative && this.pageFlipEngine) return;

    const flipEl = this.flipbookInner;
    if (!flipEl || !this._aspectRatio) return;

    const container = this.flipbookContainer;
    const vw = container ? container.clientWidth - 20 : window.innerWidth - 40;
    const vh = container ? container.clientHeight - 8 : window.innerHeight - 58; // bottom bar + small padding

    const maxPageH = vh;
    const maxPageW = this.isTwoPage ? vw / 2 : vw;

    let pageH = maxPageH;
    let pageW = pageH * this._aspectRatio;

    if (pageW > maxPageW) {
      pageW = maxPageW;
      pageH = pageW / this._aspectRatio;
    }

    const bookW = this.isTwoPage ? pageW * 2 : pageW;
    flipEl.style.width = Math.round(bookW) + 'px';
    flipEl.style.height = Math.round(pageH) + 'px';
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver !== 'undefined' && this.flipbookContainer) {
      const ro = new ResizeObserver(() => this._recalcBookSize());
      ro.observe(this.flipbookContainer);
      this._resizeObserver = ro;
    }
  }

  _isMobile() {
    return window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);
  }

  /* ── Analytics ── */
  trackEvent(type, data = {}) {
    const payload = {
      flipbook_id: this.flipbookId || this.slug,
      event_type: type,
      visitor_id: this.visitorId,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      ...data
    };

    fetch(`${API}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  }

  /* ── Download ── */
  _handleDownload() {
    if (!this.flipbook) return;
    this.trackEvent('download', {});
    const downloadUrl = this.flipbook.pdfUrl || this.flipbook.download_url;
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = (this.flipbook.title || 'flipbook') + '.pdf';
      a.click();
    } else {
      this._showToast('Download not available');
    }
  }

  /* ── Error ── */
  showError(message) {
    this._clearLoadingEnhancements();
    if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
    const screen = this.errorScreen;
    if (!screen) return;

    const msgEl = screen.querySelector('.error-message');
    if (msgEl) msgEl.textContent = message || 'Something went wrong.';
    screen.classList.add('visible');
  }

  /** Show error with an action button (Agent 3) */
  _showErrorWithAction(message, actionType) {
    this._clearLoadingEnhancements();
    if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
    const screen = this.errorScreen;
    if (!screen) return;

    const msgEl = screen.querySelector('.error-message');
    if (msgEl) msgEl.textContent = message || 'Something went wrong.';

    // Add action link/button
    const linkContainer = screen.querySelector('.error-link') || (() => {
      const div = document.createElement('div');
      div.className = 'error-link';
      screen.appendChild(div);
      return div;
    })();
    linkContainer.innerHTML = '';

    if (actionType === 'home') {
      linkContainer.innerHTML = '<a href="/" class="error-retry-btn">Go to Homepage</a>';
    } else if (actionType === 'retry') {
      const btn = document.createElement('button');
      btn.className = 'error-retry-btn';
      btn.textContent = 'Try Again';
      btn.addEventListener('click', () => {
        screen.classList.remove('visible');
        this.init();
      });
      linkContainer.appendChild(btn);
    }

    screen.classList.add('visible');
  }

  /** Handle image load error with retry (Agent 3) */
  _handleImageError(img, pageNum, inner) {
    inner.classList.remove('img-loading');
    inner.classList.add('img-error');
    const shimmer = inner.querySelector('.page-shimmer');
    if (shimmer && shimmer.parentNode) shimmer.remove();

    const errorContent = document.createElement('div');
    errorContent.className = 'page-error-content';
    errorContent.innerHTML = `
      <div class="page-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="page-error-text">Page ${pageNum} failed to load</div>
    `;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'page-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      errorContent.remove();
      inner.classList.remove('img-error');
      inner.classList.add('img-loading');
      const newShimmer = document.createElement('div');
      newShimmer.className = 'page-shimmer';
      inner.appendChild(newShimmer);

      const newImg = document.createElement('img');
      newImg.alt = `Page ${pageNum}`;
      newImg.loading = 'eager';
      newImg.decoding = 'async';
      // Cache-bust to force refetch
      const pd = this.pages[pageNum - 1];
      if (pd && pd.imageUrl) {
        newImg.src = pd.imageUrl + (pd.imageUrl.includes('?') ? '&' : '?') + '_r=' + Date.now();
      }
      newImg.onload = () => {
        inner.classList.remove('img-loading');
        if (newShimmer.parentNode) newShimmer.remove();
      };
      newImg.onerror = () => this._handleImageError(newImg, pageNum, inner);
      inner.appendChild(newImg);
    });

    errorContent.appendChild(retryBtn);
    inner.appendChild(errorContent);
  }

  /* ── Loading Hide ── */
  _hideLoading() {
    performance.mark && performance.mark('loading-hidden');
    setTimeout(() => {
      if (this.loadingScreen) {
        this.loadingScreen.classList.add('fade-out');
        setTimeout(() => this.loadingScreen.classList.add('hidden'), 500);
      }
    }, 150);
  }

  /* ── Toast ── */
  _showToast(msg, duration = 2000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toast.setAttribute('role', 'status');
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /* ── Utilities ── */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  /* ── Flip Sound (Web Audio API) ── */
  _initFlipSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this._audioCtx = new AudioContext();

      const ctx = this._audioCtx;
      const sampleRate = ctx.sampleRate;
      const duration = 0.15;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i++) {
        const t = i / length;
        let envelope;
        if (t < 0.1) {
          envelope = t / 0.1;
        } else if (t < 0.4) {
          envelope = 1.0;
        } else {
          envelope = 1.0 - ((t - 0.4) / 0.6);
        }
        data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
      }

      this._flipSoundBuffer = buffer;
    } catch (_e) {
      // Web Audio not available
    }
  }

  _playFlipSound() {
    if (this.settings && this.settings.flipSound === false) return;
    if (!this._audioCtx || !this._flipSoundBuffer) return;

    try {
      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }

      const ctx = this._audioCtx;
      const source = ctx.createBufferSource();
      source.buffer = this._flipSoundBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3000;
      filter.Q.value = 0.7;

      const gain = ctx.createGain();
      gain.gain.value = 0.25;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch (_e) {
      // Ignore playback errors
    }
  }

  /* ── Auto-Play ── */
  startAutoPlay() {
    if (this.autoPlaying) return;
    this.autoPlaying = true;

    const btn = document.getElementById('btn-autoplay');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = ICONS.pause;
      btn.title = 'Pause auto-play (P)';
      btn.setAttribute('aria-label', 'Pause auto-play');
    }

    this._showToast('Auto-play on');
    this._announceToScreenReader('Auto-play started');

    this.autoPlayTimer = setInterval(() => {
      if (this.currentPage >= this.totalPages) {
        this.goToPage(1);
      } else {
        this.nextPage();
      }
    }, this.autoPlayInterval);
  }

  stopAutoPlay() {
    if (!this.autoPlaying) return;
    this.autoPlaying = false;

    clearInterval(this.autoPlayTimer);
    this.autoPlayTimer = null;

    const btn = document.getElementById('btn-autoplay');
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = ICONS.play;
      btn.title = 'Auto-play (P)';
      btn.setAttribute('aria-label', 'Toggle auto-play');
    }

    this._showToast('Auto-play off');
    this._announceToScreenReader('Auto-play stopped');
  }

  toggleAutoPlay() {
    if (this.autoPlaying) {
      this.stopAutoPlay();
    } else {
      this.startAutoPlay();
    }
  }

  /* ── Initial Flip Hint ── */
  _showInitialFlipHint() {
    if (this._pageFlipNative && this.pageFlipEngine) return;
    setTimeout(() => {
      this._showCSSFlipHint();
    }, 1000);
  }

  _showCSSFlipHint() {
    const flipEl = this.flipbookInner;
    if (!flipEl) return;

    const hint = document.createElement('div');
    hint.className = 'page-corner-hint-anim';
    hint.setAttribute('aria-hidden', 'true');
    hint.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 60px;
      height: 60px;
      z-index: 20;
      pointer-events: none;
      background: linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.03) 45%, rgba(0,0,0,0.08) 50%, #f5f5f5 50%, #eee 100%);
      transform-origin: bottom right;
      animation: flipHintPulse 1.5s ease-in-out 2;
    `;

    if (!document.getElementById('flip-hint-keyframes')) {
      const style = document.createElement('style');
      style.id = 'flip-hint-keyframes';
      style.textContent = `
        @keyframes flipHintPulse {
          0% { transform: scale(1); opacity: 0; }
          15% { opacity: 1; }
          50% { transform: scale(1.8) rotate(-5deg); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    flipEl.appendChild(hint);

    setTimeout(() => {
      if (hint.parentNode) hint.parentNode.removeChild(hint);
    }, 3200);
  }

  /* ── Page Flip Engine (StPageFlip) integration ── */
  _initPageFlipEngine(pages, settings) {
    const Engine = PageFlip;
    const container = this.flipbookInner;
    if (!container) return;

    container.innerHTML = '';
    container.style.perspective = '';

    const aspectRatio = pages[0]
      ? (pages[0].width || 794) / (pages[0].height || 1123)
      : 794 / 1123;
    this._aspectRatio = aspectRatio;

    // Minimal chrome: bottom bar (~44px) + small padding (14px)
    const chromeH = 44 + 14;
    const availH = window.innerHeight - chromeH;
    const availW = window.innerWidth - 40;
    const maxPageW = this.isTwoPage ? availW / 2 : availW;
    let pageW = maxPageW;
    let pageH = Math.round(pageW / aspectRatio);
    if (pageH > availH) {
      pageH = availH;
      pageW = Math.round(pageH * aspectRatio);
    }

    const bookW = this.isTwoPage ? pageW * 2 : pageW;
    container.style.width = bookW + 'px';
    container.style.height = pageH + 'px';
    container.style.position = 'relative';
    container.style.display = 'block';
    container.style.overflow = 'visible';

    this._bookW = bookW;
    this._bookH = pageH;
    this._pageW = pageW;
    this._pageH = pageH;

    try {
      const pageEls = pages.map((p, i) => {
        const div = document.createElement('div');
        div.className = 'flip-page';
        div.dataset.page = i + 1;
        if (p.imageUrl) {
          // Shimmer placeholder
          const shimmer = document.createElement('div');
          shimmer.className = 'page-shimmer';
          div.appendChild(shimmer);

          const img = document.createElement('img');
          img.alt = `Page ${i + 1}`;
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
          img.decoding = 'async';
          // Critical pages (1-2) get high priority, first 4 are eager (Agent 3)
          if (i < 2) {
            img.src = p.imageUrl;
            img.loading = 'eager';
            img.fetchPriority = 'high';
          } else if (i < 4) {
            img.src = p.imageUrl;
            img.loading = 'eager';
          } else {
            img.loading = 'lazy';
            img.src = p.imageUrl;
          }
          img.onload = () => { if (shimmer.parentNode) shimmer.remove(); };
          img.onerror = () => { if (shimmer.parentNode) shimmer.remove(); };
          div.appendChild(img);
        } else {
          div.appendChild(this._createDemoPage(i + 1));
        }
        container.appendChild(div);
        return div;
      });

      const pf = new Engine(container, {
        width: pageW,
        height: pageH,
        size: 'fixed',
        autoSize: false,
        showCover: settings.showCover !== false,
        mobileScrollSupport: false,
        usePortrait: this._isMobile(),
        startZIndex: 1,
        flippingTime: settings.flippingTime || 700,
        maxShadowOpacity: settings.maxShadowOpacity || 0.5,
        drawShadow: true,
        useMouseEvents: true,
        swipeDistance: 30,
        showFlipHint: settings.showPageCorners !== false,
      });

      pf.loadFromHTML(pageEls);

      pf.on('flip', (e) => {
        this._onPageChanged(e.data + 1);
      });

      pf.on('changeOrientation', () => {
        this._updateToolbarState();
      });

      this.pageFlipEngine = pf;
      this._pageFlipNative = true;

    } catch (err) {
      console.error('[FlipbookViewer] PageFlip engine init failed:', err);
      container.innerHTML = '';
      container.style.width = '';
      container.style.height = '';
      this._pageFlipNative = false;
      this.pageFlipEngine = null;
      this._initCSSFlipEngine(pages, settings);
    }
  }

  /* ── Destroy ── */
  destroy() {
    document.removeEventListener('keydown', this._onKeydown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    window.removeEventListener('resize', this._onResize);
    if (this.viewerStage) {
      this.viewerStage.removeEventListener('touchstart', this._onTouchStart);
      this.viewerStage.removeEventListener('touchend', this._onTouchEnd);
      this.viewerStage.removeEventListener('touchmove', this._onTouchMove);
      this.viewerStage.removeEventListener('dblclick', this._onDblClick);

      // Wheel zoom cleanup
      if (this._wheelZoomHandler) {
        this.viewerStage.removeEventListener('wheel', this._wheelZoomHandler);
        this._wheelZoomHandler = null;
      }

      // Pinch zoom cleanup
      if (this._pinchHandlers) {
        this.viewerStage.removeEventListener('touchstart', this._pinchHandlers.onTouchStart);
        this.viewerStage.removeEventListener('touchmove', this._pinchHandlers.onTouchMove);
        this.viewerStage.removeEventListener('touchend', this._pinchHandlers.onTouchEnd);
        this._pinchHandlers = null;
      }
    }
    this._teardownZoomDrag();
    if (this._resizeObserver) this._resizeObserver.disconnect();

    // Page intersection observer cleanup
    if (this._pageObserver) {
      this._pageObserver.disconnect();
      this._pageObserver = null;
    }

    if (this.pageFlipEngine && typeof this.pageFlipEngine.destroy === 'function') {
      try {
        this.pageFlipEngine.destroy();
      } catch (err) {
        console.error('[FlipbookViewer] Error destroying PageFlip engine:', err);
      }
    }
    this.pageFlipEngine = null;
    this._pageFlipNative = false;
    clearTimeout(this.toolbarTimeout);
    clearInterval(this.autoPlayTimer);

    // LRU cache cleanup (Agent 3)
    if (this._imageCache) this._imageCache.clear();
    this._clearLoadingEnhancements();
  }
}

/* ──────────────────────────────────────────
   Bootstrap
   ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (window !== window.top) {
    document.body.classList.add('embed-mode');
  }

  window._flipbookViewer = new FlipbookViewer('viewer-root');
  window._flipbookViewer.init().catch(err => {
    console.error('[FlipbookViewer] Fatal init error:', err);
    if (window._flipbookViewer.showError) {
      window._flipbookViewer.showError('Failed to initialize viewer.');
    }
  });

  // postMessage API for embed/iframe control
  window.addEventListener('message', (e) => {
    const viewer = window._flipbookViewer;
    if (!viewer || !e.data || typeof e.data !== 'object') return;
    const { action, value } = e.data;
    switch (action) {
      case 'goToPage': viewer.goToPage(value); break;
      case 'nextPage': viewer.nextPage(); break;
      case 'prevPage': viewer.prevPage(); break;
      case 'zoomIn': viewer.zoomIn(); break;
      case 'zoomOut': viewer.zoomOut(); break;
      case 'zoomReset': viewer.zoomReset(); break;
      case 'toggleFullscreen': viewer.toggleFullscreen(); break;
    }
  });
});
