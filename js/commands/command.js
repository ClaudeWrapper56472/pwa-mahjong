/**
 * Base class for one undoable move.
 *
 * A command carries enough to put the board back exactly as it was, so undo
 * needs no snapshot of the whole board and the history is small enough to write
 * into the save document. Subclasses implement apply and revert as mirrors of
 * each other, plus toJSON and fromJSON.
 */
export class TileCommand {
	apply(_state) {}

	revert(_state) {}

	/** Positions the board should repaint. */
	touched() {
		return [];
	}

	toJSON() {
		return {};
	}
}
