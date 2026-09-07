import { TileCommand } from "./command.js";

/** Takes one matching pair off the board. */
export class MatchCommand extends TileCommand {
	static TYPE = "m";

	constructor(a, b) {
		super();
		this.a = a;
		this.b = b;
	}

	apply(state) {
		state.remove(this.a);
		state.remove(this.b);
	}

	revert(state) {
		state.restore(this.a);
		state.restore(this.b);
	}

	touched() {
		return [this.a, this.b];
	}

	toJSON() {
		return { t: MatchCommand.TYPE, a: this.a, b: this.b };
	}

	static fromJSON(data) {
		const a = Number(data.a);
		const b = Number(data.b);
		if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
		return new MatchCommand(a, b);
	}
}
