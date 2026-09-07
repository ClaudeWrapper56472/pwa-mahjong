/**
 * PCG32 (XSH-RR).
 *
 * One seeded generator drives a whole deal, so the same (layout, seed) always
 * lays out the same tiles. Nothing in the game layer may reach for Math.random,
 * which would break that.
 */

const MULTIPLIER = 6364136223846793005n;
const MASK64 = 0xffffffffffffffffn;
const DEFAULT_INC = 1442695040888963407n;

export class Rng {
	constructor(seed = 0) {
		this.setSeed(seed);
	}

	setSeed(seed) {
		this._inc = DEFAULT_INC;
		this._state = 0n;
		this.nextUint32();
		this._state = (this._state + (BigInt(seed) & MASK64)) & MASK64;
		this.nextUint32();
	}

	/** Draws a fresh seed from the platform, kept inside 2^53 so it survives JSON. */
	static randomSeed() {
		const words = new Uint32Array(2);
		crypto.getRandomValues(words);
		return words[0] * 0x200000 + (words[1] >>> 11);
	}

	nextUint32() {
		const previous = this._state;
		this._state = (previous * MULTIPLIER + this._inc) & MASK64;
		const xorshifted = Number(((previous >> 18n) ^ previous) >> 27n & 0xffffffffn);
		const rotation = Number(previous >> 59n);
		return ((xorshifted >>> rotation) | (xorshifted << (-rotation & 31))) >>> 0;
	}

	/** Inclusive at both ends. */
	randiRange(from, to) {
		const span = to - from + 1;
		return span <= 0 ? from : from + (this.nextUint32() % span);
	}

	/** One item, or undefined from an empty list. */
	pick(items) {
		return items.length === 0 ? undefined : items[this.randiRange(0, items.length - 1)];
	}

	/** Fisher-Yates in place. */
	shuffle(items) {
		for (let i = items.length - 1; i > 0; i -= 1) {
			const j = this.randiRange(0, i);
			const swap = items[i];
			items[i] = items[j];
			items[j] = swap;
		}
		return items;
	}
}
