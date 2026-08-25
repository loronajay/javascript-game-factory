// The open bin, drawn from `assets/modes/floor-tic-tac-toe/open-bin.png`.
//
// THE ART IS THE BIN AND THE ART IS NOT TOUCHED. One uniform scale, the sprite's
// own aspect ratio, no warping of any kind. Two earlier passes got this wrong in
// opposite directions — one replaced the sprite with a procedural drum, the next
// kept the sprite but stretched its mouth band to open the ellipse — and both
// were the same mistake: bending the picture to fit the collider. The collider
// is ours to choose and the picture is not.
//
// So the placement is derived FROM the art, and it turns out the art was right
// all along. Scale comes from one number — the painted rim's half-width (468px)
// set equal to the projected radius of `mouthRadius + rimTubeRadius` — and at
// that scale the sprite's painted base lands on the bin's own near base edge to
// within 7px of an 83-126px body, at all three rows, with no second constant.
// Solving it the other way round (what world height does the art's aspect ask
// for?) gives 0.362 at the front row and 0.396 at the back, against the shipped
// `BIN_MOUTH_Y` of 0.36. The bin in the picture and the bin in the sim are the
// same object.
//
// THE ONE PLACE THEY CANNOT AGREE is the mouth's depth front-to-back, and it is
// worth stating plainly rather than papering over. The art was rendered from a
// nearly horizontal camera: its painted mouth is an ellipse 0.248 as tall as it
// is wide. A horizontal circle through THIS camera is 0.42 at the back row and
// 0.59 at the front. So the painted opening reads 13px deep where the collider's
// is 32px. That gap is not fixable by moving or scaling the sprite, and it is
// not fixable by squashing the collider either: a mouth whose world depth
// matched the paint would be 0.13 deep, and the ball is 0.156 across — it would
// not fit through the hole it is drawn inside. `drawBinColliders` exists so this
// is visible rather than argued about; press C on the court.
//
// TWO PASSES, LIKE THE RIM. `drawBinBody` is the whole sprite, before the ball;
// `drawBinLip` re-draws everything below the mouth's centre line, after it — so
// a ball dropping in goes behind the near lip and the front wall rather than
// skating across them.

import { binClearance } from "../sim/bin-physics.js";
import { projectPoint, ringEllipseAt, worldToScreenLength } from "../sim/projection.js";
import { depthGradeFilter } from "./scene.js";

const TAU = Math.PI * 2;

/**
 * Every ring of this bin, projected at the depth it actually sits at.
 *
 * `clear` is `binClearance` read straight off the sim — how far off-axis the
 * ball's centre may be at the mouth plane and still drop through. Nothing draws
 * it as a printed target in normal play; the collider overlay does, because that
 * is what an overlay is for.
 */
export function binRings(bin) {
  const mouth = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
  const foot = projectPoint({ x: bin.x, y: 0, z: bin.z });
  const ring = (centre, radius) => ringEllipseAt(centre.x, centre.y, radius, bin.z);
  return {
    outer: ring(mouth, bin.mouthRadius + bin.rimTubeRadius),
    lip: ring(mouth, bin.mouthRadius),
    inner: ring(mouth, bin.mouthRadius - bin.rimTubeRadius),
    clear: ring(mouth, binClearance(bin)),
    base: ring(foot, bin.bottomRadius),
    foot,
  };
}

/** The mouth opening, for anything that has to clip a ball into it. */
export function binMouthEllipse(bin) {
  return binRings(bin).inner;
}

/**
 * Where the bin is in ITS OWN ART, in source-image pixels.
 *
 * Measured off `open-bin.png` (1187x1326) by walking its alpha, not eyeballed:
 * the outer rim ellipse tops out on row 44 and is widest on row 160, so its
 * centre is row 160 and its painted half-height is 116; the bin bottoms out on
 * row 1272. Only `mouthCenterX`, `mouthCenterY` and `mouthRadiusX` place the
 * sprite — the rest is here so the collider overlay can draw the painted mouth
 * beside the tested one. Re-cut art needs this block re-measured, nothing else.
 */
const SPRITE = Object.freeze({
  width: 1187,
  height: 1326,
  mouthCenterX: 590,
  mouthCenterY: 160,
  mouthRadiusX: 468,
  mouthRadiusY: 116,
  baseY: 1272,
});

/**
 * Where the sprite goes: ONE uniform scale, from the painted rim's half-width.
 *
 * There is deliberately no second scale and no per-band adjustment. The art's
 * own proportions are the bin's proportions.
 */
export function binSpriteLayout(bin) {
  const { outer } = binRings(bin);
  const scale = outer.radiusX / SPRITE.mouthRadiusX;
  return {
    x: outer.cx - SPRITE.mouthCenterX * scale,
    y: outer.cy - SPRITE.mouthCenterY * scale,
    width: SPRITE.width * scale,
    height: SPRITE.height * scale,
    scale,
    // The near/far split: the mouth's own centre line. Looking DOWN at a ring,
    // everything below its centre is the near half — see `render/ring.js`.
    splitY: outer.cy,
  };
}

/** The mouth exactly as the sprite paints it, for the overlay to draw. */
export function paintedMouthEllipse(bin) {
  const layout = binSpriteLayout(bin);
  return {
    cx: layout.x + SPRITE.mouthCenterX * layout.scale,
    cy: layout.y + SPRITE.mouthCenterY * layout.scale,
    radiusX: SPRITE.mouthRadiusX * layout.scale,
    radiusY: SPRITE.mouthRadiusY * layout.scale,
  };
}

