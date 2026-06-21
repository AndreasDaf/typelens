// generate-icons.js
// Generates icons/icon16.png, icon48.png, icon128.png from scratch using only
// Node built-ins (zlib). No image libraries. Run: `node scripts/generate-icons.js`.
//
// The icon mirrors the in-app brand mark: a rounded gradient square with a white
// "type cursor" bar through the middle.

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function lerp(a, b, t) { return a + (b - a) * t; }

// signed distance to a rounded rectangle centered in [0,S]
function roundedRectAlpha(x, y, S, radius, edge = 1) {
  const cx = S / 2, cy = S / 2;
  const hw = S / 2, hh = S / 2;
  const qx = Math.abs(x - cx) - (hw - radius);
  const qy = Math.abs(y - cy) - (hh - radius);
  const dx = Math.max(qx, 0), dy = Math.max(qy, 0);
  const dist = Math.sqrt(dx * dx + dy * dy) + Math.min(Math.max(qx, qy), 0) - radius;
  // dist < 0 inside. Antialias over `edge` px.
  return clamp01(0.5 - dist / edge);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function buildIcon(S) {
  const buf = Buffer.alloc(S * S * 4);
  const radius = S * 0.22;

  // cursor bar geometry
  const barW = Math.max(2, S * 0.13);
  const barH = S * 0.44;
  const barR = barW / 2;
  const bx0 = (S - barW) / 2, by0 = (S - barH) / 2;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;

      // gradient (top-left -> bottom-right)
      const t = (x + y) / (2 * S);
      const r = lerp(124, 176, t);
      const g = lerp(108, 108, t);
      const b = lerp(240, 240, t);

      const aSquare = roundedRectAlpha(x, y, S, radius, 1.2);

      // white bar mask (rounded rect, local coords)
      const lx = x - bx0, ly = y - by0;
      let aBar = 0;
      {
        const hw = barW / 2, hh = barH / 2;
        const cxb = barW / 2, cyb = barH / 2;
        const qx = Math.abs(lx - cxb) - (hw - barR);
        const qy = Math.abs(ly - cyb) - (hh - barR);
        const dx = Math.max(qx, 0), dy = Math.max(qy, 0);
        const dist = Math.sqrt(dx * dx + dy * dy) + Math.min(Math.max(qx, qy), 0) - barR;
        aBar = clamp01(0.5 - dist / 1.2) * (aSquare > 0 ? 1 : 0);
      }

      // composite white bar over gradient
      const rr = lerp(r, 255, aBar);
      const gg = lerp(g, 255, aBar);
      const bb = lerp(b, 255, aBar);

      buf[i] = Math.round(rr);
      buf[i + 1] = Math.round(gg);
      buf[i + 2] = Math.round(bb);
      buf[i + 3] = Math.round(aSquare * 255);
    }
  }
  return buf;
}

// --- minimal PNG encoder -----------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(rgba, S) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // filtered scanlines (filter byte 0 per row)
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- write -------------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const S of [16, 48, 128]) {
  const png = encodePNG(buildIcon(S), S);
  fs.writeFileSync(path.join(outDir, `icon${S}.png`), png);
  console.log(`wrote icons/icon${S}.png (${png.length} bytes)`);
}
