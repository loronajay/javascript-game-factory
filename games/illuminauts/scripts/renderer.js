import {
  BASE_LIGHT_RADIUS,
  COLORS,
  HEARTS_MAX,
  POWER_LIGHT_RADIUS,
  STAMINA_MAX,
  VIEW_TILES_X,
  VIEW_TILES_Y
} from './config.js';
import { getTile, isGoalAt } from './map.js';
import {
  getAlienPosition,
  getLaserGatePhase,
  getTurretBeamTiles,
  getTurretPhase
} from './hazards.js';
import { drawSprite, drawSpriteContain } from './assets.js';

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const h = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function fillRect(ctx, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(sx, sy, size, size);
}

function strokeRect(ctx, sx, sy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
}

function glyph(ctx, text, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.font = `${Math.floor(size * 0.52)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx + size / 2, sy + size / 2);
}

// ─── Individual entity drawers ────────────────────────────────────────────────

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

function turretSprite(turret) {
  if (turret.dx > 0) return 'turretRight';
  if (turret.dx < 0) return 'turretLeft';
  if (turret.dy > 0) return 'turretDown';
  return 'turretUp';
}

function drawTurretCharge(ctx, turret, sx, sy, size, phase, now) {
  if (!drawSpriteContain(ctx, turretSprite(turret), sx + size / 2, sy + size / 2, size * 1.24, size * 1.24)) {
    fillRect(ctx, sx + size * 0.14, sy + size * 0.14, size * 0.72, COLORS.turret);
    glyph(ctx, 'T', sx, sy, size, '#190900');
  }

  if (phase === 'cooldown') return;
  const pulse = phase === 'active' ? 1 : 0.55 + Math.sin(now / 70) * 0.22;
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

function beaconPieceName(map, wx, wy) {
  const b = getBeaconBounds(map);
  if (!b) return null;
  const cx = Math.floor((b.minX + b.maxX) / 2);
  const cy = Math.floor((b.minY + b.maxY) / 2);
  const lx = wx - (cx - 1);
  const ly = wy - (cy - 1);
  if (lx < 0 || lx > 2 || ly < 0 || ly > 2) return null;
  return `beacon${ly}${lx}`;
}

function drawBeaconPiece(ctx, map, wx, wy, sx, sy, size) {
  const piece = beaconPieceName(map, wx, wy);
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

function drawPlayer(ctx, player, now, cx, cy, size) {
  const invuln = now < player.invulnerableUntil;
  const spriteKey = { up: 'playerUp', down: 'playerDown', left: 'playerLeft', right: 'playerRight' }[player.dir] || 'playerDown';
  ctx.save();
  if (invuln) ctx.globalAlpha = 0.65 + Math.sin(now / 50) * 0.35;
  if (!drawSpriteContain(ctx, spriteKey, cx, cy, size * 0.9, size * 0.96)) {
    ctx.beginPath();
    ctx.fillStyle = invuln ? COLORS.playerInvuln : COLORS.player;
    ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── World draw (smooth float-position camera) ────────────────────────────────
// startX/startY are float tile-space coords of the viewport top-left corner.
// Screen position for world tile (wx, wy): offsetX + (wx - startX) * size
// Player is always at viewport center (offsetX + VIEW_TILES_X/2 * size).

function drawWorld(ctx, map, hazards, now, startX, startY, size, offX, offY) {
  function sx(wx) { return offX + (wx - startX) * size; }
  function sy(wy) { return offY + (wy - startY) * size; }

  // Tile range — one tile wider on each edge to prevent pop-in at border
  const tL = Math.floor(startX) - 1;
  const tR = Math.ceil(startX + VIEW_TILES_X) + 1;
  const tT = Math.floor(startY) - 1;
  const tB = Math.ceil(startY + VIEW_TILES_Y) + 1;

  // Pass 1: base tiles
  for (let wy = tT; wy <= tB; wy++) {
    for (let wx = tL; wx <= tR; wx++) {
      drawTileBase(ctx, map, wx, wy, sx(wx), sy(wy), size);
    }
  }

  // Pass 2: beacon core pieces (on top of floor, behind entities)
  for (const goal of map.goals) {
    drawBeaconPiece(ctx, map, goal.x, goal.y, sx(goal.x), sy(goal.y), size);
  }

  // Pass 3: laser doors (wide sprite extends into adjacent tiles)
  for (const door of map.doors) {
    drawLaserDoor(ctx, door, sx(door.x), sy(door.y), size);
  }

  // Pass 4: pickups
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

  // Pass 5: alien patrols
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

  // Pass 6: laser gates
  for (const gate of hazards.laserGates) {
    const phase = getLaserGatePhase(gate, now);
    if (phase === 'cooldown') continue;
    for (const tile of gate.tiles) {
      drawLaserSegment(ctx, sx(tile.x), sy(tile.y), size, phase, 'horizontal');
    }
  }

  // Pass 7: turrets + beams
  for (const turret of hazards.turrets) {
    const phase = getTurretPhase(turret, now);
    drawTurretCharge(ctx, turret, sx(turret.x), sy(turret.y), size, phase, now);
    if (phase !== 'cooldown') {
      const orientation = turret.dy !== 0 ? 'vertical' : 'horizontal';
      for (const tile of getTurretBeamTiles(turret)) {
        drawLaserSegment(ctx, sx(tile.x), sy(tile.y), size, phase, orientation);
      }
    }
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function drawHud(ctx, state, now, width, height) {
  const { player } = state;
  const barH = Math.max(38, Math.floor(height * 0.055));
  const pad = Math.floor(barH * 0.3);
  const fontSize = Math.floor(barH * 0.5);
  const monoSize = Math.floor(barH * 0.4);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.84)';
  ctx.fillRect(0, 0, width, barH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(width, barH); ctx.stroke();

  // Hearts
  const heartStr = '♥'.repeat(player.hearts) + '♡'.repeat(HEARTS_MAX - player.hearts);
  ctx.fillStyle = player.hearts <= 1 ? '#ff4a4a' : '#ff8080';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heartStr, pad, barH / 2);

  // Chips
  ctx.fillStyle = COLORS.chip;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`[A] × ${player.chips}`, width / 2, barH / 2);

  // Power cell
  const powerRemaining = Math.max(0, player.powerUntil - now);
  ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
  ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(powerRemaining > 0 ? `PWR ${Math.ceil(powerRemaining / 1000)}s` : 'PWR —', width - pad, barH / 2);

  // Stamina bar
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const staminaH = 5;
  const staminaY = height - msgH - staminaH - 1;
  const barW = width - pad * 2;
  const pct = player.stamina / STAMINA_MAX;

  ctx.fillStyle = 'rgba(2, 4, 10, 0.5)';
  ctx.fillRect(pad, staminaY, barW, staminaH);
  ctx.fillStyle = pct > 0.5 ? '#76f4ff' : pct > 0.25 ? COLORS.laserWarn : COLORS.laserActive;
  ctx.fillRect(pad, staminaY, Math.floor(barW * pct), staminaH);
}

function drawMessage(ctx, state, width, height) {
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const pad  = Math.floor(width * 0.015);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.74)';
  ctx.fillRect(0, height - msgH, width, msgH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, height - msgH); ctx.lineTo(width, height - msgH); ctx.stroke();

  ctx.fillStyle = '#dce8ff';
  ctx.font = `${Math.max(11, Math.floor(width * 0.017))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, pad, height - msgH / 2);
}

