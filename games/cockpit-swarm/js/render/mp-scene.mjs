// mp-scene.mjs — All multiplayer rendering: lobby, countdown, world (opponent + bullets), fighting HUD, result.

import { CX, H, W, HORIZON_Y, RETICLE_Y, MP_LOBBY_BTNS, MP_RESULT_BTNS, MP_TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";
import { getCountdownSecondsRemaining } from "../systems/online.mjs";

// z-axis constants (must match mp-controller.mjs)
const Z_NEAR = 1.0;
const Z_FAR  = 7.0;
const PROJECTILE_SPAWN_OFFSET_Z = 0.15;
const SPAWN_Z = Z_NEAR + PROJECTILE_SPAWN_OFFSET_Z;          // 1.15 — z where bullets are born
const OPPONENT_VISUAL_Z = Z_FAR - PROJECTILE_SPAWN_OFFSET_Z; // 6.85
const OPPONENT_VISUAL_Y = -30;
const OPPONENT_SIZE_SCALE = 4.25;

// worldY for the gun muzzle: the value that projects to RETICLE_Y at SPAWN_Z depth.
// (RETICLE_Y - HORIZON_Y) * SPAWN_Z  →  at z=SPAWN_Z, y = HORIZON_Y + worldY/z = RETICLE_Y
const GUN_MUZZLE_WORLD_Y = (RETICLE_Y - HORIZON_Y) * SPAWN_Z; // ≈ 100
// depth span for outgoing bullet worldY interpolation
const OUTGOING_DEPTH_SPAN = OPPONENT_VISUAL_Z - SPAWN_Z;       // ≈ 5.70
// vertical screen span from horizon to reticle (used for incoming y-approach math)
const DHEIGHT = RETICLE_Y - HORIZON_Y;                         // ≈ 87

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
    const display   = codeInput + (codeInput.length < 5 ? cursor : "");

    ctx.fillStyle   = "rgba(4, 14, 26, 0.80)";
    ctx.strokeStyle = "rgba(52, 247, 255, 0.50)";
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(CX - 110, 296, 220, 72, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font        = "900 44px system-ui, monospace";
    ctx.shadowColor = "#34f7ff";
    ctx.shadowBlur  = codeInput.length === 5 ? 12 : 0;
    ctx.fillStyle   = codeInput.length === 5 ? "#d8fbff" : "rgba(216, 251, 255, 0.70)";
    ctx.textBaseline = "middle";
    ctx.fillText(display, CX, 332);
    ctx.shadowBlur   = 0;
    ctx.textBaseline = "top";

    ctx.font      = "500 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(216, 251, 255, 0.34)";
    ctx.fillText("Type the 5-character code · Backspace to erase", CX, 378);

    ctx.save();
    ctx.globalAlpha = codeInput.length === 5 ? 1.0 : 0.38;
    _drawBtn(ctx, MP_LOBBY_BTNS.joinSubmit, sel === 0 && codeInput.length === 5, t);
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
  const { side, opponentX, mpBullets, opponentHitFlash = 0 } = game.mp;
  const localPlayerX = game.player.x;

  // ── Muzzle flash when the local player fires ─────────────────────────────────
  if (game.player.muzzleFlash > 0) {
    const a = game.player.muzzleFlash / 140;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = "#34f7ff";
    ctx.shadowColor = "#34f7ff";
    ctx.shadowBlur  = 28 + a * 14;
    ctx.lineWidth   = 3 + a * 2;
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(CX, RETICLE_Y + 10);
    ctx.lineTo(CX, HORIZON_Y - 20);
    ctx.stroke();
    ctx.globalAlpha = a * 0.50;
    ctx.fillStyle   = "#d8fbff";
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(CX, RETICLE_Y, 14 + a * 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Keep opponent projection tied to projectile spawn depth so muzzle origins read correctly.
  const op = buildMpOpponentView({ opponentX, localPlayerX, t, hitFlash: opponentHitFlash });
  _renderOpponentShip(ctx, op);

  for (const b of mpBullets) {
    const bulletView = buildMpBulletView({ bullet: b, side, localPlayerX });
    if (!bulletView.visible) continue;
    _renderBullet(ctx, bulletView);
  }
}

export function buildMpOpponentView({ opponentX, localPlayerX, t = 0, hitFlash = 0 }) {
  const projected = project(opponentX, OPPONENT_VISUAL_Y, OPPONENT_VISUAL_Z, localPlayerX);
  const pulse = Math.sin(t * 0.0018) * 0.08 + 0.92;
  const dist  = Math.abs(localPlayerX - opponentX);
  const onTarget = dist <= MP_TUNING.hitWindowX;
  const lockFrac = onTarget ? clamp(1 - dist / MP_TUNING.hitWindowX, 0, 1) : 0;

  return {
    ...projected,
    visualZ: OPPONENT_VISUAL_Z,
    pulse,
    size: 28 * projected.s * OPPONENT_SIZE_SCALE,
    alpha: Math.min(0.96, projected.s * OPPONENT_SIZE_SCALE * 0.72) * pulse,
    onTarget,
    lockFrac,
    hitFlash,
  };
}

export function buildMpBulletView({ bullet, side, localPlayerX }) {
  const isP2 = side === "p2";
  const viewZ = isP2 ? (Z_NEAR + Z_FAR - bullet.z) : bullet.z;
  const visible = viewZ >= 0.14;
  const isIncoming = (side === "p1" && bullet.owner === "p2") ||
                     (side === "p2" && bullet.owner === "p1");
  const startZ = OPPONENT_VISUAL_Z;
  const hitZ   = Z_NEAR + 0.5;
  const approach = isIncoming ? clamp((startZ - viewZ) / (startZ - hitZ), 0, 1) : 0;

  // ── Outgoing bullets: interpolate worldY from gun muzzle (reticle height at SPAWN_Z)
  //    to opponent worldY — gives correct 3-D arc from reticle into the distance.
  const outgoingDepthFrac = !isIncoming
    ? clamp((viewZ - SPAWN_Z) / OUTGOING_DEPTH_SPAN, 0, 1)
    : 0;
  const bulletWorldY = !isIncoming
    ? lerp(GUN_MUZZLE_WORLD_Y, OPPONENT_VISUAL_Y, outgoingDepthFrac)
    : 0;
  const raw = project(bullet.x, bulletWorldY, viewZ, localPlayerX);

  const tailDz = bullet.kind === "lob" ? 0.55 : 0.30;
  const tailViewZ = isIncoming
    ? Math.min(viewZ + tailDz, Z_FAR)
    : Math.max(viewZ - tailDz, Z_NEAR);

  const tailDepthFrac = !isIncoming
    ? clamp((tailViewZ - SPAWN_Z) / OUTGOING_DEPTH_SPAN, 0, 1)
    : 0;
  const tailWorldY = !isIncoming
    ? lerp(GUN_MUZZLE_WORLD_Y, OPPONENT_VISUAL_Y, tailDepthFrac)
    : 0;
  const tailRaw = project(bullet.x, tailWorldY, tailViewZ, localPlayerX);

  // ── Incoming bullets: use Z_NEAR as the visual convergence target (not hitZ) so
  //    bullets reach RETICLE_Y exactly at Z_NEAR, then overshoot past the player.
  const rawVisualApp     = isIncoming ? (startZ - viewZ)     / Math.max(0.001, startZ - hitZ) : 0;
  const tailRawVisualApp = isIncoming ? (startZ - tailViewZ) / Math.max(0.001, startZ - hitZ) : 0;

  // Allow overshoot past 1.0 — bullet rushes through the reticle, then fades fast.
  const overshoot     = Math.max(0, rawVisualApp - 1.0);
  const overshootFade = overshoot > 0 ? Math.max(0, 1 - overshoot * 3.5) : 1.0;

  const yApp     = isIncoming ? Math.min(rawVisualApp,     1.40) : 0;
  const tailYApp = isIncoming ? Math.min(tailRawVisualApp, 1.40) : 0;

  const isLob = bullet.kind === "lob";
  const onLane = isIncoming && Math.abs(bullet.x - localPlayerX) <= MP_TUNING.hitWindowX;

  const outgoingFarFrac   = !isIncoming ? clamp((viewZ - 3.5) / (OPPONENT_VISUAL_Z - 3.5), 0, 1) : 0;
  const minRadius         = !isIncoming ? lerp(1.5, 4.0, outgoingFarFrac) : 1.5;
  const outgoingGlowBoost = outgoingFarFrac;

  return {
    visible,
    x:     raw.x,
    y:     isIncoming ? HORIZON_Y + yApp     * yApp     * DHEIGHT : raw.y,
    s:     raw.s,
    viewZ,
    tailX: tailRaw.x,
    tailY: isIncoming ? HORIZON_Y + tailYApp * tailYApp * DHEIGHT : tailRaw.y,
    kind:  bullet.kind,
    isIncoming,
    approach,
    onLane,
    overshootFade,
    radius: Math.max(minRadius, (isLob ? 11 : 5.5) * raw.s * lerp(0.90, 1.72, approach)),
    outgoingGlowBoost,
    threatAlpha: onLane ? clamp((approach - 0.42) / 0.58, 0, 1) * 0.68 : 0,
    palette: getProjectilePalette(bullet.kind, isIncoming),
  };
}

function getProjectilePalette(kind, isIncoming) {
  const isLob = kind === "lob";
  if (isIncoming) {
    return isLob
      ? { role: "incoming", color: "#ff8a1f", core: "#ffe0a0", dim: "rgba(255,138,31,0.18)" }
      : { role: "incoming", color: "#ff365d", core: "#ffd1dc", dim: "rgba(255,54,93,0.16)" };
  }
  return isLob
    ? { role: "friendly", color: "#ffcc44", core: "#fff2a6", dim: "rgba(255,204,68,0.12)" }
    : { role: "friendly", color: "#34f7ff", core: "#d8fbff", dim: "rgba(52,247,255,0.12)" };
}

function _renderOpponentShip(ctx, op) {
  ctx.save();
  const { x, y, s, size } = op;

  // ── Hit flash: bright burst behind ship when opponent absorbs a shot ─────────
  if (op.hitFlash > 0) {
    const ff = op.hitFlash / 240;
    ctx.globalAlpha = ff * 0.55;
    ctx.shadowColor = "#ff8866";
    ctx.shadowBlur  = 28 * ff;
    ctx.fillStyle   = "#ff7755";
    ctx.beginPath();
    ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // ── Ship silhouette ──────────────────────────────────────────────────────────
  ctx.globalAlpha = op.alpha;
  ctx.shadowColor = "#ff4030";
  ctx.shadowBlur  = 12 * s * OPPONENT_SIZE_SCALE;

  ctx.beginPath();
  ctx.moveTo(x, y - size * 1.28);
  ctx.lineTo(x + size * 1.90, y + size * 0.10);
  ctx.lineTo(x + size * 0.82, y + size * 0.44);
  ctx.lineTo(x + size * 0.44, y + size * 0.95);
  ctx.lineTo(x,               y + size * 0.56);
  ctx.lineTo(x - size * 0.44, y + size * 0.95);
  ctx.lineTo(x - size * 0.82, y + size * 0.44);
  ctx.lineTo(x - size * 1.90, y + size * 0.10);
  ctx.closePath();

  ctx.fillStyle   = "rgba(255, 64, 48, 0.22)";
  ctx.strokeStyle = "#ff4030";
  ctx.lineWidth   = Math.max(1, 1.25 * s * OPPONENT_SIZE_SCALE);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur  = 0;
  ctx.strokeStyle = "rgba(255, 210, 190, 0.72)";
  ctx.lineWidth   = Math.max(0.75, 0.7 * s * OPPONENT_SIZE_SCALE);
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.82);
  ctx.lineTo(x, y + size * 0.38);
  ctx.moveTo(x - size * 0.62, y + size * 0.18);
  ctx.lineTo(x + size * 0.62, y + size * 0.18);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 230, 160, 0.86)";
  ctx.beginPath();
  ctx.arc(x, y - size * 0.24, Math.max(1.5, size * 0.13), 0, Math.PI * 2);
  ctx.fill();

  // ── Lock-on brackets: appear when local player is within hit range ───────────
  if (op.onTarget) {
    const lockR    = Math.max(10, size * 1.68);
    const arm      = lockR * 0.38;
    const bW       = Math.max(1.2, 1.8 * s * OPPONENT_SIZE_SCALE);
    const lkAlpha  = (0.28 + op.lockFrac * 0.58) * op.alpha;

    ctx.globalAlpha = lkAlpha;
    ctx.strokeStyle = "#ff4030";
    ctx.lineWidth   = bW;
    ctx.shadowColor = "#ff4030";
    ctx.shadowBlur  = 6 + op.lockFrac * 12;
    ctx.lineCap     = "square";

    ctx.beginPath();
    // top-left
    ctx.moveTo(x - lockR + arm, y - lockR);
    ctx.lineTo(x - lockR,       y - lockR);
    ctx.lineTo(x - lockR,       y - lockR + arm);
    // top-right
    ctx.moveTo(x + lockR - arm, y - lockR);
    ctx.lineTo(x + lockR,       y - lockR);
    ctx.lineTo(x + lockR,       y - lockR + arm);
    // bottom-left
    ctx.moveTo(x - lockR + arm, y + lockR);
    ctx.lineTo(x - lockR,       y + lockR);
    ctx.lineTo(x - lockR,       y + lockR - arm);
    // bottom-right
    ctx.moveTo(x + lockR - arm, y + lockR);
    ctx.lineTo(x + lockR,       y + lockR);
    ctx.lineTo(x + lockR,       y + lockR - arm);
    ctx.stroke();

    // Central dot when fully locked
    if (op.lockFrac > 0.55) {
      const dotFrac = clamp((op.lockFrac - 0.55) / 0.45, 0, 1);
      ctx.globalAlpha = dotFrac * 0.72 * op.alpha;
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = "#ff4030";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, size * 0.20), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function _renderBullet(ctx, view) {
  _renderBulletView(ctx, view);
}

function _renderBulletView(ctx, view) {
  ctx.save();

  const { x, y, tailX, tailY, kind, isIncoming, approach, radius, palette, outgoingGlowBoost = 0, overshootFade = 1 } = view;
  const isLob = kind === "lob";
  const color = palette.color;

  // Outgoing bullets at far depth: boost alpha and glow so they stay readable.
  // Incoming bullets fade quickly once they overshoot past the reticle (overshootFade → 0).
  const baseAlpha = isIncoming
    ? clamp(0.22 + approach * 0.50, 0.22, 0.78) * overshootFade
    : clamp(0.32 + outgoingGlowBoost * 0.42, 0.32, 0.74);

  ctx.globalAlpha = baseAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, radius * (isLob ? 0.30 : 0.18));
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + approach * 20 + outgoingGlowBoost * 24;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();

  if (!isIncoming) {
    ctx.globalAlpha = isLob ? 0.30 : clamp(0.22 + outgoingGlowBoost * 0.28, 0.22, 0.50);
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - radius * 1.55, y);
    ctx.lineTo(x + radius * 1.55, y);
    ctx.stroke();
  }

  ctx.globalAlpha = isIncoming
    ? clamp(0.42 + approach * 0.58, 0.42, 1.0) * overshootFade
    : clamp(0.48 + outgoingGlowBoost * 0.44, 0.48, 0.92);
  ctx.shadowBlur = 14 + approach * 34 + outgoingGlowBoost * 24;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, radius * (isLob ? 0.26 : 0.20));
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = approach > 0.65 ? palette.core : palette.dim;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.44, 0, Math.PI * 2);
  ctx.fill();

  if (view.threatAlpha > 0) {
    ctx.globalAlpha = view.threatAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(CX, RETICLE_Y, 62, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = view.threatAlpha * 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CX - 78, RETICLE_Y);
    ctx.lineTo(CX + 78, RETICLE_Y);
    ctx.moveTo(CX, RETICLE_Y - 78);
    ctx.lineTo(CX, RETICLE_Y + 78);
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
    ctx.fillText("A/D  MOVE    SPACE  LASER    K/L  LOB    ESC  EXIT", CX, H - 8);
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
