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
    drawCanopyArch(ctx);
    drawSideFrames(ctx, t);
    drawDashboard(ctx, t);
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
    drawCanopyArch(c);
    drawSideFrames(c, t);
    drawDashboard(c, t);
    drawCenterConsole(c, t);
  }
  return _lpCockpitCanvas;
}

// Subtle glass glare across the top of the canopy viewport
function drawCanopyArch(ctx) {
  ctx.save();
  const glare = ctx.createLinearGradient(0, 0, 0, H * 0.38);
  glare.addColorStop(0,    "rgba(140, 200, 255, 0.045)");
  glare.addColorStop(0.45, "rgba(100, 170, 230, 0.018)");
  glare.addColorStop(1,    "rgba(0, 0, 40, 0)");
  ctx.fillStyle = glare;
  ctx.fillRect(180, 0, W - 360, H * 0.38);
  ctx.restore();
}

function drawSideFrames(ctx, t) {
  drawStrut(ctx, false, t);
  drawStrut(ctx, true, t);
}

function drawStrut(ctx, mirror, t) {
  ctx.save();
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }

  // Main body
  const body = ctx.createLinearGradient(0, 0, 260, 0);
  body.addColorStop(0,    "#0b131c");
  body.addColorStop(0.55, "#09121f");
  body.addColorStop(1,    "#03070e");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.lineTo(252, H * 0.70);
  ctx.lineTo(430, H);
  ctx.closePath();
  ctx.fill();

  // Interior details — clipped to strut shape
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.lineTo(252, H * 0.70);
  ctx.lineTo(430, H);
  ctx.closePath();
  ctx.clip();

  // Horizontal panel seams (riveted-plate look)
  ctx.strokeStyle = "rgba(180, 220, 255, 0.065)";
  ctx.lineWidth = 1;
  for (const sy of [H * 0.14, H * 0.30, H * 0.48, H * 0.64, H * 0.80]) {
    const xMax = lerp(90, 380, sy / H);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(xMax, sy);
    ctx.stroke();
  }

  // Diagonal accent lines between seams
  ctx.strokeStyle = "rgba(255, 160, 60, 0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, H * 0.30); ctx.lineTo(110, H * 0.48);
  ctx.moveTo(18, H * 0.55); ctx.lineTo(90,  H * 0.70);
  ctx.stroke();

  // Vent slats — upper third of strut
  const ventX = 16;
  const ventY = H * 0.17;
  const ventW = 74;
  for (let i = 0; i < 7; i++) {
    const sy = ventY + i * 13;
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(ventX, sy, ventW, 6);
    ctx.strokeStyle = "rgba(200, 230, 255, 0.17)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ventX, sy); ctx.lineTo(ventX + ventW, sy); ctx.stroke();
    ctx.strokeStyle = "rgba(60, 100, 140, 0.1)";
    ctx.beginPath(); ctx.moveTo(ventX, sy + 6); ctx.lineTo(ventX + ventW, sy + 6); ctx.stroke();
  }
  // Vent frame
  ctx.strokeStyle = "rgba(255, 138, 38, 0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(ventX - 3, ventY - 3, ventW + 6, 7 * 13 + 2, 2);
  ctx.stroke();

  // Status warning-light panel
  const lpX = 14, lpY = H * 0.42, lpW = 94, lpH = 66;
  ctx.fillStyle = "rgba(2, 6, 12, 0.92)";
  ctx.beginPath(); ctx.roundRect(lpX, lpY, lpW, lpH, 4); ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 38, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(lpX, lpY, lpW, lpH, 4); ctx.stroke();

  ctx.fillStyle = "rgba(106, 183, 196, 0.5)";
  ctx.font = "600 8px monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("STATUS", lpX + 6, lpY + 5);

  const lightDefs = [
    "#3dff7a", "#3dff7a", "#34cfff",
    "#3dff7a", "#ffb04e", "#3dff7a",
    "#34cfff", "#3dff7a", "#ff365d",
  ];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const lx = lpX + 8 + col * 27;
      const ly = lpY + 18 + row * 16;
      const color = lightDefs[row * 3 + col];
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath(); ctx.roundRect(lx, ly, 20, 8, 2); ctx.fill();
      const blink = 0.52 + Math.sin(t * 0.003 + row * 1.1 + col * 0.7) * 0.26;
      ctx.globalAlpha = blink;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.roundRect(lx + 1, ly + 1, 18, 6, 1.5); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // Small LCD data strip below warning panel
  const dsX = lpX, dsY = lpY + lpH + 5, dsW = lpW, dsH = 22;
  ctx.fillStyle = "rgba(0, 12, 6, 0.9)";
  ctx.beginPath(); ctx.roundRect(dsX, dsY, dsW, dsH, 3); ctx.fill();
  ctx.strokeStyle = "rgba(80, 200, 120, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(dsX, dsY, dsW, dsH, 3); ctx.stroke();
  const readoutVal = Math.floor(((t * 0.038) % 1) * 9999).toString().padStart(4, "0");
  ctx.font = "700 10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(60, 200, 100, 0.72)";
  ctx.fillText(`${readoutVal} km/s`, dsX + dsW * 0.5, dsY + dsH * 0.5);

  ctx.restore(); // end clip

  // Outer orange edge trim
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

  // Inner cyan highlight
  ctx.strokeStyle = "rgba(120, 240, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(164, 0);
  ctx.lineTo(266, H * 0.70);
  ctx.lineTo(446, H);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawDashboard(ctx, t) {
  const topL  = { x: 232,     y: H * 0.76 };
  const topR  = { x: W - 232, y: H * 0.76 };
  const ctrlX = CX;
  const ctrlY = H * 0.645;

  const grad = ctx.createLinearGradient(0, H * 0.64, 0, H);
  grad.addColorStop(0,    "#15324a");
  grad.addColorStop(0.45, "#0a1825");
  grad.addColorStop(1,    "#03080e");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Interior details clipped to dashboard shape
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.clip();

  // Horizontal panel seams
  ctx.strokeStyle = "rgba(180, 220, 255, 0.055)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = H * (0.775 + i * 0.056);
    if (y >= H) break;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Vertical panel dividers (left and right sections)
  ctx.strokeStyle = "rgba(180, 220, 255, 0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.27, H * 0.77); ctx.lineTo(W * 0.31, H);
  ctx.moveTo(W * 0.73, H * 0.77); ctx.lineTo(W * 0.69, H);
  ctx.stroke();

  // Surface highlight near top edge
  const surf = ctx.createLinearGradient(0, H * 0.64, 0, H * 0.73);
  surf.addColorStop(0, "rgba(180, 220, 255, 0.038)");
  surf.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = surf;
  ctx.fillRect(0, H * 0.64, W, H * 0.12);

  ctx.restore();

  // Top edge — orange glow
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255, 138, 38, 0.88)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.stroke();

  // Cyan highlight strip
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
  const topY  = H * 0.625;
  const hb    = 168;
  const ht    = 92;

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

  // Side edge trim
  ctx.strokeStyle = "rgba(255, 138, 38, 0.85)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 14;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(CX - hb, baseY); ctx.lineTo(CX - ht, topY);
  ctx.moveTo(CX + hb, baseY); ctx.lineTo(CX + ht, topY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // MFD screen inset
  const mfdW = 128, mfdH = 43;
  const mfdX = CX - mfdW * 0.5;
  const mfdY = topY + 3;

  // Bezel
  ctx.fillStyle = "#020507";
  ctx.beginPath(); ctx.roundRect(mfdX - 5, mfdY - 3, mfdW + 10, mfdH + 6, 4); ctx.fill();
  ctx.strokeStyle = "rgba(52, 207, 255, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34cfff";
  ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.roundRect(mfdX - 5, mfdY - 3, mfdW + 10, mfdH + 6, 4); ctx.stroke();
  ctx.shadowBlur = 0;

  // Screen face
  ctx.fillStyle = "#010f0a";
  ctx.beginPath(); ctx.roundRect(mfdX, mfdY, mfdW, mfdH, 2); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.roundRect(mfdX, mfdY, mfdW, mfdH, 2); ctx.clip();

  // Scan lines
  for (let i = 0; i < mfdH; i += 2) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(mfdX, mfdY + i, mfdW, 1);
  }

  // Header
  ctx.fillStyle = "rgba(60, 230, 130, 0.78)";
  ctx.font = "700 9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("TACTICAL DISPLAY", CX, mfdY + 4);

  ctx.strokeStyle = "rgba(60, 220, 120, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mfdX + 6, mfdY + 15); ctx.lineTo(mfdX + mfdW - 6, mfdY + 15);
  ctx.stroke();

  // Status rows
  const rows = [
    { label: "NAV", val: "LOCK",  color: "rgba(60, 230, 130, 0.88)"  },
    { label: "SEN", val: "ACT",   color: "rgba(52, 207, 255, 0.88)"  },
    { label: "SIG", val: "CLEAR", color: "rgba(255, 200, 100, 0.82)" },
  ];
  ctx.font = "600 8px monospace";
  for (let i = 0; i < rows.length; i++) {
    const { label, val, color } = rows[i];
    const ry = mfdY + 18 + i * 9;
    const blink = 0.62 + Math.sin(t * 0.0028 + i * 1.9) * 0.22;
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.textAlign = "left";  ctx.fillText(label, mfdX + 6, ry);
    ctx.textAlign = "right"; ctx.fillText(val,   mfdX + mfdW - 6, ry);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Flanking LEDs
  const leds = [
    { x: CX - ht - 16, y: topY + 9,  color: "#3dff7a" },
    { x: CX - ht - 16, y: topY + 23, color: "#34cfff" },
    { x: CX + ht + 16, y: topY + 9,  color: "#ff8a26" },
    { x: CX + ht + 16, y: topY + 23, color: "#3dff7a" },
  ];
  for (let i = 0; i < leds.length; i++) {
    const { x, y, color } = leds[i];
    ctx.globalAlpha = 0.5 + Math.sin(t * 0.006 + i * 1.8) * 0.4;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// 240° sweep analog gauge — 8 o'clock to 4 o'clock via 12 o'clock
function drawArcGauge(ctx, cx, cy, r, label, value, accentColor) {
  const startA = Math.PI * (5 / 6);
  const sweepA = Math.PI * (4 / 3);
  const v = clamp(value, 0, 1);

  ctx.save();

  // Outer bezel plate
  ctx.fillStyle = "#050a12";
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = "rgba(255, 138, 38, 0.48)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner rim step
  ctx.strokeStyle = "rgba(200, 230, 255, 0.1)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();

  // Gauge face
  const face = ctx.createRadialGradient(cx, cy - r * 0.2, 2, cx, cy, r + 2);
  face.addColorStop(0, "rgba(16, 34, 54, 0.98)");
  face.addColorStop(1, "rgba(4, 10, 20,  0.98)");
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();

  // Background track
  ctx.strokeStyle = "rgba(50, 100, 150, 0.2)";
  ctx.lineWidth = 8;
  ctx.lineCap = "butt";
  ctx.beginPath(); ctx.arc(cx, cy, r - 11, startA, startA + sweepA); ctx.stroke();

  // Danger zone (low end, red)
  ctx.strokeStyle = "rgba(255, 50, 80, 0.26)";
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, r - 11, startA, startA + sweepA * 0.25); ctx.stroke();

  // Value arc
  const fillColor = v < 0.25 ? "#ff365d" : v < 0.5 ? "#ffb04e" : accentColor;
  ctx.strokeStyle = fillColor;
  ctx.shadowColor = fillColor;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, r - 11, startA, startA + sweepA * v); ctx.stroke();
  ctx.shadowBlur = 0;

  // Tick marks — 8 intervals, major every other
  for (let i = 0; i <= 8; i++) {
    const a     = startA + (i / 8) * sweepA;
    const major = i % 2 === 0;
    const inner = major ? r - 22 : r - 18;
    ctx.strokeStyle = major ? "rgba(200, 230, 255, 0.7)" : "rgba(130, 175, 215, 0.36)";
    ctx.lineWidth   = major ? 2 : 1;
    ctx.lineCap     = "square";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
  }

  // Needle shadow then needle
  const needleA = startA + sweepA * v;
  const nLen    = r - 16;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.44)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(needleA) * 8, cy - Math.sin(needleA) * 8);
  ctx.lineTo(cx + Math.cos(needleA) * nLen, cy + Math.sin(needleA) * nLen);
  ctx.stroke();

  ctx.strokeStyle = "#ffe8c0";
  ctx.shadowColor = "#ffce80";
  ctx.shadowBlur  = 5;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(needleA) * 8, cy - Math.sin(needleA) * 8);
  ctx.lineTo(cx + Math.cos(needleA) * nLen, cy + Math.sin(needleA) * nLen);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Center cap
  ctx.fillStyle = "#141f2e";
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(180, 220, 255, 0.48)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();

  // Label and percent readout
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = "700 10px monospace";
  ctx.fillStyle    = "rgba(160, 210, 240, 0.72)";
  ctx.fillText(label, cx, cy + r * 0.40);

  const pct = Math.round(v * 100);
  ctx.font         = "800 13px monospace";
  ctx.fillStyle    = fillColor;
  ctx.shadowColor  = fillColor;
  ctx.shadowBlur   = 4;
  ctx.fillText(`${pct}%`, cx, cy + r * 0.60);
  ctx.shadowBlur = 0;

  ctx.restore();
}

