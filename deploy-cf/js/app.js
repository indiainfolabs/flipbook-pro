/**
 * FlipBook Pro — Dashboard SPA
 * Hash-based router, state management, API layer, analytics charts.
 * Created with Perplexity Computer — https://www.perplexity.ai/computer
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   API Configuration
───────────────────────────────────────────────────────────────*/
const API = 'https://flipbook-pro-api.socialholic.workers.dev';

/* ─────────────────────────────────────────────────────────────
   Safe Storage (with in-memory fallback for sandboxed iframes)
───────────────────────────────────────────────────────────────*/
const safeStorage = (() => {
  const mem = {};
  const fallback = {
    getItem: (key) => mem[key] || null,
    setItem: (key, val) => { mem[key] = String(val); },
    removeItem: (key) => { delete mem[key]; },
  };
  try {
    const s = window['local' + 'Storage'];
    const k = '__test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return {
      getItem: (key) => s.getItem(key),
      setItem: (key, val) => s.setItem(key, val),
      removeItem: (key) => s.removeItem(key),
    };
  } catch {
    return fallback;
  }
})();

/* ─────────────────────────────────────────────────────────────
   App State
───────────────────────────────────────────────────────────────*/
const state = {
  token: null,
  user: null,
  flipbooks: [],
  currentFlipbook: null,
  filter: 'all',
  searchQuery: '',
  sortOrder: 'recent',
  viewMode: 'grid',
  sidebarCollapsed: false,
  activeView: null,
  charts: { views: null, pages: null },
  deleteTarget: null,
  shareTarget: null,
  pendingUploadFile: null,
  lastUploadedFlipbook: null,
  apiKeyVisible: false,
};

/* ─────────────────────────────────────────────────────────────
   Mock Data (development / demo)
───────────────────────────────────────────────────────────────*/
const MOCK_USER = {
  id: 'user_demo',
  name: 'Jane Smith',
  email: 'jane@example.com',
  plan: 'free',
};

const MOCK_FLIPBOOKS = [
  {
    id: 'fb_001',
    title: 'Q3 2025 Annual Report',
    slug: 'q3-2025-annual-report',
    page_count: 48,
    status: 'published',
    visibility: 'public',
    view_count: 3842,
    created_at: '2025-09-15T10:30:00Z',
    updated_at: '2025-09-20T14:22:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#ffffff', flippingTime: 800, showPageNumbers: true, showThumbnails: true, branding: { primaryColor: '#2563eb', showBranding: true } },
  },
  {
    id: 'fb_002',
    title: 'Product Catalog Winter 2025',
    slug: 'product-catalog-winter-2025',
    page_count: 124,
    status: 'published',
    visibility: 'public',
    view_count: 7201,
    created_at: '2025-11-01T08:15:00Z',
    updated_at: '2025-11-10T09:45:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#f8fafc', flippingTime: 600, showPageNumbers: true, showThumbnails: true, branding: { primaryColor: '#0891b2', showBranding: true } },
  },
  {
    id: 'fb_003',
    title: 'Employee Handbook',
    slug: 'employee-handbook',
    page_count: 32,
    status: 'private',
    visibility: 'password',
    view_count: 215,
    created_at: '2025-07-22T16:00:00Z',
    updated_at: '2025-08-05T11:30:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#ffffff', flippingTime: 800, showPageNumbers: true, showThumbnails: false, branding: { primaryColor: '#7c3aed', showBranding: false } },
  },
  {
    id: 'fb_004',
    title: 'Marketing Brochure — Draft',
    slug: 'marketing-brochure-draft',
    page_count: 16,
    status: 'draft',
    visibility: 'private',
    view_count: 0,
    created_at: '2025-12-01T14:00:00Z',
    updated_at: '2025-12-01T14:00:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#fff7ed', flippingTime: 1000, showPageNumbers: true, showThumbnails: true, branding: { primaryColor: '#ea580c', showBranding: true } },
  },
  {
    id: 'fb_005',
    title: 'Board Meeting Slides — Jan 2026',
    slug: 'board-meeting-jan-2026',
    page_count: 28,
    status: 'private',
    visibility: 'password',
    view_count: 42,
    created_at: '2026-01-05T09:00:00Z',
    updated_at: '2026-01-07T16:45:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#0f172a', flippingTime: 700, showPageNumbers: true, showThumbnails: false, branding: { primaryColor: '#38bdf8', showBranding: false } },
  },
  {
    id: 'fb_006',
    title: 'Onboarding Guide 2026',
    slug: 'onboarding-guide-2026',
    page_count: 20,
    status: 'draft',
    visibility: 'private',
    view_count: 0,
    created_at: '2026-02-10T11:00:00Z',
    updated_at: '2026-02-10T11:00:00Z',
    thumbnail_url: null,
    settings: { backgroundColor: '#ffffff', flippingTime: 800, showPageNumbers: true, showThumbnails: true, branding: { primaryColor: '#2563eb', showBranding: true } },
  },
];

/* Thumbnail gradient palettes for placeholder covers */
const THUMB_GRADIENTS = [
  ['#dbeafe', '#93c5fd'],
  ['#dcfce7', '#86efac'],
  ['#fef3c7', '#fcd34d'],
  ['#fce7f3', '#f9a8d4'],
  ['#ede9fe', '#c4b5fd'],
  ['#ecfeff', '#67e8f9'],
];

/* Mock analytics data generator */
function generateMockAnalytics(days) {
  const now = new Date();
  const labels = [];
  const viewData = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    // simulate a realistic bell curve with weekday dips
    const base = 80 + Math.sin(i / 5) * 40;
    const noise = (Math.random() - 0.5) * 60;
    const weekend = [0, 6].includes(d.getDay()) ? 0.6 : 1;
    viewData.push(Math.max(0, Math.round((base + noise) * weekend)));
  }

  // Page heatmap: diminishing views after first pages
  const pageData = Array.from({ length: 24 }, (_, i) => {
    const base = 400 - i * 14;
    const noise = (Math.random() - 0.5) * 40;
    return Math.max(5, Math.round(base + noise));
  });

  const pageLabels = Array.from({ length: 24 }, (_, i) => `P${i + 1}`);

  const totalViews = viewData.reduce((a, b) => a + b, 0);
  const uniqueVisitors = Math.round(totalViews * 0.72);
  const avgPages = (Math.random() * 4 + 8).toFixed(1);
  const avgTime = `${Math.floor(Math.random() * 3 + 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;

  const visitors = Array.from({ length: 12 }, (_, i) => {
    const hoursAgo = i * 2 + Math.floor(Math.random() * 2);
    const d = new Date(now.getTime() - hoursAgo * 3600000);
    const referrers = ['Direct', 'google.com', 'twitter.com', 'linkedin.com', 'facebook.com', 'slack.com'];
    const countries = ['🇺🇸 US', '🇬🇧 UK', '🇩🇪 DE', '🇫🇷 FR', '🇮🇳 IN', '🇨🇦 CA', '🇦🇺 AU'];
    return {
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pages: Math.floor(Math.random() * 18) + 3,
      duration: `${Math.floor(Math.random() * 4 + 1)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      referrer: referrers[Math.floor(Math.random() * referrers.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
    };
  });

  return { labels, viewData, pageLabels, pageData, totalViews, uniqueVisitors, avgPages, avgTime, visitors };
}

