import { CX, RETICLE_Y } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { bossPhaseMax } from "../entities/boss.mjs";
import { renderDreadmaw } from "./boss-dreadmaw.mjs";
import { renderArbiter } from "./boss-arbiter.mjs";
import { renderEclipsis } from "./boss-eclipsis.mjs";

const TAU = Math.PI * 2;
const BOSS_NAME = "DREADMAW";

const PHASE_EYE   = ["#34f7ff", "#ffb347", "#ff5cf0"];
const ECLIPSIS_EYE = ["#34d8ff", "#ffb347", "#ff6632", "#a020f0", "#ffffff"];

// ─── Main boss render (dispatcher) ───────────────────────────────────────────

export function renderBoss(ctx, game, t) {
  const boss = game.boss;
  if (!boss) return;

  if (boss.number === 3) { renderEclipsis(ctx, game, t); return; }
  if (boss.number === 2) { renderArbiter(ctx, game, t); return; }
  renderDreadmaw(ctx, game, t);
}

// ─── Boss HUD (health bar + banners) ──────────────────────────────────────────

export function renderBossHud(ctx, game, t) {
  const boss = game.boss;
  if (!boss) return;

  const barW = 620;
  const barH = 18;
  const barX = CX - barW * 0.5;
  const barY = 30;
  const gap = 5;
  const phaseCount = boss.hp.length;
  const segW = (barW - gap * (phaseCount - 1)) / phaseCount;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const displayName = boss.number === 3 ? "ECLIPSIS" : (boss.number === 2 ? "THE ARBITER" : BOSS_NAME);
  const nameColor   = boss.number === 3 ? "#d8c0ff" : (boss.number === 2 ? "#b0f0ff" : "#ffd0d8");
  const nameGlow    = boss.number === 3 ? "#8020c0" : (boss.number === 2 ? "#3af5ff" : "#ff365d");
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillStyle = nameColor;
  ctx.shadowColor = nameGlow;
  ctx.shadowBlur = 10;
  ctx.fillText(displayName, CX, barY - 6);
  ctx.shadowBlur = 0;

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = boss.number === 3 ? "rgba(200, 160, 255, 0.7)" : "rgba(255, 160, 180, 0.7)";
  ctx.fillText(`PHASE ${boss.phase} / ${phaseCount}`, CX + barW * 0.5 - 46, barY - 8);

  const palette = boss.number === 3 ? ECLIPSIS_EYE : PHASE_EYE;
  for (let i = 0; i < phaseCount; i++) {
    const sx = barX + i * (segW + gap);
    const max = bossPhaseMax(boss, i + 1);
    const frac = clamp(boss.hp[i] / max, 0, 1);
    const isCurrent = i === boss.phase - 1;

    ctx.fillStyle = "rgba(8, 6, 12, 0.8)";
    ctx.beginPath();
    ctx.roundRect(sx, barY, segW, barH, 4);
    ctx.fill();

    const fillColor = i < boss.phase - 1 ? "rgba(80,40,50,0.5)" : (palette[i] ?? palette[palette.length - 1]);
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
