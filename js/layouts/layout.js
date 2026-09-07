/**
 * Layout geometry: where the tiles sit, and what blocks what.
 *
 * Positions are integers in half-tile units. A tile at (x, y) covers the square
 * [x, x+2) x [y, y+2), so a layer can offset a row by half a tile the way a
 * paper layout does. Layers stack in z.
 *
 * A layout is authored as ASCII, one block of rows per layer, with "[]" marking
 * a tile and its left bracket giving the origin. Everything else is ignored, so
 * the rows below a tile can be left blank.
 *
 *     "[][][][]"      four tiles, side by side
 *     "  [][]  "      two tiles, offset by half a tile
 */

/** Tile size in board pixels, and how far each layer shifts up and left. */
export const TILE_W = 60;
export const TILE_H = 80;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const LIFT_X = 5;
export const LIFT_Y = 7;
/** The drawn thickness on the right and bottom edge of a tile. */
export const BEVEL = 6;

export class Layout {
	constructor(spec) {
		this.id = spec.id;
		this.name = spec.name;
		this.difficulty = spec.difficulty;
		this.blurb = spec.blurb;

		const placed = readLayers(spec.layers, spec.id);
		// Back to front: a tile paints over the ones below and to the upper left.
		placed.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));

		this.count = placed.length;
		this.xs = Int16Array.from(placed, (t) => t.x);
		this.ys = Int16Array.from(placed, (t) => t.y);
		this.zs = Int16Array.from(placed, (t) => t.z);

		this.covers = [];   // tiles resting on top of this one
		this.under = [];    // tiles this one rests on
		this.left = [];     // tiles touching this one's left edge
		this.right = [];    // tiles touching this one's right edge
		this._buildNeighbours();

		this.box = screenBox(this);
	}

	position(index) {
		return { x: this.xs[index], y: this.ys[index], z: this.zs[index] };
	}

	/** Where a tile's top-left corner lands, in board pixels. */
	screenX(index) {
		return this.xs[index] * HALF_W - this.zs[index] * LIFT_X - this.box.left;
	}

	screenY(index) {
		return this.ys[index] * HALF_H - this.zs[index] * LIFT_Y - this.box.top;
	}

	/**
	 * Paint order. A higher layer always wins; within a layer, the tile further
	 * right and further down paints over its neighbour's bevel.
	 */
	depth(index) {
		return this.zs[index] * 4096 + this.ys[index] * 64 + this.xs[index];
	}

	_buildNeighbours() {
		for (let i = 0; i < this.count; i += 1) {
			this.covers.push([]);
			this.under.push([]);
			this.left.push([]);
			this.right.push([]);
		}
		for (let i = 0; i < this.count; i += 1) {
			for (let j = 0; j < this.count; j += 1) {
				if (i === j) continue;
				const dy = Math.abs(this.ys[i] - this.ys[j]);
				if (dy >= 2) continue;
				const dx = Math.abs(this.xs[i] - this.xs[j]);
				if (this.zs[j] > this.zs[i]) {
					if (dx < 2) {
						this.covers[i].push(j);
						this.under[j].push(i);
					}
					continue;
				}
				if (this.zs[j] !== this.zs[i]) continue;
				if (this.xs[j] < this.xs[i] && this.xs[j] + 2 >= this.xs[i]) this.left[i].push(j);
				if (this.xs[j] > this.xs[i] && this.xs[j] <= this.xs[i] + 2) this.right[i].push(j);
			}
		}
	}
}

/**
 * Turns the ASCII into positions, and refuses anything that could not be built
 * out of real tiles: two tiles in the same place, or a tile floating over a gap.
 */
function readLayers(layers, id) {
	const placed = [];
	const filled = [];
	layers.forEach((rows, z) => {
		const cells = new Set();
		filled.push(cells);
		rows.forEach((row, y) => {
			for (let x = 0; x < row.length; x += 1) {
				if (row[x] !== "[") continue;
				for (const cell of footprint(x, y)) {
					if (cells.has(cell)) throw new Error(`${id}: tiles overlap at layer ${z}, ${x},${y}`);
					cells.add(cell);
				}
				if (z > 0) {
					for (const cell of footprint(x, y)) {
						if (!filled[z - 1].has(cell)) {
							throw new Error(`${id}: unsupported tile at layer ${z}, ${x},${y}`);
						}
					}
				}
				placed.push({ x, y, z });
			}
		});
	});
	if (placed.length % 2 !== 0) throw new Error(`${id}: ${placed.length} tiles, which cannot be paired`);
	return placed;
}

function footprint(x, y) {
	return [`${x},${y}`, `${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`];
}

/** The board's own bounding box in pixels, before any zoom. */
function screenBox(layout) {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (let i = 0; i < layout.count; i += 1) {
		const x = layout.xs[i] * HALF_W - layout.zs[i] * LIFT_X;
		const y = layout.ys[i] * HALF_H - layout.zs[i] * LIFT_Y;
		left = Math.min(left, x);
		top = Math.min(top, y);
		right = Math.max(right, x + TILE_W + BEVEL);
		bottom = Math.max(bottom, y + TILE_H + BEVEL);
	}
	return { left, top, width: right - left, height: bottom - top };
}
