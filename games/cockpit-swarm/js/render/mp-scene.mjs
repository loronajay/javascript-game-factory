// mp-scene.mjs — All multiplayer rendering: lobby, countdown, fighting HUD, result.

import { CX, H, W, MP_LOBBY_BTNS, MP_RESULT_BTNS } from "../core/constants.mjs";
import { getCountdownSecondsRemaining } from "../systems/online.mjs";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function _drawBtn(ctx, btn, active, t) {
  ctx.save();
  const pulse = active ? (Math.sin(t * 0.004) * 0.5 + 0.5) : 0;

  ctx.shadowBlur  = active ? 14 + pulse * 10 : 0;
  ctx.shadowColor = "#34f7ff";
  ctx.fillStyle   = active ? "rgba(52, 247, 255, 0.13)" : "rgba(4, 14, 26, 0.68)";
  ctx.strokeStyle = active
    ? `rgba(52, 247, 255, ${0.68 + pulse * 0.32})`
    : "rgba(52, 247, 255, 0.26)";
  ctx.lineWidth = active ? 2 : 1;

  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur    = active ? 6 : 0;
  ctx.font          = `${active ? "700" : "600"} 20px system-ui, sans-serif`;
  ctx.fillStyle     = active ? "#d8fbff" : "rgba(216, 251, 255, 0.44)";
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5);

  ctx.restore();
}


function _card(ctx) {
  const x = CX - 280, y = 96, w = 560, h = 480;

  ctx.fillStyle   = "rgba(2, 7, 16, 0.82)";
  ctx.strokeStyle = "rgba(52, 247, 255, 0.20)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.stroke();

  // Top accent bar
  ctx.fillStyle = "rgba(52, 247, 255, 0.18)";
  ctx.fillRect(x + 60, y, w - 120, 2);

  return { x, y, w, h };
}

// ─── Lobby screen ─────────────────────────────────────────────────────────────

