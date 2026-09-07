/**
 * The tile faces, drawn as SVG.
 *
 * Every face is a <symbol> in one sprite sheet injected at boot; a tile on the
 * board is an <svg><use href="#face-b3"></svg>. One definition serves all four
 * copies of a face, and the art scales with the board's zoom for free.
 *
 * Faces are drawn in a 60x80 box. CREAM matches the tile face colour in the
 * stylesheet, so a ring drawn in it reads as a hole rather than a disc.
 */
import { FACES, Suit } from "./tile-set.js";

export const FACE_VIEWBOX = "0 0 60 80";

const CREAM = "#f8f1de";
const INK = "#31414c";
const BLUE = "#1f5f9e";
const RED = "#bf3b2f";
const GREEN = "#1c7a52";
const GOLD = "#d3922a";
const PLUM = "#c25580";
const ORCHID = "#8360b4";
const AMBER = "#c86a26";
const ICE = "#4f9bc4";

// --- Circles ----------------------------------------------------------------

/** A ring with a red core: one "circle" pip. */
function pip(cx, cy, r) {
	return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BLUE}"/>`
		+ `<circle cx="${cx}" cy="${cy}" r="${r * 0.58}" fill="${CREAM}"/>`
		+ `<circle cx="${cx}" cy="${cy}" r="${r * 0.27}" fill="${RED}"/>`;
}

const CIRCLE_PIPS = {
	1: [[30, 40, 16]],
	2: [[30, 26, 10], [30, 54, 10]],
	3: [[17, 22, 9], [30, 40, 9], [43, 58, 9]],
	4: [[19, 26, 10], [41, 26, 10], [19, 54, 10], [41, 54, 10]],
	5: [[18, 24, 9], [42, 24, 9], [30, 40, 9], [18, 56, 9], [42, 56, 9]],
	6: [[19, 20, 8], [41, 20, 8], [19, 40, 8], [41, 40, 8], [19, 60, 8], [41, 60, 8]],
	7: [[16, 18, 8], [30, 18, 8], [44, 18, 8], [19, 40, 8], [41, 40, 8], [19, 60, 8], [41, 60, 8]],
	8: [[19, 15, 7], [41, 15, 7], [19, 32, 7], [41, 32, 7], [19, 49, 7], [41, 49, 7], [19, 66, 7], [41, 66, 7]],
	9: [[16, 20, 8], [30, 20, 8], [44, 20, 8], [16, 40, 8], [30, 40, 8], [44, 40, 8], [16, 60, 8], [30, 60, 8], [44, 60, 8]],
};

function circleFace(rank) {
	return CIRCLE_PIPS[rank].map(([cx, cy, r]) => pip(cx, cy, r)).join("");
}

// --- Bamboo -----------------------------------------------------------------