// Vertical bar gauge
function drawVerticalBar(ctx, x, y, w, h, value, label, color) {
  ctx.save();

  ctx.fillStyle = "rgba(4, 10, 20, 0.88)";
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = "rgba(180, 220, 240, 0.17)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.stroke();

  const v  = clamp(value, 0, 1);
  const fh = h * v;
  const fy = y + h - fh;
  const bc = v < 0.25 ? "#ff365d" : v < 0.5 ? "#ffb04e" : color;
  ctx.fillStyle   = bc;
  ctx.shadowColor = bc;
  ctx.shadowBlur  = 7;
  ctx.beginPath(); ctx.roundRect(x + 2, fy, w - 4, fh, 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Division ticks
  ctx.strokeStyle = "rgba(200, 230, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const ty = y + h * (i / 4);
    ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + w, ty); ctx.stroke();
  }

  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.font         = "600 9px monospace";
  ctx.fillStyle    = "rgba(140, 200, 230, 0.58)";
  ctx.fillText(label, x + w * 0.5, y + h + 4);

  ctx.restore();
}

function drawDashInstruments(ctx, game, t) {
  const hullVal = game.player.health / game.player.maxHealth;
  drawArcGauge(ctx, CX - 310, H * 0.815, 46, "SHLD", hullVal, "#3dff7a");

  const thrVal = 0.72 + Math.sin(t * 0.0009) * 0.14;
  drawVerticalBar(ctx, CX - 252, H * 0.742, 14, 54, thrVal, "THR", "#34cfff");

  const sysVal = 0.82 + Math.sin(t * 0.0013 + 1.4) * 0.1;
  drawArcGauge(ctx, CX + 310, H * 0.815, 46, "SYS", sysVal, "#34cfff");

  const wpnVal = 0.58 + Math.sin(t * 0.0017 + 2.2) * 0.2;
  drawVerticalBar(ctx, CX + 238, H * 0.742, 14, 54, wpnVal, "WPN", "#ffb04e");

  drawRadarScope(ctx, game, t);
}

