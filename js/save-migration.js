/**
 * The shape of the save document, and how an older one is brought forward.
 *
 * Pure functions with no storage and no DOM, so the whole thing is testable and
 * a future version bump is one more case in migrate().
 */

export const CURRENT_VERSION = 1;

export function emptyDocument() {
	return { version: CURRENT_VERSION, session: {}, stats: emptyStats() };
}

export function emptyStats() {
	return {
		unlocked: 1,
		cleared: 0,
		hints_used: 0,
		shuffles_used: 0,
		layouts: {},
	};
}

export function emptyLayoutStats() {
	return { plays: 0, cleared: 0, best_time: 0 };
}

/**
 * Anything unreadable becomes a fresh document rather than a fault. A player
 * losing their progress is bad; a player who cannot open the game at all is
 * worse.
 */
export function migrate(raw) {
	if (!isObject(raw)) return emptyDocument();
	const document = emptyDocument();
	document.session = isObject(raw.session) ? raw.session : {};
	document.stats = mergeStats(raw.stats);
	return document;
}

function mergeStats(raw) {
	const stats = emptyStats();
	if (!isObject(raw)) return stats;
	stats.unlocked = Math.max(1, toInt(raw.unlocked, 1));
	stats.cleared = toInt(raw.cleared, 0);
	stats.hints_used = toInt(raw.hints_used, 0);
	stats.shuffles_used = toInt(raw.shuffles_used, 0);
	if (isObject(raw.layouts)) {
		for (const [id, entry] of Object.entries(raw.layouts)) {
			if (!isObject(entry)) continue;
			stats.layouts[id] = {
				plays: toInt(entry.plays, 0),
				cleared: toInt(entry.cleared, 0),
				best_time: toInt(entry.best_time, 0),
			};
		}
	}
	return stats;
}

function toInt(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
