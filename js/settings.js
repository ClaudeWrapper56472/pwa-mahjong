import { Emitter } from "./util/emitter.js";

/**
 * Player preferences, kept apart from the save document: wiping a stuck game
 * should not reset them, and they are read before any game exists.
 *
 * Emits: changed()
 */
export class Settings extends Emitter {
	static STORAGE_KEY = "jade-match.settings";

	/** Every option and its default. Match highlighting is an assist, so it is off. */
	static DEFAULTS = {
		highlightMatches: false,
	};

	constructor() {
		super();
		this._values = { ...Settings.DEFAULTS };
	}

	load() {
		let stored = null;
		try {
			stored = JSON.parse(localStorage.getItem(Settings.STORAGE_KEY) ?? "null");
		} catch {
			stored = null;
		}
		if (stored !== null && typeof stored === "object") {
			for (const option of Object.keys(Settings.DEFAULTS)) {
				if (option in stored) this._values[option] = Boolean(stored[option]);
			}
		}
		this.emit("changed");
	}

	save() {
		try {
			localStorage.setItem(Settings.STORAGE_KEY, JSON.stringify(this._values));
		} catch {
			// Nothing here is worth failing a save for.
		}
	}

	set(option, value) {
		if (!this.has(option)) {
			console.warn(`Unknown setting: ${option}`);
			return;
		}
		if (this._values[option] === value) return;
		this._values[option] = value;
		this.save();
		this.emit("changed");
	}

	get(option) {
		return this.has(option) ? this._values[option] : false;
	}

	has(option) {
		return Object.hasOwn(Settings.DEFAULTS, option);
	}
}
