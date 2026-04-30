// Owns player sprite, sword, shield, walk-cycle, divider, and reunion character helpers.
// renderer.js composes this via createCharacterRenderer.

export function createCharacterRenderer(ctx, images, consts, helpers) {
  const {
    FRAME_W, FRAME_H, SPRITE_W, SPRITE_H,
    SWORD_SRC_W, SWORD_SRC_H, SWORD_W, SWORD_H, SWORD_THRUSTS,
    SHIELD_W, SHIELD_GAP, SHIELD_SCALES,
    GROUND_TOP, PLAYER_Y,
    BOY_LOCAL_X, GIRL_LOCAL_X,
    CANVAS_H, DIVIDER_X,
    WALK_FRAMES, WALK_SPEED,
  } = consts;

  const { shieldActionStep } = helpers;

  function tickAnim(walkAnim) {
    walkAnim.tick++;
    if (walkAnim.tick >= WALK_SPEED) {
      walkAnim.tick    = 0;
      walkAnim.walkIdx = (walkAnim.walkIdx + 1) % WALK_FRAMES.length;
    }
    walkAnim.frame = WALK_FRAMES[walkAnim.walkIdx];
  }

  function blit(img, frame, srcW, srcH, x, y, dw, dh, flipX, scaleY) {
    ctx.save();
    if (flipX && scaleY !== 1) {
      ctx.translate(x + dw, y); ctx.scale(-1, scaleY);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else if (flipX) {
      ctx.translate(x + dw, y); ctx.scale(-1, 1);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else if (scaleY !== 1) {
      ctx.translate(x, y); ctx.scale(1, scaleY);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, x, y, dw, dh);
    }
    ctx.restore();
  }

  function drawSword(screenX, screenY, flipX, step) {
    if (!images.sword) return;
    const ALPHAS  = [0.6, 1.0, 0.6];
    const alpha   = ALPHAS[step];
    const thrust  = SWORD_THRUSTS[step];
    const hy      = screenY + SPRITE_H * 0.65 - SWORD_H / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (flipX) {
      const handleX = screenX + SPRITE_W * 0.45 - thrust;
      ctx.translate(handleX, hy + SWORD_H / 2);
      ctx.scale(-1, 1);
      ctx.drawImage(images.sword, 0, 0, SWORD_SRC_W, SWORD_SRC_H, 0, -SWORD_H / 2, SWORD_W, SWORD_H);
    } else {
      const handleX = screenX + SPRITE_W * 0.55 + thrust;
      ctx.drawImage(images.sword, 0, 0, SWORD_SRC_W, SWORD_SRC_H, handleX, hy, SWORD_W, SWORD_H);
    }
    ctx.restore();
  }

  function drawShield(screenX, screenY, flipX, step) {
    const ALPHAS = [0.5, 1.0, 0.5];
    const alpha  = ALPHAS[step];
    const scl    = SHIELD_SCALES[step];
    const sw     = SHIELD_W;
    const sh     = SPRITE_H * scl;
    const sx     = flipX ? screenX - sw - SHIELD_GAP : screenX + SPRITE_W + SHIELD_GAP;
    const sy     = screenY + (SPRITE_H - sh) / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#88aaff';
    ctx.shadowBlur  = 16;
    ctx.fillStyle   = '#aaccff';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(sx + 2, sy + 4, sw - 4, sh - 8);
    ctx.restore();
  }

  function drawPlayerSprite(offsetX, player, facing, walkAnim, side, gameTick) {
    const img    = side === 'boy' ? images.boy : images.girl;
    const localX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;
    const flipX  = facing === 'left';
    const isFinished = player.state === 'finished';

    if (gameTick != null) {
      walkAnim.frame = WALK_FRAMES[Math.floor(gameTick / WALK_SPEED) % WALK_FRAMES.length];
    } else {
      tickAnim(walkAnim);
    }

    const vs     = isFinished ? { state: 'running', actionTick: 0 } : (player.animState || { state: 'running', actionTick: 0 });
    const vState = isFinished ? 'running' : (player.state === 'crouching' ? 'crouch' : vs.state);

    const screenX = offsetX + localX;
    let   screenY = isFinished ? PLAYER_Y : (PLAYER_Y - (player.jumpY || 0));
    let   scaleY  = 1;

    if (vState === 'crouch') {
      scaleY  = 0.5;
      screenY = PLAYER_Y + SPRITE_H * 0.5;
    }

    const step = shieldActionStep(vs.actionTick);
    if (vState === 'attack') drawSword(screenX, screenY, flipX, step);

    const hitFlash = vState === 'hit' && (Math.floor(Date.now() / 80) % 2 === 0);
    ctx.save();
    if (hitFlash) ctx.globalAlpha = 0.35;
    blit(img, walkAnim.frame, FRAME_W, FRAME_H, screenX, screenY, SPRITE_W, SPRITE_H, flipX, scaleY);
    ctx.restore();

    if (vState === 'block') drawShield(screenX, screenY, flipX, step);
  }

  function drawDivider() {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(DIVIDER_X - 1, 0, 2, CANVAS_H);
  }

  function drawCharacterAtAbsX(absX, img, facing, walkAnim, gameTick) {
    if (gameTick != null) {
      walkAnim.frame = WALK_FRAMES[Math.floor(gameTick / WALK_SPEED) % WALK_FRAMES.length];
    } else {
      tickAnim(walkAnim);
    }
    blit(img, walkAnim.frame, FRAME_W, FRAME_H, absX, PLAYER_Y, SPRITE_W, SPRITE_H, facing === 'left', 1);
  }

  function drawHeart(cx, cy, size) {
    const x = cx - size / 2;
    const y = cy - size / 2;
    const w = size, h = size;
    ctx.save();
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h / 4);
    ctx.quadraticCurveTo(x + w / 2, y,       x + w * 3 / 4, y);
    ctx.quadraticCurveTo(x + w,     y,       x + w,         y + h / 4);
    ctx.quadraticCurveTo(x + w,     y + h / 2, x + w / 2,  y + h * 3 / 4);
    ctx.quadraticCurveTo(x,         y + h / 2, x,           y + h / 4);
    ctx.quadraticCurveTo(x,         y,       x + w / 4,     y);
    ctx.quadraticCurveTo(x + w / 2, y,       x + w / 2,     y + h / 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return { drawPlayerSprite, drawSword, drawShield, blit, drawDivider, drawCharacterAtAbsX, drawHeart, tickAnim };
}
