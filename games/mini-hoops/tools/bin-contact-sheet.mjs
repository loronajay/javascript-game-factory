// Draw floor tic-tac-toe's bin colliders over the bin's own art, and measure the
// art to check the numbers those colliders are built from.
//
// THIS EXISTS BECAUSE THE BUG IT CAUGHT IS INVISIBLE TO A UNIT TEST. "The rim
// does not match the bin" is a claim about two things that cannot both be seen
// at once, and every assertion in `tests/` was internally consistent while the
// collider sat low and proud of the hole in the picture and turned the ball away
// with a lip two-thirds of which was never drawn. Same reason
// `tools/room-contact-sheet.mjs` exists, and the same hand-run, no-new-deps
// shape -- except this one needs no browser at all.
//
//   node tools/bin-contact-sheet.mjs             board + one magnified mouth
//   node tools/bin-contact-sheet.mjs --measure   re-derive BIN_ART from the art
//
// --measure walks `open-bin.png` and prints the block `sim/bin-physics.js`
// should hold: a least-squares fit of the rim's outer silhouette, and the bead's
// radial thickness read at the ellipse's own centre row -- the one place the
// bead is seen edge-on with no foreshortening. Re-cut art needs this re-run and
// nothing else re-derived; every world radius falls out of these numbers.
//
// In the drawn sheets, MAGENTA is the painted mouth placed straight from the
// measurements, independently of the collider. Magenta hidden under red is the
// whole check. Output is gitignored.

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPng, writePng } from "./png.mjs";
import { BIN_ART, createBinTargets } from "../scripts/sim/bin-physics.js";
import { binRings, binSpriteLayout, paintedMouthEllipse } from "../scripts/render/bin.js";
import { projectPoint } from "../scripts/sim/projection.js";

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const art = readPng(resolve(gameRoot, "assets/modes/floor-tic-tac-toe/open-bin.png"));
const outDir = resolve(gameRoot, argValue("--out") || "tools/bin-contact-sheet");

const alphaAt = (x, y) => art.data[(y * art.width + x) * 4 + 3];
const lumAt = (x, y) => {
  const i = (y * art.width + x) * 4;
  return alphaAt(x, y) < 24 ? -1 : 0.299 * art.data[i] + 0.587 * art.data[i + 1] + 0.114 * art.data[i + 2];
};
const halfWidthAt = (y) => {
  let a = -1;
  let b = -1;
  for (let x = 0; x < art.width; x++) if (alphaAt(x, y) > 24) { if (a < 0) a = x; b = x; }
  return a < 0 ? 0 : (b - a) / 2;
};
const round = (value) => Math.round(value * 10) / 10;

if (args.includes("--measure")) measure(); else sheet();

// ---------------------------------------------------------------------------

function measure() {
  // The rim's outer silhouette: the topmost painted pixel in each column.
  const tops = [];
  for (let x = 0; x < art.width; x++) {
    for (let y = 0; y < 500; y++) if (alphaAt(x, y) > 24) { tops.push([x, y]); break; }
  }
  const byColumn = new Map(tops);

  // Centre by symmetry, rather than by assuming the object is centred in frame.
  let cx = art.width / 2;
  let bestError = Infinity;
  for (let candidate = cx - 12; candidate <= art.width / 2 + 12; candidate += 0.5) {
    let error = 0;
    let n = 0;
    for (let d = 40; d < 400; d += 4) {
      const left = byColumn.get(Math.round(candidate - d));
      const right = byColumn.get(Math.round(candidate + d));
      if (left === undefined || right === undefined) continue;
      error += (left - right) ** 2;
      n++;
    }
    if (n && error / n < bestError) { bestError = error / n; cx = candidate; }
  }
  let radiusX = 0;
  for (const [x] of tops) radiusX = Math.max(radiusX, Math.abs(x - cx));

  // Least squares on the far arc, `y = cy - ry * sqrt(1 - (dx/rx)^2)`. With rx
  // fixed that is linear in (cy, ry), so it is one normal equation.
  let s1 = 0, sk = 0, skk = 0, sy = 0, sky = 0, n = 0;
  const arc = (x) => {
    const dx = (x - cx) / radiusX;
    return Math.abs(dx) > 0.97 ? null : -Math.sqrt(1 - dx * dx);
  };
  for (const [x, y] of tops) {
    const k = arc(x);
    if (k === null) continue;
    s1++; sk += k; skk += k * k; sy += y; sky += k * y; n++;
  }
  const determinant = s1 * skk - sk * sk;
  const cy = (skk * sy - sk * sky) / determinant;
  const radiusY = (s1 * sky - sk * sy) / determinant;
  let residual = 0;
  for (const [x, y] of tops) {
    const k = arc(x);
    if (k !== null) residual += (cy + radiusY * k - y) ** 2;
  }

  // The bead, radially, at the ellipse's own centre row: walk inward from the
  // silhouette, past the bead's inner highlight, until the interior falls away.
  const beads = [];
  for (const direction of [1, -1]) {
    const x0 = Math.round(cx - direction * radiusX);
    let lit = 0;
    for (let k = 1; k < 160; k++) {
      let brightest = -1;
      for (let y = Math.round(cy) - 6; y <= Math.round(cy) + 6; y++) {
        brightest = Math.max(brightest, lumAt(x0 + direction * k, y));
      }
      if (brightest > 90) lit = k;
      if (lit && brightest < 45) { beads.push(k); break; }
    }
  }
  const bead = beads.reduce((total, value) => total + value, 0) / beads.length;

  let baseY = art.height - 1;
  while (baseY > 0 && halfWidthAt(baseY) === 0) baseY--;
  let baseRadiusX = 0;
  for (let y = baseY - 140; y <= baseY; y++) baseRadiusX = Math.max(baseRadiusX, halfWidthAt(y));

  console.log(`silhouette fit: ${Math.sqrt(residual / n).toFixed(2)}px rms over ${n} columns`);
  console.log(`bead, measured both sides: ${beads.join("px / ")}px\n`);
  console.log("export const BIN_ART = Object.freeze({");
  console.log(`  width: ${art.width},`);
  console.log(`  height: ${art.height},`);
  console.log(`  mouthCenterX: ${round(cx)},`);
  console.log(`  mouthCenterY: ${round(cy)},`);
  console.log(`  mouthRadiusX: ${round(radiusX)},`);
  console.log(`  mouthRadiusY: ${round(radiusY)},`);
  console.log(`  beadThickness: ${round(bead)},`);
  console.log(`  baseY: ${baseY},`);
  console.log(`  baseRadiusX: ${round(baseRadiusX)},`);
  console.log("});\n");
  console.log("shipped:", JSON.stringify(BIN_ART));
}

