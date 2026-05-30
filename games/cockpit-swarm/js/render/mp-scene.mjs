// mp-scene.mjs — All multiplayer rendering: lobby, countdown, world (opponent + bullets), fighting HUD, result.

import { CX, H, W, RETICLE_Y, MP_LOBBY_BTNS, MP_RESULT_BTNS, MP_TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getCountdownSecondsRemaining } from "../systems/online.mjs";

// z-axis constants (must match mp-controller.mjs)
const Z_NEAR = 1.0;
const Z_FAR  = 7.0;

// ─── Shared button helper ─────────────────────────────────────────────────────

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

  ctx.fillStyle = "rgba(52, 247, 255, 0.18)";
  ctx.fillRect(x + 60, y, w - 120, 2);

  return { x, y, w, h };
}

// ─── Lobby screen ─────────────────────────────────────────────────────────────

export function renderMpLobby(ctx, game, t) {
  ctx.save();

  const card = _card(ctx);
  const sel  = game.menu.selectedButton;

  ctx.textAlign    = "center";
  ctx.textBaseline = "top";

  const glow = 14 + Math.sin(t * 0.0014) * 8;
  ctx.font        = "900 60px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur  = glow;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText("COCKPIT DUEL", CX, 130);

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
    _drawBtn(ctx, MP_LOBBY_BTNS.findMatch,   sel === 0 && canAct, t);
    _drawBtn(ctx, MP_LOBBY_BTNS.privateRoom, sel === 1 && canAct, t);
    _drawBtn(ctx, MP_LOBBY_BTNS.joinByCode,  sel === 2 && canAct, t);
    ctx.restore();

    if (!canAct) {
      ctx.font      = "500 12px system-ui, sans-serif";
      ctx.fillStyle = "rgba(52, 247, 255, 0.52)";
      ctx.fillText("CONNECTING…", CX, MP_LOBBY_BTNS.findMatch.y - 14);
    }

    _drawBtn(ctx, MP_LOBBY_BTNS.back, sel === 3, t);
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
      ctx.fillText(`Pilots in queue:  P1: ${p1 ?? "—"}  ·  P2: ${p2 ?? "—"}`, CX, 334);
    }

    _drawBtn(ctx, MP_LOBBY_BTNS.cancel, sel === 0, t);
  }

  // ─ room_host phase ─
  else if (phase === "room_host") {
    ctx.font      = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
    ctx.fillText("YOUR ROOM CODE", CX, 268);

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

    _drawBtn(ctx, MP_LOBBY_BTNS.cancel, sel === 0, t);
  }

  // ─ room_join phase ─
  else if (phase === "room_join") {
    ctx.font      = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
    ctx.fillText("ENTER ROOM CODE", CX, 268);

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

    ctx.save();
    ctx.globalAlpha = codeInput.length === 4 ? 1.0 : 0.38;
    _drawBtn(ctx, MP_LOBBY_BTNS.joinSubmit, sel === 0 && codeInput.length === 4, t);
    ctx.restore();
    _drawBtn(ctx, MP_LOBBY_BTNS.joinBack, sel === 1, t);
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

    _drawBtn(ctx, MP_LOBBY_BTNS.back, sel === 0, t);
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

  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";

  ctx.font      = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.64)";
  ctx.fillText(`ROUND ${round}`, CX, H * 0.34);

  if (opponentName) {
    ctx.font      = "500 15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.45)";
    ctx.fillText(`vs  ${opponentName}`, CX, H * 0.34 + 26);
  }

  const pulse = 1 + Math.sin(t * 0.012) * 0.04;
  ctx.save();
  ctx.translate(CX, H * 0.50);
  ctx.scale(pulse, pulse);

  const countStr  = secsLeft <= 0 ? "DUEL!" : String(secsLeft);
  const countGlow = secsLeft <= 0 ? "#ff365d" : "#34f7ff";

  ctx.font        = `900 ${secsLeft <= 0 ? 88 : 110}px system-ui, sans-serif`;
  ctx.shadowColor = countGlow;
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText(countStr, 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── World rendering (opponent silhouette + bullets) ─────────────────────────
// Called INSIDE the shake transform, before renderCockpit.

export function renderMpWorld(ctx, game, t) {
  const { side, opponentX, mpBullets } = game.mp;
  const isP2 = side === "p2";
  const localPlayerX = game.player.x;

  // Opponent silhouette at z=1.8 (fixed visual depth — always "across the arena")
  const op = project(opponentX, -22, 1.8, localPlayerX);
  _renderOpponentShip(ctx, op, t);

  // Bullets
  const startZ = Z_FAR - 0.2;
  const hitZ   = Z_NEAR + 0.5;

  for (const b of mpBullets) {
    // From P2's perspective, flip z so their own bullets go away and P1's come in
    const viewZ = isP2 ? (Z_NEAR + Z_FAR - b.z) : b.z;
    if (viewZ < 0.14) continue;

    const isIncoming = (side === "p1" && b.owner === "p2") ||
                       (side === "p2" && b.owner === "p1");

    const approach = isIncoming ? clamp((startZ - viewZ) / (startZ - hitZ), 0, 1) : 0;

    const raw = project(b.x, 0, viewZ, localPlayerX);
    let bx = raw.x;
    let by = raw.y;
    if (isIncoming) by = lerp(raw.y, RETICLE_Y, approach * approach);

    // Tail: shift depth slightly away to get the trailing edge position
    const tailDz     = b.kind === "lob" ? 0.55 : 0.30;
    const tailViewZ  = isIncoming
      ? Math.min(viewZ + tailDz, Z_FAR)
      : Math.max(viewZ - tailDz, Z_NEAR);
    const tailRaw = project(b.x, 0, tailViewZ, localPlayerX);
    let tx = tailRaw.x;
    let ty = tailRaw.y;
    if (isIncoming) {
      const tailApproach = clamp((startZ - tailViewZ) / (startZ - hitZ), 0, 1);
      ty = lerp(tailRaw.y, RETICLE_Y, tailApproach * tailApproach);
    }

    const onLane = isIncoming && Math.abs(b.x - localPlayerX) <= MP_TUNING.hitWindowX;
    _renderBullet(ctx, bx, by, raw.s, tx, ty, b.kind, isIncoming, approach, onLane);
  }
}

function _renderOpponentShip(ctx, op, t) {
  ctx.save();
  const { x, y, s } = op;
  const size  = 28 * s;
  const pulse = Math.sin(t * 0.0018) * 0.12 + 0.88;
  ctx.globalAlpha = Math.min(0.90, s * 2.6) * pulse;

  ctx.beginPath();
  ctx.moveTo(x, y - size * 2.0);
  ctx.lineTo(x + size * 2.2, y + size * 0.4);
  ctx.lineTo(x + size * 0.8, y + size * 1.2);
  ctx.lineTo(x,              y + size * 0.5);
  ctx.lineTo(x - size * 0.8, y + size * 1.2);
  ctx.lineTo(x - size * 2.2, y + size * 0.4);
  ctx.closePath();

  ctx.fillStyle   = "rgba(255, 64, 48, 0.26)";
  ctx.strokeStyle = "#ff4030";
  ctx.lineWidth   = Math.max(0.5, 1.5 * s);
  ctx.shadowColor = "#ff4030";
  ctx.shadowBlur  = 10 * s;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function _renderBullet(ctx, bx, by, s, tx, ty, kind, isIncoming, approach, onLane) {
  ctx.save();

  const isLob = kind === "lob";
  const color  = isLob
    ? (isIncoming ? "#ff8800" : "#ffcc44")
    : (isIncoming ? "#ff365d" : "#34f7ff");

  const r = Math.max(1.5, (isLob ? 11 : 5.5) * s * lerp(0.85, 1.55, approach));

  // — Tail trail —
  ctx.globalAlpha = clamp(0.18 + approach * 0.46, 0.18, 0.74);
  ctx.strokeStyle = color;
  ctx.lineWidth   = Math.max(1.5, r * (isLob ? 0.30 : 0.16));
  ctx.lineCap     = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10 + approach * 20;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.stroke();

  // — Outer glow ring —
  const ringAlpha = clamp(0.38 + approach * 0.62, 0.38, 1.0);
  ctx.globalAlpha = ringAlpha;
  ctx.shadowBlur  = 14 + approach * 34;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth   = Math.max(1.5, r * (isLob ? 0.26 : 0.20));
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.stroke();

  // — Inner core fill (inherits ringAlpha) —
  const fillBright = isLob
    ? (isIncoming ? "rgba(255,136,0,0.40)"  : "rgba(255,204,68,0.22)")
    : (isIncoming ? "rgba(255,54,93,0.38)"  : "rgba(52,247,255,0.18)");
  const fillDim = isLob
    ? (isIncoming ? "rgba(255,136,0,0.22)"  : "rgba(255,204,68,0.12)")
    : (isIncoming ? "rgba(255,54,93,0.18)"  : "rgba(52,247,255,0.10)");
  ctx.fillStyle = approach > 0.65 ? fillBright : fillDim;
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.44, 0, Math.PI * 2);
  ctx.fill();

  // — Danger ring around reticle for close incoming on-lane bullets —
  if (onLane && approach > 0.55) {
    ctx.globalAlpha = 0.16 + approach * 0.34;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(CX, RETICLE_Y, 62, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Fighting HUD ─────────────────────────────────────────────────────────────
// Called OUTSIDE the shake transform (overlay stays readable during screen shake).

export function renderMpFighting(ctx, game, t) {
  const {
    side, p1hp, p2hp, p1heat, p2heat, p1burn, p2burn,
    mpTimerMs, round, p1Rounds, p2Rounds, suddenDeath,
    opponentName, roundEnded, roundEndWinner,
  } = game.mp;

  const isP1     = side !== "p2";
  const myHp     = isP1 ? p1hp    : p2hp;
  const myHeat   = isP1 ? p1heat  : p2heat;
  const myBurn   = isP1 ? p1burn  : p2burn;
  const opHp     = isP1 ? p2hp    : p1hp;
  const opHeat   = isP1 ? p2heat  : p1heat;
  const opBurn   = isP1 ? p2burn  : p1burn;
  const myRounds = isP1 ? p1Rounds : p2Rounds;
  const opRounds = isP1 ? p2Rounds : p1Rounds;

  ctx.save();

  // ── Top banner ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(2, 7, 16, 0.82)";
  ctx.fillRect(0, 0, W, 70);
  ctx.strokeStyle = "rgba(52, 247, 255, 0.14)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, 70);
  ctx.lineTo(W, 70);
  ctx.stroke();

  // ── Timer ───────────────────────────────────────────────────────────────────
  const timerSecs = Math.ceil(mpTimerMs / 1000);
  const isLow     = timerSecs <= 10 && !suddenDeath;
  const timerStr  = suddenDeath
    ? "SD"
    : `${Math.floor(timerSecs / 60)}:${String(timerSecs % 60).padStart(2, "0")}`;
  const timerColor = suddenDeath ? "#ff4444"
    : isLow ? `rgba(255, ${Math.round(55 + (timerSecs / 10) * 200)}, 0, 1)`
    : "#34f7ff";

  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = suddenDeath ? "900 20px system-ui, sans-serif" : "700 28px system-ui, sans-serif";
  ctx.fillStyle    = timerColor;
  ctx.shadowColor  = timerColor;
  ctx.shadowBlur   = suddenDeath ? 18 : (isLow ? 10 : 4);
  ctx.fillText(timerStr, CX, 26);
  ctx.shadowBlur   = 0;

  // Round score under timer
  ctx.font      = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.50)";
  ctx.fillText(`${myRounds}  ·  ${opRounds}`, CX, 50);

  // ── My HP + heat bar (left side, right-aligned to center gap) ───────────────
  const barW = 310;
  const barH = 14;
  const barY = 14;
  const myBarX = CX - 36 - barW;

  _renderHpBar(ctx, myBarX, barY, barW, barH, myHp, false);
  _renderHeatBar(ctx, myBarX, barY + 18, barW, 6, myHeat, myBurn, t);
  _renderRoundPips(ctx, myBarX, barY + 30, myRounds, false);

  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  ctx.font         = "700 11px system-ui, sans-serif";
  ctx.fillStyle    = myBurn ? "#ff4444" : "rgba(52, 247, 255, 0.68)";
  ctx.fillText(myBurn ? "BURNOUT" : "YOU", myBarX - 6, barY + 7);

  // ── Opponent HP + heat bar (right side) ─────────────────────────────────────
  const opBarX = CX + 36;

  _renderHpBar(ctx, opBarX, barY, barW, barH, opHp, true);
  _renderHeatBar(ctx, opBarX, barY + 18, barW, 6, opHeat, opBurn, t);
  _renderRoundPips(ctx, opBarX + barW, barY + 30, opRounds, true);

  ctx.textAlign    = "left";
  ctx.fillStyle    = opBurn ? "#ff4444" : "rgba(255, 80, 60, 0.68)";
  ctx.fillText(opBurn ? "BURNOUT" : (opponentName || "OPPONENT"), opBarX + barW + 6, barY + 7);

  // ── Sudden death banner ─────────────────────────────────────────────────────
  if (suddenDeath && !roundEnded) {
    const sdAlpha = 0.55 + Math.sin(t * 0.006) * 0.45;
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.font         = "900 18px system-ui, sans-serif";
    ctx.fillStyle    = `rgba(255, 68, 68, ${sdAlpha})`;
    ctx.shadowColor  = "#ff4444";
    ctx.shadowBlur   = 10;
    ctx.fillText("SUDDEN DEATH — LOB TO WIN", CX, 76);
    ctx.shadowBlur   = 0;
  }

  // ── Round end overlay ───────────────────────────────────────────────────────
  if (roundEnded && roundEndWinner) {
    const iWon = (isP1 && roundEndWinner === "p1") || (!isP1 && roundEndWinner === "p2");
    const msg   = iWon ? "ROUND WON" : "ROUND LOST";
    const color = iWon ? "#78ff9d" : "#ff4444";

    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.font         = "900 56px system-ui, sans-serif";
    ctx.fillStyle    = color;
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 18 + Math.sin(t * 0.006) * 8;
    ctx.fillText(msg, CX, H * 0.44);
    ctx.shadowBlur   = 0;

    ctx.font      = "500 16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.46)";
    ctx.fillText("Next round starting…", CX, H * 0.44 + 58);
  }

  // ── Controls hint ───────────────────────────────────────────────────────────
  if (!roundEnded) {
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    ctx.font         = "500 11px system-ui, sans-serif";
    ctx.fillStyle    = "rgba(216, 251, 255, 0.20)";
    ctx.fillText("A/D  MOVE    SPACE  LASER    K/SHIFT  LOB    ESC  EXIT", CX, H - 8);
  }

  ctx.restore();
}

// ─── HP bar ───────────────────────────────────────────────────────────────────

function _renderHpBar(ctx, x, y, w, h, hp, reversed) {
  const frac  = Math.max(0, hp / MP_TUNING.hp);
  const color = frac > 0.5 ? "#34f7ff" : frac > 0.25 ? "#ffcc00" : "#ff4444";
  const fillW = Math.round(frac * w);

  ctx.save();

  // Background
  ctx.fillStyle = "rgba(4, 12, 24, 0.72)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();

  // Fill
  if (fillW > 0) {
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 4;
    if (reversed) ctx.fillRect(x + w - fillW, y, fillW, h);
    else          ctx.fillRect(x, y, fillW, h);
    ctx.shadowBlur = 0;
  }

  // Border
  ctx.strokeStyle = "rgba(52, 247, 255, 0.20)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.stroke();

  // HP number
  ctx.font         = "600 10px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(216, 251, 255, 0.55)";
  ctx.textBaseline = "middle";
  ctx.shadowBlur   = 0;
  if (reversed) { ctx.textAlign = "right"; ctx.fillText(String(hp), x - 4, y + h * 0.5); }
  else          { ctx.textAlign = "left";  ctx.fillText(String(hp), x + w + 4, y + h * 0.5); }

  ctx.restore();
}

// ─── Heat bar ─────────────────────────────────────────────────────────────────

function _renderHeatBar(ctx, x, y, w, h, heat, burning, t) {
  const frac  = Math.max(0, Math.min(1, heat / MP_TUNING.burnoutThreshold));
  ctx.save();

  ctx.fillStyle = "rgba(4, 12, 24, 0.60)";
  ctx.fillRect(x, y, w, h);

  if (frac > 0) {
    const baseColor = frac > 0.7 ? "#ff8800" : "#ff6600";
    ctx.fillStyle = burning
      ? `rgba(255, 68, 68, ${0.55 + Math.sin(t * 0.014) * 0.45})`
      : baseColor;
    ctx.fillRect(x, y, Math.round(frac * w), h);
  }

  ctx.strokeStyle = "rgba(255, 100, 0, 0.22)";
  ctx.lineWidth   = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.restore();
}

// ─── Round pip dots ───────────────────────────────────────────────────────────

function _renderRoundPips(ctx, anchorX, y, wins, reversed) {
  const max  = MP_TUNING.roundsToWin;
  const step = 10;
  ctx.save();
  for (let i = 0; i < max; i++) {
    const px = reversed ? anchorX - (max - 1 - i) * step : anchorX + i * step;
    const filled = wins > i;
    ctx.beginPath();
    ctx.arc(px, y, 3, 0, Math.PI * 2);
    ctx.fillStyle   = filled ? "#34f7ff" : "rgba(52, 247, 255, 0.22)";
    ctx.shadowColor = filled ? "#34f7ff" : "transparent";
    ctx.shadowBlur  = filled ? 5 : 0;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
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

  ctx.fillStyle = "rgba(0,0,0,0.74)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign    = "center";
  ctx.textBaseline = "top";

  ctx.font        = "900 64px system-ui, sans-serif";
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 24 + Math.sin(t * 0.002) * 8;
  ctx.fillStyle   = "#d8fbff";
  ctx.fillText(titleText, CX, 140);
  ctx.shadowBlur  = 0;

  if (opponentName) {
    ctx.font      = "500 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.52)";
    ctx.fillText(`vs  ${opponentName}`, CX, 224);
  }

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

  for (let i = 0; i < MP_RESULT_BTNS.length; i++) {
    _drawBtn(ctx, MP_RESULT_BTNS[i], game.menu.selectedButton === i, t);
  }

  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.font         = "500 13px system-ui, sans-serif";
  ctx.fillStyle    = "rgba(216, 251, 255, 0.28)";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    ESC  MAIN MENU", CX, H - 22);

  ctx.restore();
}
