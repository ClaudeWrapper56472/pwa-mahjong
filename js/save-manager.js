import * as Migration from "./save-migration.js";
import { Emitter } from "./util/emitter.js";

/**
 * Reads and writes the save document in localStorage.
 *
 * Saving is driven by an event: SaveManager announces that it is about to write,
 * whoever owns live state hands it over, then the write happens. That keeps this
 * file free of any knowledge of the running game.
 *
 * A browser tab can be discarded with no warning, so every hook that might be
 * the last one flushes.
 *
 * Emits: saveRequested(), statsChanged(), sessionAvailable(available)
 */
export class SaveManager extends Emitter {
	static STORAGE_KEY = "jade-match.save";

	constructor(settings) {
		super();
		this._settings = settings;
		this._document = Migration.emptyDocument();
		this._loaded = false;
	}

	/**
	 *   visibilitychange -> hidden   backgrounded, or the screen locked
	 *   pagehide                     navigating away or being unloaded
	 *   freeze                       the browser is suspending the tab
	 */
	installSuspendHooks() {
		const flush = () => this.flush();
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") flush();
		});
		window.addEventListener("pagehide", flush);
		window.addEventListener("freeze", flush);
	}

	flush() {
		if (!this._loaded) return;
		this.emit("saveRequested");
		this._settings?.save();
		this._write();
	}

	/** Called from a saveRequested handler. */
	submitSession(session) {
		this._document.session = session;
	}

	clearSession() {
		this._document.session = {};
		this._write();
		this.emit("sessionAvailable", false);
	}

	hasSession() {
		const session = this._document.session;
		return isObject(session) && typeof session.layout === "string";
	}

	session() {
		return this._document.session ?? {};
	}

	stats() {
		return this._document.stats ?? Migration.emptyStats();
	}

	layoutStats(id) {
		return this.stats().layouts?.[id] ?? Migration.emptyLayoutStats();
	}

	/** How many layouts are open. The next one unlocks when this one is cleared. */
	unlockedCount() {
		return Math.max(1, Number(this.stats().unlocked ?? 1));
	}

	isUnlocked(index) {
		return index < this.unlockedCount();
	}

	load() {
		this._loaded = true;
		let text = null;
		try {
			text = localStorage.getItem(SaveManager.STORAGE_KEY);
		} catch {
			// Private mode, or storage disabled. The game plays; it just forgets.
			this._document = Migration.emptyDocument();
			return;
		}
		if (text === null) {
			this._document = Migration.emptyDocument();
			return;
		}

		let parsed = null;
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = null;
		}
		if (!isObject(parsed)) console.warn("Save document is not valid JSON; starting fresh.");
		this._document = Migration.migrate(parsed);
		this.emit("sessionAvailable", this.hasSession());
		this.emit("statsChanged");
	}

	recordStarted(id) {
		const entry = this._layoutEntry(id);
		entry.plays = Number(entry.plays ?? 0) + 1;
		this._write();
		this.emit("statsChanged");
	}

	/**
	 * Records a cleared board and opens the next layout. Both happen in the same
	 * write, so the unlock cannot get out of step with the board that earned it.
	 */
	recordCleared(id, index, seconds, hints, shuffles) {
		const entry = this._layoutEntry(id);
		entry.cleared = Number(entry.cleared ?? 0) + 1;
		const best = Number(entry.best_time ?? 0);
		if (best === 0 || seconds < best) entry.best_time = seconds;

		const stats = this.stats();
		stats.cleared = Number(stats.cleared ?? 0) + 1;
		stats.hints_used = Number(stats.hints_used ?? 0) + hints;
		stats.shuffles_used = Number(stats.shuffles_used ?? 0) + shuffles;
		stats.unlocked = Math.max(Number(stats.unlocked ?? 1), index + 2);
		this._document.stats = stats;

		this._document.session = {};
		this._write();
		this.emit("statsChanged");
		this.emit("sessionAvailable", false);
	}

	_layoutEntry(id) {
		const stats = this.stats();
		const layouts = stats.layouts ?? {};
		if (!isObject(layouts[id])) layouts[id] = Migration.emptyLayoutStats();
		stats.layouts = layouts;
		this._document.stats = stats;
		return layouts[id];
	}

	_write() {
		this._document.version = Migration.CURRENT_VERSION;
		try {
			localStorage.setItem(SaveManager.STORAGE_KEY, JSON.stringify(this._document));
		} catch (error) {
			// Out of quota, or storage blocked. Losing the write is bad; taking the
			// running game down with it would be worse.
			console.warn("Could not write the save document.", error);
		}
	}
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
