import {
  BASE_LIGHT_RADIUS,
  COLORS,
  HEARTS_MAX,
  POWER_LIGHT_RADIUS,
  STAMINA_MAX,
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

// ─── Tile drawing ─────────────────────────────────────────────────────────────

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

// ─── Hazard drawing ───────────────────────────────────────────────────────────

function drawLaserSegment(ctx, sx, sy, size, phase, orientation = 'horizontal') {
  const active = phase === 'active';
  const color = active ? COLORS.laserActive : COLORS.laserWarn;
  const thickness = active ? 0.68 : 0.38;
  const pad = active ? 0.04 : 0.16;

  ctx.save();
  ctx.globalAlpha = active ? 0.95 : 0.68;
  ctx.fillStyle = color;

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

function getTurretSpriteName(turret) {
  if (turret.dx > 0) return 'turretRight';
  if (turret.dx < 0) return 'turretLeft';
  if (turret.dy > 0) return 'turretDown';
  return 'turretUp';
}

function drawTurretCharge(ctx, turret, sx, sy, size, phase, now) {
  const drew = drawSpriteContain(ctx, getTurretSpriteName(turret), sx + size / 2, sy + size / 2, size * 1.24, size * 1.24);
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

// ─── World object drawing ─────────────────────────────────────────────────────

function getBeaconBounds(map) {
  if (!map.goals.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of map.goals) {
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x); maxY = Math.max(maxY, g.y);
  }
  return { minX, minY, maxX, maxY };
}

function getBeaconPieceName(map, x, y) {
  const b = getBeaconBounds(map);
  if (!b) return null;
  const cx = Math.floor((b.minX + b.maxX) / 2);
  const cy = Math.floor((b.minY + b.maxY) / 2);
  const lx = x - (cx - 1);
  const ly = y - (cy - 1);
  if (lx < 0 || lx > 2 || ly < 0 || ly > 2) return null;
  return `beacon${ly}${lx}`;
}

function drawBeaconPiece(ctx, map, x, y, sx, sy, size) {
  const piece = getBeaconPieceName(map, x, y);
  if (!piece) return;
  if (!drawSprite(ctx, piece, sx, sy, size, size)) drawGlyph(ctx, 'B', sx, sy, size, '#00130b');
}

function drawLaserDoor(ctx, door, sx, sy, size) {
  if (door.open) {
    const lDrew = drawSpriteContain(ctx, 'laserDoorDisabledLeft', sx - size / 2, sy + size / 2, size * 0.72, size * 1.2);
    const rDrew = drawSpriteContain(ctx, 'laserDoorDisabledRight', sx + size * 1.5, sy + size / 2, size * 0.72, size * 1.2);
    if (!lDrew || !rDrew) strokeTile(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.doorOpen);
    return;
  }
  const drew = drawSpriteContain(ctx, 'laserDoorActiveWide', sx + size / 2, sy + size / 2, size * 3.15, size * 1.38);
  if (!drew) {
    fillTile(ctx, sx + size * 0.08, sy + size * 0.08, size * 0.84, COLORS.door);
    drawGlyph(ctx, 'D', sx, sy, size, '#100014');
  }
}

function drawWorldObjects(ctx, state, size, offsetX, offsetY, startX, startY, tilesX, tilesY) {
  for (let vy = 0; vy < tilesY; vy++) {
    for (let vx = 0; vx < tilesX; vx++) {
      const x = startX + vx, y = startY + vy;
      const sx = offsetX + vx * size, sy = offsetY + vy * size;
      if (isGoalAt(state.map, x, y)) drawBeaconPiece(ctx, state.map, x, y, sx, sy, size);
    }
  }

  for (const door of state.map.doors) {
    const vx = door.x - startX, vy = door.y - startY;
    if (vx < -2 || vx > tilesX + 1 || vy < -1 || vy > tilesY) continue;
    drawLaserDoor(ctx, door, offsetX + vx * size, offsetY + vy * size, size);
  }
}

function drawWorldEntity(ctx, state, x, y, sx, sy, size, now) {
  const { map, player, hazards } = state;

  const pickup = getPickupAt(map, x, y);
  if (pickup?.type === 'chip') {
    if (!drawSpriteContain(ctx, 'accessChip', sx + size / 2, sy + size / 2, size * 0.82, size * 0.82)) {
      fillTile(ctx, sx + size * 0.28, sy + size * 0.28, size * 0.44, COLORS.chip);
      drawGlyph(ctx, 'A', sx, sy, size, '#241800');
    }
  } else if (pickup?.type === 'powerCell') {
    if (!drawSpriteContain(ctx, 'powerCell', sx + size / 2, sy + size / 2, size * 0.82, size * 0.92)) {
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
      if (!drawSpriteContain(ctx, 'alienPatrol', sx + size / 2, sy + size / 2, size * 1.08, size * 1.08)) {
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
    if (gate.tiles.some((t) => t.x === x && t.y === y)) drawLaserSegment(ctx, sx, sy, size, phase, 'horizontal');
  }

  for (const turret of hazards.turrets) {
    const phase = getTurretPhase(turret, now);
    if (turret.x === x && turret.y === y) drawTurretCharge(ctx, turret, sx, sy, size, phase, now);
    const orientation = turret.dy !== 0 ? 'vertical' : 'horizontal';
    if (phase !== 'cooldown' && getTurretBeamTiles(turret).some((t) => t.x === x && t.y === y)) {
      drawLaserSegment(ctx, sx, sy, size, phase, orientation);
    }
  }

  if (player.x === x && player.y === y) {
    const invuln = now < player.invulnerableUntil;
    const spriteKey = { up: 'playerUp', down: 'playerDown', left: 'playerLeft', right: 'playerRight' }[player.dir] || 'playerDown';
    ctx.save();
    if (invuln) ctx.globalAlpha = 0.68 + Math.sin(now / 50) * 0.22;
    if (!drawSpriteContain(ctx, spriteKey, sx + size / 2, sy + size / 2, size * 0.9, size * 0.96)) {
      ctx.beginPath();
      ctx.fillStyle = invuln ? COLORS.playerInvuln : COLORS.player;
      ctx.arc(sx + size / 2, sy + size / 2, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      drawGlyph(ctx, 'I', sx, sy, size, '#001318');
    }
    ctx.restore();
  }
}

function getLightRadius(state, now) {
  return now < state.player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
}

function drawViewportWorld(ctx, state, now, size, offsetX, offsetY, startX, startY) {
  for (let vy = 0; vy < VIEW_TILES_Y; vy++) {
    for (let vx = 0; vx < VIEW_TILES_X; vx++) {
      drawTileBase(ctx, state.map, startX + vx, startY + vy, offsetX + vx * size, offsetY + vy * size, size);
    }
  }
  drawWorldObjects(ctx, state, size, offsetX, offsetY, startX, startY, VIEW_TILES_X, VIEW_TILES_Y);
  for (let vy = 0; vy < VIEW_TILES_Y; vy++) {
    for (let vx = 0; vx < VIEW_TILES_X; vx++) {
      drawWorldEntity(ctx, state, startX + vx, startY + vy, offsetX + vx * size, offsetY + vy * size, size, now);
    }
  }
}

// ─── HUD (drawn on-canvas, no clip region, reset coordinate system) ───────────

function drawHud(ctx, state, now, width, height) {
  const { player } = state;
  const barH = Math.max(38, Math.floor(height * 0.055));
  const pad = Math.floor(barH * 0.3);
  const fontSize = Math.floor(barH * 0.5);
  const monoSize = Math.floor(barH * 0.4);

  // Top bar
  ctx.fillStyle = 'rgba(2, 4, 10, 0.84)';
  ctx.fillRect(0, 0, width, barH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(width, barH);
  ctx.stroke();

  // Hearts
  const heartStr = '♥'.repeat(player.hearts) + '♡'.repeat(HEARTS_MAX - player.hearts);
  ctx.fillStyle = player.hearts <= 1 ? '#ff4a4a' : '#ff8080';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heartStr, pad, barH / 2);

  // Chips — centered
  ctx.fillStyle = COLORS.chip;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`[A] × ${player.chips}`, width / 2, barH / 2);

  // Power cell — right
  const powerRemaining = Math.max(0, player.powerUntil - now);
  const powerStr = powerRemaining > 0 ? `PWR ${Math.ceil(powerRemaining / 1000)}s` : 'PWR —';
  ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
  ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(powerStr, width - pad, barH / 2);

  // Stamina bar — slim strip just above the message bar
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const staminaH = 5;
  const staminaY = height - msgH - staminaH - 1;
  const staminaPct = player.stamina / STAMINA_MAX;
  const barW = width - pad * 2;

  ctx.fillStyle = 'rgba(2, 4, 10, 0.5)';
  ctx.fillRect(pad, staminaY, barW, staminaH);

  const staminaColor = staminaPct > 0.5 ? '#76f4ff' : staminaPct > 0.25 ? COLORS.laserWarn : COLORS.laserActive;
  ctx.fillStyle = staminaColor;
  ctx.fillRect(pad, staminaY, Math.floor(barW * staminaPct), staminaH);
}

function drawMessage(ctx, state, width, height) {
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const fontSize = Math.max(11, Math.floor(width * 0.017));
  const pad = Math.floor(width * 0.015);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.74)';
  ctx.fillRect(0, height - msgH, width, msgH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - msgH);
  ctx.lineTo(width, height - msgH);
  ctx.stroke();

  ctx.fillStyle = '#dce8ff';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
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

  // Atmospheric radial glow
  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, Math.min(width, height) * 0.55);
  glow.addColorStop(0, 'rgba(118, 244, 255, 0.07)');
  glow.addColorStop(1, 'rgba(118, 244, 255, 0.00)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(32, Math.floor(Math.min(width, height) * 0.1));

  // Title shadow + text
  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.55)';
  ctx.shadowBlur = Math.floor(titleSize * 0.85);
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ILLUMINAUTS', cx, cy * 0.72);
  ctx.restore();

  // Subtitle
  const subSize = Math.max(13, Math.floor(titleSize * 0.3));
  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${subSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2-Player Online Maze Race', cx, cy * 0.72 + titleSize * 0.84);

  // Key prompt — breathing pulse
  const pulse = 0.5 + Math.sin(now / 620) * 0.5;
  ctx.globalAlpha = Math.max(0.08, pulse);
  const promptSize = Math.max(13, Math.floor(titleSize * 0.27));
  ctx.fillStyle = '#a8d4e0';
  ctx.font = `${promptSize}px system-ui, sans-serif`;
  ctx.fillText('Press any key to begin', cx, cy * 1.38);
  ctx.globalAlpha = 1;

  // Controls hint
  const hintSize = Math.max(10, Math.floor(titleSize * 0.18));
  ctx.fillStyle = '#1e2e38';
  ctx.font = `${hintSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText('WASD / Arrows — move  |  Shift — sprint  |  E — activate power cell  |  F3 — debug', cx, height - Math.max(18, height * 0.035));
}

export function renderWinScreen(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  // Beacon glow
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

  const subSize = Math.max(13, Math.floor(titleSize * 0.36));
  ctx.fillStyle = '#7da8b0';
  ctx.font = `${subSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Suit navigation successful — facility accessed.', cx, cy * 0.8 + titleSize * 0.9);

  // Stats
  const statSize = Math.max(11, Math.floor(titleSize * 0.28));
  const doorsDisabled = state.map.doors.filter((d) => d.open).length;
  ctx.fillStyle = COLORS.chip;
  ctx.font = `${statSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText(
    `Laser Doors disabled: ${doorsDisabled}  |  Chips remaining: ${state.player.chips}`,
    cx, cy * 0.8 + titleSize * 1.8
  );

  // Return prompt — breathing pulse
  const pulse = 0.5 + Math.sin(now / 620) * 0.5;
  ctx.globalAlpha = Math.max(0.08, pulse);
  const promptSize = Math.max(13, Math.floor(titleSize * 0.28));
  ctx.fillStyle = '#a8d4e0';
  ctx.font = `${promptSize}px system-ui, sans-serif`;
  ctx.fillText('Press any key to return', cx, cy * 1.42);
  ctx.globalAlpha = 1;
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

  // Clip to suit light circle — everything outside is black fog
  ctx.save();
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.clip();
  drawViewportWorld(ctx, state, now, size, offsetX, offsetY, startX, startY);
  ctx.restore();

  // Glow gradient at light boundary
  const glow = ctx.createRadialGradient(lightX, lightY, radiusPx * 0.62, lightX, lightY, radiusPx);
  glow.addColorStop(0, 'rgba(118, 244, 255, 0.00)');
  glow.addColorStop(1, 'rgba(118, 244, 255, 0.32)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  // Rim stroke
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.62)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // HUD — drawn last, no clip, full canvas coordinate system
  drawHud(ctx, state, now, canvas.width, canvas.height);
  drawMessage(ctx, state, canvas.width, canvas.height);
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
      drawTileBase(ctx, state.map, x, y, offsetX + x * size, offsetY + y * size, size);
    }
  }

  drawWorldObjects(ctx, state, size, offsetX, offsetY, 0, 0, state.map.width, state.map.height);

  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      drawWorldEntity(ctx, state, x, y, offsetX + x * size, offsetY + y * size, size, now);
    }
  }

  // Light radius overlay
  const lightRadius = getLightRadius(state, now);
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.48)';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.arc(
    offsetX + state.player.x * size + size / 2,
    offsetY + state.player.y * size + size / 2,
    lightRadius * size, 0, Math.PI * 2
  );
  ctx.stroke();

  // Label
  const labelSize = Math.max(11, Math.floor(canvas.width * 0.016));
  ctx.fillStyle = '#76f4ff';
  ctx.font = `${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('DEBUG — F3 to toggle', 8, 8);

  drawHud(ctx, state, now, canvas.width, canvas.height);
  drawMessage(ctx, state, canvas.width, canvas.height);
}
