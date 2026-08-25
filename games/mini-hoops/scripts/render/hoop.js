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
// LIGHT COMES FROM THE LEFT, matching the painted rooms. Every gradient in this
// file is keyed off that one decision; if the rooms are ever relit, flip these
// together rather than one at a time.
//
// `kick` values are transient wobble the composition layer supplies; this module
// just applies them.

import { RIM_DRAW_RADIUS_X, RIM_DRAW_RADIUS_Y } from "../sim/constants.js";

const TAU = Math.PI * 2;

// Cords, how far the net's mouth tapers in by the time it reaches the hem, and
// how far it hangs.
const NET_CORDS = 12;
const NET_DROP = 74;
const NET_TAPER = 0.6;
// How far a strand twists around the cone between rim and hem, in radians. Set
// to a whole multiple of the strand spacing and the two families cross on top of
// each other instead of forming diamonds.
const NET_TWIST = Math.PI * 0.55;

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
  // the face rather than floating above it.
  const squareX = hoop.cx - 32;
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
  ctx.fillText("MINI HOOPS", hoop.cx, y + 32);

  // The bracket plate the rim bolts through, at the foot of the board.
  ctx.fillStyle = "#8d3524";
  roundedRect(ctx, hoop.cx - 17, y + h - 9, 34, 14, 4);
  ctx.fill();
}

/** A point on the rim ellipse at angle `a`. Screen-space; `a = 0` is stage right. */
function rimPoint(hoop, a, scale = 1) {
  return {
    x: hoop.cx + Math.cos(a) * RIM_DRAW_RADIUS_X * scale,
    y: hoop.rimY + Math.sin(a) * RIM_DRAW_RADIUS_Y * scale,
  };
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
  const start = backHalf ? Math.PI : 0;
  const end = backHalf ? TAU : Math.PI;

  ctx.save();
  ctx.translate(kick * (backHalf ? -0.5 : 1), 0);
  ctx.lineCap = "round";

  const arc = (radiusScale, offsetY) => {
    ctx.beginPath();
    ctx.ellipse(
      hoop.cx,
      hoop.rimY + offsetY,
      RIM_DRAW_RADIUS_X * radiusScale,
      RIM_DRAW_RADIUS_Y * radiusScale,
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
  const body = ctx.createLinearGradient(hoop.cx - RIM_DRAW_RADIUS_X, 0, hoop.cx + RIM_DRAW_RADIUS_X, 0);
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
      const point = rimPoint(hoop, a);
      ctx.beginPath();
      ctx.arc(point.x, point.y + 2.5, 2.4, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * A point on one net strand.
 *
 * A strand is a helix, not a plumb line: it leaves the rim at angle `a` and
 * twists by `NET_TWIST` on its way down, while the cone it rides narrows from
 * the rim radius to `NET_TAPER` of it. Draw one family twisting each way and the
 * crossings *are* the diamond mesh — which is the whole trick. Stacking
 * horizontal rings down a straight cone, the shape this replaced, reads as a
 * wastepaper basket instead of a net.
 */
function strandPoint(hoop, a, t, direction, hemY, hemDrift) {
  const angle = a + direction * NET_TWIST * t;
  // Ease the taper so the net has a slight belly rather than straight sides.
  const narrow = 1 - (1 - NET_TAPER) * (t * t * (3 - 2 * t));
  const local = rimPoint(hoop, angle, narrow);
  return {
    x: local.x + hemDrift * t,
    y: local.y + (hemY - hoop.rimY) * t,
    // Screen depth: a point on the near side of the cone has a positive sine.
    front: Math.sin(angle) >= 0,
  };
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
  for (let i = 0; i < NET_CORDS; i++) {
    const a = (TAU * i) / NET_CORDS;
    for (const direction of [1, -1]) {
      let drawing = false;
      for (let step = 0; step <= STEPS; step++) {
        const point = strandPoint(hoop, a, step / STEPS, direction, hemY, hemDrift);
        const wanted = backHalf ? !point.front : point.front;
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
  // a made basket.
  ctx.lineWidth = backHalf ? 2 : 3;
  ctx.beginPath();
  ctx.ellipse(
    hoop.cx + hemDrift,
    hemY,
    RIM_DRAW_RADIUS_X * NET_TAPER,
    RIM_DRAW_RADIUS_Y * NET_TAPER,
    0,
    backHalf ? Math.PI : 0,
    backHalf ? TAU : Math.PI,
  );
  ctx.stroke();

  ctx.restore();
}
