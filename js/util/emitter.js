/**
 * A named-event emitter.
 *
 * Views listen for the events they care about and send input back the same way,
 * so nothing reaches into another view's DOM. Plain callbacks rather than
 * EventTarget, so payloads travel as real arguments instead of a detail object.
 */
export class Emitter {
	#listeners = new Map();

	/** Returns a function that removes the listener again. */
	on(name, handler) {
		let handlers = this.#listeners.get(name);
		if (handlers === undefined) {
			handlers = new Set();
			this.#listeners.set(name, handlers);
		}
		handlers.add(handler);
		return () => handlers.delete(handler);
	}

	off(name, handler) {
		this.#listeners.get(name)?.delete(handler);
	}

	emit(name, ...args) {
		const handlers = this.#listeners.get(name);
		if (handlers === undefined) return;
		// Copied so a handler may unsubscribe itself mid-emit.
		for (const handler of [...handlers]) handler(...args);
	}
}
