import { buildHudModel, createHudRenderer } from './renderer-hud.js';
import { createOnlineRenderer } from './renderer-online.js';
import { createSceneRenderer } from './renderer-scenes.js';
import { createObstacleRenderer } from './renderer-obstacles.js';
import { createCharacterRenderer } from './renderer-characters.js';
import { createDebugRenderer } from './renderer-debug.js';
import { createMenuRenderer } from './renderer-menu.js';
import { createResultsRenderer } from './renderer-results.js';
import {
  HALF_W, PPU,
  FRAME_W, FRAME_H, SPRITE_W, SPRITE_H,
  SWORD_W, SWORD_H, SWORD_THRUSTS,
  BIRD_SCALE, BIRD_BOTTOM, BIRD_FRAME_DATA, BIRD_SPEED_MULT,
  GOBLIN_SCALE, GOBLIN_H,
  GI_FW, GI_FC, GA_FW, GA_FC, GD_FW, GD_FC, GH_FW, GH_FC,
  AR_W, AR_H, AR_SCALE,
  GROUND_TOP, BOY_LOCAL_X, GIRL_LOCAL_X, PLAYER_Y,
  BOY_CONTACT_X, GIRL_CONTACT_X,
  SHIELD_W, SHIELD_GAP, SHIELD_SCALES,
  ACTION_STEP_COUNT, ACTION_STEP_FRAMES,
  projectIncomingX,
  getGoblinFrameMetrics,
  getDyingGoblinFrameMetrics,
  isObstacleOnScreen,
  projectDyingGoblinX,
  shieldActionStep,
  getDebugOverlayGeometry,
} from './renderer-geometry.js';

// ─── Layout ───────────────────────────────────────────────────────────────────
const CANVAS_W  = 960;
const CANVAS_H  = 540;
const DIVIDER_X = HALF_W;

// Sword sprite source dimensions (renderer-characters.js needs these via config)
const SWORD_SRC_W = 65;
const SWORD_SRC_H = 20;

const TILE = HALF_W * 3;   // parallax tile width (1440)

const HUD_SPEED_MIN      = 5;
const HUD_SPEED_SOFT_MAX = 30;
const HUD_CHAIN_SOFT_MAX = 8;

// ─── Emote bubble ─────────────────────────────────────────────────────────────
const EMOTE_DURATION    = 180;
const EMOTE_FADE_FRAMES = 40;
const EMOTE_BUBBLE_W    = 80;
const EMOTE_BUBBLE_H    = 80;
const EMOTE_BUBBLE_Y    = 118;
const EMOTE_BUBBLE_R    = 10;
const EMOTE_SPRITE_SIZE = 56;
const EMOTE_TAIL_LEN    = 18;
const EMOTE_TAIL_HALF   = 10;

// ─── Animation ────────────────────────────────────────────────────────────────
const WALK_FRAMES = [2, 3];
const WALK_SPEED  = 7;

