/**
 * Self-check for the game layer.
 *
 *     node tests/verify.mjs
 *
 * Nothing here touches the DOM, so the whole layer runs under plain Node. Plain
 * assertions rather than a framework, so it runs with nothing installed.
 */
import { Layout } from "../js/layouts/layout.js";
import { LAYOUTS } from "../js/layouts/catalog.js";
import { BoardState } from "../js/board-state.js";
import { dealPlan, shufflePlan, findHint, playout, isWinnable } from "../js/deal.js";
import { FACES, matchKey, matches, pairDeck, pairsFromFaces } from "../js/tiles/tile-set.js";
import { spriteSheet, symbolId } from "../js/tiles/faces.js";
import { UndoStack } from "../js/commands/undo-stack.js";
import { MatchCommand } from "../js/commands/match-command.js";
import { ShuffleCommand } from "../js/commands/shuffle-command.js";
import * as Migration from "../js/save-migration.js";
import { Rng } from "../js/util/rng.js";

let passed = 0;
const failures = [];
let suite = "";

function group(name) {
	suite = name;
	process.stdout.write(`\n${name}\n`);
}

function check(message, condition) {
	if (condition) {
		passed += 1;
		return;
	}
	failures.push(`${suite}: ${message}`);
	process.stdout.write(`  FAIL  ${message}\n`);
}

function eq(message, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) {
		process.stdout.write(`         got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}\n`);
	}
	check(message, ok);
}

function throws(message, body) {
	try {
		body();
	} catch {
		passed += 1;
		return;
	}
	failures.push(`${suite}: ${message}`);
	process.stdout.write(`  FAIL  ${message}\n`);
}

/**
 * The fixture: four tiles in a row on the ground, two stacked over the seams.
 *
 *     [0][1][2][3]      layer 0
 *      [4][5]           layer 1, offset by half a tile
 */
function fixture() {
	return new Layout({
		id: "fixture",
		name: "Fixture",
		difficulty: "Test",
		blurb: "",
		layers: [["[][][][]"], [" [][]"]],
	});
}

// --- Layouts ----------------------------------------------------------------

group("Layout geometry");
{
	const layout = fixture();
	eq("six tiles", layout.count, 6);
	eq("the ground row is at layer 0", [...layout.zs], [0, 0, 0, 0, 1, 1]);
	eq("tiles step two half-units apart", [...layout.xs], [0, 2, 4, 6, 1, 3]);
	eq("the raised pair sits on two tiles each", layout.under[4].length, 2);
	eq("the second ground tile carries two", layout.covers[1].length, 2);
	eq("the leftmost tile has nothing to its left", layout.left[0].length, 0);
	eq("the leftmost tile has one neighbour to its right", layout.right[0].length, 1);
	check("a raised tile paints over the ground", layout.depth(4) > layout.depth(3));

	throws("overlapping tiles are refused", () => new Layout({
		id: "bad", name: "", difficulty: "", blurb: "", layers: [["[][]", " []"]],
	}));
	throws("a floating tile is refused", () => new Layout({
		id: "bad", name: "", difficulty: "", blurb: "", layers: [["[]"], ["    []"]],
	}));
	throws("an odd tile count is refused", () => new Layout({
		id: "bad", name: "", difficulty: "", blurb: "", layers: [["[]"]],
	}));
}

group("Shipped layouts");
{
	eq("six boards ship", LAYOUTS.length, 6);
	for (const layout of LAYOUTS) {
		check(`${layout.id} pairs up`, layout.count % 2 === 0);
		check(`${layout.id} fits the deck`, layout.count <= 144);
		check(`${layout.id} has a positive box`, layout.box.width > 0 && layout.box.height > 0);
	}
	const counts = LAYOUTS.map((layout) => layout.count);
	eq("boards grow through the ladder", counts, [38, 58, 88, 114, 144, 144]);
	check("the ladder never shrinks", counts.every((count, i) => i === 0 || count >= counts[i - 1]));
}

// --- Free tiles -------------------------------------------------------------

group("Which tiles are free");
{
	const layout = fixture();
	const state = new BoardState(layout);
	state.setFaces(["c1", "c2", "c3", "c1", "c2", "c3"]);

	check("a covered tile is not free", !state.isFree(0) && !state.isFree(1) && !state.isFree(2));
	check("the tile past the stack is free", state.isFree(3));
	check("both raised tiles are free", state.isFree(4) && state.isFree(5));
	eq("a covered tile says so", state.blockedBy(1), "covered");

	state.remove(4);
	check("half the cover is not enough", !state.isFree(1));
	state.remove(5);
	check("clearing the top frees the end of the row", state.isFree(0));
	check("but the middle is hemmed in on both sides", !state.isFree(1));
	eq("a hemmed tile says so", state.blockedBy(1), "hemmed");
	state.remove(0);
	check("taking a neighbour frees the middle", state.isFree(1));

	state.restore(0);
	state.restore(4);
	state.restore(5);
	check("restoring puts the cover back", !state.isFree(1) && !state.isFree(2));
	eq("restoring puts the count back", state.remaining, 6);
}

