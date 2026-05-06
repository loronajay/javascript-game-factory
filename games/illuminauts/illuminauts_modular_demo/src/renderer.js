import {
  BASE_LIGHT_RADIUS,
  COLORS,
  POWER_LIGHT_RADIUS,
  VIEW_TILES_X,
  VIEW_TILES_Y
} from './config.js';
import { getDoorAt, getPickupAt, getTile, isGoalAt } from './map.js';
import {
  getAlienPosition,
  getLaserGatePhase,
  getTurretBeamTiles,
  getTurretPhase
} from './hazards.js';
import { drawSprite, drawSpriteContain } from './assets.js';

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function fillTile(ctx, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(sx, sy, size, size);
}

function strokeTile(ctx, sx, sy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
}

function drawGlyph(ctx, text, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.font = `${Math.floor(size * 0.52)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx + size / 2, sy + size / 2);
}

function drawTileBase(ctx, map, x, y, sx, sy, size) {
  const tile = getTile(map, x, y);
  if (tile === '#') {
    fillTile(ctx, sx, sy, size, COLORS.wall);
    strokeTile(ctx, sx, sy, size, COLORS.wallEdge);
  } else if (isGoalAt(map, x, y)) {
    fillTile(ctx, sx, sy, size, COLORS.goal);
    ctx.save();
    ctx.globalAlpha = 0.22;
    fillTile(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, '#baffc8');
    ctx.restore();
  } else {
    fillTile(ctx, sx, sy, size, (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt);
  }
}

function drawLaserSegment(ctx, sx, sy, size, phase, orientation = 'horizontal') {
  const active = phase === 'active';
  const color = active ? COLORS.laserActive : COLORS.laserWarn;
  const alpha = active ? 0.95 : 0.68;
  const thickness = active ? 0.68 : 0.38;
  const pad = active ? 0.04 : 0.16;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  if (orientation === 'vertical') {
    const beamWidth = size * thickness;
    ctx.fillRect(sx + (size - beamWidth) / 2, sy + size * pad, beamWidth, size * (1 - pad * 2));
  } else {
    const beamHeight = size * thickness;
    ctx.fillRect(sx + size * pad, sy + (size - beamHeight) / 2, size * (1 - pad * 2), beamHeight);
  }

  ctx.globalAlpha = active ? 0.9 : 0.75;
  ctx.fillStyle = '#ffffff';
  if (orientation === 'vertical') {
    const coreWidth = size * 0.12;
    ctx.fillRect(sx + (size - coreWidth) / 2, sy + size * 0.08, coreWidth, size * 0.84);
  } else {
    const coreHeight = size * 0.12;
    ctx.fillRect(sx + size * 0.08, sy + (size - coreHeight) / 2, size * 0.84, coreHeight);
  }
  ctx.restore();
}

function getTurretSprite(turret) {
  if (turret.dx > 0) return 'turretRight';
  if (turret.dx < 0) return 'turretLeft';
  if (turret.dy > 0) return 'turretDown';
  return 'turretUp';
}

function drawTurretCharge(ctx, turret, sx, sy, size, phase, now) {
  const drew = drawSpriteContain(ctx, getTurretSprite(turret), sx + size / 2, sy + size / 2, size * 1.24, size * 1.24);
  if (!drew) {
    fillTile(ctx, sx + size * 0.14, sy + size * 0.14, size * 0.72, COLORS.turret);
    drawGlyph(ctx, 'T', sx, sy, size, '#190900');
  }

  if (phase === 'cooldown') return;

  const pulse = phase === 'active' ? 1 : 0.55 + Math.sin(now / 70) * 0.22;
  const muzzleX = sx + size / 2 + turret.dx * size * 0.34;
  const muzzleY = sy + size / 2 + turret.dy * size * 0.34;

  ctx.save();
  ctx.globalAlpha = Math.max(0.35, pulse);
  ctx.fillStyle = phase === 'active' ? COLORS.laserActive : COLORS.laserWarn;
  ctx.beginPath();
  ctx.arc(muzzleX, muzzleY, size * (phase === 'active' ? 0.2 : 0.16), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getPlayerSprite(player) {
  return {
    up: 'playerUp',
    down: 'playerDown',
    left: 'playerLeft',
    right: 'playerRight'
  }[player.dir] || 'playerDown';
}

function getBeaconBounds(map) {
  if (!map.goals.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const goal of map.goals) {
    minX = Math.min(minX, goal.x);
    minY = Math.min(minY, goal.y);
    maxX = Math.max(maxX, goal.x);
    maxY = Math.max(maxY, goal.y);
  }
  return { minX, minY, maxX, maxY };
}

function getBeaconPieceName(map, x, y) {
  const bounds = getBeaconBounds(map);
  if (!bounds) return null;

  const centerX = Math.floor((bounds.minX + bounds.maxX) / 2);
  const centerY = Math.floor((bounds.minY + bounds.maxY) / 2);
  const localX = x - (centerX - 1);
  const localY = y - (centerY - 1);

  if (localX < 0 || localX > 2 || localY < 0 || localY > 2) return null;
  return `beacon${localY}${localX}`;
}

function drawBeaconPiece(ctx, map, x, y, sx, sy, size) {
  const piece = getBeaconPieceName(map, x, y);
  if (!piece) return;

  const drew = drawSprite(ctx, piece, sx, sy, size, size);
  if (!drew) drawGlyph(ctx, 'B', sx, sy, size, '#00130b');
}

function drawLaserDoor(ctx, door, sx, sy, size) {
  if (door.open) {
    const leftDrew = drawSpriteContain(
      ctx,
      'laserDoorDisabledLeft',
      sx - size / 2,
      sy + size / 2,
      size * 0.72,
      size * 1.2
    );
    const rightDrew = drawSpriteContain(
      ctx,
      'laserDoorDisabledRight',
      sx + size * 1.5,
      sy + size / 2,
      size * 0.72,
      size * 1.2
    );
    if (!leftDrew || !rightDrew) strokeTile(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.doorOpen);
    return;
  }

  const drew = drawSpriteContain(
    ctx,
    'laserDoorActiveWide',
    sx + size / 2,
    sy + size / 2,
    size * 3.15,
    size * 1.38
  );

  if (!drew) {
    fillTile(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.door);
    drawGlyph(ctx, 'D', sx, sy, size, '#100014');
  }
}

function drawWorldEntity(ctx, state, x, y, sx, sy, size, now) {
  const { map, player, hazards } = state;

  if (isGoalAt(map, x, y)) {
    drawBeaconPiece(ctx, map, x, y, sx, sy, size);
  }

  const door = getDoorAt(map, x, y);
  if (door) drawLaserDoor(ctx, door, sx, sy, size);

  const pickup = getPickupAt(map, x, y);
  if (pickup?.type === 'chip') {
    const drew = drawSpriteContain(ctx, 'accessChip', sx + size / 2, sy + size / 2, size * 0.82, size * 0.82);
    if (!drew) {
      fillTile(ctx, sx + size * 0.28, sy + size * 0.28, size * 0.44, COLORS.chip);
      drawGlyph(ctx, 'A', sx, sy, size, '#241800');
    }
  } else if (pickup?.type === 'powerCell') {
    const drew = drawSpriteContain(ctx, 'powerCell', sx + size / 2, sy + size / 2, size * 0.82, size * 0.92);
    if (!drew) {
      ctx.beginPath();
      ctx.fillStyle = COLORS.power;
      ctx.arc(sx + size / 2, sy + size / 2, size * 0.24, 0, Math.PI * 2);
      ctx.fill();
      drawGlyph(ctx, 'P', sx, sy, size, '#001c20');
    }
  }

  for (const alien of hazards.aliens) {
    const pos = getAlienPosition(alien);
    if (pos.x === x && pos.y === y) {
      const drew = drawSpriteContain(ctx, 'alienPatrol', sx + size / 2, sy + size / 2, size * 1.08, size * 1.08);
      if (!drew) {
        ctx.beginPath();
        ctx.fillStyle = COLORS.alien;
        ctx.arc(sx + size / 2, sy + size / 2, size * 0.33, 0, Math.PI * 2);
        ctx.fill();
        drawGlyph(ctx, 'X', sx, sy, size, '#120019');
      }
    }
  }

  for (const gate of hazards.laserGates) {
    const phase = getLaserGatePhase(gate, now);
    if (phase === 'cooldown') continue;
    if (!gate.tiles.some((tile) => tile.x === x && tile.y === y)) continue;
    drawLaserSegment(ctx, sx, sy, size, phase, 'horizontal');
  }

  for (const turret of hazards.turrets) {
    const phase = getTurretPhase(turret, now);

    if (turret.x === x && turret.y === y) {
      drawTurretCharge(ctx, turret, sx, sy, size, phase, now);
    }

    const orientation = turret.dy !== 0 ? 'vertical' : 'horizontal';
    if (phase !== 'cooldown' && getTurretBeamTiles(turret).some((tile) => tile.x === x && tile.y === y)) {
      drawLaserSegment(ctx, sx, sy, size, phase, orientation);
    }
  }

  if (player.x === x && player.y === y) {
    const invuln = now < player.invulnerableUntil;
    ctx.save();
    if (invuln) ctx.globalAlpha = 0.68 + Math.sin(now / 50) * 0.22;
    const drew = drawSpriteContain(ctx, getPlayerSprite(player), sx + size / 2, sy + size / 2, size * 0.9, size * 0.96);
    ctx.restore();

    if (!drew) {
      ctx.beginPath();
      ctx.fillStyle = invuln ? COLORS.playerInvuln : COLORS.player;
      ctx.arc(sx + size / 2, sy + size / 2, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      drawGlyph(ctx, 'I', sx, sy, size, '#001318');
    }
  }
}

function getLightRadius(state, now) {
  return now < state.player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
}

function drawViewportWorld(ctx, state, now, size, offsetX, offsetY, startX, startY) {
  for (let vy = 0; vy < VIEW_TILES_Y; vy++) {
    for (let vx = 0; vx < VIEW_TILES_X; vx++) {
      const x = startX + vx;
      const y = startY + vy;
      const sx = offsetX + vx * size;
      const sy = offsetY + vy * size;
      drawTileBase(ctx, state.map, x, y, sx, sy, size);
      drawWorldEntity(ctx, state, x, y, sx, sy, size, now);
    }
  }
}

export function renderGameView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const size = Math.floor(Math.min(canvas.width / VIEW_TILES_X, canvas.height / VIEW_TILES_Y));
  const offsetX = Math.floor((canvas.width - size * VIEW_TILES_X) / 2);
  const offsetY = Math.floor((canvas.height - size * VIEW_TILES_Y) / 2);
  const startX = state.player.x - Math.floor(VIEW_TILES_X / 2);
  const startY = state.player.y - Math.floor(VIEW_TILES_Y / 2);

  const radiusPx = getLightRadius(state, now) * size;
  const lightX = offsetX + Math.floor(VIEW_TILES_X / 2) * size + size / 2;
  const lightY = offsetY + Math.floor(VIEW_TILES_Y / 2) * size + size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.clip();
  drawViewportWorld(ctx, state, now, size, offsetX, offsetY, startX, startY);
  ctx.restore();

  const glow = ctx.createRadialGradient(lightX, lightY, radiusPx * 0.62, lightX, lightY, radiusPx);
  glow.addColorStop(0, 'rgba(118, 244, 255, 0.00)');
  glow.addColorStop(1, 'rgba(118, 244, 255, 0.32)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(118, 244, 255, 0.62)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  drawMessage(ctx, state, canvas.width, canvas.height);
}

function drawMessage(ctx, state, width, height) {
  ctx.fillStyle = 'rgba(2, 4, 10, 0.68)';
  ctx.fillRect(14, height - 42, width - 28, 28);
  ctx.strokeStyle = '#263353';
  ctx.strokeRect(14, height - 42, width - 28, 28);
  ctx.fillStyle = '#dce8ff';
  ctx.font = `${Math.max(12, Math.floor(width * 0.018))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, 24, height - 28);
}

export function renderDebugView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const size = Math.floor(Math.min(canvas.width / state.map.width, canvas.height / state.map.height));
  const offsetX = Math.floor((canvas.width - size * state.map.width) / 2);
  const offsetY = Math.floor((canvas.height - size * state.map.height) / 2);

  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const sx = offsetX + x * size;
      const sy = offsetY + y * size;
      drawTileBase(ctx, state.map, x, y, sx, sy, size);
      drawWorldEntity(ctx, state, x, y, sx, sy, size, now);
    }
  }

  const lightRadius = getLightRadius(state, now);
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.48)';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.arc(
    offsetX + state.player.x * size + size / 2,
    offsetY + state.player.y * size + size / 2,
    lightRadius * size,
    0,
    Math.PI * 2
  );
  ctx.stroke();
}
