import { W, H, CX, RETICLE_Y } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { RenderQuality } from "./quality.mjs";

let _lpCockpitCanvas = null;
let _lpCockpitT = -Infinity;
const LP_COCKPIT_TTL = 3000;

export function renderCockpit(ctx, game, t = 0, showReticle = true) {
  ctx.save();

  if (RenderQuality.lowPerf) {
    ctx.drawImage(getLowPerfCockpitCache(t), 0, 0);
    drawRadarScopeSimple(ctx, game);
  } else {
    drawSideFrames(ctx);
    drawDashboard(ctx);
    drawCenterConsole(ctx, t);
    drawDashInstruments(ctx, game, t);
  }

  if (showReticle) drawReticle(ctx, t);

  if (game.player.hurtFlash > 0) {
    ctx.globalAlpha = game.player.hurtFlash / 260 * 0.4;
    ctx.fillStyle = "#ff365d";
    ctx.fillRect(0, 0, W, H);
  }

  if (game.player.curseTimer > 0) {
    const intensity = Math.min(1, game.player.curseTimer / 4000);
    ctx.globalAlpha = (0.10 + Math.sin(t * 0.006) * 0.04) * intensity;
    ctx.fillStyle = "#8800ff";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function getLowPerfCockpitCache(t) {
  if (!_lpCockpitCanvas) {
    _lpCockpitCanvas = document.createElement("canvas");
    _lpCockpitCanvas.width = W;
    _lpCockpitCanvas.height = H;
  }
  if (t - _lpCockpitT > LP_COCKPIT_TTL) {
    _lpCockpitT = t;
    const c = _lpCockpitCanvas.getContext("2d");
    c.clearRect(0, 0, W, H);
    drawSideFrames(c);
    drawDashboard(c);
    drawCenterConsole(c, t);
  }
  return _lpCockpitCanvas;
}

function drawRadarScopeSimple(ctx, game) {
  const cx = CX;
  const cy = H * 0.83;
  const r = 50;
  const TAU = Math.PI * 2;

  ctx.save();

  ctx.fillStyle = "#04130b";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 38, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = "rgba(8, 38, 20, 0.7)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();

  ctx.strokeStyle = "rgba(80, 255, 140, 0.5)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, TAU);
  ctx.moveTo(cx + r * 0.33, cy);
  ctx.arc(cx, cy, r * 0.33, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();

  for (const e of game.enemies) {
    if (!e.alive) continue;
    const zNorm = clamp((e.z - 1) / 3, 0, 1);
    const bx = cx + clamp(e.x / 200, -1, 1) * r * 0.82;
    const by = cy + lerp(r * 0.72, -r * 0.72, zNorm);
    const hot = e.telegraphFlash > 0;
    ctx.fillStyle = hot ? "#ff5d7a" : "#7dffb0";
    ctx.beginPath();
    ctx.arc(bx, by, hot ? 3 : 2, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = "#d6ffe4";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawSideFrames(ctx) {
  drawStrut(ctx, false);
  drawStrut(ctx, true);
}

function drawStrut(ctx, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }

  const body = ctx.createLinearGradient(0, 0, 240, 0);
  body.addColorStop(0, "#0b131c");
  body.addColorStop(1, "#03070e");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.lineTo(252, H * 0.70);
  ctx.lineTo(430, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(120, 200, 230, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const f = i / 4;
    ctx.beginPath();
    ctx.moveTo(0, H * f);
    ctx.lineTo(lerp(150, 252, f) * 0.6, H * f * 0.85 + 30);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 138, 38, 0.92)";
  ctx.lineWidth = 3.5;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 18;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(150, 0);
  ctx.lineTo(252, H * 0.70);
  ctx.lineTo(430, H);
  ctx.stroke();

  ctx.strokeStyle = "rgba(120, 240, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(164, 0);
  ctx.lineTo(266, H * 0.70);
  ctx.lineTo(446, H);
  ctx.stroke();

  ctx.restore();
}

function drawDashboard(ctx) {
  const topL = { x: 232, y: H * 0.76 };
  const topR = { x: W - 232, y: H * 0.76 };
  const ctrlX = CX;
  const ctrlY = H * 0.645;

  const grad = ctx.createLinearGradient(0, H * 0.64, 0, H);
  grad.addColorStop(0, "#15324a");
  grad.addColorStop(0.5, "#0a1825");
  grad.addColorStop(1, "#03080e");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255, 138, 38, 0.88)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(150, 245, 255, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawCenterConsole(ctx, t) {
  const baseY = H * 0.695;
  const topY = H * 0.625;
  const hb = 168;
  const ht = 92;

  const g = ctx.createLinearGradient(0, topY, 0, baseY);
  g.addColorStop(0, "#1c3850");
  g.addColorStop(1, "#08131e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(CX - hb, baseY);
  ctx.lineTo(CX - ht, topY);
  ctx.lineTo(CX + ht, topY);
  ctx.lineTo(CX + hb, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 138, 38, 0.85)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 14;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(CX - hb, baseY);
  ctx.lineTo(CX - ht, topY);
  ctx.moveTo(CX + hb, baseY);
  ctx.lineTo(CX + ht, topY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const sw = 150;
  const sh = 16;
  const sx = CX - sw * 0.5;
  const sy = topY - 5;
  const seg = sw / 3 - 5;
  ctx.shadowColor = "#34cfff";
  ctx.shadowBlur = 18;
  for (let i = 0; i < 3; i++) {
    const flick = 0.55 + Math.sin(t * 0.004 + i * 1.3) * 0.22;
    ctx.fillStyle = `rgba(74, 200, 255, ${flick})`;
    ctx.beginPath();
    ctx.roundRect(sx + i * (seg + 7), sy, seg, sh, 3);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const leds = [
    [CX - sw * 0.5 - 22, "#3dff7a"],
    [CX - sw * 0.5 - 22, "#34cfff"],
    [CX + sw * 0.5 + 22, "#ff8a26"],
    [CX + sw * 0.5 + 22, "#3dff7a"],
  ];
  for (let i = 0; i < leds.length; i++) {
    const [lx, color] = leds[i];
    const ly = sy + 2 + (i % 2) * 12;
    const blink = 0.5 + Math.sin(t * 0.006 + i * 2) * 0.4;
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawDashInstruments(ctx, game, t) {
  drawButtonStrip(ctx, CX - 322, H * 0.745, "#34cfff", 4, t, 0);
  drawButtonStrip(ctx, CX - 286, H * 0.745, "#ff8a26", 4, t, 1.6);
  drawButtonStrip(ctx, CX + 286, H * 0.745, "#3dff7a", 4, t, 0.8);
  drawButtonStrip(ctx, CX + 322, H * 0.745, "#34cfff", 4, t, 2.4);

  drawRoundGauge(ctx, CX + 226, H * 0.82, 32, t);
  drawRadarScope(ctx, game, t);
}

function drawButtonStrip(ctx, x, y, color, n, t, phase) {
  const w = 22;
  const h = 13;
  const gap = 4;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const by = y + i * (h + gap);
    const lit = (Math.sin(t * 0.003 + i * 0.9 + phase) + 1) * 0.5;
    ctx.fillStyle = `rgba(8, 16, 24, 0.85)`;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, by, w, h, 2);
    ctx.fill();

    ctx.globalAlpha = 0.35 + lit * 0.6;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + lit * 6;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5 + 2, by + 2, w - 4, h - 4, 1.5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawRoundGauge(ctx, cx, cy, r, t) {
  ctx.save();

  ctx.fillStyle = "#0a0f16";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 38, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255, 170, 90, 0.45)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const i0 = r - (i % 3 === 0 ? 9 : 5);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * i0, cy + Math.sin(a) * i0);
    ctx.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ctx.stroke();
  }

  const ang = -Math.PI * 0.5 + Math.sin(t * 0.0011) * 1.9;
  ctx.strokeStyle = "rgba(255, 200, 120, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#ffb04e";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * (r - 8), cy + Math.sin(ang) * (r - 8));
  ctx.stroke();

  ctx.fillStyle = "#ffd089";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRadarScope(ctx, game, t) {
  const cx = CX;
  const cy = H * 0.83;
  const r = 50;
  const TAU = Math.PI * 2;

  ctx.save();

  ctx.fillStyle = "#04130b";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 38, 0.55)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const face = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  face.addColorStop(0, "rgba(70, 255, 130, 0.32)");
  face.addColorStop(1, "rgba(8, 38, 20, 0.7)");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();

  ctx.strokeStyle = "rgba(80, 255, 140, 0.5)";
  ctx.shadowColor = "#3dff7a";
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, TAU);
  ctx.moveTo(cx + r * 0.33, cy);
  ctx.arc(cx, cy, r * 0.33, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();

  const sweep = (t * 0.0022) % TAU;
  const wedge = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  wedge.addColorStop(0, "rgba(120, 255, 170, 0.35)");
  wedge.addColorStop(1, "rgba(120, 255, 170, 0)");
  ctx.fillStyle = wedge;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, sweep - 0.5, sweep);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(150, 255, 190, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r);
  ctx.stroke();

  ctx.shadowBlur = 6;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const zNorm = clamp((e.z - 1) / 3, 0, 1);
    const bx = cx + clamp(e.x / 200, -1, 1) * r * 0.82;
    const by = cy + lerp(r * 0.72, -r * 0.72, zNorm);
    const hot = e.telegraphFlash > 0;
    ctx.fillStyle = hot ? "#ff5d7a" : "#7dffb0";
    ctx.shadowColor = hot ? "#ff365d" : "#3dff7a";
    ctx.beginPath();
    ctx.arc(bx, by, hot ? 3 : 2, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  ctx.shadowColor = "#aaffcc";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#d6ffe4";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawReticle(ctx, t = 0) {
  ctx.save();
  ctx.translate(CX, RETICLE_Y);

  const pulse = 0.5 + Math.sin(t * 0.004) * 0.5;
  ctx.strokeStyle = `rgba(52, 247, 255, ${0.18 + pulse * 0.16})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 34 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(216, 251, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 9;

  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-48, 0);
  ctx.lineTo(-16, 0);
  ctx.moveTo(16, 0);
  ctx.lineTo(48, 0);
  ctx.moveTo(0, -48);
  ctx.lineTo(0, -16);
  ctx.moveTo(0, 16);
  ctx.lineTo(0, 48);
  ctx.stroke();

  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#78ff9d";
  ctx.fill();
  ctx.restore();
}
