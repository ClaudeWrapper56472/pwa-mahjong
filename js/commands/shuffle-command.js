import { TileCommand } from "./command.js";

/**
 * Re-deals the faces of the tiles still on the board.
 *
 * Both face lists are kept whole. They are the only move that rewrites tiles
 * rather than removing them, and a shuffle is rare enough that the extra bytes
 * in the save document do not matter.
 */
export class ShuffleCommand extends TileCommand {
	static TYPE = "s";

	constructor(before, after) {
		super();
		this.before = before;
		this.after = after;
	}

	apply(state) {
		state.setFaces(this.after);
	}

	revert(state) {
		state.setFaces(this.before);
	}

	touched() {
		return this.after.map((_face, index) => index);
	}

	toJSON() {
		return { t: ShuffleCommand.TYPE, b: this.before, a: this.after };
	}

	static fromJSON(data) {
		if (!Array.isArray(data.b) || !Array.isArray(data.a)) return null;
		if (data.b.length !== data.a.length) return null;
		return new ShuffleCommand(data.b, data.a);
	}
}
