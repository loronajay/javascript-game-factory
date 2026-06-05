import { BOSS_TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { getBossLayout, getHandProjection } from "../systems/boss.mjs";
import { phaseUsesArms, phaseUsesLaser } from "../entities/boss.mjs";
import { lanePlanePoint, beamQuad, renderChargeSight, renderBeam } from "./boss-fx.mjs";

const TAU = Math.PI * 2;

const OUTLINE   = "#b9fbff";
const BODY      = "#9a1828";
const BODY_DARK = "#1a0406";
const BONE      = "#c4b070";
const BONE_GLOW = "#e0cc86";
const PHASE_EYE = ["#34f7ff", "#ffb347", "#ff5cf0"];
const WEAK      = "#b6ff3a";

export function renderDreadmaw(ctx, game, t) {
  const boss = game.boss;
  const layout = getBossLayout(game);
  const eye = PHASE_EYE[clamp(boss.phase - 1, 0, 2)];

  drawBody(ctx, boss, layout, eye, t);
  drawMouth(ctx, boss, layout, t);

  if (phaseUsesArms(boss.phase) && boss.sub !== "defeat") {
    for (const arm of boss.arms) drawArm(ctx, game, arm, layout, t);
  }

  if (phaseUsesLaser(boss.phase) && boss.sub === "fighting") {
    renderLaser(ctx, game, layout, t);
  }
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function drawBody(ctx, boss, layout, eye, t) {
  const { cx, cy, halfW, halfH } = layout;
  const hit = boss.hitFlashBody > 0;

  ctx.save();
  ctx.translate(cx, cy);

  if (boss.phase >= 2) {
    const pulse = 0.4 + Math.sin(t * 0.005) * 0.6;
    const intensity = boss.phase === 3 ? 1.0 : 0.55;
    ctx.globalAlpha = (0.08 + pulse * 0.07) * intensity;
    const aura = ctx.createRadialGradient(0, halfH * 0.1, halfW * 0.2, 0, halfH * 0.1, halfW * 1.5);
    aura.addColorStop(0, "rgba(0,0,0,0)");
    aura.addColorStop(0.5, eye);
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, 0, halfW * 1.5, halfH * 1.75, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.shadowColor = hit ? "#ffffff" : "#aa1a2e";
  ctx.shadowBlur = hit ? 44 : 26;

  const fill = ctx.createLinearGradient(0, -halfH * 1.3, 0, halfH * 1.2);
  fill.addColorStop(0,    hit ? "#ff6688" : "#c02040");
  fill.addColorStop(0.28, hit ? "#cc3355" : BODY);
  fill.addColorStop(0.65, hit ? "#882030" : "#5a0e18");
  fill.addColorStop(1,    BODY_DARK);
  ctx.fillStyle = fill;
  bossHullPath(ctx, halfW, halfH);
  ctx.fill();

  ctx.shadowBlur = hit ? 20 : 9;
  ctx.shadowColor = OUTLINE;
  ctx.strokeStyle = hit ? "#ffffff" : OUTLINE;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  bossHullPath(ctx, halfW, halfH);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.fillStyle = "rgba(8, 0, 2, 0.56)";
  ctx.lineWidth = 1;
  for (const path of [
    [[-halfW*0.22,-halfH*0.50],[halfW*0.22,-halfH*0.50],[halfW*0.30,-halfH*0.28],[-halfW*0.30,-halfH*0.28]],
    [[-halfW*0.40,-halfH*0.22],[-halfW*0.84,-halfH*0.20],[-halfW*0.76,halfH*0.14],[-halfW*0.34,halfH*0.10]],
    [[ halfW*0.40,-halfH*0.22],[ halfW*0.84,-halfH*0.20],[ halfW*0.76,halfH*0.14],[ halfW*0.34,halfH*0.10]],
    [[-halfW*0.26, halfH*0.56],[ halfW*0.26, halfH*0.56],[ halfW*0.20, halfH*0.88],[-halfW*0.20, halfH*0.88]],
  ]) {
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = BONE;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(4, 0, 1, 0.72)";
  ctx.lineWidth = halfH * 0.10;
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.66, -halfH * 0.18);
  ctx.lineTo(-halfW * 0.22, -halfH * 0.40);
  ctx.lineTo( halfW * 0.22, -halfH * 0.40);
  ctx.lineTo( halfW * 0.66, -halfH * 0.18);
  ctx.stroke();

  ctx.strokeStyle = "rgba(4, 0, 1, 0.40)";
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * halfW * 0.5, halfH * 0.2);
    ctx.lineTo(s * halfW * 0.86, halfH * 0.0);
    ctx.stroke();
  }

  ctx.fillStyle = BONE;
  ctx.strokeStyle = BONE_GLOW;
  ctx.shadowColor = BONE_GLOW;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    const rx = i * halfW * 0.09;
    const baseY = -halfH * 0.89 + Math.abs(i) * halfH * 0.04;
    const tipY = baseY - halfH * (0.07 - Math.abs(i) * 0.014);
    const bw = halfW * 0.038;
    ctx.beginPath();
    ctx.moveTo(rx - bw, baseY);
    ctx.lineTo(rx + bw, baseY);
    ctx.lineTo(rx + bw * 0.15, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(10, 1, 3, 0.90)";
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1.2;
  for (const s of [-1, 1]) {
    const ex = s * halfW * 0.44;
    const ey = -halfH * 0.12;
    ctx.beginPath();
    ctx.moveTo(ex - s * halfW * 0.24, ey - halfH * 0.22);
    ctx.lineTo(ex + s * halfW * 0.06, ey - halfH * 0.32);
    ctx.lineTo(ex + s * halfW * 0.24, ey - halfH * 0.12);
    ctx.lineTo(ex + s * halfW * 0.22, ey - halfH * 0.04);
    ctx.lineTo(ex - s * halfW * 0.22, ey - halfH * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const pulse = 0.6 + Math.sin(t * 0.006) * 0.4;
  for (const s of [-1, 1]) {
    const ex = s * halfW * 0.44;
    const ey = -halfH * 0.12;
    const er = halfH * 0.2;

    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(ex, ey + er * 0.08, er * 1.28, er * 1.04, s * 0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(6, 0, 1, 0.92)";
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.14, er * 0.88, s * 0.25, 0, TAU);
    ctx.fill();

    ctx.shadowColor = hit ? "#ffffff" : eye;
    ctx.shadowBlur = 18 + pulse * 14;
    const eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, er);
    eg.addColorStop(0, "#ffffff");
    eg.addColorStop(0.45, hit ? "#ffffff" : eye);
    eg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er * 0.78, s * 0.25, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = hit ? "#ffffff" : eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 0.72, er * 0.54, s * 0.25, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#020002";
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 0.19, er * 0.65, s * 0.25, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 0.38, er * 0.21, s * 0.25, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function bossHullPath(ctx, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(0, -1.18 * hh);
  ctx.lineTo(-0.34 * hw, -1.04 * hh);
  ctx.lineTo(-0.74 * hw, -1.30 * hh);
  ctx.lineTo(-0.52 * hw, -0.74 * hh);
  ctx.lineTo(-1.00 * hw, -0.46 * hh);
  ctx.lineTo(-0.92 * hw, 0.08 * hh);
  ctx.lineTo(-0.60 * hw, 0.52 * hh);
  ctx.lineTo(-0.40 * hw, 0.96 * hh);
  ctx.lineTo(0, 1.12 * hh);
  ctx.lineTo(0.40 * hw, 0.96 * hh);
  ctx.lineTo(0.60 * hw, 0.52 * hh);
  ctx.lineTo(0.92 * hw, 0.08 * hh);
  ctx.lineTo(1.00 * hw, -0.46 * hh);
  ctx.lineTo(0.52 * hw, -0.74 * hh);
  ctx.lineTo(0.74 * hw, -1.30 * hh);
  ctx.lineTo(0.34 * hw, -1.04 * hh);
  ctx.closePath();
}

// ─── Mouth + teeth ────────────────────────────────────────────────────────────

function drawMouth(ctx, boss, layout, t) {
  const { mouthX, mouthY, mouthW } = layout;
  const m = boss.mouth;

  const charging = m.state === "charging" || m.state === "locked";
  const firing = m.state === "firing";
  const open = m.state === "vulnerable" || firing || charging;
  const gape = open ? mouthW * 0.52 : mouthW * 0.2;

  ctx.save();

  const mawGrad = ctx.createRadialGradient(mouthX, mouthY, 2, mouthX, mouthY, mouthW);
  if (m.exposed) {
    mawGrad.addColorStop(0, m.flash > 0 ? "#ffffff" : "#ff8a5a");
    mawGrad.addColorStop(1, "rgba(70, 6, 6, 0.96)");
    ctx.shadowColor = "#ff5a3c";
    ctx.shadowBlur = 26;
  } else if (charging || firing) {
    mawGrad.addColorStop(0, "#fff2c8");
    mawGrad.addColorStop(0.5, "#ffb347");
    mawGrad.addColorStop(1, "rgba(120, 30, 6, 0.92)");
    ctx.shadowColor = "#ffce6e";
    ctx.shadowBlur = 30;
  } else {
    mawGrad.addColorStop(0, "rgba(40, 6, 16, 0.96)");
    mawGrad.addColorStop(1, "rgba(6, 2, 10, 0.96)");
  }
  ctx.fillStyle = mawGrad;
  ctx.beginPath();
  ctx.ellipse(mouthX, mouthY, mouthW, gape, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = BONE;
  ctx.strokeStyle = "rgba(80, 56, 10, 0.5)";
  ctx.shadowColor = BONE_GLOW;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1;
  for (const [fx, upLen, loLen, bw] of [
    [mouthX,                30, 28, 10],
    [mouthX - mouthW*0.46,  24, 22,  8],
    [mouthX + mouthW*0.46,  24, 22,  8],
    [mouthX - mouthW*0.24,  14, 13,  6],
    [mouthX + mouthW*0.24,  14, 13,  6],
    [mouthX - mouthW*0.74,  10,  9,  5],
    [mouthX + mouthW*0.74,  10,  9,  5],
    [mouthX - mouthW*0.90,   7,  6,  4],
    [mouthX + mouthW*0.90,   7,  6,  4],
  ]) {
    ctx.beginPath();
    ctx.moveTo(fx - bw,      mouthY - gape * 0.92);
    ctx.lineTo(fx + bw*0.7,  mouthY - gape * 0.92);
    ctx.lineTo(fx + bw*0.1,  mouthY - gape * 0.92 + upLen);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx - bw*0.7,  mouthY + gape * 0.92);
    ctx.lineTo(fx + bw,      mouthY + gape * 0.92);
    ctx.lineTo(fx - bw*0.1,  mouthY + gape * 0.92 - loLen);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if (charging) {
    const cfg = BOSS_TUNING.phase2;
    const prog = m.state === "charging" ? clamp(m.timer / cfg.chargeMs, 0, 1) : 1;
    const r = lerp(4, mouthW * 0.46, prog);
    ctx.shadowColor = m.state === "locked" ? "#ff7a3c" : "#ffd86e";
    ctx.shadowBlur = 34;
    const og = ctx.createRadialGradient(mouthX, mouthY, 1, mouthX, mouthY, r);
    og.addColorStop(0, "#ffffff");
    og.addColorStop(0.5, m.state === "locked" ? "#ff7a3c" : "#ffce6e");
    og.addColorStop(1, "rgba(255, 120, 40, 0)");
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, r, 0, TAU);
    ctx.fill();
  }

  if (m.exposed) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = m.flash > 0 ? "#ffffff" : WEAK;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = WEAK;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, mouthW * 0.34 + Math.sin(t * 0.012) * 3, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = m.flash > 0 ? "#ffffff" : WEAK;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, 4, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// ─── Laser ────────────────────────────────────────────────────────────────────

function renderLaser(ctx, game, layout, t) {
  const m = game.boss.mouth;
  if (m.state === "closed" || m.state === "vulnerable") return;

  const px = game.player.x;
  const aimX = m.state === "firing" ? m.lockedX : m.targetX;
  const target = lanePlanePoint(aimX, px);
  const ox = layout.mouthX;
  const oy = layout.mouthY;

  if (m.state === "charging") {
    renderChargeSight(ctx, ox, oy, target, t, false);
  } else if (m.state === "locked") {
    renderChargeSight(ctx, ox, oy, target, t, true);
  } else if (m.state === "firing") {
    renderBeam(ctx, ox, oy, target.x, target.y, m.timer, t);
  }
}

// ─── Arms + hands + weak spots ────────────────────────────────────────────────

function drawArm(ctx, game, arm, layout, t) {
  const px = game.player.x;
  const shoulder = arm.side < 0 ? layout.shoulderL : layout.shoulderR;
  const rest = restHand(layout, arm.side);
  const telegraphing = arm.state === "telegraph";

  const proj = getHandProjection(arm, px);
  let hx = proj.x;
  let hy = proj.y;
  let handSize = clamp(40 * proj.s, 28, 230);

  if (arm.state === "idle" || telegraphing) {
    hx = rest.x;
    hy = rest.y;
    handSize = 54;
  } else if (arm.state === "lunge") {
    const b = clamp(arm.timer / 160, 0, 1);
    hx = lerp(rest.x, proj.x, b);
    hy = lerp(rest.y, proj.y, b);
    handSize = lerp(54, handSize, b);
  } else if (arm.state === "retract") {
    const b = clamp(arm.timer / BOSS_TUNING.phase1.retractMs, 0, 1);
    hx = lerp(proj.x, rest.x, b);
    hy = lerp(proj.y, rest.y, b);
    handSize = lerp(handSize, 54, b);
  }

  if (telegraphing) {
    const mark = lanePlanePoint(arm.laneX, px);
    const on = Math.sin(t * 0.03) > 0;
    drawDangerReticle(ctx, mark.x, mark.y, on ? 0.85 : 0.3, t);
  }

  const aligned =
    arm.exposed && Math.abs(arm.laneX - px) <= BOSS_TUNING.phase1.weakSpotHitWindow;
  const blink = telegraphing ? (Math.sin(t * 0.03) > 0 ? 1 : 0.55) : 1;

  ctx.save();
  ctx.globalAlpha = blink;
  drawLimb(ctx, shoulder.x, shoulder.y, hx, hy, handSize);
  drawClaw(ctx, hx, hy, handSize, arm.side);
  drawWeakSpot(ctx, hx, hy, handSize * 0.4, arm.exposed, aligned, arm.flash > 0, t);
  ctx.restore();
}

function restHand(layout, side) {
  const sh = side < 0 ? layout.shoulderL : layout.shoulderR;
  return { x: sh.x + side * layout.halfW * 0.16, y: sh.y + layout.halfH * 0.92 };
}

function drawLimb(ctx, sx, sy, hx, hy, handSize) {
  const w0 = clamp(handSize * 0.26, 7, 46);
  const w1 = clamp(handSize * 0.5, 12, 78);
  const mx = (sx + hx) / 2 + (hy - sy) * 0.06;
  const my = (sy + hy) / 2 - (hx - sx) * 0.06;

  ctx.save();
  ctx.shadowColor = BODY;
  ctx.shadowBlur = 16;
  const grad = ctx.createLinearGradient(sx, sy, hx, hy);
  grad.addColorStop(0, BODY_DARK);
  grad.addColorStop(1, BODY);
  ctx.fillStyle = grad;
  taperedSpinePath(ctx, sx, sy, mx, my, hx, hy, w0, w1);
  ctx.fill();

  ctx.shadowBlur = 6;
  ctx.shadowColor = OUTLINE;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  taperedSpinePath(ctx, sx, sy, mx, my, hx, hy, w0, w1);
  ctx.stroke();
  ctx.restore();
}

function taperedSpinePath(ctx, x0, y0, cx, cy, x1, y1, w0, w1) {
  const N = 10;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const tt = i / N;
    const mt = 1 - tt;
    const px = mt * mt * x0 + 2 * mt * tt * cx + tt * tt * x1;
    const py = mt * mt * y0 + 2 * mt * tt * cy + tt * tt * y1;
    const dx = 2 * mt * (cx - x0) + 2 * tt * (x1 - cx);
    const dy = 2 * mt * (cy - y0) + 2 * tt * (y1 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = lerp(w0, w1, tt);
    pts.push([px + nx * w, py + ny * w, px - nx * w, py - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][2], pts[i][3]);
  ctx.closePath();
}

function drawClaw(ctx, x, y, size, side) {
  ctx.save();
  ctx.shadowColor = BODY;
  ctx.shadowBlur = 16;
  const grad = ctx.createRadialGradient(x, y - size * 0.2, 2, x, y, size * 0.9);
  grad.addColorStop(0, "#882030");
  grad.addColorStop(0.5, BODY);
  grad.addColorStop(1, BODY_DARK);
  ctx.fillStyle = grad;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = clamp(size * 0.05, 2, 4.5);
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(x - size * 0.46, y - size * 0.34);
  ctx.quadraticCurveTo(x, y - size * 0.56, x + size * 0.46, y - size * 0.34);
  ctx.lineTo(x + size * 0.3, y + size * 0.22);
  ctx.quadraticCurveTo(x, y + size * 0.38, x - size * 0.3, y + size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(6, 0, 2, 0.72)";
  ctx.strokeStyle = "rgba(160, 100, 60, 0.45)";
  ctx.lineWidth = 1;
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.arc(x + k * size * 0.18, y - size * 0.28, size * 0.065, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.shadowColor = BODY;
  ctx.shadowBlur = 12;
  ctx.fillStyle = grad;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = clamp(size * 0.04, 1.5, 3.5);
  for (const k of [-1, 0, 1]) {
    const bx = x + k * size * 0.32;
    ctx.beginPath();
    ctx.moveTo(bx - size * 0.1, y + size * 0.16);
    ctx.quadraticCurveTo(bx + k * size * 0.18, y + size * 0.68, bx + k * size * 0.28 + side * size * 0.05, y + size * 1.18);
    ctx.quadraticCurveTo(bx + k * size * 0.20 + side * size * 0.03, y + size * 1.08, bx + size * 0.1, y + size * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(220, 110, 80, 0.32)";
  ctx.lineWidth = 1;
  for (const k of [-1, 0, 1]) {
    const bx = x + k * size * 0.32;
    ctx.beginPath();
    ctx.moveTo(bx - size * 0.06, y + size * 0.22);
    ctx.quadraticCurveTo(bx + k * size * 0.14, y + size * 0.60, bx + k * size * 0.22 + side * size * 0.04, y + size * 1.05);
    ctx.stroke();
  }

  ctx.restore();
}

function drawWeakSpot(ctx, x, y, r, exposed, aligned, flash, t) {
  ctx.save();
  if (exposed) {
    const pulse = 0.72 + Math.sin(t * 0.014) * 0.28;
    ctx.shadowColor = flash ? "#ffffff" : WEAK;
    ctx.shadowBlur = aligned ? 32 : 22;

    const g = ctx.createRadialGradient(x, y, 1, x, y, r * pulse);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, flash ? "#ffffff" : WEAK);
    g.addColorStop(1, "rgba(120, 200, 40, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = flash ? "#ffffff" : "#3a6010";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.32, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#eaffd0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, TAU);
    ctx.stroke();

    if (aligned) {
      const lock = r * 1.7 - pulse * 5;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, lock, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (lock - 7), y + Math.sin(a) * (lock - 7));
        ctx.lineTo(x + Math.cos(a) * (lock + 9), y + Math.sin(a) * (lock + 9));
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = "#1a0712";
    ctx.strokeStyle = "rgba(120, 60, 70, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawDangerReticle(ctx, x, y, alpha, t) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(t * 0.004);
  ctx.strokeStyle = "#ff365d";
  ctx.shadowColor = "#ff365d";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
    ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
    ctx.stroke();
  }
  ctx.restore();
}
