import { LAYOUTS } from "../layouts/catalog.js";
import { Emitter } from "../util/emitter.js";

/**
 * Title screen: continue where you left off, or pick a board.
 *
 * Boards open in order, one behind the last one cleared. The menu asks the save
 * what is open and what the best time was, and reports presses; it decides
 * nothing itself.
 *
 * Emits: playRequested(layoutId), continueRequested(), rulesRequested()
 */
export class MenuScreen extends Emitter {
	constructor(root, save, settings) {
		super();
		this.root = root;
		this.save = save;
		this.settings = settings;

		this._continueButton = root.querySelector("#continue-button");
		this._list = root.querySelector("#layout-list");
		this._summary = root.querySelector("#menu-summary");
		this._rulesButton = root.querySelector("#rules-button");
		this._matchToggle = root.querySelector("#match-toggle");

		this._continueButton.addEventListener("click", () => this.emit("continueRequested"));
		this._rulesButton.addEventListener("click", () => this.emit("rulesRequested"));
		this._matchToggle.addEventListener("change", () => {
			this.settings.set("highlightMatches", this._matchToggle.checked);
		});

		save.on("statsChanged", () => this.refresh());
		save.on("sessionAvailable", () => this.refresh());
		this._buildList();
		this.refresh();
	}

	_buildList() {
		this._buttons = LAYOUTS.map((layout) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "layout";
			button.addEventListener("click", () => this.emit("playRequested", layout.id));

			const name = document.createElement("span");
			name.className = "layout-name";
			const detail = document.createElement("span");
			detail.className = "layout-detail";
			const mark = document.createElement("span");
			mark.className = "layout-mark";
			button.append(name, detail, mark);

			this._list.append(button);
			return { layout, button, name, detail, mark };
		});
	}

	refresh() {
		const session = this.save.session();
		const running = this.save.hasSession();
		this._continueButton.hidden = !running;
		if (running) {
			const layout = LAYOUTS.find((entry) => entry.id === session.layout);
			const left = countRemaining(session.removed);
			this._continueButton.textContent =
				`Continue ${layout?.name ?? "board"} · ${left} tiles left`;
		}

		for (const row of this._buttons) {
			const index = LAYOUTS.indexOf(row.layout);
			const open = this.save.isUnlocked(index);
			const stats = this.save.layoutStats(row.layout.id);
			row.button.disabled = !open;
			row.button.classList.toggle("is-locked", !open);
			row.name.textContent = row.layout.name;
			row.detail.textContent = open
				? `${row.layout.difficulty} · ${row.layout.count} tiles`
				: `Clear ${LAYOUTS[index - 1].name} to open`;
			if (!open) row.mark.textContent = "🔒";
			else if (stats.cleared > 0) row.mark.textContent = formatTime(stats.best_time);
			else row.mark.textContent = "";
			row.mark.classList.toggle("is-time", open && stats.cleared > 0);
		}

		this._matchToggle.checked = this.settings.get("highlightMatches");
		this._renderSummary();
	}

	_renderSummary() {
		const stats = this.save.stats();
		const cleared = Number(stats.cleared ?? 0);
		const open = Math.min(this.save.unlockedCount(), LAYOUTS.length);
		const lines = [`${open} of ${LAYOUTS.length} boards open`];
		lines.push(cleared === 1 ? "1 board cleared" : `${cleared} boards cleared`);
		this._summary.replaceChildren();
		for (const line of lines) {
			const paragraph = document.createElement("p");
			paragraph.textContent = line;
			this._summary.append(paragraph);
		}
	}
}

function countRemaining(removed) {
	if (typeof removed !== "string") return 0;
	let left = 0;
	for (const flag of removed) {
		if (flag === "0") left += 1;
	}
	return left;
}

function formatTime(seconds) {
	if (!seconds) return "";
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