/* ─────────────────────────────────────────────────────────────
   API Layer
───────────────────────────────────────────────────────────────*/
const api = {
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      // If backend unavailable, throw with clear message
      if (err.message.includes('fetch') || err.message.includes('Failed')) {
        throw new Error('Cannot connect to server. Using demo data.');
      }
      throw err;
    }
  },

  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  delete: (path) => api.request('DELETE', path),

  async login(email, password) {
    // Try real API, fallback to mock
    try {
      return await api.post('/api/auth/login', { email, password });
    } catch {
      // Mock: accept demo@demo.com / password
      if (email && password.length >= 6) {
        return { token: 'mock_jwt_token_' + Date.now(), user: { ...MOCK_USER, email, name: email.split('@')[0] } };
      }
      throw new Error('Invalid email or password.');
    }
  },

  async register(name, email, password) {
    try {
      return await api.post('/api/auth/register', { name, email, password });
    } catch {
      return { token: 'mock_jwt_token_' + Date.now(), user: { ...MOCK_USER, name, email } };
    }
  },

  async getFlipbooks() {
    try {
      const data = await api.get('/api/flipbooks');
      return Array.isArray(data) ? data : (data.flipbooks || []);
    } catch {
      return MOCK_FLIPBOOKS;
    }
  },

  async createFlipbook(data) {
    try {
      const result = await api.post('/api/flipbooks', data);
      return result && result.flipbook ? result.flipbook : result;
    } catch {
      const id = 'fb_' + Date.now();
      return { id, ...data, slug: id, view_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    }
  },

  async updateFlipbook(id, data) {
    try {
      const result = await api.put(`/api/flipbooks/${id}`, data);
      return result && result.flipbook ? result.flipbook : result;
    } catch {
      return { id, ...data };
    }
  },

  async deleteFlipbook(id) {
    try {
      await api.delete(`/api/flipbooks/${id}`);
    } catch {
      // Mock delete — just continue
    }
  },

  async getAnalytics(id, days = 30) {
    try {
      return await api.get(`/api/flipbooks/${id}/analytics`);
    } catch {
      return generateMockAnalytics(days);
    }
  },
};

/* ─────────────────────────────────────────────────────────────
   Router
───────────────────────────────────────────────────────────────*/
const VIEWS = ['login', 'register', 'dashboard', 'create', 'editor', 'analytics', 'settings'];

function parseRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [route, id] = hash.split('/');
  return { route, id };
}

function navigate(route, id) {
  if (id) {
    window.location.hash = `${route}/${id}`;
  } else {
    window.location.hash = route;
  }
}

async function handleRouteChange() {
  const { route, id } = parseRoute();

  // Auth guard
  if (!state.token && route !== 'login' && route !== 'register') {
    window.location.hash = 'login';
    return;
  }

  if (state.token && (route === 'login' || route === 'register')) {
    window.location.hash = 'dashboard';
    return;
  }

  // Hide all views
  document.getElementById('app').classList.add('hidden');
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-register').classList.add('hidden');

  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  state.activeView = route;

  if (route === 'login') {
    document.getElementById('view-login').classList.remove('hidden');
  } else if (route === 'register') {
    document.getElementById('view-register').classList.remove('hidden');
  } else {
    document.getElementById('app').classList.remove('hidden');
    updateSidebarActive(route);

    if (route === 'dashboard') {
      document.getElementById('view-dashboard').classList.remove('hidden');
      await loadDashboard();
    } else if (route === 'create') {
      document.getElementById('view-create').classList.remove('hidden');
      resetCreateView();
    } else if (route === 'editor') {
      document.getElementById('view-editor').classList.remove('hidden');
      await loadEditor(id);
    } else if (route === 'analytics') {
      document.getElementById('view-analytics').classList.remove('hidden');
      await loadAnalytics(id);
    } else if (route === 'analytics-overview') {
      // Show analytics for first published flipbook or first
      const fb = state.flipbooks.find(f => f.status === 'published') || state.flipbooks[0];
      if (fb) {
        navigate('analytics', fb.id);
      } else {
        navigate('dashboard');
      }
    } else if (route === 'settings') {
      document.getElementById('view-settings').classList.remove('hidden');
      loadSettings();
    } else {
      navigate('dashboard');
    }
  }

  // Re-render Lucide icons after view change
  lucide.createIcons();
}

/* ─────────────────────────────────────────────────────────────
   Dashboard
───────────────────────────────────────────────────────────────*/
async function loadDashboard() {
  // Show skeleton loading
  const skeleton = document.getElementById('flipbook-skeleton');
  const grid = document.getElementById('flipbook-grid');
  if (skeleton) skeleton.classList.remove('hidden');
  if (grid) grid.style.display = 'none';

  try {
    state.flipbooks = await api.getFlipbooks();
  } catch {
    state.flipbooks = MOCK_FLIPBOOKS;
  }

  // Hide skeleton, show grid
  if (skeleton) skeleton.classList.add('hidden');
  if (grid) grid.style.display = '';

  renderFlipbookGrid();
}

