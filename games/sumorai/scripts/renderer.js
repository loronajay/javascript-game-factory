import { getSprite } from './assets.js';
import { currentFrame, spriteName } from './player.js';
import { getAttackHitbox, getDashHitbox, isAttackActive, isDashAttackActive } from './combat.js';
import { DASH_CHARGE_MAX } from './physics.js';
import {
  VIEWPORT_W, VIEWPORT_H,
  PLAYER_SCALE, PLAYER_W, PLAYER_H,
  FLOOR_Y, FLOOR_DRAW_Y, FLOOR_H, FLOOR_LEFT, FLOOR_RIGHT,
} from './stage.js';

const DASH_CHARGE_MIN = 20; // flash starts after a short deliberate hold

// Pixels below the bridge image's top rail where characters physically stand.
// Matches the FLOOR_Y vs FLOOR_DRAW_Y offset so all platforms look consistent.
const PLAT_RAIL_OFFSET = 18;

// Shadow SVG natural size
const SHADOW_W = 39.25;
const SHADOW_H = 9.45;

let scaleFactor = 1;

function setScaleFactor(sf) {
  scaleFactor = sf;
}

function applyCamera(ctx, canvas, camera) {
  const sf = scaleFactor * camera.zoom;
  ctx.setTransform(
    sf, 0,
    0,  sf,
    canvas.width  / 2 - camera.x * sf,
    canvas.height / 2 - camera.y * sf,
  );
}

