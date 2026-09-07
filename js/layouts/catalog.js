/**
 * The layouts, hand-drawn, in the order they unlock.
 *
 * Each layer is a list of rows; the row's index is its y in half-tile units, so
 * a blank string is a row no tile starts on. "[" marks a tile's top-left corner.
 * Layout parsing checks that nothing overlaps and that every raised tile rests
 * on a full tile below, so a mistyped row fails loudly rather than quietly.
 */
import { Layout } from "./layout.js";

const SPECS = [
	{
		id: "opening",
		name: "Opening",
		difficulty: "Gentle",
		blurb: "One layer. Only the ends of a row are ever free.",
		layers: [[
			"    [][][][][][]",
			"",
			"  [][][][][][][][]",
			"",
			"[][][][][][][][][][]",
			"",
			"  [][][][][][][][]",
			"",
			"    [][][][][][]",
		]],
	},
	{
		id: "bridge",
		name: "Bridge",
		difficulty: "Gentle",
		blurb: "A second layer, laid across the seams of the first.",
		layers: [
			[
				"[][][][][][][][][][]",
				"",
				"[][][][][][][][][][]",
				"",
				"[][][][][][][][][][]",
				"",
				"[][][][][][][][][][]",
			],
			[
				"",
				"    [][][][][][]",
				"",
				"    [][][][][][]",
				"",
				"    [][][][][][]",
			],
		],
	},
	{
		id: "courtyard",
		name: "Courtyard",
		difficulty: "Steady",
		blurb: "Three terraces. The middle fills up long before the edges do.",
		layers: [
			[
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
			],
			[
				"",
				"",
				"    [][][][][][][][]",
				"",
				"    [][][][][][][][]",
				"",
				"    [][][][][][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"        [][][][]",
			],
		],
	},
	{
		id: "gate",
		name: "Gate",
		difficulty: "Steady",
		blurb: "Two towers over a long wall. The towers have to come down first.",
		layers: [
			[
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][]",
			],
			[
				"",
				"",
				"[][][][]        [][][][]",
				"",
				"[][][][]        [][][][]",
				"",
				"[][][][]        [][][][]",
				"",
				"[][][][]        [][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"  [][]            [][]",
				"",
				"  [][]            [][]",
			],
			[
				"",
				"",
				"",
				"",
				"",
				"   []              []",
			],
		],
	},
	{
		id: "turtle",
		name: "Turtle",
		difficulty: "Hard",
		blurb: "The full 144, five layers deep, with a lone tile on the peak.",
		layers: [
			[
				"    [][][][][][][][][][][][]",
				"",
				"        [][][][][][][][]",
				"",
				"      [][][][][][][][][][]",
				"",
				"    [][][][][][][][][][][][]",
				"[]                          [][]",
				"    [][][][][][][][][][][][]",
				"",
				"      [][][][][][][][][][]",
				"",
				"        [][][][][][][][]",
				"",
				"    [][][][][][][][][][][][]",
			],
			[
				"",
				"",
				"        [][][][][][]",
				"",
				"        [][][][][][]",
				"",
				"        [][][][][][]",
				"",
				"        [][][][][][]",
				"",
				"        [][][][][][]",
				"",
				"        [][][][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"          [][][][]",
				"",
				"          [][][][]",
				"",
				"          [][][][]",
				"",
				"          [][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"",
				"",
				"            [][]",
				"",
				"            [][]",
			],
			[
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"             []",
			],
		],
	},
	{
		id: "fortress",
		name: "Fortress",
		difficulty: "Hard",
		blurb: "144 tiles packed into a solid block. Very little is ever free.",
		layers: [
			[
				"[][][][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][][][]",
				"",
				"[][][][][][][][][][][][][][]",
			],
			[
				"",
				"",
				"    [][][][][][][][][][]",
				"",
				"    [][][][][][][][][][]",
				"",
				"    [][][][][][][][][][]",
				"",
				"    [][][][][][][][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"      [][][][][][][][]",
				"",
				"      [][][][][][][][]",
			],
			[
				"",
				"",
				"",
				"",
				"",
				"          [][][][]",
			],
		],
	},
];

export const LAYOUTS = SPECS.map((spec) => new Layout(spec));

export const LAYOUT_IDS = LAYOUTS.map((layout) => layout.id);

export function layoutById(id) {
	return LAYOUTS.find((layout) => layout.id === id) ?? null;
}

export function layoutAt(index) {
	return LAYOUTS[Math.min(Math.max(index, 0), LAYOUTS.length - 1)];
}

export function layoutIndex(id) {
	return LAYOUTS.findIndex((layout) => layout.id === id);
}

/** The board after this one, or null at the end of the ladder. */
export function nextLayout(id) {
	const index = layoutIndex(id);
	return index < 0 ? null : LAYOUTS[index + 1] ?? null;
}