function drawRadarScopeSimple(ctx, game) {
  const cx = CX, cy = H * 0.83, r = 50;
  const TAU = Math.PI * 2;

  ctx.save();

  ctx.fillStyle = "#04130b";
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(255, 138, 38, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, TAU); ctx.stroke();

  ctx.fillStyle = "rgba(8, 38, 20, 0.7)";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();

  ctx.strokeStyle = "rgba(80, 255, 140, 0.5)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, TAU);
  ctx.moveTo(cx + r * 0.33, cy); ctx.arc(cx, cy, r * 0.33, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  for (const e of game.enemies) {
    if (!e.alive) continue;
    const zNorm = clamp((e.z - 1) / 3, 0, 1);
    const bx = cx + clamp(e.x / 200, -1, 1) * r * 0.82;
    const by = cy + lerp(r * 0.72, -r * 0.72, zNorm);
    const hot = e.telegraphFlash > 0;
    ctx.fillStyle = hot ? "#ff5d7a" : "#7dffb0";
    ctx.beginPath(); ctx.arc(bx, by, hot ? 3 : 2, 0, TAU); ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = "#d6ffe4";
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();

  ctx.restore();
}

function drawRadarScope(ctx, game, t) {
  const cx = CX, cy = H * 0.83, r = 50;
  const TAU = Math.PI * 2;

  ctx.save();

  // Bezel
  ctx.fillStyle = "#04130b";
  ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, TAU); ctx.fill();

  // Bezel outer ring
  ctx.strokeStyle = "rgba(255, 138, 38, 0.5)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, TAU); ctx.stroke();
  ctx.shadowBlur = 0;

  // Bezel inner step
  ctx.strokeStyle = "rgba(200, 230, 255, 0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.stroke();

  // Face gradient
  const face = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  face.addColorStop(0, "rgba(70, 255, 130, 0.32)");
  face.addColorStop(1, "rgba(8, 38, 20, 0.7)");
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();

  // Grid rings and crosshairs
  ctx.strokeStyle = "rgba(80, 255, 140, 0.5)";
  ctx.shadowColor = "#3dff7a";
  ctx.shadowBlur  = 6;
  ctx.lineWidth   = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, TAU);
  ctx.moveTo(cx + r * 0.33, cy); ctx.arc(cx, cy, r * 0.33, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // Sweep wedge and arm
  const sweep = (t * 0.0022) % TAU;
  const wedge = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  wedge.addColorStop(0, "rgba(120, 255, 170, 0.35)");
  wedge.addColorStop(1, "rgba(120, 255, 170, 0)");
  ctx.fillStyle = wedge;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, sweep - 0.5, sweep);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(150, 255, 190, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r);
  ctx.stroke();

  // Enemy blips
  ctx.shadowBlur = 6;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const zNorm = clamp((e.z - 1) / 3, 0, 1);
    const bx  = cx + clamp(e.x / 200, -1, 1) * r * 0.82;
    const by  = cy + lerp(r * 0.72, -r * 0.72, zNorm);
    const hot = e.telegraphFlash > 0;
    ctx.fillStyle   = hot ? "#ff5d7a" : "#7dffb0";
    ctx.shadowColor = hot ? "#ff365d" : "#3dff7a";
    ctx.beginPath(); ctx.arc(bx, by, hot ? 3 : 2, 0, TAU); ctx.fill();
  }

  ctx.restore();

  // Center pip
  ctx.shadowColor = "#aaffcc";
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = "#d6ffe4";
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();

  // Scope label
  ctx.shadowBlur   = 0;
  ctx.font         = "600 8px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "rgba(106, 183, 196, 0.45)";
  ctx.fillText("RADAR", cx, cy + r + 10);

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
  ctx.beginPath(); ctx.arc(0, 0, 34 + pulse * 3, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = "rgba(216, 251, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 9;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-48, 0); ctx.lineTo(-16, 0);
  ctx.moveTo( 16, 0); ctx.lineTo( 48, 0);
  ctx.moveTo(0, -48); ctx.lineTo(0, -16);
  ctx.moveTo(0,  16); ctx.lineTo(0,  48);
  ctx.stroke();

  ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#78ff9d";
  ctx.fill();
  ctx.restore();
}
