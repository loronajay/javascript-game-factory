import {
  CX, H, HORIZON_Y, RETICLE_Y, STATE, TUNING, W,
  MENU_BTNS, HTP_BTNS, END_BTNS_GAMEOVER, END_BTNS_CLEAR
} from "../core/constants.mjs";
import { clamp, lerp, rand } from "../core/math.mjs";
import { project, projectEnemyBullet } from "../systems/projection.mjs";
import { getStage } from "../systems/stages.mjs";
import { renderBoss, renderBossHud } from "./boss-scene.mjs";
import { renderMpLobby, renderMpCountdown, renderMpWorld, renderMpFighting, renderMpResult } from "./mp-scene.mjs";
import { RenderQuality } from "./quality.mjs";

// Offscreen canvas — galaxy + planet cached for mobile to avoid re-rendering
// complex gradients every frame.  Refreshed every 3 s so the moon still moves.
let _celestialCanvas = null;
let _celestialCacheT = -Infinity;
const CELESTIAL_TTL = 3000;

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

// ─── Main render entry ────────────────────────────────────────────────────────

export function renderGame(ctx, game, t) {
  // ── Multiplayer screens ───────────────────────────────────────────────────
  if (game.state === STATE.MP_LOBBY || game.state === STATE.MP_RESULT) {
    renderBackground(ctx, game, t);
    renderMenuAtmosphere(ctx, t);
    if (game.state === STATE.MP_LOBBY) renderMpLobby(ctx, game, t);
    else renderMpResult(ctx, game, t);
    return;
  }

  if (game.state === STATE.MP_COUNTDOWN || game.state === STATE.MP_FIGHTING) {
    ctx.save();
    const sx = game.shake ? rand(-game.shake, game.shake) : 0;
    const sy = game.shake ? rand(-game.shake, game.shake) : 0;
    ctx.translate(sx, sy);
    renderBackground(ctx, game, t);
    renderDepthGrid(ctx, game);
    if (game.state === STATE.MP_FIGHTING) renderMpWorld(ctx, game, t);
    renderCockpit(ctx, game, t);
    ctx.restore();
    if (game.state === STATE.MP_COUNTDOWN) renderMpCountdown(ctx, game, t);
    else renderMpFighting(ctx, game, t);
    return;
  }

  // ── Campaign / solo screens ───────────────────────────────────────────────
  if (game.state === STATE.MENU || game.state === STATE.HOW_TO_PLAY) {
    renderBackground(ctx, game, t);
    renderMenuAtmosphere(ctx, t);
    if (game.state === STATE.MENU) renderMenuScreen(ctx, game, t);
    else renderHowToPlayScreen(ctx, game, t);
    return;
  }

  ctx.save();

  const sx = game.shake ? rand(-game.shake, game.shake) : 0;
  const sy = game.shake ? rand(-game.shake, game.shake) : 0;
  ctx.translate(sx, sy);

  renderBackground(ctx, game, t);
  renderDepthGrid(ctx, game);

  if (game.state === STATE.BOSS) {
    renderBoss(ctx, game, t);
    renderPlayerFire(ctx, game);
    renderParticles(ctx, game);
    renderCockpit(ctx, game, t);
    // Player essentials (hull/power/score/rail) stay visible; boss bar sits up top.
    drawHealth(ctx, game, 34, H - 82);
    drawPowerupHud(ctx, game, 200, H - 90);
    drawScore(ctx, game);
    drawRailGauge(ctx, game);
    renderBossHud(ctx, game, t);
  } else {
    renderPowerups(ctx, game, t);
    renderEnemies(ctx, game);
    renderEnemyBullets(ctx, game);
    renderPlayerFire(ctx, game);
    renderParticles(ctx, game);
    renderCockpit(ctx, game, t);

    if (game.state === STATE.PLAYING || game.state === STATE.STAGE_CLEAR) {
      renderHud(ctx, game);
    }
  }

  ctx.restore(); // end shake transform here — overlays render shake-free

  if (game.state === STATE.STAGE_CLEAR) {
    const next = game.wave.stageIndex + 2;
    renderCenterMessage(ctx, "STAGE CLEAR", `Loading Stage ${next}`);
  } else if (game.state === STATE.CLEAR) {
    renderEndScreen(ctx, game, t, false);
  } else if (game.state === STATE.GAME_OVER) {
    renderEndScreen(ctx, game, t, true);
  }
}

// ─── Menu screen ──────────────────────────────────────────────────────────────

