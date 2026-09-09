/**
 * Keeps the browser from zooming the app.
 *
 * Only the board zooms, and it does so itself: a browser zoom on top of that
 * would fight the board's own pinch, and zooming the menu or the toolbar just
 * pushes the controls off screen. The stylesheet's touch-action states the rule
 * where it is honoured. iOS Safari zooms anyway, so its gesture events are
 * refused here, and a trackpad pinch, which arrives as a ctrl-wheel, with them.
 *
 * The keyboard's zoom is left alone: it is the browser's own chrome, and someone
 * who needs bigger text should still get it.
 */
export function lockPageZoom() {
	for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
		document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
	}
	document.addEventListener("wheel", (event) => {
		if (event.ctrlKey) event.preventDefault();
	}, { passive: false });
}
