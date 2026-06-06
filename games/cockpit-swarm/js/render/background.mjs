import { W, H, CX, HORIZON_Y, STATE } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { getStage } from "../systems/stages.mjs";
import { RenderQuality } from "./quality.mjs";

let _celestialCanvas = null;
let _celestialCacheT = -Infinity;
const CELESTIAL_TTL = 3000;

let _bgGradKey = "";
let _bgGrad = null;
let _nebGrad = null;

function getCelestialCache(t) {
  if (!_celestialCanvas) {
    _celestialCanvas = document.createElement("canvas");
    _celestialCanvas.width  = W;
    _celestialCanvas.height = Math.round(H * 0.74);
  }
  if (t - _celestialCacheT > CELESTIAL_TTL) {
    _celestialCacheT = t;
    const c = _celestialCanvas.getContext("2d");
    c.clearRect(0, 0, W, _celestialCanvas.height);
    drawGalaxy(c, t);
    drawPlanet(c, t);
  }
  return _celestialCanvas;
}

export function renderBackground(ctx, game, t) {
  const isMenuState = game.state === STATE.MENU || game.state === STATE.HOW_TO_PLAY
    || game.state === STATE.BOSS_PRACTICE_SELECT
    || game.state === STATE.MP_LOBBY || game.state === STATE.MP_RESULT;
  const stage = getStage(game.wave.stageIndex);

  const stageKey = stage.id;
  if (_bgGradKey !== stageKey) {
    _bgGradKey = stageKey;
    _bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    _bgGrad.addColorStop(0, "#02030a");
    _bgGrad.addColorStop(0.42, stage.id.includes("crossfire") || stage.id.includes("chaos") ? "#170826" : "#06142a");
    _bgGrad.addColorStop(1, "#0b111b");
    _nebGrad = ctx.createRadialGradient(CX, HORIZON_Y + 30, 20, CX, HORIZON_Y, 480);
    _nebGrad.addColorStop(0, "rgba(52, 247, 255, 0.18)");
    _nebGrad.addColorStop(0.38, stage.id.includes("safe_lane") || stage.id.includes("armor") ? "rgba(255, 54, 93, 0.10)" : "rgba(133, 61, 255, 0.08)");
    _nebGrad.addColorStop(1, "rgba(0,0,0,0)");
  }

  ctx.fillStyle = _bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, isMenuState ? H : H * 0.74);
  ctx.clip();

  if (RenderQuality.lowPerf) {
    ctx.drawImage(getCelestialCache(t), 0, 0);
  } else {
    drawGalaxy(ctx, t);
    drawPlanet(ctx, t);
  }

  if (RenderQuality.lowPerf) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#d8fbff";
    let _starSkip = 0;
    for (const s of game.stars) {
      if (_starSkip++ % 2 === 0) continue;
      let px, py;
      if (isMenuState) {
        const scrollY = (t * 0.014) / s.z;
        px = CX + s.x / s.z;
        py = ((s.y / s.z + scrollY) % H + H) % H;
      } else {
        px = CX + (s.x - game.player.x * (0.28 / s.z)) / s.z;
        py = s.y / s.z;
      }
      if (px < -10 || px > W + 10 || py < -10 || py > H) continue;
      const sz = Math.max(1, Math.round(s.r / s.z));
      ctx.fillRect((px - sz * 0.5) | 0, (py - sz * 0.5) | 0, sz, sz);
    }
  } else {
    let _starSkip = 0;
    for (const s of game.stars) {
      let px, py;
      if (isMenuState) {
        const scrollY = (t * 0.014) / s.z;
        px = CX + s.x / s.z;
        py = ((s.y / s.z + scrollY) % H + H) % H;
      } else {
        px = CX + (s.x - game.player.x * (0.28 / s.z)) / s.z;
        py = s.y / s.z + Math.sin(t * 0.001 + s.tw) * 0.6;
      }
      if (px < -10 || px > W + 10 || py < -10 || py > H) continue;
      const alpha = clamp(0.2 + 0.5 / s.z, 0.2, 0.82);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#d8fbff";
      ctx.beginPath();
      ctx.arc(px, py, s.r / s.z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.fillStyle = _nebGrad;
  ctx.fillRect(0, 0, W, H);
}

function drawPlanet(ctx, t) {
  const px = W * 0.13;
  const py = H * 0.17;
  const r = 122;

  ctx.save();

  const halo = ctx.createRadialGradient(px, py, r * 0.7, px, py, r * 1.5);
  halo.addColorStop(0, "rgba(74, 130, 200, 0.20)");
  halo.addColorStop(1, "rgba(74, 130, 200, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(px, py, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.15, px, py, r);
  body.addColorStop(0, "#5b82bd");
  body.addColorStop(0.45, "#27406e");
  body.addColorStop(1, "#0a1530");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#0a1530";
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(px, py + i * 34, r, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const term = ctx.createRadialGradient(px + r * 0.55, py + r * 0.2, r * 0.2, px + r * 0.2, py, r * 1.15);
  term.addColorStop(0, "rgba(2, 5, 14, 0.82)");
  term.addColorStop(0.6, "rgba(2, 5, 14, 0.35)");
  term.addColorStop(1, "rgba(2, 5, 14, 0)");
  ctx.fillStyle = term;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(140, 200, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, r - 1, Math.PI * 0.78, Math.PI * 1.55);
  ctx.stroke();

  const mAng = t * 0.00012;
  const mx = px + Math.cos(mAng) * 220;
  const my = py - 70 + Math.sin(mAng) * 26;
  const moon = ctx.createRadialGradient(mx - 6, my - 6, 1, mx, my, 18);
  moon.addColorStop(0, "#cdd6e6");
  moon.addColorStop(1, "#33405e");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(mx, my, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGalaxy(ctx, t) {
  const gx = W * 0.86;
  const gy = H * 0.13;

  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(-0.55 + t * 0.00004);
  ctx.scale(1, 0.42);

  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 200);
  core.addColorStop(0, "rgba(245, 200, 255, 0.55)");
  core.addColorStop(0.18, "rgba(200, 120, 255, 0.34)");
  core.addColorStop(0.55, "rgba(110, 70, 220, 0.16)");
  core.addColorStop(1, "rgba(40, 20, 90, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = "round";
  for (let arm = 0; arm < 2; arm++) {
    ctx.strokeStyle = arm === 0 ? "rgba(180, 130, 255, 0.22)" : "rgba(120, 180, 255, 0.16)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2.2; a += 0.12) {
      const rad = 16 + a * 30;
      const ang = a + arm * Math.PI;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 240, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderMenuAtmosphere(ctx, t) {
  ctx.save();
  ctx.translate(CX, H * 0.44);
  ctx.rotate(t * 0.00016);

  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = "#34f7ff";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(0, 0, 340, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const inner = i % 8 === 0 ? 316 : i % 4 === 0 ? 328 : 336;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * 340, Math.sin(angle) * 340);
    ctx.stroke();
  }

  ctx.rotate(-t * 0.00032);
  ctx.globalAlpha = 0.055;
  ctx.beginPath();
  ctx.arc(0, 0, 220, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 50, Math.sin(angle) * 50);
    ctx.lineTo(Math.cos(angle) * 200, Math.sin(angle) * 200);
    ctx.stroke();
  }

  ctx.restore();

  if (!RenderQuality.lowPerf) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }
    ctx.restore();
  }

  ctx.save();
  const vig = ctx.createRadialGradient(CX, H * 0.45, 180, CX, H * 0.45, 740);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function renderDepthGrid(ctx, game) {
  ctx.save();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.32)";
  ctx.shadowColor = "rgba(52, 247, 255, 0.55)";
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1.4;

  for (let i = -7; i <= 7; i++) {
    if (RenderQuality.lowPerf && i !== 0 && i % 2 !== 0) continue;
    const x1 = CX + (i * 88 - game.player.x * 0.18) * 0.2;
    const x2 = CX + (i * 88 - game.player.x) * 1.55;
    ctx.globalAlpha = i === 0 ? 0.55 : 0.34;
    ctx.beginPath();
    ctx.moveTo(x1, HORIZON_Y);
    ctx.lineTo(x2, H * 0.78);
    ctx.stroke();
  }

  let hIdx = 0;
  for (let z = 1.55; z >= 0.24; z -= 0.12) {
    const y = HORIZON_Y + 80 / z;
    if (y > H * 0.80) break;
    if (RenderQuality.lowPerf && hIdx++ % 2 !== 0) continue;
    const width = 1180 / z;
    ctx.globalAlpha = clamp(0.10 + (1.55 - z) * 0.24, 0.10, 0.52);
    ctx.beginPath();
    ctx.moveTo(CX - width * 0.5, y);
    ctx.lineTo(CX + width * 0.5, y);
    ctx.stroke();
  }

  ctx.restore();
}
