import * as Geometry from "../layouts/layout.js";
import { spriteSheet, symbolId } from "../tiles/faces.js";
import { faceName } from "../tiles/tile-set.js";
import { Emitter } from "../util/emitter.js";

/**
 * The tiles on screen, and the gestures that move the view.
 *
 * Tiles are absolutely positioned in the layout's own pixel space and the whole
 * board is then transformed as one, so zooming is a single composited transform
 * rather than 144 elements relaying out. Hit testing goes through
 * elementFromPoint, which reads viewport coordinates and so needs no arithmetic
 * to undo that transform.
 *
 * One finger taps a tile or drags the board; two fingers pinch. A double tap on
 * the felt zooms in on that spot, and a double tap while zoomed fits the board
 * again.
 *
 * Emits: tileTapped(index), zoomChanged(zoom, fit)
 */
export class BoardView extends Emitter {
	/** How far a finger may wander and still count as a tap. */
	static TAP_SLOP = 10;

	/** Zoom limits, as multiples of the scale that fits the board on screen. */
	static MIN_ZOOM = 0.6;
	static MAX_ZOOM = 3.5;

	/** How long a hinted pair stays lit. */
	static HINT_MS = 2600;

	/** Two taps this close in time and space are a double tap. */
	static DOUBLE_TAP_MS = 320;
	static DOUBLE_TAP_PX = 32;

	/** Multiple of the fitting scale above which the board counts as zoomed in. */
	static ZOOMED_IN = 1.25;

	/** Tile width a double tap zooms to, in screen pixels. */
	static TAP_TILE_PX = 46;

	constructor(viewport, board, game) {
		super();
		this.viewport = viewport;
		this.board = board;
		this.game = game;

		this._tiles = [];
		this._layout = null;
		this._zoom = 1;
		this._fitZoom = 1;
		this._panX = 0;
		this._panY = 0;
		this._hinted = [];
		this._hintTimer = null;

		this._pointers = new Map();
		this._pinch = null;
		this._tapIndex = -1;
		this._moved = false;
		this._lastTap = null;

		installSprites();
		this._installPointerHandlers();
		this._installWheelHandler();
		new ResizeObserver(() => this._fit(true)).observe(this.viewport);

		game.on("boardLoaded", (layout) => this._rebuild(layout));
		game.on("tilesChanged", (indices) => this._refresh(indices));
		game.on("selectionChanged", (index, partners) => this._refreshSelection(index, partners));
		game.on("hintOffered", (a, b) => this._showHint(a, b));
		game.on("tileRejected", (index) => this._flashBlocked(index));
	}

	zoom() {
		return this._zoom;
	}

	/** Scales about the middle of the viewport, for the toolbar's zoom buttons. */
	zoomBy(factor) {
		const rect = this.viewport.getBoundingClientRect();
		this._zoomAbout(this._zoom * factor, rect.width / 2, rect.height / 2);
	}

	fit() {
		this._fit(false);
	}

	// --- Building ------------------------------------------------------------

	_rebuild(layout) {
		this._cancelHint();
		this._pointers.clear();
		this._pinch = null;
		this._lastTap = null;
		this._layout = layout;
		this._tiles = [];
		this.board.replaceChildren();
		this.board.style.width = `${layout.box.width}px`;
		this.board.style.height = `${layout.box.height}px`;

		const fragment = document.createDocumentFragment();
		for (let index = 0; index < layout.count; index += 1) {
			const tile = document.createElement("div");
			tile.className = "tile";
			tile.dataset.index = String(index);
			tile.setAttribute("role", "img");
			tile.style.left = `${layout.screenX(index)}px`;
			tile.style.top = `${layout.screenY(index)}px`;
			tile.style.zIndex = String(layout.depth(index));

			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("class", "tile-face");
			svg.setAttribute("viewBox", `0 0 ${Geometry.TILE_W} ${Geometry.TILE_H}`);
			svg.setAttribute("aria-hidden", "true");
			const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
			svg.append(use);
			tile.append(svg);
			tile._use = use;

			fragment.append(tile);
			this._tiles.push(tile);
		}
		this.board.append(fragment);
		this._refresh(null);
		this._fit(false);
	}

