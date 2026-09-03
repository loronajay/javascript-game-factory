// Every texture in the cabinet, drawn at runtime onto a 2D canvas.
//
// There is not a single image file in the render layer, and that is the repo's
// PlaceholderGenerator rule taken all the way: a felt is noise over a colour and
// a ball is a stripe and a number, so shipping them as PNGs would be shipping
// megabytes to say what forty lines say. It is also what makes the cosmetic
// system cheap — a new cloth is a hex code and a new timber is a hex code and a
// grain style, not an asset pipeline.
//
// THREE IS PASSED IN, never imported. The module that boots the cabinet pulls it
// off the CDN once and hands it down, so nothing under `render/` carries its own
// copy of the import URL and the version is pinned in exactly one place.
//
// EVERY GENERATOR TAKES A PRESENTATION PAYLOAD — the object `cosmetics/loadout.js`
// resolved out of the catalog — and never an item id. The render layer cannot
// look a cosmetic up, which is what keeps ownership and compatibility decided in
// one place instead of two.
//
// A FINISH IS NOT A HEX CODE. `grainStyle` and `weave` and `pattern` branch to
// genuinely different drawing here. Five browns that differed only in tint would
// read as one wood, and the feature would have failed.

import { CLASSIC, ballColorIn, isStriped } from "../cosmetics/ball-sets.js";

/** Bounded on purpose: these are canvases uploaded to the GPU on every swap. */
const FELT_SIZE = 256;
const WOOD_SIZE = [512, 128];
const FLOOR_SIZE = 256;
const BALL_SIZE = [512, 256];

/**
 * The cloth.
 *
 * The colour is always a MID tone, and that is a rendering fact rather than a
 * taste one: a dielectric in three.js has a specular floor around 0.04 linear,
 * and a base darker than that in red and green lets the pendant's white sheen
 * outweigh the cloth's own colour, so the table renders pale grey-blue. The
 * catalog holds a luminance floor over every cloth for this reason, and
 * `table-view.js` pulls the sheen down as well. Both are needed.
 */
export function feltTexture(THREE, { color = "#2a4666", noise = 12, weave = "worsted", repeat = [5, 3] } = {}) {
  const canvas = makeCanvas(FELT_SIZE, FELT_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, FELT_SIZE, FELT_SIZE);

  // The nap goes on before the grain so the per-pixel noise sits over it and the
  // streaks read as cloth rather than as paint.
  if (weave === "napped") {
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = i % 2 ? "#ffffff" : "#000000";
      ctx.lineWidth = Math.random() * 6 + 2;
      const y = Math.random() * FELT_SIZE;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FELT_SIZE, y + (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const image = ctx.getImageData(0, 0, FELT_SIZE, FELT_SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noise;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);

  if (weave === "flecked") {
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,242,205,0.32)" : "rgba(0,0,0,0.28)";
      ctx.fillRect(Math.random() * FELT_SIZE, Math.random() * FELT_SIZE, 1.6, 1.6);
    }
  }

  return wrap(THREE, canvas, repeat);
}

/**
 * Timber, and the five ways it is drawn.
 *
 * `grainStyle` is the field that stops the wood finishes being one wood in
 * seven tints: figured walnut waves, ribbon mahogany carries broad alternating
 * bands, straight oak and ash are fine parallel lines, brushed metal is a
 * hundred and fifty hairlines, and lacquer has almost no grain at all and gets a
 * sweep of highlight instead.
 */