export function renderMpLobby(ctx, game, t) {
  ctx.save();

  const card = _card(ctx);

  ctx.textAlign    = "center";
  ctx.textBaseline = "top";

  // Title
  const glow = 14 + Math.sin(t * 0.0014) * 8;
  ctx.font        = "900 60px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur  = glow;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText("COCKPIT DUEL", CX, 130);

  // Divider + subtitle
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = "rgba(52, 247, 255, 0.18)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(card.x + 40, 218);
  ctx.lineTo(card.x + card.w - 40, 218);
  ctx.stroke();

  ctx.font      = "500 14px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
  ctx.fillText("1V1 RAIL DUEL  ·  HOST-AUTHORITATIVE", CX, 230);

  const phase = game.mp.lobbyPhase;

  // ─ main phase ─
  if (phase === "main") {
    const canAct = game.mp.connected;
    ctx.save();
    ctx.globalAlpha = canAct ? 1.0 : 0.40;
    _drawBtn(ctx, MP_LOBBY_BTNS.findMatch,   false, t);
    _drawBtn(ctx, MP_LOBBY_BTNS.privateRoom, false, t);
    _drawBtn(ctx, MP_LOBBY_BTNS.joinByCode,  false, t);
    ctx.restore();

    if (!canAct) {
      ctx.font      = "500 12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(52, 247, 255, 0.52)";
      ctx.fillText("CONNECTING…", CX, MP_LOBBY_BTNS.findMatch.y - 14);
    }

    _drawBtn(ctx, MP_LOBBY_BTNS.back, false, t);
  }

  // ─ searching phase ─
  else if (phase === "searching") {
    const dots = ".".repeat(Math.floor(t / 300) % 4);
    ctx.font        = "700 32px system-ui, sans-serif";
    ctx.shadowColor = "#34f7ff";
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = "#d8fbff";
    ctx.fillText(`SEARCHING${dots}`, CX, 276);
    ctx.shadowBlur = 0;

    if (game.mp.queueCounts) {
      const { p1, p2 } = game.mp.queueCounts;
      ctx.font      = "500 14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(216, 251, 255, 0.48)";
      const p1Str = p1 != null ? String(p1) : "—";
      const p2Str = p2 != null ? String(p2) : "—";
      ctx.fillText(`Pilots in queue:  P1: ${p1Str}  ·  P2: ${p2Str}`, CX, 334);
    }

    _drawBtn(ctx, MP_LOBBY_BTNS.cancel, false, t);
  }

  // ─ room_host phase ─
  else if (phase === "room_host") {
    ctx.font      = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
    ctx.fillText("YOUR ROOM CODE", CX, 268);

    // Code display box
    const code     = game.mp.roomCode || "----";
    const codeGlow = 10 + Math.sin(t * 0.003) * 6;
    ctx.font        = "900 52px system-ui, monospace";
    ctx.shadowColor = "#34f7ff";
    ctx.shadowBlur  = codeGlow;
    ctx.fillStyle   = "#d8fbff";
    ctx.fillText(code, CX, 298);
    ctx.shadowBlur = 0;

    const dots = ".".repeat(Math.floor(t / 300) % 4);
    ctx.font      = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.48)";
    ctx.fillText(`Waiting for partner${dots}`, CX, 374);

    _drawBtn(ctx, MP_LOBBY_BTNS.cancel, false, t);
  }

  // ─ room_join phase ─
  else if (phase === "room_join") {
    ctx.font      = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
    ctx.fillText("ENTER ROOM CODE", CX, 268);

    // Code input box
    const codeInput = game.mp.roomCodeInput || "";
    const cursor    = Math.floor(t / 530) % 2 === 0 ? "█" : " ";
    const display   = codeInput + (codeInput.length < 4 ? cursor : "");

    ctx.fillStyle   = "rgba(4, 14, 26, 0.80)";
    ctx.strokeStyle = "rgba(52, 247, 255, 0.50)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(CX - 110, 296, 220, 72, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font        = "900 44px system-ui, monospace";
    ctx.shadowColor = "#34f7ff";
    ctx.shadowBlur  = codeInput.length === 4 ? 12 : 0;
    ctx.fillStyle   = codeInput.length === 4 ? "#d8fbff" : "rgba(216, 251, 255, 0.70)";
    ctx.textBaseline = "middle";
    ctx.fillText(display, CX, 332);
    ctx.shadowBlur   = 0;
    ctx.textBaseline = "top";

    ctx.font      = "500 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.34)";
    ctx.fillText("Type the 4-character code · Backspace to erase", CX, 378);

    // Dim JOIN if code not ready
    ctx.save();
    ctx.globalAlpha = codeInput.length === 4 ? 1.0 : 0.38;
    _drawBtn(ctx, MP_LOBBY_BTNS.joinSubmit, codeInput.length === 4, t);
    ctx.restore();
    _drawBtn(ctx, MP_LOBBY_BTNS.joinBack, false, t);
  }

  // ─ error phase ─
  else if (phase === "error") {
    ctx.font        = "700 20px system-ui, sans-serif";
    ctx.shadowColor = "#ff365d";
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = "#ff8fa3";
    ctx.fillText(game.mp.errorMsg || "CONNECTION ERROR", CX, 290);
    ctx.shadowBlur  = 0;

    ctx.font      = "500 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.40)";
    ctx.fillText("Press ESC or click BACK", CX, 330);

    _drawBtn(ctx, MP_LOBBY_BTNS.back, false, t);
  }

  // Bottom divider + hint
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = "rgba(52, 247, 255, 0.12)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(card.x + 40, card.y + card.h - 44);
  ctx.lineTo(card.x + card.w - 40, card.y + card.h - 44);
  ctx.stroke();

  ctx.font         = "500 12px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(216, 251, 255, 0.28)";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("CLICK TO SELECT    ESC  BACK", CX, card.y + card.h - 12);

  ctx.restore();
}

// ─── Countdown overlay ────────────────────────────────────────────────────────

