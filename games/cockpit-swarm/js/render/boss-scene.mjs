import { CX, W, H, HORIZON_Y, RETICLE_Y, BOSS_TUNING, ARBITER_TUNING, ECLIPSIS_TUNING, LANES } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getBossLayout, getHandProjection, getArbiterLayout, getEclipsisLayout } from "../systems/boss.mjs";
import {
  phaseUsesArms, phaseUsesLaser, bossPhaseMax,
  phaseUsesVolley, phaseUsesCannons, phaseUsesArbiterLaser
} from "../entities/boss.mjs";

const BOSS_NAME = "DREADMAW";
const TAU = Math.PI * 2;

// ECLIPSIS color palette — one entry per phase (1–5)
const ECLIPSIS_EYE = ["#34d8ff", "#ffb347", "#ff6632", "#a020f0", "#ffffff"];
const ECLIPSIS_EYE_RGB = ["52,216,255", "255,179,71", "255,102,50", "160,32,240", "255,255,255"];
const ECLIPSIS_WEAK = "#b6ff3a";

// Match the game's neon-ship language: saturated fill + glow + light outline + dark core.
const OUTLINE = "#b9fbff";
const BODY = "#ff2e5e";
const BODY_DARK = "#7a0f30";
const PHASE_EYE = ["#34f7ff", "#ffb347", "#ff5cf0"];
const WEAK = "#b6ff3a";

// Where a world lane meets the player plane (hand-impact depth) on screen.
function lanePlanePoint(laneX, playerX) {
  return project(laneX, 55, BOSS_TUNING.armImpactZ, playerX);
}

// ─── Main boss render ─────────────────────────────────────────────────────────

export function renderBoss(ctx, game, t) {
  const boss = game.boss;
  if (!boss) return;

  if (boss.number === 3) {
    renderEclipsis(ctx, game, t);
    return;
  }

  if (boss.number === 2) {
    renderArbiter(ctx, game, t);
    return;
  }

  const layout = getBossLayout(game);
  const eye = PHASE_EYE[clamp(boss.phase - 1, 0, 2)];

  drawBody(ctx, boss, layout, eye, t);
  drawMouth(ctx, boss, layout, t);

  // Arms always render in front of the body — at rest they flank the boss
  // (visible), and they reach toward the player when they lunge.
  if (phaseUsesArms(boss.phase) && boss.sub !== "defeat") {
    for (const arm of boss.arms) drawArm(ctx, game, arm, layout, t);
  }

  // Laser is drawn last (over everything) so the beam reads as the active threat.
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

  // Glowing neon silhouette
  ctx.shadowColor = hit ? "#ffffff" : BODY;
  ctx.shadowBlur = hit ? 44 : 30;

  const fill = ctx.createLinearGradient(0, -halfH, 0, halfH * 1.2);
  fill.addColorStop(0, hit ? "#ffb6c6" : "#ff5577");
  fill.addColorStop(0.6, BODY);
  fill.addColorStop(1, BODY_DARK);
  ctx.fillStyle = fill;
  bossHullPath(ctx, halfW, halfH);
  ctx.fill();

  // Light outline like the enemy ships
  ctx.shadowBlur = hit ? 20 : 10;
  ctx.shadowColor = OUTLINE;
  ctx.strokeStyle = hit ? "#ffffff" : OUTLINE;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  bossHullPath(ctx, halfW, halfH);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Dark interior plating
  ctx.strokeStyle = "rgba(10, 2, 12, 0.55)";
  ctx.lineWidth = halfH * 0.10;
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.66, -halfH * 0.18);
  ctx.lineTo(-halfW * 0.22, -halfH * 0.40);
  ctx.lineTo(halfW * 0.22, -halfH * 0.40);
  ctx.lineTo(halfW * 0.66, -halfH * 0.18);
  ctx.stroke();

  ctx.strokeStyle = "rgba(10, 2, 12, 0.4)";
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * halfW * 0.5, halfH * 0.2);
    ctx.lineTo(s * halfW * 0.86, halfH * 0.0);
    ctx.stroke();
  }

  // Eyes — glowing cores under the brow
  const pulse = 0.6 + Math.sin(t * 0.006) * 0.4;
  for (const s of [-1, 1]) {
    const ex = s * halfW * 0.44;
    const ey = -halfH * 0.12;
    const er = halfH * 0.2;

    ctx.shadowColor = eye;
    ctx.shadowBlur = 18 + pulse * 14;
    const eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, er);
    eg.addColorStop(0, "#ffffff");
    eg.addColorStop(0.45, eye);
    eg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 1.1, er * 0.78, s * 0.25, 0, TAU);
    ctx.fill();

    // Slit pupil
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0410";
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 0.2, er * 0.62, s * 0.25, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

