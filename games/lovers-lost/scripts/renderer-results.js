// Owns game-over, score, and reunion screen rendering.
// renderer.js composes this via createResultsRenderer.

import {
  CANVAS_W, HALF_W,
  SPRITE_W, PLAYER_Y,
  BOY_LOCAL_X, GIRL_LOCAL_X,
} from './renderer-geometry.js';

const CANVAS_H = 540;
const DIVIDER_X = HALF_W;

const REUNION_WALK_FRAMES = 300;
const BOY_START_X  = BOY_LOCAL_X;
const GIRL_START_X = HALF_W + GIRL_LOCAL_X;
const BOY_END_X    = HALF_W - SPRITE_W + 8;
const GIRL_END_X   = HALF_W - 8;

export function createResultsRenderer(ctx, images, {
  characterRenderer,
  drawSceneBackground,
  drawSpaceBackground,
  drawEmoteBubbles,
  formatIdentityLabel,
  boyAnim,
  girlAnim,
}) {
  function _formatRunTime(elapsedFrames = 0) {
    const totalMs = Math.round((elapsedFrames * 1000) / 60);
    const mins   = Math.floor(totalMs / 60000);
    const secs   = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  function _drawOverlayPanel(title, lines, footer) {
    const rowH   = 30;
    const panelW = 580;
    const panelH = 72 + lines.length * rowH + (footer ? 48 : 24);
    const panelX = (CANVAS_W - panelW) / 2;
    const panelY = (CANVAS_H - panelH) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(5,14,28,0.88)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(100,140,220,0.32)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 40px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.50)';
    ctx.shadowBlur = 20;
    ctx.fillText(title, CANVAS_W / 2, panelY + 54);
    ctx.shadowBlur = 0;

    ctx.font = '16px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i] === 'Your partner disconnected.'
        ? 'rgba(255,176,176,0.96)'
        : 'rgba(210,215,255,0.90)';
      ctx.fillText(lines[i], CANVAS_W / 2, panelY + 88 + i * rowH);
    }

    if (footer) {
      ctx.font = '13px monospace';
      ctx.fillStyle = 'rgba(160,170,220,0.50)';
      ctx.fillText(footer, CANVAS_W / 2, panelY + panelH - 16);
    }
    ctx.restore();
  }

  function _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, footer, soloSide = null) {
    if (soloSide) {
      const score = soloSide === 'boy'
        ? (runSummary ? (runSummary.boyFinished  ? runSummary.boyScore  : boyPlayer.score)  : boyPlayer.score)
        : (runSummary ? (runSummary.girlFinished ? runSummary.girlScore : girlPlayer.score) : girlPlayer.score);
      _drawOverlayPanel(title, [
        runSummary ? `Time: ${_formatRunTime(runSummary.elapsedFrames)}` : null,
        `Score: ${score}`,
      ].filter(Boolean), footer);
      return;
    }

    const boyScore  = runSummary ? (runSummary.boyFinished  ? runSummary.boyScore  : boyPlayer.score)  : boyPlayer.score;
    const girlScore = runSummary ? (runSummary.girlFinished ? runSummary.girlScore : girlPlayer.score) : girlPlayer.score;
    const boyTrophy  = boyScore  >= girlScore ? ' 🏆' : '';
    const girlTrophy = girlScore >= boyScore  ? ' 🏆' : '';
    const boyName  = formatIdentityLabel('boy',  runSummary?.boyIdentity);
    const girlName = formatIdentityLabel('girl', runSummary?.girlIdentity);
    const boyLine = runSummary
      ? `${boyTrophy}${boyName}: ${runSummary.boyFinished  ? runSummary.boyScore  : `${boyPlayer.score} (forfeit)`}`
      : `${boyTrophy}${boyName} score: ${boyPlayer.score}`;
    const girlLine = runSummary
      ? `${girlTrophy}${girlName}: ${runSummary.girlFinished ? runSummary.girlScore : `${girlPlayer.score} (forfeit)`}`
      : `${girlTrophy}${girlName} score: ${girlPlayer.score}`;
    const total = runSummary ? runSummary.totalScore : boyPlayer.score + girlPlayer.score;
    _drawOverlayPanel(title, [
      runSummary ? `Time: ${_formatRunTime(runSummary.elapsedFrames)}` : null,
      runSummary?.disconnectNote ? 'Your partner disconnected.' : null,
      boyLine,
      girlLine,
      `Combined: ${total}`,
    ].filter(Boolean), footer);
  }

  function renderGameOver(boyPlayer, girlPlayer, runSummary, soloSide = null) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    const title  = soloSide ? 'Time Up' : (runSummary?.outcome === 'partial' ? 'One Lover Made It' : 'Time Up');
    const footer = runSummary?.disconnectNote
      ? 'Partner disconnected  ·  Score screen incoming...'
      : 'Score screen incoming...';
    _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, footer, soloSide);
  }

  function _scoreTitle(runSummary, soloSide) {
    if (runSummary?.outcome === 'game_over') return 'Run Over';
    if (runSummary?.outcome === 'partial') {
      if (!soloSide) return 'Partial Finish';
      const soloFinished = soloSide === 'boy' ? runSummary.boyFinished : runSummary.girlFinished;
      return soloFinished ? 'Run Complete' : 'Run Over';
    }
    return 'Lovers Reunited';
  }

  function renderScore(boyPlayer, girlPlayer, runSummary, soloSide = null) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    const title = _scoreTitle(runSummary, soloSide);
    _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, 'Press any key to return to menu', soloSide);
  }

  function renderReunion(boyPlayer, girlPlayer, phaseFrames) {
    const t    = Math.min(phaseFrames / REUNION_WALK_FRAMES, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const boyX  = BOY_START_X  + (BOY_END_X  - BOY_START_X)  * ease;
    const girlX = GIRL_START_X + (GIRL_END_X - GIRL_START_X) * ease;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSceneBackground(0,      'boy',  boyPlayer.distance);
    drawSceneBackground(HALF_W, 'girl', girlPlayer.distance);

    const dividerAlpha = 0.3 * (1 - ease);
    if (dividerAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${dividerAlpha})`;
      ctx.fillRect(DIVIDER_X - 1, 0, 2, CANVAS_H);
    }

    characterRenderer.drawCharacterAtAbsX(boyX,  images.boy,  'right', boyAnim,  phaseFrames);
    characterRenderer.drawCharacterAtAbsX(girlX, images.girl, 'left',  girlAnim, phaseFrames);

    if (phaseFrames >= REUNION_WALK_FRAMES) {
      const heartAge  = phaseFrames - REUNION_WALK_FRAMES;
      const appear    = Math.min(heartAge / 20, 1);
      const pulse     = 1 + 0.12 * Math.sin(Date.now() / 280);
      const heartSize = 48 * appear * pulse;
      const heartCX   = (BOY_END_X + SPRITE_W / 2 + GIRL_END_X + SPRITE_W / 2) / 2;
      const heartCY   = PLAYER_Y - 36;
      characterRenderer.drawHeart(heartCX, heartCY, heartSize);
    }

    drawEmoteBubbles();
  }

  return { renderGameOver, renderScore, renderReunion };
}
