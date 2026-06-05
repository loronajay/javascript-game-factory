import { W, H, CX, RETICLE_Y, TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";
import { project, projectEnemyBullet } from "../systems/projection.mjs";
import { RenderQuality } from "./quality.mjs";

export function renderEnemies(ctx, game) {
  const ordered = RenderQuality.lowPerf
    ? game.enemies
    : game.enemies.slice().sort((a, b) => b.z - a.z);

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
  const regenFlashing = (enemy.regenFlash ?? 0) > 0;
  const overseerExposed = enemy.type === "overseer" && enemy.laser?.exposed;

  const phased = enemy.phased ?? false;
  const phasingOut = enemy.phaseState === "phasing_out";
  const phasingIn  = enemy.phaseState === "phasing_in";

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  if (phased) {
    ctx.globalAlpha = 0.06 + Math.random() * 0.05;
  } else if (phasingOut || phasingIn) {
    ctx.globalAlpha = Math.random() < 0.45 ? 0.12 : 0.88;
  }

  ctx.shadowBlur  = hitFlash ? 28 : regenFlashing ? 32 : overseerExposed ? 36 : telegraphing ? 30 : 16;
  ctx.shadowColor = hitFlash ? "#ffffff" : regenFlashing ? "#44ddcc" : overseerExposed ? "#78ff9d" : telegraphing ? "#ff365d" : enemy.color;
  ctx.fillStyle   = hitFlash ? "#ffffff" : regenFlashing ? "#44ddcc" : telegraphing ? "#ff365d" : enemy.color;
  ctx.strokeStyle = regenFlashing ? "#44ddcc" : overseerExposed ? "#78ff9d" : telegraphing ? "#ffd1dc" : "#b9fbff";
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

  if (shape === "phantom") {
    ctx.moveTo(0, -size * 0.70);
    ctx.lineTo(size * 0.18, -size * 0.28);
    ctx.lineTo(size * 0.52, size * 0.10);
    ctx.lineTo(size * 0.26, size * 0.08);
    ctx.lineTo(size * 0.10, size * 0.54);
    ctx.lineTo(0, size * 0.36);
    ctx.lineTo(-size * 0.10, size * 0.54);
    ctx.lineTo(-size * 0.26, size * 0.08);
    ctx.lineTo(-size * 0.52, size * 0.10);
    ctx.lineTo(-size * 0.18, -size * 0.28);
    ctx.closePath();
    return;
  }

  if (shape === "tracer") {
    ctx.moveTo(0, -size * 0.82);
    ctx.lineTo(size * 0.11, -size * 0.10);
    ctx.lineTo(size * 0.44, size * 0.32);
    ctx.lineTo(size * 0.08, size * 0.14);
    ctx.lineTo(0, size * 0.52);
    ctx.lineTo(-size * 0.08, size * 0.14);
    ctx.lineTo(-size * 0.44, size * 0.32);
    ctx.lineTo(-size * 0.11, -size * 0.10);
    ctx.closePath();
    return;
  }

  if (shape === "caster") {
    ctx.arc(0, 0, size * 0.52, 0, Math.PI * 2);
    return;
  }

  if (shape === "overseer") {
    ctx.moveTo(0, -size * 0.76);
    ctx.lineTo(size * 0.54, -size * 0.30);
    ctx.lineTo(size * 0.72, size * 0.18);
    ctx.lineTo(size * 0.36, size * 0.52);
    ctx.lineTo(0, size * 0.72);
    ctx.lineTo(-size * 0.36, size * 0.52);
    ctx.lineTo(-size * 0.72, size * 0.18);
    ctx.lineTo(-size * 0.54, -size * 0.30);
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

  if (shape === "caster") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(170,255,68,0.7)";
    ctx.lineWidth = Math.max(1.5, size * 0.04);
    ctx.shadowColor = "#aaff44";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    return;
  }

  if (shape === "overseer") {
    ctx.beginPath();
    ctx.arc(0, -size * 0.10, size * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,100,0,0.9)";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.shadowColor = "#ff6600";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, -size * 0.10, size * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    return;
  }

  if (shape === "phantom" || shape === "tracer") {
    ctx.beginPath();
    ctx.arc(0, -size * 0.08, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
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

export function renderOverseerLasers(ctx, game, t) {
  for (const enemy of game.enemies) {
    if (!enemy.alive || enemy.type !== "overseer" || !enemy.laser) continue;

    const laser = enemy.laser;
    if (laser.state === "idle" || laser.state === "vulnerable") continue;

    const ep = project(enemy.x, enemy.y, enemy.z, game.player.x);

    if (laser.state === "charging") {
      ctx.save();
      const pulse = 0.28 + Math.sin(t * 0.014) * 0.14;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#ff6600";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ep.x, ep.y);
      ctx.lineTo(CX + (laser.targetX - game.player.x), RETICLE_Y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (laser.state === "locked") {
      const pulse = 0.55 + Math.sin(t * 0.028) * 0.30;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#ff2200";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ff2200";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.moveTo(ep.x, ep.y);
      ctx.lineTo(CX + (laser.lockedX - game.player.x), RETICLE_Y);
      ctx.stroke();
      ctx.restore();
    }

    if (laser.state === "firing") {
      const lx = CX + (laser.lockedX - game.player.x);
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = "#ff6600";
      ctx.lineWidth = 10;
      ctx.shadowColor = "#ff9900";
      ctx.shadowBlur = 44;
      ctx.beginPath();
      ctx.moveTo(ep.x, ep.y);
      ctx.lineTo(lx, RETICLE_Y);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(ep.x, ep.y);
      ctx.lineTo(lx, RETICLE_Y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function renderEnemyBullets(ctx, game) {
  const ordered = RenderQuality.lowPerf
    ? game.enemyBullets
    : game.enemyBullets.slice().sort((a, b) => b.z - a.z);

  for (const b of ordered) {
    const p = projectEnemyBullet(b, game.player);
    const closeness = p.approach;
    const wobbleX = Math.sin(b.age * 0.008 + b.wobble) * (1 - closeness) * 8;
    const x = p.x + wobbleX;
    const y = p.y;
    let bColor = "#ff365d";
    let bScale = 1;
    if (b.isRunnerBullet) { bColor = "#ff9900"; bScale = 1.65; }
    else if (b.isHoming)  { bColor = "#ff2db5"; bScale = 1.10; }
    else if (b.isBloom)   { bColor = "#aaff44"; bScale = 1.45; }
    else if (b.isFragment){ bColor = "#aaff44"; bScale = 0.90; }
    const r = TUNING.enemyBulletBaseSize * p.s * lerp(0.85, 1.45, closeness) * bScale;

    ctx.save();

    const oldZ = b.z;
    b.z = Math.min(b.startZ, oldZ + 0.16);
    const tail = projectEnemyBullet(b, game.player);
    b.z = oldZ;

    ctx.globalAlpha = clamp(0.20 + closeness * 0.48, 0.20, 0.78);
    ctx.strokeStyle = bColor;
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.shadowBlur = 16 + closeness * 26;
    ctx.shadowColor = bColor;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.globalAlpha = clamp(0.38 + closeness, 0.38, 1);
    ctx.shadowBlur = 16 + closeness * 36;
    ctx.shadowColor = bColor;

    ctx.strokeStyle = bColor;
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    const fillA = closeness > 0.68 ? "0.38" : "0.18";
    ctx.fillStyle = b.isRunnerBullet
      ? `rgba(255, 153, 0, ${fillA})`
      : `rgba(255, 54, 93, ${fillA})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    if (closeness > 0.55 && p.laneDistance <= TUNING.enemyBulletLaneHitWindow) {
      ctx.globalAlpha = 0.18 + closeness * 0.36;
      ctx.beginPath();
      ctx.arc(CX, RETICLE_Y, TUNING.playerHitWindow, 0, Math.PI * 2);
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}
