import { Emitter } from "../util/emitter.js";
import { MatchCommand } from "./match-command.js";
import { ShuffleCommand } from "./shuffle-command.js";

/**
 * The move history.
 *
 * push() applies a command and records it. undo() reverts the top one. There is
 * no redo: taking a pair back and then putting it down again is the same board,
 * so a redo button would only ever repeat a move the player can make by hand.
 *
 * The stack serializes, so leaving mid-game and coming back keeps the history.
 * Depth is capped because it is written to storage on every suspend.
 *
 * Emits: changed(canUndo, depth)
 */
export class UndoStack extends Emitter {
	static MAX_DEPTH = 150;

	constructor() {
		super();
		this._moves = [];
	}

	push(command, state) {
		command.apply(state);
		this._moves.push(command);
		if (this._moves.length > UndoStack.MAX_DEPTH) this._moves.shift();
		state.notify(command.touched());
		this._emitChanged();
		return command.touched();
	}

	undo(state) {
		const command = this._moves.pop();
		if (command === undefined) return [];
		command.revert(state);
		const touched = command.touched();
		state.notify(touched);
		this._emitChanged();
		return touched;
	}

	/** The command that would be undone next, without undoing it. */
	peek() {
		return this._moves.at(-1) ?? null;
	}

	canUndo() {
		return this._moves.length > 0;
	}

	depth() {
		return this._moves.length;
	}

	clear() {
		this._moves = [];
		this._emitChanged();
	}

	toJSON() {
		return this._moves.map((command) => command.toJSON());
	}

	/** Unknown entries are dropped rather than faulted, costing history and no more. */
	fromJSON(data) {
		this._moves = [];
		if (Array.isArray(data)) {
			for (const entry of data) {
				if (entry === null || typeof entry !== "object") continue;
				const command = build(entry);
				if (command !== null) this._moves.push(command);
			}
		}
		this._emitChanged();
	}

	_emitChanged() {
		this.emit("changed", this.canUndo(), this.depth());
	}
}

export function build(data) {
	switch (String(data.t ?? "")) {
		case MatchCommand.TYPE:
			return MatchCommand.fromJSON(data);
		case ShuffleCommand.TYPE:
			return ShuffleCommand.fromJSON(data);
		default:
			return null;
	}
}
