import { ARBITER_TUNING, LANES, H } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getArbiterLayout } from "../systems/boss.mjs";
import { phaseUsesVolley, phaseUsesArbiterLaser } from "../entities/boss.mjs";
import { lanePlanePoint, beamQuad, renderChargeSight, renderBeam, drawDiamond } from "./boss-fx.mjs";

const TAU       = Math.PI * 2;
const ARB_BODY    = "#0d1a2c";
const ARB_MID     = "#182d46";
const ARB_OUTLINE = "#3af5ff";
const PHASE_EYE   = ["#34f7ff", "#ffb347", "#ff5cf0"];
const WEAK        = "#b6ff3a";

export function renderArbiter(ctx, game, t) {
  const boss = game.boss;
  const layout = getArbiterLayout(game);

  drawArbiterBody(ctx, boss, layout, t);
  drawArbiterCannons(ctx, boss, layout, t);

  if (boss.sub === "fighting") {
    if (boss.phase === 2) {
      drawCannonColumnFills(ctx, game, layout, t);
    } else if (phaseUsesVolley(boss)) {
      drawVolleyTelegraph(ctx, game, layout, t);
    }

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

  ctx.shadowBlur = 0;
  ctx.strokeStyle = ARB_OUTLINE;
  ctx.lineWidth = 3;
  ctx.shadowColor = ARB_OUTLINE;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.36, -hh * 0.46);
  ctx.lineTo(hw * 0.36, -hh * 0.46);
  ctx.stroke();
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
  const barrelLeft = Math.min(mountX, tipX);
  const barrelTop  = pos.y - bHalf;

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
      const src    = project(LANES[i], ARBITER_TUNING.bodyY, ARBITER_TUNING.bodyZ, px);
      const nearPt = project(LANES[i], 55, 0.50, px);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      ctx.shadowColor = "#ff1e37";
      ctx.shadowBlur = 32;
      ctx.fillStyle = "rgba(255,30,55,0.52)";
      beamQuad(ctx, src.x, src.y, nearPt.x, nearPt.y, 3, 46);
      ctx.fill();

      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "rgba(255,190,210,0.85)";
      beamQuad(ctx, src.x, src.y, nearPt.x, nearPt.y, 1.5, 18);
      ctx.fill();

      const bleedBot  = Math.min(nearPt.y + 230, H);
      const bleedGrad = ctx.createLinearGradient(0, nearPt.y, 0, bleedBot);
      bleedGrad.addColorStop(0, "rgba(255,30,55,0.48)");
      bleedGrad.addColorStop(1, "rgba(255,30,55,0)");
      ctx.fillStyle = bleedGrad;
      ctx.fillRect(nearPt.x - 52, nearPt.y, 104, bleedBot - nearPt.y);

      const fl = ctx.createRadialGradient(nearPt.x, nearPt.y, 1, nearPt.x, nearPt.y, 72);
      fl.addColorStop(0, "rgba(255,255,255,0.95)");
      fl.addColorStop(0.32, "rgba(255,40,70,0.7)");
      fl.addColorStop(1, "rgba(255,30,55,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.arc(nearPt.x, nearPt.y, 72, 0, TAU);
      ctx.fill();

      ctx.restore();
    } else {
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

function drawCannonColumnFills(ctx, game, layout, t) {
  const boss = game.boss;
  const v = boss.volley;
  if (v.state !== "charging" && v.state !== "firing") return;

  const cfg = ARBITER_TUNING.phase2;
  const progress = v.state === "firing"
    ? 1
    : clamp(1 - v.timer / cfg.chargeMs, 0, 1);
  const px = game.player.x;

  const topZ = 1.52;
  const botZ = 0.65;
  const topHW = 20;
  const botHW = 90;

  for (let i = 0; i < 5; i++) {
    const isSafe = v.safeIndices.includes(i);
    const laneX = LANES[i];
    const topPt = project(laneX, -90, topZ, px);
    const botPt = project(laneX, 110, botZ, px);

    ctx.save();

    if (isSafe) {
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

  if (v.state === "firing") {
    drawCannonBeams(ctx, game, layout, v, px);
  }
}

function drawCannonBeams(ctx, game, layout, v, px) {
  for (let i = 0; i < 5; i++) {
    if (v.safeIndices.includes(i)) continue;
    const laneX = LANES[i];
    const cannon   = laneX <= 0 ? layout.cannonL : layout.cannonR;
    const impactPt = project(laneX, 110, 0.65, px);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    ctx.shadowColor = "#ff1e37";
    ctx.shadowBlur = 28;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(255,30,55,0.55)";
    beamQuad(ctx, cannon.x, cannon.y, impactPt.x, impactPt.y, 4, 48);
    ctx.fill();

    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,190,210,0.88)";
    beamQuad(ctx, cannon.x, cannon.y, impactPt.x, impactPt.y, 1.5, 18);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    const bleedBot  = Math.min(impactPt.y + 220, H);
    const bleedGrad = ctx.createLinearGradient(0, impactPt.y, 0, bleedBot);
    bleedGrad.addColorStop(0, "rgba(255,30,55,0.45)");
    bleedGrad.addColorStop(1, "rgba(255,30,55,0)");
    ctx.fillStyle = bleedGrad;
    ctx.fillRect(impactPt.x - 50, impactPt.y, 100, bleedBot - impactPt.y);

    ctx.globalAlpha = 0.9;
    const fl = ctx.createRadialGradient(impactPt.x, impactPt.y, 1, impactPt.x, impactPt.y, 72);
    fl.addColorStop(0, "rgba(255,255,255,0.95)");
    fl.addColorStop(0.32, "rgba(255,40,70,0.7)");
    fl.addColorStop(1, "rgba(255,30,55,0)");
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.arc(impactPt.x, impactPt.y, 72, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

function drawArbiterPunishTarget(ctx, boss, layout, t) {
  const { coreX, coreY } = layout;
  const pulse = 0.5 + Math.sin(t * 0.022) * 0.5;

  ctx.save();

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
    const elapsed = cfg.laserFireMs - m.timer;
    renderBeam(ctx, ox, oy, target.x, target.y, elapsed, t);
  }
}
