// The hoop: backboard, rim, and net.
//
// Rim and net are each drawn in TWO HALVES — a back half behind the ball and a
// front half in front of it. That split is the only reason a ball can look like
// it went *through* the hoop rather than past it, on a canvas with no depth
// buffer. `render/frame.js` owns which half goes when.
//
// `kick` values are transient wobble the composition layer supplies; this module
// just applies them.

import { RIM_DRAW_RADIUS_X, RIM_DRAW_RADIUS_Y } from "../sim/constants.js";

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

export function drawBackboard(ctx, hoop) {
  const { boardX: x, boardY: y, boardW: w, boardH: h } = hoop;

  ctx.save();
  ctx.shadowColor = "rgba(46,26,20,.32)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(243,239,226,.95)";
  roundedRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.restore();

  // Mounting bolts.
  for (const boltX of [x + 11, x + w - 11]) {
    ctx.fillStyle = "rgba(211,222,214,.78)";
    ctx.beginPath();
    ctx.arc(boltX, y + 21, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(96,112,108,.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(247,243,230,.96)";
  roundedRect(ctx, x + 7, y + 7, w - 14, h - 14, 7);
  ctx.fill();
  ctx.strokeStyle = "#6d473d";
  ctx.lineWidth = 5;
  ctx.stroke();

  // The shooter's square.
  ctx.strokeStyle = "#c24931";
  ctx.lineWidth = 4;
  ctx.strokeRect(hoop.cx - 32, y + 42, 64, 43);

  ctx.fillStyle = "#292126";
  ctx.font = '900 12px system-ui';
  ctx.textAlign = "center";
  ctx.fillText("MINI HOOPS", hoop.cx, y + 27);
}

/**
 * Half the rim.
 *
 * @param backHalf true for the far arc (drawn before the ball), false for the near arc.
 */
export function drawRim(ctx, hoop, backHalf, kick = 0) {
  ctx.save();
  ctx.translate(kick * (backHalf ? -0.5 : 1), 0);
  ctx.strokeStyle = "#b8402b";
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  if (backHalf) {
    ctx.ellipse(hoop.cx, hoop.rimY, RIM_DRAW_RADIUS_X, RIM_DRAW_RADIUS_Y, 0, Math.PI, Math.PI * 2);
  } else {
    ctx.ellipse(hoop.cx, hoop.rimY, RIM_DRAW_RADIUS_X, RIM_DRAW_RADIUS_Y, 0, 0, Math.PI);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Half the net, drawn as vertical cords plus horizontal weave.
 *
 * `kick` is the snap left over from a made basket; it sways the cords and
 * stretches the net downward, which is most of what sells a made shot.
 */
export function drawNet(ctx, hoop, backHalf, kick = 0) {
  ctx.save();
  if (backHalf) ctx.globalAlpha = 0.52;
  ctx.strokeStyle = backHalf ? "rgba(238,232,216,.68)" : "rgba(255,250,237,.9)";
  ctx.lineWidth = 3;

  const sway = (backHalf ? -0.35 : 1) * kick;
  const topY = hoop.rimY + 22;
  const bottomY = hoop.rimY + 76 + Math.abs(kick) * 3;
  const leftTop = hoop.cx - 41;
  const rightTop = hoop.cx + 41;
  const leftBottom = hoop.cx - 28 + sway * 5;
  const rightBottom = hoop.cx + 28 + sway * 5;

  // Vertical cords, tapering inward toward the bottom of the net.
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    ctx.beginPath();
    ctx.moveTo(leftTop + (rightTop - leftTop) * t, topY);
    ctx.quadraticCurveTo(hoop.cx + sway * 8, hoop.rimY + 48, leftBottom + (rightBottom - leftBottom) * t, bottomY);
    ctx.stroke();
  }

  // Horizontal weave, zig-zagged so it reads as knots rather than as rings.
  for (let j = 1; j <= 5; j++) {
    const t = j / 6;
    const y = topY + (bottomY - topY) * t;
    const left = leftTop + (leftBottom - leftTop) * t + sway * t * 4;
    const right = rightTop + (rightBottom - rightTop) * t + sway * t * 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    for (let i = 1; i <= 6; i++) {
      ctx.lineTo(left + ((right - left) * i) / 6, y + (i % 2 ? 5 : -1) + Math.abs(kick) * t * 1.5);
    }
    ctx.stroke();
  }

  ctx.restore();
}
