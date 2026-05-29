import { CX, H, HORIZON_Y, RETICLE_Y, STATE, TUNING, VERSION_LABEL, W } from "../core/constants.mjs";
import { clamp, lerp, rand } from "../core/math.mjs";
import { project, projectEnemyBullet } from "../systems/projection.mjs";
import { getStage } from "../systems/stages.mjs";

export function renderGame(ctx, game, t) {
  ctx.save();

  const sx = game.shake ? rand(-game.shake, game.shake) : 0;
  const sy = game.shake ? rand(-game.shake, game.shake) : 0;
  ctx.translate(sx, sy);

  renderBackground(ctx, game, t);
  renderDepthGrid(ctx, game);
  renderEnemies(ctx, game);
  renderEnemyBullets(ctx, game);
  renderPlayerFire(ctx, game);
  renderParticles(ctx, game);
  renderCockpit(ctx, game);
  renderHud(ctx, game);

  if (game.state === STATE.STAGE_CLEAR) {
    const next = game.wave.stageIndex + 2;
    renderCenterMessage(ctx, "STAGE CLEAR", `Loading Stage ${next}`);
  } else if (game.state === STATE.CLEAR) {
    renderCenterMessage(ctx, "SECTOR CLEAR", "Press R / Enter to restart");
  } else if (game.state === STATE.GAME_OVER) {
    renderCenterMessage(ctx, "COCKPIT BREACHED", "Press R / Enter to restart");
  }

  ctx.restore();
}

function renderBackground(ctx, game, t) {
  const stage = getStage(game.wave.stageIndex);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#02030a");
  g.addColorStop(0.42, stage.id.includes("crossfire") || stage.id.includes("chaos") ? "#170826" : "#06142a");
  g.addColorStop(1, "#0b111b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H * 0.74);
  ctx.clip();

  for (const s of game.stars) {
    const px = CX + (s.x - game.player.x * (0.28 / s.z)) / s.z;
    const py = s.y / s.z + Math.sin(t * 0.001 + s.tw) * 0.6;
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

function renderDepthGrid(ctx, game) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(52, 247, 255, 0.28)";
  ctx.lineWidth = 1;

  for (let i = -5; i <= 5; i++) {
    const x1 = CX + (i * 110 - game.player.x) * 0.2;
    const x2 = CX + (i * 110 - game.player.x) * 1.45;
    ctx.beginPath();
    ctx.moveTo(x1, HORIZON_Y);
    ctx.lineTo(x2, H * 0.72);
    ctx.stroke();
  }

  for (let z = 1.35; z >= 0.28; z -= 0.18) {
    const y = HORIZON_Y + 80 / z;
    const width = 1080 / z;
    ctx.beginPath();
    ctx.moveTo(CX - width * 0.5, y);
    ctx.lineTo(CX + width * 0.5, y);
    ctx.stroke();
  }

  ctx.restore();
}

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

function renderPlayerFire(ctx, game) {
  if (game.player.muzzleFlash <= 0) return;

  const a = game.player.muzzleFlash / 70;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = "#78ff9d";
  ctx.shadowColor = "#78ff9d";
  ctx.shadowBlur = 20;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CX, H * 0.72);
  ctx.lineTo(CX, HORIZON_Y - 45);
  ctx.stroke();

  ctx.fillStyle = "rgba(120, 255, 157, 0.5)";
  ctx.beginPath();
  ctx.arc(CX, H * 0.72, 16 + a * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

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

function renderCockpit(ctx, game) {
  ctx.save();

  ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 0);
  ctx.lineTo(130, 0);
  ctx.lineTo(250, H * 0.74);
  ctx.lineTo(440, H);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(W, H);
  ctx.lineTo(W, 0);
  ctx.lineTo(W - 130, 0);
  ctx.lineTo(W - 250, H * 0.74);
  ctx.lineTo(W - 440, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#050a12";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.lineTo(W - 345, H * 0.73);
  ctx.quadraticCurveTo(CX, H * 0.65, 345, H * 0.73);
  ctx.closePath();
  ctx.fill();

  const dashGrad = ctx.createLinearGradient(0, H * 0.68, 0, H);
  dashGrad.addColorStop(0, "rgba(15, 40, 61, 0.76)");
  dashGrad.addColorStop(1, "rgba(2, 6, 12, 0.96)");
  ctx.fillStyle = dashGrad;
  ctx.beginPath();
  ctx.moveTo(160, H);
  ctx.lineTo(W - 160, H);
  ctx.lineTo(W - 330, H * 0.76);
  ctx.quadraticCurveTo(CX, H * 0.70, 330, H * 0.76);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(52, 247, 255, 0.58)";
  ctx.lineWidth = 3;
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#34f7ff";
  ctx.beginPath();
  ctx.moveTo(250, H * 0.74);
  ctx.lineTo(440, H);
  ctx.moveTo(W - 250, H * 0.74);
  ctx.lineTo(W - 440, H);
  ctx.moveTo(345, H * 0.76);
  ctx.quadraticCurveTo(CX, H * 0.70, W - 345, H * 0.76);
  ctx.stroke();

  drawReticle(ctx);

  if (game.player.hurtFlash > 0) {
    ctx.globalAlpha = game.player.hurtFlash / 260 * 0.35;
    ctx.fillStyle = "#ff365d";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawReticle(ctx) {
  ctx.save();
  ctx.translate(CX, RETICLE_Y);
  ctx.strokeStyle = "rgba(216, 251, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#34f7ff";
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

function renderHud(ctx, game) {
  const stage = getStage(game.wave.stageIndex);

  ctx.save();

  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#d8fbff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 8;
  ctx.fillText(VERSION_LABEL, 34, 26);

  ctx.shadowBlur = 0;
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText(`STAGE ${game.wave.stageIndex + 1}: ${stage.name} — ${stage.subtitle}`, 34, 58);

  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText("A/D or ←/→ STRAFE    SPACE/J FIRE    R RESTART", 34, 84);

  drawHealth(ctx, game, 34, H - 82);
  drawScore(ctx, game, W - 300, 28);
  drawRailGauge(ctx, game);

  const living = game.enemies.filter(e => e.alive).length;
  const active = game.enemies.filter(e => e.alive && e.active).length;
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(`TARGETS: ${living}/${game.enemies.length}`, W - 300, 92);

  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText(`ACTIVE ROW: ${active}`, W - 300, 120);

  if (game.wave.lastBehaviorId) {
    ctx.fillText(`PATTERN: ${game.wave.lastBehaviorId}`, W - 300, 146);
  }

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

function drawScore(ctx, game, x, y) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(`SCORE ${game.score}`, x, y);

  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  const accuracy = game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;
  ctx.fillText(`COMBO ${game.combo}  ACC ${accuracy}%`, x, y + 34);
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
  ctx.strokeStyle = "rgba(52,247,255,0.45)";
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = "#34f7ff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(px, gy + gh * 0.5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderCenterMessage(ctx, title, sub) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = title.includes("BREACHED") ? "#ff365d" : "#78ff9d";
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
