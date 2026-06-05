import { CX, W, RETICLE_Y, BOSS_TUNING, ARBITER_TUNING, LANES } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getBossLayout, getHandProjection, getArbiterLayout } from "../systems/boss.mjs";
import {
  phaseUsesArms, phaseUsesLaser, bossPhaseMax,
  phaseUsesVolley, phaseUsesCannons, phaseUsesArbiterLaser
} from "../entities/boss.mjs";

const BOSS_NAME = "DREADMAW";
const TAU = Math.PI * 2;

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
  const gap = 6;
  const segW = (barW - gap * 2) / 3;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const displayName = boss.number === 2 ? "THE ARBITER" : BOSS_NAME;
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillStyle = boss.number === 2 ? "#b0f0ff" : "#ffd0d8";
  ctx.shadowColor = boss.number === 2 ? "#3af5ff" : "#ff365d";
  ctx.shadowBlur = 10;
  ctx.fillText(displayName, CX, barY - 6);
  ctx.shadowBlur = 0;

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 160, 180, 0.7)";
  ctx.fillText(`PHASE ${boss.phase} / 3`, CX + barW * 0.5 - 40, barY - 8);

  for (let i = 0; i < 3; i++) {
    const sx = barX + i * (segW + gap);
    const max = bossPhaseMax(boss, i + 1);
    const frac = clamp(boss.hp[i] / max, 0, 1);
    const isCurrent = i === boss.phase - 1;

    ctx.fillStyle = "rgba(8, 6, 12, 0.8)";
    ctx.beginPath();
    ctx.roundRect(sx, barY, segW, barH, 4);
    ctx.fill();

    const fillColor = i < boss.phase - 1 ? "rgba(80,40,50,0.5)" : PHASE_EYE[i];
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
    if (phaseUsesVolley(boss)) drawVolleyTelegraph(ctx, game, layout, t);
    if (phaseUsesVolley(boss) && boss.volley.state === "open") drawArbiterCore(ctx, boss, layout, t);
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
  // Barrel extends further outward from the mount point
  const mountX = pos.x;
  const tipX   = pos.x + cannon.side * bLen;
  const barrelLeft  = Math.min(mountX, tipX);
  const barrelTop   = pos.y - bHalf;

  const isCharging  = cannon.state === "charging";
  const isFiring    = cannon.state === "firing";
  const isVulnerable = cannon.state === "vulnerable";
  const active      = phaseUsesCannons(boss);
  const chargeProgress = isCharging
    ? clamp(1 - cannon.timer / ARBITER_TUNING.phase2.cannonChargeMs, 0, 1)
    : (isFiring || isVulnerable ? 1 : 0);

  ctx.save();

  // Barrel body
  ctx.shadowColor = isVulnerable ? "#78ff9d"
    : (active && (isCharging || isFiring) ? ARB_OUTLINE : "rgba(30,80,120,0.5)");
  ctx.shadowBlur = isVulnerable ? 18 : (isCharging ? 6 + chargeProgress * 18 : 4);
  ctx.fillStyle  = isVulnerable ? "#1a4030"
    : (active && (isCharging || isFiring) ? ARB_MID : "#0a1520");
  ctx.strokeStyle = isVulnerable ? "#78ff9d"
    : (active ? ARB_OUTLINE : "rgba(50,120,160,0.4)");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(barrelLeft, barrelTop, bLen, bHalf * 2, 3);
  ctx.fill();
  ctx.stroke();

  // Danger zone overlay during charge/fire (covers the dangerous half of the screen)
  if (active && (isCharging || isFiring)) {
    const alpha = isFiring ? 0.5 : chargeProgress * 0.22;
    ctx.globalAlpha = alpha;
    const gx0 = cannon.side < 0 ? 0 : W;
    const gx1 = cannon.side < 0 ? W * 0.5 : W * 0.5;
    const zoneGrad = ctx.createLinearGradient(gx0, 0, gx1, 0);
    zoneGrad.addColorStop(0, "rgba(255,30,50,0.85)");
    zoneGrad.addColorStop(1, "rgba(255,30,50,0)");
    ctx.fillStyle = zoneGrad;
    const zx = cannon.side < 0 ? 0 : W * 0.5;
    ctx.fillRect(zx, RETICLE_Y - 28, W * 0.5, 64);
    ctx.globalAlpha = 1;
  }

  // Charge glow at barrel tip
  if (active && (isCharging || isFiring)) {
    const gr = 6 + chargeProgress * 16;
    const gc = ctx.createRadialGradient(tipX, pos.y, 1, tipX, pos.y, gr);
    gc.addColorStop(0, "#ffffff");
    gc.addColorStop(0.5, ARB_OUTLINE);
    gc.addColorStop(1, "rgba(50,200,255,0)");
    ctx.fillStyle = gc;
    ctx.shadowColor = ARB_OUTLINE;
    ctx.shadowBlur = 14 + chargeProgress * 14;
    ctx.beginPath();
    ctx.arc(tipX, pos.y, gr, 0, TAU);
    ctx.fill();
  }

  // Vulnerable weak spot
  if (isVulnerable) {
    const flash = cannon.flash > 0;
    const pr = 13 + Math.sin(t * 0.016) * 4;
    ctx.shadowColor = flash ? "#ffffff" : "#78ff9d";
    ctx.shadowBlur = 18;
    const wg = ctx.createRadialGradient(tipX, pos.y, 1, tipX, pos.y, pr);
    wg.addColorStop(0, flash ? "#ffffff" : "#78ff9d");
    wg.addColorStop(1, "rgba(80,255,120,0)");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(tipX, pos.y, pr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? "#ffffff" : WEAK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tipX, pos.y, pr * 1.9, 0, TAU);
    ctx.stroke();
  }

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
    const pt = lanePlanePoint(LANES[i], px);

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
