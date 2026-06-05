import { BOSS_TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";

const TAU = Math.PI * 2;

// Where a world lane meets the player plane (hand-impact depth) on screen.
export function lanePlanePoint(laneX, playerX) {
  return project(laneX, 55, BOSS_TUNING.armImpactZ, playerX);
}

// A tapered quad from a narrow source to a wide impact — gives the beam depth.
export function beamQuad(ctx, ox, oy, tx, ty, w0, w1) {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(ox + nx * w0, oy + ny * w0);
  ctx.lineTo(tx + nx * w1, ty + ny * w1);
  ctx.lineTo(tx - nx * w1, ty - ny * w1);
  ctx.lineTo(ox - nx * w0, oy - ny * w0);
  ctx.closePath();
}

export function renderChargeSight(ctx, ox, oy, target, t, locked) {
  const col = locked ? "#ff5a3c" : "#ffc24a";
  ctx.save();

  ctx.globalAlpha = locked ? 0.55 : 0.32;
  ctx.shadowColor = col;
  ctx.shadowBlur = locked ? 16 : 8;
  ctx.fillStyle = col;
  beamQuad(ctx, ox, oy, target.x, target.y, locked ? 5 : 3, locked ? 18 : 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  const spin = t * (locked ? 0.018 : 0.01);
  const pulse = 0.5 + 0.5 * Math.sin(t * (locked ? 0.02 : 0.012));
  ctx.translate(target.x, target.y);
  ctx.rotate(spin);
  ctx.strokeStyle = col;
  ctx.lineWidth = locked ? 3 : 2;
  ctx.shadowColor = col;
  ctx.shadowBlur = locked ? 14 : 6;

  const rOuter = (locked ? 30 : 36) - pulse * 6;
  ctx.beginPath();
  ctx.arc(0, 0, rOuter, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (rOuter - 8), Math.sin(a) * (rOuter - 8));
    ctx.lineTo(Math.cos(a) * (rOuter + 8), Math.sin(a) * (rOuter + 8));
    ctx.stroke();
  }

  if (locked) {
    ctx.beginPath();
    ctx.arc(0, 0, 6 + pulse * 12, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderBeam(ctx, ox, oy, tx, ty, fireTimer, t) {
  const grow = clamp(fireTimer / 110, 0, 1);
  const wOuter = lerp(10, 64, grow);
  const wCore = lerp(4, 30, grow);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  ctx.shadowColor = "#ff3a2e";
  ctx.shadowBlur = 44;
  ctx.fillStyle = "rgba(255, 70, 50, 0.42)";
  beamQuad(ctx, ox, oy, tx, ty, wOuter * 0.5, wOuter);
  ctx.fill();

  ctx.shadowBlur = 24;
  ctx.fillStyle = "rgba(255, 150, 90, 0.7)";
  beamQuad(ctx, ox, oy, tx, ty, wCore * 0.7, wCore * 1.5);
  ctx.fill();

  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fff3ec";
  beamQuad(ctx, ox, oy, tx, ty, wCore * 0.4, wCore);
  ctx.fill();

  const dx = tx - ox;
  const dy = ty - oy;
  for (let i = 0; i < 5; i++) {
    const frac = ((i / 5) + (t * 0.0016 % 1)) % 1;
    const bx = ox + dx * frac;
    const by = oy + dy * frac;
    const br = lerp(wCore * 0.5, wCore * 1.3, frac);
    ctx.fillStyle = "rgba(255, 220, 190, 0.5)";
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
  }

  const mg = ctx.createRadialGradient(ox, oy, 1, ox, oy, wOuter * 1.4);
  mg.addColorStop(0, "rgba(255,255,255,0.9)");
  mg.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(ox, oy, wOuter * 1.4, 0, TAU);
  ctx.fill();

  const flare = ctx.createRadialGradient(tx, ty, 1, tx, ty, wOuter * 2.2);
  flare.addColorStop(0, "rgba(255,255,255,0.95)");
  flare.addColorStop(0.4, "rgba(255,140,90,0.6)");
  flare.addColorStop(1, "rgba(255,80,50,0)");
  ctx.fillStyle = flare;
  ctx.beginPath();
  ctx.arc(tx, ty, wOuter * 2.2, 0, TAU);
  ctx.fill();

  ctx.restore();
}

export function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.62, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.62, y);
  ctx.closePath();
}
