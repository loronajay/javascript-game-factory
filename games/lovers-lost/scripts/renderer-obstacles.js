// Owns all obstacle and boost drawing for the split-screen run.
// renderer.js composes this via createObstacleRenderer.

export function createObstacleRenderer(ctx, images, consts, helpers) {
  const {
    PPU, GROUND_TOP, BIRD_BOTTOM, SPRITE_H,
    BOY_LOCAL_X, GIRL_LOCAL_X, BOY_CONTACT_X, GIRL_CONTACT_X,
    BIRD_SCALE, BIRD_FRAME_DATA, BIRD_SPEED_MULT,
    GI_FW, GI_FC, GD_FW, GD_FC, GH_FW, GH_FC,
    GOBLIN_SCALE, GOBLIN_H,
    AR_W, AR_H, AR_SCALE,
  } = consts;

  const {
    projectIncomingX,
    getGoblinFrameMetrics,
    getDyingGoblinFrameMetrics,
    isObstacleOnScreen,
    projectDyingGoblinX,
  } = helpers;

  const _HINT_KEYS = {
    right: { jump: 'W', crouch: 'S', attack: 'D', block: 'A' },
    left:  { jump: '↑', crouch: '↓', attack: '←', block: '→' },
  };
  const _OBS_ACTION = { spikes: 'jump', bird: 'crouch', arrowwall: 'block', goblin: 'attack' };
  const _HINT_Y = {
    spikes:    GROUND_TOP - 56,
    bird:      BIRD_BOTTOM - 36 - 28,
    arrowwall: GROUND_TOP - 96,
    goblin:    GROUND_TOP - 86,
  };

  function _obsWidth(obs, nowMs) {
    switch (obs.type) {
      case 'spikes':    return 36;
      case 'bird':      return 57;
      case 'arrowwall': return Math.round(AR_W * AR_SCALE);
      case 'goblin': {
        const frame = Math.floor(nowMs / 120) % GI_FC;
        return getGoblinFrameMetrics(false, frame).srcWidth * GOBLIN_SCALE;
      }
      default:          return 36;
    }
  }

  function _obsPPU(obs) {
    return obs.type === 'bird' ? PPU * BIRD_SPEED_MULT : PPU;
  }

  function _drawSpikes(x) {
    const triW = 12, triH = 20;
    ctx.fillStyle = '#cc9900';
    ctx.fillRect(x, GROUND_TOP - 3, triW * 3, 3);
    ctx.fillStyle = '#ffcc44';
    for (let i = 0; i < 3; i++) {
      const tx = x + i * triW;
      ctx.beginPath();
      ctx.moveTo(tx,            GROUND_TOP);
      ctx.lineTo(tx + triW / 2, GROUND_TOP - triH);
      ctx.lineTo(tx + triW,     GROUND_TOP);
      ctx.closePath();
      ctx.fill();
    }
  }

  function _drawBird(x, flip) {
    const fi  = Math.floor(Date.now() / 120) % 3;
    const fd  = BIRD_FRAME_DATA[fi];
    const img = images.birds && images.birds[fi];
    const dw  = fd.w * BIRD_SCALE;
    const dh  = fd.h * BIRD_SCALE;
    const by  = BIRD_BOTTOM - dh;

    ctx.save();
    if (flip) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (img && img.complete) {
      ctx.drawImage(img, 0, 0, fd.w, fd.h, x, by, dw, dh);
    } else {
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(x, by + dh * 0.25, dw, dh * 0.5);
    }
    ctx.restore();
  }

  function _drawArrowWall(x, flip) {
    const img = images.arrows;
    const dw  = Math.round(AR_W * AR_SCALE);
    const dh  = Math.round(AR_H * AR_SCALE);
    const ay  = GROUND_TOP - dh;
    ctx.save();
    if (flip) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, AR_W, AR_H, x, ay, dw, dh);
    } else {
      ctx.fillStyle = '#ccaa44';
      ctx.fillRect(x, ay + dh * 0.2, dw, dh * 0.6);
    }
    ctx.restore();
  }

  function _drawGoblin(x, obs, facing, contactX, distDelta, nowMs) {
    const flip    = facing === 'right';
    const frame   = Math.floor(nowMs / 120) % GI_FC;
    const metrics = getGoblinFrameMetrics(false, frame);
    const dw = metrics.srcWidth * GOBLIN_SCALE;
    const dh = GOBLIN_H * GOBLIN_SCALE;
    const gy = GROUND_TOP - dh;

    ctx.save();
    if (flip) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (images.goblinIdle && images.goblinIdle.complete && images.goblinIdle.naturalWidth > 0) {
      ctx.drawImage(images.goblinIdle, frame * GI_FW + metrics.srcInset, 0, metrics.srcWidth, GOBLIN_H, x, gy, dw, dh);
    } else {
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(x, gy, dw, dh);
    }
    ctx.restore();
  }

  function _drawDyingGoblin(screenX, flip, tick) {
    const { metrics, srcH, active } = getDyingGoblinFrameMetrics(tick);
    const img   = tick < GH_FC * 6 ? images.goblinTakeHit : images.goblinDeath;
    const fw    = tick < GH_FC * 6 ? GH_FW : GD_FW;
    const frame = tick < GH_FC * 6
      ? Math.min(Math.floor(tick / 6), GH_FC - 1)
      : Math.min(Math.floor((tick - GH_FC * 6) / 8), GD_FC - 1);
    const ddw = metrics.srcWidth * GOBLIN_SCALE;
    const ddh = srcH * GOBLIN_SCALE;
    const dgy = GROUND_TOP - ddh;

    ctx.save();
    if (flip) {
      ctx.translate(screenX + ddw, 0);
      ctx.scale(-1, 1);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, frame * fw + metrics.srcInset, 0, metrics.srcWidth, srcH, 0, dgy, ddw, ddh);
      }
    } else {
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, frame * fw + metrics.srcInset, 0, metrics.srcWidth, srcH, screenX, dgy, ddw, ddh);
      }
    }
    ctx.restore();

    return active;
  }

  function _drawWarmupHint(cx, obsType, facing) {
    const action = _OBS_ACTION[obsType];
    const key    = _HINT_KEYS[facing]?.[action];
    if (!key) return;
    const y = _HINT_Y[obsType] ?? (GROUND_TOP - 70);

    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tw  = ctx.measureText(key).width;
    const pw  = Math.max(tw + 14, 28);
    const ph  = 22;
    const rx  = cx - pw / 2;
    const ry  = y - ph / 2;
    const rad = 5;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + pw - rad, ry);
    ctx.arcTo(rx + pw, ry, rx + pw, ry + rad, rad);
    ctx.lineTo(rx + pw, ry + ph - rad);
    ctx.arcTo(rx + pw, ry + ph, rx + pw - rad, ry + ph, rad);
    ctx.lineTo(rx + rad, ry + ph);
    ctx.arcTo(rx, ry + ph, rx, ry + ph - rad, rad);
    ctx.lineTo(rx, ry + rad);
    ctx.arcTo(rx, ry, rx + rad, ry, rad);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffe066';
    ctx.fillText(key, cx, y);
    ctx.restore();
  }

  function drawObstacle(x, obs, facing, contactX, distDelta, nowMs) {
    const flip = facing === 'right';
    switch (obs.type) {
      case 'spikes':    _drawSpikes(x);                                           break;
      case 'bird':      _drawBird(x, flip);                                       break;
      case 'arrowwall': _drawArrowWall(x, flip);                                  break;
      case 'goblin':    _drawGoblin(x, obs, facing, contactX, distDelta, nowMs);  break;
    }
  }

  function drawFieldObstacles(offsetX, player, facing, obstacles, nowMs) {
    if (!obstacles || !obstacles.length) return;
    const contactX = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;

    for (const obs of obstacles) {
      if (obs.cleared) continue;
      const distDelta = obs.position - player.distance;
      const ppu       = _obsPPU(obs);
      const obsW      = _obsWidth(obs, nowMs);
      const speedMult = ppu / PPU;
      const localObsX = projectIncomingX(contactX, distDelta, facing, obsW, speedMult);

      if (!isObstacleOnScreen(localObsX, obsW)) continue;

      const absX = offsetX + localObsX;
      drawObstacle(absX, obs, facing, offsetX + contactX, distDelta, nowMs);
      if (obs.isWarmup) _drawWarmupHint(absX + obsW / 2, obs.type, facing);
    }
  }

  function drawTrailObstacles(offsetX, player, facing, trail, nowMs) {
    if (!trail || !trail.length) return;
    const contactX = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;

    for (let i = trail.length - 1; i >= 0; i--) {
      const obs       = trail[i];
      const distDelta = obs.position - player.distance;
      const ppu       = _obsPPU(obs);
      const obsW      = _obsWidth(obs, nowMs);
      const speedMult = ppu / PPU;
      const localObsX = projectIncomingX(contactX, distDelta, facing, obsW, speedMult);
      if (!isObstacleOnScreen(localObsX, obsW)) { trail.splice(i, 1); continue; }

      drawObstacle(offsetX + localObsX, obs, facing, offsetX + contactX, distDelta, nowMs);
    }
  }

  function drawDyingGoblins(offsetX, player, facing, dying) {
    for (let i = dying.length - 1; i >= 0; i--) {
      const dg     = dying[i];
      const localX = projectDyingGoblinX(dg.position, player.distance, facing, dg.tick);
      const { metrics } = getDyingGoblinFrameMetrics(dg.tick);
      const width  = metrics.srcWidth * GOBLIN_SCALE;
      const still  = isObstacleOnScreen(localX, width)
        ? _drawDyingGoblin(offsetX + localX, facing === 'right', dg.tick)
        : getDyingGoblinFrameMetrics(dg.tick).active;
      dg.tick++;
      if (!still) dying.splice(i, 1);
    }
  }

  function drawFieldBoosts(offsetX, player, facing, boosts, side) {
    if (!boosts || !boosts.length) return;
    const localX  = facing === 'right' ? BOY_LOCAL_X : GIRL_LOCAL_X;
    const accentC = side === 'boy' ? '#b04eff' : '#44aaff';
    const bw = 16;

    for (const boost of boosts) {
      if (boost.collected) continue;
      const distDelta = boost.distance - player.distance;
      if (distDelta < -10 || distDelta > 130) continue;

      const localBX = facing === 'right'
        ? localX + distDelta * PPU
        : localX - distDelta * PPU - bw;

      _drawBoost(offsetX + localBX, accentC);
    }
  }

  function _drawBoost(x, accent) {
    const bw    = 16, bh = 16;
    const cy    = GROUND_TOP - SPRITE_H - 24;
    const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
    ctx.save();
    ctx.globalAlpha = pulse * 0.35;
    ctx.fillStyle   = accent;
    ctx.fillRect(x - 5, cy - 5, bw + 10, bh + 10);
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = '#ffee44';
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, cy);
    ctx.lineTo(x + bw,     cy + bh / 2);
    ctx.lineTo(x + bw / 2, cy + bh);
    ctx.lineTo(x,          cy + bh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(x + bw / 2 - 2, cy + 3, 4, 4);
    ctx.restore();
  }

  return { drawObstacle, drawFieldObstacles, drawTrailObstacles, drawDyingGoblins, drawFieldBoosts };
}