export function renderMpCountdown(ctx, game, t) {
  const { startAt, clockOffsetMs, round, opponentName } = game.mp;

  const secsLeft = getCountdownSecondsRemaining(startAt, clockOffsetMs);

  ctx.save();

  // Dark vignette over the game world
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign   = "center";
  ctx.textBaseline = "middle";

  // "ROUND X" badge
  ctx.font      = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.64)";
  ctx.fillText(`ROUND ${round}`, CX, H * 0.34);

  // Opponent name
  if (opponentName) {
    ctx.font      = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.45)";
    ctx.fillText(`vs  ${opponentName}`, CX, H * 0.34 + 26);
  }

  // Big countdown number
  const pulse = 1 + Math.sin(t * 0.012) * 0.04;
  ctx.save();
  ctx.translate(CX, H * 0.50);
  ctx.scale(pulse, pulse);

  const countStr = secsLeft <= 0 ? "DUEL!" : String(secsLeft);
  const countGlow = secsLeft <= 0 ? "#ff365d" : "#34f7ff";

  ctx.font        = `900 ${secsLeft <= 0 ? 88 : 110}px system-ui, sans-serif`;
  ctx.shadowColor = countGlow;
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText(countStr, 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── Fighting HUD (Phase 1 placeholder) ───────────────────────────────────────
// Phase 2 will replace this with live HP bars, heat meters, and bullets.

export function renderMpFighting(ctx, game, t) {
  const side         = game.mp.opponentName ? `vs  ${game.mp.opponentName}` : "DUEL IN PROGRESS";
  const latencyLabel = "";

  ctx.save();

  // Top banner
  ctx.fillStyle = "rgba(2, 7, 16, 0.72)";
  ctx.fillRect(0, 0, W, 52);
  ctx.strokeStyle = "rgba(52, 247, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 52);
  ctx.lineTo(W, 52);
  ctx.stroke();

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  // VS label
  ctx.font      = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.72)";
  ctx.fillText(side, CX, 26);

  // Latency
  if (latencyLabel) {
    ctx.font      = "500 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.34)";
    ctx.textAlign = "right";
    ctx.fillText(latencyLabel, W - 20, 26);
  }

  // Phase 2 placeholder text at bottom
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.font         = "600 14px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(52, 247, 255, 0.35)";
  ctx.fillText("PHASE 2: DUEL CORE — PRESS ESC TO EXIT", CX, H - 16);

  ctx.restore();
}

// ─── Result screen ─────────────────────────────────────────────────────────────

export function renderMpResult(ctx, game, t) {
  const { matchWinner, opponentName, p1Rounds, p2Rounds, disconnected, side } = game.mp;

  const isWin       = matchWinner != null && side === matchWinner;
  const accentColor = isWin ? "#78ff9d" : "#ff365d";
  const titleText   = disconnected
    ? "OPPONENT DISCONNECTED"
    : (isWin ? "VICTORY" : (matchWinner ? "DEFEAT" : "MATCH OVER"));

  ctx.save();

  // Overlay
  ctx.fillStyle = "rgba(0,0,0,0.74)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign    = "center";
  ctx.textBaseline = "top";

  // Title
  ctx.font        = "900 64px system-ui, sans-serif";
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 24 + Math.sin(t * 0.002) * 8;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText(titleText, CX, 140);
  ctx.shadowBlur  = 0;

  // Opponent row
  if (opponentName) {
    ctx.font      = "500 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.52)";
    ctx.fillText(`vs  ${opponentName}`, CX, 224);
  }

  // Rounds panel
  ctx.fillStyle   = "rgba(4, 12, 22, 0.76)";
  ctx.strokeStyle = `rgba(${isWin ? "120,255,157" : "255,54,93"},0.25)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(CX - 180, 258, 360, 80, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = "700 36px system-ui, sans-serif";
  ctx.fillStyle    = "#d8fbff";
  ctx.fillText(`${p1Rounds}  —  ${p2Rounds}`, CX, 298);

  ctx.font      = "600 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.52)";
  ctx.fillText("P1  ·  ROUNDS  ·  P2", CX, 326);

  // Buttons
  for (let i = 0; i < MP_RESULT_BTNS.length; i++) {
    _drawBtn(ctx, MP_RESULT_BTNS[i], game.menu.selectedButton === i, t);
  }

  // Hint
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.font         = "500 13px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(216, 251, 255, 0.28)";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    ESC  MAIN MENU", CX, H - 22);

  ctx.restore();
}