// ---------------------------------------------------------------------------

function sheet() {
  mkdirSync(outDir, { recursive: true });
  const bins = createBinTargets();
  draw("board.png", 250, 420, 460, 300, 3, bins, false);

  const front = bins[7];
  const rings = binRings(front);
  const layout = binSpriteLayout(front);
  draw(
    "mouth.png",
    layout.x - 3,
    rings.outer.cy - rings.outer.radiusY - 8,
    layout.width + 6,
    rings.outer.radiusY * 2 + 20,
    12,
    [front],
    true,
  );
}

function draw(name, x0, y0, width, height, zoom, bins, magnified) {
  const w = Math.ceil(width * zoom);
  const h = Math.ceil(height * zoom);
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = 20; out[i + 1] = 22; out[i + 2] = 26; out[i + 3] = 255; }

  const put = (x, y, r, g, b, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    out[i] = out[i] * (1 - a) + r * a;
    out[i + 1] = out[i + 1] * (1 - a) + g * a;
    out[i + 2] = out[i + 2] * (1 - a) + b * a;
  };
  const sx = (x) => (x - x0) * zoom;
  const sy = (y) => (y - y0) * zoom;

  const blit = (layout, clipTop = null) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const worldY = dy / zoom + y0;
      if (clipTop !== null && worldY < clipTop) continue;
      const u = ((dx / zoom + x0) - layout.x) / layout.width * art.width;
      const v = (worldY - layout.y) / layout.height * art.height;
      if (u < 0 || v < 0 || u >= art.width || v >= art.height) continue;
      const i = (Math.round(v) * art.width + Math.round(u)) * 4;
      const a = art.data[i + 3] / 255;
      if (a > 0.02) put(dx, dy, art.data[i], art.data[i + 1], art.data[i + 2], a);
    }
  };
  const ellipse = (e, r, g, b, { dash = false, thick = 0 } = {}) => {
    for (let i = 0; i < 4000; i++) {
      if (dash && (i % 40) > 20) continue;
      const t = (i / 4000) * Math.PI * 2;
      for (let ox = -thick; ox <= thick; ox++) for (let oy = -thick; oy <= thick; oy++) {
        put(sx(e.cx + Math.cos(t) * e.radiusX) + ox, sy(e.cy + Math.sin(t) * e.radiusY) + oy, r, g, b);
      }
    }
  };

  if (!magnified) {
    const xEdges = [-0.75, -0.25, 0.25, 0.75];
    const zEdges = [0.195, 0.465, 0.735, 1.005];
    const at = (x, z) => projectPoint({ x, y: 0.004, z });
    for (const x of xEdges) for (let s = 0; s <= 600; s++) {
      const p = at(x, zEdges[0] + (zEdges[3] - zEdges[0]) * (s / 600));
      put(sx(p.x), sy(p.y), 255, 45, 225);
    }
    for (const z of zEdges) for (let s = 0; s <= 600; s++) {
      const p = at(xEdges[0] + (xEdges[3] - xEdges[0]) * (s / 600), z);
      put(sx(p.x), sy(p.y), 255, 45, 225);
    }
  }

  const order = [...bins].sort((a, b) => b.z - a.z);
  for (const bin of order) {
    const layout = binSpriteLayout(bin);
    blit(layout);
    blit(layout, layout.splitY);
  }
  for (const bin of order) {
    const { outer, lip, clear } = binRings(bin);
    const layout = binSpriteLayout(bin);
    const scale = layout.width / art.width;
    ellipse({
      cx: layout.x + BIN_ART.mouthCenterX * scale,
      cy: layout.y + BIN_ART.mouthCenterY * scale,
      radiusX: BIN_ART.mouthRadiusX * scale,
      radiusY: BIN_ART.mouthRadiusY * scale,
    }, 255, 0, 255, { thick: magnified ? 1 : 0 });
    ellipse(paintedMouthEllipse(bin), 255, 255, 255, { dash: true });
    ellipse(outer, 255, 70, 70);
    ellipse(lip, 0, 255, 128);
    ellipse(clear, 255, 214, 0);
  }

  writePng(resolve(outDir, name), w, h, out);
  console.log(`wrote ${name} (${w}x${h})`);
}