// ─── Exported render functions ────────────────────────────────────────────────

export function renderMenu(canvas, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, Math.min(width, height) * 0.55);
  glow.addColorStop(0, 'rgba(118, 244, 255, 0.07)');
  glow.addColorStop(1, 'rgba(118, 244, 255, 0.00)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(32, Math.floor(Math.min(width, height) * 0.1));
  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.55)';
  ctx.shadowBlur = Math.floor(titleSize * 0.85);
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ILLUMINAUTS', cx, cy * 0.72);
  ctx.restore();

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.3))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2-Player Online Maze Race', cx, cy * 0.72 + titleSize * 0.84);

  const pulse = 0.5 + Math.sin(now / 620) * 0.5;
  ctx.globalAlpha = Math.max(0.08, pulse);
  ctx.fillStyle = '#a8d4e0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.27))}px system-ui, sans-serif`;
  ctx.fillText('Press any key to begin', cx, cy * 1.38);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.18))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('WASD / Arrows — move  |  Shift — sprint  |  F3 — debug', cx, height - Math.max(18, height * 0.035));
}

export function renderWinScreen(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy * 0.82, 0, cx, cy * 0.82, Math.min(width, height) * 0.52);
  glow.addColorStop(0, 'rgba(125, 242, 154, 0.2)');
  glow.addColorStop(1, 'rgba(125, 242, 154, 0.00)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(26, Math.floor(Math.min(width, height) * 0.08));
  ctx.save();
  ctx.shadowColor = 'rgba(125, 242, 154, 0.65)';
  ctx.shadowBlur = Math.floor(titleSize * 0.9);
  ctx.fillStyle = '#7df29a';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BEACON CORE REACHED', cx, cy * 0.8);
  ctx.restore();

  ctx.fillStyle = '#7da8b0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.36))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Suit navigation successful.', cx, cy * 0.8 + titleSize * 0.9);

  const doorsDisabled = state.map.doors.filter((d) => d.open).length;
  ctx.fillStyle = COLORS.chip;
  ctx.font = `${Math.max(11, Math.floor(titleSize * 0.28))}px ui-monospace, Consolas, monospace`;
  ctx.fillText(
    `Laser Doors disabled: ${doorsDisabled}  |  Chips remaining: ${state.player.chips}`,
    cx, cy * 0.8 + titleSize * 1.8
  );

  const pulse = 0.5 + Math.sin(now / 620) * 0.5;
  ctx.globalAlpha = Math.max(0.08, pulse);
  ctx.fillStyle = '#a8d4e0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.28))}px system-ui, sans-serif`;
  ctx.fillText('Press any key to return', cx, cy * 1.42);
  ctx.globalAlpha = 1;
}

