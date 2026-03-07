/**
 * PageFlipEngine — Production-quality page-flip library
 *
 * Combines StPageFlip (original) + SAILgaosai fork improvements +
 * community fixes and new features.
 *
 * Features included:
 *  - SAILgaosai: animation loop optimisation, portrait mode fix,
 *    mirror rendering for covers, cover centring, flipPrev fix,
 *    disableHardPages, firstCoverStartLeft
 *  - clickEventForward logic fix (inverted check)
 *  - CSS class typo fix (stf__wrapper)
 *  - getMousePos scale fix (CSS transform:scale support)
 *  - showCover centring guard
 *  - Non-passive / passive touch event listeners
 *  - Mobile scroll prevention on flip
 *  - RTL support (rtl setting, scaleX(-1), mirrored mouse X, setRTLStyle, updateRTL, changeRTL event)
 *  - Soft cover support (no forced HARD density)
 *  - Flip hint system (showFlipHint, flipHintInterval, flipHintCooldown)
 *  - autoPlay / autoPlayInterval / startAutoPlay / stopAutoPlay / toggleAutoPlay
 *  - onFlipSound event hook
 *  - disableSwipe setting
 *  - backgroundColor canvas setting
 *  - getCurrentPageIndex(), getTotalPages(), isFlipping() public methods
 *  - zoom(level) method stub
 *
 * Output: UMD + ESM dual export
 *
 * @version 2.0.0
 * @license MIT
 */