export function woodTexture(THREE, spec = {}) {
  const {
    grain = ["#6b4026", "#432616", "#26150d"],
    ink = ["#a4663a", "#20110b"],
    grainStyle = "figured",
    strokes = 70,
    amplitude = 4,
    repeat = [2, 1],
  } = spec;
  const [width, height] = WOOD_SIZE;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, grain[0]);
  gradient.addColorStop(0.45, grain[1]);
  gradient.addColorStop(1, grain[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (grainStyle === "ribbon") {
    // Broad alternating bands across the board — the ribbon figure that makes
    // mahogany read as mahogany and not as dark oak.
    ctx.globalAlpha = 0.14;
    for (let y = 0; y < height; y += 16) {
      ctx.fillStyle = (y / 16) % 2 ? ink[0] : ink[1];
      ctx.fillRect(0, y, width, 8);
    }
    ctx.globalAlpha = 1;
  }

  const alpha = grainStyle === "brushed" ? 0.1 : grainStyle === "lacquer" ? 0.08 : 0.26;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < strokes; i++) {
    ctx.strokeStyle = i % 2 ? ink[0] : ink[1];
    ctx.lineWidth = grainStyle === "brushed" ? 0.6 : grainStyle === "straight" ? 1 : Math.random() * 2 + 1;
    ctx.beginPath();
    const y = Math.random() * height;
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.04 + Math.random()) * amplitude);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (grainStyle === "lacquer") {
    // A polished panel has no grain to see; what it has is the room in it. One
    // soft diagonal sweep does more for that read than any amount of figure.
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.42, "rgba(255,255,255,0.16)");
    sheen.addColorStop(0.55, "rgba(255,255,255,0.03)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
  }

  return wrap(THREE, canvas, repeat);
}

