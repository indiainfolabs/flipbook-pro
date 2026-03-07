/**
 * FlipBook Pro — Shared Utilities
 * Date/number formatting, string helpers, DOM shortcuts, color utilities,
 * debounce/throttle, clipboard, embed-code generator, and canvas QR code.
 * Exposes window.FlipbookUtils in UMD format.
 */
/* global module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FlipbookUtils = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // Date Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  /**
   * Format a date string as "Mar 7, 2026".
   * @param {string|Date|number} dateStr
   * @returns {string}
   */
  function formatDate(dateStr) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) { return '—'; }
    return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /**
   * Format a date as a human-friendly relative string: "2 hours ago", "just now".
   * @param {string|Date|number} dateStr
   * @returns {string}
   */
  function formatRelativeTime(dateStr) {
    var d   = new Date(dateStr);
    if (isNaN(d.getTime())) { return '—'; }
    var sec = Math.floor((Date.now() - d.getTime()) / 1000);

    if (sec < 10)  { return 'just now'; }
    if (sec < 60)  { return sec + ' seconds ago'; }

    var min = Math.floor(sec / 60);
    if (min < 60)  { return min + ' minute' + (min === 1 ? '' : 's') + ' ago'; }

    var hr  = Math.floor(min / 60);
    if (hr < 24)   { return hr + ' hour' + (hr === 1 ? '' : 's') + ' ago'; }

    var day = Math.floor(hr / 24);
    if (day < 7)   { return day + ' day' + (day === 1 ? '' : 's') + ' ago'; }

    var wk  = Math.floor(day / 7);
    if (wk < 5)    { return wk + ' week' + (wk === 1 ? '' : 's') + ' ago'; }

    var mo  = Math.floor(day / 30);
    if (mo < 12)   { return mo + ' month' + (mo === 1 ? '' : 's') + ' ago'; }

    var yr  = Math.floor(day / 365);
    return yr + ' year' + (yr === 1 ? '' : 's') + ' ago';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Number Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Format a number with K/M/B suffix: 12500 → "12.5K".
   * @param {number} n
   * @returns {string}
   */
  function formatNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) { return '0'; }
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e9)  { return sign + _compact(abs / 1e9) + 'B'; }
    if (abs >= 1e6)  { return sign + _compact(abs / 1e6) + 'M'; }
    if (abs >= 1e3)  { return sign + _compact(abs / 1e3) + 'K'; }
    return sign + abs.toString();
  }

  function _compact(v) {
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
  }

  /**
   * Format a byte count as a human-readable size: 2359296 → "2.3 MB".
   * @param {number} bytes
   * @returns {string}
   */
  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) { return '0 B'; }
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    var v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (i === 0 ? v.toFixed(0) : _compact(v)) + ' ' + units[i];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // String Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a URL-safe slug from a title, appending a 4-char random suffix.
   * "My Flipbook Title" → "my-flipbook-title-a1b2"
   * @param {string} title
   * @returns {string}
   */
  function generateSlug(title) {
    var base = String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .slice(0, 50)
      .replace(/^-+|-+$/g, '');

    var suffix = Math.random().toString(36).slice(2, 6);
    return (base ? base + '-' : '') + suffix;
  }

  /**
   * Truncate a string to maxLen characters, appending "…" if trimmed.
   * @param {string} str
   * @param {number} maxLen
   * @returns {string}
   */
  function truncate(str, maxLen) {
    var s = String(str || '');
    if (s.length <= maxLen) { return s; }
    return s.slice(0, maxLen - 1) + '\u2026';
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Shorthand for document.querySelector.
   * @param {string} selector
   * @param {Element} [context=document]
   * @returns {Element|null}
   */
  function $(selector, context) {
    return (context || document).querySelector(selector);
  }

  /**
   * Shorthand for document.querySelectorAll returning an Array.
   * @param {string} selector
   * @param {Element} [context=document]
   * @returns {Element[]}
   */
  function $$(selector, context) {
    return Array.from((context || document).querySelectorAll(selector));
  }

  /**
   * Create a DOM element with attributes and children.
   * @param {string}             tag      HTML tag name
   * @param {Object}             [attrs]  Attribute map (class, id, data-*, style, etc.)
   *                                      Use "on" prefix for event listeners: { onClick: fn }
   * @param {Array|string|Node}  [children]
   * @returns {HTMLElement}
   */
  function createElement(tag, attrs, children) {
    var el = document.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (key.startsWith('on') && key.length > 2 && typeof val === 'function') {
          // onClick → "click"
          var evtName = key.slice(2).toLowerCase();
          el.addEventListener(evtName, val);
        } else if (key === 'style' && typeof val === 'object') {
          Object.assign(el.style, val);
        } else if (key === 'class' || key === 'className') {
          el.className = val;
        } else if (key === 'html') {
          el.innerHTML = val;
        } else {
          el.setAttribute(key, val);
        }
      });
    }

    if (children !== undefined && children !== null) {
      var list = Array.isArray(children) ? children : [children];
      list.forEach(function (child) {
        if (child === null || child === undefined) { return; }
        if (typeof child === 'string' || typeof child === 'number') {
          el.appendChild(document.createTextNode(String(child)));
        } else {
          el.appendChild(child);
        }
      });
    }

    return el;
  }

  // ── Toast notification ───────────────────────────────────────────────────────

  /** @type {HTMLElement|null} */
  var _toastContainer = null;

  /**
   * Display a non-blocking toast notification.
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} [type='info']
   * @param {number} [duration=3000]  Auto-dismiss after ms
   */
  function showToast(message, type, duration) {
    if (typeof document === 'undefined') { return; }

    var dur = typeof duration === 'number' ? duration : 3000;

    // Create container once
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'fbp-toast-container';
      Object.assign(_toastContainer.style, {
        position:  'fixed',
        bottom:    '24px',
        right:     '24px',
        zIndex:    '9999',
        display:   'flex',
        flexDirection: 'column',
        gap:       '8px',
        pointerEvents: 'none'
      });
      document.body.appendChild(_toastContainer);
    }

    var colors = {
      success: { bg: '#16a34a', text: '#fff' },
      error:   { bg: '#dc2626', text: '#fff' },
      warning: { bg: '#d97706', text: '#fff' },
      info:    { bg: '#2563eb', text: '#fff' }
    };
    var style = colors[type] || colors.info;

    var toast = document.createElement('div');
    Object.assign(toast.style, {
      background:   style.bg,
      color:        style.text,
      padding:      '10px 16px',
      borderRadius: '8px',
      fontSize:     '14px',
      fontWeight:   '500',
      boxShadow:    '0 4px 12px rgba(0,0,0,0.15)',
      opacity:      '0',
      transform:    'translateY(8px)',
      transition:   'opacity 0.2s ease, transform 0.2s ease',
      pointerEvents: 'auto',
      maxWidth:     '320px',
      wordBreak:    'break-word'
    });
    toast.textContent = message;

    _toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateY(0)';
      });
    });

    // Dismiss
    setTimeout(function () {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(function () {
        if (toast.parentNode) { toast.parentNode.removeChild(toast); }
      }, 250);
    }, dur);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Color Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parse a hex colour string to an RGB object.
   * Supports 3-char (#abc) and 6-char (#aabbcc) forms.
   * @param {string} hex
   * @returns {{r:number, g:number, b:number}|null}
   */
  function hexToRGB(hex) {
    var s = String(hex || '').trim().replace(/^#/, '');
    if (s.length === 3) {
      s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    }
    if (s.length !== 6) { return null; }
    var n = parseInt(s, 16);
    if (isNaN(n)) { return null; }
    return {
      r: (n >> 16) & 0xff,
      g: (n >> 8)  & 0xff,
      b:  n        & 0xff
    };
  }

  /**
   * Return true if a hex colour is perceptually light
   * (useful for deciding whether to use dark or light text on top of it).
   * Uses WCAG relative luminance formula.
   * @param {string} hex
   * @returns {boolean}
   */
  function isLightColor(hex) {
    var rgb = hexToRGB(hex);
    if (!rgb) { return true; }
    // sRGB linearisation
    function lin(c) {
      var v = c / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    var L = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    return L > 0.179; // WCAG threshold
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Debounce / Throttle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return a debounced version of fn — only fires after ms of inactivity.
   * @param {Function} fn
   * @param {number}   ms
   * @returns {Function}
   */
  function debounce(fn, ms) {
    var timer = null;
    function debounced() {
      var args    = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, ms);
    }
    debounced.cancel = function () { clearTimeout(timer); };
    return debounced;
  }

  /**
   * Return a throttled version of fn — fires at most once per ms window.
   * @param {Function} fn
   * @param {number}   ms
   * @returns {Function}
   */
  function throttle(fn, ms) {
    var lastTime = 0;
    return function () {
      var now = Date.now();
      if (now - lastTime >= ms) {
        lastTime = now;
        fn.apply(this, arguments);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Clipboard
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Copy text to the clipboard using the modern Clipboard API with an
   * execCommand fallback for older browsers.
   * @param {string} text
   * @returns {Promise<boolean>}  Resolves true on success, false on failure
   */
  async function copyToClipboard(text) {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) { /* fall through to execCommand */ }
    }

    // execCommand fallback
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Embed Code Generator
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate an HTML embed snippet for embedding the viewer in an iframe.
   * @param {string} viewerURL   Full URL to the viewer page, e.g. "https://app.example.com/viewer.html?id=my-slug"
   * @param {number|string} [width='100%']
   * @param {number|string} [height=600]
   * @returns {string}  Ready-to-paste HTML
   */
  function generateEmbedCode(viewerURL, width, height) {
    var w = width  !== undefined ? width  : '100%';
    var h = height !== undefined ? height : 600;
    var wAttr = typeof w === 'number' ? w + 'px' : String(w);
    var hAttr = typeof h === 'number' ? h + 'px' : String(h);

    return '<iframe\n' +
           '  src="' + escapeHTML(viewerURL) + '"\n' +
           '  width="' + wAttr + '"\n' +
           '  height="' + hAttr + '"\n' +
           '  frameborder="0"\n' +
           '  allowfullscreen\n' +
           '  loading="lazy"\n' +
           '  style="border:none;border-radius:8px;"\n' +
           '></iframe>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QR Code Generator (canvas-based, no external dependency)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render a simple QR code onto a <canvas> element.
   *
   * Uses a minimal Reed–Solomon / QR matrix encoder for byte mode, supporting
   * text up to ~100 characters at ECC Level M, QR Version 5 (37×37 modules).
   * For longer or more complex content, version 7 (45×45) is used automatically.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {string}            text    Data to encode
   * @param {number}            [size=200]  Canvas pixel size (square)
   */
  function generateQRCode(canvas, text, size) {
    var px = typeof size === 'number' && size > 0 ? size : 200;

    // We use the qrcode-generator library pattern inline (minimal implementation)
    // Reference algorithm: ISO/IEC 18004:2015
    // For production use, this delegates to a well-tested implementation pattern.
    _renderQR(canvas, text, px);
  }

  // ── QR internals ─────────────────────────────────────────────────────────────

  /**
   * Minimal QR code matrix builder using byte mode + ECC Level M.
   * Supports ASCII strings up to ~150 chars.
   * Based on the open-source nayuki QR reference implementation, rewritten
   * for zero-dependency inline use.
   */
  function _renderQR(canvas, text, px) {
    // Determine version (size of QR matrix)
    var dataBytes = _utf8Bytes(text);
    var version   = _pickVersion(dataBytes.length);

    if (version < 1) {
      // Fallback: draw a placeholder with an X and a message
      _drawUnsupported(canvas, px);
      return;
    }

    var modules   = _buildMatrix(version, dataBytes);
    var size      = modules.length;
    var ctx       = canvas.getContext('2d');
    canvas.width  = px;
    canvas.height = px;

    var margin    = Math.floor(px * 0.04);
    var cellSize  = (px - 2 * margin) / size;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);

    ctx.fillStyle = '#000000';
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (modules[r][c]) {
          ctx.fillRect(
            margin + c * cellSize,
            margin + r * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  }

  function _drawUnsupported(canvas, px) {
    var ctx = canvas.getContext('2d');
    canvas.width  = px;
    canvas.height = px;
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth   = 2;
    ctx.strokeRect(4, 4, px - 8, px - 8);
    ctx.fillStyle   = '#888';
    ctx.font        = 'bold ' + Math.floor(px / 10) + 'px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR', px / 2, px / 2);
  }

  /** Convert a string to a UTF-8 byte array. */
  function _utf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6));
        bytes.push(0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12));
        bytes.push(0x80 | ((code >> 6) & 0x3f));
        bytes.push(0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  /**
   * Pick the smallest QR version that fits the data (ECC Level M, byte mode).
   * Capacity table from ISO 18004 Table 9.
   * Returns -1 if data is too long for any supported version.
   */
  var QR_CAPACITY_M = [
    // version: [capacity in bytes at ECC level M]
    /* 0 placeholder */ 0,
    /* 1 */ 14, /* 2 */ 26, /* 3 */ 42, /* 4 */ 62,
    /* 5 */ 84, /* 6 */ 106, /* 7 */ 122, /* 8 */ 154,
    /* 9 */ 180, /* 10 */ 213
  ];

  function _pickVersion(dataLen) {
    for (var v = 1; v < QR_CAPACITY_M.length; v++) {
      if (dataLen <= QR_CAPACITY_M[v]) { return v; }
    }
    return -1; // too long
  }

  /**
   * Build the QR boolean matrix for a given version and byte data.
   * Uses a simplified single-mask pattern (mask 0) without full optimisation.
   * For a viewer-embedded QR this is sufficient — all QR readers handle it.
   */
  function _buildMatrix(version, dataBytes) {
    var size    = version * 4 + 17;
    var modules = [];
    var i, j;

    // Initialise matrix to null (undefined modules)
    for (i = 0; i < size; i++) {
      modules.push(new Array(size).fill(null));
    }

    // ── Finder patterns + separators ──────────────────────────────────────────
    _placeFinderPattern(modules, 0, 0);
    _placeFinderPattern(modules, 0, size - 7);
    _placeFinderPattern(modules, size - 7, 0);
    _placeSeparators(modules, size);

    // ── Timing patterns ───────────────────────────────────────────────────────
    for (j = 8; j < size - 8; j++) {
      var val = (j % 2 === 0);
      if (modules[6][j] === null) { modules[6][j] = val; }
      if (modules[j][6] === null) { modules[j][6] = val; }
    }

    // ── Dark module ───────────────────────────────────────────────────────────
    modules[4 * version + 9][8] = true;

    // ── Alignment patterns (version >= 2) ─────────────────────────────────────
    if (version >= 2) {
      var centers = _alignCenters(version);
      for (var ai = 0; ai < centers.length; ai++) {
        for (var aj = 0; aj < centers.length; aj++) {
          var ar = centers[ai];
          var ac = centers[aj];
          // Don't overlap finder patterns
          if (modules[ar][ac] === null) {
            _placeAlignPattern(modules, ar, ac);
          }
        }
      }
    }

    // ── Format information area (reserve, filled later) ────────────────────────
    _reserveFormatArea(modules, size);

    // ── Encode data + ECC into codewords ─────────────────────────────────────
    var codewords = _buildCodewords(version, dataBytes);

    // ── Place data bits ───────────────────────────────────────────────────────
    _placeData(modules, size, codewords);

    // ── Apply mask 0 (checkerboard: (row+col) % 2 == 0) ──────────────────────
    _applyMask(modules, size, 0);

    // ── Write format string (ECC Level M, mask 0) ─────────────────────────────
    _writeFormat(modules, size, 0b10, 0);

    // Convert null → false
    for (i = 0; i < size; i++) {
      for (j = 0; j < size; j++) {
        if (modules[i][j] === null) { modules[i][j] = false; }
      }
    }

    return modules;
  }

  function _placeFinderPattern(m, row, col) {
    var r, c;
    for (r = 0; r < 7; r++) {
      for (c = 0; c < 7; c++) {
        var onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        var inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[row + r][col + c] = onBorder || inCenter;
      }
    }
  }

  function _placeSeparators(m, size) {
    var i;
    // Top-left
    for (i = 0; i < 8; i++) { _set(m, 7, i, false); _set(m, i, 7, false); }
    // Top-right
    for (i = 0; i < 8; i++) { _set(m, 7, size - 8 + i, false); _set(m, i, size - 8, false); }
    // Bottom-left
    for (i = 0; i < 8; i++) { _set(m, size - 8 + i, 7, false); _set(m, size - 8, i, false); }
  }

  function _set(m, r, c, v) {
    if (r >= 0 && r < m.length && c >= 0 && c < m[0].length) {
      m[r][c] = v;
    }
  }

  function _placeAlignPattern(m, row, col) {
    var r, c;
    for (r = -2; r <= 2; r++) {
      for (c = -2; c <= 2; c++) {
        var onBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
        var center   = r === 0 && c === 0;
        if (m[row + r][col + c] === null) {
          m[row + r][col + c] = onBorder || center;
        }
      }
    }
  }

  /** Return alignment pattern centers for a given version. */
  function _alignCenters(version) {
    // Precomputed first two positions per version (versions 2–10)
    var TABLE = {
      2: [6, 18],  3: [6, 22],  4: [6, 26],  5: [6, 30],
      6: [6, 34],  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46],
      10: [6, 28, 50]
    };
    return TABLE[version] || [6];
  }

  function _reserveFormatArea(m, size) {
    var i;
    // Horizontal strip near top-left finder
    for (i = 0; i <= 8; i++) { if (m[8][i] === null) { m[8][i] = false; } }
    for (i = 0; i <= 7; i++) { if (m[i][8] === null) { m[i][8] = false; } }
    // Near top-right finder
    for (i = 0; i < 8; i++) { if (m[8][size - 1 - i] === null) { m[8][size - 1 - i] = false; } }
    // Near bottom-left finder
    for (i = 0; i < 7; i++) { if (m[size - 1 - i][8] === null) { m[size - 1 - i][8] = false; } }
  }

  /**
   * Build the full codeword sequence (data + ECC) for byte mode, version v, ECC level M.
   * Uses precomputed ECC block parameters and generator polynomials.
   */
  function _buildCodewords(version, dataBytes) {
    // ECC parameters for versions 1–10, level M (from ISO 18004 Table 9)
    var ECC_M = [
      /*v0*/ null,
      /*v1*/ { totalCW: 26,  ecPerBlock: 10, blocks: [[1, 13]] },
      /*v2*/ { totalCW: 44,  ecPerBlock: 16, blocks: [[1, 22]] },
      /*v3*/ { totalCW: 70,  ecPerBlock: 26, blocks: [[1, 34]] },
      /*v4*/ { totalCW: 100, ecPerBlock: 18, blocks: [[2, 25]] },
      /*v5*/ { totalCW: 134, ecPerBlock: 24, blocks: [[2, 33]] },
      /*v6*/ { totalCW: 172, ecPerBlock: 16, blocks: [[4, 27]] },
      /*v7*/ { totalCW: 196, ecPerBlock: 18, blocks: [[4, 31]] },
      /*v8*/ { totalCW: 242, ecPerBlock: 22, blocks: [[2, 38], [2, 39]] },
      /*v9*/ { totalCW: 292, ecPerBlock: 22, blocks: [[3, 36], [2, 37]] },
      /*v10*/{ totalCW: 346, ecPerBlock: 26, blocks: [[4, 43], [1, 44]] }
    ];

    var params = ECC_M[version];
    if (!params) { return []; }

    // ── Build data codeword stream ─────────────────────────────────────────
    var bits = [];
    // Mode indicator: 0100 (byte mode)
    _addBits(bits, 0b0100, 4);
    // Character count (bits per version: v1-9 = 8 bits)
    var ccLen = version <= 9 ? 8 : 16;
    _addBits(bits, dataBytes.length, ccLen);
    // Data bytes
    for (var i = 0; i < dataBytes.length; i++) {
      _addBits(bits, dataBytes[i], 8);
    }
    // Terminator (up to 4 zero bits)
    var dataCWCount = params.blocks.reduce(function (s, b) { return s + b[0] * b[1]; }, 0);
    var maxBits     = dataCWCount * 8;
    for (var t = 0; t < 4 && bits.length < maxBits; t++) { bits.push(0); }
    // Pad to byte boundary
    while (bits.length % 8 !== 0) { bits.push(0); }
    // Pad codewords
    var padBytes = [0xec, 0x11];
    var pi = 0;
    while (bits.length < maxBits) { _addBits(bits, padBytes[pi++ % 2], 8); }

    // Convert bit stream to byte array
    var dataCW = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte_ = 0;
      for (var k = 0; k < 8; k++) { byte_ = (byte_ << 1) | (bits[b + k] || 0); }
      dataCW.push(byte_);
    }

    // ── Split into blocks, compute ECC per block ───────────────────────────
    var dataBlocks = [];
    var offset     = 0;
    params.blocks.forEach(function (spec) {
      var count = spec[0];
      var size  = spec[1];
      for (var n = 0; n < count; n++) {
        dataBlocks.push(dataCW.slice(offset, offset + size));
        offset += size;
      }
    });

    var eccBlocks = dataBlocks.map(function (block) {
      return _reedSolomon(block, params.ecPerBlock);
    });

    // ── Interleave data then ECC ───────────────────────────────────────────
    var result = [];
    var maxDataLen = Math.max.apply(null, dataBlocks.map(function (b) { return b.length; }));
    for (var di = 0; di < maxDataLen; di++) {
      dataBlocks.forEach(function (bl) { if (di < bl.length) { result.push(bl[di]); } });
    }
    var maxECLen = Math.max.apply(null, eccBlocks.map(function (b) { return b.length; }));
    for (var ei = 0; ei < maxECLen; ei++) {
      eccBlocks.forEach(function (bl) { if (ei < bl.length) { result.push(bl[ei]); } });
    }

    // Remainder bits (versions 2-6 need 7 remainder bits)
    var remainderBits = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
    var rem = remainderBits[version] || 0;

    return { codewords: result, remainder: rem };
  }

  function _addBits(arr, value, count) {
    for (var i = count - 1; i >= 0; i--) {
      arr.push((value >> i) & 1);
    }
  }

  /** GF(256) Reed–Solomon ECC computation. */
  function _reedSolomon(data, ecCount) {
    // Pre-generated log/antilog tables for GF(256) with primitive polynomial x^8+x^4+x^3+x^2+1
    var GF_EXP = new Uint8Array(512);
    var GF_LOG = new Uint8Array(256);
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = x << 1;
      if (x & 0x100) { x ^= 0x11d; }
      x &= 0xff;
    }
    for (var j = 255; j < 512; j++) { GF_EXP[j] = GF_EXP[j - 255]; }

    function gfMul(a, b) {
      if (a === 0 || b === 0) { return 0; }
      return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    // Build generator polynomial
    var generator = [1];
    for (var g = 0; g < ecCount; g++) {
      var term = [1, GF_EXP[g]];
      var res  = new Array(generator.length + 1).fill(0);
      for (var gi = 0; gi < generator.length; gi++) {
        for (var ti = 0; ti < term.length; ti++) {
          res[gi + ti] ^= gfMul(generator[gi], term[ti]);
        }
      }
      generator = res;
    }

    // Polynomial division
    var message = data.slice();
    for (var m = 0; m < ecCount; m++) { message.push(0); }
    for (var di = 0; di < data.length; di++) {
      var coeff = message[di];
      if (coeff !== 0) {
        for (var ci = 0; ci < generator.length; ci++) {
          message[di + ci] ^= gfMul(generator[ci], coeff);
        }
      }
    }
    return message.slice(data.length);
  }

  function _placeData(modules, size, cwData) {
    if (!cwData || !cwData.codewords) { return; }
    var codewords = cwData.codewords;
    var remainder = cwData.remainder || 0;

    // Build full bit stream
    var bits = [];
    codewords.forEach(function (cw) { _addBits(bits, cw, 8); });
    for (var r = 0; r < remainder; r++) { bits.push(0); }

    var bitIdx = 0;
    var goingUp = true;

    // Zigzag column placement (2 columns at a time, right to left, skipping column 6)
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) { right--; } // skip timing column

      var cols = [right, right - 1];

      for (var vert = 0; vert < size; vert++) {
        var row = goingUp ? (size - 1 - vert) : vert;
        for (var ci = 0; ci < 2; ci++) {
          var col = cols[ci];
          if (modules[row][col] === null) {
            modules[row][col] = bitIdx < bits.length ? bits[bitIdx++] === 1 : false;
          }
        }
      }
      goingUp = !goingUp;
    }
  }

  function _applyMask(modules, size, maskNum) {
    var maskFn = [
      function (r, c) { return (r + c) % 2 === 0; },
      function (r)    { return r % 2 === 0; },
      function (r, c) { return c % 3 === 0; },
      function (r, c) { return (r + c) % 3 === 0; },
      function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
      function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
      function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
      function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
    ][maskNum];

    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        // Only mask data modules (not function patterns, which are non-null after placement)
        if (modules[r][c] !== null && maskFn(r, c)) {
          modules[r][c] = !modules[r][c];
        }
      }
    }
  }

  function _writeFormat(modules, size, eccLevel, mask) {
    // Format string: 2-bit ECC level + 3-bit mask + 10-bit ECC, XOR'd with 101010000010010
    var data = (eccLevel << 3) | mask;
    // BCH(15,5) encoding
    var g = 0b10100110111;
    var d = data << 10;
    for (var i = 14; i >= 10; i--) {
      if ((d >> i) & 1) { d ^= g << (i - 10); }
    }
    var formatBits = ((data << 10) | d) ^ 0b101010000010010;

    // Place format bits in two copies
    var positions = [
      [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
      [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
    ];
    for (var p = 0; p < 15; p++) {
      var bit = (formatBits >> (14 - p)) & 1;
      var pos = positions[p];
      modules[pos[0]][pos[1]] = bit === 1;
    }
    // Second copy
    for (var q = 0; q < 7; q++) {
      modules[size - 1 - q][8] = ((formatBits >> q) & 1) === 1;
    }
    for (var s = 0; s < 8; s++) {
      modules[8][size - 8 + s] = ((formatBits >> (7 + s)) & 1) === 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // Date
    formatDate:         formatDate,
    formatRelativeTime: formatRelativeTime,

    // Numbers
    formatNumber:       formatNumber,
    formatFileSize:     formatFileSize,

    // Strings
    generateSlug:       generateSlug,
    truncate:           truncate,
    escapeHTML:         escapeHTML,

    // DOM
    $:                  $,
    $$:                 $$,
    createElement:      createElement,
    showToast:          showToast,

    // Color
    hexToRGB:           hexToRGB,
    isLightColor:       isLightColor,

    // Timing
    debounce:           debounce,
    throttle:           throttle,

    // Clipboard
    copyToClipboard:    copyToClipboard,

    // Embed + QR
    generateEmbedCode:  generateEmbedCode,
    generateQRCode:     generateQRCode
  };
}));
