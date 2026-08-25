// The hoop: wall mount, backboard, rim, and net.
//
// Rim and net are each drawn in TWO HALVES — a back half behind the ball and a
// front half in front of it. That split is the only reason a ball can look like
// it went *through* the hoop rather than past it, on a canvas with no depth
// buffer. `render/frame.js` owns which half goes when.
//
// THE NET HANGS OFF THE RIM ELLIPSE. Every cord starts at a real point on the
// rim's ellipse and converges onto a smaller ellipse at the hem, so the net is a
// truncated cone seen from slightly above rather than a flat curtain. A cord's
// own angle around the rim is what decides whether it belongs to the back half
// or the front half, which is what makes the far cords read as far. Drawing both
// halves from one straight horizontal line — the old shape — is what made the
// net look like a streamer taped under the board.
//
// THE RIM IS ABOVE EYE LEVEL and its shape is not a constant. The camera's eye
// line is `HORIZON_SCREEN_Y` (298) and the rim rides 174..272, so we look UP at
// the ring in every mode — which means we see its UNDERSIDE, and its NEAR edge
// draws HIGHER on screen than its far edge, not lower. Both facts used to be
// backwards here: the ellipse was a fixed 48x12 whatever height the rim was at,
// and the "back" arc was the upper one, the convention for a hoop seen from
// above. `sim/projection.js`'s `ringEllipseAt` now answers both questions from
// the one camera, and this file just asks. Nothing in here hardcodes a shape.
//
// LIGHT COMES FROM THE LEFT, matching the painted rooms. Every gradient in this
// file is keyed off that one decision; if the rooms are ever relit, flip these
// together rather than one at a time.
//
// `kick` values are transient wobble the composition layer supplies; this module
// just applies them.

import { RIM_RADIUS_WORLD } from "../sim/constants.js";
import { ringEllipseAt } from "../sim/projection.js";

const TAU = Math.PI * 2;

// Cords, how far the net's mouth tapers in by the time it reaches the hem, and
// how far it hangs.
//
// NET_DROP is screen pixels, which is exact rather than lazy: the whole hoop
// lives on one depth plane, so the world-to-screen ratio at the rim never
// changes and a fixed pixel drop IS a fixed length of net. At this camera the
// rim plane runs 200px to the world unit, so 46px is 23cm of net hanging off a
// rim 1.60m up — a mini hoop, which is the thing on the wall.
//
// It was 74px, a 37cm net, and that was full-size basketball hardware on a toy.
// The cost only became visible once the hem was honestly projected: 74px put it
// at y=296 with EYE LEVEL AT 298, and a ring at eye level is a straight line, so
// the net finished in a flat white bar at the rest position of every mode.
const NET_CORDS = 12;
const NET_DROP = 46;
const NET_TAPER = 0.6;
// How far a strand twists around the cone between rim and hem, in radians.
//
// It is the twist PER NET, not per pixel, so it has to move with `NET_DROP` or
// the mesh changes shape: at the old 74px drop 0.55pi gave open diamonds, and
// left alone over a 46px net the same twist raked them into a tight spiral.
//
// Strands are spaced 2pi/NET_CORDS apart, and a twist landing on a whole
// multiple of that spacing lands each strand exactly on top of another and the
// two families stop crossing — so the diamonds vanish at 0.333pi, which is where
// scaling with the drop would otherwise have put this. 0.42pi is two and a HALF
// spacings, the furthest from a multiple it can be, which is the widest the
// crossings ever open.
const NET_TWIST = Math.PI * 0.42;

/** Rounded rectangle path helper — used by the backboard. */
function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * The shadow the whole assembly throws onto the wall.
 *
 * Drawn before the board. Without it the board reads as a sticker on the
 * wallpaper — this one blurred rectangle is most of what says the hoop is bolted
 * out from the wall rather than printed on it. There is deliberately no visible
 * bracket: anything hung off the board's bottom edge lands exactly where the rim
 * and net are drawn and is never seen.
 */