/** Everything of the bin. Drawn before the ball. */
export function drawBinBody(ctx, bin, image) {
  const layout = binSpriteLayout(bin);
  ctx.save();
  ctx.filter = depthGradeFilter(bin.z);
  paint(ctx, image, layout);
  ctx.restore();
}

/**
 * The half of the bin in FRONT of a ball dropping into it: the near lip and the
 * front wall, which is everything below the mouth's centre line. Drawn after the
 * ball, and that is the whole illusion.
 */
export function drawBinLip(ctx, bin, image) {
  const layout = binSpriteLayout(bin);
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.x, layout.splitY, layout.width, layout.y + layout.height - layout.splitY);
  ctx.clip();
  ctx.filter = depthGradeFilter(bin.z);
  paint(ctx, image, layout);
  ctx.restore();
}

function paint(ctx, image, layout) {
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
    return;
  }
  // The loader is non-blocking, so the first frames can arrive without art. A
  // flat drum keeps the board readable rather than leaving nine holes in it.
  ctx.fillStyle = "#161c23";
  ctx.beginPath();
  ctx.ellipse(layout.x + layout.width / 2, layout.splitY, layout.width / 2, layout.width / 8, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(layout.x + layout.width * 0.1, layout.splitY, layout.width * 0.8, layout.y + layout.height - layout.splitY);
}

/**
 * THE COLLIDERS, DRAWN OVER THE ART. A debug overlay, off by default, toggled
 * with C on the tic-tac-toe court.
 *
 * This exists because "the rim is not aligned to the art" is a claim about two
 * things that cannot both be seen at once, and the only way to settle it is to
 * draw them on top of each other. Everything solid is a real collider read from
 * `sim/bin-physics.js`; the dashed white ellipse is the mouth as PAINTED, taken
 * from the `SPRITE` block. Where those two disagree is exactly where a contact
 * happens off-picture, and the gap between them is the whole of the mismatch —
 * measured, not argued.
 */
export function drawBinColliders(ctx, bin) {
  const { outer, lip, clear, base } = binRings(bin);
  const ring = (e, stroke, dash = null, width = 1.5) => {
    ctx.save();
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, Math.max(0.5, e.radiusX), Math.max(0.5, e.radiusY), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  };

  ring(paintedMouthEllipse(bin), "rgba(255,255,255,.95)", [5, 4], 2);
  ring(outer, "rgba(255,86,86,.95)");            // outermost the lip can touch
  ring(lip, "rgba(0,255,128,.95)", null, 2);     // the lip's centre line
  ring(clear, "rgba(255,214,0,.95)", null, 2);   // the make window
  ring(base, "rgba(120,170,255,.8)", [4, 3]);    // the base on the floor

  // The side wall, at three of the heights it is sampled through. It tapers, and
  // it stops dead at the mouth plane — above that the lip torus is the only
  // collider in the room.
  for (const t of [0.25, 0.5, 0.75]) {
    const radius = bin.bottomRadius + (bin.mouthRadius - bin.bottomRadius) * t;
    const centre = projectPoint({ x: bin.x, y: bin.topY * t, z: bin.z });
    ring(ringEllipseAt(centre.x, centre.y, radius, bin.z), "rgba(120,170,255,.45)", [3, 4], 1);
  }
}

/** The legend for `drawBinColliders`, drawn once rather than per bin. */
export function drawColliderLegend(ctx, x, y) {
  const rows = [
    ["rgba(255,255,255,.95)", "mouth AS PAINTED (the art)"],
    ["rgba(255,86,86,.95)", "lip outer — furthest the rim can touch"],
    ["rgba(0,255,128,.95)", "lip centre line (BIN_MOUTH_RADIUS)"],
    ["rgba(255,214,0,.95)", "make window (binClearance)"],
    ["rgba(120,170,255,.8)", "body taper + base on the floor"],
  ];
  ctx.save();
  ctx.fillStyle = "rgba(8,10,14,.85)";
  ctx.fillRect(x - 12, y - 24, 342, rows.length * 20 + 34);
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText("COLLIDERS  ·  press C to hide", x, y - 9);
  rows.forEach(([colour, label], i) => {
    const ry = y + 15 + i * 20;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + 22, ry);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(label, x + 30, ry);
  });
  ctx.restore();
}

/**
 * A claimed cell: the neon mark lying flat on the floor, WHERE THE BIN WAS.
 *
 * The bin is not drawn at all for a claimed cell — the mark replaces it, which
 * is the mode's own rule and the thing that makes a filled board read at a
 * glance. It is also what keeps the board honest: a claimed cell has no collider
 * (`tic-tac-toe-game.js` steps the ball against the OPEN bins only), so leaving a
 * solid-looking bin standing there would be drawing a target that cannot be hit.
 *
 * Composited with `lighter`, because the art is a photographed neon tube on
 * black. Drawn straight it lays a black card on the concrete; added, only the
 * light lands and the floor shows through it.
 */
export function drawFloorMark(ctx, bin, image, mark, { glow = 1 } = {}) {
  const centre = projectPoint({ x: bin.x, y: 0.012, z: bin.z });
  const width = worldToScreenLength(0.42, bin.z);
  const ratio = image?.naturalWidth ? image.naturalHeight / image.naturalWidth : 0.667;
  const height = width * ratio;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, 0.82 * glow);
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, centre.x - width / 2, centre.y - height / 2, width, height);
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = mark === "o" ? "#28d8ff" : "#ff4fd8";
    ctx.font = `bold ${Math.round(width * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.toUpperCase(), centre.x, centre.y);
  }
  ctx.restore();
}