	/** Repaints the given tiles, or all of them when passed null. */
	_refresh(indices) {
		const state = this.game.board;
		if (state === null) return;
		const list = indices ?? this._tiles.map((_tile, index) => index);
		for (const index of list) {
			const tile = this._tiles[index];
			if (tile === undefined) continue;
			const face = state.faceAt(index);
			tile._use.setAttribute("href", `#${symbolId(face)}`);
			tile.setAttribute("aria-label", faceName(face));
			tile.classList.toggle("is-gone", state.isRemoved(index));
			tile.classList.toggle("is-free", state.isFree(index));
		}
		// A removal frees its neighbours, so their look changes without them being
		// named by the move itself.
		if (indices !== null) {
			for (let index = 0; index < this._tiles.length; index += 1) {
				this._tiles[index].classList.toggle("is-free", state.isFree(index));
			}
		}
	}

	_refreshSelection(selected, partners) {
		const mates = new Set(partners);
		for (let index = 0; index < this._tiles.length; index += 1) {
			this._tiles[index].classList.toggle("is-selected", index === selected);
			this._tiles[index].classList.toggle("is-mate", mates.has(index));
		}
	}

	_showHint(a, b) {
		this._cancelHint();
		this._hinted = [a, b];
		for (const index of this._hinted) this._tiles[index]?.classList.add("is-hint");
		this._hintTimer = setTimeout(() => this._cancelHint(), BoardView.HINT_MS);
	}

	_cancelHint() {
		if (this._hintTimer !== null) clearTimeout(this._hintTimer);
		this._hintTimer = null;
		for (const index of this._hinted) this._tiles[index]?.classList.remove("is-hint");
		this._hinted = [];
	}

	_flashBlocked(index) {
		const tile = this._tiles[index];
		if (tile === undefined) return;
		tile.classList.remove("is-blocked");
		// Reading the layout restarts the animation on a tile tapped twice.
		void tile.offsetWidth;
		tile.classList.add("is-blocked");
		tile.addEventListener("animationend", () => tile.classList.remove("is-blocked"), { once: true });
	}

	// --- View transform ------------------------------------------------------

	_fit(keepZoom) {
		if (this._layout === null) return;
		const rect = this.viewport.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		const margin = 16;
		this._fitZoom = Math.min(
			(rect.width - margin) / this._layout.box.width,
			(rect.height - margin) / this._layout.box.height,
		);
		const ratio = keepZoom && this._zoom > 0 ? this._zoom / (this._previousFit ?? this._fitZoom) : 1;
		this._previousFit = this._fitZoom;
		this._zoom = this._fitZoom * (keepZoom ? ratio : 1);
		this._centre();
	}

	_centre() {
		const rect = this.viewport.getBoundingClientRect();
		this._panX = (rect.width - this._layout.box.width * this._zoom) / 2;
		this._panY = (rect.height - this._layout.box.height * this._zoom) / 2;
		this._apply();
	}

	_zoomAbout(zoom, originX, originY) {
		if (this._layout === null) return;
		const limited = clamp(zoom, this._fitZoom * BoardView.MIN_ZOOM, this._fitZoom * BoardView.MAX_ZOOM);
		const scale = limited / this._zoom;
		this._panX = originX - (originX - this._panX) * scale;
		this._panY = originY - (originY - this._panY) * scale;
		this._zoom = limited;
		this._apply();
	}

	/**
	 * Keeps the board reachable: an axis it does not fill is centred, and one it
	 * overflows may not be dragged past its own edge.
	 */
	_apply() {
		const rect = this.viewport.getBoundingClientRect();
		const width = this._layout.box.width * this._zoom;
		const height = this._layout.box.height * this._zoom;
		this._panX = width <= rect.width
			? (rect.width - width) / 2
			: clamp(this._panX, rect.width - width, 0);
		this._panY = height <= rect.height
			? (rect.height - height) / 2
			: clamp(this._panY, rect.height - height, 0);
		this.board.style.transform =
			`translate(${this._panX.toFixed(2)}px, ${this._panY.toFixed(2)}px) scale(${this._zoom.toFixed(4)})`;
		this.emit("zoomChanged", this._zoom, this._fitZoom);
	}

	// --- Input ---------------------------------------------------------------
	//
	// One finger taps a tile, or drags the board once it has travelled far enough
	// to be a drag rather than a wobble. Two fingers pinch and pan together. Move
	// and release are tracked on the window, so a finger that leaves the viewport
	// still finishes its gesture.

