import { BoardState } from "./board-state.js";
import { LAYOUTS, layoutById, layoutIndex } from "./layouts/catalog.js";
import { dealFaces, findHint, shuffleFaces, partnersOf } from "./deal.js";
import { UndoStack } from "./commands/undo-stack.js";
import { MatchCommand } from "./commands/match-command.js";
import { ShuffleCommand } from "./commands/shuffle-command.js";
import { isFace, matches } from "./tiles/tile-set.js";
import { Emitter } from "./util/emitter.js";
import { Rng } from "./util/rng.js";

/**
 * The running game.
 *
 * Everything the interface needs to know lives here and leaves as an event, so
 * the board, the toolbar and the header each listen for what they care about and
 * know nothing about each other.
 *
 * Emits: boardLoaded(layout), tilesChanged(indices), selectionChanged(index, partners),
 *        timeChanged(seconds), tilesLeftChanged(left, total), historyChanged(canUndo),
 *        hintOffered(a, b), tileRejected(index), statusMessage(text),
 *        boardStuck(), boardCleared(seconds, hints, shuffles)
 */

/** How often the clock is sampled. Whole seconds are all the interface shows. */
const TICK_MS = 200;

export class GameState extends Emitter {
	constructor(saveManager, settings) {
		super();
		this.save = saveManager;
		this.settings = settings;
		this.layout = null;
		this.board = null;
		this.history = new UndoStack();

		this.seed = 0;
		this.selected = -1;
		this.elapsed = 0;
		this.hintsUsed = 0;
		this.shufflesUsed = 0;
		this.playing = false;
		this.finished = false;

		this._rng = new Rng(Rng.randomSeed());
		this._lastWholeSecond = -1;
		this._tickHandle = null;
		this._tickStamp = 0;

		this.history.on("changed", (canUndo) => this.emit("historyChanged", canUndo));
		this.save.on("saveRequested", () => {
			if (this.layout !== null && !this.finished) this.save.submitSession(this.sessionData());
		});
		this.settings?.on("changed", () => this._announceSelection());
	}

	// --- Starting and stopping ---------------------------------------------

	startLayout(id, seed = null) {
		const layout = layoutById(id) ?? LAYOUTS[0];
		const chosen = seed === null ? Rng.randomSeed() : seed;
		this._rng = new Rng(chosen);
		const faces = dealFaces(layout, this._rng);
		if (faces === null) {
			this.emit("statusMessage", "That board would not come apart. Try another.");
			return false;
		}

		this.layout = layout;
		this.seed = chosen;
		this.board = new BoardState(layout);
		this.board.setFaces(faces);
		this.board.onChanged = (indices) => this.emit("tilesChanged", indices);
		this.history.clear();

		this.selected = -1;
		this.elapsed = 0;
		this.hintsUsed = 0;
		this.shufflesUsed = 0;
		this.finished = false;
		this._lastWholeSecond = -1;

		this.save.recordStarted(layout.id);
		this._announceBoard();
		this._startClock();
		return true;
	}

	restart() {
		return this.layout === null ? false : this.startLayout(this.layout.id);
	}

	/** Picks the session up where it was left, or reports that there was none. */
	resumeSavedGame() {
		if (!this.save.hasSession()) return false;
		const session = this.save.session();
		const layout = layoutById(String(session.layout ?? ""));
		if (layout === null) return false;

		const faces = Array.isArray(session.faces) ? session.faces : null;
		const removed = typeof session.removed === "string" ? session.removed : null;
		if (faces === null || removed === null) return false;
		if (faces.length !== layout.count || removed.length !== layout.count) return false;
		if (!faces.every(isFace)) return false;

		this.layout = layout;
		this.seed = Number(session.seed ?? 0);
		this._rng = new Rng(this.seed || Rng.randomSeed());
		this.board = new BoardState(layout);
		this.board.setFaces(faces);
		this.board.fromRemovedString(removed);
		this.board.onChanged = (indices) => this.emit("tilesChanged", indices);
		this.history.fromJSON(session.history);

		this.selected = -1;
		this.elapsed = Math.max(0, Number(session.elapsed ?? 0));
		this.hintsUsed = Math.max(0, Number(session.hints ?? 0));
		this.shufflesUsed = Math.max(0, Number(session.shuffles ?? 0));
		this.finished = false;
		this._lastWholeSecond = -1;

		this._announceBoard();
		this._startClock();
		return true;
	}

	/** Leaving the screen. The clock stops and the position is written out. */
	suspend() {
		this._stopClock();
		this.playing = false;
		this.save.flush();
	}

	sessionData() {
		return {
			layout: this.layout.id,
			seed: this.seed,
			faces: this.board.faces,
			removed: this.board.toRemovedString(),
			elapsed: Math.floor(this.elapsed),
			hints: this.hintsUsed,
			shuffles: this.shufflesUsed,
			history: this.history.toJSON(),
		};
	}

	// --- Play ----------------------------------------------------------------

