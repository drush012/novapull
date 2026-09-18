// Renders the browser extension's icon PNGs from the same code that draws
// assets/icon.ico (scripts/make-icon.js), so the two never drift apart and
// nobody has to keep a binary in sync by hand.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [128, 48, 32, 16];
const SAMPLES = 4;
const RADIUS = 0.25;
const TOP = [0x35, 0xa0, 0xff];
const BOTTOM = [0x15, 0x58, 0xc4];

const GLYPH = [
  [[0.18, 0.17], [0.34, 0.17], [0.34, 0.83], [0.18, 0.83]],
  [[0.66, 0.17], [0.82, 0.17], [0.82, 0.83], [0.66, 0.83]],
  [[0.18, 0.17], [0.34, 0.17], [0.82, 0.83], [0.66, 0.83]]
];

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideSquircle(u, v) {
  const cx = u < RADIUS ? RADIUS : u > 1 - RADIUS ? 1 - RADIUS : u;
  const cy = v < RADIUS ? RADIUS : v > 1 - RADIUS ? 1 - RADIUS : v;
  const dx = u - cx;
  const dy = v - cy;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      let ink = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (x * SAMPLES + sx + 0.5) * step;
          const v = (y * SAMPLES + sy + 0.5) * step;
          if (!insideSquircle(u, v)) continue;
          coverage++;
          if (GLYPH.some(polygon => insidePolygon(u, v, polygon))) ink++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const offset = (y * size + x) * 4;
      if (!coverage) continue;
      const t = Math.min(1, (x / size) * 0.45 + (y / size) * 0.55);
      const inkRatio = ink / coverage;
      for (let c = 0; c < 3; c++) {
        const background = TOP[c] + (BOTTOM[c] - TOP[c]) * t;
        pixels[offset + c] = Math.round(background + (255 - background) * inkRatio);
      }
      pixels[offset + 3] = Math.round((coverage / total) * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = path.join(__dirname, '..', 'browser-extension', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(out, `icon${size}.png`), encodePng(size, renderPixels(size)));
}
console.log(`browser-extension/icons/icon{${SIZES.join(',')}}.png 已生成`);