function renderMenuScreen(ctx, game, t) {
  ctx.save();

  // Central card backdrop
  const cardX = CX - 280;
  const cardY = 96;
  const cardW = 560;
  const cardH = 480;
  ctx.fillStyle = "rgba(2, 7, 16, 0.78)";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Subtle top-edge accent bar
  ctx.fillStyle = "rgba(52, 247, 255, 0.18)";
  ctx.fillRect(cardX + 60, cardY, cardW - 120, 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Title
  const glow = 14 + Math.sin(t * 0.0014) * 8;
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = glow;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText("COCKPIT SWARM", CX, 130);

  // Divider
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(52, 247, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 40, 226);
  ctx.lineTo(cardX + cardW - 40, 226);
  ctx.stroke();

  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
  ctx.fillText("SECTOR DEFENSE SYSTEM  ·  5 STAGES", CX, 240);

  // Buttons
  for (let i = 0; i < MENU_BTNS.length; i++) {
    drawMenuButton(ctx, MENU_BTNS[i], game.menu.selectedButton === i, t);
  }

  // Bottom card divider + hint
  ctx.strokeStyle = "rgba(52, 247, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(cardX + 40, cardY + cardH - 44);
  ctx.lineTo(cardX + cardW - 40, cardY + cardH - 44);
  ctx.stroke();

  ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.textBaseline = "bottom";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    MOUSE  CLICK", CX, cardY + cardH - 12);

  ctx.restore();
}

// ─── How to play screen ───────────────────────────────────────────────────────

function renderHowToPlayScreen(ctx, game, t) {
  ctx.save();

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "900 48px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText("HOW TO PLAY", CX, 52);
  ctx.shadowBlur = 0;

  // Content panel
  const px = CX - 440;
  const py = 122;
  const pw = 880;
  const ph = 378;
  ctx.fillStyle = "rgba(3, 11, 20, 0.82)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const col1 = px + 46;
  const col2 = CX + 32;

  // Column headers
  ctx.textAlign = "left";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.65)";
  ctx.fillText("CONTROLS", col1, py + 24);
  ctx.fillText("TIPS", col2, py + 24);

  // Separator
  ctx.strokeStyle = "rgba(52, 247, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 24, py + 50);
  ctx.lineTo(px + pw - 24, py + 50);
  ctx.stroke();

  const controls = [
    ["← / A",     "Strafe left"],
    ["→ / D",     "Strafe right"],
    ["SPACE / J", "Fire cannon"],
    ["ESC",       "Return to menu"],
  ];

  ctx.font = "700 17px system-ui, sans-serif";
  for (let i = 0; i < controls.length; i++) {
    const y = py + 68 + i * 56;
    ctx.fillStyle = "#34f7ff";
    ctx.fillText(controls[i][0], col1, y);
    ctx.fillStyle = "rgba(216, 251, 255, 0.78)";
    ctx.font = "500 17px system-ui, sans-serif";
    ctx.fillText(controls[i][1], col1 + 156, y);
    ctx.font = "700 17px system-ui, sans-serif";
  }

  const tips = [
    "Only the front enemy row fires back",
    "Strafe out of bullet lanes to dodge",
    ["RAPID", "hold fire for full-auto"],
    ["SPLASH", "shot hits nearby enemies"],
    ["BOOST", "move at double speed"],
    ["HEALTH", "restores one hull point"],
  ];

  ctx.font = "500 16px system-ui, sans-serif";
  for (let i = 0; i < tips.length; i++) {
    const y = py + 68 + i * 52;
    const tip = tips[i];
    if (Array.isArray(tip)) {
      ctx.fillStyle = "#78ff9d";
      ctx.font = "700 16px system-ui, sans-serif";
      ctx.fillText(tip[0], col2, y);
      ctx.fillStyle = "rgba(216, 251, 255, 0.62)";
      ctx.font = "500 16px system-ui, sans-serif";
      ctx.fillText("— " + tip[1], col2 + 84, y);
    } else {
      ctx.fillStyle = "rgba(216, 251, 255, 0.72)";
      ctx.fillText("• " + tip, col2, y);
    }
  }

  // Vertical divider between columns
  ctx.strokeStyle = "rgba(52, 247, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX + 8, py + 56);
  ctx.lineTo(CX + 8, py + ph - 20);
  ctx.stroke();

  // Back button
  drawMenuButton(ctx, HTP_BTNS[0], game.menu.selectedButton === 0, t);

  // Hint
  ctx.textAlign = "center";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.textBaseline = "bottom";
  ctx.fillText("ENTER or ESC to go back", CX, H - 22);

  ctx.restore();
}

// ─── End screen (game over / sector clear) ────────────────────────────────────