// Angular horned skull — crisp lineTo edges to match the enemy ship shapes.
function bossHullPath(ctx, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(0, -1.18 * hh);
  ctx.lineTo(-0.34 * hw, -1.04 * hh);
  ctx.lineTo(-0.74 * hw, -1.30 * hh); // left horn
  ctx.lineTo(-0.52 * hw, -0.74 * hh);
  ctx.lineTo(-1.00 * hw, -0.46 * hh); // cheek
  ctx.lineTo(-0.92 * hw, 0.08 * hh);
  ctx.lineTo(-0.60 * hw, 0.52 * hh);
  ctx.lineTo(-0.40 * hw, 0.96 * hh); // jaw
  ctx.lineTo(0, 1.12 * hh);          // chin
  ctx.lineTo(0.40 * hw, 0.96 * hh);
  ctx.lineTo(0.60 * hw, 0.52 * hh);
  ctx.lineTo(0.92 * hw, 0.08 * hh);
  ctx.lineTo(1.00 * hw, -0.46 * hh);
  ctx.lineTo(0.52 * hw, -0.74 * hh);
  ctx.lineTo(0.74 * hw, -1.30 * hh); // right horn
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

  // Maw interior
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

  // Neon fangs (bright with glow, like the ships' outlines)
  ctx.fillStyle = "#eafcff";
  ctx.shadowColor = OUTLINE;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "rgba(40, 80, 100, 0.5)";
  ctx.lineWidth = 1;
  const teeth = 9;
  for (let i = 0; i < teeth; i++) {
    const fx = mouthX - mouthW + (i + 0.5) * (mouthW * 2 / teeth);
    const tw = (mouthW * 2 / teeth) * 0.4;
    const upLen = 13 + (i % 2) * 6;
    const loLen = 13 + ((i + 1) % 2) * 6;
    // upper
    ctx.beginPath();
    ctx.moveTo(fx - tw, mouthY - gape * 0.94);
    ctx.lineTo(fx + tw, mouthY - gape * 0.94);
    ctx.lineTo(fx, mouthY - gape * 0.94 + upLen);
    ctx.closePath();
    ctx.fill();
    // lower
    ctx.beginPath();
    ctx.moveTo(fx - tw, mouthY + gape * 0.94);
    ctx.lineTo(fx + tw, mouthY + gape * 0.94);
    ctx.lineTo(fx, mouthY + gape * 0.94 - loLen);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Charge core building in the throat
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

  // Exposed weak-point reticle when vulnerable — "shoot here"
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

// ─── Laser: charge sight + volumetric beam ────────────────────────────────────

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

// A tapered quad from a narrow source to a wide impact — gives the beam depth.
function beamQuad(ctx, ox, oy, tx, ty, w0, w1) {
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

function renderChargeSight(ctx, ox, oy, target, t, locked) {
  const col = locked ? "#ff5a3c" : "#ffc24a";
  ctx.save();

  // Thin tracking cone preview
  ctx.globalAlpha = locked ? 0.55 : 0.32;
  ctx.shadowColor = col;
  ctx.shadowBlur = locked ? 16 : 8;
  ctx.fillStyle = col;
  beamQuad(ctx, ox, oy, target.x, target.y, locked ? 5 : 3, locked ? 18 : 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Targeting reticle at the impact lane
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

  // Locked: collapsing inner ring as the imminent-fire cue
  if (locked) {
    ctx.beginPath();
    ctx.arc(0, 0, 6 + pulse * 12, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

function renderBeam(ctx, ox, oy, tx, ty, fireTimer, t) {
  const grow = clamp(fireTimer / 110, 0, 1);
  const wOuter = lerp(10, 64, grow);
  const wCore = lerp(4, 30, grow);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Outer glow cone
  ctx.shadowColor = "#ff3a2e";
  ctx.shadowBlur = 44;
  ctx.fillStyle = "rgba(255, 70, 50, 0.42)";
  beamQuad(ctx, ox, oy, tx, ty, wOuter * 0.5, wOuter);
  ctx.fill();

  // Mid heat
  ctx.shadowBlur = 24;
  ctx.fillStyle = "rgba(255, 150, 90, 0.7)";
  beamQuad(ctx, ox, oy, tx, ty, wCore * 0.7, wCore * 1.5);
  ctx.fill();

  // White-hot core
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fff3ec";
  beamQuad(ctx, ox, oy, tx, ty, wCore * 0.4, wCore);
  ctx.fill();

  // Scrolling energy nodes travelling down the beam
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

  // Muzzle flash at the mouth
  const mg = ctx.createRadialGradient(ox, oy, 1, ox, oy, wOuter * 1.4);
  mg.addColorStop(0, "rgba(255,255,255,0.9)");
  mg.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(ox, oy, wOuter * 1.4, 0, TAU);
  ctx.fill();

  // Impact flare on the player plane
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

// ─── Arms + hands + weak spots ────────────────────────────────────────────────

function drawArm(ctx, game, arm, layout, t) {
  const px = game.player.x;
  const shoulder = arm.side < 0 ? layout.shoulderL : layout.shoulderR;
  const rest = restHand(layout, arm.side);
  const telegraphing = arm.state === "telegraph";

  // CRITICAL: during the lunge the hand uses the world projection (same as enemies),
  // so its screen x reflects (laneX - player.x). When you line the weak spot up under
  // your reticle (screen centre), you are aligned to hit it. Rest pose is only used
  // while idle/telegraphing, and is blended in/out at the lunge edges to avoid pops —
  // the blend always finishes well before the weak spot becomes shootable.
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

  // Telegraph: blinking danger reticle on the committed lane
  if (telegraphing) {
    const mark = lanePlanePoint(arm.laneX, px);
    const on = Math.sin(t * 0.03) > 0;
    drawDangerReticle(ctx, mark.x, mark.y, on ? 0.85 : 0.3, t);
  }

  // Aligned = exposed AND within the shot window — drives the "fire now" cue.
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

// Resting hand position — flanks the boss, slightly below the shoulders.
function restHand(layout, side) {
  const sh = side < 0 ? layout.shoulderL : layout.shoulderR;
  return { x: sh.x + side * layout.halfW * 0.16, y: sh.y + layout.halfH * 0.92 };
}

// Smooth tapered limb along a gently bowed spine — fills + neon outline.
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

// Three-talon pincer that opens toward the player.
function drawClaw(ctx, x, y, size, side) {
  ctx.save();
  ctx.shadowColor = BODY;
  ctx.shadowBlur = 16;
  const grad = ctx.createRadialGradient(x, y - size * 0.2, 2, x, y, size * 0.9);
  grad.addColorStop(0, "#ff5577");
  grad.addColorStop(1, BODY_DARK);
  ctx.fillStyle = grad;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = clamp(size * 0.05, 2, 4.5);
  ctx.lineJoin = "round";

  // Palm wedge
  ctx.beginPath();
  ctx.moveTo(x - size * 0.46, y - size * 0.34);
  ctx.quadraticCurveTo(x, y - size * 0.52, x + size * 0.46, y - size * 0.34);
  ctx.lineTo(x + size * 0.3, y + size * 0.22);
  ctx.quadraticCurveTo(x, y + size * 0.34, x - size * 0.3, y + size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Talons curving toward the player
  for (const k of [-1, 0, 1]) {
    const bx = x + k * size * 0.32;
    ctx.beginPath();
    ctx.moveTo(bx - size * 0.1, y + size * 0.16);
    ctx.quadraticCurveTo(bx + k * size * 0.2, y + size * 0.72, bx + k * size * 0.3 + side * size * 0.04, y + size * 1.2);
    ctx.quadraticCurveTo(bx + k * size * 0.02, y + size * 0.64, bx + size * 0.1, y + size * 0.16);
    ctx.closePath();
    ctx.fill();
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

    // Glowing core
    const g = ctx.createRadialGradient(x, y, 1, x, y, r * pulse);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, flash ? "#ffffff" : WEAK);
    g.addColorStop(1, "rgba(120, 200, 40, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, TAU);
    ctx.fill();

    // Inner bullseye so the exact aim point is unambiguous
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
      // "Locked on — fire now": bright white reticle + ticks + chevrons
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
    // Armored plate — clearly not a target
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

// ─── Boss HUD (health bar + banners) ──────────────────────────────────────────

export function renderBossHud(ctx, game, t) {
  const boss = game.boss;
  if (!boss) return;

  const barW = 620;
  const barH = 18;
  const barX = CX - barW * 0.5;
  const barY = 30;
  const gap = 5;
  const phaseCount = boss.hp.length;
  const segW = (barW - gap * (phaseCount - 1)) / phaseCount;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const displayName = boss.number === 3 ? "ECLIPSIS" : (boss.number === 2 ? "THE ARBITER" : BOSS_NAME);
  const nameColor   = boss.number === 3 ? "#d8c0ff" : (boss.number === 2 ? "#b0f0ff" : "#ffd0d8");
  const nameGlow    = boss.number === 3 ? "#8020c0" : (boss.number === 2 ? "#3af5ff" : "#ff365d");
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillStyle = nameColor;
  ctx.shadowColor = nameGlow;
  ctx.shadowBlur = 10;
  ctx.fillText(displayName, CX, barY - 6);
  ctx.shadowBlur = 0;

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = boss.number === 3 ? "rgba(200, 160, 255, 0.7)" : "rgba(255, 160, 180, 0.7)";
  ctx.fillText(`PHASE ${boss.phase} / ${phaseCount}`, CX + barW * 0.5 - 46, barY - 8);

  const palette = boss.number === 3 ? ECLIPSIS_EYE : PHASE_EYE;
  for (let i = 0; i < phaseCount; i++) {
    const sx = barX + i * (segW + gap);
    const max = bossPhaseMax(boss, i + 1);
    const frac = clamp(boss.hp[i] / max, 0, 1);
    const isCurrent = i === boss.phase - 1;

    ctx.fillStyle = "rgba(8, 6, 12, 0.8)";
    ctx.beginPath();
    ctx.roundRect(sx, barY, segW, barH, 4);
    ctx.fill();

    const fillColor = i < boss.phase - 1 ? "rgba(80,40,50,0.5)" : (palette[i] ?? palette[palette.length - 1]);
    ctx.fillStyle = fillColor;
    if (isCurrent) {
      ctx.shadowColor = fillColor;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.roundRect(sx, barY, segW * frac, barH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = isCurrent ? "rgba(255,255,255,0.55)" : "rgba(120, 240, 255, 0.25)";
    ctx.lineWidth = isCurrent ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(sx, barY, segW, barH, 4);
    ctx.stroke();
  }

  ctx.restore();

  if (boss.sub === "intro") {
    renderBanner(ctx, "⚠  WARNING  ⚠", "BOSS APPROACHING", "#ff365d", t);
  } else if (boss.sub === "transition") {
    renderBanner(ctx, `PHASE ${boss.phase + 1}`, "", "#ffb347", t);
  } else if (boss.sub === "defeat") {
    renderBanner(ctx, "TARGET DESTROYED", "", "#78ff9d", t);
  }
}

// ─── Boss 03: ECLIPSIS render ─────────────────────────────────────────────────

function renderEclipsis(ctx, game, t) {
  const boss = game.boss;
  const layout = getEclipsisLayout(game);
  const crack = boss.shellCrack;
  const eyeColor = ECLIPSIS_EYE[boss.phase - 1];
  const isImmune = boss.reflect?.state === "immune";
  const bodyDim = isImmune ? 0.28 : 1.0;

  const shellAlpha   = Math.max(0, 1 - crack * 1.3) * bodyDim;
  const organicAlpha = Math.min(1, crack * 1.6) * bodyDim;
  const tendrilAlpha = Math.min(1, Math.max(0, (crack - 0.35) * 3.0)) * bodyDim;

  if (shellAlpha > 0.02)   drawEclipsisShell(ctx, boss, layout, shellAlpha, t);
  if (organicAlpha > 0.02) drawEclipsisOrganicBody(ctx, boss, layout, organicAlpha, t);
  if (tendrilAlpha > 0.02) drawEclipsisTendrils(ctx, boss, layout, tendrilAlpha, t);

  drawEclipsisEye(ctx, boss, layout, eyeColor, isImmune, t);

  if (boss.sub === "fighting") {
    renderEclipsisBeamVisual(ctx, game, boss, layout, t);
    renderEclipsisTetherProjectile(ctx, game, boss, t);
    renderEclipsisZoneVisual(ctx, game, boss, t);
  }
}

// Pointed, angular crystalline hull — architectural feel
function eclipsisHullPath(ctx, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(0, -hh * 1.2);
  ctx.lineTo(-hw * 0.26, -hh * 0.88);
  ctx.lineTo(-hw * 0.70, -hh * 1.06);  // left spike
  ctx.lineTo(-hw * 0.58, -hh * 0.54);
  ctx.lineTo(-hw * 1.02, -hh * 0.08);
  ctx.lineTo(-hw * 1.00,  hh * 0.32);
  ctx.lineTo(-hw * 0.70,  hh * 0.72);
  ctx.lineTo(-hw * 0.30,  hh * 1.00);
  ctx.lineTo(0,            hh * 1.10);
  ctx.lineTo( hw * 0.30,  hh * 1.00);
  ctx.lineTo( hw * 0.70,  hh * 0.72);
  ctx.lineTo( hw * 1.00,  hh * 0.32);
  ctx.lineTo( hw * 1.02, -hh * 0.08);
  ctx.lineTo( hw * 0.58, -hh * 0.54);
  ctx.lineTo( hw * 0.70, -hh * 1.06);  // right spike
  ctx.lineTo( hw * 0.26, -hh * 0.88);
  ctx.closePath();
}

function drawEclipsisShell(ctx, boss, layout, alpha, t) {
  const { cx, cy, halfW: hw, halfH: hh } = layout;
  const hit = boss.hitFlashBody > 0 || boss.panelFlash > 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  ctx.shadowColor = hit ? "#ffffff" : "#4466ff";
  ctx.shadowBlur  = hit ? 36 : 20;

  const fill = ctx.createLinearGradient(0, -hh * 1.2, 0, hh * 1.2);
  fill.addColorStop(0,   hit ? "#3040aa" : "#1a2066");
  fill.addColorStop(0.5, hit ? "#1a2888" : "#0d1244");
  fill.addColorStop(1,   "#070a1a");
  ctx.fillStyle = fill;
  eclipsisHullPath(ctx, hw, hh);
  ctx.fill();

  ctx.strokeStyle = hit ? "#aabbff" : "#4a74ff";
  ctx.lineWidth = 3;
  ctx.shadowBlur = hit ? 16 : 8;
  eclipsisHullPath(ctx, hw, hh);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Interior panel seam lines
  ctx.strokeStyle = "rgba(100,130,255,0.32)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-hw * 0.72, -hh * 0.92); ctx.lineTo(-hw * 0.28, -hh * 0.18); ctx.lineTo( hw * 0.28, -hh * 0.18); ctx.lineTo( hw * 0.72, -hh * 0.92); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-hw * 0.92,  hh * 0.02); ctx.lineTo(-hw * 0.48,  hh * 0.52); ctx.lineTo( hw * 0.48,  hh * 0.52); ctx.lineTo( hw * 0.92,  hh * 0.02); ctx.stroke();

  // Iridescent sheen highlights
  ctx.strokeStyle = "rgba(160,200,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-hw * 0.28, -hh * 1.15); ctx.lineTo(-hw * 0.72, -hh * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( hw * 0.38, -hh * 0.92); ctx.lineTo( hw * 0.82,  hh * 0.18); ctx.stroke();

  // Crack lines that grow as the shell breaks
  if (boss.shellCrack > 0.05) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, boss.shellCrack * 1.5);
    ctx.strokeStyle = "#c8d8ff";
    ctx.shadowColor = "#8aabff";
    ctx.shadowBlur  = 6;
    ctx.lineWidth   = 1.2;
    for (const [x1, y1, x2, y2] of [
      [-hw * 0.34, -hh * 0.88,  hw * 0.14,  hh * 0.22],
      [ hw * 0.46, -hh * 0.62, -hw * 0.08,  hh * 0.54],
      [-hw * 0.20,  hh * 0.30,  hw * 0.54, -hh * 0.26]
    ]) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawEclipsisOrganicBody(ctx, boss, layout, alpha, t) {
  const { cx, cy, halfW: hw, halfH: hh } = layout;
  const hit = boss.hitFlashBody > 0;
  const pulse = 0.5 + Math.sin(t * 0.005) * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);

  ctx.shadowColor = hit ? "#ffffff" : "#a030c0";
  ctx.shadowBlur  = hit ? 36 : 22;

  const fill = ctx.createRadialGradient(0, 0, hh * 0.2, 0, 0, hw);
  fill.addColorStop(0,   hit ? "#4a1060" : "#2a0a3a");
  fill.addColorStop(0.6, hit ? "#3a0844" : "#180624");
  fill.addColorStop(1,   "#060310");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 0, hw * 0.86, hh * 0.90, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Glowing circuit veins
  const veinCol = boss.phase >= 4 ? "#c060ff" : "#9040c0";
  ctx.strokeStyle = veinCol;
  ctx.shadowColor = veinCol;
  ctx.shadowBlur  = 8 + pulse * 8;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = alpha * (0.4 + pulse * 0.45);
  for (const pts of [
    [[-hw * 0.58, -hh * 0.28], [-hw * 0.18,  hh * 0.10], [ hw * 0.28,  hh * 0.38]],
    [[ hw * 0.48, -hh * 0.48], [ hw * 0.08, -hh * 0.08], [-hw * 0.28,  hh * 0.28]],
    [[-hw * 0.08, -hh * 0.58], [ hw * 0.22, -hh * 0.18], [ hw * 0.48,  hh * 0.12]],
    [[ hw * 0.02,  hh * 0.48], [-hw * 0.28,  hh * 0.10], [-hw * 0.48, -hh * 0.28]]
  ]) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  // Hard exoskeleton plating
  ctx.globalAlpha = alpha;
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#1a1030";
  ctx.strokeStyle = "#6040a0";
  ctx.lineWidth   = 2;
  for (const [px, py, pw, ph, ang] of [
    [-hw * 0.38, -hh * 0.52, hw * 0.26, hh * 0.13, -0.3],
    [ hw * 0.30, -hh * 0.48, hw * 0.24, hh * 0.12,  0.25],
    [-hw * 0.48,  hh * 0.12, hw * 0.22, hh * 0.12,  0.15],
    [ hw * 0.38,  hh * 0.20, hw * 0.20, hh * 0.11, -0.2]
  ]) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawEclipsisTendrils(ctx, boss, layout, alpha, t) {
  const { cx, cy, halfW: hw, halfH: hh } = layout;
  const wave = Math.sin(t * 0.002);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.strokeStyle = "#7828a0";
  ctx.shadowColor = "#c050f0";
  ctx.shadowBlur  = 14;
  ctx.lineWidth   = 7;
  ctx.lineCap     = "round";

  for (const [sx, sy, ex, ey, cpx, cpy] of [
    [-hw * 0.68,  hh * 0.40, -hw * 1.38,  hh * 1.08, -hw * 0.92,  hh * 0.60 + wave * 22],
    [ hw * 0.68,  hh * 0.40,  hw * 1.38,  hh * 1.08,  hw * 0.92,  hh * 0.60 - wave * 22],
    [-hw * 0.48, -hh * 0.78, -hw * 1.08, -hh * 1.48, -hw * 0.88, -hh * 1.02 + wave * 16],
    [ hw * 0.48, -hh * 0.78,  hw * 1.08, -hh * 1.48,  hw * 0.88, -hh * 1.02 - wave * 16]
  ]) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();

    const gTip = ctx.createRadialGradient(ex, ey, 1, ex, ey, 13);
    gTip.addColorStop(0, "#f080ff");
    gTip.addColorStop(1, "rgba(160,0,240,0)");
    ctx.fillStyle = gTip;
    ctx.shadowColor = "#f080ff";
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(ex, ey, 13, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawEclipsisEye(ctx, boss, layout, eyeColor, isImmune, t) {
  const { eyeX, eyeY, halfH: hh } = layout;
  const displayColor = isImmune ? "#ff2040" : eyeColor;
  const pulse = 0.6 + Math.sin(t * 0.007) * 0.4;
  const isExposed = boss.eyeExposed || boss.panelExposed;
  const flash = boss.eyeFlash > 0 || boss.panelFlash > 0;

  const rx = hh * 0.38;
  const ry = hh * 0.27;

  ctx.save();
  ctx.translate(eyeX, eyeY);

  // Outer ambient glow
  ctx.shadowColor = flash ? "#ffffff" : displayColor;
  ctx.shadowBlur  = 22 + pulse * 18;
  const outerG = ctx.createRadialGradient(0, 0, rx * 0.5, 0, 0, rx * 1.7);
  outerG.addColorStop(0, "rgba(0,0,0,0)");
  outerG.addColorStop(0.6, `rgba(${ECLIPSIS_EYE_RGB[boss.phase - 1]}, 0.12)`);
  outerG.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = outerG;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.7, ry * 1.7, 0, 0, TAU);
  ctx.fill();

  // Sclera
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#0a0414";
  ctx.strokeStyle = flash ? "#ffffff" : displayColor;
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Iris
  ctx.shadowColor = flash ? "#ffffff" : displayColor;
  ctx.shadowBlur  = 20 + pulse * 20;
  const irisG = ctx.createRadialGradient(0, 0, 2, 0, 0, rx * 0.76);
  irisG.addColorStop(0,    "#ffffff");
  irisG.addColorStop(0.25, flash ? "#ffffff" : displayColor);
  irisG.addColorStop(0.78, `rgba(${ECLIPSIS_EYE_RGB[boss.phase - 1]}, 0.6)`);
  irisG.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = irisG;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.78, ry * 0.78, 0, 0, TAU);
  ctx.fill();

  // Slit pupil
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#000000";
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.11, ry * 0.70, 0, 0, TAU);
  ctx.fill();

  // Exposed weak-spot ring
  if (isExposed) {
    const ws = flash ? "#ffffff" : ECLIPSIS_WEAK;
    ctx.strokeStyle = ws;
    ctx.shadowColor = ws;
    ctx.shadowBlur  = 14;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.22 + Math.sin(t * 0.012) * 4, ry * 1.22 + Math.sin(t * 0.012) * 3, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = ws;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function renderEclipsisBeamVisual(ctx, game, boss, layout, t) {
  const beam = boss.beam;
  if (beam.state === "idle" || beam.state === "cooldown") return;

  const px = game.player.x;
  const phase = boss.phase;
  const colorRGB = ECLIPSIS_EYE_RGB[phase - 1];

  if (beam.state === "charging") {
    // Edge glow on the side the beam will come from
    const fromLeft = beam.dir > 0;
    const pulse = 0.3 + 0.5 * Math.sin(t * 0.018);
    ctx.save();
    const gx0 = fromLeft ? 0 : W;
    const gx1 = fromLeft ? W * 0.45 : W * 0.55;
    const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
    g.addColorStop(0, `rgba(${colorRGB},${pulse * 0.28})`);
    g.addColorStop(1, `rgba(${colorRGB},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(fromLeft ? 0 : W * 0.55, HORIZON_Y, W * 0.45, H - HORIZON_Y);
    ctx.restore();
    return;
  }

  if (beam.state === "sweeping") {
    const bossProj = project(LANES[beam.laneIndex], ECLIPSIS_TUNING.bodyY, ECLIPSIS_TUNING.bodyZ, px);
    const nearProj = project(LANES[beam.laneIndex], 0, 0.22, px);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Tapered trapezoid from boss to player plane
    ctx.beginPath();
    ctx.moveTo(bossProj.x - 14, bossProj.y);
    ctx.lineTo(bossProj.x + 14, bossProj.y);
    ctx.lineTo(nearProj.x + 88, nearProj.y);
    ctx.lineTo(nearProj.x - 88, nearProj.y);
    ctx.closePath();

    const gBeam = ctx.createLinearGradient(bossProj.x, bossProj.y, nearProj.x, nearProj.y);
    gBeam.addColorStop(0,   `rgba(${colorRGB},0.04)`);
    gBeam.addColorStop(0.4, `rgba(${colorRGB},0.28)`);
    gBeam.addColorStop(1,   `rgba(${colorRGB},0.72)`);
    ctx.fillStyle = gBeam;
    ctx.shadowColor = `rgb(${colorRGB})`;
    ctx.shadowBlur  = 40;
    ctx.fill();

    ctx.restore();
  }
}

function renderEclipsisTetherProjectile(ctx, game, boss, t) {
  const tether = boss.tether;
  if (tether.state !== "traveling" && tether.state !== "telegraphing") return;

  const px = game.player.x;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.02);

  // Target lane indicator — visible as soon as telegraph starts
  const targetPt = project(LANES[tether.targetLaneIndex], 0, 0.25, px);
  ctx.save();
  ctx.strokeStyle = "#60d8ff";
  ctx.shadowColor = "#60d8ff";
  ctx.shadowBlur  = 8 + pulse * 8;
  ctx.lineWidth   = 2;
  ctx.setLineDash([8, 6]);
  ctx.globalAlpha = 0.55 + pulse * 0.35;
  ctx.beginPath();
  ctx.arc(targetPt.x, RETICLE_Y, 30 - pulse * 4, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (!tether.active) return;  // still telegraphing, no projectile yet

  const pt = project(tether.worldX, 0, tether.z, px);
  const r  = 16 * clamp(pt.s, 0.1, 2.0);

  ctx.save();
  ctx.shadowColor = "#60d8ff";
  ctx.shadowBlur  = 18;
  const g = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, r * 1.4);
  g.addColorStop(0,   "#ffffff");
  g.addColorStop(0.4, "#60d8ff");
  g.addColorStop(1,   "rgba(50,200,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r * (1 + pulse * 0.18), 0, TAU);
  ctx.fill();
  ctx.restore();
}

function renderEclipsisZoneVisual(ctx, game, boss, t) {
  const zone = boss.zone;
  const px   = game.player.x;

  if (zone.state === "charging") {
    const progress = 1 - zone.timer / ECLIPSIS_TUNING.zoneChargeTelegraphMs;
    for (let li = zone.startLane; li <= zone.startLane + 2; li++) {
      const pt = project(LANES[li], 55, 0.72, px);
      ctx.save();
      ctx.globalAlpha = 0.30 + progress * 0.65;
      ctx.fillStyle   = `rgba(255,80,20,${0.06 + progress * 0.18})`;
      ctx.strokeStyle = "#ff4420";
      ctx.shadowColor = "#ff4420";
      ctx.shadowBlur  = 8 + progress * 18;
      ctx.lineWidth   = 2;
      drawDiamond(ctx, pt.x, pt.y, 18 + progress * 11);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  if (zone.active) {
    const pt = project(zone.worldX, 0, zone.z, px);
    const r  = 24 * clamp(pt.s, 0.1, 2.5);
    ctx.save();
    ctx.shadowColor = "#ff5020";
    ctx.shadowBlur  = 22;
    const g = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, r);
    g.addColorStop(0,   "#ffffff");
    g.addColorStop(0.3, "#ff8040");
    g.addColorStop(1,   "rgba(255,60,20,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (zone.state === "aftermath" && zone.timer > ECLIPSIS_TUNING.zoneAftermathMs * 0.35) {
    const fadeAlpha = (zone.timer / ECLIPSIS_TUNING.zoneAftermathMs) * 0.55;
    for (let li = zone.startLane; li <= zone.startLane + 2; li++) {
      const nearPt = project(LANES[li], 0, 0.22, px);
      ctx.save();
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle   = "rgba(255,80,20,0.38)";
      ctx.shadowColor = "#ff4420";
      ctx.shadowBlur  = 20;
      ctx.fillRect(nearPt.x - 82, HORIZON_Y, 164, H - HORIZON_Y);
      ctx.restore();
    }
  }
}

// ─── Boss 02: Arbiter render ──────────────────────────────────────────────────

const ARB_BODY    = "#0d1a2c";
const ARB_MID     = "#182d46";
const ARB_OUTLINE = "#3af5ff";
const ARB_ACCENT  = "#1a6aff";

function renderArbiter(ctx, game, t) {
  const boss = game.boss;
  const layout = getArbiterLayout(game);

  drawArbiterBody(ctx, boss, layout, t);
  drawArbiterCannons(ctx, boss, layout, t);

  if (boss.sub === "fighting") {
    // Phase 2 uses full-height column fills; phases 1 and 3 use diamond telegraph.
    if (boss.phase === 2) {
      drawCannonColumnFills(ctx, game, layout, t);
    } else if (phaseUsesVolley(boss)) {
      drawVolleyTelegraph(ctx, game, layout, t);
    }

    // Open (punish) window — phase 2 shows a large bullseye; other phases show standard core.
    if (phaseUsesVolley(boss) && boss.volley.state === "open") {
      if (boss.phase === 2) {
        drawArbiterPunishTarget(ctx, boss, layout, t);
      } else {
        drawArbiterCore(ctx, boss, layout, t);
        if (boss.phase === 1) drawArbiterWingCores(ctx, game, layout, t);
      }
    }

    if (phaseUsesArbiterLaser(boss)) renderArbiterLaser(ctx, game, layout, t);
    if (phaseUsesArbiterLaser(boss) && boss.arbiterLaser.exposed) drawArbiterLaserEmitter(ctx, boss, layout, t);
  }
}

function drawArbiterBody(ctx, boss, layout, t) {
  const { cx, cy, halfW: hw, halfH: hh } = layout;
  const hit = boss.hitFlashBody > 0;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.shadowColor = hit ? "#ffffff" : ARB_OUTLINE;
  ctx.shadowBlur = hit ? 40 : 22;

  const fill = ctx.createLinearGradient(0, -hh, 0, hh * 1.1);
  fill.addColorStop(0, hit ? "#3a6080" : ARB_MID);
  fill.addColorStop(0.5, hit ? "#1a3550" : ARB_BODY);
  fill.addColorStop(1, "#070e18");
  ctx.fillStyle = fill;
  arbiterHullPath(ctx, hw, hh);
  ctx.fill();

  ctx.shadowBlur = hit ? 14 : 7;
  ctx.shadowColor = hit ? "#ffffff" : ARB_OUTLINE;
  ctx.strokeStyle = hit ? "#ffffff" : ARB_OUTLINE;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  arbiterHullPath(ctx, hw, hh);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Armor panel lines
  ctx.strokeStyle = "rgba(50,150,180,0.28)";
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.18, -hh * 0.7);
    ctx.lineTo(s * hw * 0.55, hh * 0.0);
    ctx.lineTo(s * hw * 0.72, hh * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.42, -hh * 0.12);
    ctx.lineTo(s * hw * 0.85, hh * 0.28);
    ctx.stroke();
  }

  // Central reactor pod — pulses brighter each phase
  const reactorColor = PHASE_EYE[clamp(boss.phase - 1, 0, 2)];
  const pulse = 0.55 + Math.sin(t * 0.007) * 0.45;
  const rr = 18 + boss.eyeHeat * 10 + pulse * 8;
  ctx.shadowColor = reactorColor;
  ctx.shadowBlur = 18 + pulse * 20;
  const rg = ctx.createRadialGradient(0, hh * 0.08, 1, 0, hh * 0.08, rr);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.4, reactorColor);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(0, hh * 0.08, rr, 0, TAU);
  ctx.fill();

  // Sensor visor — a horizontal slit across the upper hull
  ctx.shadowBlur = 0;
  ctx.strokeStyle = ARB_OUTLINE;
  ctx.lineWidth = 3;
  ctx.shadowColor = ARB_OUTLINE;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.36, -hh * 0.46);
  ctx.lineTo(hw * 0.36, -hh * 0.46);
  ctx.stroke();
  // Visor glow dots
  for (const s of [-1, -0.5, 0, 0.5, 1]) {
    ctx.fillStyle = ARB_OUTLINE;
    ctx.beginPath();
    ctx.arc(s * hw * 0.28, -hh * 0.46, 3, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function arbiterHullPath(ctx, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(0, -hh * 0.92);
  ctx.lineTo(hw * 0.22, -hh * 0.52);
  ctx.lineTo(hw * 0.98, -hh * 0.04);
  ctx.lineTo(hw * 0.86, hh * 0.38);
  ctx.lineTo(hw * 0.62, hh * 0.56);
  ctx.lineTo(hw * 0.28, hh * 0.76);
  ctx.lineTo(0, hh * 0.88);
  ctx.lineTo(-hw * 0.28, hh * 0.76);
  ctx.lineTo(-hw * 0.62, hh * 0.56);
  ctx.lineTo(-hw * 0.86, hh * 0.38);
  ctx.lineTo(-hw * 0.98, -hh * 0.04);
  ctx.lineTo(-hw * 0.22, -hh * 0.52);
  ctx.closePath();
}

function drawArbiterCannons(ctx, boss, layout, t) {
  for (const cannon of boss.cannons) {
    drawSingleCannon(ctx, boss, cannon, layout, t);
  }
}

function drawSingleCannon(ctx, boss, cannon, layout, t) {
  const pos = cannon.side < 0 ? layout.cannonL : layout.cannonR;
  const bLen = 68;
  const bHalf = 11;
  const mountX = pos.x;
  const tipX   = pos.x + cannon.side * bLen;
  const barrelLeft  = Math.min(mountX, tipX);
  const barrelTop   = pos.y - bHalf;

  // In phase 2, cannon visuals are driven by the synchronized volley state.
  if (boss.phase === 2) {
    const v = boss.volley;
    const cfg = ARBITER_TUNING.phase2;
    const isCharging = v.state === "charging";
    const isFiring   = v.state === "firing";
    const chargeProgress = isCharging
      ? clamp(1 - v.timer / cfg.chargeMs, 0, 1)
      : (isFiring ? 1 : 0);
    const hot = isCharging || isFiring;

    ctx.save();
    ctx.shadowColor = hot ? "#ff4466" : "rgba(30,80,120,0.5)";
    ctx.shadowBlur  = hot ? 6 + chargeProgress * 20 : 4;
    ctx.fillStyle   = hot ? ARB_MID : "#0a1520";
    ctx.strokeStyle = hot ? "#ff4466" : "rgba(50,120,160,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barrelLeft, barrelTop, bLen, bHalf * 2, 3);
    ctx.fill();
    ctx.stroke();

    // Charge glow at barrel tip
    if (hot) {
      const gr = 5 + chargeProgress * 18;
      const gc = ctx.createRadialGradient(tipX, pos.y, 1, tipX, pos.y, gr);
      gc.addColorStop(0, "#ffffff");
      gc.addColorStop(0.5, "#ff4466");
      gc.addColorStop(1, "rgba(255,40,80,0)");
      ctx.fillStyle = gc;
      ctx.shadowColor = "#ff4466";
      ctx.shadowBlur = 14 + chargeProgress * 14;
      ctx.beginPath();
      ctx.arc(tipX, pos.y, gr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Phases 1 and 3: cannons are structural decoration only (cannon system is inactive).
  ctx.save();
  ctx.shadowColor = "rgba(30,80,120,0.5)";
  ctx.shadowBlur  = 4;
  ctx.fillStyle   = "#0a1520";
  ctx.strokeStyle = "rgba(50,120,160,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(barrelLeft, barrelTop, bLen, bHalf * 2, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawVolleyTelegraph(ctx, game, layout, t) {
  const boss = game.boss;
  const v = boss.volley;
  if (v.state !== "charging" && v.state !== "firing") return;

  const cfg = boss.phase === 3 ? ARBITER_TUNING.phase3 : ARBITER_TUNING.phase1;
  const progress = v.state === "firing"
    ? 1
    : clamp(1 - v.timer / cfg.chargeMs, 0, 1);
  const px = game.player.x;

  for (let i = 0; i < 5; i++) {
    const isSafe = v.safeIndices.includes(i);
    const pt = project(LANES[i], 55, ARBITER_TUNING.volleyDiamondZ, px);

    if (isSafe) {
      ctx.save();
      ctx.globalAlpha = progress * 0.55;
      ctx.strokeStyle = "#44ff88";
      ctx.shadowColor = "#44ff88";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      drawDiamond(ctx, pt.x, pt.y, 20 + progress * 7);
      ctx.stroke();
      ctx.restore();
    } else if (v.state === "firing") {
      // Flash beam from boss to player plane
      const src = project(LANES[i], ARBITER_TUNING.bodyY, ARBITER_TUNING.bodyZ, px);
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = "#ff4466";
      ctx.shadowColor = "#ff2244";
      ctx.shadowBlur = 22;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      const fl = ctx.createRadialGradient(pt.x, pt.y, 1, pt.x, pt.y, 30);
      fl.addColorStop(0, "rgba(255,255,255,0.9)");
      fl.addColorStop(1, "rgba(255,40,60,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 30, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else {
      // Charging danger diamond — brightens as charge builds
      ctx.save();
      ctx.globalAlpha = 0.35 + progress * 0.65;
      ctx.strokeStyle = "#ff2244";
      ctx.shadowColor = "#ff2244";
      ctx.shadowBlur = 8 + progress * 16;
      ctx.lineWidth = v.state === "firing" ? 3 : 2;
      ctx.fillStyle = `rgba(255,34,68,${0.1 + progress * 0.2})`;
      drawDiamond(ctx, pt.x, pt.y, 20 + progress * 12);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.62, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.62, y);
  ctx.closePath();
}

// ─── Phase 2: cannon column fills ─────────────────────────────────────────────
// Full-height perspective columns: red for danger lanes, teal for the safe lane.
// During "firing" the columns pulse and cannon beams sweep down the danger lanes.

function drawCannonColumnFills(ctx, game, layout, t) {
  const boss = game.boss;
  const v = boss.volley;
  if (v.state !== "charging" && v.state !== "firing") return;

  const cfg = ARBITER_TUNING.phase2;
  const progress = v.state === "firing"
    ? 1
    : clamp(1 - v.timer / cfg.chargeMs, 0, 1);
  const px = game.player.x;

  // Column spans from just below the boss body down to the player reticle plane.
  const topZ = 1.52;
  const botZ = 0.78;
  // Half-widths taper with perspective (narrow at top, wide at bottom).
  const topHW = 20;
  const botHW = 58;

  for (let i = 0; i < 5; i++) {
    const isSafe = v.safeIndices.includes(i);
    const laneX = LANES[i];
    const topPt = project(laneX, -90, topZ, px);
    const botPt = project(laneX, 110, botZ, px);

    ctx.save();

    if (isSafe) {
      // Teal safe column — brightens as charge builds, peaks at fire
      const alpha = 0.15 + progress * 0.55;
      ctx.globalAlpha = alpha;
      const grad = ctx.createLinearGradient(0, topPt.y, 0, botPt.y);
      grad.addColorStop(0, "rgba(40,255,210,0)");
      grad.addColorStop(0.35, "rgba(40,255,210,0.55)");
      grad.addColorStop(1, "rgba(40,255,210,0.95)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "#28ffd2";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(topPt.x - topHW, topPt.y);
      ctx.lineTo(topPt.x + topHW, topPt.y);
      ctx.lineTo(botPt.x + botHW, botPt.y);
      ctx.lineTo(botPt.x - botHW, botPt.y);
      ctx.closePath();
      ctx.fill();

      // Landing-pad glow + bracket at the bottom — unmistakable "stand here"
      if (progress > 0.3) {
        ctx.globalAlpha = progress;
        ctx.shadowColor = "#28ffd2";
        ctx.shadowBlur = 28;
        const lg = ctx.createRadialGradient(botPt.x, botPt.y, 1, botPt.x, botPt.y, 52);
        lg.addColorStop(0, "rgba(255,255,255,0.95)");
        lg.addColorStop(0.38, "rgba(40,255,210,0.7)");
        lg.addColorStop(1, "rgba(40,255,210,0)");
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(botPt.x, botPt.y, 52, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = "#28ffd2";
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10;
        const bw = 30, bh = 14;
        ctx.beginPath();
        ctx.moveTo(botPt.x - bw, botPt.y - bh);
        ctx.lineTo(botPt.x - bw, botPt.y + 2);
        ctx.lineTo(botPt.x + bw, botPt.y + 2);
        ctx.lineTo(botPt.x + bw, botPt.y - bh);
        ctx.stroke();
      }
    } else {
      // Red danger column — grows more opaque as charge builds
      const alpha = v.state === "firing" ? 0.72 : 0.15 + progress * 0.5;
      ctx.globalAlpha = alpha;
      const grad = ctx.createLinearGradient(0, topPt.y, 0, botPt.y);
      grad.addColorStop(0, "rgba(255,30,55,0)");
      grad.addColorStop(0.3, "rgba(255,30,55,0.45)");
      grad.addColorStop(1, "rgba(255,30,55,1)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "#ff1e37";
      ctx.shadowBlur = 10 + progress * 12;
      ctx.beginPath();
      ctx.moveTo(topPt.x - topHW, topPt.y);
      ctx.lineTo(topPt.x + topHW, topPt.y);
      ctx.lineTo(botPt.x + botHW, botPt.y);
      ctx.lineTo(botPt.x - botHW, botPt.y);
      ctx.closePath();
      ctx.fill();

      // Pulse edge-lines on either side of danger column during charge
      if (v.state === "charging" && progress > 0.5) {
        ctx.globalAlpha = (progress - 0.5) * 0.9;
        ctx.strokeStyle = "#ff1e37";
        ctx.shadowColor = "#ff1e37";
        ctx.shadowBlur = 14;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(topPt.x - topHW, topPt.y);
        ctx.lineTo(botPt.x - botHW, botPt.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(topPt.x + topHW, topPt.y);
        ctx.lineTo(botPt.x + botHW, botPt.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // When firing: draw cannon beams slashing down each danger column
  if (v.state === "firing") {
    drawCannonBeams(ctx, game, layout, v, px);
  }
}

function drawCannonBeams(ctx, game, layout, v, px) {
  for (let i = 0; i < 5; i++) {
    if (v.safeIndices.includes(i)) continue;
    const laneX = LANES[i];
    // Beam originates from the nearer cannon barrel tip
    const cannon = laneX <= 0 ? layout.cannonL : layout.cannonR;
    const impactPt = project(laneX, 110, 0.78, px);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Outer glow beam
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#ff1e37";
    ctx.shadowColor = "#ff1e37";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cannon.x, cannon.y);
    ctx.lineTo(impactPt.x, impactPt.y);
    ctx.stroke();

    // Bright core beam
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#ffaacc";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cannon.x, cannon.y);
    ctx.lineTo(impactPt.x, impactPt.y);
    ctx.stroke();

    // Impact flare at the player plane
    ctx.globalAlpha = 0.85;
    const fl = ctx.createRadialGradient(impactPt.x, impactPt.y, 1, impactPt.x, impactPt.y, 34);
    fl.addColorStop(0, "rgba(255,255,255,0.95)");
    fl.addColorStop(0.4, "rgba(255,40,70,0.65)");
    fl.addColorStop(1, "rgba(255,30,55,0)");
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.arc(impactPt.x, impactPt.y, 34, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

// ─── Phase 2: large punish-window bullseye ─────────────────────────────────────
// Appears on the Arbiter's reactor core during the volley open window.
// Much larger and more urgent than the phase 1 core glow — impossible to miss.

function drawArbiterPunishTarget(ctx, boss, layout, t) {
  const { coreX, coreY } = layout;
  const pulse = 0.5 + Math.sin(t * 0.022) * 0.5;  // fast pulse = urgency

  ctx.save();

  // Three expanding radar-ping rings
  for (let ring = 0; ring < 3; ring++) {
    const phase = ((ring / 3) + (t * 0.0009)) % 1;
    const r = 18 + phase * 90;
    ctx.globalAlpha = (1 - phase) * 0.65;
    ctx.strokeStyle = WEAK;
    ctx.shadowColor = WEAK;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(coreX, coreY, r, 0, TAU);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Crosshair lines radiating outward from a safe inner radius
  ctx.strokeStyle = WEAK;
  ctx.shadowColor = WEAK;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  const innerR = 24;
  const outerR = 58;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(coreX + Math.cos(a) * innerR, coreY + Math.sin(a) * innerR);
    ctx.lineTo(coreX + Math.cos(a) * outerR, coreY + Math.sin(a) * outerR);
    ctx.stroke();
  }

  // Diagonal tick marks between the crosshair arms
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 8;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4 + 0.125) * TAU;
    ctx.beginPath();
    ctx.moveTo(coreX + Math.cos(a) * (innerR + 8), coreY + Math.sin(a) * (innerR + 8));
    ctx.lineTo(coreX + Math.cos(a) * (innerR + 22), coreY + Math.sin(a) * (innerR + 22));
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Glowing center core
  const r = 24 + pulse * 10;
  ctx.shadowColor = WEAK;
  ctx.shadowBlur = 28 + pulse * 18;
  const g = ctx.createRadialGradient(coreX, coreY, 1, coreX, coreY, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, WEAK);
  g.addColorStop(1, "rgba(100,255,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(coreX, coreY, r, 0, TAU);
  ctx.fill();

  // Bullseye dot
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0e2008";
  ctx.beginPath();
  ctx.arc(coreX, coreY, 9, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawArbiterCore(ctx, boss, layout, t) {
  const { coreX, coreY } = layout;
  const pulse = 0.6 + Math.sin(t * 0.018) * 0.4;
  const r = 26 + pulse * 9;

  ctx.save();
  ctx.shadowColor = WEAK;
  ctx.shadowBlur = 20 + pulse * 18;
  const g = ctx.createRadialGradient(coreX, coreY, 1, coreX, coreY, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, WEAK);
  g.addColorStop(1, "rgba(100,255,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(coreX, coreY, r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#1a3010";
  ctx.beginPath();
  ctx.arc(coreX, coreY, 7, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = WEAK;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(coreX, coreY, r * 1.55, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Phase 1 wing cores — two additional shootable targets at lane ±90 so the player
// doesn't have to scroll all the way to center to deal damage during the open window.
function drawArbiterWingCores(ctx, game, layout, t) {
  const px = game.player.x;
  const pulse = 0.6 + Math.sin(t * 0.018) * 0.4;
  const r = 18 + pulse * 6;

  for (const laneX of [LANES[1], LANES[3]]) {
    const pt = project(laneX, ARBITER_TUNING.bodyY, ARBITER_TUNING.bodyZ, px);
    const wx = pt.x;
    const wy = pt.y + game.boss.bob + layout.halfH * 0.08;

    ctx.save();
    ctx.shadowColor = WEAK;
    ctx.shadowBlur = 16 + pulse * 14;
    const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.4, WEAK);
    g.addColorStop(1, "rgba(100,255,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#1a3010";
    ctx.beginPath();
    ctx.arc(wx, wy, 5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = WEAK;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(wx, wy, r * 1.55, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawArbiterLaserEmitter(ctx, boss, layout, t) {
  const { coreX, coreY } = layout;
  const m = boss.arbiterLaser;
  const flash = m.flash > 0;
  const pulse = 0.6 + Math.sin(t * 0.018) * 0.4;
  const r = 18 + pulse * 7;

  ctx.save();
  ctx.shadowColor = flash ? "#ffffff" : "#ff8a5a";
  ctx.shadowBlur = 22;
  const eg = ctx.createRadialGradient(coreX, coreY, 1, coreX, coreY, r);
  eg.addColorStop(0, flash ? "#ffffff" : "#ff8a5a");
  eg.addColorStop(1, "rgba(255,80,40,0)");
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(coreX, coreY, r, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = flash ? "#ffffff" : WEAK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(coreX, coreY, r * 1.7, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function renderArbiterLaser(ctx, game, layout, t) {
  const m = game.boss.arbiterLaser;
  if (m.state === "closed" || m.state === "vulnerable") return;

  const px = game.player.x;
  const aimX = m.state === "firing" ? m.lockedX : m.targetX;
  const target = lanePlanePoint(aimX, px);
  const ox = layout.coreX;
  const oy = layout.coreY;

  const cfg = ARBITER_TUNING.phase3;
  if (m.state === "charging") {
    renderChargeSight(ctx, ox, oy, target, t, false);
  } else if (m.state === "locked") {
    renderChargeSight(ctx, ox, oy, target, t, true);
  } else if (m.state === "firing") {
    // timer is a countdown; pass elapsed time to renderBeam
    const elapsed = cfg.laserFireMs - m.timer;
    renderBeam(ctx, ox, oy, target.x, target.y, elapsed, t);
  }
}

function renderBanner(ctx, title, sub, color, t) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pulse = 0.6 + Math.sin(t * 0.006) * 0.4;

  ctx.font = "900 56px system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = color;
  ctx.shadowBlur = 20 + pulse * 16;
  ctx.globalAlpha = 0.85 + pulse * 0.15;
  ctx.fillText(title, CX, RETICLE_Y - 36);

  if (sub) {
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.fillText(sub, CX, RETICLE_Y + 8);
  }
  ctx.restore();
}
