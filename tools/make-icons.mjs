/**
 * Draws the app icons.
 *
 *     node tools/make-icons.mjs
 *
 * The icon is the same tile the game draws, so there is no art file to keep in
 * step with the code. Shapes are evaluated per pixel and sampled three by three
 * for smooth edges; the PNG is written by hand, with zlib doing the compression.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");

const FELT_TOP = [27, 65, 55];
const FELT_BOTTOM = [13, 36, 31];
const TILE_SIDE = [173, 150, 105];
const TILE_TOP = [255, 250, 239];
const TILE_BOTTOM = [232, 221, 189];
const RING = [31, 95, 158];
const HOLE = [248, 241, 222];
const CORE = [191, 59, 47];

const SAMPLES = 3;

/** Signed distance to a rounded rectangle: negative inside. */
function roundRect(px, py, cx, cy, halfW, halfH, radius) {
	const qx = Math.abs(px - cx) - (halfW - radius);
	const qy = Math.abs(py - cy) - (halfH - radius);
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function mix(a, b, t) {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}

/** The colour at one point, in units where the icon is 1 wide and 1 tall. */
function shade(x, y, tileHalfW) {
	const glow = Math.max(0, 1 - Math.hypot((x - 0.5) * 1.5, (y - 0.35) * 1.6) * 1.5);
	let colour = mix(FELT_BOTTOM, FELT_TOP, Math.min(1, y * 0.35 + glow * 0.9));

	const halfH = tileHalfW * (80 / 60);
	const radius = tileHalfW * 0.16;
	const shadow = roundRect(x - tileHalfW * 0.13, y - halfH * 0.1, 0.5, 0.5, tileHalfW, halfH, radius);
	if (shadow < 0) colour = TILE_SIDE;

	const tile = roundRect(x, y, 0.5, 0.5, tileHalfW, halfH, radius);
	if (tile >= 0) return colour;

	const down = (y - (0.5 - halfH)) / (halfH * 2);
	colour = mix(TILE_TOP, TILE_BOTTOM, Math.min(1, Math.max(0, down)));

	const spot = Math.hypot(x - 0.5, y - 0.5);
	if (spot < tileHalfW * 0.62) colour = RING;
	if (spot < tileHalfW * 0.36) colour = HOLE;
	if (spot < tileHalfW * 0.17) colour = CORE;
	return colour;
}

function render(size, tileHalfW) {
	const pixels = Buffer.alloc(size * size * 3);
	const step = 1 / (size * SAMPLES);
	for (let py = 0; py < size; py += 1) {
		for (let px = 0; px < size; px += 1) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let sy = 0; sy < SAMPLES; sy += 1) {
				for (let sx = 0; sx < SAMPLES; sx += 1) {
					const x = (px * SAMPLES + sx + 0.5) * step;
					const y = (py * SAMPLES + sy + 0.5) * step;
					const colour = shade(x, y, tileHalfW);
					r += colour[0];
					g += colour[1];
					b += colour[2];
				}
			}
			const n = SAMPLES * SAMPLES;
			const at = (py * size + px) * 3;
			pixels[at] = Math.round(r / n);
			pixels[at + 1] = Math.round(g / n);
			pixels[at + 2] = Math.round(b / n);
		}
	}
	return pixels;
}

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, "ascii");
	const tail = Buffer.alloc(4);
	tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, tail]);
}

/** Truecolour, eight bits a channel, one filter byte per row. */
function encodePng(size, pixels) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 2;

	const stride = size * 3;
	const raw = Buffer.alloc((stride + 1) * size);
	for (let row = 0; row < size; row += 1) {
		raw[row * (stride + 1)] = 0;
		pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
	}

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

mkdirSync(OUT, { recursive: true });
// The maskable icon keeps its tile inside the safe circle, so a launcher may
// crop the corners without taking a bite out of the art.
const jobs = [
	["icon-192.png", 192, 0.3],
	["icon-512.png", 512, 0.3],
	["icon-1024.png", 1024, 0.3],
	["icon-maskable-512.png", 512, 0.21],
];
for (const [name, size, tileHalfW] of jobs) {
	writeFileSync(join(OUT, name), encodePng(size, render(size, tileHalfW)));
	process.stdout.write(`${name}  ${size}x${size}\n`);
}
