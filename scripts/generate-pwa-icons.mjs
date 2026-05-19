// Generates public/pwa-192.png and public/pwa-512.png from scratch.
// Pure Node — uses only built-in zlib + a hand-rolled CRC32. No deps.
//
// Design: matte-black background (#0a0a0a) with a centred white "R"
// glyph drawn from rectangles + a stamped-disc diagonal leg. The glyph
// stays inside the 20%-padding maskable safe zone so Android can crop
// to a circle without slicing through it.
//
// Re-run after changing colours / glyph proportions:
//   node scripts/generate-pwa-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public');

// ----- PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // ihdr[10..12] are compression / filter / interlace, all 0 = defaults.

  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----- Glyph rasteriser ----------------------------------------------

// Renders at 2x and downsamples for cheap anti-aliasing on the curves.
function drawIcon(size) {
  const SS = 2;
  const w = size * SS;
  const h = size * SS;
  const buf = Buffer.alloc(w * h * 4);

  // Background — matte black (#0a0a0a, alpha 1).
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 0x0a;
    buf[i + 1] = 0x0a;
    buf[i + 2] = 0x0a;
    buf[i + 3] = 0xff;
  }

  // Layout. 20% padding satisfies the maskable safe zone (Android can
  // crop to a circle inscribed in the 80% inner square).
  const pad = Math.floor(0.20 * w);
  const inner = w - 2 * pad;
  const letterW = inner * 0.62;
  const letterH = inner * 0.95;
  const letterX = (w - letterW) / 2;
  const letterY = (h - letterH) / 2;

  // Stroke = 19% of letter width. Strong enough to read at 16x16.
  const sw = letterW * 0.19;

  const FG = [0xfa, 0xfa, 0xfa, 0xff]; // off-white

  function plotRect(x1, y1, x2, y2) {
    const xa = Math.max(0, Math.floor(x1));
    const ya = Math.max(0, Math.floor(y1));
    const xb = Math.min(w, Math.ceil(x2));
    const yb = Math.min(h, Math.ceil(y2));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * w + x) * 4;
        buf[i] = FG[0];
        buf[i + 1] = FG[1];
        buf[i + 2] = FG[2];
        buf[i + 3] = FG[3];
      }
    }
  }

  function plotDisc(cx, cy, r) {
    const xa = Math.max(0, Math.floor(cx - r));
    const ya = Math.max(0, Math.floor(cy - r));
    const xb = Math.min(w, Math.ceil(cx + r));
    const yb = Math.min(h, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) {
          const i = (y * w + x) * 4;
          buf[i] = FG[0];
          buf[i + 1] = FG[1];
          buf[i + 2] = FG[2];
          buf[i + 3] = FG[3];
        }
      }
    }
  }

  // ---- R glyph ----
  // 1. Left vertical stem (full height)
  plotRect(letterX, letterY, letterX + sw, letterY + letterH);

  // 2. Top horizontal bar
  plotRect(letterX, letterY, letterX + letterW, letterY + sw);

  // 3. Right vertical bar of the bowl (top half only)
  const bowlBottom = letterY + letterH * 0.5;
  plotRect(letterX + letterW - sw, letterY, letterX + letterW, bowlBottom);

  // 4. Middle horizontal bar (closes the bowl)
  plotRect(letterX, bowlBottom - sw, letterX + letterW, bowlBottom);

  // 5. Diagonal leg — stamp discs along the line from inner end of the
  //    middle bar to the bottom-right corner. Gives smooth edges
  //    without bilinear blending.
  const legX1 = letterX + sw * 1.2;
  const legY1 = bowlBottom;
  const legX2 = letterX + letterW;
  const legY2 = letterY + letterH;
  const legSteps = Math.ceil(Math.hypot(legX2 - legX1, legY2 - legY1));
  const legR = sw * 0.55;
  for (let s = 0; s <= legSteps; s++) {
    const t = s / legSteps;
    plotDisc(legX1 + (legX2 - legX1) * t, legY1 + (legY2 - legY1) * t, legR);
  }

  // ---- Downsample (box filter, SS x SS averaging) ----
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const si = ((y * SS + dy) * w + (x * SS + dx)) * 4;
          r += buf[si];
          g += buf[si + 1];
          b += buf[si + 2];
          a += buf[si + 3];
        }
      }
      const oi = (y * size + x) * 4;
      out[oi] = Math.round(r / n);
      out[oi + 1] = Math.round(g / n);
      out[oi + 2] = Math.round(b / n);
      out[oi + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ----- Run -----------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const rgba = drawIcon(size);
  const png = encodePng(size, size, rgba);
  const target = resolve(OUT_DIR, `pwa-${size}.png`);
  writeFileSync(target, png);
  console.log(`✓ ${target} (${png.length.toLocaleString()} bytes)`);
}
