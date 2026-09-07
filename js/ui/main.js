import { Settings } from "../settings.js";
import { SaveManager } from "../save-manager.js";
import { GameState } from "../game-state.js";
import { MenuScreen } from "./menu-screen.js";
import { GameScreen } from "./game-screen.js";

/**
 * Boot and screen router.
 *
 * Both screens exist from the start and are shown or hidden. There are two of
 * them and they are cheap, so the board does not rebuild its tiles every time
 * the player glances at the menu.
 */

const settings = new Settings();
settings.load();

const save = new SaveManager(settings);
save.load();
save.installSuspendHooks();

const game = new GameState(save, settings);

const menuRoot = document.querySelector("#menu-screen");
const gameRoot = document.querySelector("#game-screen");
const rulesPanel = document.querySelector("#rules-panel");
const menu = new MenuScreen(menuRoot, save, settings);
const screen = new GameScreen(gameRoot, game);

function showMenu() {
	menuRoot.hidden = false;
	gameRoot.hidden = true;
	menu.refresh();
}

function showGame() {
	menuRoot.hidden = true;
	gameRoot.hidden = false;
}

menu.on("playRequested", (layoutId) => {
	showGame();
	if (!game.startLayout(layoutId)) showMenu();
});

/**
 * Continuing means the saved board if it loads, and a fresh one of the same
 * shape if it does not: a save written by an older build should cost a game, not
 * the app.
 */
menu.on("continueRequested", () => {
	showGame();
	if (game.resumeSavedGame()) return;
	const fallback = String(save.session().layout ?? "");
	save.clearSession();
	if (!game.startLayout(fallback)) showMenu();
});

menu.on("rulesRequested", () => {
	rulesPanel.hidden = false;
	rulesPanel.querySelector("button").focus();
});

rulesPanel.querySelector("#rules-close").addEventListener("click", () => {
	rulesPanel.hidden = true;
});

screen.on("exitRequested", showMenu);
screen.on("menuRequested", showMenu);
screen.on("nextRequested", (layoutId) => {
	if (!game.startLayout(layoutId)) showMenu();
});

showMenu();

if ("serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("sw.js").catch((error) => {
			// Offline play is the only casualty, and it is not worth a visible error.
			console.warn("Service worker registration failed.", error);
		});
	});
}
