/**
 * FlipBook Pro — PDF Processor
 * Client-side PDF → WebP images pipeline using pdf.js.
 *
 * Usage:
 *   const processor = new PDFProcessor({
 *     apiBase: 'http://localhost:8000',
 *     token: 'jwt-token',
 *     onProgress: (current, total, status) => {},
 *     onPageReady: (pageNum, blob, thumbBlob) => {},
 *     onComplete: (flipbookId) => {},
 *     onError: (err) => {},
 *   });
 *   await processor.processFile(file);
 *
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────*/
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

const BATCH_SIZE = 5;           // Pages per memory-managed batch
const MAX_RETRIES = 3;          // Upload retry attempts
const RETRY_BASE_DELAY_MS = 500; // Exponential backoff base

/* ─────────────────────────────────────────────────────────────
   PDFProcessor Class
───────────────────────────────────────────────────────────────*/
class PDFProcessor {
  /**
   * @param {Object}   options
   * @param {string}   options.apiBase         - API base URL (no trailing slash)
   * @param {string}   options.token           - JWT auth token
   * @param {number}   [options.quality=0.85]  - WebP encoding quality (0–1)
   * @param {number}   [options.maxWidth=1600] - Max rendered page width in px
   * @param {number}   [options.thumbWidth=200]- Thumbnail width in px
   * @param {boolean}  [options.splitSpreads=false] - Split landscape spreads into two pages
   * @param {Function} [options.onProgress]    - (current, total, statusMessage) => void
   * @param {Function} [options.onPageReady]   - (pageNum, imageBlob, thumbBlob) => void
   * @param {Function} [options.onComplete]    - (flipbookId) => void
   * @param {Function} [options.onError]       - (Error) => void
   */
  constructor(options = {}) {
    if (!options.apiBase) throw new Error('PDFProcessor: apiBase is required');
    if (!options.token)   throw new Error('PDFProcessor: token is required');

    this.apiBase     = options.apiBase.replace(/\/$/, '');
    this.token       = options.token;
    this.quality     = typeof options.quality === 'number' ? options.quality : 0.85;
    this.maxWidth    = options.maxWidth  || 1600;
    this.thumbWidth  = options.thumbWidth || 200;
    this.splitSpreads = !!options.splitSpreads;

    // Callbacks
    this.onProgress  = options.onProgress  || (() => {});
    this.onPageReady = options.onPageReady || (() => {});
    this.onComplete  = options.onComplete  || (() => {});
    this.onError     = options.onError     || ((e) => console.error('[PDFProcessor]', e));

    // Internal state
    this._cancelled  = false;
    this._pdfjsLib   = null; // Loaded pdf.js module reference
  }

  /* ───────────────────────────────────────────────────────────
     Public API
  ─────────────────────────────────────────────────────────────*/

  /**
   * Process a PDF File object.
   * @param {File} file
   */
  async processFile(file) {
    if (!file || !(file instanceof File)) {
      return this._fail(new Error('Invalid file: expected a File object'));
    }
    if (file.type && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return this._fail(new Error('Invalid file type: only PDF files are supported'));
    }

    try {
      this._cancelled = false;
      this.onProgress(0, 0, 'Reading file…');

      const arrayBuffer = await file.arrayBuffer();
      await this._process(arrayBuffer, file.name);
    } catch (err) {
      this._fail(err);
    }
  }

  /**
   * Process a PDF from a URL.
   * @param {string} url
   */
  async processURL(url) {
    if (!url || typeof url !== 'string') {
      return this._fail(new Error('Invalid URL'));
    }

    try {
      this._cancelled = false;
      const filename = url.split('/').pop().split('?')[0] || 'document.pdf';
      this.onProgress(0, 0, `Fetching ${filename}…`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      await this._process(arrayBuffer, filename);
    } catch (err) {
      this._fail(err);
    }
  }

  /**
   * Cancel the current processing operation.
   */
  cancel() {
    this._cancelled = true;
    this.onProgress(0, 0, 'Cancelled');
  }

  /* ───────────────────────────────────────────────────────────
     Private — Core Pipeline
  ─────────────────────────────────────────────────────────────*/

  /**
   * Main processing pipeline (shared by processFile / processURL).
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} filename
   */
  async _process(arrayBuffer, filename) {
    // Step 1: Load pdf.js
    this.onProgress(0, 0, 'Loading PDF renderer…');
    await this._ensurePdfJs();
    if (this._cancelled) return;

    // Step 2: Load the PDF document
    this.onProgress(0, 0, 'Parsing PDF…');
    const pdfDoc = await this._loadDocument(arrayBuffer);
    if (!pdfDoc) return; // _loadDocument calls _fail on error

    const numPages = pdfDoc.numPages;
    this._spreadOffset = 0; // Reset spread page offset for this run
    if (this._cancelled) return;

    // Step 3: Render all pages, collect blobs
    this.onProgress(0, numPages, `Processing ${numPages} page${numPages !== 1 ? 's' : ''}…`);

    const allImageBlobs = [];  // { blob, width, height }
    const allThumbBlobs = [];  // Blob

    // Process in batches of BATCH_SIZE pages.
    // Pages within a batch run in parallel (faster), UNLESS splitSpreads is
    // enabled — spread detection mutates _spreadOffset, so pages must run
    // sequentially to maintain correct logical page numbering.
    for (let batchStart = 1; batchStart <= numPages; batchStart += BATCH_SIZE) {
      if (this._cancelled) return;

      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, numPages);

      if (this.splitSpreads) {
        // Sequential: spread offset counter must be consistent
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          if (this._cancelled) return;
          await this._processOnePage(pdfDoc, pageNum, numPages, allImageBlobs, allThumbBlobs);
        }
      } else {
        // Parallel: no shared mutable state during page rendering
        const batchPromises = [];
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          batchPromises.push(this._processOnePage(pdfDoc, pageNum, numPages, allImageBlobs, allThumbBlobs));
        }
        await Promise.all(batchPromises);
      }