function drawWallShadow(ctx, hoop) {
  const { boardX: x, boardY: y, boardW: w, boardH: h } = hoop;
  ctx.save();
  ctx.fillStyle = "rgba(38,22,17,.26)";
  ctx.filter = "blur(9px)";
  roundedRect(ctx, x + 13, y + 15, w, h + 6, 12);
  ctx.fill();
  ctx.restore();
}

export function drawBackboard(ctx, hoop) {
  const { boardX: x, boardY: y, boardW: w, boardH: h } = hoop;

  drawWallShadow(ctx, hoop);

  // Outer frame.
  ctx.fillStyle = "#6d473d";
  roundedRect(ctx, x, y, w, h, 11);
  ctx.fill();

  // The acrylic face: a diagonal grade so the board catches the room light
  // rather than sitting as one flat value.
  const face = ctx.createLinearGradient(x, y, x + w * 0.55, y + h);
  face.addColorStop(0, "#fffdf4");
  face.addColorStop(0.55, "#f4efe0");
  face.addColorStop(1, "#ddd5c2");
  ctx.fillStyle = face;
  roundedRect(ctx, x + 6, y + 6, w - 12, h - 12, 7);
  ctx.fill();

  // A single raking sheen across the upper-left corner. Clipped to the face, so
  // it never spills onto the frame.
  ctx.save();
  roundedRect(ctx, x + 6, y + 6, w - 12, h - 12, 7);
  ctx.clip();
  const sheen = ctx.createLinearGradient(x, y, x + w * 0.8, y + h * 0.9);
  sheen.addColorStop(0, "rgba(255,255,255,.55)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.strokeStyle = "rgba(109,71,61,.85)";
  ctx.lineWidth = 2;
  roundedRect(ctx, x + 6, y + 6, w - 12, h - 12, 7);
  ctx.stroke();

  // Mounting bolts, top corners.
  for (const boltX of [x + 15, x + w - 15]) {
    const bolt = ctx.createRadialGradient(boltX - 3, y + 17, 1, boltX, y + 20, 8);
    bolt.addColorStop(0, "#f2f5f1");
    bolt.addColorStop(1, "#94a39c");
    ctx.fillStyle = bolt;
    ctx.beginPath();
    ctx.arc(boltX, y + 20, 7.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(74,88,84,.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // The shooter's square, with its own shadow line so it reads as painted onto
  // the face rather than floating above it. Everything from here down is PAINTED
  // ON THE BOARD, so it is centred on `boardCx` — the board's own centre, which
  // lags the rim's slightly on a sweep because the board is deeper. Using
  // `hoop.cx` here would slide the markings across the face of the board.
  const squareX = hoop.boardCx - 32;
  const squareY = y + 44;
  ctx.strokeStyle = "rgba(60,32,26,.18)";
  ctx.lineWidth = 5;
  ctx.strokeRect(squareX + 1.5, squareY + 1.5, 64, 40);
  ctx.strokeStyle = "#c24931";
  ctx.lineWidth = 4;
  ctx.strokeRect(squareX, squareY, 64, 40);

  ctx.fillStyle = "#3a2b2f";
  ctx.font = '900 11px system-ui';
  ctx.textAlign = "center";
  ctx.fillText("MINI HOOPS", hoop.boardCx, y + 32);

  // The bracket plate the rim bolts through, at the foot of the board.
  ctx.fillStyle = "#8d3524";
  roundedRect(ctx, hoop.boardCx - 17, y + h - 9, 34, 14, 4);
  ctx.fill();
}

/** The rim's own projected ellipse, for a hoop snapshot. */
function rimEllipse(hoop) {
  return ringEllipseAt(hoop.cx, hoop.rimY, RIM_RADIUS_WORLD);
}

/** A point on a projected ring at angle `a`. Screen-space; `a = 0` is stage right. */
function ringPoint(ellipse, a) {
  return {
    x: ellipse.cx + Math.cos(a) * ellipse.radiusX,
    y: ellipse.cy + Math.sin(a) * ellipse.radiusY,
  };
}

/**
 * Is the point at angle `a` on the NEAR side of this ring?
 *
 * Increasing screen y is downward, so a positive sine puts a point below the
 * ring's centre — which is the near side ONLY when the ring is seen from above.
 * Looking up at it, the whole thing inverts. Every near/far decision in this
 * file goes through here so there is exactly one place that can be wrong.
 */
function isNear(ellipse, a) {
  return (Math.sin(a) >= 0) !== ellipse.fromBelow;
}

/** The angular span of one half of a ring: `[start, end]`, near or far. */
function halfSpan(ellipse, wantNear) {
  const lowerIsNear = !ellipse.fromBelow;
  return wantNear === lowerIsNear ? [0, Math.PI] : [Math.PI, TAU];
}

/**
 * Half the rim, as a tube rather than a line.
 *
 * Three passes: a dark underside, the painted body on a left-lit gradient, and a
 * thin specular along the top. One flat stroke reads as a drawn circle; the
 * stack is what makes it read as bent steel.
 *
 * @param backHalf true for the far arc (drawn before the ball), false for the near arc.
 */
export function drawRim(ctx, hoop, backHalf, kick = 0) {
  const ellipse = rimEllipse(hoop);
  const [start, end] = halfSpan(ellipse, !backHalf);

  ctx.save();
  ctx.translate(kick * (backHalf ? -0.5 : 1), 0);
  ctx.lineCap = "round";

  const arc = (radiusScale, offsetY) => {
    ctx.beginPath();
    ctx.ellipse(
      ellipse.cx,
      ellipse.cy + offsetY,
      ellipse.radiusX * radiusScale,
      ellipse.radiusY * radiusScale,
      0,
      start,
      end,
    );
    ctx.stroke();
  };

  // Underside.
  ctx.strokeStyle = backHalf ? "rgba(94,30,18,.55)" : "#6f2313";
  ctx.lineWidth = 9;
  arc(1, 2);

  // Body. Left-lit, and the far half sits a shade darker overall.
  const body = ctx.createLinearGradient(ellipse.cx - ellipse.radiusX, 0, ellipse.cx + ellipse.radiusX, 0);
  if (backHalf) {
    body.addColorStop(0, "#a8412c");
    body.addColorStop(0.5, "#8e3623");
    body.addColorStop(1, "#7d2f1e");
  } else {
    body.addColorStop(0, "#e4653f");
    body.addColorStop(0.45, "#c4472e");
    body.addColorStop(1, "#a03a25");
  }
  ctx.strokeStyle = body;
  ctx.lineWidth = 8;
  arc(1, 0);

  // Specular along the top of the tube.
  ctx.strokeStyle = backHalf ? "rgba(255,214,190,.22)" : "rgba(255,224,201,.5)";
  ctx.lineWidth = 2.5;
  arc(0.985, -2.2);

  // Net attachment loops, only on the near arc where they are legible.
  if (!backHalf) {
    ctx.strokeStyle = "rgba(72,26,15,.75)";
    ctx.lineWidth = 1.8;
    for (let i = 0; i < NET_CORDS; i++) {
      const a = start + ((end - start) * (i + 0.5)) / NET_CORDS;
      const point = ringPoint(ellipse, a);
      ctx.beginPath();
      ctx.arc(point.x, point.y + 2.5, 2.4, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * The stack of rings the net is woven around, from the rim down to the hem.
 *
 * A ring per step, each PROJECTED at the height it actually hangs at — which is
 * the whole reason this is a list and not one shape scaled down. The net drops
 * 74px from a rim that rides 174..272, against an eye line at 298: the hem
 * therefore CROSSES EYE LEVEL partway through most modes' travel, and a ring at
 * eye level is a straight line. So the cone honestly closes to edge-on and opens
 * out the other way as it passes, which is what a net hanging below your eye
 * does and what a stack of identical squashed circles can never show.
 */
function netRings(hoop, hemY, hemDrift, steps) {
  const rings = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    // Ease the taper so the net has a slight belly rather than straight sides.
    const narrow = 1 - (1 - NET_TAPER) * (t * t * (3 - 2 * t));
    rings.push(
      ringEllipseAt(hoop.cx + hemDrift * t, hoop.rimY + (hemY - hoop.rimY) * t, RIM_RADIUS_WORLD * narrow),
    );
  }
  return rings;
}

/**
 * A point on one net strand.
 *
 * A strand is a helix, not a plumb line: it leaves the rim at angle `a` and
 * twists by `NET_TWIST` on its way down, while the cone it rides narrows toward
 * `NET_TAPER`. Draw one family twisting each way and the crossings *are* the
 * diamond mesh — which is the whole trick. Stacking horizontal rings down a
 * straight cone, the shape this replaced, reads as a wastepaper basket instead
 * of a net.
 *
 * Which half a point belongs to is asked of ITS OWN ring, not the rim's, so a
 * strand below eye level splits the opposite way to one above it.
 */
function strandPoint(ring, a, t, direction) {
  const angle = a + direction * NET_TWIST * t;
  const point = ringPoint(ring, angle);
  return { x: point.x, y: point.y, near: isNear(ring, angle) };
}

/**
 * Half the net.
 *
 * Every strand is walked in small steps and a step is only stroked when it lies
 * in the requested half, so a strand that twists from the far side to the near
 * side is genuinely split between the two draw passes and the ball passes
 * through the middle of it.
 *
 * `kick` is the snap left over from a made basket; it sways the hem and stretches
 * the net downward, which is most of what sells a made shot.
 */
export function drawNet(ctx, hoop, backHalf, kick = 0) {
  const sway = (backHalf ? -0.35 : 1) * kick;
  const hemY = hoop.rimY + NET_DROP + Math.abs(kick) * 3;
  const hemDrift = sway * 5;

  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = backHalf ? 0.42 : 0.92;

  // Cords fade toward the hem — a net is lit at its mouth and lost in shadow
  // underneath, and a uniform white cone reads as moulded plastic.
  const cordShade = ctx.createLinearGradient(0, hoop.rimY, 0, hemY);
  if (backHalf) {
    cordShade.addColorStop(0, "rgba(224,217,199,.8)");
    cordShade.addColorStop(1, "rgba(186,178,161,.4)");
  } else {
    cordShade.addColorStop(0, "rgba(255,253,246,.98)");
    cordShade.addColorStop(1, "rgba(219,210,190,.62)");
  }
  ctx.strokeStyle = cordShade;
  ctx.lineWidth = backHalf ? 1.7 : 2.2;

  const STEPS = 18;
  const rings = netRings(hoop, hemY, hemDrift, STEPS);
  for (let i = 0; i < NET_CORDS; i++) {
    const a = (TAU * i) / NET_CORDS;
    for (const direction of [1, -1]) {
      let drawing = false;
      for (let step = 0; step <= STEPS; step++) {
        const point = strandPoint(rings[step], a, step / STEPS, direction);
        const wanted = backHalf ? !point.near : point.near;
        if (!wanted) {
          if (drawing) ctx.stroke();
          drawing = false;
          continue;
        }
        if (!drawing) {
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          drawing = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      if (drawing) ctx.stroke();
    }
  }

  // The hem, drawn heavier — it is the edge the eye tracks when the net snaps on
  // a made basket. It is the last ring in the stack, so it is already projected
  // at its own height and splits on its own side of eye level.
  const hem = rings[STEPS];
  const [hemStart, hemEnd] = halfSpan(hem, !backHalf);
  ctx.lineWidth = backHalf ? 2 : 3;
  ctx.beginPath();
  ctx.ellipse(hem.cx, hem.cy, hem.radiusX, hem.radiusY, 0, hemStart, hemEnd);
  ctx.stroke();

  ctx.restore();
}