export function renderGameView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, 0, width, height);

  const size = Math.floor(Math.min(width / VIEW_TILES_X, height / VIEW_TILES_Y));
  const offX  = Math.floor((width  - size * VIEW_TILES_X) / 2);
  const offY  = Math.floor((height - size * VIEW_TILES_Y) / 2);

  const { player } = state;

  // Camera centered exactly on player's continuous position
  const startX = player.px - VIEW_TILES_X / 2;
  const startY = player.py - VIEW_TILES_Y / 2;

  // Player is always at the center of the viewport in screen space
  const lightX = offX + VIEW_TILES_X / 2 * size;
  const lightY = offY + VIEW_TILES_Y / 2 * size;
  const radiusPx = (now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS) * size;

  ctx.save();
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.clip();
  drawWorld(ctx, state.map, state.hazards, now, startX, startY, size, offX, offY);
  drawPlayer(ctx, player, now, lightX, lightY, size);
  ctx.restore();

  // Glow ring at light boundary
  const glowGrad = ctx.createRadialGradient(lightX, lightY, radiusPx * 0.62, lightX, lightY, radiusPx);
  glowGrad.addColorStop(0, 'rgba(118, 244, 255, 0.00)');
  glowGrad.addColorStop(1, 'rgba(118, 244, 255, 0.32)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(118, 244, 255, 0.62)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  drawHud(ctx, state, now, width, height);
  drawMessage(ctx, state, width, height);
}

export function renderDebugView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const size = Math.floor(Math.min(width / state.map.width, height / state.map.height));
  const offX  = Math.floor((width  - size * state.map.width)  / 2);
  const offY  = Math.floor((height - size * state.map.height) / 2);

  // Draw full map (startX=0, startY=0 means world coords == screen coords)
  drawWorld(ctx, state.map, state.hazards, now, 0, 0, size, offX, offY);

  const { player } = state;
  const pcx = offX + player.px * size;
  const pcy = offY + player.py * size;

  // Player dot
  drawPlayer(ctx, player, now, pcx, pcy, size);

  // Light radius overlay
  const lightRadius = (now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS);
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.48)';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.arc(pcx, pcy, lightRadius * size, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#76f4ff';
  ctx.font = `${Math.max(11, Math.floor(width * 0.016))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('DEBUG — F3 to toggle', 8, 8);

  drawHud(ctx, state, now, width, height);
  drawMessage(ctx, state, width, height);
}
