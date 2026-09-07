import { nextLayout } from "../layouts/catalog.js";
import { BoardView } from "./board-view.js";
import { Emitter } from "../util/emitter.js";

/**
 * The playing screen: the board, the toolbar and the panels over them.
 *
 * The only view that knows every piece exists. A tap on the board becomes a
 * GameState call and a GameState event becomes a label; nothing here holds game
 * state, so the screen can be left and reopened mid-board.
 *
 * Emits: exitRequested(), menuRequested(), nextRequested(layoutId)
 */
export class GameScreen extends Emitter {
	static STATUS_MS = 3200;

	/** Stays up, rather than timing out, until the board changes. */
	static STUCK_TEXT = "No free pair left. Shuffle, or take a move back.";

	constructor(root, game) {
		super();
		this.root = root;
		this.game = game;

		this._nameLabel = root.querySelector("#board-name");
		this._timeLabel = root.querySelector("#time-label");
		this._leftLabel = root.querySelector("#left-label");
		this._statusLabel = root.querySelector("#status-label");
		this._backButton = root.querySelector("#back-button");
		this._undoButton = root.querySelector("#undo-button");
		this._hintButton = root.querySelector("#hint-button");
		this._shuffleButton = root.querySelector("#shuffle-button");
		this._fitButton = root.querySelector("#fit-button");
		this._zoomInButton = root.querySelector("#zoom-in-button");
		this._zoomOutButton = root.querySelector("#zoom-out-button");
		this._resultPanel = root.querySelector("#result-panel");
		this._resultTitle = root.querySelector("#result-title");
		this._resultDetail = root.querySelector("#result-detail");
		this._againButton = root.querySelector("#again-button");
		this._resultMenuButton = root.querySelector("#result-menu-button");

		this._board = new BoardView(
			root.querySelector("#board-viewport"),
			root.querySelector("#board"),
			game,
		);

		this._statusTimer = null;
		this._stuck = false;
		/** The board the result card offers, or null at the end of the ladder. */
		this._next = null;

		this._wireBoard();
		this._wireButtons();
		this._wireGame();
		this._installKeyboard();

		this._resultPanel.hidden = true;
		this._statusLabel.textContent = "";
	}

	_wireBoard() {
		this._board.on("tileTapped", (index) => this.game.tapTile(index));
	}

	_wireButtons() {
		this._backButton.addEventListener("click", () => this._onBackPressed());
		this._undoButton.addEventListener("click", () => this.game.undo());
		this._hintButton.addEventListener("click", () => this.game.hint());
		this._shuffleButton.addEventListener("click", () => this.game.shuffle());
		this._fitButton.addEventListener("click", () => this._board.fit());
		this._zoomInButton.addEventListener("click", () => this._board.zoomBy(1.3));
		this._zoomOutButton.addEventListener("click", () => this._board.zoomBy(1 / 1.3));
		this._againButton.addEventListener("click", () => {
			this._resultPanel.hidden = true;
			if (this._next === null) this.game.restart();
			else this.emit("nextRequested", this._next.id);
		});
		this._resultMenuButton.addEventListener("click", () => {
			this._resultPanel.hidden = true;
			this.emit("menuRequested");
		});
	}

	_wireGame() {
		const game = this.game;
		game.on("boardLoaded", (layout) => {
			this._resultPanel.hidden = true;
			this._nameLabel.textContent = layout.name;
			this._setStuck(false);
			this._showStatus("Tap two matching tiles. A tile is free when its top and one side are clear.");
		});
		game.on("timeChanged", (seconds) => {
			this._timeLabel.textContent = formatTime(seconds);
		});
		game.on("tilesLeftChanged", (left, total) => {
			this._leftLabel.textContent = `${left} / ${total}`;
			this._setStuck(false);
		});
		game.on("historyChanged", (canUndo) => {
			this._undoButton.disabled = !canUndo;
		});
		game.on("statusMessage", (message) => this._showStatus(message));
		game.on("boardStuck", () => this._setStuck(true));
		game.on("boardCleared", (seconds, hints, shuffles) => {
			this._resultTitle.textContent = "Board cleared";
			this._next = nextLayout(game.layout.id);
			this._againButton.textContent = this._next === null ? "Play again" : `Next: ${this._next.name}`;
			const parts = [formatTime(seconds)];
			if (hints > 0) parts.push(`${hints} hint${hints === 1 ? "" : "s"}`);
			if (shuffles > 0) parts.push(`${shuffles} shuffle${shuffles === 1 ? "" : "s"}`);
			this._resultDetail.textContent = parts.join("   ");
			this._resultPanel.hidden = false;
			this._againButton.focus();
		});
	}

	/** Keyboard play: step through the free tiles and take them. */
	_installKeyboard() {
		window.addEventListener("keydown", (event) => {
			if (this.root.hidden || !this._resultPanel.hidden) return;
			if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
			const game = this.game;
			const key = event.key;
			if (key === "ArrowRight" || key === "ArrowDown" || key === "Tab") game.cycleSelection(1);
			else if (key === "ArrowLeft" || key === "ArrowUp") game.cycleSelection(-1);
			else if (key === "Enter" || key === " ") game.tapTile(game.selected);
			else if (key === "h" || key === "H") game.hint();
			else if (key === "s" || key === "S") game.shuffle();
			else if (key === "f" || key === "F") this._board.fit();
			else if (key === "+" || key === "=") this._board.zoomBy(1.3);
			else if (key === "-") this._board.zoomBy(1 / 1.3);
			else if ((key === "z" || key === "Z") && (event.ctrlKey || event.metaKey)) game.undo();
			else if (key === "Escape") this._onBackPressed();
			else return;
			event.preventDefault();
		});
	}

	_onBackPressed() {
		if (!this.game.finished) this.game.suspend();
		this.emit("exitRequested");
	}

	/**
	 * The stuck notice outlives ordinary messages: one may cover it for a few
	 * seconds, but when that clears the notice comes back until a move changes
	 * the board.
	 */
	_setStuck(stuck) {
		this._stuck = stuck;
		this._shuffleButton.classList.toggle("is-urgent", stuck);
		if (stuck) {
			if (this._statusTimer !== null) clearTimeout(this._statusTimer);
			this._statusTimer = null;
			this._statusLabel.textContent = GameScreen.STUCK_TEXT;
		} else if (this._statusTimer === null) {
			this._statusLabel.textContent = "";
		}
	}

	_showStatus(message) {
		this._statusLabel.textContent = message;
		if (this._statusTimer !== null) clearTimeout(this._statusTimer);
		this._statusTimer = setTimeout(() => {
			this._statusLabel.textContent = this._stuck ? GameScreen.STUCK_TEXT : "";
			this._statusTimer = null;
		}, GameScreen.STATUS_MS);
	}
}

function formatTime(seconds) {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
