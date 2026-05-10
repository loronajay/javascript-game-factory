const CANVAS_W           = 960;
const CANVAS_H           = 540;
const HALF_W             = 480;
const HARD_CUTOFF        = 90;
const HUD_SPEED_MIN      = 5;
const HUD_SPEED_SOFT_MAX = 30;
const HUD_CHAIN_SOFT_MAX = 8;
const RUN_DISTANCE       = 5400;

function clamp01(value) {
  return Math.max(0, Math.min(value, 1));
}

function hudChainTier(chain) {
  if (chain >= 5) return 'blazing';
  if (chain >= 2) return 'surging';
  if (chain >= 1) return 'building';
  return 'idle';
}

function buildHudLaneModel(player, side) {
  const score    = Math.max(0, Math.round(player?.score ?? 0));
  const speed    = Number.isFinite(player?.speed) ? player.speed : 0;
  const chain    = Math.max(0, Math.round(player?.chain ?? 0));
  const progress = clamp01((player?.distance ?? 0) / RUN_DISTANCE);

  return {
    side,
    laneLabel:     side === 'boy' ? 'BOY SIDE' : 'GIRL SIDE',
    scoreLabel:    'SCORE',
    speedLabel:    'SPEED',
    chainLabel:    'CHAIN',
    progressLabel: 'RUN TO REUNION',
    scoreText:     String(score).padStart(5, '0'),
    speedText:     speed.toFixed(1),
    speedFill:     clamp01((speed - HUD_SPEED_MIN) / (HUD_SPEED_SOFT_MAX - HUD_SPEED_MIN)),
    chainText:     `x${chain}`,
    chainTier:     hudChainTier(chain),
    chainFill:     clamp01(chain / HUD_CHAIN_SOFT_MAX),
    progressText:  `${Math.round(progress * 100)}%`,
    progressFill:  progress,
  };
}

export function buildHudModel(boyPlayer, girlPlayer, elapsed, uiState = {}) {
  const remaining = Math.max(0, HARD_CUTOFF - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);

  return {
    clock: {
      label:   'TIME LEFT',
      timeStr: `${mins}:${secs.toString().padStart(2, '0')}`,
      urgent:  remaining < 20,
      online:  !!uiState.online,
    },
    boy:  buildHudLaneModel(boyPlayer, 'boy'),
    girl: buildHudLaneModel(girlPlayer, 'girl'),
  };
}

