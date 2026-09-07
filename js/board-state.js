import { matchKey } from "./tiles/tile-set.js";

/**
 * The tiles on a layout, and which of them can be taken.
 *
 * A tile is free when nothing rests on it and one of its side edges is clear.
 * Rather than rescan the layout for every query, the state keeps a count of the
 * live tiles above, to the left and to the right of each position, and adjusts
 * the counts of the handful of neighbours a removal touches. Freeness is then a
 * comparison, which is what makes the solver's playouts cheap enough to run
 * while the player waits for a hint.
 */
export class BoardState {
	constructor(layout) {
		this.layout = layout;
		this.faces = new Array(layout.count).fill(null);
		this.removed = new Uint8Array(layout.count);
		this._above = new Int16Array(layout.count);
		this._left = new Int16Array(layout.count);
		this._right = new Int16Array(layout.count);
		this.remaining = 0;
		this.onChanged = null;
		this.resetCounts();
	}

	resetCounts() {
		const layout = this.layout;
		for (let i = 0; i < layout.count; i += 1) {
			this._above[i] = 0;
			this._left[i] = 0;
			this._right[i] = 0;
		}
		this.remaining = 0;
		for (let i = 0; i < layout.count; i += 1) {
			if (this.removed[i]) continue;
			this.remaining += 1;
			for (const j of layout.under[i]) this._above[j] += 1;
			for (const j of layout.right[i]) this._left[j] += 1;
			for (const j of layout.left[i]) this._right[j] += 1;
		}
	}

	setFaces(faces) {
		this.faces = [...faces];
	}

	faceAt(index) {
		return this.faces[index] ?? null;
	}

	isRemoved(index) {
		return this.removed[index] === 1;
	}

	isFree(index) {
		if (this.removed[index]) return false;
		if (this._above[index] > 0) return false;
		return this._left[index] === 0 || this._right[index] === 0;
	}

	/** Why a tile cannot be taken, for the message the player sees. */
	blockedBy(index) {
		if (this._above[index] > 0) return "covered";
		return "hemmed";
	}

	freeIndices() {
		const free = [];
		for (let i = 0; i < this.layout.count; i += 1) {
			if (this.isFree(i)) free.push(i);
		}
		return free;
	}

	/** Free tiles bucketed by what they match, so a pair is any bucket of two. */
	freeGroups() {
		const groups = new Map();
		for (let i = 0; i < this.layout.count; i += 1) {
			if (!this.isFree(i)) continue;
			const key = matchKey(this.faces[i]);
			const bucket = groups.get(key);
			if (bucket === undefined) groups.set(key, [i]);
			else bucket.push(i);
		}
		return groups;
	}

	/** Every pair the player could take right now. */
	freePairs() {
		const pairs = [];
		for (const bucket of this.freeGroups().values()) {
			for (let a = 0; a < bucket.length; a += 1) {
				for (let b = a + 1; b < bucket.length; b += 1) pairs.push([bucket[a], bucket[b]]);
			}
		}
		return pairs;
	}

	hasFreePair() {
		for (const bucket of this.freeGroups().values()) {
			if (bucket.length >= 2) return true;
		}
		return false;
	}

	remove(index) {
		if (this.removed[index]) return;
		this.removed[index] = 1;
		this.remaining -= 1;
		const layout = this.layout;
		for (const j of layout.under[index]) this._above[j] -= 1;
		for (const j of layout.right[index]) this._left[j] -= 1;
		for (const j of layout.left[index]) this._right[j] -= 1;
	}

	restore(index) {
		if (!this.removed[index]) return;
		this.removed[index] = 0;
		this.remaining += 1;
		const layout = this.layout;
		for (const j of layout.under[index]) this._above[j] += 1;
		for (const j of layout.right[index]) this._left[j] += 1;
		for (const j of layout.left[index]) this._right[j] += 1;
	}

	removeAllExcept(keep) {
		const wanted = keep instanceof Set ? keep : new Set(keep);
		for (let i = 0; i < this.layout.count; i += 1) {
			if (!wanted.has(i)) this.removed[i] = 1;
		}
		this.resetCounts();
	}

	remainingIndices() {
		const live = [];
		for (let i = 0; i < this.layout.count; i += 1) {
			if (!this.removed[i]) live.push(i);
		}
		return live;
	}

	remainingFaces() {
		return this.remainingIndices().map((i) => this.faces[i]);
	}

	/** A copy the solver can play out without disturbing the running game. */
	clone() {
		const copy = new BoardState(this.layout);
		copy.faces = this.faces;
		copy.removed.set(this.removed);
		copy._above.set(this._above);
		copy._left.set(this._left);
		copy._right.set(this._right);
		copy.remaining = this.remaining;
		return copy;
	}

	toRemovedString() {
		let text = "";
		for (let i = 0; i < this.layout.count; i += 1) text += this.removed[i] ? "1" : "0";
		return text;
	}

	fromRemovedString(text) {
		for (let i = 0; i < this.layout.count; i += 1) {
			this.removed[i] = text[i] === "1" ? 1 : 0;
		}
		this.resetCounts();
	}

	/** Commands write silently; the stack calls this once the move is finished. */
	notify(indices) {
		this.onChanged?.(indices);
	}
}