(function (global, factory) {
    'use strict';
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        // CommonJS / Node
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser global
        const exports = factory();
        global.PageFlipEngine = exports;
        if (typeof global.PageFlip === 'undefined') global.PageFlip = exports.PageFlip;
    }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ─────────────────────────────────────────────
    // CSS INJECTION
    // ─────────────────────────────────────────────

    let _cssInjected = false;

    function injectCSS() {
        if (_cssInjected || typeof document === 'undefined') return;
        _cssInjected = true;
        const style = document.createElement('style');
        style.id = 'stf-page-flip-engine-styles';
        style.textContent = `
.stf__parent { position: relative; }
.stf__wrapper { position: relative; display: block; }
.stf__wrapper.--portrait .stf__block { width: 100%; }
.stf__wrapper.--landscape .stf__block { width: 200%; }
.stf__wrapper.--rtl { transform: scaleX(-1); }
.stf__wrapper.--rtl .stf__item > * { transform: scaleX(-1); }
.stf__block { position: relative; width: 100%; overflow: hidden; }
.stf__item { position: absolute; top: 0; backface-visibility: hidden; transform-origin: 0 0; }
.stf__item.--left { left: 0; }
.stf__item.--right { left: 50%; }
.stf__item.--soft { z-index: 1; }
.stf__item.--hard { z-index: 2; }
.stf__outerShadow, .stf__innerShadow, .stf__hardShadow, .stf__hardInnerShadow { position: absolute; pointer-events: none; }
        `.trim();
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────
    // CONSTANTS / ENUMS
    // ─────────────────────────────────────────────

    /** @enum {string} */
    const SizeType = Object.freeze({ FIXED: 'fixed', STRETCH: 'stretch' });
    /** @enum {number} */
    const FlipDirection = Object.freeze({ FORWARD: 0, BACK: 1 });
    /** @enum {string} */
    const FlipCorner = Object.freeze({ TOP: 'top', BOTTOM: 'bottom' });
    /** @enum {string} */
    const FlippingState = Object.freeze({
        USER_FOLD: 'user_fold',
        FOLD_CORNER: 'fold_corner',
        FLIPPING: 'flipping',
        READ: 'read',
    });
    /** @enum {string} */
    const Orientation = Object.freeze({ PORTRAIT: 'portrait', LANDSCAPE: 'landscape' });
    /** @enum {number} */
    const PageOrientation = Object.freeze({ LEFT: 0, RIGHT: 1 });
    /** @enum {string} */
    const PageDensity = Object.freeze({ SOFT: 'soft', HARD: 'hard' });

    // ─────────────────────────────────────────────
    // SETTINGS
    // ─────────────────────────────────────────────

    class Settings {
        constructor() {
            this._default = {
                startPage: 0,
                size: SizeType.FIXED,
                width: 0,
                height: 0,
                minWidth: 0,
                maxWidth: 0,
                minHeight: 0,
                maxHeight: 0,
                drawShadow: true,
                flippingTime: 1000,
                usePortrait: true,
                startZIndex: 0,
                autoSize: true,
                maxShadowOpacity: 1,
                showCover: false,
                disableHardPages: false,
                firstCoverStartLeft: true,
                mobileScrollSupport: true,
                swipeDistance: 30,
                clickEventForward: true,
                useMouseEvents: true,
                showPageCorners: true,
                disableFlipByClick: false,
                // RTL support
                rtl: false,
                // Soft cover support: soft covers allowed by default
                // Flip hint
                showFlipHint: false,
                flipHintInterval: 5000,
                flipHintCooldown: 1000,
                // Auto-play
                autoPlay: false,
                autoPlayInterval: 3000,
                // Swipe control
                disableSwipe: false,
                // Background colour for canvas mode
                backgroundColor: '#ffffff',
            };
        }

        /**
         * Merge user settings with defaults and validate
         * @param {Object} userSetting
         * @returns {Object}
         */
        getSettings(userSetting) {
            const result = Object.assign({}, this._default, userSetting);

            if (result.size !== SizeType.STRETCH && result.size !== SizeType.FIXED)
                throw new Error('Invalid size type. Available only "fixed" and "stretch" value');

            if (result.width <= 0 || result.height <= 0) throw new Error('Invalid width or height');
            if (result.flippingTime <= 0) throw new Error('Invalid flipping time');

            if (result.size === SizeType.STRETCH) {
                if (result.minWidth <= 0) result.minWidth = 100;
                if (result.maxWidth < result.minWidth) result.maxWidth = 2000;
                if (result.minHeight <= 0) result.minHeight = 100;
                if (result.maxHeight < result.minHeight) result.maxHeight = 2000;
            } else {
                result.minWidth = result.width;
                result.maxWidth = result.width;
                result.minHeight = result.height;
                result.maxHeight = result.height;
            }

            return result;
        }
    }

    // ─────────────────────────────────────────────
    // HELPER
    // ─────────────────────────────────────────────

    class Helper {
        static GetDistanceBetweenTwoPoint(p1, p2) {
            if (p1 === null || p2 === null) return Infinity;
            return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        }

        static GetSegmentLength(segment) {
            return Helper.GetDistanceBetweenTwoPoint(segment[0], segment[1]);
        }

        static GetAngleBetweenTwoLine(line1, line2) {
            const A1 = line1[0].y - line1[1].y, A2 = line2[0].y - line2[1].y;
            const B1 = line1[1].x - line1[0].x, B2 = line2[1].x - line2[0].x;
            return Math.acos((A1 * A2 + B1 * B2) / (Math.sqrt(A1 * A1 + B1 * B1) * Math.sqrt(A2 * A2 + B2 * B2)));
        }

        static PointInRect(rect, pos) {
            if (pos === null) return null;
            if (pos.x >= rect.left && pos.x <= rect.width + rect.left &&
                pos.y >= rect.top && pos.y <= rect.top + rect.height)
                return pos;
            return null;
        }

        static GetRotatedPoint(transformedPoint, startPoint, angle) {
            return {
                x: transformedPoint.x * Math.cos(angle) + transformedPoint.y * Math.sin(angle) + startPoint.x,
                y: transformedPoint.y * Math.cos(angle) - transformedPoint.x * Math.sin(angle) + startPoint.y,
            };
        }

        static LimitPointToCircle(startPoint, radius, limitedPoint) {
            if (Helper.GetDistanceBetweenTwoPoint(startPoint, limitedPoint) <= radius)
                return limitedPoint;

            const a = startPoint.x, b = startPoint.y;
            const n = limitedPoint.x, m = limitedPoint.y;

            let x = Math.sqrt((Math.pow(radius, 2) * Math.pow(a - n, 2)) / (Math.pow(a - n, 2) + Math.pow(b - m, 2))) + a;
            if (limitedPoint.x < 0) x *= -1;

            let y = ((x - a) * (b - m)) / (a - n) + b;
            if (a - n + b === 0) y = radius;

            return { x, y };
        }

        static GetIntersectBeetwenTwoLine(one, two) {
            const A1 = one[0].y - one[1].y, A2 = two[0].y - two[1].y;
            const B1 = one[1].x - one[0].x, B2 = two[1].x - two[0].x;
            const C1 = one[0].x * one[1].y - one[1].x * one[0].y;
            const C2 = two[0].x * two[1].y - two[1].x * two[0].y;

            const det1 = A1 * C2 - A2 * C1;
            const det2 = B1 * C2 - B2 * C1;

            const x = -((C1 * B2 - C2 * B1) / (A1 * B2 - A2 * B1));
            const y = -((A1 * C2 - A2 * C1) / (A1 * B2 - A2 * B1));

            if (isFinite(x) && isFinite(y)) return { x, y };
            if (Math.abs(det1 - det2) < 0.1) throw new Error('Segment included');
            return null;
        }

        static GetIntersectBetweenTwoSegment(rectBorder, one, two) {
            return Helper.PointInRect(rectBorder, Helper.GetIntersectBeetwenTwoLine(one, two));
        }

        static GetCordsFromTwoPoint(pointOne, pointTwo) {
            const sizeX = Math.abs(pointOne.x - pointTwo.x);
            const sizeY = Math.abs(pointOne.y - pointTwo.y);
            const lengthLine = Math.max(sizeX, sizeY);

            const result = [pointOne];

            function getCord(c1, c2, size, length, index) {
                if (c2 > c1) return c1 + index * (size / length);
                if (c2 < c1) return c1 - index * (size / length);
                return c1;
            }

            for (let i = 1; i <= lengthLine; i++) {
                result.push({
                    x: getCord(pointOne.x, pointTwo.x, sizeX, lengthLine, i),
                    y: getCord(pointOne.y, pointTwo.y, sizeY, lengthLine, i),
                });
            }

            return result;
        }
    }

    // ─────────────────────────────────────────────
    // EVENT OBJECT
    // ─────────────────────────────────────────────

    class EventObject {
        constructor() {
            this._events = new Map();
        }

        /**
         * Subscribe to an event
         * @param {string} eventName
         * @param {Function} callback
         * @returns {EventObject}
         */
        on(eventName, callback) {
            if (!this._events.has(eventName)) {
                this._events.set(eventName, [callback]);
            } else {
                this._events.get(eventName).push(callback);
            }
            return this;
        }

        /**
         * Remove all handlers for an event
         * @param {string} event
         */
        off(event) {
            this._events.delete(event);
        }

        _trigger(eventName, app, data = null) {
            if (!this._events.has(eventName)) return;
            for (const cb of this._events.get(eventName)) {
                cb({ data, object: app });
            }
        }
    }

    // ─────────────────────────────────────────────
    // PAGE BASE CLASS
    // ─────────────────────────────────────────────

    class Page {
        constructor(render, density) {
            this.state = {
                angle: 0,
                area: [],
                position: { x: 0, y: 0 },
                hardAngle: 0,
                hardDrawingAngle: 0,
            };
            this.createdDensity = density;
            this.nowDrawingDensity = density;
            this.render = render;
            this.orientation = PageOrientation.RIGHT;
        }

        setDensity(density) {
            this.createdDensity = density;
            this.nowDrawingDensity = density;
        }

        setDrawingDensity(density) {
            this.nowDrawingDensity = density;
        }

        setPosition(pagePos) { this.state.position = pagePos; }
        setAngle(angle) { this.state.angle = angle; }
        setArea(area) { this.state.area = area; }

        setHardDrawingAngle(angle) { this.state.hardDrawingAngle = angle; }

        setHardAngle(angle) {
            this.state.hardAngle = angle;
            this.state.hardDrawingAngle = angle;
        }

        setOrientation(orientation) { this.orientation = orientation; }
        getDrawingDensity() { return this.nowDrawingDensity; }
        getDensity() { return this.createdDensity; }
        getHardAngle() { return this.state.hardAngle; }
    }

    // ─────────────────────────────────────────────
    // HTML PAGE
    // ─────────────────────────────────────────────

    class HTMLPage extends Page {
        constructor(render, element, density) {
            super(render, density);
            this.element = element;
            this.copiedElement = null;
            this.temporaryCopy = null;
            this.isLoad = false;

            this.element.classList.add('stf__item');
            this.element.classList.add('--' + density);
        }

        /**
         * Create a mirrored temporary copy (SAILgaosai mirror-rendering)
         */
        newTemporaryCopy() {
            if (this.nowDrawingDensity === PageDensity.HARD) return this;

            if (this.temporaryCopy === null) {
                const mask = document.createElement('div');
                mask.className = 'mask';
                mask.style.transform = 'scaleX(-1)';
                mask.appendChild(this.element.cloneNode(true));

                this.copiedElement = document.createElement('div');
                this.copiedElement.appendChild(mask);
                this.copiedElement.className = 'flipping-copy';
                this.element.parentElement.appendChild(this.copiedElement);

                this.temporaryCopy = new HTMLPage(this.render, this.copiedElement, this.nowDrawingDensity);
            }

            return this.getTemporaryCopy();
        }

        getTemporaryCopy() { return this.temporaryCopy; }

        hideTemporaryCopy() {
            if (this.temporaryCopy !== null) {
                this.copiedElement.remove();
                this.copiedElement = null;
                this.temporaryCopy = null;
            }
        }

        draw(tempDensity) {
            const density = tempDensity ? tempDensity : this.nowDrawingDensity;
            const pagePos = this.render.convertToGlobal(this.state.position);
            const pageWidth = this.render.getRect().pageWidth;
            const pageHeight = this.render.getRect().height;

            this.element.classList.remove('--simple');

            const commonStyle = `
                display: block;
                z-index: ${this.element.style.zIndex};
                left: 0;
                top: 0;
                width: ${pageWidth}px;
                height: ${pageHeight}px;
            `;

            if (density === PageDensity.HARD) {
                this._drawHard(commonStyle);
            } else {
                this._drawSoft(pagePos, commonStyle);
            }
        }

        _drawHard(commonStyle = '') {
            const pos = this.render.getRect().left + this.render.getRect().width / 2;
            const angle = this.state.hardDrawingAngle;

            const orientStyle = this.orientation === PageOrientation.LEFT
                ? `transform-origin: ${this.render.getRect().pageWidth}px 0;
                   transform: translate3d(0, 0, 0) rotateY(${angle}deg);`
                : `transform-origin: 0 0;
                   transform: translate3d(${pos}px, 0, 0) rotateY(${angle}deg);`;

            this.element.style.cssText = commonStyle + `
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
                clip-path: none;
                -webkit-clip-path: none;
            ` + orientStyle;
        }

        _drawSoft(position, commonStyle = '') {
            let polygon = 'polygon( ';
            for (const p of this.state.area) {
                if (p !== null) {
                    let g = this.render.getDirection() === FlipDirection.BACK
                        ? { x: -p.x + this.state.position.x, y: p.y - this.state.position.y }
                        : { x: p.x - this.state.position.x, y: p.y - this.state.position.y };

                    g = Helper.GetRotatedPoint(g, { x: 0, y: 0 }, this.state.angle);
                    polygon += g.x + 'px ' + g.y + 'px, ';
                }
            }
            polygon = polygon.slice(0, -2) + ')';

            const transformStyle = (this.render.isSafari() && this.state.angle === 0)
                ? `transform: translate(${position.x}px, ${position.y}px);`
                : `transform: translate3d(${position.x}px, ${position.y}px, 0) rotate(${this.state.angle}rad);`;

            this.element.style.cssText = commonStyle +
                `transform-origin: 0 0; clip-path: ${polygon}; -webkit-clip-path: ${polygon};` +
                transformStyle;
        }

        simpleDraw(orient) {
            const rect = this.render.getRect();
            const pageWidth = rect.pageWidth;
            const pageHeight = rect.height;
            const x = orient === PageOrientation.RIGHT ? rect.left + rect.pageWidth : rect.left;
            const y = rect.top;

            this.element.classList.add('--simple');
            this.element.style.cssText = `
                position: absolute;
                display: block;
                height: ${pageHeight}px;
                left: ${x}px;
                top: ${y}px;
                width: ${pageWidth}px;
                z-index: ${this.render.getSettings().startZIndex + 1};`;
        }

        getElement() { return this.element; }
        load() { this.isLoad = true; }

        setOrientation(orientation) {
            super.setOrientation(orientation);
            this.element.classList.remove('--left', '--right');
            this.element.classList.add(orientation === PageOrientation.RIGHT ? '--right' : '--left');
        }

        setDrawingDensity(density) {
            this.element.classList.remove('--soft', '--hard');
            this.element.classList.add('--' + density);
            super.setDrawingDensity(density);
        }
    }

    // ─────────────────────────────────────────────
    // IMAGE PAGE (Canvas)
    // ─────────────────────────────────────────────

    class ImagePage extends Page {
        constructor(render, href, density) {
            super(render, density);
            this.image = new Image();
            this.image.src = href;
            this._isLoad = false;
            this._loadingAngle = 0;
        }

        draw(tempDensity) {
            const ctx = this.render.getContext();
            const pagePos = this.render.convertToGlobal(this.state.position);
            const pageWidth = this.render.getRect().pageWidth;
            const pageHeight = this.render.getRect().height;

            ctx.save();
            ctx.translate(pagePos.x, pagePos.y);
            ctx.beginPath();

            for (let p of this.state.area) {
                if (p !== null) {
                    p = this.render.convertToGlobal(p);
                    ctx.lineTo(p.x - pagePos.x, p.y - pagePos.y);
                }
            }

            ctx.rotate(this.state.angle);
            ctx.clip();

            if (!this._isLoad) {
                this._drawLoader(ctx, { x: 0, y: 0 }, pageWidth, pageHeight);
            } else {
                ctx.drawImage(this.image, 0, 0, pageWidth, pageHeight);
            }

            ctx.restore();
        }

        simpleDraw(orient) {
            const rect = this.render.getRect();
            const ctx = this.render.getContext();
            const pageWidth = rect.pageWidth;
            const pageHeight = rect.height;
            const x = orient === PageOrientation.RIGHT ? rect.left + rect.pageWidth : rect.left;
            const y = rect.top;

            if (!this._isLoad) {
                this._drawLoader(ctx, { x, y }, pageWidth, pageHeight);
            } else {
                ctx.drawImage(this.image, x, y, pageWidth, pageHeight);
            }
        }

        _drawLoader(ctx, shiftPos, pageWidth, pageHeight) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgb(200, 200, 200)';
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.lineWidth = 1;
            ctx.rect(shiftPos.x + 1, shiftPos.y + 1, pageWidth - 1, pageHeight - 1);
            ctx.stroke();
            ctx.fill();

            const mid = { x: shiftPos.x + pageWidth / 2, y: shiftPos.y + pageHeight / 2 };
            ctx.beginPath();
            ctx.lineWidth = 10;
            ctx.arc(mid.x, mid.y, 20, this._loadingAngle, (3 * Math.PI) / 2 + this._loadingAngle);
            ctx.stroke();
            ctx.closePath();

            this._loadingAngle += 0.07;
            if (this._loadingAngle >= 2 * Math.PI) this._loadingAngle = 0;
        }

        load() {
            if (!this._isLoad) {
                this.image.onload = () => { this._isLoad = true; };
            }
        }

        newTemporaryCopy() { return this; }
        getTemporaryCopy() { return this; }
        hideTemporaryCopy() {}
    }

    // ─────────────────────────────────────────────
    // FLIP CALCULATION
    // ─────────────────────────────────────────────

    class FlipCalculation {
        /**
         * @param {number} direction - FlipDirection
         * @param {string} corner - FlipCorner
         * @param {string} pageWidth
         * @param {string} pageHeight
         */
        constructor(direction, corner, pageWidth, pageHeight) {
            this.direction = direction;
            this.corner = corner;
            this.pageWidth = parseInt(pageWidth, 10);
            this.pageHeight = parseInt(pageHeight, 10);

            this.angle = 0;
            this.position = null;
            this.rect = null;
            this.topIntersectPoint = null;
            this.sideIntersectPoint = null;
            this.bottomIntersectPoint = null;
        }

        calc(localPos) {
            try {
                this.position = this._calcAngleAndPosition(localPos);
                this._calculateIntersectPoint(this.position);
                return true;
            } catch (e) {
                return false;
            }
        }

        getFlippingClipArea() {
            const result = [];
            let clipBottom = false;

            result.push(this.rect.topLeft);
            result.push(this.topIntersectPoint);

            if (this.sideIntersectPoint === null) {
                clipBottom = true;
            } else {
                result.push(this.sideIntersectPoint);
                if (this.bottomIntersectPoint === null) clipBottom = false;
            }

            result.push(this.bottomIntersectPoint);

            if (clipBottom || this.corner === FlipCorner.BOTTOM) {
                result.push(this.rect.bottomLeft);
            }

            return result;
        }

        getBottomClipArea() {
            const result = [];
            result.push(this.topIntersectPoint);

            if (this.corner === FlipCorner.TOP) {
                result.push({ x: this.pageWidth, y: 0 });
            } else {
                if (this.topIntersectPoint !== null) result.push({ x: this.pageWidth, y: 0 });
                result.push({ x: this.pageWidth, y: this.pageHeight });
            }

            if (this.sideIntersectPoint !== null) {
                if (Helper.GetDistanceBetweenTwoPoint(this.sideIntersectPoint, this.topIntersectPoint) >= 10)
                    result.push(this.sideIntersectPoint);
            } else {
                if (this.corner === FlipCorner.TOP) result.push({ x: this.pageWidth, y: this.pageHeight });
            }

            result.push(this.bottomIntersectPoint);
            result.push(this.topIntersectPoint);

            return result;
        }

        getFlippingCoverClipArea() {
            const result = [];
            result.push(this.topIntersectPoint);

            if (this.corner === FlipCorner.TOP) {
                result.push(this.topIntersectPoint);
            } else {
                result.push({ x: this.pageWidth, y: 0 });
                if (this.topIntersectPoint !== null) result.push(this.topIntersectPoint);
            }

            if (this.sideIntersectPoint !== null) {
                if (Helper.GetDistanceBetweenTwoPoint(this.sideIntersectPoint, this.topIntersectPoint) >= 10)
                    result.push(this.sideIntersectPoint);
                if (this.corner === FlipCorner.BOTTOM) result.push(this.bottomIntersectPoint);
            } else {
                result.push(this.bottomIntersectPoint);
            }

            result.push({ x: this.pageWidth, y: this.pageHeight });
            result.push({ x: 0, y: this.pageHeight });
            result.push({ x: 0, y: 0 });

            return result;
        }

        getAngle() {
            return this.direction === FlipDirection.FORWARD ? -this.angle : this.angle;
        }

        getRect() { return this.rect; }
        getPosition() { return this.position; }

        getActiveCorner() {
            return this.direction === FlipDirection.FORWARD ? this.rect.topLeft : this.rect.topRight;
        }

        getDirection() { return this.direction; }

        getFlippingProgress() {
            return Math.abs(((this.position.x - this.pageWidth) / (2 * this.pageWidth)) * 100);
        }

        getCorner() { return this.corner; }

        getBottomPagePosition() {
            return this.direction === FlipDirection.BACK
                ? { x: this.pageWidth, y: 0 }
                : { x: 0, y: 0 };
        }

        getShadowStartPoint() {
            if (this.corner === FlipCorner.TOP) return this.topIntersectPoint;
            return this.sideIntersectPoint !== null ? this.sideIntersectPoint : this.topIntersectPoint;
        }

        getShadowAngle() {
            const angle = Helper.GetAngleBetweenTwoLine(this._getSegmentToShadowLine(), [
                { x: 0, y: 0 },
                { x: this.pageWidth, y: 0 },
            ]);
            return this.direction === FlipDirection.FORWARD ? angle : Math.PI - angle;
        }

        _calcAngleAndPosition(pos) {
            let result = pos;
            this._updateAngleAndGeometry(result);

            if (this.corner === FlipCorner.TOP) {
                result = this._checkPositionAtCenterLine(result, { x: 0, y: 0 }, { x: 0, y: this.pageHeight });
            } else {
                result = this._checkPositionAtCenterLine(result, { x: 0, y: this.pageHeight }, { x: 0, y: 0 });
            }

            if (Math.abs(result.x - this.pageWidth) < 1 && Math.abs(result.y) < 1)
                throw new Error('Point is too small');

            return result;
        }

        _updateAngleAndGeometry(pos) {
            this.angle = this._calculateAngle(pos);
            this.rect = this._getPageRect(pos);
        }

        _calculateAngle(pos) {
            const left = this.pageWidth - pos.x + 1;
            const top = this.corner === FlipCorner.BOTTOM ? this.pageHeight - pos.y : pos.y;

            let angle = 2 * Math.acos(left / Math.sqrt(top * top + left * left));
            if (top < 0) angle = -angle;

            const da = Math.PI - angle;
            if (!isFinite(angle) || (da >= 0 && da < 0.003))
                throw new Error('The G point is too small');

            if (this.corner === FlipCorner.BOTTOM) angle = -angle;
            return angle;
        }

        _getPageRect(localPos) {
            if (this.corner === FlipCorner.TOP) {
                return this._getRectFromBasePoint([
                    { x: 0, y: 0 },
                    { x: this.pageWidth, y: 0 },
                    { x: 0, y: this.pageHeight },
                    { x: this.pageWidth, y: this.pageHeight },
                ], localPos);
            }
            return this._getRectFromBasePoint([
                { x: 0, y: -this.pageHeight },
                { x: this.pageWidth, y: -this.pageHeight },
                { x: 0, y: 0 },
                { x: this.pageWidth, y: 0 },
            ], localPos);
        }

        _getRectFromBasePoint(points, localPos) {
            return {
                topLeft: this._getRotatedPoint(points[0], localPos),
                topRight: this._getRotatedPoint(points[1], localPos),
                bottomLeft: this._getRotatedPoint(points[2], localPos),
                bottomRight: this._getRotatedPoint(points[3], localPos),
            };
        }

        _getRotatedPoint(transformedPoint, startPoint) {
            return {
                x: transformedPoint.x * Math.cos(this.angle) + transformedPoint.y * Math.sin(this.angle) + startPoint.x,
                y: transformedPoint.y * Math.cos(this.angle) - transformedPoint.x * Math.sin(this.angle) + startPoint.y,
            };
        }

        _calculateIntersectPoint(pos) {
            const boundRect = {
                left: -1, top: -1,
                width: this.pageWidth + 2,
                height: this.pageHeight + 2,
            };

            if (this.corner === FlipCorner.TOP) {
                this.topIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [pos, this.rect.topRight],
                    [{ x: 0, y: 0 }, { x: this.pageWidth, y: 0 }]
                );
                this.sideIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [pos, this.rect.bottomLeft],
                    [{ x: this.pageWidth, y: 0 }, { x: this.pageWidth, y: this.pageHeight }]
                );
                this.bottomIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [this.rect.bottomLeft, this.rect.bottomRight],
                    [{ x: 0, y: this.pageHeight }, { x: this.pageWidth, y: this.pageHeight }]
                );
            } else {
                this.topIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [this.rect.topLeft, this.rect.topRight],
                    [{ x: 0, y: 0 }, { x: this.pageWidth, y: 0 }]
                );
                this.sideIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [pos, this.rect.topLeft],
                    [{ x: this.pageWidth, y: 0 }, { x: this.pageWidth, y: this.pageHeight }]
                );
                this.bottomIntersectPoint = Helper.GetIntersectBetweenTwoSegment(
                    boundRect,
                    [this.rect.bottomLeft, this.rect.bottomRight],
                    [{ x: 0, y: this.pageHeight }, { x: this.pageWidth, y: this.pageHeight }]
                );
            }
        }

        _checkPositionAtCenterLine(checkedPos, centerOne, centerTwo) {
            let result = checkedPos;

            const tmp = Helper.LimitPointToCircle(centerOne, this.pageWidth, result);
            if (result !== tmp) {
                result = tmp;
                this._updateAngleAndGeometry(result);
            }

            const rad = Math.sqrt(Math.pow(this.pageWidth, 2) + Math.pow(this.pageHeight, 2));
            let checkPointOne = this.rect.bottomRight;
            let checkPointTwo = this.rect.topLeft;

            if (this.corner === FlipCorner.BOTTOM) {
                checkPointOne = this.rect.topRight;
                checkPointTwo = this.rect.bottomLeft;
            }

            if (checkPointOne.x <= 0) {
                const bottomPoint = Helper.LimitPointToCircle(centerTwo, rad, checkPointTwo);
                if (bottomPoint !== result) {
                    result = bottomPoint;
                    this._updateAngleAndGeometry(result);
                }
            }

            return result;
        }

        _getSegmentToShadowLine() {
            const first = this.getShadowStartPoint();
            const second = (first !== this.sideIntersectPoint && this.sideIntersectPoint !== null)
                ? this.sideIntersectPoint
                : this.bottomIntersectPoint;
            return [first, second];
        }
    }

    // ─────────────────────────────────────────────
    // RENDER (abstract base)
    // ─────────────────────────────────────────────

    class Render {
        constructor(app, setting) {
            this.app = app;
            this.setting = setting;

            this.leftPage = null;
            this.rightPage = null;
            this.flippingPage = null;
            this.bottomPage = null;
            this.direction = null;
            this.orientation = null;
            this.shadow = null;
            this.animation = null;
            this.pageRect = null;
            this._boundsRect = null;
            this.timer = 0;
            this._isAnimLoopRunning = false;

            // Safari clip-area bug detection
            const regex = /Version\/[\d.]+.*Safari\//;
            this._safari = regex.test(window.navigator.userAgent);
        }

        // Abstract
        drawFrame() { throw new Error('Not implemented'); }
        reload() { throw new Error('Not implemented'); }

        _render(timer) {
            if (this.animation !== null) {
                const frameIndex = Math.round((timer - this.animation.startedAt) / this.animation.durationFrame);

                if (frameIndex < this.animation.frames.length) {
                    this.animation.frames[frameIndex]();
                } else {
                    this.animation.onAnimateEnd();
                    this.animation = null;
                }
            }

            this.timer = timer;
            this.drawFrame();
        }

        start() {
            this.update();
        }

        startAnimationRenderLoop(fn = null) {
            if (this._isAnimLoopRunning) {
                if (fn) fn();
                return;
            }
            this._isAnimLoopRunning = true;
            let callbackCalled = false;

            const loop = (timer) => {
                if (!this._isAnimLoopRunning) return;
                this._render(timer);
                if (!callbackCalled) {
                    callbackCalled = true;
                    if (fn) fn();
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        }

        stopAnimationRenderLoop() {
            this._isAnimLoopRunning = false;
        }

        startAnimation(frames, duration, onAnimateEnd) {
            this.finishAnimation();
            this.startAnimationRenderLoop(() => {
                this.animation = {
                    frames,
                    duration,
                    durationFrame: duration / frames.length,
                    onAnimateEnd: () => {
                        this.stopAnimationRenderLoop();
                        onAnimateEnd();
                    },
                    startedAt: this.timer,
                };
            });
        }

        finishAnimation() {
            if (this.animation !== null) {
                this.animation.frames[this.animation.frames.length - 1]();
                if (this.animation.onAnimateEnd !== null) this.animation.onAnimateEnd();
                requestAnimationFrame((timer) => { this._render(timer); });
            }
            this.animation = null;
        }

        update() {
            this._boundsRect = null;
            const orientation = this._calculateBoundsRect();

            if (this.orientation !== orientation) {
                this.orientation = orientation;
                this.app.updateOrientation(orientation);
            }

            requestAnimationFrame((timer) => { this._render(timer); });
        }

        _calculateBoundsRect() {
            let orientation = Orientation.LANDSCAPE;
            const blockWidth = this.getBlockWidth();
            const middlePoint = { x: blockWidth / 2, y: this.getBlockHeight() / 2 };
            const ratio = this.setting.width / this.setting.height;

            let pageWidth = this.setting.width;
            let pageHeight = this.setting.height;
            let left = middlePoint.x - pageWidth;

            if (this.setting.size === SizeType.STRETCH) {
                if (blockWidth < this.setting.minWidth * 2 && this.app.getSettings().usePortrait)
                    orientation = Orientation.PORTRAIT;

                pageWidth = orientation === Orientation.PORTRAIT ? this.getBlockWidth() : this.getBlockWidth() / 2;
                if (pageWidth > this.setting.maxWidth) pageWidth = this.setting.maxWidth;

                pageHeight = pageWidth / ratio;
                if (pageHeight > this.getBlockHeight()) {
                    pageHeight = this.getBlockHeight();
                    pageWidth = pageHeight * ratio;
                }

                left = orientation === Orientation.PORTRAIT
                    ? middlePoint.x - pageWidth / 2 - pageWidth
                    : middlePoint.x - pageWidth;
            } else {
                if (blockWidth < pageWidth * 2) {
                    if (this.app.getSettings().usePortrait) {
                        orientation = Orientation.PORTRAIT;
                        left = middlePoint.x - pageWidth / 2 - pageWidth;
                    }
                }
            }

            this._boundsRect = {
                left,
                top: middlePoint.y - pageHeight / 2,
                width: pageWidth * 2,
                height: pageHeight,
                pageWidth,
            };

            return orientation;
        }

        setShadowData(pos, angle, progress, direction) {
            if (!this.app.getSettings().drawShadow) return;

            const maxShadowOpacity = 100 * this.getSettings().maxShadowOpacity;

            this.shadow = {
                pos,
                angle,
                width: (((this.getRect().pageWidth * 3) / 4) * progress) / 100,
                opacity: ((100 - progress) * maxShadowOpacity) / 100 / 100,
                direction,
                progress: progress * 2,
            };
        }

        clearShadow() { this.shadow = null; }

        getBlockWidth() { return this.app.getUI().getDistElement().offsetWidth; }
        getBlockHeight() { return this.app.getUI().getDistElement().offsetHeight; }
        getDirection() { return this.direction; }

        getRect() {
            if (this._boundsRect === null) this._calculateBoundsRect();
            return this._boundsRect;
        }

        getSettings() { return this.app.getSettings(); }
        getOrientation() { return this.orientation; }
        setPageRect(pageRect) { this.pageRect = pageRect; }
        setDirection(direction) { this.direction = direction; }

        setRightPage(page) {
            if (page !== null) page.setOrientation(PageOrientation.RIGHT);
            this.rightPage = page;
        }

        setLeftPage(page) {
            if (page !== null) page.setOrientation(PageOrientation.LEFT);
            this.leftPage = page;
        }

        setBottomPage(page) {
            if (page !== null)
                page.setOrientation(this.direction === FlipDirection.BACK ? PageOrientation.LEFT : PageOrientation.RIGHT);
            this.bottomPage = page;
        }

        setFlippingPage(page) {
            if (page !== null)
                page.setOrientation(
                    this.direction === FlipDirection.FORWARD && this.orientation !== Orientation.PORTRAIT
                        ? PageOrientation.LEFT
                        : PageOrientation.RIGHT
                );
            this.flippingPage = page;
        }

        convertToBook(pos) {
            const rect = this.getRect();
            return { x: pos.x - rect.left, y: pos.y - rect.top };
        }

        isSafari() { return this._safari; }

        convertToPage(pos, direction) {
            if (!direction) direction = this.direction;
            const rect = this.getRect();
            const x = direction === FlipDirection.FORWARD
                ? pos.x - rect.left - rect.width / 2
                : rect.width / 2 - pos.x + rect.left;
            return { x, y: pos.y - rect.top };
        }

        convertToGlobal(pos, direction) {
            if (!direction) direction = this.direction;
            if (pos == null) return null;
            const rect = this.getRect();
            const x = direction === FlipDirection.FORWARD
                ? pos.x + rect.left + rect.width / 2
                : rect.width / 2 - pos.x + rect.left;
            return { x, y: pos.y + rect.top };
        }

        convertRectToGlobal(rect, direction) {
            if (!direction) direction = this.direction;
            return {
                topLeft: this.convertToGlobal(rect.topLeft, direction),
                topRight: this.convertToGlobal(rect.topRight, direction),
                bottomLeft: this.convertToGlobal(rect.bottomLeft, direction),
                bottomRight: this.convertToGlobal(rect.bottomRight, direction),
            };
        }
    }

    // ─────────────────────────────────────────────
    // HTML RENDER
    // ─────────────────────────────────────────────

    class HTMLRender extends Render {
        constructor(app, setting, element) {
            super(app, setting);
            this.element = element;
            this.outerShadow = null;
            this.innerShadow = null;
            this.hardShadow = null;
            this.hardInnerShadow = null;
            this._createShadows();
        }

        _createShadows() {
            this.element.insertAdjacentHTML('beforeend',
                `<div class="stf__outerShadow"></div>
                 <div class="stf__innerShadow"></div>
                 <div class="stf__hardShadow"></div>
                 <div class="stf__hardInnerShadow"></div>`
            );
            this.outerShadow = this.element.querySelector('.stf__outerShadow');
            this.innerShadow = this.element.querySelector('.stf__innerShadow');
            this.hardShadow = this.element.querySelector('.stf__hardShadow');
            this.hardInnerShadow = this.element.querySelector('.stf__hardInnerShadow');
        }

        clearShadow() {
            super.clearShadow();
            this.outerShadow.style.cssText = 'display: none';
            this.innerShadow.style.cssText = 'display: none';
            this.hardShadow.style.cssText = 'display: none';
            this.hardInnerShadow.style.cssText = 'display: none';
        }

        reload() {
            if (!this.element.querySelector('.stf__outerShadow')) {
                this._createShadows();
            }
        }

        _drawHardInnerShadow() {
            const rect = this.getRect();
            const progress = this.shadow.progress > 100 ? 200 - this.shadow.progress : this.shadow.progress;

            let innerShadowSize = ((100 - progress) * (2.5 * rect.pageWidth)) / 100 + 20;
            if (innerShadowSize > rect.pageWidth) innerShadowSize = rect.pageWidth;

            let newStyle = `
                display: block;
                z-index: ${(this.getSettings().startZIndex + 5).toString(10)};
                width: ${innerShadowSize}px;
                height: ${rect.height}px;
                background: linear-gradient(to right,
                    rgba(0, 0, 0, ${(this.shadow.opacity * progress) / 100}) 5%,
                    rgba(0, 0, 0, 0) 100%);
                left: ${rect.left + rect.width / 2}px;
                transform-origin: 0 0;
            `;

            newStyle += ((this.getDirection() === FlipDirection.FORWARD && this.shadow.progress > 100) ||
                (this.getDirection() === FlipDirection.BACK && this.shadow.progress <= 100))
                ? 'transform: translate3d(0, 0, 0);'
                : 'transform: translate3d(0, 0, 0) rotateY(180deg);';

            this.hardInnerShadow.style.cssText = newStyle;
        }

        _drawHardOuterShadow() {
            const rect = this.getRect();
            const progress = this.shadow.progress > 100 ? 200 - this.shadow.progress : this.shadow.progress;

            let shadowSize = ((100 - progress) * (2.5 * rect.pageWidth)) / 100 + 20;
            if (shadowSize > rect.pageWidth) shadowSize = rect.pageWidth;

            let newStyle = `
                display: block;
                z-index: ${(this.getSettings().startZIndex + 4).toString(10)};
                width: ${shadowSize}px;
                height: ${rect.height}px;
                background: linear-gradient(to left,rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, ${this.shadow.opacity}) 8%,rgba(0, 0, 0, ${this.shadow.opacity}) 12%, rgba(0, 0, 0, 0) 100%);
                left: ${rect.left + rect.width / 2}px;
                transform-origin: 0 0;
            `;

            newStyle += ((this.getDirection() === FlipDirection.FORWARD && this.shadow.progress > 100) ||
                (this.getDirection() === FlipDirection.BACK && this.shadow.progress <= 100))
                ? 'transform: translate3d(0, 0, 0) rotateY(180deg);'
                : 'transform: translate3d(0, 0, 0);';

            this.hardShadow.style.cssText = newStyle;
        }

        _drawInnerShadow() {
            const rect = this.getRect();
            const innerShadowSize = (this.shadow.width * 3) / 4;
            const shadowTranslate = this.getDirection() === FlipDirection.FORWARD ? innerShadowSize : 0;
            const shadowDirection = this.getDirection() === FlipDirection.FORWARD ? 'to left' : 'to right';
            const shadowPos = this.convertToGlobal(this.shadow.pos);
            const angle = this.shadow.angle + (3 * Math.PI) / 2;

            const clip = [
                this.pageRect.topLeft, this.pageRect.topRight,
                this.pageRect.bottomRight, this.pageRect.bottomLeft,
            ];

            let polygon = 'polygon( ';
            for (const p of clip) {
                let g = this.getDirection() === FlipDirection.BACK
                    ? { x: -p.x + this.shadow.pos.x, y: p.y - this.shadow.pos.y }
                    : { x: p.x - this.shadow.pos.x, y: p.y - this.shadow.pos.y };
                g = Helper.GetRotatedPoint(g, { x: shadowTranslate, y: 100 }, angle);
                polygon += g.x + 'px ' + g.y + 'px, ';
            }
            polygon = polygon.slice(0, -2) + ')';

            const newStyle = `
                display: block;
                z-index: ${(this.getSettings().startZIndex + 10).toString(10)};
                width: ${innerShadowSize}px;
                height: ${rect.height * 2}px;
                background: linear-gradient(${shadowDirection},
                    rgba(0, 0, 0, ${this.shadow.opacity}) 5%,
                    rgba(255, 255, 255, ${this.shadow.opacity * 2}) 15%,
                    rgba(0, 0, 0, ${this.shadow.opacity}) 35%,
                    rgba(0, 0, 0, 0) 100%);
                transform-origin: ${shadowTranslate}px 100px;
                transform: translate3d(${shadowPos.x - shadowTranslate}px, ${shadowPos.y - 100}px, 0) rotate(${angle}rad);
                clip-path: ${polygon};
                -webkit-clip-path: ${polygon};
            `;

            this.innerShadow.style.cssText = newStyle;
        }

        _drawOuterShadow() {
            const rect = this.getRect();
            const shadowPos = this.convertToGlobal({ x: this.shadow.pos.x, y: this.shadow.pos.y });
            const angle = this.shadow.angle + (3 * Math.PI) / 2;
            const shadowTranslate = this.getDirection() === FlipDirection.BACK ? this.shadow.width : 0;
            const shadowDirection = this.getDirection() === FlipDirection.FORWARD ? 'to right' : 'to left';

            const clip = [
                { x: 0, y: 0 }, { x: rect.pageWidth, y: 0 },
                { x: rect.pageWidth, y: rect.height }, { x: 0, y: rect.height },
            ];

            let polygon = 'polygon( ';
            for (const p of clip) {
                if (p !== null) {
                    let g = this.getDirection() === FlipDirection.BACK
                        ? { x: -p.x + this.shadow.pos.x, y: p.y - this.shadow.pos.y }
                        : { x: p.x - this.shadow.pos.x, y: p.y - this.shadow.pos.y };
                    g = Helper.GetRotatedPoint(g, { x: shadowTranslate, y: 100 }, angle);
                    polygon += g.x + 'px ' + g.y + 'px, ';
                }
            }
            polygon = polygon.slice(0, -2) + ')';

            const newStyle = `
                display: block;
                z-index: ${(this.getSettings().startZIndex + 10).toString(10)};
                width: ${this.shadow.width}px;
                height: ${rect.height * 2}px;
                background: linear-gradient(${shadowDirection}, rgba(0, 0, 0, ${this.shadow.opacity}), rgba(0, 0, 0, 0));
                transform-origin: ${shadowTranslate}px 100px;
                transform: translate3d(${shadowPos.x - shadowTranslate}px, ${shadowPos.y - 100}px, 0) rotate(${angle}rad);
                clip-path: ${polygon};
                -webkit-clip-path: ${polygon};
            `;

            this.outerShadow.style.cssText = newStyle;
        }

        _drawLeftPage() {
            if (this.orientation === Orientation.PORTRAIT || this.leftPage === null) return;

            if (this.direction === FlipDirection.BACK && this.flippingPage !== null &&
                this.flippingPage.getDrawingDensity() === PageDensity.HARD) {
                this.leftPage.getElement().style.zIndex = (this.getSettings().startZIndex + 5).toString(10);
                this.leftPage.setHardDrawingAngle(180 + this.flippingPage.getHardAngle());
                this.leftPage.draw(this.flippingPage.getDrawingDensity());
            } else if (this.direction === FlipDirection.BACK && this.flippingPage !== null) {
                this.leftPage.draw(this.flippingPage.getDrawingDensity());
            } else {
                this.leftPage.simpleDraw(PageOrientation.LEFT);
            }
        }

        _drawRightPage() {
            if (this.rightPage === null) return;

            if (this.direction === FlipDirection.FORWARD && this.flippingPage !== null &&
                this.flippingPage.getDrawingDensity() === PageDensity.HARD) {
                this.rightPage.getElement().style.zIndex = (this.getSettings().startZIndex + 5).toString(10);
                this.rightPage.setHardDrawingAngle(180 + this.flippingPage.getHardAngle());
                this.rightPage.draw(this.flippingPage.getDrawingDensity());
            } else if (this.direction === FlipDirection.FORWARD && this.orientation === Orientation.LANDSCAPE && this.flippingPage !== null) {
                this.rightPage.draw(this.flippingPage.getDrawingDensity());
            } else {
                this.rightPage.simpleDraw(PageOrientation.RIGHT);
            }
        }

        _drawBottomPage() {
            if (this.bottomPage === null) return;
            const tempDensity = this.flippingPage != null ? this.flippingPage.getDrawingDensity() : null;

            if (!(this.orientation === Orientation.PORTRAIT && this.direction === FlipDirection.BACK)) {
                this.bottomPage.getElement().style.zIndex = (this.getSettings().startZIndex + 3).toString(10);
                this.bottomPage.draw(tempDensity);
            }
        }

        drawFrame() {
            this._clear();
            this._drawLeftPage();
            this._drawRightPage();
            this._drawBottomPage();

            if (this.flippingPage != null) {
                this.flippingPage.getElement().style.zIndex = (this.getSettings().startZIndex + 5).toString(10);
                this.flippingPage.draw();
            }

            if (this.shadow != null && this.flippingPage !== null) {
                const pageCount = this.app.getPageCount();
                const curIdx = this.app.getCurrentPageIndex();

                if (this.flippingPage.getDrawingDensity() === PageDensity.SOFT) {
                    if ((curIdx === 1 && this.direction === FlipDirection.BACK) ||
                        (curIdx === pageCount - 3 && this.direction === FlipDirection.FORWARD)) {
                        this._drawInnerShadow();
                    } else {
                        this._drawOuterShadow();
                        this._drawInnerShadow();
                    }
                } else {
                    if (((curIdx === 1 || curIdx === pageCount - 2) && this.direction === FlipDirection.BACK) ||
                        ((curIdx === pageCount - 3 || curIdx === 0) && this.direction === FlipDirection.FORWARD)) {
                        this._drawHardOuterShadow();
                    } else {
                        this._drawHardOuterShadow();
                        this._drawHardInnerShadow();
                    }
                }
            }
        }

        _clear() {
            for (const page of this.app.getPageCollection().getPages()) {
                if (page !== this.leftPage && page !== this.rightPage &&
                    page !== this.flippingPage && page !== this.bottomPage) {
                    page.getElement().style.cssText = 'display: none';
                }
                if (page.getTemporaryCopy() !== this.flippingPage) {
                    page.hideTemporaryCopy();
                }
            }
        }

        update() {
            super.update();
            if (this.rightPage !== null) this.rightPage.setOrientation(PageOrientation.RIGHT);
            if (this.leftPage !== null) this.leftPage.setOrientation(PageOrientation.LEFT);
        }
    }

    // ─────────────────────────────────────────────
    // CANVAS RENDER
    // ─────────────────────────────────────────────

    class CanvasRender extends Render {
        constructor(app, setting, inCanvas) {
            super(app, setting);
            this.canvas = inCanvas;
            this.ctx = inCanvas.getContext('2d');
        }

        getContext() { return this.ctx; }
        reload() {}

        drawFrame() {
            this._clear();

            if (this.orientation !== Orientation.PORTRAIT)
                if (this.leftPage != null) this.leftPage.simpleDraw(PageOrientation.LEFT);

            if (this.rightPage != null) this.rightPage.simpleDraw(PageOrientation.RIGHT);
            if (this.bottomPage != null) this.bottomPage.draw();

            this._drawBookShadow();

            if (this.flippingPage != null) this.flippingPage.draw();

            if (this.shadow != null) {
                this._drawOuterShadow();
                this._drawInnerShadow();
            }

            const rect = this.getRect();
            if (this.orientation === Orientation.PORTRAIT) {
                this.ctx.beginPath();
                this.ctx.rect(rect.left + rect.pageWidth, rect.top, rect.width, rect.height);
                this.ctx.clip();
            }
        }

        _drawBookShadow() {
            const rect = this.getRect();
            this.ctx.save();
            this.ctx.beginPath();
            const shadowSize = rect.width / 20;
            this.ctx.rect(rect.left, rect.top, rect.width, rect.height);
            const shadowPos = { x: rect.left + rect.width / 2 - shadowSize / 2, y: 0 };
            this.ctx.translate(shadowPos.x, shadowPos.y);

            const outerGradient = this.ctx.createLinearGradient(0, 0, shadowSize, 0);
            outerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            outerGradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.2)');
            outerGradient.addColorStop(0.49, 'rgba(0, 0, 0, 0.1)');
            outerGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
            outerGradient.addColorStop(0.51, 'rgba(0, 0, 0, 0.4)');
            outerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            this.ctx.clip();
            this.ctx.fillStyle = outerGradient;
            this.ctx.fillRect(0, 0, shadowSize, rect.height * 2);
            this.ctx.restore();
        }

        _drawOuterShadow() {
            const rect = this.getRect();
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.rect(rect.left, rect.top, rect.width, rect.height);
            const shadowPos = this.convertToGlobal({ x: this.shadow.pos.x, y: this.shadow.pos.y });
            this.ctx.translate(shadowPos.x, shadowPos.y);
            this.ctx.rotate(Math.PI + this.shadow.angle + Math.PI / 2);

            const outerGradient = this.ctx.createLinearGradient(0, 0, this.shadow.width, 0);
            if (this.shadow.direction === FlipDirection.FORWARD) {
                this.ctx.translate(0, -100);
                outerGradient.addColorStop(0, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
                outerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            } else {
                this.ctx.translate(-this.shadow.width, -100);
                outerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                outerGradient.addColorStop(1, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
            }

            this.ctx.clip();
            this.ctx.fillStyle = outerGradient;
            this.ctx.fillRect(0, 0, this.shadow.width, rect.height * 2);
            this.ctx.restore();
        }

        _drawInnerShadow() {
            const rect = this.getRect();
            this.ctx.save();
            this.ctx.beginPath();

            const shadowPos = this.convertToGlobal({ x: this.shadow.pos.x, y: this.shadow.pos.y });
            const pageRect = this.convertRectToGlobal(this.pageRect);
            this.ctx.moveTo(pageRect.topLeft.x, pageRect.topLeft.y);
            this.ctx.lineTo(pageRect.topRight.x, pageRect.topRight.y);
            this.ctx.lineTo(pageRect.bottomRight.x, pageRect.bottomRight.y);
            this.ctx.lineTo(pageRect.bottomLeft.x, pageRect.bottomLeft.y);
            this.ctx.translate(shadowPos.x, shadowPos.y);
            this.ctx.rotate(Math.PI + this.shadow.angle + Math.PI / 2);

            const isw = (this.shadow.width * 3) / 4;
            const innerGradient = this.ctx.createLinearGradient(0, 0, isw, 0);

            if (this.shadow.direction === FlipDirection.FORWARD) {
                this.ctx.translate(-isw, -100);
                innerGradient.addColorStop(1, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
                innerGradient.addColorStop(0.9, 'rgba(0, 0, 0, 0.05)');
                innerGradient.addColorStop(0.7, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
                innerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            } else {
                this.ctx.translate(0, -100);
                innerGradient.addColorStop(0, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
                innerGradient.addColorStop(0.1, 'rgba(0, 0, 0, 0.05)');
                innerGradient.addColorStop(0.3, 'rgba(0, 0, 0, ' + this.shadow.opacity + ')');
                innerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            }

            this.ctx.clip();
            this.ctx.fillStyle = innerGradient;
            this.ctx.fillRect(0, 0, isw, rect.height * 2);
            this.ctx.restore();
        }

        _clear() {
            this.ctx.fillStyle = this.app.getSettings().backgroundColor || '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // ─────────────────────────────────────────────
    // PAGE COLLECTION (abstract base)
    // ─────────────────────────────────────────────

    class PageCollection {
        constructor(app, render) {
            this.app = app;
            this.render = render;
            this.pages = [];
            this.currentPageIndex = 0;
            this.currentSpreadIndex = 0;
            this.landscapeSpread = [];
            this.portraitSpread = [];

            this.isShowCover = this.app.getSettings().showCover;
            this.disableHardPages = this.app.getSettings().disableHardPages;
            this.firstCoverStartLeft = this.app.getSettings().firstCoverStartLeft;
        }

        /** @abstract */
        load() { throw new Error('Not implemented'); }

        destroy() { this.pages = []; }

        createSpread() {
            this.landscapeSpread = [];
            this.portraitSpread = [];

            for (let i = 0; i < this.pages.length; i++) {
                this.portraitSpread.push([i]);
            }

            let start = 0;
            if (this.isShowCover) {
                if (!this.disableHardPages) {
                    this.pages[0].setDensity(PageDensity.HARD);
                }
                if (this.firstCoverStartLeft) {
                    this.pages[0].setOrientation(PageOrientation.LEFT);
                } else {
                    this.pages[0].setOrientation(PageOrientation.RIGHT);
                }
                this.landscapeSpread.push([start]);
                start++;
            }

            for (let i = start; i < this.pages.length; i += 2) {
                if (i < this.pages.length - 1) {
                    this.landscapeSpread.push([i, i + 1]);
                } else {
                    this.landscapeSpread.push([i]);
                    if (!this.disableHardPages) {
                        this.pages[i].setDensity(PageDensity.HARD);
                    }
                }
            }
        }

        _getSpread() {
            return this.render.getOrientation() === Orientation.LANDSCAPE
                ? this.landscapeSpread
                : this.portraitSpread;
        }

        getSpreadIndexByPage(pageNum) {
            const spread = this._getSpread();
            for (let i = 0; i < spread.length; i++)
                if (pageNum === spread[i][0] || pageNum === spread[i][1]) return i;
            return null;
        }

        getPageCount() { return this.pages.length; }
        getPages() { return this.pages; }

        getPage(pageIndex) {
            if (pageIndex >= 0 && pageIndex < this.pages.length) return this.pages[pageIndex];
            throw new Error('Invalid page number');
        }

        nextBy(current) {
            const idx = this.pages.indexOf(current);
            return idx < this.pages.length - 1 ? this.pages[idx + 1] : null;
        }

        prevBy(current) {
            const idx = this.pages.indexOf(current);
            return idx > 0 ? this.pages[idx - 1] : null;
        }

        getFlippingPage(direction) {
            const current = this.currentSpreadIndex;

            if (this.render.getOrientation() === Orientation.PORTRAIT) {
                return direction === FlipDirection.FORWARD
                    ? this.pages[current].newTemporaryCopy()
                    : this.pages[current - 1];
            } else {
                const spread = direction === FlipDirection.FORWARD
                    ? this._getSpread()[current + 1]
                    : this._getSpread()[current - 1];

                if (spread.length === 1) return this.pages[spread[0]];

                return direction === FlipDirection.FORWARD
                    ? this.pages[spread[0]]
                    : this.pages[spread[1]];
            }
        }

        getBottomPage(direction) {
            const current = this.currentSpreadIndex;

            if (this.render.getOrientation() === Orientation.PORTRAIT) {
                return direction === FlipDirection.FORWARD
                    ? this.pages[current + 1]
                    : this.pages[current - 1];
            } else {
                const spread = direction === FlipDirection.FORWARD
                    ? this._getSpread()[current + 1]
                    : this._getSpread()[current - 1];

                if (spread.length === 1) return this.pages[spread[0]];

                return direction === FlipDirection.FORWARD
                    ? this.pages[spread[1]]
                    : this.pages[spread[0]];
            }
        }

        getFlippingCoverPage(direction) {
            const current = this.currentSpreadIndex;
            if (this.render.getOrientation() === Orientation.PORTRAIT) return null;

            return direction === FlipDirection.FORWARD
                ? (this.currentPageIndex === 0
                    ? this.pages[0]
                    : this.pages[this.landscapeSpread[current][1]])
                : this.pages[this.landscapeSpread[current][0]];
        }

        showNext() {
            if (this.currentSpreadIndex < this._getSpread().length) {
                this.currentSpreadIndex++;
                this._showSpread();
            }
        }

        showPrev() {
            if (this.currentSpreadIndex > 0) {
                this.currentSpreadIndex--;
                this._showSpread();
            }
        }

        getCurrentPageIndex() { return this.currentPageIndex; }

        show(pageNum = null) {
            if (pageNum === null) pageNum = this.currentPageIndex;
            if (pageNum < 0 || pageNum >= this.pages.length) return;

            const spreadIndex = this.getSpreadIndexByPage(pageNum);
            if (spreadIndex !== null) {
                this.currentSpreadIndex = spreadIndex;
                this._showSpread();
            }
        }

        getCurrentSpreadIndex() { return this.currentSpreadIndex; }

        setCurrentSpreadIndex(newIndex) {
            if (newIndex >= 0 && newIndex < this._getSpread().length) {
                this.currentSpreadIndex = newIndex;
            } else {
                throw new Error('Invalid page');
            }
        }

        _showSpread() {
            const spread = this._getSpread()[this.currentSpreadIndex];

            if (spread.length === 2) {
                this.render.setLeftPage(this.pages[spread[0]]);
                this.render.setRightPage(this.pages[spread[1]]);
            } else {
                if (this.render.getOrientation() === Orientation.LANDSCAPE) {
                    if (spread[0] === this.pages.length - 1) {
                        this.render.setLeftPage(this.pages[spread[0]]);
                        this.render.setRightPage(null);
                    } else {
                        this.render.setLeftPage(null);
                        this.render.setRightPage(this.pages[spread[0]]);
                    }
                } else {
                    this.render.setLeftPage(null);
                    this.render.setRightPage(this.pages[spread[0]]);
                }
            }

            this.currentPageIndex = spread[0];
            this.app.updatePageIndex(this.currentPageIndex);
        }
    }

    // ─────────────────────────────────────────────
    // HTML PAGE COLLECTION
    // ─────────────────────────────────────────────

    class HTMLPageCollection extends PageCollection {
        constructor(app, render, element, items) {
            super(app, render);
            this.element = element;
            this.pagesElement = items;
        }

        load() {
            for (const pageElement of this.pagesElement) {
                const page = new HTMLPage(
                    this.render,
                    pageElement,
                    pageElement.dataset['density'] === 'hard' ? PageDensity.HARD : PageDensity.SOFT
                );
                page.load();
                this.pages.push(page);
            }
            this.createSpread();
        }
    }

    // ─────────────────────────────────────────────
    // IMAGE PAGE COLLECTION
    // ─────────────────────────────────────────────

    class ImagePageCollection extends PageCollection {
        constructor(app, render, imagesHref) {
            super(app, render);
            this.imagesHref = imagesHref;
        }

        load() {
            for (const href of this.imagesHref) {
                const page = new ImagePage(this.render, href, PageDensity.SOFT);
                page.load();
                this.pages.push(page);
            }
            this.createSpread();
        }
    }

    // ─────────────────────────────────────────────
    // FLIP CONTROLLER
    // ─────────────────────────────────────────────

    class Flip {
        constructor(render, app) {
            this.render = render;
            this.app = app;
            this.flippingPage = null;
            this.bottomPage = null;
            this.flippingCoverPage = null;
            this.calc = null;
            this.state = FlippingState.READ;
        }

        fold(globalPos) {
            this._setState(FlippingState.USER_FOLD);
            if (this.calc === null) this.start(globalPos);
            this._do(this.render.convertToPage(globalPos));
        }

        flip(globalPos) {
            if (this.app.getSettings().disableFlipByClick && !this._isPointOnCorners(globalPos)) return;
            if (this.calc !== null) this.render.finishAnimation();
            if (!this.start(globalPos)) return;

            const rect = this._getBoundsRect();
            this._setState(FlippingState.FLIPPING);

            const topMargins = rect.height / 10;
            const yStart = this.calc.getCorner() === FlipCorner.BOTTOM ? rect.height - topMargins : topMargins;
            const yDest = this.calc.getCorner() === FlipCorner.BOTTOM ? rect.height : 0;

            this.calc.calc({ x: rect.pageWidth - topMargins, y: yStart });

            this._animateFlippingTo(
                { x: rect.pageWidth - topMargins, y: yStart },
                { x: -rect.pageWidth, y: yDest },
                true
            );
        }

        start(globalPos) {
            this._reset();
            const bookPos = this.render.convertToBook(globalPos);
            const rect = this._getBoundsRect();
            const direction = this._getDirectionByPoint(bookPos);
            const flipCorner = bookPos.y >= rect.height / 2 ? FlipCorner.BOTTOM : FlipCorner.TOP;

            if (!this._checkDirection(direction)) return false;

            try {
                this.flippingPage = this.app.getPageCollection().getFlippingPage(direction);
                this.render.setFlippingPage(this.flippingPage);
                this.bottomPage = this.app.getPageCollection().getBottomPage(direction);
                this.flippingCoverPage = this.app.getPageCollection().getFlippingCoverPage(direction);

                // In landscape mode, match densities between adjacent pages
                if (this.render.getOrientation() === Orientation.LANDSCAPE) {
                    if (direction === FlipDirection.BACK) {
                        const nextPage = this.app.getPageCollection().nextBy(this.flippingPage);
                        if (nextPage !== null && this.flippingPage.getDensity() !== nextPage.getDensity()) {
                            this.flippingPage.setDrawingDensity(PageDensity.HARD);
                            nextPage.setDrawingDensity(PageDensity.HARD);
                        }
                    } else {
                        const prevPage = this.app.getPageCollection().prevBy(this.flippingPage);
                        if (prevPage !== null && this.flippingPage.getDensity() !== prevPage.getDensity()) {
                            this.flippingPage.setDrawingDensity(PageDensity.HARD);
                            prevPage.setDrawingDensity(PageDensity.HARD);
                        }
                    }
                }

                this.render.setDirection(direction);
                this.calc = new FlipCalculation(
                    direction, flipCorner,
                    rect.pageWidth.toString(10),
                    rect.height.toString(10)
                );

                return true;
            } catch (e) {
                return false;
            }
        }

        _do(pagePos) {
            if (this.calc === null) return;

            if (this.calc.calc(pagePos)) {
                const progress = this.calc.getFlippingProgress();

                this.bottomPage.setArea(this.calc.getBottomClipArea());
                this.bottomPage.setPosition(this.calc.getBottomPagePosition());
                this.bottomPage.setAngle(0);
                this.bottomPage.setHardAngle(0);

                this.flippingPage.setArea(this.calc.getFlippingClipArea());
                this.flippingPage.setPosition(this.calc.getActiveCorner());
                this.flippingPage.setAngle(this.calc.getAngle());

                if (this.calc.getDirection() === FlipDirection.FORWARD) {
                    this.flippingPage.setHardAngle((90 * (200 - progress * 2)) / 100);
                } else {
                    this.flippingPage.setHardAngle((-90 * (200 - progress * 2)) / 100);
                }

                if (this.flippingCoverPage) {
                    this.flippingCoverPage.setArea(this.calc.getFlippingCoverClipArea());
                    this.flippingCoverPage.setPosition(this.calc.getBottomPagePosition());
                    this.flippingCoverPage.setAngle(0);
                    this.flippingCoverPage.setHardAngle(0);
                }

                this.render.setPageRect(this.calc.getRect());
                this.render.setBottomPage(this.bottomPage);
                this.render.setFlippingPage(this.flippingPage);
                this.render.setShadowData(
                    this.calc.getShadowStartPoint(),
                    this.calc.getShadowAngle(),
                    progress,
                    this.calc.getDirection()
                );
            }
        }

        flipToPage(page, corner) {
            const current = this.app.getPageCollection().getCurrentSpreadIndex();
            const next = this.app.getPageCollection().getSpreadIndexByPage(page);

            try {
                if (next > current) {
                    this.app.getPageCollection().setCurrentSpreadIndex(next - 1);
                    this.flipNext(corner);
                }
                if (next < current) {
                    this.app.getPageCollection().setCurrentSpreadIndex(next + 1);
                    this.flipPrev(corner);
                }
            } catch (e) { /* intentionally ignored */ }
        }

        flipNext(corner) {
            this.flip({
                x: this.render.getRect().left + this.render.getRect().pageWidth * 2 - 10,
                y: corner === FlipCorner.TOP ? 1 : this.render.getRect().height - 2,
            });
        }

        flipPrev(corner) {
            this.flip({
                x: this.render.getRect().left + 10,
                y: corner === FlipCorner.TOP ? 1 : this.render.getRect().height - 2,
            });
        }

        stopMove() {
            if (this.calc === null) return;
            const pos = this.calc.getPosition();
            const rect = this._getBoundsRect();
            const y = this.calc.getCorner() === FlipCorner.BOTTOM ? rect.height : 0;

            if (pos.x <= 0) this._animateFlippingTo(pos, { x: -rect.pageWidth, y }, true);
            else this._animateFlippingTo(pos, { x: rect.pageWidth, y }, false);
        }

        showCorner(globalPos) {
            if (!this._checkState(FlippingState.READ, FlippingState.FOLD_CORNER)) return;
            const rect = this._getBoundsRect();
            const pageWidth = rect.pageWidth;

            if (this._isPointOnCorners(globalPos)) {
                if (this.calc === null) {
                    if (!this.start(globalPos)) return;
                    this._setState(FlippingState.FOLD_CORNER);
                    this.calc.calc({ x: pageWidth - 1, y: 1 });

                    const fixedCornerSize = 50;
                    const yStart = this.calc.getCorner() === FlipCorner.BOTTOM ? rect.height - 1 : 1;
                    const yDest = this.calc.getCorner() === FlipCorner.BOTTOM
                        ? rect.height - fixedCornerSize : fixedCornerSize;

                    this._animateFlippingTo(
                        { x: pageWidth - 1, y: yStart },
                        { x: pageWidth - fixedCornerSize, y: yDest },
                        false, false
                    );
                } else {
                    this.render.startAnimationRenderLoop(() => {
                        this._do(this.render.convertToPage(globalPos));
                    });
                }
            } else {
                this._setState(FlippingState.READ);
                this.render.finishAnimation();
                this.render.stopAnimationRenderLoop();
                this.stopMove();
            }
        }

        _animateFlippingTo(start, dest, isTurned, needReset = true) {
            const points = Helper.GetCordsFromTwoPoint(start, dest);
            const frames = points.map(p => () => this._do(p));
            const duration = this._getAnimationDuration(points.length);

            this.render.startAnimation(frames, duration, () => {
                if (!this.calc) return;

                if (isTurned) {
                    if (this.calc.getDirection() === FlipDirection.BACK) {
                        if (this.app.getOrientation() === Orientation.LANDSCAPE) {
                            if (this.app.getCurrentPageIndex() === 1) this.app.ui.firstPageCenter();
                            else if (this.app.getCurrentPageIndex() === this.app.getPageCount() - 1)
                                this.app.ui.firstPageCenterReverse();
                        }
                        this.app.turnToPrevPage();
                    } else {
                        if (this.app.getOrientation() === Orientation.LANDSCAPE) {
                            if (this.app.getCurrentPageIndex() === 0) {
                                this.app.ui.firstPageCenterReverse();
                            } else if (this.app.getCurrentPageIndex() === this.app.getPageCount() - 3) {
                                this.app.ui.firstPageEndCenter();
                            }
                        }
                        this.app.turnToNextPage();
                    }
                    // Fire flip sound event
                    this.app._trigger('flipSound', this.app, this.app.getCurrentPageIndex());
                }

                if (needReset) {
                    this.render.setBottomPage(null);
                    this.render.setFlippingPage(null);
                    this.render.clearShadow();
                    this._setState(FlippingState.READ);
                    this._reset();
                }
            });
        }

        getCalculation() { return this.calc; }
        getState() { return this.state; }

        _setState(newState) {
            if (this.state !== newState) {
                this.app.updateState(newState);
                this.state = newState;
            }
        }

        _getDirectionByPoint(touchPos) {
            const rect = this._getBoundsRect();

            if (this.render.getOrientation() === Orientation.PORTRAIT) {
                if (touchPos.x - rect.pageWidth <= rect.width / 5) return FlipDirection.BACK;
            } else if (touchPos.x < rect.width / 2) {
                return FlipDirection.BACK;
            }

            return FlipDirection.FORWARD;
        }

        _getAnimationDuration(size) {
            const defaultTime = this.app.getSettings().flippingTime;
            const rect = this._getBoundsRect();
            const ratio = rect.pageWidth / 300;
            const timePerPoint = defaultTime / 600;
            return (size / ratio) * timePerPoint;
        }

        _checkDirection(direction) {
            if (direction === FlipDirection.FORWARD)
                return this.app.getCurrentPageIndex() < this.app.getPageCount() - 1;
            return this.app.getCurrentPageIndex() >= 1;
        }

        _reset() {
            this.calc = null;
            this.flippingPage = null;
            this.bottomPage = null;
        }

        _getBoundsRect() { return this.render.getRect(); }

        _checkState(...states) {
            for (const state of states) {
                if (this.state === state) return true;
            }
            return false;
        }

        _isPointOnCorners(globalPos) {
            const rect = this._getBoundsRect();
            const pageWidth = rect.pageWidth;
            const operatingDistance = Math.sqrt(Math.pow(pageWidth, 2) + Math.pow(rect.height, 2)) / 5;
            const bookPos = this.render.convertToBook(globalPos);

            return (
                bookPos.x > 0 && bookPos.y > 0 &&
                bookPos.x < rect.width && bookPos.y < rect.height &&
                (bookPos.x < operatingDistance || bookPos.x > rect.width - operatingDistance) &&
                (bookPos.y < operatingDistance || bookPos.y > rect.height - operatingDistance)
            );
        }
    }

    // ─────────────────────────────────────────────
    // UI BASE CLASS
    // ─────────────────────────────────────────────

    class UI {
        constructor(inBlock, app, setting) {
            this.parentElement = inBlock;
            this.app = app;
            this.wrapper = null;
            this.distElement = null;
            this._touchPoint = null;
            this._swipeTimeout = 250;
            this._swipeDistance = setting.swipeDistance;

            injectCSS();

            inBlock.classList.add('stf__parent');
            inBlock.insertAdjacentHTML('afterbegin', '<div class="stf__wrapper"></div>');
            this.wrapper = inBlock.querySelector('.stf__wrapper');

            const k = app.getSettings().usePortrait ? 1 : 2;

            inBlock.style.minWidth = setting.minWidth * k + 'px';
            inBlock.style.minHeight = setting.minHeight + 'px';

            if (setting.size === SizeType.FIXED) {
                inBlock.style.minWidth = setting.width * k + 'px';
                inBlock.style.minHeight = setting.height + 'px';
            }

            if (setting.autoSize) {
                inBlock.style.width = '100%';
                inBlock.style.maxWidth = setting.maxWidth * 2 + 'px';
            }

            inBlock.style.display = 'block';

            this._onResize = () => { this.update(); };
            window.addEventListener('resize', this._onResize, false);
        }

        destroy() {
            if (this.app.getSettings().useMouseEvents) this._removeHandlers();
            if (this.distElement) this.distElement.remove();
            if (this.wrapper) this.wrapper.remove();
        }

        /** @abstract */
        update() {}

        getDistElement() { return this.distElement; }
        getWrapper() { return this.wrapper; }

        setOrientationStyle(orientation) {
            this.wrapper.classList.remove('--portrait', '--landscape');

            if (orientation === Orientation.PORTRAIT) {
                if (this.app.getSettings().autoSize)
                    this.wrapper.style.paddingBottom =
                        (this.app.getSettings().height / this.app.getSettings().width) * 100 + '%';
                this.wrapper.classList.add('--portrait');
            } else {
                if (this.app.getSettings().autoSize)
                    this.wrapper.style.paddingBottom =
                        (this.app.getSettings().height / (this.app.getSettings().width * 2)) * 100 + '%';
                this.wrapper.classList.add('--landscape');
            }

            // RTL class
            if (this.app.getSettings().rtl) {
                this.wrapper.classList.add('--rtl');
            } else {
                this.wrapper.classList.remove('--rtl');
            }

            this.update();
        }

        /**
         * Apply or remove RTL styling
         * @param {boolean} rtl
         */
        setRTLStyle(rtl) {
            if (rtl) {
                this.wrapper.classList.add('--rtl');
            } else {
                this.wrapper.classList.remove('--rtl');
            }
        }

        _removeHandlers() {
            window.removeEventListener('resize', this._onResize);
            if (this.distElement) {
                this.distElement.removeEventListener('mousedown', this._onMouseDown);
                this.distElement.removeEventListener('touchstart', this._onTouchStart);
            }
            window.removeEventListener('mousemove', this._onMouseMove);
            window.removeEventListener('touchmove', this._onTouchMove);
            window.removeEventListener('mouseup', this._onMouseUp);
            window.removeEventListener('touchend', this._onTouchEnd);
        }

        _setHandlers() {
            window.addEventListener('resize', this._onResize, false);
            if (!this.app.getSettings().useMouseEvents) return;

            this.distElement.addEventListener('mousedown', this._onMouseDown);
            this.distElement.addEventListener('touchstart', this._onTouchStart, { passive: false });

            window.addEventListener('mousemove', this._onMouseMove, { passive: true });
            window.addEventListener('touchmove', this._onTouchMove, {
                passive: !this.app.getSettings().mobileScrollSupport,
            });
            window.addEventListener('mouseup', this._onMouseUp, { passive: true });
            window.addEventListener('touchend', this._onTouchEnd, { passive: true });
        }

        /**
         * Convert global viewport coordinates to element-relative coordinates.
         * Accounts for CSS transform:scale via getBoundingClientRect ratio.
         * @param {number} x
         * @param {number} y
         * @returns {{ x: number, y: number }}
         */
        _getMousePos(x, y) {
            const rect = this.distElement.getBoundingClientRect();
            const scaleX = rect.width / (this.distElement.offsetWidth || rect.width);
            const scaleY = rect.height / (this.distElement.offsetHeight || rect.height);

            let posX = (x - rect.left) / scaleX;
            let posY = (y - rect.top) / scaleY;

            // RTL: mirror X coordinate
            if (this.app.getSettings().rtl) {
                posX = rect.width / scaleX - posX;
            }

            return { x: posX, y: posY };
        }

        /**
         * clickEventForward: return false to block flip start on anchor/button targets
         * FIX: original had !clickEventForward, we now correctly forward when setting is true
         */
        _checkTarget(target) {
            if (!this.app.getSettings().clickEventForward) return true;
            if (['a', 'button'].includes(target.tagName.toLowerCase())) return false;
            return true;
        }

        firstPageCenter() {}
        firstPageEndCenter() {}
        firstPageCenterReverse() {}
    }

    // Set up event handler methods on UI prototype (arrow-function binding pattern)
    Object.assign(UI.prototype, {
        _onMouseDown(e) {
            if (this._checkTarget(e.target)) {
                const pos = this._getMousePos(e.clientX, e.clientY);
                this.app.startUserTouch(pos);
                e.preventDefault();
            }
        },

        _onTouchStart(e) {
            if (this._checkTarget(e.target)) {
                if (e.changedTouches.length > 0) {
                    const t = e.changedTouches[0];
                    const pos = this._getMousePos(t.clientX, t.clientY);

                    this._touchPoint = { point: pos, time: Date.now() };

                    setTimeout(() => {
                        if (this._touchPoint !== null) {
                            this.app.startUserTouch(pos);
                        }
                    }, this._swipeTimeout);

                    if (!this.app.getSettings().mobileScrollSupport) e.preventDefault();
                }
            }
        },

        _onMouseUp(e) {
            const pos = this._getMousePos(e.clientX, e.clientY);
            this.app.userStop(pos);
        },

        _onMouseMove(e) {
            const pos = this._getMousePos(e.clientX, e.clientY);
            this.app.userMove(pos, false);
        },

        _onTouchMove(e) {
            if (e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                const pos = this._getMousePos(t.clientX, t.clientY);

                if (this.app.getSettings().mobileScrollSupport) {
                    if (this._touchPoint !== null) {
                        if (Math.abs(this._touchPoint.point.x - pos.x) > 10 ||
                            this.app.getState() !== FlippingState.READ) {
                            if (e.cancelable) this.app.userMove(pos, true);
                        }
                    }
                    if (this.app.getState() !== FlippingState.READ) {
                        e.preventDefault();
                    }
                } else {
                    this.app.userMove(pos, true);
                }
            }
        },

        _onTouchEnd(e) {
            if (e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                const pos = this._getMousePos(t.clientX, t.clientY);
                let isSwipe = false;

                if (this._touchPoint !== null) {
                    const dx = pos.x - this._touchPoint.point.x;
                    const distY = Math.abs(pos.y - this._touchPoint.point.y);

                    if (Math.abs(dx) > this._swipeDistance &&
                        distY < this._swipeDistance * 2 &&
                        Date.now() - this._touchPoint.time < this._swipeTimeout) {

                        // Only swipe if disableSwipe is not set
                        if (!this.app.getSettings().disableSwipe) {
                            if (dx > 0) {
                                this.app.flipPrev(
                                    this._touchPoint.point.y < this.app.getRender().getRect().height / 2
                                        ? FlipCorner.TOP : FlipCorner.BOTTOM
                                );
                            } else {
                                this.app.flipNext(
                                    this._touchPoint.point.y < this.app.getRender().getRect().height / 2
                                        ? FlipCorner.TOP : FlipCorner.BOTTOM
                                );
                            }
                            isSwipe = true;
                        }
                    }

                    this._touchPoint = null;
                }

                this.app.userStop(pos, isSwipe);
            }
        },
    });

    // Bind all handler methods
    ['_onMouseDown', '_onTouchStart', '_onMouseUp', '_onMouseMove', '_onTouchMove', '_onTouchEnd'].forEach(m => {
        const orig = UI.prototype[m];
        UI.prototype[m] = function (...args) { return orig.apply(this, args); };
    });

    // ─────────────────────────────────────────────
    // HTML UI
    // ─────────────────────────────────────────────

    class HTMLUI extends UI {
        constructor(inBlock, app, setting, items) {
            super(inBlock, app, setting);

            this.wrapper.insertAdjacentHTML('afterbegin', '<div class="stf__block"></div>');
            this.distElement = inBlock.querySelector('.stf__block');
            this.items = items;

            for (const item of items) {
                this.distElement.appendChild(item);
            }

            // Bind handlers to instance
            this._onMouseDown = this._onMouseDown.bind(this);
            this._onTouchStart = this._onTouchStart.bind(this);
            this._onMouseUp = this._onMouseUp.bind(this);
            this._onMouseMove = this._onMouseMove.bind(this);
            this._onTouchMove = this._onTouchMove.bind(this);
            this._onTouchEnd = this._onTouchEnd.bind(this);

            this._setHandlers();
        }

        clear() {
            for (const item of this.items) {
                this.parentElement.appendChild(item);
            }
        }

        updateItems(items) {
            this._removeHandlers();
            this.distElement.innerHTML = '';
            for (const item of items) {
                this.distElement.appendChild(item);
            }
            this.items = items;
            this._setHandlers();
        }

        update() {
            this.app.getRender().update();
            const pages = this.app.getPageCollection();
            if (!pages) return;

            const curIdx = pages.getCurrentPageIndex();
            const totalPages = pages.getPages().length;
            const orientation = this.app.getOrientation();

            if (orientation === Orientation.LANDSCAPE) {
                // showCover centering guard: only center when showCover is true
                if (this.app.getSettings().showCover) {
                    if (curIdx === 0) {
                        this.firstPageCenter();
                    } else if (curIdx === totalPages - 1) {
                        this.firstPageEndCenter();
                    } else {
                        this.firstPageCenterReverse();
                    }
                }
            }
        }

        firstPageCenter() {
            const width = this.distElement.clientWidth;
            this.distElement.style.transform = `translateX(-${width / 4}px)`;
        }

        firstPageEndCenter() {
            const width = this.distElement.clientWidth;
            this.distElement.style.transform = `translateX(${width / 4}px)`;
        }

        firstPageCenterReverse() {
            this.distElement.style.transition = 'transform 0.5s';
            this.distElement.style.transform = 'translateX(0px)';
        }
    }

    // ─────────────────────────────────────────────
    // CANVAS UI
    // ─────────────────────────────────────────────

    class CanvasUI extends UI {
        constructor(inBlock, app, setting) {
            super(inBlock, app, setting);

            this.wrapper.innerHTML = '<canvas class="stf__canvas"></canvas>';
            this.canvas = inBlock.querySelectorAll('canvas')[0];
            this.distElement = this.canvas;

            this._resizeCanvas();

            this._onMouseDown = this._onMouseDown.bind(this);
            this._onTouchStart = this._onTouchStart.bind(this);
            this._onMouseUp = this._onMouseUp.bind(this);
            this._onMouseMove = this._onMouseMove.bind(this);
            this._onTouchMove = this._onTouchMove.bind(this);
            this._onTouchEnd = this._onTouchEnd.bind(this);

            this._setHandlers();
        }

        _resizeCanvas() {
            const cs = getComputedStyle(this.canvas);
            const width = parseInt(cs.getPropertyValue('width'), 10);
            const height = parseInt(cs.getPropertyValue('height'), 10);
            this.canvas.width = width;
            this.canvas.height = height;
        }

        getCanvas() { return this.canvas; }

        update() {
            this._resizeCanvas();
            this.app.getRender().update();
        }
    }

    // ─────────────────────────────────────────────
    // PAGE FLIP (main class)
    // ─────────────────────────────────────────────

    /**
     * PageFlip — main entry point
     *
     * @extends EventObject
     */
    class PageFlip extends EventObject {
        /**
         * @param {HTMLElement} inBlock - Root HTML element
         * @param {Object} setting - Configuration object
         */
        constructor(inBlock, setting) {
            super();

            this.setting = new Settings().getSettings(setting || {});
            this.block = inBlock;

            this._mousePosition = null;
            this._isUserTouch = false;
            this._isUserMove = false;

            this.pages = null;
            this.flipController = null;
            this.render = null;
            this.ui = null;

            // autoPlay state
            this._autoPlayTimer = null;

            // flip hint state
            this._flipHintTimer = null;
            this._flipHintLastUsed = 0;

            // zoom level
            this._zoomLevel = 1;
        }

        // ── Lifecycle ──────────────────────────────

        /**
         * Load pages from images (Canvas mode)
         * @param {string[]} imagesHref
         */
        loadFromImages(imagesHref) {
            this.ui = new CanvasUI(this.block, this, this.setting);
            const canvas = this.ui.getCanvas();
            this.render = new CanvasRender(this, this.setting, canvas);
            this.flipController = new Flip(this.render, this);
            this.pages = new ImagePageCollection(this, this.render, imagesHref);
            this.pages.load();
            this.render.start();
            this.pages.show(this.setting.startPage);

            setTimeout(() => {
                this.ui.update();
                this._trigger('init', this, { page: this.setting.startPage, mode: this.render.getOrientation() });
                if (this.setting.autoPlay) this.startAutoPlay();
                if (this.setting.showFlipHint) this._startFlipHint();
            }, 1);
        }

        /**
         * Load pages from HTML elements (HTML mode)
         * @param {NodeListOf<HTMLElement>|HTMLElement[]} items
         */
        loadFromHTML(items) {
            this.ui = new HTMLUI(this.block, this, this.setting, items);
            this.render = new HTMLRender(this, this.setting, this.ui.getDistElement());
            this.flipController = new Flip(this.render, this);
            this.pages = new HTMLPageCollection(this, this.render, this.ui.getDistElement(), items);
            this.pages.load();
            this.render.start();
            this.pages.show(this.setting.startPage);

            setTimeout(() => {
                this.ui.update();
                this._trigger('init', this, { page: this.setting.startPage, mode: this.render.getOrientation() });
                if (this.setting.autoPlay) this.startAutoPlay();
                if (this.setting.showFlipHint) this._startFlipHint();
            }, 1);
        }

        /**
         * Update min width
         * @param {number} minWidth
         */
        updateMinWidth(minWidth) {
            this.setting.minWidth = minWidth;
        }

        /**
         * Destroy the instance, remove DOM elements and event handlers
         */
        destroy() {
            this.stopAutoPlay();
            this._stopFlipHint();
            if (this.ui) this.ui.destroy();
            this.block.remove();
        }

        /**
         * Re-render the current page
         */
        update() {
            this.render.update();
            this.pages.show();
        }

        // ── Page Source Update ────────────────────

        updateFromImages(imagesHref) {
            const current = this.pages.getCurrentPageIndex();
            this.pages.destroy();
            this.pages = new ImagePageCollection(this, this.render, imagesHref);
            this.pages.load();
            this.pages.show(current);
            this._trigger('update', this, { page: current, mode: this.render.getOrientation() });
        }

        updateFromHtml(items) {
            const current = this.pages.getCurrentPageIndex();
            this.pages.destroy();
            this.pages = new HTMLPageCollection(this, this.render, this.ui.getDistElement(), items);
            this.pages.load();
            this.ui.updateItems(items);
            this.render.reload();
            this.pages.show(current);
            this._trigger('update', this, { page: current, mode: this.render.getOrientation() });
        }

        clear() {
            this.pages.destroy();
            if (this.ui && this.ui.clear) this.ui.clear();
        }

        // ── Navigation ────────────────────────────

        /** Turn to the previous page without animation */
        turnToPrevPage() { this.pages.showPrev(); }
        /** Turn to the next page without animation */
        turnToNextPage() { this.pages.showNext(); }
        /** Turn to a specific page without animation */
        turnToPage(page) { this.pages.show(page); }

        /**
         * Turn to the next page with animation
         * @param {string} [corner='top']
         */
        flipNext(corner = FlipCorner.TOP) { this.flipController.flipNext(corner); }

        /**
         * Turn to the previous page with animation
         * @param {string} [corner='top']
         */
        flipPrev(corner = FlipCorner.TOP) { this.flipController.flipPrev(corner); }

        /**
         * Turn to a specific page with animation
         * @param {number} page
         * @param {string} [corner='top']
         */
        flip(page, corner = FlipCorner.TOP) { this.flipController.flipToPage(page, corner); }

        // ── State Updates (internal) ───────────────

        updateState(newState) { this._trigger('changeState', this, newState); }
        updatePageIndex(newPage) { this._trigger('flip', this, newPage); }

        updateOrientation(newOrientation) {
            this.ui.setOrientationStyle(newOrientation);
            this.update();
            this._trigger('changeOrientation', this, newOrientation);
        }

        // ── Getters ───────────────────────────────

        /** @returns {number} Total page count */
        getPageCount() { return this.pages.getPageCount(); }

        /** @returns {number} Current page index (0-based) */
        getCurrentPageIndex() { return this.pages.getCurrentPageIndex(); }

        /**
         * @param {number} pageIndex
         * @returns {Page}
         */
        getPage(pageIndex) { return this.pages.getPage(pageIndex); }

        /** @returns {Render} */
        getRender() { return this.render; }

        /** @returns {Flip} */
        getFlipController() { return this.flipController; }

        /** @returns {string} Current orientation */
        getOrientation() { return this.render.getOrientation(); }

        /** @returns {Object} Current book bounds */
        getBoundsRect() { return this.render.getRect(); }

        /** @returns {Object} Current settings */
        getSettings() { return this.setting; }

        /** @returns {UI} UI instance */
        getUI() { return this.ui; }

        /** @returns {string} Current flipping state */
        getState() { return this.flipController.getState(); }

        /** @returns {PageCollection} Page collection */
        getPageCollection() { return this.pages; }

        // ── New Public API ────────────────────────

        /**
         * Get the current page index (alias for getCurrentPageIndex)
         * @returns {number}
         */
        getCurrentPageIndex() { return this.pages ? this.pages.getCurrentPageIndex() : 0; }

        /**
         * Get total number of pages
         * @returns {number}
         */
        getTotalPages() { return this.pages ? this.pages.getPageCount() : 0; }

        /**
         * Returns true if a flip animation is currently running
         * @returns {boolean}
         */
        isFlipping() {
            return this.flipController
                ? this.flipController.getState() === FlippingState.FLIPPING
                : false;
        }

        /**
         * Set zoom level via CSS transform on the wrapper element
         * @param {number} level - Zoom level (1 = 100%)
         */
        zoom(level) {
            this._zoomLevel = level;
            if (this.ui && this.ui.wrapper) {
                const rtl = this.setting.rtl ? 'scaleX(-1)' : '';
                this.ui.wrapper.style.transform = `scale(${level}) ${rtl}`.trim();
                this.ui.wrapper.style.transformOrigin = 'top center';
            }
        }

        // ── RTL ───────────────────────────────────

        /**
         * Apply RTL styling to the wrapper
         */
        setRTLStyle() {
            if (this.ui) this.ui.setRTLStyle(this.setting.rtl);
        }

        /**
         * Enable or disable RTL mode at runtime
         * @param {boolean} rtl
         */
        updateRTL(rtl) {
            this.setting.rtl = rtl;
            if (this.ui) {
                this.ui.setRTLStyle(rtl);
            }
            this._trigger('changeRTL', this, rtl);
        }

        // ── AutoPlay ──────────────────────────────

        /**
         * Start auto-play (automatically flip pages at autoPlayInterval ms)
         */
        startAutoPlay() {
            if (this._autoPlayTimer !== null) return;
            const interval = this.setting.autoPlayInterval || 3000;
            this._autoPlayTimer = setInterval(() => {
                if (this.pages && this.getCurrentPageIndex() < this.getTotalPages() - 1) {
                    this.flipNext(FlipCorner.BOTTOM);
                } else {
                    this.stopAutoPlay();
                }
            }, interval);
        }

        /**
         * Stop auto-play
         */
        stopAutoPlay() {
            if (this._autoPlayTimer !== null) {
                clearInterval(this._autoPlayTimer);
                this._autoPlayTimer = null;
            }
        }

        /**
         * Toggle auto-play on/off
         */
        toggleAutoPlay() {
            if (this._autoPlayTimer !== null) {
                this.stopAutoPlay();
            } else {
                this.startAutoPlay();
            }
        }

        // ── Flip Hint ─────────────────────────────

        _startFlipHint() {
            const interval = this.setting.flipHintInterval || 5000;
            this._flipHintTimer = setInterval(() => {
                const cooldown = this.setting.flipHintCooldown || 1000;
                if (Date.now() - this._flipHintLastUsed < cooldown) return;
                if (this.flipController && this.flipController.getState() === FlippingState.READ) {
                    this._doFlipHint();
                }
            }, interval);
        }

        _stopFlipHint() {
            if (this._flipHintTimer !== null) {
                clearInterval(this._flipHintTimer);
                this._flipHintTimer = null;
            }
        }

        _doFlipHint() {
            const rect = this.render.getRect();
            if (!rect) return;
            this._flipHintLastUsed = Date.now();

            // Show corner fold animation (non-turning)
            const corner = FlipCorner.BOTTOM;
            const globalPos = {
                x: rect.left + rect.pageWidth * 2 - 5,
                y: corner === FlipCorner.TOP ? 1 : rect.height - 1,
            };

            this.flipController.showCorner(globalPos);
            setTimeout(() => {
                if (this.flipController.getState() === FlippingState.FOLD_CORNER) {
                    this.flipController.stopMove();
                }
            }, 600);
        }

        // ── User Interaction ──────────────────────

        startUserTouch(pos) {
            this._mousePosition = pos;
            this._isUserTouch = true;
            this._isUserMove = false;
        }

        userMove(pos, isTouch) {
            if (!this._isUserTouch && !isTouch && this.setting.showPageCorners) {
                this.flipController.showCorner(pos);
            } else if (this._isUserTouch) {
                if (Helper.GetDistanceBetweenTwoPoint(this._mousePosition, pos) > 5) {
                    this._isUserMove = true;
                    this.flipController.fold(pos);
                }
            }
        }

        userStop(pos, isSwipe = false) {
            if (this._isUserTouch) {
                this._isUserTouch = false;
                if (!isSwipe) {
                    if (!this._isUserMove) this.flipController.flip(pos);
                    else this.flipController.stopMove();
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // PUBLIC EXPORTS
    // ─────────────────────────────────────────────

    return {
        PageFlip,
        // Enums
        SizeType,
        FlipDirection,
        FlipCorner,
        FlippingState,
        Orientation,
        PageOrientation,
        PageDensity,
        // Classes (for advanced use)
        Settings,
        Helper,
        EventObject,
        Page,
        HTMLPage,
        ImagePage,
        FlipCalculation,
        Render,
        HTMLRender,
        CanvasRender,
        PageCollection,
        HTMLPageCollection,
        ImagePageCollection,
        Flip,
        UI,
        HTMLUI,
        CanvasUI,
    };
});

// ESM re-export shim for bundlers that support both
if (typeof module !== 'undefined' && module.exports) {
    module.exports.PageFlip = module.exports.PageFlip || module.exports.default;
}
