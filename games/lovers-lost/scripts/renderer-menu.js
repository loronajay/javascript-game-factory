// Owns menu splash, how-to-play screen, space background, and red button helper.
// renderer.js composes this via createMenuRenderer.

import {
  CANVAS_W, HALF_W,
  FRAME_W, FRAME_H, SPRITE_W, SPRITE_H,
  GROUND_TOP, PLAYER_Y,
  BOY_LOCAL_X, BOY_CONTACT_X,
  shieldActionStep,
} from './renderer-geometry.js';

const CANVAS_H  = 540;
const WALK_FRAMES = [2, 3];
const WALK_SPEED  = 7;

function _makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

export function createMenuRenderer(ctx, images, { characterRenderer, obstacleRenderer, debugRenderer }) {
  const menuStars = (() => {
    const rng = _makeRng(9999);
    return Array.from({ length: 160 }, () => ({
      x: rng() * CANVAS_W,
      y: rng() * CANVAS_H,
      r: rng() * 1.2 + 0.4,
      a: rng() * 0.7 + 0.3,
    }));
  })();

  let menuTick = 0;

  function menuWalkFrame(offset = 0) {
    return WALK_FRAMES[Math.floor((menuTick + offset) / WALK_SPEED) % WALK_FRAMES.length];
  }

  function drawSpaceBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0,    '#07141f');
    grad.addColorStop(0.55, '#0d2233');
    grad.addColorStop(1,    '#030c14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const blobs = [
      { cx: 640, cy: 130, r: 250, c0: 'rgba(80,30,140,0.18)',  c1: 'rgba(40,60,140,0.10)',  s: 0.45 },
      { cx: 490, cy: 290, r: 190, c0: 'rgba(10,80,100,0.15)',  c1: 'rgba(10,60,80,0.07)',   s: 0.5  },
      { cx: 350, cy: 170, r: 210, c0: 'rgba(130,35,75,0.10)',  c1: 'rgba(70,20,55,0.04)',   s: 0.6  },
    ];
    for (const b of blobs) {
      const ng = ctx.createRadialGradient(b.cx, b.cy, 10, b.cx, b.cy, b.r);
      ng.addColorStop(0, b.c0); ng.addColorStop(b.s, b.c1); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.save();
    for (const s of menuStars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawRedButton(x, y, w, h, text, hovered, fontSize) {
    ctx.save();
    if (hovered) { ctx.shadowColor = 'rgba(220,60,80,0.65)'; ctx.shadowBlur = 18; }
    ctx.fillStyle = hovered ? '#cc2a3a' : '#9a1b28';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 2, y + 2, w - 4, Math.floor(h / 2) - 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#550010';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px "Cinzel Decorative", serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x + w / 2, y + h / 2 + Math.round(fontSize * 0.36));
    ctx.restore();
  }

  function renderMenu(debugState, btnHovered, btn2Hovered, btn3Hovered) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.55)';
    ctx.shadowBlur = 28;
    ctx.fillText('LOVERS LOST', CANVAS_W / 2, 105);
    ctx.restore();

    const btnW = 360, btnH = 56;
    drawRedButton(CANVAS_W / 2 - btnW / 2, 210, btnW, btnH, 'LOCAL MULTIPLAYER',  btnHovered,  20);
    drawRedButton(CANVAS_W / 2 - btnW / 2, 286, btnW, btnH, 'ONLINE MULTIPLAYER', btn2Hovered, 20);
    const btn3W = 240, btn3H = 44;
    drawRedButton(CANVAS_W / 2 - btn3W / 2, 362, btn3W, btn3H, 'HOW TO PLAY', btn3Hovered, 16);

    characterRenderer.blit(images.boy,  menuWalkFrame(), FRAME_W, FRAME_H, 90,                       PLAYER_Y, SPRITE_W, SPRITE_H, false, 1);
    characterRenderer.blit(images.girl, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W - 90 - SPRITE_W, PLAYER_Y, SPRITE_W, SPRITE_H, true,  1);

    if (debugState?.enabled) debugRenderer.drawDebugBanner(debugState);
  }

  function renderMenuHelp(debugState) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.40)';
    ctx.shadowBlur = 16;
    ctx.fillText('HOW TO PLAY', CANVAS_W / 2, 72);
    ctx.restore();

    const walkFrame = menuWalkFrame();
    const nowMs = Date.now();

    const CARD_W = 200, CARD_H = 230, CGAP = 20;
    const START_X = (CANVAS_W - (4 * CARD_W + 3 * CGAP)) / 2;
    const CARD_Y = 105;
    const GROUND_LINE_Y = CARD_Y + 195;
    const CARD_TY = GROUND_LINE_Y - GROUND_TOP;

    const HELP_CARDS = [
      { type: 'spikes',    label: 'JUMP',   obsX: BOY_LOCAL_X + 18,            jY: 28, vs: { state: 'running', actionTick: 0 }, ps: 'jumping'   },
      { type: 'bird',      label: 'CROUCH', obsX: BOY_LOCAL_X + SPRITE_W + 14, jY: 0,  vs: { state: 'crouch',  actionTick: 0 }, ps: 'crouching' },
      { type: 'arrowwall', label: 'BLOCK',  obsX: BOY_LOCAL_X + SPRITE_W + 2,  jY: 0,  vs: { state: 'block',   actionTick: 6 }, ps: 'running'   },
      { type: 'goblin',    label: 'ATTACK', obsX: BOY_LOCAL_X + SPRITE_W + 6,  jY: 0,  vs: { state: 'attack',  actionTick: 6 }, ps: 'running'   },
    ];

    HELP_CARDS.forEach((card, i) => {
      const cardX = START_X + i * (CARD_W + CGAP);
      const tx    = cardX + CARD_W / 2 - (BOY_LOCAL_X + SPRITE_W / 2);

      ctx.save();
      ctx.fillStyle = 'rgba(5,14,28,0.78)';
      ctx.fillRect(cardX, CARD_Y, CARD_W, CARD_H);
      ctx.strokeStyle = 'rgba(90,130,210,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cardX, CARD_Y, CARD_W, CARD_H);

      ctx.beginPath();
      ctx.rect(cardX, CARD_Y, CARD_W, CARD_H);
      ctx.clip();
      ctx.translate(tx, CARD_TY);

      obstacleRenderer.drawObstacle(card.obsX, { type: card.type }, 'right', BOY_CONTACT_X, 0, nowMs);

      ctx.fillStyle = 'rgba(90,130,220,0.18)';
      ctx.fillRect(BOY_LOCAL_X - 60, GROUND_TOP, 280, 1);

      let screenY = PLAYER_Y - card.jY;
      let scaleY  = 1;
      if (card.ps === 'crouching') { scaleY = 0.5; screenY = PLAYER_Y + SPRITE_H * 0.5; }

      const step = shieldActionStep(card.vs.actionTick);
      if (card.vs.state === 'attack') characterRenderer.drawSword(BOY_LOCAL_X, screenY, false, step);
      characterRenderer.blit(images.boy, walkFrame, FRAME_W, FRAME_H, BOY_LOCAL_X, screenY, SPRITE_W, SPRITE_H, false, scaleY);
      if (card.vs.state === 'block')  characterRenderer.drawShield(BOY_LOCAL_X, screenY, false, step);

      ctx.restore();

      ctx.fillStyle = 'rgba(255,220,100,0.9)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(card.label, cardX + CARD_W / 2, CARD_Y + CARD_H - 16);
    });

    const MID = CANVAS_W / 2;
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255,220,100,0.80)';
    ctx.fillText('LEFT SIDE (BOY):', MID, 418);
    ctx.fillStyle = 'rgba(210,215,255,0.80)';
    ctx.fillText('W — jump    S — duck    D — attack    A — block', MID, 434);
    ctx.fillStyle = 'rgba(255,220,100,0.80)';
    ctx.fillText('RIGHT SIDE (GIRL):', MID, 454);
    ctx.fillStyle = 'rgba(210,215,255,0.80)';
    ctx.fillText('↑ — jump    ↓ — duck    ← — attack    → — block', MID, 470);

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(180,190,255,0.40)';
    ctx.fillText('press any key or click to go back', MID, 492);

    if (debugState?.enabled) debugRenderer.drawDebugBanner(debugState);
  }

  function tickMenuAnims() { menuTick++; }

  return {
    renderMenu,
    renderMenuHelp,
    tickMenuAnims,
    // Exposed for injection into online renderer and result screens
    menuWalkFrame,
    drawSpaceBackground,
    drawRedButton,
  };
}
