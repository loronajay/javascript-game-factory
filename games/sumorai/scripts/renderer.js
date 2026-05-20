import { getSprite } from './assets.js';
import { currentFrame, spriteName } from './player.js';
import { getAttackHitbox, getDashHitbox, isAttackActive, isDashAttackActive } from './combat.js';
import { DASH_CHARGE_MAX } from './physics.js';
import {
  VIEWPORT_W, VIEWPORT_H,
  PLAYER_SCALE, PLAYER_W, PLAYER_H,
  FLOOR_Y, FLOOR_DRAW_Y, FLOOR_H, FLOOR_LEFT, FLOOR_RIGHT,
} from './stage.js';

const DASH_CHARGE_MIN = 1; // flash starts immediately on press

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

function drawPlatformShadows(ctx, platforms) {
  for (const plat of platforms) {
    // Find nearest surface directly below this platform
    let shadowY = FLOOR_Y;
    for (const other of platforms) {
      if (other === plat) continue;
      if (other.y > plat.y && other.y < shadowY) {
        const overlapL = Math.max(plat.cx - plat.hw, other.cx - other.hw);
        const overlapR = Math.min(plat.cx + plat.hw, other.cx + other.hw);
        if (overlapR > overlapL) shadowY = other.y;
      }
    }

    const dist  = shadowY - plat.y;
    const t     = Math.min(1, dist / 200);
    const rx    = plat.hw * 0.9 * (1 - t * 0.15);
    const alpha = 0.45 * (1 - t * 0.5);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0,    `rgba(0,0,0,${alpha})`);
    grad.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.4})`);
    grad.addColorStop(1,    'rgba(0,0,0,0)');

    ctx.save();
    ctx.translate(plat.cx, shadowY);
    ctx.scale(1, 0.12);   // squash into a flat ellipse
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
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
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    ctx.save();
    ctx.translate(proj.x, proj.y);
    if (proj.facing === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
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

  // Hit flash (gridlock loser): briefly override to bright white
  if (player.hitFlashTimer > 0) {
    const ratio = player.hitFlashTimer / 40;
    ctx.filter = `brightness(${(1 + ratio * 7).toFixed(2)}) saturate(0)`;
  // Dash-charge: flash white and hue-shift while holding the charge button
  } else if (player.dashCharge >= DASH_CHARGE_MIN) {
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

function drawShield(ctx, player) {
  if (!player.blocking) return;
  const frame = `shield-${player.shieldAnimFrame + 1}`;
  const img   = getSprite('shield', frame);
  if (!img?.complete || !img.naturalWidth) return;
  const w = img.naturalWidth  * PLAYER_SCALE;
  const h = img.naturalHeight * PLAYER_SCALE;
  // Centered on the player — sphere covers the whole body
  ctx.drawImage(img, player.x - w / 2, player.y - h / 2, w, h);
}

// Drawn BEFORE players so the player body renders on top
function drawBloodEffects(ctx, effects) {
  for (const fx of effects) {
    if (fx.type !== 'blood') continue;
    const img = getSprite('blood', `blood${fx.frame + 1}`);
    if (!img?.complete || !img.naturalWidth) continue;
    const w = img.naturalWidth  * 0.6;
    const h = img.naturalHeight * 0.6;
    ctx.save();
    ctx.translate(fx.x, fx.y);
    if (fx.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// Drawn AFTER players/hitboxes so the spark pops on top
function drawChingEffects(ctx, effects) {
  for (const fx of effects) {
    if (fx.type !== 'ching') continue;
    const img = getSprite('ching', `ching-${fx.frame + 1}`);
    if (!img?.complete || !img.naturalWidth) continue;
    const w = img.naturalWidth  * 0.3;
    const h = img.naturalHeight * 0.3;
    ctx.drawImage(img, fx.x - w / 2, fx.y - h / 2, w, h);
  }
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

// ── HUD ──────────────────────────────────────────────────────────────────────

// Target pixel heights in viewport space — change these to resize HUD elements.
const STAM_TARGET_H   = 92;   // stamina bar panel height in viewport px
const METER_TARGET_H  = 42;   // win-meter panel height in viewport px
const MASH_TARGET_H   = 36;   // mash button sprite height in viewport px
const BANNER_TARGET_H = 72;   // round/fight banner height in viewport px

// Sets up a transform so coordinates map to the 640×360 viewport, letterboxed.
function applyViewport(ctx, canvas) {
  const sf = scaleFactor;
  ctx.setTransform(sf, 0, 0, sf,
    (canvas.width  - VIEWPORT_W * sf) / 2,
    (canvas.height - VIEWPORT_H * sf) / 2,
  );
}

// Draw a sprite at target height; returns the rendered height (0 if missing).
function _hudImg(ctx, spriteName, frame, x, y, targetH, anchorRight = false) {
  const img = getSprite(spriteName, frame);
  if (!img?.complete || !img.naturalWidth) return 0;
  const scale = targetH / img.naturalHeight;
  const w = img.naturalWidth  * scale;
  ctx.drawImage(img, anchorRight ? x - w : x, y, w, targetH);
  return targetH;
}

// Returns STAM_TARGET_H so callers can stack below it.
// All frames share the same scale factor (derived from s10), then bottom-anchor
// so the base of the bar never moves even though each fill-level SVG is a different height.
function drawStaminaHUD(ctx, player, side) {
  const stamina = Math.round(Math.max(0, Math.min(10, player.stamina)));
  const key    = side === 'p1' ? 'p1_-_stamina' : 'p2_-_stamina';
  const refImg = getSprite(key, 's10');
  if (!refImg?.complete || !refImg.naturalWidth) return 0;
  const scale = STAM_TARGET_H / refImg.naturalHeight;
  const refW  = refImg.naturalWidth * scale;          // fixed reference width (from s10)
  const img   = getSprite(key, `s${stamina}`);
  if (!img?.complete || !img.naturalWidth) return 0;
  const w = img.naturalWidth  * scale;
  const h = img.naturalHeight * scale;
  // Bottom-anchor: base of the bar stays at baseY
  const baseY = 52 + STAM_TARGET_H;
  const x     = side === 'p1' ? -75 : VIEWPORT_W - refW + 75;
  ctx.drawImage(img, x, baseY - h, w, h);
  return STAM_TARGET_H;
}

function drawWinMeterHUD(ctx, player, side, stamH) {
  const wins  = Math.min(player.wins, 3);
  const key   = side === 'p1' ? 'P1_-_Wins' : 'P2_-_Wins';
  const frame = side === 'p1'
    ? (wins === 1 ? 'p1-1-win' : `p1-${wins}-wins`)
    : (wins === 1 ? 'p2-1-win' : `p2-${wins}-wins`);
  const refFrame = side === 'p1' ? 'p1-0-wins' : 'p2-0-wins';
  const refImg = getSprite(key, refFrame);
  if (!refImg?.complete || !refImg.naturalWidth) return;
  const scale = METER_TARGET_H / refImg.naturalHeight;
  const w     = refImg.naturalWidth * scale;
  const img   = getSprite(key, frame);
  if (!img?.complete || !img.naturalWidth) return;
  const x = side === 'p1' ? -65 : VIEWPORT_W - w + 65;
  ctx.drawImage(img, x, 52 + stamH + 4, w, METER_TARGET_H);
}

function drawRoundBannerHUD(ctx, gameState) {
  const t = gameState.roundStartTick;

  let frame = null;
  let alpha = 1;

  if (t < 90) {
    frame = `round_${Math.min(gameState.roundNum, 5)}`;
    if      (t < 15)  alpha = t / 15;
    else if (t > 75)  alpha = (90 - t) / 15;
  } else {
    frame = 'FIGHT!';
    const ft = t - 90;
    if      (ft < 15)  alpha = ft / 15;
    else if (ft > 45)  alpha = Math.max(0, (60 - ft) / 15);
  }

  const img = getSprite('ROUND_STARTER', frame);
  if (!img?.complete || !img.naturalWidth) return;
  const scale = BANNER_TARGET_H / img.naturalHeight;
  const w = img.naturalWidth  * scale;
  const h = BANNER_TARGET_H;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, VIEWPORT_W / 2 - w / 2, VIEWPORT_H / 2 - h / 2, w, h);
  ctx.restore();
}

function drawGridlockHUD(ctx, gridlock) {
  const METER_H = 48;   // height of the meter sprite in viewport px
  const GAP     = 12;   // gap between the two meters at center
  const cx      = VIEWPORT_W / 2;
  const cy      = VIEWPORT_H / 2;

  // P1 meter (left of center) — use p1_frame through p1_frame6 for 0–5/5 progress
  const p1Idx   = Math.min(Math.floor(gridlock.p1Progress * 6), 5);
  const p1Frame = p1Idx === 0 ? 'p1_frame' : `p1_frame${p1Idx + 1}`;
  const p1Ref   = getSprite('p1_meter', 'p1_frame6');
  const p1Img   = getSprite('p1_meter', p1Frame);
  if (p1Ref?.complete && p1Ref.naturalWidth && p1Img?.complete && p1Img.naturalWidth) {
    const scale = METER_H / p1Ref.naturalHeight;
    const w = p1Ref.naturalWidth * scale;
    ctx.drawImage(p1Img, cx - GAP / 2 - w, cy - METER_H / 2, w, METER_H);
  }

  // P2 meter (right of center)
  const p2Idx   = Math.min(Math.floor(gridlock.p2Progress * 6), 5);
  const p2Frame = p2Idx === 0 ? 'p2_frame' : `p2_frame${p2Idx + 1}`;
  const p2Ref   = getSprite('p2_meter', 'p2_frame6');
  const p2Img   = getSprite('p2_meter', p2Frame);
  if (p2Ref?.complete && p2Ref.naturalWidth && p2Img?.complete && p2Img.naturalWidth) {
    const scale = METER_H / p2Ref.naturalHeight;
    const w = p2Ref.naturalWidth * scale;
    ctx.drawImage(p2Img, cx + GAP / 2, cy - METER_H / 2, w, METER_H);
  }

  // Mash button prompts flanking the meters
  const p1BtnFrame = gridlock.p1MashFlash > 0 ? 'keyboard_2'              : 'keyboard1';
  const p2BtnFrame = gridlock.p2MashFlash > 0 ? 'UI_Controller_Keys_g157' : 'UI_Controller_Keys_g156';
  const p1BtnImg   = getSprite('mash_p1', p1BtnFrame);
  const p2BtnImg   = getSprite('mash_p2', p2BtnFrame);

  if (p1BtnImg?.complete && p1BtnImg.naturalWidth) {
    const scale = MASH_TARGET_H / p1BtnImg.naturalHeight;
    const w = p1BtnImg.naturalWidth * scale;
    // Get meter width for accurate placement
    const mRef = getSprite('p1_meter', 'p1_frame6');
    const mW   = mRef?.naturalWidth ? mRef.naturalWidth * (METER_H / mRef.naturalHeight) : 50;
    ctx.drawImage(p1BtnImg, cx - GAP / 2 - mW - w - 8, cy - MASH_TARGET_H / 2, w, MASH_TARGET_H);
  }
  if (p2BtnImg?.complete && p2BtnImg.naturalWidth) {
    const scale = MASH_TARGET_H / p2BtnImg.naturalHeight;
    const w = p2BtnImg.naturalWidth * scale;
    const mRef = getSprite('p2_meter', 'p2_frame6');
    const mW   = mRef?.naturalWidth ? mRef.naturalWidth * (METER_H / mRef.naturalHeight) : 50;
    ctx.drawImage(p2BtnImg, cx + GAP / 2 + mW + 8, cy - MASH_TARGET_H / 2, w, MASH_TARGET_H);
  }
}

function drawWinnerBannerHUD(ctx, gameState) {
  if (gameState.phase !== 'match_end') return;
  const re = gameState.roundEnd;
  if (!re || re.winner === 'draw') return;
  const frame = re.winner === 'p1' ? 'P1_Wins' : 'P2_Wins';
  const img = getSprite('ROUND_STARTER', frame);
  if (!img?.complete || !img.naturalWidth) return;
  const scale = BANNER_TARGET_H / img.naturalHeight;
  const w = img.naturalWidth  * scale;
  ctx.drawImage(img, VIEWPORT_W / 2 - w / 2, VIEWPORT_H / 2 - BANNER_TARGET_H / 2, w, BANNER_TARGET_H);
}

function drawHUD(ctx, canvas, gameState) {
  applyViewport(ctx, canvas);

  const showMeters = gameState.phase === 'active'      ||
                     gameState.phase === 'round_start'  ||
                     gameState.phase === 'round_end';
  if (showMeters) {
    const p1StamH = drawStaminaHUD(ctx, gameState.p1, 'p1');
    const p2StamH = drawStaminaHUD(ctx, gameState.p2, 'p2');
    drawWinMeterHUD(ctx, gameState.p1, 'p1', p1StamH);
    drawWinMeterHUD(ctx, gameState.p2, 'p2', p2StamH);
  }

  if (gameState.phase === 'round_start') drawRoundBannerHUD(ctx, gameState);
  if (gameState.phase === 'active' && gameState.p1.inGridlock && gameState.gridlock)
    drawGridlockHUD(ctx, gameState.gridlock);
  drawWinnerBannerHUD(ctx, gameState);
}

// ── Main render call ─────────────────────────────────────────────────────────

function render(ctx, canvas, gameState, camera) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  resetTransform(ctx);
  drawBackground(ctx, canvas);

  applyCamera(ctx, canvas, camera);
  drawFloor(ctx);
  drawPlatformShadows(ctx, gameState.platforms);
  drawPlatforms(ctx, gameState.platforms);
  drawShadow(ctx, gameState.p1, gameState.platforms);
  drawShadow(ctx, gameState.p2, gameState.platforms);
  drawProjectile(ctx, gameState.p1Projectile);
  drawProjectile(ctx, gameState.p2Projectile);
  drawBloodEffects(ctx, gameState.effects);
  drawPlayer(ctx, gameState.p1);
  drawPlayer(ctx, gameState.p2);
  drawShield(ctx, gameState.p1);
  drawShield(ctx, gameState.p2);
  drawHitboxes(ctx, gameState.p1, gameState.p2);
  drawChingEffects(ctx, gameState.effects);

  resetTransform(ctx);
  drawNightTint(ctx, canvas);

  // Red death flash
  if (gameState.deathFlash > 0) {
    ctx.save();
    ctx.globalAlpha = gameState.deathFlash * 0.55;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // White clash flash — screen space, after night tint so it punches through
  if (gameState.clashFlash > 0) {
    ctx.save();
    ctx.globalAlpha = gameState.clashFlash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const re = gameState.roundEnd;
  if (re) {
    const t = re.tick;
    if (!re.fadingIn) {
      const loser = re.loser ? gameState[re.loser] : null;
      if (loser) {
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

  drawHUD(ctx, canvas, gameState);
}

export { render, setScaleFactor };