/** The hall floor: four patterns, not four browns. */
export function floorTexture(THREE, spec = {}) {
  const { pattern = "parquet", colors = ["#1d1713", "#291f18", "#231b15"], repeat = [8, 8] } = spec;
  const size = FLOOR_SIZE;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);

  if (pattern === "parquet") {
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 64) {
        const offset = (y / 32) % 2 ? 32 : 0;
        ctx.fillStyle = (x + y) % 128 === 0 ? colors[1] : colors[2];
        ctx.fillRect(x + offset, y, 60, 29);
      }
    }
  } else if (pattern === "checker") {
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 32) {
        ctx.fillStyle = ((x + y) / 32) % 2 ? colors[1] : colors[2];
        ctx.fillRect(x, y, 31, 31);
      }
    }
  } else if (pattern === "boards") {
    for (let y = 0; y < size; y += 42) {
      ctx.fillStyle = (y / 42) % 2 ? colors[1] : colors[2];
      ctx.fillRect(0, y, size, 40);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = colors[0];
        ctx.beginPath();
        const line = y + 4 + Math.random() * 32;
        ctx.moveTo(0, line);
        ctx.lineTo(size, line + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  } else {
    // Concrete: no repeating unit at all, just mottling. Anything laid out on a
    // grid reads as tile, which is the one thing concrete must not look like.
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? colors[1] : colors[2];
      ctx.globalAlpha = 0.06 + Math.random() * 0.14;
      const r = 3 + Math.random() * 22;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return wrap(THREE, canvas, repeat);
}

/**
 * A ball's skin, as an equirectangular map.
 *
 * The layout is what makes the number readable from anywhere: the canvas wraps
 * around the sphere, so the two number circles at a quarter and three-quarters
 * across land on opposite sides and one of them always faces the camera. A
 * stripe is a band across the middle of the map, which becomes a band around the
 * equator.
 *
 * The palette arrives from the equipped ball set. `ball-sets.js` has already
 * MEASURED that set's readability, so nothing here has to defend against a
 * number that cannot be read off its ground.
 */
export function ballTexture(THREE, n, set = CLASSIC, anisotropy = 1) {
  const [width, height] = BALL_SIZE;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const color = ballColorIn(set, n);
  const striped = isStriped(n);

  ctx.fillStyle = striped ? set.stripeBase : color;
  ctx.fillRect(0, 0, width, height);
  if (striped) {
    const band = height * (set.stripeWidth ?? 0.41);
    ctx.fillStyle = color;
    ctx.fillRect(0, (height - band) / 2, width, band);
  }

  if (n !== 0) {
    for (const x of [width * 0.25, width * 0.75]) {
      ctx.fillStyle = set.numberRing;
      ctx.beginPath();
      ctx.arc(x, height / 2, 42, 0, Math.PI * 2);
      ctx.fill();
      if (set.ringStroke) {
        ctx.strokeStyle = set.ringStroke;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.fillStyle = set.numberInk;
      ctx.font = "bold 50px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), x, height / 2 + 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * A ball's colour as CSS.
 *
 * The hover readout wants the same swatch the ball is actually painted with, and
 * it should follow the equipped set — naming the 3 "red" while the table is
 * racked with a set whose 3 is crimson is a small lie the readout does not need
 * to tell. Handed out as a string so nothing outside this file needs THREE to
 * ask the question.
 */
export function ballColor(n, set = CLASSIC) {
  return ballColorIn(set, n);
}

/**
 * A decal, drawn transparent so it can sit over apron timber.
 *
 * Returns the texture and the aspect the mark was drawn at, because the plane it
 * lands on is sized from `span` and has to match or the art stretches. Eight
 * kinds, and they are drawings rather than eight strings in one font: a
 * nameplate is engraved metal, a roundel is a disc, laurels are curves.
 */
export function decalTexture(THREE, spec = {}) {
  const { kind = "text", text = "", color = "#e0c070", alpha = 1 } = spec;
  const wide = kind === "text" || kind === "plate" || kind === "diamond-row";
  const [width, height] = wide ? [512, 128] : [256, 256];
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (kind === "plate") {
    // Engraved brass: a filled plate with the letters knocked back out of it.
    ctx.fillRect(6, 22, width - 12, height - 44);
    ctx.globalCompositeOperation = "destination-out";
    ctx.font = "bold 42px Georgia, serif";
    ctx.fillStyle = "#000";
    ctx.fillText(text, width / 2, height / 2 + 2);
    ctx.globalCompositeOperation = "source-over";
  } else if (kind === "text") {
    ctx.font = "bold 58px Georgia, serif";
    ctx.fillText(text, width / 2, height / 2);
  } else if (kind === "roundel") {
    ctx.beginPath();
    ctx.arc(128, 128, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.font = "bold 130px Georgia, serif";
    ctx.fillStyle = "#000";
    ctx.fillText(text || "8", 128, 136);
    ctx.globalCompositeOperation = "source-over";
  } else if (kind === "fin") {
    ctx.beginPath();
    ctx.moveTo(40, 200);
    ctx.quadraticCurveTo(120, 190, 150, 60);
    ctx.quadraticCurveTo(170, 150, 216, 200);
    ctx.quadraticCurveTo(128, 224, 40, 200);
    ctx.fill();
  } else if (kind === "diamond-row") {
    for (const x of [96, 176, 256, 336, 416]) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 26, 64);
      ctx.lineTo(x, 88);
      ctx.lineTo(x - 26, 64);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === "suits") {
    ctx.font = "78px Georgia, serif";
    ctx.fillText("♠ ♥", 128, 88);
    ctx.fillText("♦ ♣", 128, 172);
  } else if (kind === "laurel") {
    ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(128, 132, 86, side > 0 ? 0.35 : Math.PI - 0.35, side > 0 ? Math.PI - 0.35 : 0.35, side < 0);
      ctx.stroke();
      for (let i = 1; i < 7; i++) {
        const angle = 0.5 + (i / 7) * (Math.PI - 1);
        const x = 128 + Math.cos(angle) * 86 * side;
        const y = 132 + Math.sin(angle) * 86;
        ctx.beginPath();
        ctx.ellipse(x, y, 15, 7, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // seal: a ring, a rope of ticks, and an 8 in the middle.
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 128, 92, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(128 + Math.cos(angle) * 72, 128 + Math.sin(angle) * 72, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "bold 76px Georgia, serif";
    ctx.fillText("8", 128, 134);
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: height / width };
}

/** A neon sign's face: glowing letters on a dark backing. */
export function signTexture(THREE, { text = "8 BALL", color = "#ff5a7a", backing = "#141014" } = {}) {
  const [width, height] = [512, 160];
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = backing;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 74px Georgia, serif";
  // Drawn three times at falling alpha and rising blur: a cheap bloom that
  // survives being an unlit emissive map, which a real glow would not.
  for (const [blur, a] of [[26, 0.5], [12, 0.7], [0, 1]]) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2 + 4);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function wrap(THREE, canvas, [u, v]) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(u, v);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
