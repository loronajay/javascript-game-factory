// An open bin, drawn from the collider's own numbers.
//
// THIS FILE EXISTS BECAUSE THE SPRITE COULD NOT BE FIXED. `open-bin.png` is a
// fine picture of a bin and it was rendered from a camera this cabinet does not
// have: its painted mouth is an ellipse 0.13 as tall as it is wide, and this
// room's camera looks down at the floor steeply enough to want about 0.59 at the
// front row. Drawn to the collider's height, the sprite put a 71px-wide bin
// around a 94px-wide physical mouth, and — far worse, because depth here is
// chosen with POWER, the hard axis — a painted 9px slot in place of a 55px
// front-to-back opening. The player could not see the target at all, which is
// the whole of what "the rim is in the wrong place" was.
//
// So every number here comes from `sim/bin-physics.js` and is put through
// `sim/projection.js`. There is no art to drift out of step with the physics,
// because the mouth being drawn IS the mouth being tested, at every row's depth.
//
// TWO PASSES, LIKE THE RIM. `drawBinBody` is everything behind the ball and
// `drawBinLip` the near arc in front of it, so a ball dropping in goes visibly
// behind the front of the bin rather than skating across it. `render/hoop.js`
// splits the same way for the same reason; the near/far rule itself lives in
// `render/ring.js`, because the rim is ABOVE eye level and these are below it,
// and the split inverts between them.
//
// LIGHT COMES FROM THE LEFT, matching the painted rooms and `render/hoop.js`.

import { binClearance } from "../sim/bin-physics.js";
import { projectPoint, ringEllipseAt } from "../sim/projection.js";
import { depthGradeFilter } from "./scene.js";
import { halfSpan } from "./ring.js";

const TAU = Math.PI * 2;

/**
 * Every ring this bin is drawn from, projected at the depth it actually sits at.
 *
 * `clear` is the one that is not decoration: it is `binClearance` — how far
 * off-axis the ball's centre may be at the mouth plane and still drop through —
 * read straight off the sim. It is shaded rather than outlined, so what the
 * player sees is a hole with a shadow in it that happens to be exactly the
 * window they have to find. Drawing a target ring would print the answer; this
 * shows the geometry and lets the answer follow from it.
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
  };
}

/** The mouth opening, for anything that has to clip a ball into it. */
export function binMouthEllipse(bin) {
  return binRings(bin).inner;
}

function traceArc(ctx, ellipse, [start, end]) {
  ctx.ellipse(ellipse.cx, ellipse.cy, ellipse.radiusX, ellipse.radiusY, 0, start, end);
}

/**
 * Everything of the bin that is BEHIND the ball: the body, the inside, and the
 * far half of the lip.
 *
 * The silhouette of a truncated cone seen from above is its mouth's far arc,
 * down both sides, and its base's near arc — traced as one path so the body is
 * a single fill and never shows a seam where two shapes were butted together.
 */