	_installPointerHandlers() {
		const onMove = (event) => {
			const previous = this._pointers.get(event.pointerId);
			if (previous === undefined) return;
			this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

			if (this._pointers.size >= 2) {
				this._updatePinch();
				return;
			}
			const dx = event.clientX - previous.x;
			const dy = event.clientY - previous.y;
			if (!this._moved) {
				const start = this._tapStart;
				const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
				if (travelled < BoardView.TAP_SLOP) return;
				this._moved = true;
			}
			this._panX += dx;
			this._panY += dy;
			this._apply();
		};

		const onFinish = (event) => {
			if (!this._pointers.has(event.pointerId)) return;
			this._pointers.delete(event.pointerId);
			if (this._pointers.size === 1) {
				// The second finger left: carry on panning from where the first one is.
				this._pinch = null;
				this._moved = true;
			} else if (this._pointers.size === 0) {
				if (!this._moved && event.type === "pointerup") this._tap(event);
				this._pinch = null;
				this._tapIndex = -1;
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onFinish);
				window.removeEventListener("pointercancel", onFinish);
			}
		};

		this.viewport.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (this._pointers.size === 0) {
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onFinish);
				window.addEventListener("pointercancel", onFinish);
				this._tapStart = { x: event.clientX, y: event.clientY };
				this._tapIndex = this._tileAt(event);
				this._moved = false;
			} else {
				// A second finger is a pinch, never a tap.
				this._moved = true;
				this._tapIndex = -1;
			}
			this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (this._pointers.size === 2) this._beginPinch();
		});

		this.viewport.addEventListener("contextmenu", (event) => event.preventDefault());
	}

	/**
	 * A double tap zooms rather than selecting, and both taps have to land on the
	 * same thing to count as one.
	 *
	 * Only the felt zooms in. Fitted on screen a tile is around 20px wide, so two
	 * taps meant for neighbouring tiles can both land on the same one, and a zoom
	 * there would swallow the pair the player was picking. Zoomed in the tiles are
	 * large enough to trust, so a double tap on one fits the board again — the
	 * way back out stays under the finger that zoomed in.
	 */
	_tap(event) {
		const now = performance.now();
		const last = this._lastTap;
		const again = last !== null
			&& last.index === this._tapIndex
			&& now - last.time < BoardView.DOUBLE_TAP_MS
			&& Math.hypot(event.clientX - last.x, event.clientY - last.y) < BoardView.DOUBLE_TAP_PX
			&& (this._tapIndex < 0 || this._zoom > this._fitZoom * BoardView.ZOOMED_IN);
		if (again) {
			this._lastTap = null;
			const rect = this.viewport.getBoundingClientRect();
			this._toggleZoomAt(event.clientX - rect.left, event.clientY - rect.top);
			return;
		}
		this._lastTap = { time: now, x: event.clientX, y: event.clientY, index: this._tapIndex };
		if (this._tapIndex >= 0) this.emit("tileTapped", this._tapIndex);
	}

	_toggleZoomAt(x, y) {
		if (this._layout === null) return;
		if (this._zoom > this._fitZoom * BoardView.ZOOMED_IN) {
			this._fit(false);
			return;
		}
		const target = Math.max(this._fitZoom * 2, BoardView.TAP_TILE_PX / Geometry.TILE_W);
		this._zoomAbout(target, x, y);
	}

	_beginPinch() {
		const [a, b] = [...this._pointers.values()];
		this._pinch = {
			distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
			zoom: this._zoom,
			midX: (a.x + b.x) / 2,
			midY: (a.y + b.y) / 2,
		};
	}

	_updatePinch() {
		if (this._pinch === null) {
			this._beginPinch();
			return;
		}
		const [a, b] = [...this._pointers.values()];
		const rect = this.viewport.getBoundingClientRect();
		const midX = (a.x + b.x) / 2;
		const midY = (a.y + b.y) / 2;
		// The midpoint moving is a pan; the fingers spreading is a zoom.
		this._panX += midX - this._pinch.midX;
		this._panY += midY - this._pinch.midY;
		this._pinch.midX = midX;
		this._pinch.midY = midY;
		const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
		this._zoomAbout(this._pinch.zoom * (distance / this._pinch.distance), midX - rect.left, midY - rect.top);
	}

	_installWheelHandler() {
		this.viewport.addEventListener("wheel", (event) => {
			event.preventDefault();
			const rect = this.viewport.getBoundingClientRect();
			const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0022));
			this._zoomAbout(this._zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
		}, { passive: false });
	}

	_tileAt(event) {
		const target = document.elementFromPoint(event.clientX, event.clientY);
		const tile = target?.closest?.(".tile");
		if (!tile || tile.parentElement !== this.board) return -1;
		return Number(tile.dataset.index);
	}
}

function clamp(value, low, high) {
	return Math.min(Math.max(value, low), high);
}

/** The face sheet is injected once, and every tile points into it. */
function installSprites() {
	if (document.querySelector("#tile-sprites") !== null) return;
	const host = document.createElement("div");
	host.id = "tile-sprites";
	host.innerHTML = spriteSheet();
	document.body.prepend(host);
}
