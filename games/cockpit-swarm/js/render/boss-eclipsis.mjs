import { ECLIPSIS_TUNING, LANES, W, H, HORIZON_Y, RETICLE_Y } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getEclipsisLayout } from "../systems/boss.mjs";
import { drawDiamond } from "./boss-fx.mjs";

const TAU = Math.PI * 2;

const ECLIPSIS_EYE     = ["#34d8ff", "#ffb347", "#ff6632", "#a020f0", "#ffffff"];
const ECLIPSIS_EYE_RGB = ["52,216,255", "255,179,71", "255,102,50", "160,32,240", "255,255,255"];
const ECLIPSIS_WEAK    = "#b6ff3a";

export function renderEclipsis(ctx, game, t) {
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

function eclipsisHullPath(ctx, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(0, -hh * 1.2);
  ctx.lineTo(-hw * 0.26, -hh * 0.88);
  ctx.lineTo(-hw * 0.70, -hh * 1.06);
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
  ctx.lineTo( hw * 0.70, -hh * 1.06);
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

  ctx.strokeStyle = "rgba(100,130,255,0.32)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-hw * 0.72, -hh * 0.92); ctx.lineTo(-hw * 0.28, -hh * 0.18); ctx.lineTo( hw * 0.28, -hh * 0.18); ctx.lineTo( hw * 0.72, -hh * 0.92); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-hw * 0.92,  hh * 0.02); ctx.lineTo(-hw * 0.48,  hh * 0.52); ctx.lineTo( hw * 0.48,  hh * 0.52); ctx.lineTo( hw * 0.92,  hh * 0.02); ctx.stroke();

  ctx.strokeStyle = "rgba(160,200,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-hw * 0.28, -hh * 1.15); ctx.lineTo(-hw * 0.72, -hh * 0.22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( hw * 0.38, -hh * 0.92); ctx.lineTo( hw * 0.82,  hh * 0.18); ctx.stroke();

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

  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#0a0414";
  ctx.strokeStyle = flash ? "#ffffff" : displayColor;
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

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

  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "#000000";
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.11, ry * 0.70, 0, 0, TAU);
  ctx.fill();

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

  if (!tether.active) return;

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
