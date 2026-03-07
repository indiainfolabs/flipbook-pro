/**
 * FlipBook Pro — API Client
 * Wraps all backend communication with auth, error handling, retry, and upload progress.
 * Exposes window.FlipbookAPI in UMD format.
 */
/* global module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FlipbookAPI = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  const DEFAULT_TIMEOUT_MS   = 30_000;   // 30 s for normal requests
  const UPLOAD_TIMEOUT_MS    = 300_000;  // 5 min for uploads
  const MAX_RETRIES          = 3;
  const RETRY_BASE_DELAY_MS  = 500;      // exponential backoff base

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Sleep for `ms` milliseconds.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Build a standardised response envelope.
   * @param {boolean} ok
   * @param {*} data
   * @param {string|null} error
   * @param {number} status
   */
  function envelope(ok, data, error, status) {
    return { ok: ok, data: data || null, error: error || null, status: status };
  }

  // ─── FlipbookAPI Class ───────────────────────────────────────────────────────

  /**
   * @param {string} baseURL  Base URL of the API server, e.g. "http://localhost:8000"
   */
  function FlipbookAPI(baseURL) {
    this.baseURL = (baseURL || '').replace(/\/$/, '');
    this.token   = null;
  }

  // ── Token management ────────────────────────────────────────────────────────

  /**
   * Store a JWT to attach to every subsequent request.
   * @param {string|null} token
   */
  FlipbookAPI.prototype.setToken = function (token) {
    this.token = token || null;
  };

  // ── Auth ────────────────────────────────────────────────────────────────────

  /**
   * Register a new account.
   * @param {string} email
   * @param {string} password
   * @param {string} [name]
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.register = function (email, password, name) {
    return this._request('POST', '/api/auth/register', {
      email: email,
      password: password,
      name: name || null
    });
  };

  /**
   * Login and receive a JWT token.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.login = function (email, password) {
    return this._request('POST', '/api/auth/login', {
      email: email,
      password: password
    });
  };

  /**
   * Get the authenticated user's profile.
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.getProfile = function () {
    return this._request('GET', '/api/auth/me');
  };

  // ── Flipbooks ────────────────────────────────────────────────────────────────

  /**
   * List all flipbooks owned by the current user.
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.listFlipbooks = function () {
    return this._request('GET', '/api/flipbooks');
  };

  /**
   * Create a new flipbook.
   * @param {{title?: string, description?: string, settings?: object, visibility?: string}} data
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.createFlipbook = function (data) {
    return this._request('POST', '/api/flipbooks', data || {});
  };

  /**
   * Get a single flipbook by ID (includes pages array).
   * @param {string} id
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.getFlipbook = function (id) {
    return this._request('GET', '/api/flipbooks/' + encodeURIComponent(id));
  };

  /**
   * Update flipbook metadata or settings.
   * @param {string} id
   * @param {object} data  Partial UpdateFlipbookRequest fields
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.updateFlipbook = function (id, data) {
    return this._request('PUT', '/api/flipbooks/' + encodeURIComponent(id), data || {});
  };

  /**
   * Permanently delete a flipbook and its pages.
   * @param {string} id
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.deleteFlipbook = function (id) {
    return this._request('DELETE', '/api/flipbooks/' + encodeURIComponent(id));
  };

  // ── Pages ────────────────────────────────────────────────────────────────────

  /**
   * Upload page images for a flipbook via multipart/form-data.
   * Uses XHR so that upload progress can be reported.
   *
   * @param {string}   flipbookId
   * @param {FileList|File[]} files      Image files to upload
   * @param {Function} [onProgress]      Called with (percentComplete 0–100)
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.uploadPages = function (flipbookId, files, onProgress) {
    var self    = this;
    var url     = this.baseURL + '/api/flipbooks/' + encodeURIComponent(flipbookId) + '/pages';
    var formData = new FormData();

    var fileArray = Array.isArray(files) ? files : Array.from(files || []);
    fileArray.forEach(function (file) {
      formData.append('files', file);
    });

    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();

      // Progress tracking
      if (typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', function (e) {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.timeout = UPLOAD_TIMEOUT_MS;

      xhr.ontimeout = function () {
        resolve(envelope(false, null, 'Upload timed out', 0));
      };

      xhr.onerror = function () {
        resolve(envelope(false, null, 'Network error during upload', 0));
      };

      xhr.onload = function () {
        var ok     = xhr.status >= 200 && xhr.status < 300;
        var parsed = null;
        var errMsg = null;

        try {
          parsed = JSON.parse(xhr.responseText);
        } catch (_) {
          errMsg = 'Invalid JSON response';
        }

        if (!ok) {
          errMsg = (parsed && parsed.detail) || ('Upload failed with status ' + xhr.status);
        }

        resolve(envelope(ok, ok ? parsed : null, ok ? null : errMsg, xhr.status));
      };

      xhr.open('POST', url, true);

      if (self.token) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + self.token);
      }

      xhr.send(formData);
    });
  };

  /**
   * Delete a specific page from a flipbook.
   * @param {string} flipbookId
   * @param {number} pageNum
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.deletePage = function (flipbookId, pageNum) {
    return this._request(
      'DELETE',
      '/api/flipbooks/' + encodeURIComponent(flipbookId) + '/pages/' + encodeURIComponent(pageNum)
    );
  };

  // ── Viewer (public, no auth required) ───────────────────────────────────────

  /**
   * Fetch public flipbook data by slug (used by the viewer page).
   * Automatically attaches token if set (allows owners to preview private flipbooks).
   * @param {string} slug
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.getPublicFlipbook = function (slug) {
    return this._request('GET', '/api/viewer/' + encodeURIComponent(slug));
  };

  // ── Analytics ────────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget analytics event tracking.
   * Never rejects; silently swallows errors so the UI is never blocked.
   * @param {{flipbook_id, event_type, page_number?, visitor_id?, referrer?}} data
   * @returns {Promise<void>}
   */
  FlipbookAPI.prototype.trackEvent = function (data) {
    this._request('POST', '/api/analytics/track', data || {}).catch(function () {});
    return Promise.resolve();
  };

  /**
   * Get analytics summary for a flipbook (authenticated).
   * @param {string} flipbookId
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype.getAnalytics = function (flipbookId) {
    return this._request('GET', '/api/flipbooks/' + encodeURIComponent(flipbookId) + '/analytics');
  };

  // ── Internal request core ────────────────────────────────────────────────────

  /**
   * Core fetch wrapper.
   *
   * @param {string}  method        HTTP method ("GET", "POST", etc.)
   * @param {string}  path          API path, e.g. "/api/flipbooks"
   * @param {object}  [body]        JSON body for POST/PUT
   * @param {object}  [options]     Extra options: { timeout, noRetry }
   * @returns {Promise<{ok, data, error, status}>}
   */
  FlipbookAPI.prototype._request = function (method, path, body, options) {
    var self     = this;
    var opts     = options || {};
    var timeout  = opts.timeout || DEFAULT_TIMEOUT_MS;
    var noRetry  = opts.noRetry || false;
    var url      = this.baseURL + path;

    var headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }

    var fetchOptions = {
      method:  method,
      headers: headers
    };

    if (body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE') {
      fetchOptions.body = JSON.stringify(body);
    }

    // Retry helper using exponential backoff (only for 5xx responses)
    function attempt(retriesLeft) {
      var controller    = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timerId       = null;
      var timedOut      = false;

      if (controller) {
        fetchOptions.signal = controller.signal;
        timerId = setTimeout(function () {
          timedOut = true;
          controller.abort();
        }, timeout);
      }

      return fetch(url, fetchOptions)
        .then(function (response) {
          if (timerId) { clearTimeout(timerId); }

          var status   = response.status;
          var ok       = response.ok; // status in 200–299

          // 204 No Content — no body to parse
          if (status === 204) {
            return envelope(true, null, null, 204);
          }

          return response.text().then(function (text) {
            var parsed = null;
            var parseErr = null;

            if (text) {
              try {
                parsed = JSON.parse(text);
              } catch (_) {
                parseErr = 'Could not parse response JSON';
              }
            }

            if (!ok) {
              // 5xx — retry if we have budget and retries are allowed
              if (status >= 500 && retriesLeft > 0 && !noRetry) {
                var delay = RETRY_BASE_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
                return sleep(delay).then(function () { return attempt(retriesLeft - 1); });
              }

              var errDetail = (parsed && parsed.detail) ||
                              (parsed && parsed.message) ||
                              parseErr ||
                              ('Request failed with status ' + status);

              return envelope(false, parsed, errDetail, status);
            }

            return envelope(true, parsed, parseErr, status);
          });
        })
        .catch(function (err) {
          if (timerId) { clearTimeout(timerId); }

          if (timedOut || (err && err.name === 'AbortError')) {
            return envelope(false, null, 'Request timed out after ' + (timeout / 1000) + 's', 0);
          }

          // Network error — retry if budget remains
          if (retriesLeft > 0 && !noRetry) {
            var delay = RETRY_BASE_DELAY_MS * Math.pow(2, MAX_RETRIES - retriesLeft);
            return sleep(delay).then(function () { return attempt(retriesLeft - 1); });
          }

          return envelope(false, null, (err && err.message) || 'Network error', 0);
        });
    }

    return attempt(MAX_RETRIES);
  };

  return FlipbookAPI;
}));
