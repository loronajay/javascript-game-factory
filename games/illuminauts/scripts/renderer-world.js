import { COLORS, VIEW_TILES_X, VIEW_TILES_Y } from './config.js';
import { getTile, isGoalAt } from './map.js';
import {
  getAlienPosition,
  getLaserGatePhase,
  getTurretBeamTiles,
  getTurretPhase
} from './hazards.js';
import { drawSprite, drawSpriteContain } from './assets.js';
import { fillRect, strokeRect, glyph } from './renderer-primitives.js';

function drawTileBase(ctx, map, wx, wy, sx, sy, size) {
  const tile = getTile(map, wx, wy);
  if (tile === '#') {
    fillRect(ctx, sx, sy, size, COLORS.wall);
    strokeRect(ctx, sx, sy, size, COLORS.wallEdge);
  } else if (isGoalAt(map, wx, wy)) {
    fillRect(ctx, sx, sy, size, COLORS.goal);
    ctx.save();
    ctx.globalAlpha = 0.22;
    fillRect(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, '#baffc8');
    ctx.restore();
  } else {
    fillRect(ctx, sx, sy, size, (wx + wy) % 2 === 0 ? COLORS.floor : COLORS.floorAlt);
  }
}

function drawLaserSegment(ctx, sx, sy, size, phase, orientation = 'horizontal') {
  const active = phase === 'active';
  const thickness = active ? 0.68 : 0.38;
  const pad = active ? 0.04 : 0.16;

  ctx.save();
  ctx.globalAlpha = active ? 0.95 : 0.68;
  ctx.fillStyle = active ? COLORS.laserActive : COLORS.laserWarn;

  if (orientation === 'vertical') {
    const bw = size * thickness;
    ctx.fillRect(sx + (size - bw) / 2, sy + size * pad, bw, size * (1 - pad * 2));
  } else {
    const bh = size * thickness;
    ctx.fillRect(sx + size * pad, sy + (size - bh) / 2, size * (1 - pad * 2), bh);
  }

  ctx.globalAlpha = active ? 0.9 : 0.75;
  ctx.fillStyle = '#ffffff';
  if (orientation === 'vertical') {
    const cw = size * 0.12;
    ctx.fillRect(sx + (size - cw) / 2, sy + size * 0.08, cw, size * 0.84);
  } else {
    const ch = size * 0.12;
    ctx.fillRect(sx + size * 0.08, sy + (size - ch) / 2, size * 0.84, ch);
  }
  ctx.restore();
}

function turretSpriteName(turret) {
  if (turret.dx > 0) return 'turretRight';
  if (turret.dx < 0) return 'turretLeft';
  if (turret.dy > 0) return 'turretDown';
  return 'turretUp';
}

