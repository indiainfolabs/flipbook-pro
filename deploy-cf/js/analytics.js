/**
 * FlipBook Pro — Analytics Tracking Client
 * Lightweight viewer-side tracker: debounced page views, batched events,
 * heartbeat timer, visitor ID, referrer/UA/screen collection.
 * Exposes window.FlipbookAnalytics in UMD format.
 */
/* global module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FlipbookAnalytics = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  var PAGE_VIEW_DEBOUNCE_MS  = 1500;   // wait 1.5 s before recording a page view
  var HEARTBEAT_INTERVAL_MS  = 30000;  // send time-on-page every 30 s
  var MAX_BATCH_SIZE         = 10;     // flush when queue reaches this size
  var BATCH_FLUSH_INTERVAL_MS = 5000; // flush queue every 5 s regardless of size
  var VISITOR_ID_KEY         = 'fbp_visitor_id';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function now() { return Date.now(); }

  /**
   * Generate a UUID v4 with a fallback for browsers that lack crypto.randomUUID.
   * @returns {string}
   */
  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: manual v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Create a debounced version of fn that fires ms after the last call.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Function}
   */
  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args    = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, ms);
    };
  }

  // ─── FlipbookAnalytics Class ─────────────────────────────────────────────────

  /**
   * @param {string} apiBase      Base URL of the API server, e.g. "http://localhost:8000"
   * @param {string} flipbookId   UUID of the flipbook being viewed
   */
  function FlipbookAnalytics(apiBase, flipbookId) {
    this._apiBase     = (apiBase || '').replace(/\/$/, '');
    this._flipbookId  = flipbookId || '';
    this._visitorId   = null;
    this._queue       = [];          // pending event objects
    this._heartbeatTimer   = null;
    this._batchFlushTimer  = null;
    this._startTime   = null;        // when init() was called
    this._lastPageViewPage = null;   // last page number sent
    this._destroyed   = false;

    // Debounced page-view sender (created in init so it captures visitorId)
    this._debouncedSendPageView = debounce(
      this._sendPageView.bind(this),
      PAGE_VIEW_DEBOUNCE_MS
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Initialise the tracker: generate/retrieve visitor ID, record initial "view" event,
   * start heartbeat and batch-flush timers.
   */
  FlipbookAnalytics.prototype.init = function () {
    if (this._destroyed) { return; }

    this._visitorId = this.getVisitorId();
    this._startTime = now();

    // Fire the "view" event immediately (first visit)
    this._enqueue({
      event_type:  'view',
      page_number: null
    });

    // Start periodic batch flush
    this._batchFlushTimer = setInterval(
      this._flushQueue.bind(this),
      BATCH_FLUSH_INTERVAL_MS
    );

    // Heartbeat: report total time on page every 30 s
    this._heartbeatTimer = setInterval(
      this.trackTimeOnPage.bind(this),
      HEARTBEAT_INTERVAL_MS
    );

    // Flush remaining events before the tab closes
    var self = this;
    window.addEventListener('beforeunload', function () {
      self.trackTimeOnPage();
      self._flushQueue(true); // synchronous sendBeacon fallback
    });
  };

  /**
   * Track a page view. Debounced — rapid flips don't generate events;
   * only sustained views (> 1.5 s) are recorded.
   * @param {number} pageNumber  1-based page number
   */
  FlipbookAnalytics.prototype.trackPageView = function (pageNumber) {
    if (this._destroyed) { return; }
    this._pendingPageView = pageNumber;
    this._debouncedSendPageView(pageNumber);
  };

  /**
   * Track a social share action.
   * @param {string} platform  e.g. "twitter", "facebook", "copy-link"
   */
  FlipbookAnalytics.prototype.trackShare = function (platform) {
    if (this._destroyed) { return; }
    this._enqueue({
      event_type:  'share',
      page_number: null,
      platform:    platform || 'unknown'
    });
  };

  /**
   * Track a download action.
   */
  FlipbookAnalytics.prototype.trackDownload = function () {
    if (this._destroyed) { return; }
    this._enqueue({
      event_type:  'download',
      page_number: null
    });
  };

  /**
   * Track fullscreen toggle.
   * @param {boolean} active  true = entered fullscreen, false = exited
   */
  FlipbookAnalytics.prototype.trackFullscreen = function (active) {
    if (this._destroyed) { return; }
    this._enqueue({
      event_type:  'fullscreen',
      page_number: active ? 1 : 0  // 1 = entered, 0 = exited (re-uses page_number column)
    });
  };

  /**
   * Send a time_spent heartbeat with total elapsed seconds since init().
   * The backend stores seconds in the page_number column for time_spent events.
   */
  FlipbookAnalytics.prototype.trackTimeOnPage = function () {
    if (this._destroyed || !this._startTime) { return; }
    var elapsed = Math.round((now() - this._startTime) / 1000);
    this._enqueue({
      event_type:  'time_spent',
      page_number: elapsed    // seconds stored in the page_number column
    });
    this._flushQueue();
  };

  /**
   * Return (or create) a stable visitor ID for this browser session.
   * Uses in-memory storage so each tab session gets a fresh ID.
   * @returns {string} UUID
   */
  FlipbookAnalytics.prototype.getVisitorId = function () {
    if (this._visitorId) { return this._visitorId; }

    var stored = window.__fbp_visitor_id || null;

    if (!stored) {
      stored = generateUUID();
      window.__fbp_visitor_id = stored;
    }

    this._visitorId = stored;
    return stored;
  };

  /**
   * Stop all timers and mark this instance as destroyed.
   * Should be called when navigating away or unmounting the viewer.
   */
  FlipbookAnalytics.prototype.destroy = function () {
    this._destroyed = true;
    if (this._heartbeatTimer)  { clearInterval(this._heartbeatTimer);  this._heartbeatTimer  = null; }
    if (this._batchFlushTimer) { clearInterval(this._batchFlushTimer); this._batchFlushTimer = null; }
    this._flushQueue(true);
    this._queue = [];
  };

  // ── Private methods ──────────────────────────────────────────────────────────

  /**
   * Called by the debounced trackPageView after the user has dwelt on a page.
   * @param {number} pageNumber
   */
  FlipbookAnalytics.prototype._sendPageView = function (pageNumber) {
    if (this._destroyed) { return; }
    this._lastPageViewPage = pageNumber;
    this._enqueue({
      event_type:  'page_view',
      page_number: pageNumber
    });
  };

  /**
   * Add an event to the internal queue, flushing immediately if the batch is full.
   * Enriches every event with visitor meta-data.
   * @param {{event_type: string, page_number?: number}} event
   */
  FlipbookAnalytics.prototype._enqueue = function (event) {
    var enriched = {
      flipbook_id: this._flipbookId,
      event_type:  event.event_type,
      page_number: event.page_number !== undefined ? event.page_number : null,
      visitor_id:  this._visitorId || this.getVisitorId(),
      referrer:    (typeof document !== 'undefined' && document.referrer) || '',
      user_agent:  (typeof navigator !== 'undefined' && navigator.userAgent) || '',
      screen_size: (typeof screen !== 'undefined') ? (screen.width + 'x' + screen.height) : '',
      ts:          new Date().toISOString()
    };

    // Copy any extra fields (e.g. platform for share events)
    Object.keys(event).forEach(function (k) {
      if (!(k in enriched)) { enriched[k] = event[k]; }
    });

    this._queue.push(enriched);

    if (this._queue.length >= MAX_BATCH_SIZE) {
      this._flushQueue();
    }
  };

  /**
   * Send all queued events to the backend.
   * If useSendBeacon is true, attempts navigator.sendBeacon for guaranteed delivery
   * on page unload.
   * @param {boolean} [useSendBeacon=false]
   */
  FlipbookAnalytics.prototype._flushQueue = function (useSendBeacon) {
    if (!this._queue.length || !this._flipbookId) { return; }

    var batch = this._queue.slice();
    this._queue = [];

    var url = this._apiBase + '/api/analytics/track';

    // sendBeacon path (for beforeunload)
    if (useSendBeacon &&
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function') {
      // Send each event individually via sendBeacon (it only takes a body, not batches)
      batch.forEach(function (evt) {
        var blob = new Blob([JSON.stringify(evt)], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      });
      return;
    }

    // Normal async fetch — fire and forget for each event
    var self = this;
    batch.forEach(function (evt) {
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(evt)
      }).catch(function () {
        // Re-queue on transient failure so we don't permanently lose events
        if (!self._destroyed) {
          self._queue.push(evt);
        }
      });
    });
  };

  return FlipbookAnalytics;
}));