export function createHudRenderer(ctx, { drawOnlineLabel }) {
  function _hudPalette(side) {
    return side === 'boy'
      ? {
          bgTop:    'rgba(26,10,48,0.94)',
          bgBottom: 'rgba(12,8,28,0.88)',
          frame:    'rgba(178,102,255,0.80)',
          glow:     'rgba(164,94,255,0.32)',
          accent:   'rgba(255,92,194,0.82)',
          text:     '#f5e8ff',
          textSoft: 'rgba(218,194,255,0.82)',
          textDim:  'rgba(186,158,228,0.70)',
          meterA:   '#82f2ff',
          meterB:   '#6fffc2',
          track:    'rgba(125,92,182,0.24)',
          runner:   '#f7c7ff',
        }
      : {
          bgTop:    'rgba(56,24,8,0.94)',
          bgBottom: 'rgba(24,12,4,0.88)',
          frame:    'rgba(255,184,86,0.82)',
          glow:     'rgba(255,174,72,0.30)',
          accent:   'rgba(255,108,92,0.82)',
          text:     '#fff2e3',
          textSoft: 'rgba(255,220,178,0.84)',
          textDim:  'rgba(230,186,138,0.72)',
          meterA:   '#8fe7ff',
          meterB:   '#7dffb1',
          track:    'rgba(178,118,62,0.24)',
          runner:   '#ffe0b4',
        };
  }

  function _chainPalette(tier) {
    if (tier === 'blazing') {
      return {
        fill:   'rgba(255,142,56,0.32)',
        stroke: 'rgba(255,196,90,0.88)',
        text:   '#ffe9b0',
      };
    }

    if (tier === 'surging') {
      return {
        fill:   'rgba(255,210,90,0.22)',
        stroke: 'rgba(255,224,138,0.76)',
        text:   '#fff0ba',
      };
    }

    if (tier === 'building') {
      return {
        fill:   'rgba(155,206,255,0.16)',
        stroke: 'rgba(170,220,255,0.54)',
        text:   '#dcefff',
      };
    }

    return {
      fill:   'rgba(255,255,255,0.08)',
      stroke: 'rgba(255,255,255,0.16)',
      text:   'rgba(220,220,228,0.62)',
    };
  }

  function _drawHudFrame(x, y, w, h, palette) {
    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur  = 18;
    ctx.fillStyle   = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur  = 0;

    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, palette.bgTop);
    bg.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle   = palette.accent;
    ctx.fillRect(x + 2, y + 2, w - 4, 5);

    ctx.strokeStyle = palette.frame;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 12, y + 34,      w - 24, 1);
    ctx.fillRect(x + 12, y + h - 30,  w - 24, 1);
    ctx.restore();
  }

  function _drawHudClock(clockModel) {
    const w = 168;
    const h = 56;
    const x = (CANVAS_W - w) / 2;
    const y = 10;
    const palette = clockModel.urgent
      ? {
          bgTop:    'rgba(56,12,20,0.94)',
          bgBottom: 'rgba(26,6,10,0.88)',
          frame:    'rgba(255,98,118,0.86)',
          glow:     'rgba(255,72,102,0.34)',
          accent:   'rgba(255,132,160,0.82)',
          text:     '#fff1f4',
          textSoft: 'rgba(255,210,216,0.82)',
        }
      : {
          bgTop:    'rgba(14,18,42,0.94)',
          bgBottom: 'rgba(8,10,24,0.88)',
          frame:    'rgba(146,170,255,0.74)',
          glow:     'rgba(118,146,255,0.28)',
          accent:   'rgba(180,196,255,0.82)',
          text:     '#ffffff',
          textSoft: 'rgba(214,222,255,0.82)',
        };

    _drawHudFrame(x, y, w, h, palette);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = 'bold 10px monospace';
    ctx.fillStyle = palette.textSoft;
    ctx.fillText(clockModel.label, CANVAS_W / 2, y + 17);

    ctx.font        = 'bold 26px monospace';
    ctx.fillStyle   = palette.text;
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur  = 10;
    ctx.fillText(clockModel.timeStr, CANVAS_W / 2, y + 42);
    ctx.restore();
  }

  function _drawHudSide(model, x, align) {
    const y       = 10;
    const w       = 216;
    const h       = 98;
    const left    = align === 'right' ? x - w : x;
    const palette = _hudPalette(model.side);
    const textX   = align === 'right' ? left + w - 14 : left + 14;
    const progressX   = align === 'right' ? left + 14 : left + w - 14;
    const speedSectionW = 122;
    const chainW  = 56;
    const gap     = 10;
    const chainX  = align === 'right' ? left + 14 : left + w - 14 - chainW;
    const speedX  = align === 'right' ? chainX + chainW + gap : left + 14;
    const chainColors = _chainPalette(model.chainTier);

    _drawHudFrame(left, y, w, h, palette);

    ctx.save();
    ctx.font      = 'bold 10px monospace';
    ctx.fillStyle = palette.textSoft;
    ctx.textAlign = align;
    ctx.fillText(model.laneLabel, textX, y + 17);

    ctx.textAlign = align === 'right' ? 'left' : 'right';
    ctx.fillStyle = palette.textDim;
    ctx.fillText(model.progressText, progressX, y + 17);

    ctx.textAlign = align;
    ctx.fillStyle = palette.textDim;
    ctx.fillText(model.scoreLabel, textX, y + 31);

    ctx.font        = 'bold 28px monospace';
    ctx.fillStyle   = palette.text;
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur  = 12;
    ctx.fillText(model.scoreText, textX, y + 60);
    ctx.shadowBlur  = 0;

    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.textDim;
    ctx.fillText(model.speedLabel, speedX, y + 76);
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.textSoft;
    ctx.fillText(model.speedText, speedX + speedSectionW, y + 76);

    ctx.fillStyle = palette.track;
    ctx.fillRect(speedX, y + 83, speedSectionW, 8);
    const speedGrad = ctx.createLinearGradient(speedX, y + 83, speedX + speedSectionW, y + 83);
    speedGrad.addColorStop(0, palette.meterA);
    speedGrad.addColorStop(1, palette.meterB);
    ctx.fillStyle = speedGrad;
    ctx.fillRect(speedX, y + 83, speedSectionW * model.speedFill, 8);
    if (model.speedFill > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(speedX + speedSectionW * model.speedFill - 1, y + 82, 2, 10);
    }

    ctx.fillStyle   = chainColors.fill;
    ctx.strokeStyle = chainColors.stroke;
    ctx.lineWidth   = 1.25;
    ctx.fillRect(chainX, y + 70, chainW, 22);
    ctx.strokeRect(chainX, y + 70, chainW, 22);
    ctx.textAlign = 'center';
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = palette.textDim;
    ctx.fillText(model.chainLabel, chainX + chainW / 2, y + 66);
    ctx.font      = 'bold 12px monospace';
    ctx.fillStyle = chainColors.text;
    ctx.fillText(model.chainText, chainX + chainW / 2, y + 85);
    ctx.restore();
  }

  function drawHUD(boyPlayer, girlPlayer, elapsed, uiState = {}) {
    const hud      = buildHudModel(boyPlayer, girlPlayer, elapsed, uiState);
    const soloSide = uiState.soloSide || null;

    _drawHudClock(hud.clock);
    if (!soloSide || soloSide === 'boy')  _drawHudSide(hud.boy,  10,            'left');
    if (!soloSide || soloSide === 'girl') _drawHudSide(hud.girl, CANVAS_W - 10, 'right');

    if (hud.clock.online) {
      drawOnlineLabel('ONLINE', CANVAS_W / 2, 80, {
        bg:        'rgba(10,24,38,0.82)',
        stroke:    'rgba(110,200,255,0.48)',
        textColor: 'rgba(220,245,255,0.94)',
        height:    22,
        padX:      12,
      });
    }

    if (!soloSide || soloSide === 'boy')  _drawProgressBar(10,          CANVAS_H - 18, HALF_W - 20, hud.boy,  _hudPalette('boy'),  false);
    if (!soloSide || soloSide === 'girl') _drawProgressBar(HALF_W + 10, CANVAS_H - 18, HALF_W - 20, hud.girl, _hudPalette('girl'), true);
  }

  function _drawProgressBar(x, y, w, player, color, rtl) {
    const pct     = player.progressFill;
    const h       = 8;
    const markerX = rtl ? x + w * (1 - pct) : x + w * pct;

    ctx.save();
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.font      = 'bold 10px monospace';
    ctx.fillStyle = color.textDim;
    ctx.fillText(player.progressLabel, rtl ? x + w : x, y - 8);

    ctx.textAlign = rtl ? 'left' : 'right';
    ctx.fillStyle = color.textSoft;
    ctx.fillText(player.progressText, rtl ? x : x + w, y - 8);

    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color.track;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

    const fill = ctx.createLinearGradient(x, y, x + w, y);
    fill.addColorStop(0, color.meterA);
    fill.addColorStop(1, color.accent);
    ctx.fillStyle = fill;
    if (rtl) {
      ctx.fillRect(x + w * (1 - pct), y, w * pct, h);
    } else {
      ctx.fillRect(x, y, w * pct, h);
    }

    ctx.fillStyle = color.runner;
    ctx.fillRect(Math.max(x - 1, Math.min(markerX - 2, x + w - 3)), y - 3, 4, h + 6);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(rtl ? x - 1 : x + w - 1, y - 3, 2, h + 6);
    ctx.restore();
    return;

    const legacyPct = Math.min(player.distance / RUN_DISTANCE, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = color;
    rtl
      ? ctx.fillRect(x + w * (1 - legacyPct), y, w * legacyPct, 5)
      : ctx.fillRect(x, y, w * legacyPct, 5);
    // Finish line marker
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(rtl ? x - 1 : x + w - 1, y - 2, 2, 9);
  }

  return { drawHUD };
}