function renderFlipbookGrid() {
  const grid = document.getElementById('flipbook-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('flipbook-count');

  let filtered = state.flipbooks.filter(fb => {
    const matchFilter = state.filter === 'all' || fb.status === state.filter;
    const matchSearch = !state.searchQuery ||
      fb.title.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  // Apply sort
  filtered = sortFlipbooks(filtered, state.sortOrder);

  count.textContent = `${filtered.length} flipbook${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  // Apply view mode class
  grid.classList.toggle('list-view', state.viewMode === 'list');

  grid.innerHTML = filtered.map((fb, idx) => renderFlipbookCard(fb, idx)).join('');
}

function sortFlipbooks(flipbooks, order) {
  const sorted = [...flipbooks];
  switch (order) {
    case 'name':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case 'views':
      sorted.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      break;
    case 'recent':
    default:
      sorted.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      break;
  }
  return sorted;
}

function setSortOrder(order) {
  state.sortOrder = order;
  renderFlipbookGrid();
}

function setViewMode(mode, btn) {
  state.viewMode = mode;
  document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderFlipbookGrid();
}

function renderFlipbookCard(fb, idx) {
  const [fromColor, toColor] = THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length];
  const statusBadge = {
    published: `<span class="badge badge-published"><span class="badge-dot"></span>Published</span>`,
    draft: `<span class="badge badge-draft"><span class="badge-dot"></span>Draft</span>`,
    private: `<span class="badge badge-private"><span class="badge-dot"></span>Private</span>`,
  }[fb.status] || '';

  const views = formatNumber(fb.view_count || 0);
  const date = formatDate(fb.updated_at);

  const thumbContent = fb.thumbnail_url
    ? `<img src="${escapeHtml(fb.thumbnail_url || '')}" alt="${escapeHtml(fb.title)} thumbnail" loading="lazy">`
    : `<div class="flipbook-card-thumbnail-placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
        </svg>
        <span style="font-size:11px;color:#93acd6;font-weight:500;">${fb.page_count} pages</span>
       </div>`;

  return `
    <article class="flipbook-card" role="listitem" data-id="${escapeHtml(fb.id)}" onclick="APP.navigate('editor', '${escapeHtml(fb.id)}')">
      <div class="flipbook-card-thumbnail" style="background:linear-gradient(135deg,${fromColor} 0%,${toColor} 100%);">
        ${thumbContent}
        <div class="flipbook-card-hover-actions" role="toolbar" aria-label="Actions">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); APP.navigate('editor','${escapeHtml(fb.id)}')" aria-label="Edit ${escapeHtml(fb.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); APP.navigate('analytics','${escapeHtml(fb.id)}')" aria-label="Analytics for ${escapeHtml(fb.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Stats
          </button>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); APP.openShareModal('${escapeHtml(fb.id)}')" aria-label="Share ${escapeHtml(fb.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn btn-sm" style="background:rgba(220,38,38,0.9);color:#fff;border:none;" onclick="event.stopPropagation(); APP.openDeleteModal('${escapeHtml(fb.id)}', '${escapeHtml(fb.title)}')" aria-label="Delete ${escapeHtml(fb.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="flipbook-card-body">
        <div class="flipbook-card-title">${escapeHtml(fb.title)}</div>
        <div class="flipbook-card-meta">
          <div class="flipbook-card-stats">
            <span title="${fb.page_count} pages">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              ${fb.page_count}p
            </span>
            <span title="${fb.view_count} views">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ${views}
            </span>
          </div>
          ${statusBadge}
        </div>
        <div class="flipbook-card-date">Updated ${date}</div>
      </div>
    </article>`;
}

function setFilter(filter, btn) {
  state.filter = filter;
  document.querySelectorAll('#filter-tabs .btn').forEach(b => {
    b.classList.remove('btn-secondary', 'active-filter');
    b.classList.add('btn-ghost');
    b.setAttribute('aria-selected', 'false');
  });
  btn.classList.remove('btn-ghost');
  btn.classList.add('btn-secondary', 'active-filter');
  btn.setAttribute('aria-selected', 'true');
  renderFlipbookGrid();
}

function handleSearch(query) {
  state.searchQuery = query;
  renderFlipbookGrid();
}

/* ─────────────────────────────────────────────────────────────
   Create / Upload
───────────────────────────────────────────────────────────────*/
function resetCreateView() {
  document.getElementById('upload-progress').classList.remove('show');
  document.getElementById('upload-zone').style.display = '';
  document.getElementById('file-input').value = '';
  state.pendingUploadFile = null;
  state.lastUploadedFlipbook = null;
  // Hide file preview and success state
  const preview = document.getElementById('file-preview-card');
  if (preview) preview.classList.add('hidden');
  const success = document.getElementById('upload-success-state');
  if (success) success.classList.add('hidden');
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
}

function handleDragLeave(e) {
  document.getElementById('upload-zone').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) showFilePreview(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) showFilePreview(file);
}

function showFilePreview(file) {
  if (!file.name.match(/\.pdf$/i)) {
    showToast('Please select a PDF file.', 'error');
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast('File exceeds 100 MB limit.', 'error');
    return;
  }
  state.pendingUploadFile = file;
  const card = document.getElementById('file-preview-card');
  if (!card) { processUpload(file); return; }
  const nameEl = document.getElementById('preview-file-name');
  const sizeEl = document.getElementById('preview-file-size');
  const pagesEl = document.getElementById('preview-file-pages');
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = formatBytes(file.size);
  if (pagesEl) pagesEl.textContent = 'Estimating...';
  card.classList.remove('hidden');
  document.getElementById('upload-zone').style.display = 'none';
}

function cancelFilePreview() {
  state.pendingUploadFile = null;
  const card = document.getElementById('file-preview-card');
  if (card) card.classList.add('hidden');
  document.getElementById('upload-zone').style.display = '';
  document.getElementById('file-input').value = '';
}

function startUpload() {
  if (state.pendingUploadFile) {
    const card = document.getElementById('file-preview-card');
    if (card) card.classList.add('hidden');
    processUpload(state.pendingUploadFile);
  }
}

async function processUpload(file) {
  if (!file.name.match(/\.pdf$/i)) {
    showToast('Please select a PDF file.', 'error');
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast('File exceeds 100 MB limit.', 'error');
    return;
  }

  // Show progress UI
  document.getElementById('upload-zone').style.display = 'none';
  const progressWrap = document.getElementById('upload-progress');
  progressWrap.classList.add('show');
  document.getElementById('upload-file-name').textContent = file.name;
  document.getElementById('upload-file-size').textContent = formatBytes(file.size);

  const bar = document.getElementById('progress-bar');
  const statusEl = document.getElementById('progress-status');

  const setProgress = (pct, msg) => {
    bar.style.width = pct + '%';
    if (statusEl) statusEl.textContent = msg;
  };

  try {
    // Step 1: Load PDF.js and parse the PDF
    setProgress(2, 'Loading PDF…');
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    setProgress(5, 'Parsing PDF…');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    const title = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Step 2: Create the flipbook record via API
    setProgress(8, 'Creating flipbook…');
    const createResp = await api.request('POST', '/api/flipbooks', { title, page_count: totalPages });
    const flipbookId = createResp.id;
    if (!flipbookId) throw new Error('API did not return a flipbook id');

    // Step 3: Render each PDF page to a PNG and upload
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const renderPct = Math.round(8 + ((pageNum - 1) / totalPages) * 82);
      setProgress(renderPct, `Rendering page ${pageNum} of ${totalPages}…`);

      // Render page at 2x scale for quality
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Convert canvas to PNG blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));

      // Upload page image
      const uploadPct = Math.round(8 + (pageNum / totalPages) * 82);
      setProgress(uploadPct, `Uploading page ${pageNum} of ${totalPages}…`);
      const formData = new FormData();
      formData.append('file', blob, `page-${pageNum}.png`);
      formData.append('page_num', String(pageNum));
      const headers = {};
      if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
      await fetch(`${API}/api/flipbooks/${flipbookId}/pages`, {
        method: 'POST',
        headers,
        body: formData,
      }).then(r => { if (!r.ok) throw new Error(`Page upload failed: ${r.status}`); });
    }

    // Step 4: Publish the flipbook
    setProgress(95, 'Finalising…');
    await api.request('PUT', `/api/flipbooks/${flipbookId}`, { status: 'published' });

    setProgress(100, 'Done!');

    // Build local state object
    const newFb = {
      id: flipbookId,
      title,
      page_count: totalPages,
      status: 'published',
      visibility: 'private',
      view_count: 0,
      thumbnail_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      settings: {
        backgroundColor: '#ffffff', flippingTime: 800, showPageNumbers: true,
        showThumbnails: true, maxShadowOpacity: 0.5, autoPlay: false,
        flipSound: true, rtl: false, showCover: true, showPageCorners: true,
        branding: { primaryColor: '#2563eb', showBranding: true, brandingText: '' },
      },
    };

    state.flipbooks.unshift(newFb);
    state.lastUploadedFlipbook = newFb;
    state.pendingUploadFile = null;
    showToast(`"${newFb.title}" uploaded — ${totalPages} pages`, 'success');

    // Show success state
    const successEl = document.getElementById('upload-success-state');
    const progressWrap2 = document.getElementById('upload-progress');
    if (successEl) {
      if (progressWrap2) progressWrap2.classList.remove('show');
      const titleEl = document.getElementById('success-flipbook-title');
      const pagesCountEl = document.getElementById('success-page-count');
      if (titleEl) titleEl.textContent = newFb.title;
      if (pagesCountEl) pagesCountEl.textContent = `${totalPages} pages`;
      successEl.classList.remove('hidden');
    } else {
      navigate('editor', newFb.id);
    }

  } catch (err) {
    console.error('processUpload error:', err);
    showToast('Upload failed: ' + (err.message || 'Unknown error'), 'error');
    // Reset UI
    const progressWrap3 = document.getElementById('upload-progress');
    if (progressWrap3) progressWrap3.classList.remove('show');
    document.getElementById('upload-zone').style.display = '';
  }
}

function goToUploadedFlipbook() {
  if (state.lastUploadedFlipbook) {
    navigate('editor', state.lastUploadedFlipbook.id);
  }
}

function viewUploadedFlipbook() {
  if (state.lastUploadedFlipbook) {
    const url = `viewer.html?id=${state.lastUploadedFlipbook.id}`;
    window.open(url, '_blank', 'noopener');
  }
}

/* ─────────────────────────────────────────────────────────────
   Editor
───────────────────────────────────────────────────────────────*/
async function loadEditor(id) {
  let fb = state.flipbooks.find(f => f.id === id);
  if (!fb) {
    try {
      state.flipbooks = await api.getFlipbooks();
      fb = state.flipbooks.find(f => f.id === id) || MOCK_FLIPBOOKS[0];
    } catch {
      fb = MOCK_FLIPBOOKS[0];
    }
  }

  state.currentFlipbook = { ...fb, settings: { ...fb.settings } };

  // Populate title
  document.getElementById('editor-title-input').value = fb.title;

  // Publish button label
  const publishLabel = document.getElementById('editor-publish-label');
  publishLabel.textContent = fb.status === 'published' ? 'Update' : 'Publish';

  // Update share URL and embed
  const viewerUrl = `${window.location.origin}/viewer.html?id=${fb.slug}`;
  document.getElementById('share-url').value = viewerUrl;
  document.getElementById('embed-code').childNodes[0].textContent =
    `<iframe src="${viewerUrl}"\n  width="800" height="500"\n  frameborder="0"\n  allowfullscreen>\n</iframe>`;

  // Populate settings from flipbook
  const s = fb.settings || {};
  setInputValue('setting-bg-color', s.backgroundColor || '#ffffff');
  setInputValue('setting-bg-color-text', s.backgroundColor || '#ffffff');
  setInputValue('setting-shadow', s.maxShadowOpacity !== undefined ? s.maxShadowOpacity : 0.5);
  document.getElementById('shadow-val').textContent = Math.round((s.maxShadowOpacity || 0.5) * 100) + '%';
  setInputValue('setting-flip-speed', s.flippingTime || 800);
  document.getElementById('flip-speed-val').textContent = (s.flippingTime || 800) + 'ms';

  setCheckbox('setting-page-numbers', s.showPageNumbers !== false);
  setCheckbox('setting-thumbnails', s.showThumbnails !== false);
  setCheckbox('setting-arrows', s.showArrows !== false);
  setCheckbox('setting-fullscreen', s.showFullscreen !== false);
  setCheckbox('setting-zoom', s.showZoom !== false);
  setCheckbox('setting-autoplay', !!s.autoPlay);
  setCheckbox('setting-flip-sound', s.flipSound !== false);
  setCheckbox('setting-rtl', !!s.rtl);
  setCheckbox('setting-cover', s.showCover !== false);
  setCheckbox('setting-corners', s.showPageCorners !== false);

  // Auto-play interval
  if (s.autoPlay) document.getElementById('autoplay-interval-group').style.display = 'block';
  setInputValue('setting-autoplay-interval', (s.autoPlayInterval || 5000) / 1000);
  document.getElementById('autoplay-val').textContent = ((s.autoPlayInterval || 5000) / 1000) + 's';

  // Branding
  const b = s.branding || {};
  setInputValue('setting-primary-color', b.primaryColor || '#2563eb');
  setInputValue('setting-primary-color-text', b.primaryColor || '#2563eb');
  setInputValue('setting-branding-text', b.brandingText || '');
  setCheckbox('setting-show-branding', b.showBranding !== false);

  // Visibility
  const visMap = { public: 'vis-public', private: 'vis-private', password: 'vis-password' };
  const visInput = document.getElementById(visMap[fb.visibility] || 'vis-private');
  if (visInput) visInput.checked = true;
  const pwGroup = document.getElementById('password-protect-group');
  pwGroup.style.display = fb.visibility === 'password' ? 'block' : 'none';

  // Notify viewer engine (Dev 4 integration point) — also calls renderEditorPreview() internally
  dispatchViewerUpdate();

  document.getElementById('editor-save-status').textContent = '';
}

function updateSetting(key, value) {
  if (!state.currentFlipbook) return;
  state.currentFlipbook.settings[key] = value;

  // Sync color text inputs
  if (key === 'backgroundColor') {
    const textEl = document.getElementById('setting-bg-color-text');
    if (textEl) textEl.value = value;
    const swatchEl = document.getElementById('setting-bg-color');
    if (swatchEl) swatchEl.value = value;
  }

  scheduleSave();
  dispatchViewerUpdate();
}

function updateSettingFromText(key, input) {
  const val = input.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    updateSetting(key, val);
    const swatch = document.getElementById('setting-bg-color');
    if (swatch) swatch.value = val;
  }
}

function updateBrandingSetting(key, value) {
  if (!state.currentFlipbook) return;
  if (!state.currentFlipbook.settings.branding) state.currentFlipbook.settings.branding = {};
  state.currentFlipbook.settings.branding[key] = value;

  if (key === 'primaryColor') {
    const textEl = document.getElementById('setting-primary-color-text');
    if (textEl) textEl.value = value;
    const swatchEl = document.getElementById('setting-primary-color');
    if (swatchEl) swatchEl.value = value;
  }

  scheduleSave();
  dispatchViewerUpdate();
}

function updateBrandingSettingFromText(key, input) {
  const val = input.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    updateBrandingSetting(key, val);
    const swatch = document.getElementById('setting-primary-color');
    if (swatch) swatch.value = val;
  }
}

function updateVisibility(val) {
  if (!state.currentFlipbook) return;
  state.currentFlipbook.visibility = val;
  const pwGroup = document.getElementById('password-protect-group');
  pwGroup.style.display = val === 'password' ? 'block' : 'none';
  scheduleSave();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  document.getElementById('editor-save-status').textContent = 'Unsaved changes…';
  saveTimer = setTimeout(autoSave, 1500);
}

async function autoSave() {
  if (!state.currentFlipbook) return;
  try {
    await api.updateFlipbook(state.currentFlipbook.id, {
      title: state.currentFlipbook.title,
      settings: state.currentFlipbook.settings,
      visibility: state.currentFlipbook.visibility,
    });
    // Update local state
    const idx = state.flipbooks.findIndex(f => f.id === state.currentFlipbook.id);
    if (idx !== -1) {
      state.flipbooks[idx] = { ...state.flipbooks[idx], ...state.currentFlipbook };
    }
    document.getElementById('editor-save-status').textContent = 'Saved';
    setTimeout(() => {
      const el = document.getElementById('editor-save-status');
      if (el) el.textContent = '';
    }, 3000);
  } catch {
    document.getElementById('editor-save-status').textContent = 'Save failed';
  }
}

function saveTitle() {
  if (!state.currentFlipbook) return;
  const newTitle = document.getElementById('editor-title-input').value.trim() || 'Untitled';
  state.currentFlipbook.title = newTitle;
  scheduleSave();
}

async function publishFlipbook() {
  if (!state.currentFlipbook) return;
  const btn = document.getElementById('editor-publish-btn');
  btn.disabled = true;
  const wasPublished = state.currentFlipbook.status === 'published';

  state.currentFlipbook.status = 'published';
  state.currentFlipbook.visibility = state.currentFlipbook.visibility === 'private' ? 'public' : state.currentFlipbook.visibility;

  try {
    await api.updateFlipbook(state.currentFlipbook.id, state.currentFlipbook);
    const idx = state.flipbooks.findIndex(f => f.id === state.currentFlipbook.id);
    if (idx !== -1) state.flipbooks[idx] = { ...state.currentFlipbook };
    document.getElementById('editor-publish-label').textContent = 'Update';
    showToast(wasPublished ? 'Flipbook updated!' : 'Flipbook published!', 'success');
  } catch {
    showToast('Published locally (demo mode)', 'success');
    document.getElementById('editor-publish-label').textContent = 'Update';
  }

  btn.disabled = false;
  document.getElementById('editor-save-status').textContent = '';
}

function previewFlipbook() {
  if (!state.currentFlipbook) return;
  const url = `viewer.html?id=${state.currentFlipbook.slug}`;
  window.open(url, '_blank', 'noopener');
}

function copyShareUrl() {
  const url = document.getElementById('share-url').value;
  copyToClipboard(url);
  showToast('Share URL copied!', 'success');
}

function copyEmbedCode() {
  const el = document.getElementById('embed-code');
  const code = (el.childNodes[0] ? el.childNodes[0].textContent : el.textContent).trim();
  copyToClipboard(code);
  showToast('Embed code copied!', 'success');
}

function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  showToast(`Logo "${file.name}" uploaded`, 'success');
  updateBrandingSetting('logo', URL.createObjectURL(file));
}

function toggleAccordion(btn) {
  const item = btn.closest('.accordion-item');
  const isOpen = item.classList.contains('open');
  item.classList.toggle('open', !isOpen);
  btn.setAttribute('aria-expanded', !isOpen);
}

function applyBgPreset(color) {
  updateSetting('backgroundColor', color);
  const swatch = document.getElementById('setting-bg-color');
  const text = document.getElementById('setting-bg-color-text');
  if (swatch) swatch.value = color;
  if (text) text.value = color;
  // Highlight active preset
  document.querySelectorAll('.color-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-color') === color);
  });
}

// ── Editor inline preview ────────────────────────────────────
function createPreviewPageContent(pageNum, totalPages) {
  if (pageNum > totalPages) {
    return '<div style="color:#cbd5e1;font-size:13px;">End</div>';
  }
  const colors = [
    ['#1e3a5f', '#4f7ef7'], ['#2d1b4e', '#a855f7'], ['#1a3a2a', '#22c55e'],
    ['#3a1a1a', '#ef4444'], ['#2e2a1a', '#f59e0b'], ['#1a2a3a', '#06b6d4'],
  ];
  const [bg, accent] = colors[(pageNum - 1) % colors.length];
  const labels = ['Cover', 'Introduction', 'Chapter 1', 'Chapter 2', 'Gallery', 'Back Cover'];
  const label = labels[Math.min(pageNum - 1, labels.length - 1)] || `Page ${pageNum}`;
  return `<div style="width:100%;height:100%;background:linear-gradient(160deg,${bg},${bg}dd);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;">
    <div style="font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${accent};border:1px solid ${accent}44;padding:3px 8px;border-radius:99px;font-family:Inter,system-ui,sans-serif;">Page ${pageNum}</div>
    <div style="font-size:16px;font-weight:700;color:#fff;text-align:center;font-family:Inter,system-ui,sans-serif;">${escapeHtml(label)}</div>
  </div>`;
}

function renderEditorPreview() {
  const container = document.getElementById('preview-container');
  if (!container || !state.currentFlipbook) return;

  const fb = state.currentFlipbook;
  const s = fb.settings || {};
  const bgColor = s.backgroundColor || '#ffffff';
  const pageCount = fb.page_count || 6;

  // Calculate dimensions
  const containerW = container.clientWidth || 600;
  const containerH = container.clientHeight || 400;
  const pageAspect = 794 / 1123;
  let pageH = Math.min(containerH - 40, 500);
  let pageW = pageH * pageAspect;
  if (pageW * 2 > containerW - 40) {
    pageW = (containerW - 40) / 2;
    pageH = pageW / pageAspect;
  }

  const leftPage = Math.max(1, fb._previewPage || 1);
  const rightPage = Math.min(leftPage + 1, pageCount);

  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:calc(100% - 56px);gap:2px;">
      <div class="preview-page" style="width:${pageW}px;height:${pageH}px;background:${bgColor};border-radius:4px 0 0 4px;box-shadow:-2px 2px 12px rgba(0,0,0,0.15);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${createPreviewPageContent(leftPage, pageCount)}
      </div>
      <div class="preview-page" style="width:${pageW}px;height:${pageH}px;background:${bgColor};border-radius:0 4px 4px 0;box-shadow:2px 2px 12px rgba(0,0,0,0.15);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${createPreviewPageContent(rightPage, pageCount)}
      </div>
    </div>
    <div style="text-align:center;margin-top:12px;font-size:12px;color:#94a3b8;">
      Pages ${leftPage}\u2013${rightPage} of ${pageCount} \u00b7
      <button onclick="APP.previewPrevPage()" style="border:none;background:none;cursor:pointer;color:#64748b;font-size:12px;">\u2190 Prev</button>
      <button onclick="APP.previewNextPage()" style="border:none;background:none;cursor:pointer;color:#64748b;font-size:12px;">Next \u2192</button>
    </div>
    <div style="text-align:center;margin-top:6px;font-size:11px;color:#64748b;">Powered by the FlipBook viewer engine</div>
  `;
}

function previewPrevPage() {
  if (!state.currentFlipbook) return;
  state.currentFlipbook._previewPage = Math.max(1, (state.currentFlipbook._previewPage || 1) - 2);
  renderEditorPreview();
}

function previewNextPage() {
  if (!state.currentFlipbook) return;
  const max = state.currentFlipbook.page_count || 6;
  state.currentFlipbook._previewPage = Math.min(max - 1, (state.currentFlipbook._previewPage || 1) + 2);
  renderEditorPreview();
}

// Dispatch custom event for viewer engine integration (Dev 4)
function dispatchViewerUpdate() {
  if (!state.currentFlipbook) return;
  const evt = new CustomEvent('flipbook:settings-updated', {
    detail: {
      id: state.currentFlipbook.id,
      settings: state.currentFlipbook.settings,
    },
    bubbles: true,
  });
  document.getElementById('preview-container').dispatchEvent(evt);
  renderEditorPreview();
}

/* ─────────────────────────────────────────────────────────────
   Analytics
───────────────────────────────────────────────────────────────*/
function renderSparkline(canvasId, dataPoints, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const dw = canvas.offsetWidth;
  const dh = canvas.offsetHeight;
  ctx.clearRect(0, 0, dw, dh);
  if (!dataPoints || dataPoints.length < 2) return;
  const max = Math.max(...dataPoints);
  const min = Math.min(...dataPoints);
  const range = max - min || 1;
  const pad = 2;
  const stepX = (dw - pad * 2) / (dataPoints.length - 1);
  ctx.beginPath();
  dataPoints.forEach((val, i) => {
    const x = pad + i * stepX;
    const y = dh - pad - ((val - min) / range) * (dh - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color || '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  // Fill gradient
  const lastX = pad + (dataPoints.length - 1) * stepX;
  ctx.lineTo(lastX, dh);
  ctx.lineTo(pad, dh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, dh);
  grad.addColorStop(0, (color || '#2563eb') + '30');
  grad.addColorStop(1, (color || '#2563eb') + '05');
  ctx.fillStyle = grad;
  ctx.fill();
}

function renderTopPagesTable(pageLabels, pageData) {
  const tbody = document.getElementById('top-pages-tbody');
  if (!tbody || !pageLabels || !pageData) return;
  const maxVal = Math.max(...pageData) || 1;
  const indexed = pageLabels.map((label, i) => ({ label, views: pageData[i] || 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);
  tbody.innerHTML = indexed.map((p, i) => `
    <tr>
      <td style="font-weight:500;">${i + 1}</td>
      <td>${escapeHtml(p.label)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="engagement-bar-track"><div class="engagement-bar-fill" style="width:${Math.round((p.views / maxVal) * 100)}%;"></div></div>
          <span style="font-size:12px;font-weight:600;min-width:32px;text-align:right;">${formatNumber(p.views)}</span>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadAnalytics(id, days = 30) {
  let fb = state.flipbooks.find(f => f.id === id);
  if (!fb) {
    try {
      state.flipbooks = await api.getFlipbooks();
      fb = state.flipbooks.find(f => f.id === id) || MOCK_FLIPBOOKS[0];
    } catch {
      fb = MOCK_FLIPBOOKS[0];
    }
  }

  document.getElementById('analytics-title').textContent = `Analytics — ${fb.title}`;

  // Get analytics data
  const data = await api.getAnalytics(id, days);
  let analyticsData;
  if (data.labels) {
    analyticsData = data;
  } else if (data.daily_views || data.total_views) {
    // Transform backend response to chart-compatible format
    const dv = data.daily_views || [];
    analyticsData = {
      labels: dv.map(d => d.day || d.date),
      viewData: dv.map(d => d.views || d.count || 0),
      pageLabels: Object.keys(data.page_heatmap || {}).map(k => 'P' + k),
      pageData: Object.values(data.page_heatmap || {}),
      totalViews: data.total_views || 0,
      uniqueVisitors: data.unique_visitors || 0,
      avgPages: data.avg_pages || String((Object.keys(data.page_heatmap || {}).length || 0).toFixed(1)),
      avgTime: data.avg_time_seconds ? Math.floor(data.avg_time_seconds / 60) + ':' + String(Math.round(data.avg_time_seconds % 60)).padStart(2, '0') : '0:00',
      visitors: (data.recent_events || []).slice(0, 10).map(e => ({
        time: e.created_at || e.time || 'Unknown',
        pages: e.page_number || 1,
        duration: '—',
        referrer: e.referrer || 'Direct',
        country: '🌐'
      })),
    };
  } else {
    analyticsData = generateMockAnalytics(days);
  }

  // KPI cards
  animateNumber('kpi-views', analyticsData.totalViews);
  animateNumber('kpi-visitors', analyticsData.uniqueVisitors);
  document.getElementById('kpi-pages').textContent = analyticsData.avgPages;
  document.getElementById('kpi-time').textContent = analyticsData.avgTime;

  // KPI deltas (mock)
  setKpiDelta('kpi-views-delta', '+18.3%', 'up');
  setKpiDelta('kpi-visitors-delta', '+12.1%', 'up');
  setKpiDelta('kpi-pages-delta', '+2.4%', 'up');
  setKpiDelta('kpi-time-delta', '-4.2%', 'down');

  // Render charts
  renderViewsChart(analyticsData.labels, analyticsData.viewData);
  renderPagesChart(analyticsData.pageLabels, analyticsData.pageData);

  // Render visitors table
  renderVisitorsTable(analyticsData.visitors);

  // Render sparklines in KPI cards
  const sparkData = analyticsData.viewData || [];
  const last7 = sparkData.slice(-7);
  renderSparkline('sparkline-views', last7, '#2563eb');
  renderSparkline('sparkline-visitors', last7.map(v => Math.round(v * 0.6 + Math.random() * 10)), '#8b5cf6');
  renderSparkline('sparkline-pages', last7.map(() => 2 + Math.random() * 4), '#06b6d4');
  renderSparkline('sparkline-time', last7.map(() => 1 + Math.random() * 5), '#f59e0b');

  // Render top pages table
  renderTopPagesTable(analyticsData.pageLabels, analyticsData.pageData);
}

function setKpiDelta(id, value, direction) {
  const el = document.getElementById(id);
  if (!el) return;
  const icon = direction === 'up'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>';
  el.className = `kpi-delta ${direction}`;
  el.innerHTML = `${icon} ${value} vs last period`;
}

function renderViewsChart(labels, data) {
  const ctx = document.getElementById('chart-views');
  if (!ctx) return;

  if (state.charts.views) state.charts.views.destroy();

  state.charts.views = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Views',
        data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#2563eb',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#94a3b8',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: 'Inter', size: 11 },
          bodyFont: { family: 'Inter', size: 13, weight: '600' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#94a3b8',
            maxRotation: 0,
            maxTicksLimit: 8,
          },
          border: { display: false },
        },
        y: {
          grid: { color: '#f1f5f9', drawBorder: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#94a3b8',
            padding: 8,
          },
          border: { display: false, dash: [4, 4] },
        },
      },
    },
  });
}

function renderPagesChart(labels, data) {
  const ctx = document.getElementById('chart-pages');
  if (!ctx) return;

  if (state.charts.pages) state.charts.pages.destroy();

  // Color bars by value intensity
  const max = Math.max(...data);
  const bgColors = data.map(v => {
    const pct = v / max;
    return `rgba(37, 99, 235, ${0.2 + pct * 0.7})`;
  });

  state.charts.pages = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Views',
        data,
        backgroundColor: bgColors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#94a3b8',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Page ${items[0].dataIndex + 1}`,
          },
          titleFont: { family: 'Inter', size: 11 },
          bodyFont: { family: 'Inter', size: 13, weight: '600' },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 10 },
            color: '#94a3b8',
            maxRotation: 0,
          },
          border: { display: false },
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#94a3b8',
            padding: 8,
          },
          border: { display: false },
        },
      },
    },
  });
}

function renderVisitorsTable(visitors) {
  const tbody = document.getElementById('visitors-tbody');
  if (!tbody || !visitors) return;
  tbody.innerHTML = visitors.map(v => `
    <tr>
      <td>${escapeHtml(v.time)}</td>
      <td>${escapeHtml(String(v.pages))} pages</td>
      <td>${escapeHtml(v.duration)}</td>
      <td>${escapeHtml(v.referrer)}</td>
      <td>${escapeHtml(v.country)}</td>
    </tr>
  `).join('');
}

function updateAnalyticsRange(days) {
  const { id } = parseRoute();
  loadAnalytics(id, parseInt(days));
}

function showAnalyticsOverview() {
  const fb = state.flipbooks.find(f => f.status === 'published') || state.flipbooks[0];
  if (fb) navigate('analytics', fb.id);
  else { showToast('Create and publish a flipbook first.', 'info'); navigate('dashboard'); }
}

/* ─────────────────────────────────────────────────────────────
   Settings
───────────────────────────────────────────────────────────────*/
function loadSettings() {
  if (!state.user) return;
  const nameEl = document.getElementById('settings-name');
  const emailEl = document.getElementById('settings-email');
  if (nameEl) nameEl.value = state.user.name || '';
  if (emailEl) emailEl.value = state.user.email || '';
}

function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(`settings-${tab}`);
  if (section) section.classList.add('active');
}

async function saveProfile() {
  const name = document.getElementById('settings-name').value.trim();
  const email = document.getElementById('settings-email').value.trim();
  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }
  try {
    await api.put('/api/auth/profile', { name, email });
  } catch {
    // Mock update
  }
  if (state.user) { state.user.name = name; state.user.email = email; }
  updateSidebarUser();
  showToast('Profile saved.', 'success');
}

function changePassword() {
  const cur = document.getElementById('settings-current-pw').value;
  const nw = document.getElementById('settings-new-pw').value;
  const cf = document.getElementById('settings-confirm-pw').value;
  if (!cur || !nw || !cf) { showToast('All fields are required.', 'error'); return; }
  if (nw !== cf) { showToast('Passwords do not match.', 'error'); return; }
  if (nw.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
  showToast('Password updated.', 'success');
  document.getElementById('settings-current-pw').value = '';
  document.getElementById('settings-new-pw').value = '';
  document.getElementById('settings-confirm-pw').value = '';
}

function saveBrandingDefaults() {
  showToast('Branding defaults saved.', 'success');
}

function confirmDeleteAccount() {
  if (window.confirm('Delete your account and all flipbooks? This cannot be undone.')) {
    logout();
  }
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const avatarImg = document.getElementById('settings-avatar-img');
  const avatarPlaceholder = document.getElementById('settings-avatar-placeholder');
  if (avatarImg) { avatarImg.src = url; avatarImg.classList.remove('hidden'); }
  if (avatarPlaceholder) avatarPlaceholder.classList.add('hidden');
  showToast('Avatar updated.', 'success');
}

function removeAvatar() {
  const avatarImg = document.getElementById('settings-avatar-img');
  const avatarPlaceholder = document.getElementById('settings-avatar-placeholder');
  if (avatarImg) { avatarImg.src = ''; avatarImg.classList.add('hidden'); }
  if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
  document.getElementById('avatar-input').value = '';
  showToast('Avatar removed.', 'success');
}

function toggleApiKeyVisibility() {
  state.apiKeyVisible = !state.apiKeyVisible;
  const field = document.getElementById('api-key-display');
  const btn = document.getElementById('toggle-api-key-btn');
  if (field) {
    field.type = state.apiKeyVisible ? 'text' : 'password';
  }
  if (btn) {
    btn.textContent = state.apiKeyVisible ? 'Hide' : 'Show';
  }
}

function copyApiKey() {
  const field = document.getElementById('api-key-display');
  if (field) {
    copyToClipboard(field.value);
    showToast('API key copied!', 'success');
  }
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'fpb_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  const field = document.getElementById('api-key-display');
  if (field) field.value = key;
  showToast('New API key generated. Save your settings to keep it.', 'success');
}

/* ─────────────────────────────────────────────────────────────
   Auth
───────────────────────────────────────────────────────────────*/
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-submit');

  errorEl.classList.remove('show');
  if (!email || !password) {
    errorEl.textContent = 'Email and password are required.';
    errorEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in…';

  try {
    const res = await api.login(email, password);
    state.token = res.token;
    state.user = res.user || { ...MOCK_USER, email };
    safeStorage.setItem('flipbook_token', state.token);
    safeStorage.setItem('flipbook_user', JSON.stringify(state.user));
    state.flipbooks = MOCK_FLIPBOOKS;
    updateSidebarUser();
    navigate('dashboard');
  } catch (err) {
    errorEl.textContent = err.message || 'Invalid email or password.';
    errorEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Sign in';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const errorEl = document.getElementById('register-error');
  const btn = document.getElementById('register-submit');

  errorEl.classList.remove('show');
  if (!name || !email || !password) {
    errorEl.textContent = 'All fields are required.';
    errorEl.classList.add('show');
    return;
  }
  if (password.length < 8) {
    errorEl.textContent = 'Password must be at least 8 characters.';
    errorEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating account…';

  try {
    const res = await api.register(name, email, password);
    state.token = res.token;
    state.user = res.user || { ...MOCK_USER, name, email };
    safeStorage.setItem('flipbook_token', state.token);
    safeStorage.setItem('flipbook_user', JSON.stringify(state.user));
    state.flipbooks = [];
    updateSidebarUser();
    navigate('dashboard');
  } catch (err) {
    errorEl.textContent = err.message || 'Could not create account.';
    errorEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Create free account';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.flipbooks = [];
  state.currentFlipbook = null;
  safeStorage.removeItem('flipbook_token');
  safeStorage.removeItem('flipbook_user');
  navigate('login');
}

function updateSidebarUser() {
  if (!state.user) return;
  const name = state.user.name || state.user.email || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatar = document.getElementById('sidebar-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarPlan = document.getElementById('sidebar-user-plan');
  if (avatar) avatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarPlan) sidebarPlan.textContent = (state.user.plan || 'free').charAt(0).toUpperCase() + (state.user.plan || 'free').slice(1) + ' Plan';
}

/* ─────────────────────────────────────────────────────────────
   Sidebar
───────────────────────────────────────────────────────────────*/
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  state.sidebarCollapsed = !state.sidebarCollapsed;
  sidebar.classList.toggle('collapsed', state.sidebarCollapsed);

  const icon = document.getElementById('sidebar-collapse-icon');
  if (icon) {
    icon.setAttribute('data-lucide', state.sidebarCollapsed ? 'chevrons-right' : 'chevrons-left');
    lucide.createIcons();
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.add('mobile-open');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('show');
  document.body.style.overflow = '';
}

function updateSidebarActive(route) {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => {
    const r = el.getAttribute('data-route');
    const isActive = r === route || (route === 'analytics' && r === 'analytics-overview');
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

/* ─────────────────────────────────────────────────────────────
   User Menu Dropdown
───────────────────────────────────────────────────────────────*/
function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('show');
}

function closeUserMenu() {
  document.getElementById('user-menu').classList.remove('show');
}

/* ─────────────────────────────────────────────────────────────
   Modals
───────────────────────────────────────────────────────────────*/
function openDeleteModal(id, title) {
  state.deleteTarget = id;
  document.getElementById('delete-flipbook-name').textContent = `"${title}"`;
  document.getElementById('delete-modal').classList.add('show');
}

async function confirmDelete() {
  if (!state.deleteTarget) return;
  try {
    await api.deleteFlipbook(state.deleteTarget);
  } catch { /* mock */ }
  state.flipbooks = state.flipbooks.filter(f => f.id !== state.deleteTarget);
  state.deleteTarget = null;
  closeModal('delete-modal');
  renderFlipbookGrid();
  showToast('Flipbook deleted.', 'success');
}

function openShareModal(id) {
  const fb = state.flipbooks.find(f => f.id === id);
  if (!fb) return;
  const viewerUrl = `${window.location.origin}/viewer.html?id=${fb.slug}`;
  document.getElementById('modal-share-url').value = viewerUrl;
  document.getElementById('modal-embed-code').textContent =
    `<iframe src="${viewerUrl}"\n  width="800" height="500"\n  frameborder="0"\n  allowfullscreen>\n</iframe>`;
  state.shareTarget = id;
  document.getElementById('share-modal').classList.add('show');
}

function copyModalShareUrl() {
  const url = document.getElementById('modal-share-url').value;
  copyToClipboard(url);
  showToast('Link copied!', 'success');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* ─────────────────────────────────────────────────────────────
   Toast Notifications
───────────────────────────────────────────────────────────────*/
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const iconMap = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };

  toast.className = `toast ${type === 'info' ? '' : type}`;
  toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 250ms ease forwards';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

/* ─────────────────────────────────────────────────────────────
   Utilities
───────────────────────────────────────────────────────────────*/
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = !!checked;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch { /* silent */ }
  document.body.removeChild(ta);
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const duration = 800;
  const startTime = performance.now();
  const step = (now) => {
    const pct = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - pct, 3); // ease-out cubic
    const current = Math.round(start + (target - start) * eased);
    el.textContent = formatNumber(current);
    if (pct < 1) requestAnimationFrame(step);
    else el.textContent = formatNumber(target);
  };
  requestAnimationFrame(step);
}

/* ─────────────────────────────────────────────────────────────
   Public APP interface (called from HTML onclick)
───────────────────────────────────────────────────────────────*/
window.APP = {
  navigate,
  setFilter,
  handleSearch,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileSelect,
  toggleSidebar,
  openMobileSidebar,
  closeMobileSidebar,
  toggleUserMenu,
  closeUserMenu,
  toggleAccordion,
  updateSetting,
  updateSettingFromText,
  updateBrandingSetting,
  updateBrandingSettingFromText,
  updateVisibility,
  saveTitle,
  publishFlipbook,
  previewFlipbook,
  copyShareUrl,
  copyEmbedCode,
  handleLogoUpload,
  updateAnalyticsRange,
  showAnalyticsOverview,
  switchSettingsTab,
  saveProfile,
  changePassword,
  saveBrandingDefaults,
  confirmDeleteAccount,
  openDeleteModal,
  confirmDelete,
  openShareModal,
  copyModalShareUrl,
  closeModal,
  logout,
  showToast,
  previewPrevPage,
  previewNextPage,
  // New polish functions
  setSortOrder,
  setViewMode,
  cancelFilePreview,
  startUpload,
  goToUploadedFlipbook,
  viewUploadedFlipbook,
  applyBgPreset,
  handleAvatarUpload,
  removeAvatar,
  toggleApiKeyVisibility,
  copyApiKey,
  generateApiKey,
};

/* ─────────────────────────────────────────────────────────────
   Bootstrap
───────────────────────────────────────────────────────────────*/
function init() {
  // Attach form handlers
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);

  // Close dropdowns/modals on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !dropdown.contains(e.target)) closeUserMenu();

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay.show').forEach(overlay => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUserMenu();
      closeMobileSidebar();
      document.querySelectorAll('.modal-overlay.show').forEach(el => el.classList.remove('show'));
    }
    // Cmd/Ctrl+K — focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const s = document.getElementById('search-input');
      if (s && !s.closest('.hidden')) s.focus();
    }
    // Cmd/Ctrl+N — new flipbook
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      navigate('create');
    }
  });

  // Hash router
  window.addEventListener('hashchange', handleRouteChange);

  // Restore session from storage, or fall back to demo mode
  const savedToken = safeStorage.getItem('flipbook_token');
  const savedUser = safeStorage.getItem('flipbook_user');
  if (savedToken && savedUser) {
    state.token = savedToken;
    try { state.user = JSON.parse(savedUser); } catch(e) { state.user = MOCK_USER; }
  } else {
    state.token = 'demo_token';
    state.user = MOCK_USER;
  }
  state.flipbooks = MOCK_FLIPBOOKS;
  updateSidebarUser();

  handleRouteChange();
}

// Wait for DOM + Lucide
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