/** One bamboo cane: a rounded body, two node bands and a pair of leaves. */
function cane(cx, cy, h, w, colour) {
	const top = cy - h / 2;
	const leaf = w * 0.95;
	return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}" fill="${colour}"/>`
		+ `<path d="M${cx - w / 2} ${(top + h * 0.34).toFixed(1)} h${w} M${cx - w / 2} ${(top + h * 0.68).toFixed(1)} h${w}"`
		+ ` stroke="${CREAM}" stroke-width="1.1"/>`
		+ `<path d="M${cx} ${top} l${-leaf} ${-leaf} M${cx} ${top} l${leaf} ${-leaf}"`
		+ ` stroke="${colour}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
}

/** Canes per row, top to bottom. */
const BAMBOO_ROWS = {
	2: [1, 1],
	3: [1, 2],
	4: [2, 2],
	5: [2, 1, 2],
	6: [3, 3],
	7: [1, 3, 3],
	8: [4, 4],
	9: [3, 3, 3],
};

/** The cane drawn in red rather than green, as a per-rank landmark. */
const BAMBOO_ACCENT = { 5: [1, 0], 7: [0, 0], 9: [1, 1] };

function bambooFace(rank) {
	if (rank === 1) return bambooBird();
	const rows = BAMBOO_ROWS[rank];
	const accent = BAMBOO_ACCENT[rank] ?? null;
	const rowHeight = 58 / rows.length;
	const parts = [];
	rows.forEach((count, row) => {
		const cy = 11 + rowHeight * (row + 0.5);
		const step = 38 / count;
		const width = Math.min(7, step * 0.5);
		for (let col = 0; col < count; col += 1) {
			const hit = accent !== null && accent[0] === row && accent[1] === col;
			parts.push(cane(11 + step * (col + 0.5), cy, rowHeight * 0.76, width, hit ? RED : GREEN));
		}
	});
	return parts.join("");
}

/** One bamboo is a bird, as it is on a paper set. */
function bambooBird() {
	return `<path d="M13 60 L27 48 L29 60 Z" fill="${GREEN}"/>`
		+ `<ellipse cx="31" cy="45" rx="14" ry="12" fill="${GREEN}"/>`
		+ `<path d="M23 41 C29 34 40 36 43 45 C36 49 27 47 23 41 Z" fill="${CREAM}" opacity="0.55"/>`
		+ `<circle cx="41" cy="28" r="8.5" fill="${GREEN}"/>`
		+ `<path d="M48 25 L57 31 L48 33 Z" fill="${RED}"/>`
		+ `<circle cx="43" cy="26" r="1.9" fill="${INK}"/>`
		+ `<path d="M22 62 H44" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`;
}

// --- Characters -------------------------------------------------------------

/** Numeral strokes, drawn above the suit mark. */
const NUMERALS = {
	1: "M14 24 H46",
	2: "M18 15 H42 M14 32 H46",
	3: "M18 10 H42 M20 24 H40 M14 37 H46",
	4: "M14 10 H46 V36 H14 Z M24 17 V29 M36 17 V29",
	5: "M15 10 H45 M25 10 V22 M18 22 H41 M33 22 V36 M14 36 H46",
	6: "M30 8 V13 M14 19 H46 M24 26 L16 37 M36 26 L44 37",
	7: "M14 20 H43 M27 9 V30 C27 36 33 37 41 35",
	8: "M27 12 L15 37 M33 12 L45 37",
	9: "M14 15 H34 M24 10 C22 22 19 30 13 38 M34 12 V28 C34 35 39 37 46 35",
};

/** The suit mark under the numeral. */
const CHARACTER_MARK = "M15 50 H45 M25 50 C25 60 21 68 14 74 M36 50 V64 C36 71 30 74 21 74";

function characterFace(rank) {
	return `<path d="${NUMERALS[rank]}" fill="none" stroke="${BLUE}" stroke-width="3.4"`
		+ ` stroke-linecap="round" stroke-linejoin="round"/>`
		+ `<path d="${CHARACTER_MARK}" fill="none" stroke="${RED}" stroke-width="3.4"`
		+ ` stroke-linecap="round" stroke-linejoin="round"/>`;
}

// --- Winds ------------------------------------------------------------------

const WIND_LETTERS = {
	we: "M36 29 H24 V47 H36 M24 38 H33",
	ws: "M37 31 C34 27 26 27 25 32 C24 37 36 39 36 44 C36 49 28 49 25 45",
	ww: "M23 29 L26 47 L30 36 L34 47 L37 29",
	wn: "M24 47 V29 L36 47 V29",
};

const WIND_POINTERS = {
	we: "M52 34 L58 38 L52 42 Z",
	ws: "M26 62 L30 68 L34 62 Z",
	ww: "M8 34 L2 38 L8 42 Z",
	wn: "M26 14 L30 8 L34 14 Z",
};

function windFace(id) {
	return `<circle cx="30" cy="38" r="20" fill="none" stroke="${GREEN}" stroke-width="2.4"/>`
		+ `<path d="${WIND_LETTERS[id]}" fill="none" stroke="${BLUE}" stroke-width="2.8"`
		+ ` stroke-linecap="round" stroke-linejoin="round"/>`
		+ `<path d="${WIND_POINTERS[id]}" fill="${BLUE}"/>`;
}

// --- Dragons ----------------------------------------------------------------

function dragonFace(id) {
	if (id === "dr") {
		return `<rect x="17" y="24" width="26" height="28" fill="none" stroke="${RED}" stroke-width="3.6"/>`
			+ `<path d="M30 10 V70" stroke="${RED}" stroke-width="3.6" stroke-linecap="round"/>`;
	}
	if (id === "dg") {
		return `<path d="M16 19 L30 12 M22 14 C20 26 18 34 13 43 M20 27 H37 M34 22`
			+ ` C36 34 40 45 47 53 M42 34 C34 46 26 56 16 63"`
			+ ` fill="none" stroke="${GREEN}" stroke-width="3.4" stroke-linecap="round"/>`
			+ `<circle cx="44" cy="19" r="2.8" fill="${GREEN}"/>`;
	}
	return `<rect x="13" y="13" width="34" height="54" rx="2" fill="none" stroke="${BLUE}" stroke-width="3.2"/>`
		+ `<rect x="21" y="21" width="18" height="38" rx="1" fill="none" stroke="${BLUE}" stroke-width="1.8"/>`;
}

// --- Flowers and seasons ----------------------------------------------------

