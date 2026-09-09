/**
 * Offline play.
 *
 * Everything is static and small, so the whole app is precached on install. A
 * board you can already see should not stop working because the train went into
 * a tunnel.
 *
 * Code is fetched network-first and falls back to the cache: the files are a few
 * kilobytes each, and a cache-first worker with a hand-written version string
 * serves whatever it captured until someone remembers to bump it. Art and icons
 * are served cache-first, since they only change when their filename does.
 */
const CACHE = "jade-match-v1";

/** Files whose freshness matters more than the round trip to check it. */
const CODE = /\.(?:html|js|css|webmanifest)$/;

const ASSETS = [
	"./",
	"index.html",
	"manifest.webmanifest",
	"css/style.css",
	"icons/icon-192.png",
	"icons/icon-512.png",
	"icons/icon-1024.png",
	"icons/icon-maskable-512.png",
	"js/board-state.js",
	"js/deal.js",
	"js/game-state.js",
	"js/save-manager.js",
	"js/save-migration.js",
	"js/settings.js",
	"js/commands/command.js",
	"js/commands/match-command.js",
	"js/commands/shuffle-command.js",
	"js/commands/undo-stack.js",
	"js/layouts/catalog.js",
	"js/layouts/layout.js",
	"js/tiles/faces.js",
	"js/tiles/tile-set.js",
	"js/ui/board-view.js",
	"js/ui/game-screen.js",
	"js/ui/main.js",
	"js/ui/menu-screen.js",
	"js/ui/page-zoom.js",
	"js/util/emitter.js",
	"js/util/rng.js",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((names) => Promise.all(
				names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
			))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	if (new URL(request.url).origin !== self.location.origin) return;

	// A navigation to any URL in scope is the app itself: fall back to the shell
	// rather than 404ing, so a refresh from the home screen opens.
	if (request.mode === "navigate") {
		event.respondWith(freshest(request, "index.html"));
		return;
	}

	if (CODE.test(new URL(request.url).pathname)) {
		event.respondWith(freshest(request));
		return;
	}

	event.respondWith(
		caches.match(request).then((cached) => cached ?? store(request)),
	);
});

/** Network first, with the cache as the offline answer. */
async function freshest(request, fallback) {
	try {
		return await store(request);
	} catch (error) {
		const cached = await caches.match(request)
			?? (fallback === undefined ? undefined : await caches.match(fallback));
		if (cached !== undefined) return cached;
		throw error;
	}
}

/** Fetches and files the result, so the next load has it offline. */
async function store(request) {
	const response = await fetch(request);
	if (response.ok) {
		const copy = response.clone();
		const cache = await caches.open(CACHE);
		await cache.put(request, copy);
	}
	return response;
}
