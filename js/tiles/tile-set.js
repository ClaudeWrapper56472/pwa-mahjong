/**
 * The tile faces and the deck they make.
 *
 * Thirty-four ordinary faces at four copies each, plus eight bonus tiles at one
 * copy: 144 tiles. A flower matches any flower and a season matches any season,
 * so matching compares matchKey rather than the face id.
 */

export const Suit = {
	CIRCLE: "circle",
	BAMBOO: "bamboo",
	CHARACTER: "character",
	WIND: "wind",
	DRAGON: "dragon",
	FLOWER: "flower",
	SEASON: "season",
};

/** Bonus tiles match by group; every other face matches by id. */
export const FLOWER_GROUP = "flower";
export const SEASON_GROUP = "season";

function suitFaces(prefix, suit, label) {
	return Array.from({ length: 9 }, (_, i) => ({
		id: `${prefix}${i + 1}`,
		suit,
		rank: i + 1,
		name: `${label} ${i + 1}`,
		group: null,
	}));
}

export const FACES = [
	...suitFaces("c", Suit.CIRCLE, "Circle"),
	...suitFaces("b", Suit.BAMBOO, "Bamboo"),
	...suitFaces("k", Suit.CHARACTER, "Character"),

	{ id: "we", suit: Suit.WIND, rank: 1, name: "East wind", group: null },
	{ id: "ws", suit: Suit.WIND, rank: 2, name: "South wind", group: null },
	{ id: "ww", suit: Suit.WIND, rank: 3, name: "West wind", group: null },
	{ id: "wn", suit: Suit.WIND, rank: 4, name: "North wind", group: null },

	{ id: "dr", suit: Suit.DRAGON, rank: 1, name: "Red dragon", group: null },
	{ id: "dg", suit: Suit.DRAGON, rank: 2, name: "Green dragon", group: null },
	{ id: "dw", suit: Suit.DRAGON, rank: 3, name: "White dragon", group: null },

	{ id: "f1", suit: Suit.FLOWER, rank: 1, name: "Plum flower", group: FLOWER_GROUP },
	{ id: "f2", suit: Suit.FLOWER, rank: 2, name: "Orchid flower", group: FLOWER_GROUP },
	{ id: "f3", suit: Suit.FLOWER, rank: 3, name: "Chrysanthemum flower", group: FLOWER_GROUP },
	{ id: "f4", suit: Suit.FLOWER, rank: 4, name: "Bamboo flower", group: FLOWER_GROUP },

	{ id: "s1", suit: Suit.SEASON, rank: 1, name: "Spring", group: SEASON_GROUP },
	{ id: "s2", suit: Suit.SEASON, rank: 2, name: "Summer", group: SEASON_GROUP },
	{ id: "s3", suit: Suit.SEASON, rank: 3, name: "Autumn", group: SEASON_GROUP },
	{ id: "s4", suit: Suit.SEASON, rank: 4, name: "Winter", group: SEASON_GROUP },
];

const BY_ID = new Map(FACES.map((entry) => [entry.id, entry]));

/** Every id in the deck, four of each ordinary face and one of each bonus. */
export const DECK_SIZE = 144;

export function face(id) {
	return BY_ID.get(id) ?? null;
}

export function isFace(id) {
	return BY_ID.has(id);
}

export function matchKey(id) {
	return BY_ID.get(id)?.group ?? id;
}

export function matches(a, b) {
	return a !== null && b !== null && matchKey(a) === matchKey(b);
}

export function faceName(id) {
	return BY_ID.get(id)?.name ?? "tile";
}

/**
 * The 72 pairs of the full deck, shuffled.
 *
 * Ordinary faces contribute two identical pairs each. The four flowers are
 * shuffled and paired off against each other, as are the seasons, because any
 * two of them are a legal match.
 */
export function pairDeck(rng) {
	const pairs = [];
	for (const entry of FACES) {
		if (entry.group !== null) continue;
		pairs.push([entry.id, entry.id], [entry.id, entry.id]);
	}
	for (const group of [FLOWER_GROUP, SEASON_GROUP]) {
		const ids = rng.shuffle(FACES.filter((entry) => entry.group === group).map((entry) => entry.id));
		for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
	}
	return rng.shuffle(pairs);
}

/**
 * Pairs off a bag of faces already in play, for a shuffle. Removals always take
 * two of one match key, so every group left on the board has an even count.
 */
export function pairsFromFaces(ids, rng) {
	const groups = new Map();
	for (const id of ids) {
		const key = matchKey(id);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(id);
	}
	const pairs = [];
	for (const members of groups.values()) {
		rng.shuffle(members);
		for (let i = 0; i + 1 < members.length; i += 2) pairs.push([members[i], members[i + 1]]);
	}
	return rng.shuffle(pairs);
}