group("Matching");
{
	check("same face matches", matches("b7", "b7"));
	check("different ranks do not", !matches("b7", "b8"));
	check("different suits do not", !matches("b7", "c7"));
	check("any flower matches any other", matches("f1", "f3"));
	check("any season matches any other", matches("s2", "s4"));
	check("a flower is not a season", !matches("f1", "s1"));
	eq("flowers share one key", matchKey("f1"), matchKey("f4"));

	const rng = new Rng(4);
	const pairs = pairDeck(rng);
	eq("the deck makes 72 pairs", pairs.length, 72);
	check("every pair is a legal match", pairs.every(([a, b]) => matches(a, b)));
	const counts = new Map();
	for (const id of pairs.flat()) counts.set(id, (counts.get(id) ?? 0) + 1);
	eq("144 tiles in the deck", pairs.flat().length, 144);
	check("ordinary faces come four at a time",
		FACES.filter((entry) => entry.group === null).every((entry) => counts.get(entry.id) === 4));
	check("bonus tiles come one at a time",
		FACES.filter((entry) => entry.group !== null).every((entry) => counts.get(entry.id) === 1));

	const regrouped = pairsFromFaces(["f1", "f2", "b3", "b3", "s1", "s2"], new Rng(9));
	eq("faces in play pair back up", regrouped.length, 3);
	check("and legally", regrouped.every(([a, b]) => matches(a, b)));
}

// --- Dealing ----------------------------------------------------------------

group("Dealing");
{
	for (const layout of LAYOUTS) {
		const rng = new Rng(layout.count * 31 + 7);
		const plan = dealPlan(layout, rng);
		check(`${layout.id} deals`, plan !== null);
		if (plan === null) continue;

		eq(`${layout.id} fills every place`, plan.faces.filter((face) => face !== null).length, layout.count);
		eq(`${layout.id} plans every pair`, plan.order.length, layout.count / 2);

		// The order the deal was built from has to be playable move for move.
		const state = new BoardState(layout);
		state.setFaces(plan.faces);
		let legal = true;
		for (const [a, b] of plan.order) {
			if (!state.isFree(a) || !state.isFree(b) || !matches(state.faceAt(a), state.faceAt(b))) {
				legal = false;
				break;
			}
			state.remove(a);
			state.remove(b);
		}
		check(`${layout.id} deals a board that comes apart`, legal && state.remaining === 0);
	}
}

group("Shuffling");
{
	const layout = LAYOUTS[3];
	const rng = new Rng(1234);
	const state = new BoardState(layout);
	state.setFaces(dealPlan(layout, rng).faces);
	for (let move = 0; move < 12; move += 1) {
		const pair = state.freePairs()[0];
		state.remove(pair[0]);
		state.remove(pair[1]);
	}

	const before = [...state.remainingFaces()].sort();
	const plan = shufflePlan(state, rng);
	check("a shuffle finds an arrangement", plan !== null);
	const after = state.remainingIndices().map((index) => plan.faces[index]).sort();
	eq("the same tiles are still in play", after, before);
	eq("tiles already taken are untouched",
		plan.faces.filter((_face, index) => state.isRemoved(index)).join(),
		state.faces.filter((_face, index) => state.isRemoved(index)).join());

	const shuffled = state.clone();
	shuffled.setFaces(plan.faces);
	let legal = true;
	for (const [a, b] of plan.order) {
		if (!shuffled.isFree(a) || !shuffled.isFree(b)
			|| !matches(shuffled.faceAt(a), shuffled.faceAt(b))) {
			legal = false;
			break;
		}
		shuffled.remove(a);
		shuffled.remove(b);
	}
	check("and the shuffled board comes apart", legal && shuffled.remaining === 0);
}

group("Hints");
{
	const layout = LAYOUTS[2];
	const rng = new Rng(77);
	const state = new BoardState(layout);
	state.setFaces(dealPlan(layout, rng).faces);

	const pair = findHint(state, rng);
	check("a hint is offered", pair !== null);
	check("both tiles are free", state.isFree(pair[0]) && state.isFree(pair[1]));
	check("and they match", matches(state.faceAt(pair[0]), state.faceAt(pair[1])));

	const trial = state.clone();
	trial.remove(pair[0]);
	trial.remove(pair[1]);
	check("the hinted move leaves a winnable board", isWinnable(trial, rng, 60));

	const stuck = new BoardState(fixture());
	stuck.setFaces(["c1", "c2", "c3", "c4", "c5", "c6"]);
	check("nothing matches on a board of singles", !stuck.hasFreePair());
	eq("and no hint is invented", findHint(stuck, rng), null);
	check("a playout on a dead board fails", !playout(stuck, rng));
}

// --- Moves ------------------------------------------------------------------