function drawTurretCharge(ctx, turret, sx, sy, size, phase, elapsed) {
  if (!drawSpriteContain(ctx, turretSpriteName(turret), sx + size / 2, sy + size / 2, size * 1.24, size * 1.24)) {
    fillRect(ctx, sx + size * 0.14, sy + size * 0.14, size * 0.72, COLORS.turret);
    glyph(ctx, 'T', sx, sy, size, '#190900');
  }

  if (phase === 'cooldown') return;
  const pulse = phase === 'active' ? 1 : 0.55 + Math.sin(elapsed / 70) * 0.22;
  ctx.save();
  ctx.globalAlpha = Math.max(0.35, pulse);
  ctx.fillStyle = phase === 'active' ? COLORS.laserActive : COLORS.laserWarn;
  ctx.beginPath();
  ctx.arc(
    sx + size / 2 + turret.dx * size * 0.34,
    sy + size / 2 + turret.dy * size * 0.34,
    size * (phase === 'active' ? 0.2 : 0.16),
    0, Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

function getBeaconBounds(map) {
  if (!map.goals.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of map.goals) {
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x); maxY = Math.max(maxY, g.y);
  }
  return { minX, minY, maxX, maxY };
}

function beaconPieceName(bounds, wx, wy) {
  if (!bounds) return null;
  const cx = Math.floor((bounds.minX + bounds.maxX) / 2);
  const cy = Math.floor((bounds.minY + bounds.maxY) / 2);
  const lx = wx - (cx - 1);
  const ly = wy - (cy - 1);
  if (lx < 0 || lx > 2 || ly < 0 || ly > 2) return null;
  return `beacon${ly}${lx}`;
}

function drawBeaconPiece(ctx, bounds, wx, wy, sx, sy, size) {
  const piece = beaconPieceName(bounds, wx, wy);
  if (!piece) return;
  if (!drawSprite(ctx, piece, sx, sy, size, size)) glyph(ctx, 'B', sx, sy, size, '#00130b');
}

function drawLaserDoor(ctx, door, sx, sy, size) {
  if (door.open) {
    const lOk = drawSpriteContain(ctx, 'laserDoorDisabledLeft',  sx - size / 2,   sy + size / 2, size * 0.72, size * 1.2);
    const rOk = drawSpriteContain(ctx, 'laserDoorDisabledRight', sx + size * 1.5, sy + size / 2, size * 0.72, size * 1.2);
    if (!lOk || !rOk) strokeRect(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.doorOpen);
    return;
  }
  if (!drawSpriteContain(ctx, 'laserDoorActiveWide', sx + size / 2, sy + size / 2, size * 3.15, size * 1.38)) {
    fillRect(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.door);
    glyph(ctx, 'D', sx, sy, size, '#100014');
  }
}

function drawBetaPaletteOverlay(ctx, cx, cy, size) {
  const w = size * 0.9;
  const h = size * 0.96;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.54;
  ctx.fillStyle = '#ff8c42';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export function drawPlayer(ctx, player, now, cx, cy, size, spriteCatalog = undefined) {
  const invuln = now < (player.invulnerableUntil || 0);
  const isBeta = player.palette === 'beta' || player.role === 'B';
  const spriteKey = { up: 'playerUp', down: 'playerDown', left: 'playerLeft', right: 'playerRight' }[player.dir] || 'playerDown';
  ctx.save();
  if (invuln) ctx.globalAlpha = 0.65 + Math.sin(now / 50) * 0.35;
  if (drawSpriteContain(ctx, spriteKey, cx, cy, size * 0.9, size * 0.96, spriteCatalog)) {
    if (isBeta) drawBetaPaletteOverlay(ctx, cx, cy, size);
  } else {
    ctx.beginPath();
    ctx.fillStyle = isBeta ? '#ff8c42' : (invuln ? COLORS.playerInvuln : COLORS.player);
    ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// elapsed = ms since game start (used for hazard phase sync).
// startX/startY are float tile-space coords of the viewport top-left corner.
export function drawWorld(ctx, map, hazards, elapsed, startX, startY, size, offX, offY, viewW = VIEW_TILES_X, viewH = VIEW_TILES_Y) {
  function sx(wx) { return offX + (wx - startX) * size; }
  function sy(wy) { return offY + (wy - startY) * size; }

  const tL = Math.floor(startX) - 1;
  const tR = Math.ceil(startX + viewW) + 1;
  const tT = Math.floor(startY) - 1;
  const tB = Math.ceil(startY + viewH) + 1;

  for (let wy = tT; wy <= tB; wy++) {
    for (let wx = tL; wx <= tR; wx++) {
      drawTileBase(ctx, map, wx, wy, sx(wx), sy(wy), size);
    }
  }

  const beaconBounds = getBeaconBounds(map);
  for (const goal of map.goals) {
    drawBeaconPiece(ctx, beaconBounds, goal.x, goal.y, sx(goal.x), sy(goal.y), size);
  }

  for (const door of map.doors) {
    drawLaserDoor(ctx, door, sx(door.x), sy(door.y), size);
  }

  for (const pickup of map.pickups) {
    if (!pickup.active) continue;
    const cx = sx(pickup.x + 0.5);
    const cy = sy(pickup.y + 0.5);
    if (pickup.type === 'chip') {
      if (!drawSpriteContain(ctx, 'accessChip', cx, cy, size * 0.82, size * 0.82)) {
        ctx.fillStyle = COLORS.chip;
        ctx.fillRect(sx(pickup.x) + size * 0.28, sy(pickup.y) + size * 0.28, size * 0.44, size * 0.44);
        glyph(ctx, 'A', sx(pickup.x), sy(pickup.y), size, '#241800');
      }
    } else if (pickup.type === 'powerCell') {
      if (!drawSpriteContain(ctx, 'powerCell', cx, cy, size * 0.82, size * 0.92)) {
        ctx.beginPath();
        ctx.fillStyle = COLORS.power;
        ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
        ctx.fill();
        glyph(ctx, 'P', sx(pickup.x), sy(pickup.y), size, '#001c20');
      }
    }
  }

  for (const alien of hazards.aliens) {
    const pos = getAlienPosition(alien);
    const cx = sx(pos.x + 0.5);
    const cy = sy(pos.y + 0.5);
    if (!drawSpriteContain(ctx, 'alienPatrol', cx, cy, size * 1.08, size * 1.08)) {
      ctx.beginPath();
      ctx.fillStyle = COLORS.alien;
      ctx.arc(cx, cy, size * 0.33, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const gate of hazards.laserGates) {
    const phase = getLaserGatePhase(gate, elapsed);
    if (phase === 'cooldown') continue;
    for (const tile of gate.tiles) {
      drawLaserSegment(ctx, sx(tile.x), sy(tile.y), size, phase, 'horizontal');
    }
  }

  for (const turret of hazards.turrets) {
    const phase = getTurretPhase(turret, elapsed);
    drawTurretCharge(ctx, turret, sx(turret.x), sy(turret.y), size, phase, elapsed);
    if (phase !== 'cooldown') {
      const orientation = turret.dy !== 0 ? 'vertical' : 'horizontal';
      for (const tile of getTurretBeamTiles(turret)) {
        drawLaserSegment(ctx, sx(tile.x), sy(tile.y), size, phase, orientation);
      }
    }
  }
}