function resetTransform(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ── World-space draws ────────────────────────────────────────────────────────

function drawBackground(ctx, canvas) {
  // Screen-space: always fills the physical canvas, no camera transform applied
  const bg = getSprite('Stage', 'forest');
  if (bg?.complete && bg.naturalWidth) {
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#1a3010';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawFloor(ctx) {
  const img = getSprite('Floor_Sprite', 'bridge');
  const w = FLOOR_RIGHT - FLOOR_LEFT;  // 1040 world units wide (extends past viewport edges)
  if (img?.complete && img.naturalWidth) {
    ctx.drawImage(img, FLOOR_LEFT, FLOOR_DRAW_Y, w, FLOOR_H);
  } else {
    ctx.fillStyle = '#c8943a';
    ctx.fillRect(FLOOR_LEFT, FLOOR_DRAW_Y, w, FLOOR_H);
  }
}

function drawPlatforms(ctx, platforms) {
  const img = getSprite('Floor_Sprite', 'bridge');
  for (const plat of platforms) {
    const platX  = plat.cx - plat.hw;
    const platW  = plat.hw * 2;
    const drawY  = plat.y - PLAT_RAIL_OFFSET;
    if (img?.complete && img.naturalWidth) {
      ctx.drawImage(img, platX, drawY, platW, FLOOR_H);
    } else {
      ctx.fillStyle = '#c8943a';
      ctx.fillRect(platX, drawY, platW, FLOOR_H);
    }
  }
}

function drawShadow(ctx, player, platforms) {
  const img = getSprite('p1_-_shadow', 'costume1');
  if (!img?.complete || !img.naturalWidth) return;

  const left  = player.x - PLAYER_W / 2;
  const right = player.x + PLAYER_W / 2;
  const feet  = player.y + PLAYER_H / 2;

  // Find the nearest surface directly below the player's feet.
  // Platforms take priority over floor; among platforms pick the closest one (min y that >= feet).
  let shadowY = null;
  for (const plat of platforms) {
    const overPlat = right > plat.cx - plat.hw && left < plat.cx + plat.hw;
    if (overPlat && feet <= plat.y) {
      if (shadowY === null || plat.y < shadowY) shadowY = plat.y;
    }
  }
  if (shadowY === null && left < FLOOR_RIGHT && right > FLOOR_LEFT) {
    shadowY = FLOOR_Y;
  }
  if (shadowY === null) return;  // off every surface — no shadow

  // Shrink and fade with height above surface
  const t       = Math.min(1, Math.max(0, (shadowY - feet) / 150));
  const scale   = 1 - t * 0.5;
  const opacity = 0.45 * (1 - t * 0.8);

  const w = SHADOW_W * scale;
  const h = SHADOW_H * scale;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, player.x - w / 2, shadowY - h / 2, w, h);
  ctx.globalAlpha = 1;
}

function drawProjectile(ctx, proj) {
  if (!proj?.active) return;
  const img = getSprite('P1_-_projectile', 'costume1');
  if (img?.complete && img.naturalWidth) {
    // Draw at natural pixel size — projectile SVGs are already small
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    ctx.drawImage(img, proj.x - w / 2, proj.y - h / 2, w, h);
  } else {
    ctx.fillStyle = proj.owner === 'p1' ? '#4a9eff' : '#ff4a4a';
    ctx.fillRect(proj.x - 8, proj.y - 6, 16, 12);
  }
}

function drawHitboxes(ctx, p1, p2) {
  for (const p of [p1, p2]) {
    if (p.dead || p.dying) continue;
    const attackActive = isAttackActive(p);
    const dashActive   = isDashAttackActive(p);
    if (!attackActive && !dashActive) continue;

    // costume1 = attack swing, costume2 = dash body
    const frame = attackActive ? 'costume1' : 'costume2';
    const img   = getSprite('P1_hitbox', frame);
    if (!img?.complete || !img.naturalWidth) continue;

    const box = attackActive ? getAttackHitbox(p) : getDashHitbox(p);
    const cx  = (box.left + box.right)  / 2;
    const cy  = (box.top  + box.bottom) / 2;
    // Scale hitbox sprite by PLAYER_SCALE to match the player's rendered size
    const w   = img.naturalWidth  * PLAYER_SCALE;
    const h   = img.naturalHeight * PLAYER_SCALE;

    ctx.save();
    ctx.translate(cx, cy);
    if (p.facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawPlayer(ctx, player) {
  if (player.dead) return;

  const frame = currentFrame(player);
  const img   = getSprite('Player_1', frame);

  const feetX = player.x;
  const feetY = player.y + PLAYER_H / 2;

  ctx.save();
  ctx.translate(feetX, feetY);
  if (player.facing === -1) ctx.scale(-1, 1);

  // Dash-charge: flash white and hue-shift while holding the charge button
  if (player.dashCharge >= DASH_CHARGE_MIN) {
    const ratio = Math.min((player.dashCharge - DASH_CHARGE_MIN) / (DASH_CHARGE_MAX - DASH_CHARGE_MIN), 1);
    const pulse = Math.abs(Math.sin(player.dashCharge * 0.5));
    const brightness = 1 + pulse * (2 + ratio * 6);
    ctx.filter = `brightness(${brightness.toFixed(2)}) hue-rotate(${Math.round(ratio * 200)}deg)`;
  }

  if (img?.complete && img.naturalWidth) {
    const w = img.naturalWidth  * PLAYER_SCALE;
    const h = img.naturalHeight * PLAYER_SCALE;
    ctx.drawImage(img, -w / 2, -h, w, h);
  } else {
    ctx.fillStyle = player.side === 'p1' ? '#4a9eff' : '#ff4a4a';
    ctx.fillRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H);
  }

  ctx.restore();
}

// ── Screen-space post-processing ─────────────────────────────────────────────

// Approximates Scratch's color effect (hue shift) with a multiply blend that
// suppresses warm channels and preserves blue, giving a cool night-time cast.
function drawNightTint(ctx, canvas) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(140, 160, 240)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawBlastEffect(ctx, canvas, camera, loser, t) {
  const frameIdx = Math.min(Math.floor(t / 10), 2);
  const img = getSprite('P1_-_Death', String(frameIdx + 1));
  if (!img?.complete || !img.naturalWidth) return;
  const sf = scaleFactor * camera.zoom;
  const sx = canvas.width  / 2 + (loser.x - camera.x) * sf;
  const sy = canvas.height / 2 + (loser.y - camera.y) * sf;
  const w  = img.naturalWidth  * PLAYER_SCALE * 2;
  const h  = img.naturalHeight * PLAYER_SCALE * 2;
  ctx.save();
  ctx.translate(sx, sy);
  if (loser.facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawSpotlight(ctx, canvas, camera, loser, alpha) {
  const sf = scaleFactor * camera.zoom;
  const sx = canvas.width  / 2 + (loser.x - camera.x) * sf;
  const sy = canvas.height / 2 + (loser.y - camera.y) * sf;

  const topW    = 18 * sf;
  const bottomW = 65 * sf;
  const coneBot = sy + 20 * sf;

  // Layer 1: soft radial vignette centered on the player (smooth feel from the original)
  const radGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 260 * sf);
  radGrad.addColorStop(0,    'rgba(0,0,0,0)');
  radGrad.addColorStop(0.25, `rgba(0,0,0,${alpha * 0.25})`);
  radGrad.addColorStop(1,    `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Layer 2: extra darkening OUTSIDE the cone only — adds beam directionality
  // without a hard edge (the radial above already softened the surrounding scene)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.moveTo(sx - topW, 0);
  ctx.lineTo(sx + topW, 0);
  ctx.lineTo(sx + bottomW, coneBot);
  // Rounded bottom: quadratic curve bowing downward so the edge blends naturally
  ctx.quadraticCurveTo(sx, coneBot + bottomW * 0.35, sx - bottomW, coneBot);
  ctx.closePath();
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.42})`;
  ctx.fill('evenodd');
  ctx.restore();

  // Layer 3: atmospheric beam glow inside the cone
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx - topW, 0);
  ctx.lineTo(sx + topW, 0);
  ctx.lineTo(sx + bottomW, coneBot);
  ctx.quadraticCurveTo(sx, coneBot + bottomW * 0.35, sx - bottomW, coneBot);
  ctx.closePath();
  ctx.clip();
  const beamGrad = ctx.createLinearGradient(sx, 0, sx, coneBot);
  beamGrad.addColorStop(0,   `rgba(160,205,255,${alpha * 0.10})`);
  beamGrad.addColorStop(0.8, `rgba(160,205,255,${alpha * 0.03})`);
  beamGrad.addColorStop(1,   'rgba(160,205,255,0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Layer 4: soft pool of light at the player's feet
  const poolGrad = ctx.createRadialGradient(sx, coneBot, 0, sx, coneBot, bottomW * 1.4);
  poolGrad.addColorStop(0,   `rgba(160,205,255,${alpha * 0.16})`);
  poolGrad.addColorStop(0.5, `rgba(160,205,255,${alpha * 0.05})`);
  poolGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = poolGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Main render call ─────────────────────────────────────────────────────────

function render(ctx, canvas, gameState, camera) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  resetTransform(ctx);
  drawBackground(ctx, canvas);

  applyCamera(ctx, canvas, camera);
  drawFloor(ctx);
  drawPlatforms(ctx, gameState.platforms);
  drawShadow(ctx, gameState.p1, gameState.platforms);
  drawShadow(ctx, gameState.p2, gameState.platforms);
  drawProjectile(ctx, gameState.p1Projectile);
  drawProjectile(ctx, gameState.p2Projectile);
  drawPlayer(ctx, gameState.p1);
  drawPlayer(ctx, gameState.p2);
  drawHitboxes(ctx, gameState.p1, gameState.p2);

  resetTransform(ctx);
  drawNightTint(ctx, canvas);

  const re = gameState.roundEnd;
  if (re) {
    const t = re.tick;
    if (!re.fadingIn) {
      const loser = gameState[re.loser];
      // Blast sprite only for blast-zone exits (ticks 0–30)
      if (re.isBlastKill && t < 30) {
        drawBlastEffect(ctx, canvas, camera, loser, t);
      }
      // Spotlight — starts after blast for blast kills, immediately for on-stage kills
      const spotStart = re.isBlastKill ? 30 : 0;
      if (t >= spotStart) {
        const spotAlpha = Math.min((t - spotStart) / 90, 1) * 0.88;
        drawSpotlight(ctx, canvas, camera, loser, spotAlpha);
      }
      // Fade to full black (ticks 150–180)
      if (t >= 150) {
        const alpha = Math.min((t - 150) / 30, 1);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      // Fade in for the next round (ticks 180–240)
      const fadeAlpha = Math.max(0, 1 - (t - 180) / 60);
      ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}

export { render, setScaleFactor };
