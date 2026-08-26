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
// THE MOUTH'S DEPTH FRONT-TO-BACK USED TO BE THE ONE PLACE THEY DISAGREED, and
// it no longer is. The art was photographed from very near eye level: its
// painted mouth is an ellipse 0.248 as tall as it is wide, where a HORIZONTAL
// circle through this camera is 0.42 at the back row and 0.59 at the front. So
// the painted opening read 13px deep against a collider 32px deep, and a lip
// strike near the front or back of a mouth happened off-picture.
//
// The fix is in `sim/bin-physics.js` and it moved the collider, not the picture:
// a horizontal disc is only ONE of the planes that projects to a given ellipse,
// so the mouth is allowed to LEAN AWAY from the camera until it projects onto
// the paint exactly. `binRings` reads that lean off the bin, and all four mouth
// rings land on the art in both axes at every row.
//
// NOTHING DRAWS THAT AGREEMENT IN THE GAME. There was an in-court overlay on a
// C key for a while, and it is gone: it shipped to players, who have no use for
// it and every reason to be confused by it. `tools/bin-contact-sheet.mjs` draws
// the same thing offline at 12x, against the raw art, with the painted mouth
// placed independently of the collider — a better instrument that cannot reach
// the live site.
//
// TWO PASSES, LIKE THE RIM. `drawBinBody` is the whole sprite, before the ball;
// `drawBinLip` re-draws everything below the mouth's centre line, after it — so
// a ball dropping in goes behind the near lip and the front wall rather than
// skating across them.

import { BIN_ART, binClearance } from "../sim/bin-physics.js";
import { projectPoint, ringEllipseAt, tiltedRingEllipseAt, worldToScreenLength } from "../sim/projection.js";
import { depthGradeFilter } from "./scene.js";

const TAU = Math.PI * 2;

/**
 * Every ring of this bin, projected at the depth it actually sits at.
 *
 * `clear` is `binClearance` read straight off the sim — how far off-axis the
 * ball's centre may be at the mouth plane and still drop through. Nothing in the
 * game draws it; it is here for `tools/bin-contact-sheet.mjs`, and for the tests
 * that pin the drawn lip and the clearance circle to one scale.
 */
export function binRings(bin) {
  const mouth = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
  const foot = projectPoint({ x: bin.x, y: 0, z: bin.z });
  // The mouth's rings lean with the mouth; the base sits flat on the floor,
  // because the drum is upright and only its opening leans. See
  // `sim/bin-physics.js`.
  const ring = (radius) => tiltedRingEllipseAt(mouth.x, mouth.y, radius, bin.z, bin.mouthTilt.angle);
  return {
    outer: ring(bin.mouthRadius + bin.rimTubeRadius),
    lip: ring(bin.mouthRadius),
    inner: ring(bin.mouthRadius - bin.rimTubeRadius),
    clear: ring(binClearance(bin)),
    base: ringEllipseAt(foot.x, foot.y, bin.bottomRadius, bin.z),
    foot,
  };
}

/** The mouth opening, for anything that has to clip a ball into it. */
export function binMouthEllipse(bin) {
  return binRings(bin).inner;
}

/**
 * Where the bin is in its own art — the SAME measurements the collider is built
 * from, imported rather than restated.
 *
 * This block used to be a second, hand-typed copy of the numbers, and it drifted
 * from the picture in both of the ways that matter (see `BIN_ART`). It is now
 * one record: `sim/bin-physics.js` reads it to size the mouth and solve its
 * lean, and this file reads it to place the sprite. The two cannot disagree,
 * which is the whole point.
 */
const SPRITE = BIN_ART;

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
