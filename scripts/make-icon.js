// Generates assets/icon.ico from code, so the app icon is reproducible and
// nobody has to keep a binary in sync by hand. The shape is the same mark the
// title bar draws in CSS: a rounded square with the app's blue gradient and a
// white "N".
//
// Everything is done with plain arithmetic plus zlib, which is why there is no
// image dependency: PNG is a handful of chunks, and ICO is a small index in
// front of them.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [256, 128, 64, 48, 32, 16];
const SAMPLES = 4; // supersampling per axis; 4 is enough to hide the stair-steps
const RADIUS = 0.25; // corner radius as a fraction of the side
const TOP = [0x35, 0xa0, 0xff];
const BOTTOM = [0x15, 0x58, 0xc4];

// The letter as three polygons in a unit box: two uprights and the diagonal
// band between them. Drawing it rather than rendering a font keeps the result
// identical on every machine.
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

// Rounded-square test: only the corner quadrants need a distance check.
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
      // Gradient runs top-left to bottom-right, matching the CSS 145deg.
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
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // Each scanline is prefixed with its filter type; 0 means "store as-is".
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

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach((image, index) => {
    const at = index * 16;
    // 256 does not fit in a byte and is written as 0 by convention.
    directory[at] = image.size === 256 ? 0 : image.size;
    directory[at + 1] = image.size === 256 ? 0 : image.size;
    directory[at + 2] = 0; // palette colours
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32BE(0, at + 8);
    directory.writeUInt32LE(image.data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, directory, ...images.map(image => image.data)]);
}

const images = SIZES.map(size => ({ size, data: encodePng(size, renderPixels(size)) }));
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.ico'), buildIco(images));
// electron-builder also likes a plain PNG for non-Windows targets.
fs.writeFileSync(path.join(out, 'icon.png'), images[0].data);
console.log(`assets/icon.ico  ${SIZES.join(', ')}  共 ${fs.statSync(path.join(out, 'icon.ico')).size} 字节`);