// ─── Factory ──────────────────────────────────────────────────────────────────
function createRenderer(canvas, images, emoteImages = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const { drawBackground: drawSceneBackground } = createSceneRenderer(ctx, {
    HALF_W,
    CANVAS_H,
    GROUND_TOP,
    TILE,
    PPU,
    BOY_LOCAL_X,
    GIRL_LOCAL_X,
  });

  const obstacleRenderer = createObstacleRenderer(ctx, images, {
    PPU, GROUND_TOP, BIRD_BOTTOM, SPRITE_H,
    BOY_LOCAL_X, GIRL_LOCAL_X, BOY_CONTACT_X, GIRL_CONTACT_X,
    BIRD_SCALE, BIRD_FRAME_DATA, BIRD_SPEED_MULT,
    GI_FW, GI_FC, GD_FW, GD_FC, GH_FW, GH_FC,
    GOBLIN_SCALE, GOBLIN_H,
    AR_W, AR_H, AR_SCALE,
  }, { projectIncomingX, getGoblinFrameMetrics, getDyingGoblinFrameMetrics, isObstacleOnScreen, projectDyingGoblinX });

  const characterRenderer = createCharacterRenderer(ctx, images, {
    FRAME_W, FRAME_H, SPRITE_W, SPRITE_H,
    SWORD_SRC_W, SWORD_SRC_H, SWORD_W, SWORD_H, SWORD_THRUSTS,
    SHIELD_W, SHIELD_GAP, SHIELD_SCALES,
    GROUND_TOP, PLAYER_Y,
    BOY_LOCAL_X, GIRL_LOCAL_X,
    CANVAS_H, DIVIDER_X,
    WALK_FRAMES, WALK_SPEED,
  }, { shieldActionStep });

  const debugRenderer = createDebugRenderer(ctx, { getDebugOverlayGeometry });

  const {
    renderMenu,
    renderMenuHelp,
    tickMenuAnims,
    menuWalkFrame: _menuWalkFrame,
    drawSpaceBackground: _drawSpaceBackground,
    drawRedButton: _drawRedButton,
  } = createMenuRenderer(ctx, images, { characterRenderer, obstacleRenderer, debugRenderer });

  const boyAnim  = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };
  const girlAnim = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };

  // Dying goblins — animated independently after being cleared.
  // Each entry: { position, tick }. They stay in world space so runners pass them.
  const boyDying = [];
  const girlDying = [];

  // Lingering cleared obstacles (spikes, bird) — scroll off naturally rather than popping out.
  // Each entry is a copy of the obstacle object (has .position, .type).
  // Caller adds via addTrailObstacle(). Pruned when distDelta < -10.
  const boyTrail = [];
  const girlTrail = [];
  const boyEffects = [];
  const girlEffects = [];

  const boyEmote  = { type: null, frames: 0 };
  const girlEmote = { type: null, frames: 0 };

  // ── Public API ──────────────────────────────────────────────────────────────
  // boyObstacles / girlObstacles: each side's own obstacle list
  // boyBoosts / girlBoosts: each side's boost list ({ distance, collected })
  // elapsed: seconds since run started
  // gameTick: raw 60hz tick count (gs.elapsed) — drives walk cycle deterministically
  function renderPlay(boyPlayer, girlPlayer, boyObstacles, girlObstacles, boyBoosts, girlBoosts, elapsed, debugState, uiState = {}, gameTick = Math.round(elapsed * 60)) {
    const nowMs = Date.now();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawHalf(0,      'boy',  boyAnim,  boyPlayer,  boyObstacles,  boyBoosts,  boyDying,  boyTrail,  boyEffects,  nowMs, debugState?.enabled ? debugState.boy : null, gameTick);
    _drawHalf(HALF_W, 'girl', girlAnim, girlPlayer, girlObstacles, girlBoosts, girlDying, girlTrail, girlEffects, nowMs, debugState?.enabled ? debugState.girl : null, gameTick);
    characterRenderer.drawDivider();
    _drawHUD(boyPlayer, girlPlayer, elapsed, uiState);
    _drawEmoteBubbles();
    if (debugState?.enabled) debugRenderer.drawDebugBanner(debugState);
  }

  // ─── Shared online helpers (also used by result screens) ─────────────────────

  function _formatIdentityLabel(side, identity) {
    const sideLabel = side === 'girl' ? 'Girl' : 'Boy';
    const name = typeof identity?.displayName === 'string' ? identity.displayName.trim() : '';
    return name ? `${name} (${sideLabel})` : sideLabel;
  }

  function _drawOnlineLabel(text, x, y, opts = {}) {
    const font = opts.font || 'bold 12px monospace';
    const padX = opts.padX || 10;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = font;
    const textWidth = Math.max(72, ctx.measureText(text).width + padX * 2);
    const boxH = opts.height || 24;
    ctx.fillStyle = opts.bg || 'rgba(8,18,36,0.88)';
    ctx.fillRect(x - textWidth / 2, y - boxH / 2, textWidth, boxH);
    ctx.strokeStyle = opts.stroke || 'rgba(110,150,235,0.50)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - textWidth / 2, y - boxH / 2, textWidth, boxH);
    ctx.fillStyle = opts.textColor || '#ffffff';
    ctx.fillText(text, x, y + 4);
    ctx.restore();
  }

  const { drawHUD: _drawHUD } = createHudRenderer(ctx, {
    drawOnlineLabel: _drawOnlineLabel,
  });

  const {
    renderOnlineSideSelect,
    renderOnlineNameEntry,
    renderOnlineLobby,
    renderOnlineCountdown,
    renderSoloSideSelect,
    renderSoloCountdown,
  } = createOnlineRenderer(ctx, images, {
    blit: characterRenderer.blit,
    drawSpaceBackground: _drawSpaceBackground,
    drawRedButton: _drawRedButton,
    menuWalkFrame: _menuWalkFrame,
    drawOnlineLabel: _drawOnlineLabel,
    formatIdentityLabel: _formatIdentityLabel,
  });

  function addDyingGoblin(side, obstacle, playerDistance) {
    const list = side === 'boy' ? boyDying : girlDying;
    void playerDistance;
    list.push({ position: obstacle.position, tick: 0 });
  }

  // Call when a spike or bird obstacle is cleared/missed — keeps it rendering until
  // it scrolls off screen. Do NOT call for arrowwall or goblin (those vanish immediately).
  function addTrailObstacle(side, obs) {
    const list = side === 'boy' ? boyTrail : girlTrail;
    list.push({ ...obs });
  }

  function addOutcomeEffect(side, kind, obstacleType) {
    const list = side === 'boy' ? boyEffects : girlEffects;
    list.push({ kind, obstacleType, tick: 0 });
  }

  function clearSideObstacleVisuals(side) {
    const trail = side === 'boy' ? boyTrail : girlTrail;
    const dying = side === 'boy' ? boyDying : girlDying;
    const effects = side === 'boy' ? boyEffects : girlEffects;
    trail.length = 0;
    dying.length = 0;
    effects.length = 0;
  }

  function addEmote(recipientSide, type) {
    const state = recipientSide === 'boy' ? boyEmote : girlEmote;
    state.type   = type;
    state.frames = EMOTE_DURATION;
  }

  function _drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,      y + h, x,      y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y,     x + r, y,               r);
    ctx.closePath();
  }

  function _drawEmoteBubble(recipientSide, state) {
    if (!state.type || state.frames <= 0) return;

    const alpha   = state.frames <= EMOTE_FADE_FRAMES ? state.frames / EMOTE_FADE_FRAMES : 1;
    const centerY = EMOTE_BUBBLE_Y + EMOTE_BUBBLE_H / 2;

    let bubbleX, tailTipX, tailDir;
    if (recipientSide === 'boy') {
      bubbleX  = DIVIDER_X - EMOTE_TAIL_LEN - EMOTE_BUBBLE_W;
      tailTipX = DIVIDER_X - 2;
      tailDir  = 'right';
    } else {
      bubbleX  = DIVIDER_X + EMOTE_TAIL_LEN;
      tailTipX = DIVIDER_X + 2;
      tailDir  = 'left';
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor    = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur     = 8;
    ctx.shadowOffsetX  = 2;
    ctx.shadowOffsetY  = 2;

    _drawRoundRect(bubbleX, EMOTE_BUBBLE_Y, EMOTE_BUBBLE_W, EMOTE_BUBBLE_H, EMOTE_BUBBLE_R);
    ctx.fill();

    ctx.beginPath();
    if (tailDir === 'right') {
      const baseX = bubbleX + EMOTE_BUBBLE_W;
      ctx.moveTo(baseX, centerY - EMOTE_TAIL_HALF);
      ctx.lineTo(tailTipX, centerY);
      ctx.lineTo(baseX, centerY + EMOTE_TAIL_HALF);
    } else {
      ctx.moveTo(bubbleX, centerY - EMOTE_TAIL_HALF);
      ctx.lineTo(tailTipX, centerY);
      ctx.lineTo(bubbleX, centerY + EMOTE_TAIL_HALF);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    const emoteImg = emoteImages[state.type];
    if (emoteImg && emoteImg.complete && emoteImg.naturalWidth > 0) {
      const sprX = bubbleX + (EMOTE_BUBBLE_W - EMOTE_SPRITE_SIZE) / 2;
      const sprY = EMOTE_BUBBLE_Y + (EMOTE_BUBBLE_H - EMOTE_SPRITE_SIZE) / 2;
      ctx.drawImage(emoteImg, sprX, sprY, EMOTE_SPRITE_SIZE, EMOTE_SPRITE_SIZE);
    }

    ctx.restore();

    state.frames--;
    if (state.frames <= 0) state.type = null;
  }

  function _drawEmoteBubbles() {
    _drawEmoteBubble('boy',  boyEmote);
    _drawEmoteBubble('girl', girlEmote);
  }

  // ── Half ────────────────────────────────────────────────────────────────────
  function _drawHalf(offsetX, side, animState, player, obstacles, boosts, dying, trail, effects, nowMs, debugSnapshot, gameTick) {
    const facing = side === 'boy' ? 'right' : 'left';
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, HALF_W, CANVAS_H);
    ctx.clip();
    drawSceneBackground(offsetX, side, player.distance);
    obstacleRenderer.drawTrailObstacles(offsetX, player, facing, trail, nowMs);
    obstacleRenderer.drawFieldObstacles(offsetX, player, facing, obstacles, nowMs);
    obstacleRenderer.drawFieldBoosts(offsetX, player, facing, boosts, side);
    obstacleRenderer.drawDyingGoblins(offsetX, player, facing, dying);
    characterRenderer.drawPlayerSprite(offsetX, player, facing, animState, side, gameTick);
    _drawOutcomeEffects(offsetX, side, effects);
    if (debugSnapshot?.enabled) debugRenderer.drawDebugCollision(offsetX, side, player, obstacles, debugSnapshot, nowMs);
    ctx.restore();
  }

  function _effectY(obstacleType) {
    switch (obstacleType) {
      case 'spikes':    return GROUND_TOP - 18;
      case 'bird':      return BIRD_BOTTOM - 18;
      case 'arrowwall': return GROUND_TOP - 34;
      case 'goblin':    return GROUND_TOP - 44;
default:          return GROUND_TOP - 28;
    }
  }


  const TEXT_DURATION = 42; // frames the grade label stays visible (~0.7s)

  function _drawOutcomeEffects(offsetX, side, effects) {
    const contactX = side === 'boy' ? BOY_CONTACT_X + 10 : GIRL_CONTACT_X - 10;

    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const tText = effect.tick / TEXT_DURATION;
      if (tText >= 1) {
        effects.splice(i, 1);
        continue;
      }

      const cx = offsetX + contactX;
      const cy = _effectY(effect.obstacleType);

      ctx.save();

      // Grade text — floats up, fades out
      if (effect.kind === 'perfect' || effect.kind === 'good' || effect.kind === 'hit') {
        const label = effect.kind === 'perfect' ? 'PERFECT' : effect.kind === 'good' ? 'GOOD' : 'MISS';
        const floatY   = cy - 10 - tText * 22;
        ctx.globalAlpha = Math.max(0, 1 - tText * 1.4);
        ctx.font        = `bold 13px monospace`;
        ctx.textAlign   = 'center';
        ctx.fillStyle   = effect.kind === 'perfect' ? '#ffe040' : effect.kind === 'hit' ? '#ff5555' : '#ffffff';
        ctx.shadowColor = effect.kind === 'perfect' ? '#ffaa00' : effect.kind === 'hit' ? '#aa0000' : 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 6;
        ctx.fillText(label, cx, floatY);
      }

      ctx.restore();
      effect.tick++;
    }
  }
  // ─── Public API ───────────────────────────────────────────────────────────────
  const { renderGameOver, renderScore, renderReunion } = createResultsRenderer(ctx, images, {
    characterRenderer,
    drawSceneBackground,
    drawSpaceBackground: _drawSpaceBackground,
    drawEmoteBubbles:    _drawEmoteBubbles,
    formatIdentityLabel: _formatIdentityLabel,
    boyAnim,
    girlAnim,
  });

  return {
    renderPlay,
    tickMenuAnims,
    renderMenu,
    renderOnlineSideSelect,
    renderOnlineNameEntry,
    renderOnlineLobby,
    renderOnlineCountdown,
    renderSoloSideSelect,
    renderSoloCountdown,
    renderMenuHelp,
    renderGameOver,
    renderScore,
    renderReunion,
    addDyingGoblin,
    addTrailObstacle,
    addOutcomeEffect,
    clearSideObstacleVisuals,
    addEmote,
  };
}

export { createRenderer, CANVAS_W, CANVAS_H, buildHudModel };
export { projectIncomingX, projectDyingGoblinX, getGoblinFrameMetrics, isObstacleOnScreen, getDebugOverlayGeometry } from './renderer-geometry.js';
