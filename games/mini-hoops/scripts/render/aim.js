// The aiming overlay: the elastic, the reticle, and the trajectory preview.
//
// This is the game's only tutorial. Each piece answers one question the player
// is asking mid-pull:
//
//   the elastic    -> "how hard am I pulling?"
//   the reticle    -> "where am I aiming?"  (a consequence of pull ANGLE, never
//                     something dragged around independently)
//   the dotted arc -> "what shape of shot is this?"
//
// The preview shows the un-obstructed flight only. It deliberately does not
// simulate the bounce — showing where the ball would end up would answer the
// question the shot is supposed to be asking.

import { projectPoint } from "../sim/projection.js";

export function drawAim(ctx, { pull, trajectory }) {
  ctx.save();
  ctx.lineCap = "round";

  // The elastic: anchor to the drawn ball.
  ctx.strokeStyle = "rgba(255,255,255,.50)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pull.anchorX, pull.anchorY);
  ctx.lineTo(pull.visualX, pull.visualY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(25,14,11,.42)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pull.anchorX, pull.anchorY);
  ctx.lineTo(pull.visualX, pull.visualY);
  ctx.stroke();

  // The remaining stretch, from the drawn ball out to the finger. Drawing this
  // gap is what makes the pull read as tension rather than as lag.
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pull.visualX, pull.visualY);
  ctx.lineTo(pull.x, pull.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255,255,255,.42)";
  ctx.beginPath();
  ctx.arc(pull.x, pull.y, 4, 0, Math.PI * 2);
  ctx.fill();

  drawReticle(ctx, pull.aimX, pull.aimY);

  if (trajectory) {
    ctx.fillStyle = "rgba(255,255,255,.52)";
    for (const point of trajectory) {
      const screen = projectPoint(point);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawReticle(ctx, x, y) {
  ctx.strokeStyle = "rgba(255,255,255,.92)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 19, y);
  ctx.lineTo(x - 7, y);
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 19, y);
  ctx.moveTo(x, y - 19);
  ctx.lineTo(x, y - 7);
  ctx.moveTo(x, y + 7);
  ctx.lineTo(x, y + 19);
  ctx.stroke();
}
