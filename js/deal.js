import { BoardState } from "./board-state.js";
import { matchKey, pairDeck, pairsFromFaces } from "./tiles/tile-set.js";

/**
 * Dealing, shuffling and the little solver behind the hint.
 *
 * A deal is built by playing it. Starting from a full layout, two free positions
 * are taken at a time and handed the next pair from the deck, so the order they
 * were dealt in is a solution and every deal ships with one. Taking one of the
 * two from the highest live layer keeps the stacks peeling, which is what stops
 * the last two tiles being one sat on top of the other.
 */

/** How many times to redraw the removal order before giving up on a layout. */
const DEAL_ATTEMPTS = 60;

/** Random games played to decide whether a move keeps the board winnable. */
const PLAYOUTS_PER_PAIR = 6;

/** How long the hint may search before settling for any legal pair. */
const HINT_BUDGET_MS = 120;

/**
 * A deal, and the order that clears it. The order is the proof the deal is
 * winnable; the game itself only needs the faces.
 */
export function dealPlan(layout, rng) {
	const pairs = pairDeck(rng).slice(0, layout.count / 2);
	return plan(layout, rng, null, pairs);
}

/** Faces for a whole layout, or null if the layout would not come apart. */
export function dealFaces(layout, rng) {
	return dealPlan(layout, rng)?.faces ?? null;
}

/**
 * Re-deals the tiles still on the board. The faces in play are unchanged, so a
 * shuffle can never make a board unwinnable through a missing match; it only
 * moves the faces to positions that come apart again.
 */
export function shufflePlan(state, rng) {
	const live = state.remainingIndices();
	const pairs = pairsFromFaces(live.map((i) => state.faces[i]), rng);
	return plan(state.layout, rng, live, pairs, state.faces);
}

export function shuffleFaces(state, rng) {
	return shufflePlan(state, rng)?.faces ?? null;
}

/**
 * Hands the pairs out over a legal removal order, retrying until a draw comes
 * apart cleanly. Null when none of the attempts did.
 */
function plan(layout, rng, positions, pairs, base = null) {
	const places = positions === null ? layout.count : positions.length;
	if (pairs.length * 2 !== places) return null;
	for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt += 1) {
		const order = removalOrder(layout, rng, positions);
		if (order === null) continue;
		const faces = base === null ? new Array(layout.count).fill(null) : [...base];
		order.forEach(([a, b], step) => {
			faces[a] = pairs[step][0];
			faces[b] = pairs[step][1];
		});
		return { faces, order };
	}
	return null;
}

/**
 * A legal order to take the tiles in, or null if the draw painted itself into a
 * corner. Positions default to the whole layout.
 */
function removalOrder(layout, rng, positions) {
	const state = new BoardState(layout);
	if (positions !== null) state.removeAllExcept(positions);
	const order = [];
	while (state.remaining > 0) {
		const free = state.freeIndices();
		if (free.length < 2) return null;
		const a = rng.pick(highest(free, layout));
		const rest = free.filter((index) => index !== a);
		const b = rng.pick(rest);
		state.remove(a);
		state.remove(b);
		order.push([a, b]);
	}
	return order;
}

/** The free tiles sitting on the highest live layer. */
function highest(free, layout) {
	let top = -1;
	for (const index of free) top = Math.max(top, layout.zs[index]);
	return free.filter((index) => layout.zs[index] === top);
}

/**
 * Plays random legal moves to the end. True if the board came apart, which is
 * proof that the position it started from is still winnable.
 */
export function playout(state, rng) {
	const board = state.clone();
	while (board.remaining > 0) {
		const buckets = [...board.freeGroups().values()].filter((bucket) => bucket.length >= 2);
		if (buckets.length === 0) return false;
		const bucket = rng.pick(buckets);
		const a = rng.randiRange(0, bucket.length - 1);
		let b = rng.randiRange(0, bucket.length - 2);
		if (b >= a) b += 1;
		board.remove(bucket[a]);
		board.remove(bucket[b]);
	}
	return true;
}

export function isWinnable(state, rng, tries = 24) {
	for (let i = 0; i < tries; i += 1) {
		if (playout(state, rng)) return true;
	}
	return false;
}

/**
 * A pair to point at.
 *
 * Pairs that random play can still finish from are preferred, so a hint does not
 * walk the player into a dead board. The search is capped in time; past the cap
 * the first legal pair is offered, which is what a plain hint would have said
 * anyway.
 */
export function findHint(state, rng, now = () => Date.now()) {
	const pairs = rng.shuffle(state.freePairs());
	if (pairs.length === 0) return null;
	const deadline = now() + HINT_BUDGET_MS;
	for (const pair of pairs) {
		if (now() > deadline) break;
		const trial = state.clone();
		trial.remove(pair[0]);
		trial.remove(pair[1]);
		if (trial.remaining === 0 || isWinnable(trial, rng, PLAYOUTS_PER_PAIR)) return pair;
	}
	return pairs[0];
}

/** Free tiles sharing a match key with `index`, for highlighting a selection. */
export function partnersOf(state, index) {
	const key = matchKey(state.faces[index]);
	return state.freeIndices().filter((other) => other !== index && matchKey(state.faces[other]) === key);
}