group("Undo");
{
	const layout = fixture();
	const state = new BoardState(layout);
	state.setFaces(["c1", "c2", "c2", "c1", "b5", "b5"]);
	const history = new UndoStack();
	let touched = null;
	state.onChanged = (indices) => { touched = indices; };

	history.push(new MatchCommand(0, 3), state);
	eq("a match takes two tiles", state.remaining, 4);
	eq("and reports both", touched, [0, 3]);
	check("undo is available", history.canUndo());

	history.push(new MatchCommand(4, 5), state);
	eq("two matches take four", state.remaining, 2);
	history.undo(state);
	eq("undo puts a pair back", state.remaining, 4);
	check("and the tiles are on the board again", !state.isRemoved(4) && !state.isRemoved(5));
	history.undo(state);
	eq("undo unwinds to the start", state.remaining, 6);
	check("and then stops", !history.canUndo());
	eq("undoing an empty history is harmless", history.undo(state), []);

	const shuffle = new ShuffleCommand([...state.faces], ["b5", "b5", "c1", "c2", "c2", "c1"]);
	history.push(shuffle, state);
	eq("a shuffle rewrites the faces", state.faceAt(0), "b5");
	history.undo(state);
	eq("and undo puts them back", state.faceAt(0), "c1");

	history.push(new MatchCommand(1, 2), state);
	const restored = new UndoStack();
	restored.fromJSON(JSON.parse(JSON.stringify(history.toJSON())));
	eq("history survives a round trip", restored.depth(), history.depth());
	const replay = new BoardState(layout);
	replay.setFaces(state.faces);
	replay.remove(1);
	replay.remove(2);
	restored.undo(replay);
	eq("and the rebuilt command still reverts", replay.remaining, 6);

	restored.fromJSON([{ t: "?" }, null, { t: MatchCommand.TYPE, a: 0, b: 1 }]);
	eq("unknown entries are dropped, not faulted", restored.depth(), 1);

	const deep = new UndoStack();
	const board = new BoardState(fixture());
	for (let i = 0; i < UndoStack.MAX_DEPTH + 20; i += 1) deep.push(new MatchCommand(0, 1), board);
	eq("history is capped", deep.depth(), UndoStack.MAX_DEPTH);
}

group("Board serialization");
{
	const layout = LAYOUTS[0];
	const state = new BoardState(layout);
	state.setFaces(dealPlan(layout, new Rng(5)).faces);
	state.remove(0);
	state.remove(layout.count - 1);
	const text = state.toRemovedString();
	eq("one character per place", text.length, layout.count);

	const copy = new BoardState(layout);
	copy.setFaces(state.faces);
	copy.fromRemovedString(text);
	eq("the same tiles are gone", copy.remaining, state.remaining);
	check("and the counts were rebuilt",
		copy.freeIndices().join() === state.freeIndices().join());
}

// --- Save --------------------------------------------------------------------

group("Save migration");
{
	const empty = Migration.emptyDocument();
	eq("a fresh document is at the current version", empty.version, Migration.CURRENT_VERSION);
	eq("with one board open", empty.stats.unlocked, 1);
	eq("garbage becomes a fresh document", Migration.migrate("nonsense").stats.unlocked, 1);
	eq("so does null", Migration.migrate(null).stats.cleared, 0);

	const carried = Migration.migrate({
		stats: { unlocked: 3, cleared: 4, layouts: { turtle: { cleared: 2, best_time: 91 } } },
		session: { layout: "turtle" },
	});
	eq("progress carries over", carried.stats.unlocked, 3);
	eq("board records carry over", carried.stats.layouts.turtle.best_time, 91);
	eq("missing fields take their default", carried.stats.layouts.turtle.plays, 0);
	eq("the session carries over", carried.session.layout, "turtle");
	eq("a broken unlock count is floored", Migration.migrate({ stats: { unlocked: -5 } }).stats.unlocked, 1);
}

// --- Art ---------------------------------------------------------------------

group("Tile faces");
{
	const sheet = spriteSheet();
	eq("42 faces are drawn", (sheet.match(/<symbol/g) ?? []).length, 42);
	check("every face has a symbol",
		FACES.every((entry) => sheet.includes(`id="${symbolId(entry.id)}"`)));
	check("no face is empty",
		FACES.every((entry) => {
			const start = sheet.indexOf(`id="${symbolId(entry.id)}"`);
			return sheet.slice(start, sheet.indexOf("</symbol>", start)).includes("<");
		}));
	check("no face has a hole in its numbers", !sheet.includes("NaN") && !sheet.includes("undefined"));
}

group("Seeded randomness");
{
	const layout = LAYOUTS[1];
	const first = dealPlan(layout, new Rng(2024)).faces.join();
	const again = dealPlan(layout, new Rng(2024)).faces.join();
	eq("one seed, one deal", first, again);
	check("another seed, another deal", dealPlan(layout, new Rng(2025)).faces.join() !== first);
}

process.stdout.write(`\n${passed} checks passed.\n`);
if (failures.length > 0) {
	process.stdout.write(`${failures.length} failed:\n`);
	for (const failure of failures) process.stdout.write(`  ${failure}\n`);
	process.exit(1);
}