function renderEndScreen(ctx, game, t, isGameOver) {
  ctx.save();

  // Heavy overlay
  ctx.fillStyle = isGameOver ? "rgba(0,0,0,0.78)" : "rgba(0,0,0,0.66)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Title
  const bossRush = game.mode === "bossRush";
  const title = isGameOver
    ? "COCKPIT BREACHED"
    : (bossRush ? "BOSS RUSH CLEAR" : "SECTOR CLEAR");
  const accentColor = isGameOver ? "#ff365d" : "#78ff9d";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 24 + Math.sin(t * 0.002) * 8;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(title, CX, 150);
  ctx.shadowBlur = 0;

  // Stats panel
  ctx.fillStyle = "rgba(4, 12, 22, 0.76)";
  ctx.beginPath();
  ctx.roundRect(CX - 290, 244, 580, 164, 10);
  ctx.fill();
  ctx.strokeStyle = `rgba(${isGameOver ? "255,54,93" : "120,255,157"},0.25)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Score
  ctx.font = "800 48px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(game.score.toLocaleString(), CX, 266);

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
  ctx.fillText("SCORE", CX, 326);

  // Sub-stats row
  const accuracy = game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;
  ctx.font = "500 17px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.textBaseline = "middle";

  const stageLabel = isGameOver
    ? (bossRush ? "BOSS RUSH" : `STAGE ${game.wave.stageIndex + 1} / 5`)
    : (bossRush ? "ALL BOSSES DOWN" : "ALL STAGES CLEARED");

  drawStatRow(ctx, CX, 370, [
    ["COMBO",    String(game.combo)],
    ["ACC",      `${accuracy}%`],
    ["STAGE",    stageLabel],
  ]);

  // Buttons
  const btns = isGameOver ? END_BTNS_GAMEOVER : END_BTNS_CLEAR;
  for (let i = 0; i < btns.length; i++) {
    drawMenuButton(ctx, btns[i], game.menu.selectedButton === i, t);
  }

  // Hint
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    ESC  MAIN MENU", CX, H - 22);

  ctx.restore();
}

function drawStatRow(ctx, cx, y, stats) {
  const colW = 186;
  const startX = cx - colW * (stats.length - 1) * 0.5;

  for (let i = 0; i < stats.length; i++) {
    const x = startX + i * colW;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillStyle = "#d8fbff";
    ctx.textAlign = "center";
    ctx.fillText(stats[i][1], x, y - 10);

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
    ctx.fillText(stats[i][0], x, y + 14);
  }
}

// ─── Shared button renderer ───────────────────────────────────────────────────

function drawMenuButton(ctx, btn, selected, t) {
  ctx.save();

  const pulse = selected ? (Math.sin(t * 0.004) * 0.5 + 0.5) : 0;

  ctx.shadowBlur  = selected ? 14 + pulse * 10 : 0;
  ctx.shadowColor = "#34f7ff";
  ctx.fillStyle   = selected ? "rgba(52, 247, 255, 0.13)" : "rgba(4, 14, 26, 0.68)";
  ctx.strokeStyle = selected
    ? `rgba(52, 247, 255, ${0.68 + pulse * 0.32})`
    : "rgba(52, 247, 255, 0.26)";
  ctx.lineWidth = selected ? 2 : 1;

  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = selected ? 6 : 0;
  ctx.font = `${selected ? "700" : "600"} 20px system-ui, sans-serif`;
  ctx.fillStyle = selected ? "#d8fbff" : "rgba(216, 251, 255, 0.44)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5);

  ctx.restore();
}

// ─── Background ───────────────────────────────────────────────────────────────

function renderBackground(ctx, game, t) {
  const isMenuState = game.state === STATE.MENU || game.state === STATE.HOW_TO_PLAY
    || game.state === STATE.MP_LOBBY || game.state === STATE.MP_RESULT;
  const stage = getStage(game.wave.stageIndex);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#02030a");
  g.addColorStop(0.42, stage.id.includes("crossfire") || stage.id.includes("chaos") ? "#170826" : "#06142a");
  g.addColorStop(1, "#0b111b");
  ctx.fillStyle = g;
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

  let _starSkip = 0;
  for (const s of game.stars) {
    // On mobile draw every other star to halve per-frame arc calls
    if (RenderQuality.lowPerf && _starSkip++ % 2 === 0) continue;

    let px, py;
    if (isMenuState) {
      // Stars drift slowly downward — parallax warp approach effect
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

  ctx.restore();
  ctx.globalAlpha = 1;

  const neb = ctx.createRadialGradient(CX, HORIZON_Y + 30, 20, CX, HORIZON_Y, 480);
  neb.addColorStop(0, "rgba(52, 247, 255, 0.18)");
  neb.addColorStop(0.38, stage.id.includes("safe_lane") || stage.id.includes("armor") ? "rgba(255, 54, 93, 0.10)" : "rgba(133, 61, 255, 0.08)");
  neb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);
}

// ─── Celestial backdrop (planet + galaxy) ─────────────────────────────────────

function drawPlanet(ctx, t) {
  const px = W * 0.13;
  const py = H * 0.17;
  const r = 122;

  ctx.save();

  // Soft atmospheric halo
  const halo = ctx.createRadialGradient(px, py, r * 0.7, px, py, r * 1.5);
  halo.addColorStop(0, "rgba(74, 130, 200, 0.20)");
  halo.addColorStop(1, "rgba(74, 130, 200, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(px, py, r * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Planet body — lit from upper-left
  const body = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.15, px, py, r);
  body.addColorStop(0, "#5b82bd");
  body.addColorStop(0.45, "#27406e");
  body.addColorStop(1, "#0a1530");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  // Surface bands
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

  // Terminator shadow (dark crescent on the right)
  const term = ctx.createRadialGradient(px + r * 0.55, py + r * 0.2, r * 0.2, px + r * 0.2, py, r * 1.15);
  term.addColorStop(0, "rgba(2, 5, 14, 0.82)");
  term.addColorStop(0.6, "rgba(2, 5, 14, 0.35)");
  term.addColorStop(1, "rgba(2, 5, 14, 0)");
  ctx.fillStyle = term;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim light on the lit edge
  ctx.strokeStyle = "rgba(140, 200, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, r - 1, Math.PI * 0.78, Math.PI * 1.55);
  ctx.stroke();

  // A small moon
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

  // Glowing core
  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 200);
  core.addColorStop(0, "rgba(245, 200, 255, 0.55)");
  core.addColorStop(0.18, "rgba(200, 120, 255, 0.34)");
  core.addColorStop(0.55, "rgba(110, 70, 220, 0.16)");
  core.addColorStop(1, "rgba(40, 20, 90, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.fill();

  // Spiral arms — faint logarithmic strokes
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

  // Bright nucleus dot
  ctx.fillStyle = "rgba(255, 240, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── Menu atmosphere (title screen only — no cockpit, no grid) ────────────────

function renderMenuAtmosphere(ctx, t) {
  ctx.save();

  // Slowly rotating outer targeting ring with tick marks
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

  // Inner ring — counter-rotating
  ctx.rotate(-t * 0.00032);
  ctx.globalAlpha = 0.055;
  ctx.beginPath();
  ctx.arc(0, 0, 220, 0, Math.PI * 2);
  ctx.stroke();

  // Four faint cardinal lines through center
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 50, Math.sin(angle) * 50);
    ctx.lineTo(Math.cos(angle) * 200, Math.sin(angle) * 200);
    ctx.stroke();
  }

  ctx.restore();

  // Subtle horizontal scanlines — skip on mobile (180 fillRects per frame is costly)
  if (!RenderQuality.lowPerf) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }
    ctx.restore();
  }

  // Edge vignette — keeps menu content readable against star field
  ctx.save();
  const vig = ctx.createRadialGradient(CX, H * 0.45, 180, CX, H * 0.45, 740);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────

function renderDepthGrid(ctx, game) {
  ctx.save();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.32)";
  ctx.shadowColor = "rgba(52, 247, 255, 0.55)";
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1.4;

  // Converging vertical rails — slight parallax with player rail offset
  for (let i = -7; i <= 7; i++) {
    const x1 = CX + (i * 88 - game.player.x * 0.18) * 0.2;
    const x2 = CX + (i * 88 - game.player.x) * 1.55;
    ctx.globalAlpha = i === 0 ? 0.55 : 0.34;
    ctx.beginPath();
    ctx.moveTo(x1, HORIZON_Y);
    ctx.lineTo(x2, H * 0.78);
    ctx.stroke();
  }

  // Horizontal depth lines — brighter as they sweep toward the player
  for (let z = 1.55; z >= 0.24; z -= 0.12) {
    const y = HORIZON_Y + 80 / z;
    if (y > H * 0.80) break;
    const width = 1180 / z;
    ctx.globalAlpha = clamp(0.10 + (1.55 - z) * 0.24, 0.10, 0.52);
    ctx.beginPath();
    ctx.moveTo(CX - width * 0.5, y);
    ctx.lineTo(CX + width * 0.5, y);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Powerups ─────────────────────────────────────────────────────────────────

function renderPowerups(ctx, game, t) {
  for (const pickup of game.powerups.activePickups) {
    if (!pickup.active) continue;

    const p = project(pickup.x, pickup.y, pickup.z, game.player.x);
    const size = 34 * p.s;
    const pulse = 1 + Math.sin(t * 0.008 + pickup.laneIndex) * 0.08;
    const alpha = clamp(1 - pickup.ageMs / pickup.lifetimeMs, 0.18, 1);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 24;
    ctx.shadowColor = pickup.color;
    ctx.strokeStyle = pickup.color;
    ctx.fillStyle = "rgba(8, 18, 28, 0.74)";
    ctx.lineWidth = Math.max(2, size * 0.08);

    drawPowerupShape(ctx, pickup.shape, size);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = pickup.color;
    ctx.font = `${Math.max(9, size * 0.24)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pickup.label, 0, size * 0.72);

    ctx.restore();
  }
}