/** The band that says which group a bonus tile matches within. */
function band(colour) {
	return `<rect x="21" y="69" width="18" height="4.5" rx="2.25" fill="${colour}"/>`;
}

function petalRing(count, rx, ry, distance, colour) {
	const parts = [];
	for (let i = 0; i < count; i += 1) {
		const angle = (360 / count) * i;
		parts.push(`<ellipse cx="30" cy="${38 - distance}" rx="${rx}" ry="${ry}" fill="${colour}"`
			+ ` transform="rotate(${angle.toFixed(1)} 30 38)"/>`);
	}
	return parts.join("");
}

const FLOWER_ART = {
	f1: () => petalRing(5, 8, 9, 11, PLUM)
		+ `<circle cx="30" cy="38" r="6" fill="${GOLD}"/>`
		+ `<path d="M30 47 C28 54 24 58 18 61" fill="none" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`,
	f2: () => `<path d="M30 60 C16 54 10 38 14 20 C24 28 30 42 30 60 Z" fill="${ORCHID}"/>`
		+ `<path d="M30 60 C44 54 50 38 46 20 C36 28 30 42 30 60 Z" fill="${ORCHID}" opacity="0.7"/>`
		+ `<circle cx="30" cy="26" r="6" fill="${GOLD}"/>`
		+ `<path d="M30 60 V64" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`,
	f3: () => petalRing(12, 4, 12, 12, GOLD)
		+ petalRing(6, 3.2, 8, 6, AMBER)
		+ `<circle cx="30" cy="38" r="4" fill="${RED}"/>`,
	f4: () => `<path d="M30 66 V16" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>`
		+ `<path d="M22 34 h16 M22 50 h16" stroke="${CREAM}" stroke-width="1.4"/>`
		+ `<path d="M30 24 C20 22 14 28 12 36 C22 38 28 34 30 24 Z" fill="${GREEN}"/>`
		+ `<path d="M30 42 C40 40 46 46 48 54 C38 56 32 52 30 42 Z" fill="${GREEN}" opacity="0.75"/>`,
};

const SEASON_ART = {
	s1: () => `<path d="M30 64 V32" stroke="${GREEN}" stroke-width="3.4" stroke-linecap="round"/>`
		+ `<path d="M30 38 C18 38 12 30 12 20 C24 20 30 28 30 38 Z" fill="${GREEN}"/>`
		+ `<path d="M30 44 C42 44 48 36 48 26 C36 26 30 34 30 44 Z" fill="${GREEN}" opacity="0.72"/>`,
	s2: () => `<circle cx="30" cy="36" r="13" fill="${GOLD}"/>`
		+ petalRing(8, 2.2, 5, 20, AMBER)
		+ `<circle cx="30" cy="36" r="6" fill="${CREAM}" opacity="0.35"/>`,
	s3: () => `<path d="M30 12 L37 26 L46 22 L41 36 L52 40 L38 46 L40 58 L30 50`
		+ ` L20 58 L22 46 L8 40 L19 36 L14 22 L23 26 Z" fill="${AMBER}"/>`
		+ `<path d="M30 50 V68" stroke="${RED}" stroke-width="2.6" stroke-linecap="round"/>`,
	s4: () => `<g stroke="${ICE}" stroke-width="3" stroke-linecap="round" fill="none">`
		+ [0, 60, 120].map((angle) =>
			`<path d="M8 38 H52" transform="rotate(${angle} 30 38)"/>`
			+ `<path d="M16 32 L11 38 L16 44 M44 32 L49 38 L44 44" transform="rotate(${angle} 30 38)"/>`).join("")
		+ `</g><circle cx="30" cy="38" r="4" fill="${ICE}"/>`,
};

// --- The sheet --------------------------------------------------------------

function faceArt(entry) {
	switch (entry.suit) {
		case Suit.CIRCLE: return circleFace(entry.rank);
		case Suit.BAMBOO: return bambooFace(entry.rank);
		case Suit.CHARACTER: return characterFace(entry.rank);
		case Suit.WIND: return windFace(entry.id);
		case Suit.DRAGON: return dragonFace(entry.id);
		case Suit.FLOWER: return FLOWER_ART[entry.id]() + band(GREEN);
		case Suit.SEASON: return SEASON_ART[entry.id]() + band(BLUE);
		default: return "";
	}
}

export function symbolId(id) {
	return `face-${id}`;
}

/** The whole sheet as one <svg> element's markup, ready to inject once. */
export function spriteSheet() {
	const symbols = FACES.map((entry) =>
		`<symbol id="${symbolId(entry.id)}" viewBox="${FACE_VIEWBOX}">${faceArt(entry)}</symbol>`).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"`
		+ ` style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
}