      // Yield to browser between batches to stay responsive
      await _sleep(0);
    }

    if (this._cancelled) return;

    // Step 4: Create flipbook via API
    const title = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim() || 'Untitled';
    this.onProgress(allImageBlobs.length, allImageBlobs.length, 'Creating flipbook…');
    const flipbookId = await this._createFlipbook(title);
    if (!flipbookId) return;

    if (this._cancelled) return;

    // Step 4b: Store actual page dimensions in flipbook settings
    if (allImageBlobs.length > 0 && allImageBlobs[0].width && allImageBlobs[0].height) {
      try {
        await fetch(`${this.apiBase}/api/flipbooks/${flipbookId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
          body: JSON.stringify({ settings: { pageWidth: allImageBlobs[0].width, pageHeight: allImageBlobs[0].height } })
        });
      } catch (_) { /* non-critical */ }
    }

    // Step 5: Upload all pages
    this.onProgress(0, allImageBlobs.length, 'Uploading pages…');
    await this._uploadPages(flipbookId, allImageBlobs, allThumbBlobs);

    if (this._cancelled) return;

    // Done!
    this.onProgress(allImageBlobs.length, allImageBlobs.length, 'Complete');
    this.onComplete(flipbookId);
  }

  /**
   * Process a single PDF page: render → split spreads → encode → report.
   * Pushes results into allImageBlobs and allThumbBlobs.
   */
  async _processOnePage(pdfDoc, pageNum, totalPages, allImageBlobs, allThumbBlobs) {
    if (this._cancelled) return;

    const page = await pdfDoc.getPage(pageNum);
    const renderedPages = await this._renderPage(page, pageNum);
    page.cleanup();

    for (const { canvas, logicalPageNum } of renderedPages) {
      const imageBlob  = await this._canvasToWebP(canvas, this.quality);
      const thumbBlob  = await this._generateThumbnail(canvas);
      const { width, height } = canvas;

      allImageBlobs.push({ blob: imageBlob, width, height });
      allThumbBlobs.push(thumbBlob);

      // Notify caller
      this.onPageReady(logicalPageNum, imageBlob, thumbBlob);

      // Progress: base progress on rendered logical pages
      this.onProgress(
        allImageBlobs.length,
        totalPages,
        `Rendered page ${logicalPageNum}…`
      );

      // Release canvas memory
      canvas.width  = 0;
      canvas.height = 0;
    }
  }

  /* ───────────────────────────────────────────────────────────
     Private — PDF.js Loading
  ─────────────────────────────────────────────────────────────*/

  /**
   * Ensure pdf.js is available, loading from CDN if needed.
   */
  async _ensurePdfJs() {
    // Already loaded
    if (this._pdfjsLib) return;

    // If loaded globally (e.g., via <script> tag)
    if (typeof globalThis.pdfjsLib !== 'undefined') {
      this._pdfjsLib = globalThis.pdfjsLib;
      return;
    }

    // Dynamically import as ES module
    try {
      const module = await import(PDFJS_CDN);
      this._pdfjsLib = module;

      // Configure worker
      if (this._pdfjsLib.GlobalWorkerOptions) {
        this._pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      }

      // Expose globally for potential reuse by other modules
      globalThis.pdfjsLib = this._pdfjsLib;
    } catch (err) {
      throw new Error(`Failed to load PDF.js from CDN: ${err.message}`);
    }
  }

  /* ───────────────────────────────────────────────────────────
     Private — Document Loading
  ─────────────────────────────────────────────────────────────*/

  /**
   * Load a PDF document from an ArrayBuffer.
   * @param {ArrayBuffer} source
   * @returns {Promise<PDFDocumentProxy|null>}
   */
  async _loadDocument(source) {
    try {
      const loadingTask = this._pdfjsLib.getDocument({ data: new Uint8Array(source) });
      const pdfDoc = await loadingTask.promise;
      return pdfDoc;
    } catch (err) {
      let message = err.message || 'Unknown error';
      if (message.toLowerCase().includes('invalid pdf') || message.toLowerCase().includes('pdf header')) {
        message = 'The file appears to be corrupt or is not a valid PDF.';
      }
      this._fail(new Error(`Failed to parse PDF: ${message}`));
      return null;
    }
  }

  /* ───────────────────────────────────────────────────────────
     Private — Page Rendering
  ─────────────────────────────────────────────────────────────*/

  /**
   * Render a single PDF page to one or two canvases (if spread-splitting).
   * @param {PDFPageProxy} page
   * @param {number} pageNum - 1-based PDF page number
   * @returns {Promise<Array<{canvas: HTMLCanvasElement|OffscreenCanvas, logicalPageNum: number}>>}
   */
  async _renderPage(page, pageNum) {
    // Calculate viewport: scale page so its width = maxWidth.
    // PDF units are points (72/inch). Scale to pixel width.
    const naturalViewport = page.getViewport({ scale: 1 });
    const scale = this.maxWidth / naturalViewport.width;
    // Cap scale so we don't produce absurdly large images from tiny PDFs
    const clampedScale = Math.min(scale, 4);
    const viewport = page.getViewport({ scale: clampedScale });

    // Create canvas (prefer OffscreenCanvas for perf)
    const canvas = _createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = _getContext(canvas);

    // Render
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;

    // Check for spread splitting
    const w = canvas.width;
    const h = canvas.height;
    if (this.splitSpreads && w > h * 1.3) {
      const halves = await this._splitSpread(canvas);
      // halves[0] = left page, halves[1] = right page
      // Each spread PDF page produces 2 logical pages.
      // _spreadOffset tracks the extra pages added by previous spreads.
      const leftNum  = pageNum + this._spreadOffset;
      this._spreadOffset++; // This spread adds 1 extra page
      const rightNum = pageNum + this._spreadOffset;

      return [
        { canvas: halves[0], logicalPageNum: leftNum  },
        { canvas: halves[1], logicalPageNum: rightNum },
      ];
    }

    const logicalPageNum = pageNum + this._spreadOffset;
    return [{ canvas, logicalPageNum }];
  }

  /* ───────────────────────────────────────────────────────────
     Private — Spread Splitting
  ─────────────────────────────────────────────────────────────*/

  /**
   * Split a landscape canvas into left and right halves.
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @returns {Promise<[HTMLCanvasElement|OffscreenCanvas, HTMLCanvasElement|OffscreenCanvas]>}
   */
  async _splitSpread(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const halfW = Math.floor(w / 2);

    const leftCanvas  = _createCanvas(halfW, h);
    const rightCanvas = _createCanvas(w - halfW, h);

    const leftCtx  = _getContext(leftCanvas);
    const rightCtx = _getContext(rightCanvas);

    // Use ImageBitmap if available for better performance
    if (typeof createImageBitmap !== 'undefined') {
      const bmp = await createImageBitmap(canvas);
      leftCtx.drawImage(bmp,      0, 0, halfW,      h, 0, 0, halfW,      h);
      rightCtx.drawImage(bmp, halfW, 0, w - halfW,  h, 0, 0, w - halfW,  h);
      bmp.close();
    } else {
      leftCtx.drawImage(canvas,      0, 0, halfW,     h, 0, 0, halfW,     h);
      rightCtx.drawImage(canvas, halfW, 0, w - halfW, h, 0, 0, w - halfW, h);
    }

    return [leftCanvas, rightCanvas];
  }

  /* ───────────────────────────────────────────────────────────
     Private — Image Encoding
  ─────────────────────────────────────────────────────────────*/

  /**
   * Convert a canvas to a WebP Blob.
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @param {number} quality - 0–1
   * @returns {Promise<Blob>}
   */
  async _canvasToWebP(canvas, quality) {
    // OffscreenCanvas has convertToBlob
    if (typeof canvas.convertToBlob === 'function') {
      return canvas.convertToBlob({ type: 'image/webp', quality });
    }

    // Regular canvas uses toBlob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas.toBlob returned null'));
        },
        'image/webp',
        quality
      );
    });
  }

  /**
   * Generate a thumbnail blob at thumbWidth px wide.
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @returns {Promise<Blob>}
   */
  async _generateThumbnail(canvas) {
    const srcW = canvas.width;
    const srcH = canvas.height;
    const thumbH = Math.round((srcH / srcW) * this.thumbWidth);

    const thumbCanvas = _createCanvas(this.thumbWidth, thumbH);
    const ctx = _getContext(thumbCanvas);

    if (typeof createImageBitmap !== 'undefined') {
      const bmp = await createImageBitmap(canvas, {
        resizeWidth: this.thumbWidth,
        resizeHeight: thumbH,
        resizeQuality: 'medium',
      });
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
    } else {
      ctx.drawImage(canvas, 0, 0, this.thumbWidth, thumbH);
    }

    return this._canvasToWebP(thumbCanvas, 0.75);
  }

  /* ───────────────────────────────────────────────────────────
     Private — API Communication
  ─────────────────────────────────────────────────────────────*/

  /**
   * Create a new flipbook via POST /api/flipbooks.
   * @param {string} title
   * @returns {Promise<string|null>} flipbook ID or null on failure
   */
  async _createFlipbook(title) {
    const response = await this._apiFetch('/api/flipbooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown error');
      this._fail(new Error(`Failed to create flipbook: HTTP ${response.status} — ${text}`));
      return null;
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Upload all page images to the API in batches.
   * @param {string} flipbookId
   * @param {Array<{blob: Blob, width: number, height: number}>} imageBlobs
   * @param {Blob[]} thumbBlobs
   */
  async _uploadPages(flipbookId, imageBlobs, thumbBlobs) {
    const total = imageBlobs.length;
    let uploaded = 0;

    // Upload in batches of BATCH_SIZE to keep requests manageable
    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      if (this._cancelled) return;

      const batchEnd = Math.min(batchStart + BATCH_SIZE, total);
      const form = new FormData();

      for (let i = batchStart; i < batchEnd; i++) {
        const pageNum = i + 1;
        const { blob } = imageBlobs[i];
        form.append('files', blob, `page_${pageNum}.webp`);
      }

      this.onProgress(uploaded, total, `Uploading pages ${batchStart + 1}–${batchEnd} of ${total}…`);

      await this._uploadWithRetry(flipbookId, form);

      uploaded = batchEnd;
      this.onProgress(uploaded, total, `Uploaded ${uploaded}/${total} pages…`);
    }
  }

  /**
   * Upload a FormData batch with exponential backoff retry.
   * @param {string} flipbookId
   * @param {FormData} formData
   */
  async _uploadWithRetry(flipbookId, formData) {
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this._cancelled) return;

      try {
        const response = await this._apiFetch(`/api/flipbooks/${flipbookId}/pages`, {
          method: 'POST',
          body: formData,
          // Do NOT set Content-Type; browser sets it with boundary for multipart
        });

        if (response.ok) return; // Success

        const text = await response.text().catch(() => '');
        lastError = new Error(`Upload failed: HTTP ${response.status} — ${text}`);

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw lastError;
        }
      } catch (err) {
        lastError = err;
      }

      // Exponential backoff before retry
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      this.onProgress(0, 0, `Upload failed, retrying in ${delay}ms… (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await _sleep(delay);
    }

    throw lastError || new Error('Upload failed after maximum retries');
  }

  /**
   * Authenticated fetch wrapper.
   * @param {string} path - API path (e.g., '/api/flipbooks')
   * @param {RequestInit} init
   * @returns {Promise<Response>}
   */
  async _apiFetch(path, init = {}) {
    const url = `${this.apiBase}${path}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      ...(init.headers || {}),
    };
    return fetch(url, { ...init, headers });
  }

  /* ───────────────────────────────────────────────────────────
     Private — Error Handling
  ─────────────────────────────────────────────────────────────*/

  /**
   * Emit an error to the onError callback.
   * @param {Error} err
   */
  _fail(err) {
    this._cancelled = true;
    this.onError(err instanceof Error ? err : new Error(String(err)));
  }

  /* ───────────────────────────────────────────────────────────
     Private — Spread Page Offset Management
  ─────────────────────────────────────────────────────────────*/

  /**
   * Reset internal state for a fresh processing run.
   * Called automatically at the start of _process().
   */
  _resetState() {
    this._cancelled = false;
    this._spreadOffset = 0;
  }
}

/* ─────────────────────────────────────────────────────────────
   Utility Helpers (module-level, not class members)
───────────────────────────────────────────────────────────────*/

/**
 * Create a canvas element, preferring OffscreenCanvas.
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas|HTMLCanvasElement}
 */
function _createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  return canvas;
}

/**
 * Get 2D context from a canvas (regular or offscreen).
 * @param {OffscreenCanvas|HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}
 */
function _getContext(canvas) {
  return canvas.getContext('2d', { alpha: false, willReadFrequently: false });
}

/**
 * Promise-based sleep.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────────────────────
   UMD Export
───────────────────────────────────────────────────────────────*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser global
    root.PDFProcessor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  return PDFProcessor;
}));