	select(index) {
		if (this.selected === index) return;
		this.selected = index;
		this._announceSelection();
	}

	/**
	 * One tap. It either takes a pair, moves the selection, or explains why the
	 * tile cannot be taken.
	 */
	tapTile(index) {
		if (this.finished || this.board === null) return;
		if (index < 0 || index >= this.layout.count || this.board.isRemoved(index)) return;

		if (!this.board.isFree(index)) {
			this.emit("tileRejected", index);
			this.emit("statusMessage", this.board.blockedBy(index) === "covered"
				? "That tile has another one on top of it."
				: "That tile is hemmed in on both sides.");
			return;
		}

		if (index === this.selected) {
			this.select(-1);
			return;
		}

		const first = this.selected;
		if (first >= 0 && !this.board.isRemoved(first)
			&& matches(this.board.faceAt(first), this.board.faceAt(index))) {
			this.select(-1);
			this.history.push(new MatchCommand(first, index), this.board);
			this._afterMove();
			return;
		}

		this.select(index);
	}

	undo() {
		if (this.finished || !this.history.canUndo()) return;
		this.select(-1);
		this.history.undo(this.board);
		this._afterMove(false);
		this.emit("statusMessage", "Move taken back.");
	}

	/**
	 * Points at a pair that keeps the board winnable where one can be found in
	 * the time allowed, and at any legal pair otherwise.
	 */
	hint() {
		if (this.finished || this.board === null) return;
		const pair = findHint(this.board, this._rng);
		if (pair === null) {
			this.emit("statusMessage", "No pair is free. Shuffle to move on.");
			this.emit("boardStuck");
			return;
		}
		this.hintsUsed += 1;
		this.select(-1);
		this.emit("hintOffered", pair[0], pair[1]);
	}

	/** Re-deals the tiles still in play. The faces are the same; the places change. */
	shuffle() {
		if (this.finished || this.board === null) return;
		if (this.board.remaining === 0) return;
		const faces = shuffleFaces(this.board, this._rng);
		if (faces === null) {
			this.emit("statusMessage", "The shuffle could not find a way through.");
			return;
		}
		this.shufflesUsed += 1;
		this.select(-1);
		this.history.push(new ShuffleCommand([...this.board.faces], faces), this.board);
		this._afterMove(false);
		this.emit("statusMessage", "Shuffled.");
	}

	/** Steps the selection through the free tiles, for keyboard play. */
	cycleSelection(step) {
		if (this.finished || this.board === null) return;
		const free = this.board.freeIndices();
		if (free.length === 0) return;
		const current = free.indexOf(this.selected);
		const next = current < 0
			? (step > 0 ? 0 : free.length - 1)
			: (current + step + free.length) % free.length;
		this.select(free[next]);
	}

	partners() {
		if (this.board === null || this.selected < 0) return [];
		if (this.settings !== undefined && this.settings !== null && !this.settings.get("highlightMatches")) return [];
		return partnersOf(this.board, this.selected);
	}

	tilesLeft() {
		return this.board?.remaining ?? 0;
	}

	// --- Internals -----------------------------------------------------------

	_afterMove(checkWin = true) {
		this.emit("tilesLeftChanged", this.board.remaining, this.layout.count);
		if (checkWin && this.board.remaining === 0) {
			this._finish();
			return;
		}
		if (!this.board.hasFreePair()) this.emit("boardStuck");
	}

	_finish() {
		this.finished = true;
		this.playing = false;
		this._stopClock();
		const seconds = Math.floor(this.elapsed);
		this.save.recordCleared(this.layout.id, layoutIndex(this.layout.id), seconds,
			this.hintsUsed, this.shufflesUsed);
		this.emit("boardCleared", seconds, this.hintsUsed, this.shufflesUsed);
	}

	_announceBoard() {
		this.emit("boardLoaded", this.layout);
		this.emit("tilesLeftChanged", this.board.remaining, this.layout.count);
		this.emit("historyChanged", this.history.canUndo());
		this.emit("timeChanged", Math.floor(this.elapsed));
		this._announceSelection();
		// A board put away with no moves left is still stuck when it comes back.
		if (this.board.remaining > 0 && !this.board.hasFreePair()) this.emit("boardStuck");
	}

	_announceSelection() {
		this.emit("selectionChanged", this.selected, this.partners());
	}

	_startClock() {
		this._stopClock();
		this.playing = true;
		this._tickStamp = Date.now();
		this._tickHandle = setInterval(() => this._tick(), TICK_MS);
	}

	_stopClock() {
		if (this._tickHandle === null) return;
		clearInterval(this._tickHandle);
		this._tickHandle = null;
	}

	_tick() {
		if (!this.playing) return;
		const now = Date.now();
		this.elapsed += (now - this._tickStamp) / 1000;
		this._tickStamp = now;
		const whole = Math.floor(this.elapsed);
		if (whole === this._lastWholeSecond) return;
		this._lastWholeSecond = whole;
		this.emit("timeChanged", whole);
	}
}