export function drawBinBody(ctx, bin) {
  const { outer, inner, clear, base } = binRings(bin);

  ctx.save();
  ctx.filter = depthGradeFilter(bin.z);

  // --- the body ------------------------------------------------------------
  ctx.beginPath();
  traceArc(ctx, outer, halfSpan(outer, false));
  ctx.lineTo(base.cx + base.radiusX, base.cy);
  traceArc(ctx, base, halfSpan(base, true));
  ctx.closePath();

  const body = ctx.createLinearGradient(outer.cx - outer.radiusX, 0, outer.cx + outer.radiusX, 0);
  body.addColorStop(0, "#4a5560");
  body.addColorStop(0.34, "#333c46");
  body.addColorStop(0.72, "#232a32");
  body.addColorStop(1, "#2d353e");
  ctx.fillStyle = body;
  ctx.fill();

  // A contact shadow where the bin meets the floor. Without it a bin drawn on a
  // painted floor reads as a decal on the picture, the same way the backboard
  // does without its wall shadow.
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.filter = `blur(${Math.max(2, base.radiusX * 0.16).toFixed(1)}px)`;
  ctx.fillStyle = "#0d1116";
  ctx.beginPath();
  ctx.ellipse(base.cx + base.radiusX * 0.16, base.cy + base.radiusY * 0.5, base.radiusX * 1.12, base.radiusY * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Two ribs around the body, following the taper. Pure read: they are what
  // makes the sides curve rather than sit as a flat trapezoid of gradient.
  ctx.strokeStyle = "rgba(12,16,20,.34)";
  ctx.lineWidth = Math.max(1, outer.radiusX * 0.035);
  for (const t of [0.34, 0.66]) {
    const rib = ribEllipse(bin, t);
    ctx.beginPath();
    traceArc(ctx, rib, halfSpan(rib, true));
    ctx.stroke();
  }

  // --- the inside ----------------------------------------------------------
  // Dark, and darkest under the near lip, which is the edge casting into it.
  const cavity = ctx.createLinearGradient(0, inner.cy - inner.radiusY, 0, inner.cy + inner.radiusY);
  cavity.addColorStop(0, "#2a323b");
  cavity.addColorStop(0.45, "#141a20");
  cavity.addColorStop(1, "#080b0e");
  ctx.fillStyle = cavity;
  ctx.beginPath();
  ctx.ellipse(inner.cx, inner.cy, inner.radiusX, inner.radiusY, 0, 0, TAU);
  ctx.fill();

  // The make window, as a pool of shadow rather than a printed ring.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.filter = `blur(${Math.max(1.5, clear.radiusX * 0.22).toFixed(1)}px)`;
  ctx.fillStyle = "#04060a";
  ctx.beginPath();
  ctx.ellipse(clear.cx, clear.cy + clear.radiusY * 0.18, clear.radiusX, clear.radiusY, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // --- the far half of the lip --------------------------------------------
  strokeLip(ctx, bin, false);

  ctx.restore();
}

/**
 * The near half of the lip: the only part of the bin that is in FRONT of a ball
 * dropping through it. Drawn after the ball, and that is the whole illusion.
 */
export function drawBinLip(ctx, bin) {
  ctx.save();
  ctx.filter = depthGradeFilter(bin.z);
  strokeLip(ctx, bin, true);
  ctx.restore();
}

function strokeLip(ctx, bin, nearHalf) {
  const { lip } = binRings(bin);
  const span = halfSpan(lip, nearHalf);
  const width = Math.max(2, (lip.radiusX / bin.mouthRadius) * bin.rimTubeRadius * 2);

  ctx.lineCap = "round";

  // Underside, then the body on a left-lit grade, then a specular — the same
  // three-pass stack `render/hoop.js` builds the rim from, for the same reason:
  // one flat stroke reads as a drawn circle, the stack reads as a moulded edge.
  ctx.strokeStyle = nearHalf ? "rgba(6,9,12,.7)" : "rgba(6,9,12,.4)";
  ctx.lineWidth = width;
  ctx.beginPath();
  traceArc(ctx, lip, span);
  ctx.stroke();

  const shade = ctx.createLinearGradient(lip.cx - lip.radiusX, 0, lip.cx + lip.radiusX, 0);
  if (nearHalf) {
    shade.addColorStop(0, "#7b8794");
    shade.addColorStop(0.45, "#5a6672");
    shade.addColorStop(1, "#414b56");
  } else {
    shade.addColorStop(0, "#57626d");
    shade.addColorStop(0.5, "#454f59");
    shade.addColorStop(1, "#3a434d");
  }
  ctx.strokeStyle = shade;
  ctx.lineWidth = width * 0.78;
  ctx.beginPath();
  traceArc(ctx, lip, span);
  ctx.stroke();

  ctx.strokeStyle = nearHalf ? "rgba(226,238,250,.5)" : "rgba(200,214,228,.22)";
  ctx.lineWidth = Math.max(1, width * 0.22);
  ctx.beginPath();
  ctx.ellipse(lip.cx, lip.cy - width * 0.24, lip.radiusX * 0.99, lip.radiusY * 0.99, 0, span[0], span[1]);
  ctx.stroke();
}

/** A ring around the body at height fraction `t`, on the same taper the collider uses. */
function ribEllipse(bin, t) {
  const radius = bin.bottomRadius + (bin.mouthRadius - bin.bottomRadius) * t;
  const centre = projectPoint({ x: bin.x, y: bin.topY * t, z: bin.z });
  return ringEllipseAt(centre.x, centre.y, radius, bin.z);
}

/**
 * A claimed cell: the neon mark lying ON the bin's mouth, and the lip lit to
 * match.
 *
 * The bin STAYS. It used to be deleted and replaced by a mark painted flat on
 * the floor, so claiming a cell made a solid object vanish out of a board the
 * player is aiming at — the grid changed shape every turn. Capping it instead
 * keeps the board still and reads immediately as closed.
 *
 * The mark is drawn squashed to the mouth's own ellipse, because that is what a
 * flat thing lying on the mouth plane looks like from here.
 */
export function drawBinMark(ctx, bin, image, mark, { glow = 1 } = {}) {
  const { inner, lip } = binRings(bin);
  const tint = mark === "o" ? "#28d8ff" : "#ff4fd8";

  ctx.save();

  // The cap, sitting in the mouth rather than floating over it.
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(9,13,18,.92)";
  ctx.beginPath();
  ctx.ellipse(inner.cx, inner.cy, inner.radiusX, inner.radiusY, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = tint;
  ctx.globalAlpha = 0.5 * glow;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 16 * glow;
  ctx.lineWidth = Math.max(2, lip.radiusX * 0.07);
  ctx.beginPath();
  ctx.ellipse(lip.cx, lip.cy, lip.radiusX, lip.radiusY, 0, 0, TAU);
  ctx.stroke();

  if (image?.complete && image.naturalWidth) {
    const width = inner.radiusX * 1.62;
    // Two separate squashes, and they multiply. The art's own aspect ratio is
    // the first; the mouth's ellipse is the second, because the mark lies FLAT
    // on the mouth plane and is foreshortened by exactly as much as the opening
    // it is lying on. Applying only the art's ratio is what draws a mark
    // standing upright inside a bin.
    const artRatio = (image.naturalHeight || 1) / (image.naturalWidth || 1);
    const height = width * artRatio * (inner.radiusY / inner.radiusX);
    ctx.globalAlpha = 0.96;
    ctx.shadowBlur = 22 * glow;
    ctx.drawImage(image, inner.cx - width / 2, inner.cy - height / 2, width, height);
  }

  ctx.restore();
}