function drawPowerupShape(ctx, shape, size) {
  ctx.beginPath();

  if (shape === "ammo") {
    ctx.roundRect(-size * 0.32, -size * 0.52, size * 0.64, size * 1.04, size * 0.12);
    return;
  }

  if (shape === "triple") {
    ctx.arc(0, -size * 0.18, size * 0.26, 0, Math.PI * 2);
    ctx.moveTo(-size * 0.36, size * 0.22);
    ctx.arc(-size * 0.36, size * 0.22, size * 0.22, 0, Math.PI * 2);
    ctx.moveTo(size * 0.36, size * 0.22);
    ctx.arc(size * 0.36, size * 0.22, size * 0.22, 0, Math.PI * 2);
    return;
  }

  if (shape === "chevron") {
    ctx.moveTo(0, -size * 0.56);
    ctx.lineTo(size * 0.52, 0);
    ctx.lineTo(size * 0.20, 0);
    ctx.lineTo(size * 0.20, size * 0.52);
    ctx.lineTo(-size * 0.20, size * 0.52);
    ctx.lineTo(-size * 0.20, 0);
    ctx.lineTo(-size * 0.52, 0);
    ctx.closePath();
    return;
  }

  if (shape === "cross") {
    ctx.moveTo(-size * 0.18, -size * 0.54);
    ctx.lineTo(size * 0.18, -size * 0.54);
    ctx.lineTo(size * 0.18, -size * 0.18);
    ctx.lineTo(size * 0.54, -size * 0.18);
    ctx.lineTo(size * 0.54, size * 0.18);
    ctx.lineTo(size * 0.18, size * 0.18);
    ctx.lineTo(size * 0.18, size * 0.54);
    ctx.lineTo(-size * 0.18, size * 0.54);
    ctx.lineTo(-size * 0.18, size * 0.18);
    ctx.lineTo(-size * 0.54, size * 0.18);
    ctx.lineTo(-size * 0.54, -size * 0.18);
    ctx.lineTo(-size * 0.18, -size * 0.18);
    ctx.closePath();
    return;
  }

  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

function renderEnemies(ctx, game) {
  const ordered = game.enemies.slice().sort((a, b) => b.z - a.z);

  for (const enemy of ordered) {
    if (!enemy.alive) continue;

    const p = project(enemy.x, enemy.y, enemy.z, game.player.x);
    const size = TUNING.enemyBaseSize * p.s * (enemy.sizeScale ?? 1);
    if (p.x < -size || p.x > W + size || p.y < -size || p.y > H + size) continue;

    drawEnemy(ctx, p.x, p.y, size, enemy.rot, enemy);
  }
}

function drawEnemy(ctx, x, y, size, rot, enemy) {
  const telegraphing = enemy.telegraphFlash > 0;
  const hitFlash = enemy.hitFlash > 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  ctx.shadowBlur = hitFlash ? 28 : telegraphing ? 30 : 16;
  ctx.shadowColor = hitFlash ? "#ffffff" : telegraphing ? "#ff365d" : enemy.color;

  ctx.fillStyle = hitFlash ? "#ffffff" : telegraphing ? "#ff365d" : enemy.color;
  ctx.strokeStyle = telegraphing ? "#ffd1dc" : "#b9fbff";
  ctx.lineWidth = Math.max(2, size * 0.05);

  drawEnemyShape(ctx, enemy.shape ?? "fighter", size);

  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawEnemyCore(ctx, enemy.shape ?? "fighter", size);

  if (enemy.maxHp > 1) {
    drawEnemyHpBar(ctx, enemy, size);
  }

  ctx.restore();
}

function drawEnemyShape(ctx, shape, size) {
  ctx.beginPath();

  if (shape === "dart") {
    ctx.moveTo(0, -size * 0.68);
    ctx.lineTo(size * 0.34, size * 0.18);
    ctx.lineTo(size * 0.12, size * 0.10);
    ctx.lineTo(0, size * 0.54);
    ctx.lineTo(-size * 0.12, size * 0.10);
    ctx.lineTo(-size * 0.34, size * 0.18);
    ctx.closePath();
    return;
  }

  if (shape === "shield") {
    ctx.moveTo(0, -size * 0.62);
    ctx.lineTo(size * 0.48, -size * 0.20);
    ctx.lineTo(size * 0.42, size * 0.32);
    ctx.lineTo(0, size * 0.64);
    ctx.lineTo(-size * 0.42, size * 0.32);
    ctx.lineTo(-size * 0.48, -size * 0.20);
    ctx.closePath();
    return;
  }

  if (shape === "orb") {
    ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
    ctx.moveTo(-size * 0.68, 0);
    ctx.lineTo(-size * 0.36, -size * 0.18);
    ctx.moveTo(size * 0.68, 0);
    ctx.lineTo(size * 0.36, -size * 0.18);
    return;
  }

  if (shape === "wide") {
    ctx.moveTo(0, -size * 0.45);
    ctx.lineTo(size * 0.72, size * 0.15);
    ctx.lineTo(size * 0.34, size * 0.26);
    ctx.lineTo(size * 0.12, size * 0.58);
    ctx.lineTo(0, size * 0.34);
    ctx.lineTo(-size * 0.12, size * 0.58);
    ctx.lineTo(-size * 0.34, size * 0.26);
    ctx.lineTo(-size * 0.72, size * 0.15);
    ctx.closePath();
    return;
  }

  if (shape === "carrier") {
    ctx.moveTo(0, -size * 0.70);
    ctx.lineTo(size * 0.62, -size * 0.10);
    ctx.lineTo(size * 0.48, size * 0.42);
    ctx.lineTo(size * 0.18, size * 0.30);
    ctx.lineTo(0, size * 0.72);
    ctx.lineTo(-size * 0.18, size * 0.30);
    ctx.lineTo(-size * 0.48, size * 0.42);
    ctx.lineTo(-size * 0.62, -size * 0.10);
    ctx.closePath();
    return;
  }

  ctx.moveTo(0, -size * 0.58);
  ctx.lineTo(size * 0.52, size * 0.34);
  ctx.lineTo(size * 0.18, size * 0.24);
  ctx.lineTo(0, size * 0.58);
  ctx.lineTo(-size * 0.18, size * 0.24);
  ctx.lineTo(-size * 0.52, size * 0.34);
  ctx.closePath();
}

function drawEnemyCore(ctx, shape, size) {
  ctx.fillStyle = "#06131f";

  if (shape === "orb") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (shape === "carrier") {
    ctx.beginPath();
    ctx.roundRect(-size * 0.22, -size * 0.18, size * 0.44, size * 0.36, size * 0.06);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    ctx.moveTo(-size * 0.36, size * 0.22);
    ctx.lineTo(size * 0.36, size * 0.22);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.arc(0, -size * 0.1, size * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(-size * 0.26, size * 0.12);
  ctx.lineTo(size * 0.26, size * 0.12);
  ctx.stroke();
}

function drawEnemyHpBar(ctx, enemy, size) {
  const w = size * 0.76;
  const h = Math.max(4, size * 0.08);
  const x = -w * 0.5;
  const y = size * 0.66;

  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = enemy.hp <= 1 ? "#ff365d" : "#78ff9d";
  ctx.fillRect(x, y, w * (enemy.hp / enemy.maxHp), h);

  ctx.strokeStyle = "rgba(216,251,255,0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// ─── Enemy bullets ────────────────────────────────────────────────────────────

function renderEnemyBullets(ctx, game) {
  const ordered = game.enemyBullets.slice().sort((a, b) => b.z - a.z);

  for (const b of ordered) {
    const p = projectEnemyBullet(b, game.player);
    const closeness = p.approach;
    const wobbleX = Math.sin(b.age * 0.008 + b.wobble) * (1 - closeness) * 8;
    const x = p.x + wobbleX;
    const y = p.y;
    const r = TUNING.enemyBulletBaseSize * p.s * lerp(0.85, 1.45, closeness);

    ctx.save();

    const oldZ = b.z;
    b.z = Math.min(b.startZ, oldZ + 0.16);
    const tail = projectEnemyBullet(b, game.player);
    b.z = oldZ;

    ctx.globalAlpha = clamp(0.20 + closeness * 0.48, 0.20, 0.78);
    ctx.strokeStyle = "#ff365d";
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.shadowBlur = 16 + closeness * 26;
    ctx.shadowColor = "#ff365d";
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.globalAlpha = clamp(0.38 + closeness, 0.38, 1);
    ctx.shadowBlur = 16 + closeness * 36;
    ctx.shadowColor = "#ff365d";

    ctx.strokeStyle = "#ff365d";
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = closeness > 0.68 ? "rgba(255, 54, 93, 0.38)" : "rgba(255, 54, 93, 0.18)";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    if (closeness > 0.55 && p.laneDistance <= TUNING.enemyBulletLaneHitWindow) {
      ctx.globalAlpha = 0.18 + closeness * 0.36;
      ctx.beginPath();
      ctx.arc(CX, RETICLE_Y, TUNING.playerHitWindow, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff365d";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ─── Player fire ──────────────────────────────────────────────────────────────

function renderPlayerFire(ctx, game) {
  if (game.player.muzzleFlash <= 0) return;

  const a = game.player.muzzleFlash / 70;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = game.powerups.effects.splashShotCharges > 0 ? "#4db7ff" : "#78ff9d";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 20;
  ctx.lineWidth = game.powerups.effects.splashShotCharges > 0 ? 5 : 3;
  ctx.beginPath();
  ctx.moveTo(CX, H * 0.72);
  ctx.lineTo(CX, HORIZON_Y - 45);
  ctx.stroke();

  if (game.powerups.effects.splashShotCharges > 0) {
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath();
    ctx.moveTo(CX - 42, H * 0.70);
    ctx.lineTo(CX - 42, HORIZON_Y - 10);
    ctx.moveTo(CX + 42, H * 0.70);
    ctx.lineTo(CX + 42, HORIZON_Y - 10);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(120, 255, 157, 0.5)";
  ctx.beginPath();
  ctx.arc(CX, H * 0.72, 16 + a * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Particles ────────────────────────────────────────────────────────────────

function renderParticles(ctx, game) {
  for (const p of game.explosions) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur = 12;

    if (p.kind === "hit") {
      ctx.fillStyle = "#ff365d";
      ctx.shadowColor = "#ff365d";
    } else if (p.kind === "miss") {
      ctx.fillStyle = "#6ab7c4";
      ctx.shadowColor = "#6ab7c4";
    } else if (p.kind === "powerup") {
      ctx.fillStyle = "#4db7ff";
      ctx.shadowColor = "#4db7ff";
    } else {
      ctx.fillStyle = "#78ff9d";
      ctx.shadowColor = "#78ff9d";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 1.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Cockpit frame ────────────────────────────────────────────────────────────

function renderCockpit(ctx, game, t = 0, showReticle = true) {
  ctx.save();

  drawSideFrames(ctx);
  drawDashboard(ctx);
  drawCenterConsole(ctx, t);
  drawDashInstruments(ctx, game, t);

  if (showReticle) drawReticle(ctx, t);

  if (game.player.hurtFlash > 0) {
    ctx.globalAlpha = game.player.hurtFlash / 260 * 0.4;
    ctx.fillStyle = "#ff365d";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

// ─── Angled side frames with orange neon bevels ──────────────────────────────

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

  // Dark metal body
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

  // Faint panel seams across the metal
  ctx.strokeStyle = "rgba(120, 200, 230, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const f = i / 4;
    ctx.beginPath();
    ctx.moveTo(0, H * f);
    ctx.lineTo(lerp(150, 252, f) * 0.6, H * f * 0.85 + 30);
    ctx.stroke();
  }

  // Orange neon inner bevel
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

  // Thin cyan accent just inside the orange
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

// ─── Dashboard slab ──────────────────────────────────────────────────────────

function drawDashboard(ctx) {
  const topL = { x: 232, y: H * 0.76 };
  const topR = { x: W - 232, y: H * 0.76 };
  const ctrlX = CX;
  const ctrlY = H * 0.645;

  // Metal slab
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

  // Orange neon rim
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255, 138, 38, 0.88)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#ff8a26";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.quadraticCurveTo(ctrlX, ctrlY, topR.x, topR.y);
  ctx.stroke();

  // Cyan core highlight along the rim
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

// ─── Raised central console ──────────────────────────────────────────────────

function drawCenterConsole(ctx, t) {
  const baseY = H * 0.695;
  const topY = H * 0.625;
  const hb = 168;
  const ht = 92;

  // Console body
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

  // Orange-lit beveled sides
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

  // Glowing blue screen strip across the console top (3 segments)
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

  // Indicator LEDs flanking the screen
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

// ─── Dashboard instruments (radar scope, gauge, button strips) ───────────────

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

  // Bezel
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

  // Tick marks around the dial
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

  // Sweeping needle
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

  // Bezel
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

  // Glass face
  const face = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  face.addColorStop(0, "rgba(70, 255, 130, 0.32)");
  face.addColorStop(1, "rgba(8, 38, 20, 0.7)");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  // Clip subsequent detail to the scope face
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();

  // Rings + crosshair
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

  // Radar sweep wedge
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

  // Plot living enemies as blips
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

  ctx.restore(); // end face clip

  // Center blip
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

  // Soft outer pulse ring
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

// ─── HUD ──────────────────────────────────────────────────────────────────────

function renderHud(ctx, game) {
  const stage = getStage(game.wave.stageIndex);

  ctx.save();

  drawStageBadge(ctx, game, stage);
  drawHealth(ctx, game, 34, H - 82);
  drawPowerupHud(ctx, game, 200, H - 90);
  drawScore(ctx, game);
  drawRailGauge(ctx, game);

  ctx.restore();
}

function drawStageBadge(ctx, game, stage) {
  ctx.save();
  ctx.textBaseline = "top";

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
  ctx.fillText(`STAGE ${game.wave.stageIndex + 1}`, 34, 28);

  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 6;
  ctx.fillText(stage.name.toUpperCase(), 34, 46);

  ctx.restore();
}

function drawHealth(ctx, game, x, y) {
  ctx.save();
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText("HULL", x, y - 28);

  for (let i = 0; i < game.player.maxHealth; i++) {
    ctx.fillStyle = i < game.player.health ? "#78ff9d" : "rgba(216,251,255,0.14)";
    ctx.strokeStyle = "rgba(216,251,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + i * 42, y, 30, 30, 5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawPowerupHud(ctx, game, x, y) {
  const effects = game.powerups.effects;
  const items = [];

  if (effects.holdToShootMs > 0)   items.push(`RAPID ${Math.ceil(effects.holdToShootMs / 1000)}s`);
  if (effects.speedBoostMs > 0)    items.push(`BOOST ${Math.ceil(effects.speedBoostMs / 1000)}s`);
  if (effects.splashShotCharges > 0) items.push(`SPLASH x${effects.splashShotCharges}`);

  ctx.save();
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText("POWER", x, y - 20);

  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = items.length ? "#d8fbff" : "rgba(216,251,255,0.32)";
  ctx.fillText(items.length ? items.join("  |  ") : "NONE", x, y + 6);
  ctx.restore();
}

function drawScore(ctx, game) {
  const pw = 262;
  const ph = 80;
  const px = W - pw - 24;
  const py = 20;
  const pad = 16;
  const accuracy = game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;

  ctx.save();

  // Panel backdrop
  ctx.fillStyle = "rgba(4, 12, 22, 0.74)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Orange accent edge along the top — echoes the cockpit bevels
  ctx.strokeStyle = "rgba(255, 138, 38, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 14, py);
  ctx.lineTo(px + pw - 14, py);
  ctx.stroke();

  // SCORE label + value
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.6)";
  ctx.fillText("SCORE", px + pad, py + 12);

  ctx.textAlign = "right";
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 6;
  ctx.fillText(game.score.toLocaleString(), px + pw - pad, py + 8);
  ctx.shadowBlur = 0;

  // Divider
  ctx.strokeStyle = "rgba(52, 247, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + pad, py + 50);
  ctx.lineTo(px + pw - pad, py + 50);
  ctx.stroke();

  // COMBO / ACC sub-row
  ctx.textAlign = "left";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(106, 183, 196, 0.85)";
  ctx.fillText("COMBO", px + pad, py + 58);
  ctx.fillText("ACC", px + pw * 0.56, py + 58);

  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(`x${game.combo}`, px + pad + 52, py + 56);
  ctx.fillText(`${accuracy}%`, px + pw * 0.56 + 34, py + 56);

  ctx.restore();
}

function drawRailGauge(ctx, game) {
  const gx = CX - 210;
  const gy = H - 52;
  const gw = 420;
  const gh = 12;
  const px = gx + ((game.player.x + TUNING.playerMaxX) / (TUNING.playerMaxX * 2)) * gw;

  ctx.save();
  ctx.fillStyle = "rgba(216,251,255,0.12)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = game.powerups.effects.speedBoostMs > 0 ? "rgba(120,255,157,0.8)" : "rgba(52,247,255,0.45)";
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = game.powerups.effects.speedBoostMs > 0 ? "#78ff9d" : "#34f7ff";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(px, gy + gh * 0.5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Stage clear flash ────────────────────────────────────────────────────────

function renderCenterMessage(ctx, title, sub) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#78ff9d";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#d8fbff";
  ctx.font = "900 62px system-ui, sans-serif";
  ctx.fillText(title, CX, H * 0.42);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#6ab7c4";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText(sub, CX, H * 0.52);

  ctx.restore();
}
