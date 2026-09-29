import {
  PUZZLE_MENU_RECTS,
  PUZZLE_LOCAL_RECTS,
  PUZZLE_PLAY_RECTS,
  PUZZLE_COMPLETE_RECTS,
} from './puzzle-ui.js';

const HALF_W = 480;
const CANVAS_W = 960;
const CANVAS_H = 540;
const FRAME_W = 16;
const FRAME_H = 16;
const SPRITE_W = 48;
const SPRITE_H = 48;

function formatTime(frames) {
  const total = Math.max(0, Math.floor(Number(frames) || 0));
  const minutes = Math.floor(total / 3600);
  const seconds = Math.floor((total % 3600) / 60);
  const tenths = Math.floor((total % 60) / 6);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function createPuzzleRenderer(ctx, images, deps) {
  const { blit, drawSpaceBackground, drawRedButton } = deps;

  function drawSmallButton(rect, label, hovered) {
    ctx.save();
    ctx.fillStyle = hovered ? '#7744aa' : 'rgba(20,12,42,0.9)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = hovered ? '#ffd166' : 'rgba(255,255,255,0.4)';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#fff0c4';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 4);
    ctx.restore();
  }

  function renderPuzzleMenu(pack, stage, progressEntry, hover = {}) {
    drawSpaceBackground();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px "Cinzel Decorative", serif';
    ctx.shadowColor = 'rgba(255,117,183,0.65)';
    ctx.shadowBlur = 20;
    ctx.fillText('PUZZLE CAMPAIGN', CANVAS_W / 2, 65);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(8,18,36,0.92)';
    ctx.fillRect(150, 90, 660, 214);
    ctx.strokeStyle = 'rgba(255,209,102,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(150, 90, 660, 214);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`PACK ${pack.number} · ${pack.title.toUpperCase()}`, CANVAS_W / 2, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 29px "Cinzel Decorative", serif';
    ctx.fillText(`STAGE ${stage.number}: ${stage.title.toUpperCase()}`, CANVAS_W / 2, 164);
    ctx.fillStyle = '#ffb7d1';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(stage.subtitle, CANVAS_W / 2, 192);

    ctx.fillStyle = 'rgba(210,215,255,0.82)';
    ctx.font = '13px monospace';
    ctx.fillText('Open doors for each other. Reach both glowing exits.', CANVAS_W / 2, 224);
    ctx.fillText('BOY: W / A / D     GIRL: ↑ / ← / →', CANVAS_W / 2, 247);
    ctx.fillStyle = progressEntry ? '#8df0a5' : 'rgba(210,215,255,0.55)';
    ctx.fillText(progressEntry ? `CLEARED · BEST ${formatTime(progressEntry.bestFrames)}` : `PAR ${formatTime(stage.parFrames)}`, CANVAS_W / 2, 276);
    ctx.restore();

    drawRedButton(PUZZLE_MENU_RECTS.local.x, PUZZLE_MENU_RECTS.local.y, PUZZLE_MENU_RECTS.local.w, PUZZLE_MENU_RECTS.local.h, 'LOCAL', hover.local, 17);
    drawRedButton(PUZZLE_MENU_RECTS.online.x, PUZZLE_MENU_RECTS.online.y, PUZZLE_MENU_RECTS.online.w, PUZZLE_MENU_RECTS.online.h, 'ONLINE', hover.online, 17);
    drawSmallButton(PUZZLE_MENU_RECTS.back, 'BACK', hover.back);

    ctx.save();
    ctx.fillStyle = 'rgba(210,215,255,0.58)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOCAL supports one or two players on this keyboard', CANVAS_W / 2, 480);
    ctx.fillText('More stages will unlock here as packs expand.', CANVAS_W / 2, 500);
    ctx.restore();
  }

  function renderPuzzleLocalSelect(pack, stage, hover = {}) {
    renderPuzzleMenu(pack, stage, null, {});
    ctx.fillStyle = 'rgba(3,3,12,0.86)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = 'rgba(20,12,42,0.97)';
    ctx.fillRect(170, 82, 620, 390);
    ctx.strokeStyle = '#ff8ebd';
    ctx.lineWidth = 3;
    ctx.strokeRect(170, 82, 620, 390);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px "Cinzel Decorative", serif';
    ctx.fillText('LOCAL PLAY', CANVAS_W / 2, 150);
    ctx.fillStyle = 'rgba(210,215,255,0.82)';
    ctx.font = '14px monospace';
    ctx.fillText('Choose how many people are sharing this keyboard.', CANVAS_W / 2, 205);
    ctx.fillText('1 PLAYER controls both lovers · 2 PLAYERS split the controls', CANVAS_W / 2, 235);
    drawRedButton(PUZZLE_LOCAL_RECTS.solo.x, PUZZLE_LOCAL_RECTS.solo.y, PUZZLE_LOCAL_RECTS.solo.w, PUZZLE_LOCAL_RECTS.solo.h, '1 PLAYER', hover.solo, 17);
    drawRedButton(PUZZLE_LOCAL_RECTS.local.x, PUZZLE_LOCAL_RECTS.local.y, PUZZLE_LOCAL_RECTS.local.w, PUZZLE_LOCAL_RECTS.local.h, '2 PLAYERS', hover.local, 17);
    drawSmallButton(PUZZLE_LOCAL_RECTS.back, 'BACK', hover.back);
  }

  function drawLaneBackground(side) {
    const offset = side === 'boy' ? 0 : HALF_W;
    const gradient = ctx.createLinearGradient(offset, 0, offset + HALF_W, CANVAS_H);
    if (side === 'boy') {
      gradient.addColorStop(0, '#0b1f38');
      gradient.addColorStop(1, '#16102f');
    } else {
      gradient.addColorStop(0, '#32132e');
      gradient.addColorStop(1, '#1b173b');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(offset, 0, HALF_W, CANVAS_H);
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = offset; x < offset + HALF_W; x += 32) ctx.fillRect(x, 48, 1, CANVAS_H - 48);
    for (let y = 48; y < CANVAS_H; y += 32) ctx.fillRect(offset, y, HALF_W, 1);
  }

  function drawExit(offset, exit, waiting) {
    ctx.save();
    ctx.fillStyle = waiting ? 'rgba(120,255,165,0.3)' : 'rgba(255,209,102,0.13)';
    ctx.shadowColor = waiting ? '#7dffa5' : '#ffd166';
    ctx.shadowBlur = 18;
    ctx.fillRect(offset + exit.x, exit.y, exit.w, exit.h);
    ctx.strokeStyle = waiting ? '#7dffa5' : '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(offset + exit.x, exit.y, exit.w, exit.h);
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = waiting ? '#7dffa5' : '#ffd166';
    ctx.fillText('♥', offset + exit.x + exit.w / 2, exit.y + 36);
    ctx.restore();
  }

  function drawStageSide(stage, state, side) {
    const offset = side === 'boy' ? 0 : HALF_W;
    const tint = side === 'boy' ? '#4777b8' : '#b84b86';
    for (const solid of stage.solids[side]) {
      ctx.fillStyle = solid.id.includes('floor') ? '#171827' : tint;
      ctx.fillRect(offset + solid.x, solid.y, solid.w, solid.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(offset + solid.x, solid.y, solid.w, Math.min(4, solid.h));
    }

    for (const item of stage.switches.filter(entry => entry.side === side)) {
      const active = state.switches[item.id];
      const signal = stage.signals[item.id];
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.72;
      ctx.fillStyle = signal.color;
      ctx.shadowColor = signal.color;
      ctx.shadowBlur = active ? 18 : 6;
      ctx.fillRect(offset + item.x, item.y, item.w, item.h);
      if (active) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(offset + item.x + 5, item.y + 1, item.w - 10, Math.max(1, item.h - 2));
      }
      ctx.restore();
    }

    for (const gate of stage.gates.filter(entry => entry.side === side)) {
      const open = !!state.switches[gate.switchId];
      const signal = stage.signals[gate.switchId];
      ctx.save();
      ctx.globalAlpha = open ? 0.16 : 0.88;
      ctx.fillStyle = signal.color;
      ctx.fillRect(offset + gate.x, gate.y, gate.w, gate.h);
      ctx.strokeStyle = signal.color;
      ctx.shadowColor = signal.color;
      ctx.shadowBlur = open ? 4 : 12;
      ctx.strokeRect(offset + gate.x, gate.y, gate.w, gate.h);
      ctx.restore();
    }

    drawExit(offset, stage.exits[side], state.players[side].finished);

    const player = state.players[side];
    const image = side === 'boy' ? images.boy : images.girl;
    const frame = Math.floor(state.elapsedFrames / 7) % 2 + 2;
    blit(image, frame, FRAME_W, FRAME_H, offset + player.x - 10, player.y - 4, SPRITE_W, SPRITE_H, player.facing === 'left', 1);
    if (player.finished) {
      ctx.fillStyle = '#7dffa5';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WAITING', offset + player.x + stage.player.width / 2, player.y - 12);
    }
  }

  function renderPuzzlePlay(stage, state, hover = {}) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawLaneBackground('boy');
    drawLaneBackground('girl');
    drawStageSide(stage, state, 'boy');
    drawStageSide(stage, state, 'girl');
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(HALF_W - 1, 0, 2, CANVAS_H);

    ctx.fillStyle = 'rgba(5,4,16,0.9)';
    ctx.fillRect(0, 0, CANVAS_W, 52);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`PACK 1 · STAGE ${stage.number} · ${stage.title.toUpperCase()}`, 16, 21);
    ctx.fillStyle = '#ffffff';
    const modeLabel = state.mode === 'solo' ? '1 PLAYER' : state.mode === 'online' ? 'ONLINE' : '2 PLAYERS';
    ctx.fillText(`${modeLabel}  ${formatTime(state.elapsedFrames)}  RESETS ${state.resets}`, 16, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#93bfff';
    ctx.fillText('BOY · W A D', 360, 31);
    ctx.fillStyle = '#ff9fc8';
    ctx.fillText('GIRL · ↑ ← →', 600, 31);
    drawSmallButton(PUZZLE_PLAY_RECTS.menu, 'MENU', hover.menu);
    drawSmallButton(PUZZLE_PLAY_RECTS.reset, 'RESET', hover.reset);

    const activeHint = state.switches['girl-opens-exit'] ? stage.hints[2]
      : state.switches['boy-opens-girl'] ? stage.hints[2]
      : state.switches['girl-opens-boy'] ? stage.hints[1]
      : stage.hints[0];
    ctx.fillStyle = 'rgba(5,4,16,0.84)';
    ctx.fillRect(90, 494, 780, 30);
    ctx.fillStyle = '#fff0c4';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(activeHint, CANVAS_W / 2, 514);
  }

  function renderPuzzleComplete(stage, state, ticketStatus, hover = {}) {
    renderPuzzlePlay(stage, state, {});
    ctx.fillStyle = 'rgba(3,3,12,0.82)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = 'rgba(20,12,42,0.97)';
    ctx.fillRect(170, 82, 620, 390);
    ctx.strokeStyle = '#ff8ebd';
    ctx.lineWidth = 3;
    ctx.strokeRect(170, 82, 620, 390);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px "Cinzel Decorative", serif';
    ctx.fillText('TOGETHER!', CANVAS_W / 2, 150);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`STAGE ${stage.number} CLEAR · ${formatTime(state.elapsedFrames)}`, CANVAS_W / 2, 205);
    ctx.fillStyle = state.elapsedFrames <= stage.parFrames ? '#7dffa5' : '#d4d6f4';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(state.elapsedFrames <= stage.parFrames ? 'PAR BEATEN!' : `PAR ${formatTime(stage.parFrames)}`, CANVAS_W / 2, 242);
    ctx.fillStyle = '#ffb7d1';
    ctx.font = '14px monospace';
    ctx.fillText(ticketStatus || 'Saving clear…', CANVAS_W / 2, 285);
    ctx.fillStyle = 'rgba(210,215,255,0.72)';
    ctx.font = '13px monospace';
    ctx.fillText('Stage 1 complete. The rest of Pack 1 is coming next.', CANVAS_W / 2, 326);
    ctx.fillText('R / Enter: retry     Esc: campaign menu', CANVAS_W / 2, 354);
    drawRedButton(PUZZLE_COMPLETE_RECTS.retry.x, PUZZLE_COMPLETE_RECTS.retry.y, PUZZLE_COMPLETE_RECTS.retry.w, PUZZLE_COMPLETE_RECTS.retry.h, state.mode === 'online' ? 'FIND MATCH' : 'RETRY', hover.retry, 16);
    drawRedButton(PUZZLE_COMPLETE_RECTS.menu.x, PUZZLE_COMPLETE_RECTS.menu.y, PUZZLE_COMPLETE_RECTS.menu.w, PUZZLE_COMPLETE_RECTS.menu.h, 'STAGE MENU', hover.menu, 15);
  }

  return { renderPuzzleMenu, renderPuzzleLocalSelect, renderPuzzlePlay, renderPuzzleComplete };
}

export { createPuzzleRenderer, formatTime };
