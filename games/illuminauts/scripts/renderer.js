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

// ─── UI button helper ─────────────────────────────────────────────────────────

function drawButton(ctx, label, x, y, w, h, registerButton, id, isHovered = false) {
  ctx.save();
  if (isHovered) {
    ctx.shadowColor = 'rgba(118, 244, 255, 0.5)';
    ctx.shadowBlur  = 14;
  }
  ctx.fillStyle   = isHovered ? 'rgba(28, 58, 82, 0.97)' : 'rgba(14, 30, 50, 0.92)';
  ctx.strokeStyle = isHovered ? '#a8f0ff' : '#76f4ff';
  ctx.lineWidth   = isHovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isHovered ? '#e8f8ff' : '#c8eeff';
  ctx.font = `${Math.floor(h * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);

  if (registerButton) registerButton(id, x, y, w, h);
}

// ─── Role selection card ──────────────────────────────────────────────────────

function drawRoleCard(ctx, x, y, w, h, title, subtitle, detail, accentColor, isHovered) {
  ctx.save();
  if (isHovered) {
    ctx.shadowColor = accentColor;
    ctx.shadowBlur  = 22;
  }
  ctx.fillStyle   = isHovered ? 'rgba(22, 50, 70, 0.97)' : 'rgba(14, 30, 50, 0.92)';
  ctx.strokeStyle = isHovered ? accentColor : 'rgba(118, 244, 255, 0.35)';
  ctx.lineWidth   = isHovered ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Large letter glyph
  const iconSize = Math.floor(h * 0.28);
  ctx.fillStyle = isHovered ? accentColor : 'rgba(118, 244, 255, 0.5)';
  ctx.font = `bold ${iconSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title[0], x + w / 2, y + h * 0.3);

  ctx.fillStyle = isHovered ? '#e0f4ff' : '#a8c8d8';
  ctx.font = `bold ${Math.floor(h * 0.115)}px system-ui, sans-serif`;
  ctx.fillText(title, x + w / 2, y + h * 0.54);

  ctx.fillStyle = isHovered ? accentColor : '#4a6a7a';
  ctx.font = `${Math.floor(h * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(subtitle, x + w / 2, y + h * 0.68);

  ctx.fillStyle = '#3a5060';
  ctx.font = `${Math.floor(h * 0.08)}px system-ui, sans-serif`;
  ctx.fillText(detail, x + w / 2, y + h * 0.8);

  ctx.fillStyle = isHovered ? 'rgba(200,230,255,0.75)' : 'rgba(200,230,255,0.3)';
  ctx.font = `${Math.floor(h * 0.075)}px ui-monospace, Consolas, monospace`;
  ctx.fillText('[ SELECT ]', x + w / 2, y + h * 0.91);
  ctx.restore();
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

function drawTurretCharge(ctx, turret, sx, sy, size, phase, elapsed) {
  if (!drawSpriteContain(ctx, turretSprite(turret), sx + size / 2, sy + size / 2, size * 1.24, size * 1.24)) {
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
  const invuln = now < (player.invulnerableUntil || 0);
  const spriteKey = { up: 'playerUp', down: 'playerDown', left: 'playerLeft', right: 'playerRight' }[player.dir] || 'playerDown';
  ctx.save();
  if (invuln) ctx.globalAlpha = 0.65 + Math.sin(now / 50) * 0.35;
  if (!drawSpriteContain(ctx, spriteKey, cx, cy, size * 0.9, size * 0.96)) {
    ctx.beginPath();
    // Remote player uses a distinct orange so the two can be told apart.
    ctx.fillStyle = player.isRemote ? '#ff8c42' : (invuln ? COLORS.playerInvuln : COLORS.player);
    ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── World draw ───────────────────────────────────────────────────────────────
// elapsed = ms since game start (used for hazard phase sync).
// startX/startY are float tile-space coords of the viewport top-left corner.

function drawWorld(ctx, map, hazards, elapsed, startX, startY, size, offX, offY, viewW = VIEW_TILES_X, viewH = VIEW_TILES_Y) {
  function sx(wx) { return offX + (wx - startX) * size; }
  function sy(wy) { return offY + (wy - startY) * size; }

  const tL = Math.floor(startX) - 1;
  const tR = Math.ceil(startX + viewW) + 1;
  const tT = Math.floor(startY) - 1;
  const tB = Math.ceil(startY + viewH) + 1;

  // Pass 1: base tiles
  for (let wy = tT; wy <= tB; wy++) {
    for (let wx = tL; wx <= tR; wx++) {
      drawTileBase(ctx, map, wx, wy, sx(wx), sy(wy), size);
    }
  }

  // Pass 2: beacon core pieces
  for (const goal of map.goals) {
    drawBeaconPiece(ctx, map, goal.x, goal.y, sx(goal.x), sy(goal.y), size);
  }

  // Pass 3: laser doors
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
    const phase = getLaserGatePhase(gate, elapsed);
    if (phase === 'cooldown') continue;
    for (const tile of gate.tiles) {
      drawLaserSegment(ctx, sx(tile.x), sy(tile.y), size, phase, 'horizontal');
    }
  }

  // Pass 7: turrets + beams
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

  // Remote player name (online only)
  if (state.online?.enabled && state.remote?.displayName) {
    ctx.fillStyle = '#ff8c42';
    ctx.font = `${Math.floor(fontSize * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`vs ${state.remote.displayName}`, width - pad - Math.max(80, width * 0.14), barH / 2);
  }

  // Power cell timer
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

// ─── Shared background ────────────────────────────────────────────────────────

function drawDarkBg(ctx, width, height, glowColor = 'rgba(118, 244, 255, 0.07)') {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, Math.min(width, height) * 0.55);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

// ─── Exported render functions ────────────────────────────────────────────────

export function renderMenu(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(32, Math.floor(Math.min(width, height) * 0.1));

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.55)';
  ctx.shadowBlur = Math.floor(titleSize * 0.85);
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ILLUMINAUTS', cx, cy * 0.54);
  ctx.restore();

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.3))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2-Player Online Maze Race', cx, cy * 0.54 + titleSize * 0.84);

  const btnW = Math.min(300, width * 0.44);
  const btnH = Math.max(50, Math.floor(Math.min(width, height) * 0.072));
  const btnX = cx - btnW / 2;

  drawButton(ctx, 'PLAY ONLINE', btnX, cy * 0.9, btnW, btnH, registerButton, 'btn_play_online', hoveredButtonId === 'btn_play_online');

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.18))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WASD / Arrows — move  |  Shift — sprint  |  F3 — debug', cx, height - Math.max(18, height * 0.035));
}

export function renderSideSelect(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.4)';
  ctx.shadowBlur = titleSize * 0.6;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHOOSE YOUR SUIT', cx, cy * 0.46);
  ctx.restore();

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(titleSize * 0.35))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Your suit determines your starting position — queue joins your preferred side', cx, cy * 0.46 + titleSize * 0.9);

  const cardW = Math.min(230, width * 0.3);
  const cardH = Math.max(190, cardW * 0.95);
  const gap   = Math.max(24, width * 0.035);
  const cardY = cy * 0.6;

  const alphaX = cx - gap / 2 - cardW;
  const betaX  = cx + gap / 2;
  const alphaHov = hoveredButtonId === 'btn_side_alpha';
  const betaHov  = hoveredButtonId === 'btn_side_beta';

  drawRoleCard(ctx, alphaX, cardY, cardW, cardH, 'ALPHA', 'Suit Alpha — Cyan', 'South entrance / Spawn A', '#76f4ff', alphaHov);
  drawRoleCard(ctx, betaX,  cardY, cardW, cardH, 'BETA',  'Suit Beta — Orange', 'North entrance / Spawn B', '#ff8c42', betaHov);

  registerButton('btn_side_alpha', alphaX, cardY, cardW, cardH);
  registerButton('btn_side_beta',  betaX,  cardY, cardW, cardH);

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.28))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back to menu', cx, height - Math.max(18, height * 0.038));
}

// ─── Lobby sub-renderers (not exported) ──────────────────────────────────────

function _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const btnW = Math.min(300, width * 0.44);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'Find Match',       btnX, cy * 0.78,            btnW, btnH, registerButton, 'btn_find_match',  hoveredButtonId === 'btn_find_match');
  drawButton(ctx, 'Play With Friend', btnX, cy * 0.78 + btnH + gap, btnW, btnH, registerButton, 'btn_play_friend', hoveredButtonId === 'btn_play_friend');
}

function _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton) {
  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  const textSize = Math.max(18, Math.floor(Math.min(width, height) * 0.046));

  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${textSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Searching for opponent' + dots, cx, cy * 0.8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(textSize * 0.58))}px system-ui, sans-serif`;
  ctx.fillText('Waiting in public queue', cx, cy * 0.8 + textSize * 1.1);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'Cancel', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const labelSize = Math.max(14, Math.floor(Math.min(width, height) * 0.036));

  ctx.fillStyle = '#a8c8d8';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('How would you like to connect?', cx, cy * 0.72);

  const btnW = Math.min(280, width * 0.42);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'Create Room', btnX, cy * 0.84,            btnW, btnH, registerButton, 'btn_create_room', hoveredButtonId === 'btn_create_room');
  drawButton(ctx, 'Enter Code',  btnX, cy * 0.84 + btnH + gap, btnW, btnH, registerButton, 'btn_enter_code',  hoveredButtonId === 'btn_enter_code');
}

function _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(36, Math.floor(Math.min(width, height) * 0.1));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.3));

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Share this code with your partner:', cx, cy * 0.58);

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.5)';
  ctx.shadowBlur = codeSize * 0.5;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText(hostCode || '···', cx, cy * 0.86);
  ctx.restore();

  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(12, Math.floor(labelSize * 0.9))}px system-ui, sans-serif`;
  ctx.fillText('Waiting for partner' + dots, cx, cy * 1.06);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'Cancel', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(28, Math.floor(Math.min(width, height) * 0.072));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.48));

  ctx.fillStyle = '#a8c8d8';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText("Enter your partner's room code:", cx, cy * 0.58);

  const boxW = Math.min(320, width * 0.52);
  const boxH = Math.max(52, codeSize * 1.5);
  const boxX = cx - boxW / 2;
  const boxY = cy * 0.7;

  ctx.fillStyle = 'rgba(10, 24, 40, 0.9)';
  ctx.strokeStyle = '#76f4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  const cursorOn = Math.floor(now / 500) % 2 === 0;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((codeInput || '') + (cursorOn ? '|' : ' '), cx, boxY + boxH / 2);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(labelSize * 0.72))}px system-ui, sans-serif`;
  ctx.fillText('Type code — Enter or click Join', cx, boxY + boxH + labelSize * 0.9);

  const btnW = Math.min(180, width * 0.27);
  const btnY  = cy * 1.28;

  drawButton(ctx, 'Join', cx - btnW - 10, btnY, btnW, btnH, registerButton, 'btn_join_submit', hoveredButtonId === 'btn_join_submit');
  drawButton(ctx, 'Back', cx + 10,        btnY, btnW, btnH, registerButton, 'btn_back',        hoveredButtonId === 'btn_back');
}

export function renderLobby(canvas, { lobbyPhase, side, hostCode, codeInput, searchTick }, hoveredButtonId, now, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(20, Math.floor(Math.min(width, height) * 0.052));
  const btnH = Math.max(44, Math.floor(Math.min(width, height) * 0.065));

  // Header
  const sideColor = side === 'alpha' ? '#76f4ff' : '#ff8c42';
  const sideLabel = side === 'alpha' ? 'ALPHA' : 'BETA';

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.3)';
  ctx.shadowBlur  = titleSize * 0.5;
  ctx.fillStyle   = '#76f4ff';
  ctx.font        = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ILLUMINAUTS — ONLINE', cx, cy * 0.34);
  ctx.restore();

  ctx.fillStyle  = sideColor;
  ctx.font       = `bold ${Math.max(11, Math.floor(titleSize * 0.42))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SUIT ${sideLabel} LOCKED`, cx, cy * 0.34 + titleSize * 0.88);

  if (lobbyPhase === 'main')           _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'searching') _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'friend_options') _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'create')    _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'join')      _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton);

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.26))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back', cx, height - Math.max(18, height * 0.038));
}

export function renderCountdown(canvas, seconds, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height, 'rgba(118, 244, 255, 0.05)');

  const cx = width / 2;
  const cy = height / 2;
  const numSize = Math.max(72, Math.floor(Math.min(width, height) * 0.22));
  const labelSize = Math.max(14, Math.floor(numSize * 0.22));

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Match starting in…', cx, cy * 0.68);

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.7)';
  ctx.shadowBlur = numSize * 0.5;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${numSize}px system-ui, sans-serif`;
  ctx.fillText(seconds > 0 ? String(seconds) : 'GO!', cx, cy * 1.0);
  ctx.restore();
}

export function renderDisconnected(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height, 'rgba(255, 80, 80, 0.05)');

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));

  ctx.fillStyle = '#ff8080';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Opponent disconnected', cx, cy * 0.8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(12, Math.floor(titleSize * 0.55))}px system-ui, sans-serif`;
  ctx.fillText('The match has ended.', cx, cy * 0.8 + titleSize * 1.1);

  const btnW = Math.min(220, width * 0.34);
  const btnH = Math.max(42, Math.floor(Math.min(width, height) * 0.062));
  drawButton(ctx, 'Return to Menu', cx - btnW / 2, cy * 1.2, btnW, btnH, registerButton, 'btn_back_to_menu', hoveredButtonId === 'btn_back_to_menu');
}

export function renderWinScreen(canvas, state, now, winnerIsLocal = true, winnerName = '') {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const isOnline = state?.online?.enabled;

  const glowColor = winnerIsLocal ? 'rgba(125, 242, 154, 0.2)' : 'rgba(255, 100, 100, 0.15)';
  const glow = ctx.createRadialGradient(cx, cy * 0.82, 0, cx, cy * 0.82, Math.min(width, height) * 0.52);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(26, Math.floor(Math.min(width, height) * 0.08));
  const titleColor = winnerIsLocal ? '#7df29a' : '#ff8080';
  const shadowColor = winnerIsLocal ? 'rgba(125, 242, 154, 0.65)' : 'rgba(255, 100, 100, 0.5)';

  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = Math.floor(titleSize * 0.9);
  ctx.fillStyle = titleColor;
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const headline = isOnline
    ? (winnerIsLocal ? 'BEACON CORE REACHED' : `${winnerName || 'OPPONENT'} WINS`)
    : 'BEACON CORE REACHED';
  ctx.fillText(headline, cx, cy * 0.8);
  ctx.restore();

  const subText = isOnline
    ? (winnerIsLocal ? 'You reached the core first!' : 'They found a faster route.')
    : 'Suit navigation successful.';
  ctx.fillStyle = '#7da8b0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.36))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subText, cx, cy * 0.8 + titleSize * 0.9);

  if (state) {
    const doorsDisabled = state.map.doors.filter((d) => d.open).length;
    ctx.fillStyle = COLORS.chip;
    ctx.font = `${Math.max(11, Math.floor(titleSize * 0.28))}px ui-monospace, Consolas, monospace`;
    ctx.fillText(
      `Laser Doors disabled: ${doorsDisabled}  |  Chips remaining: ${state.player.chips}`,
      cx, cy * 0.8 + titleSize * 1.8
    );
  }

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
  const elapsed = now - (state.gameStartAt || 0);

  const startX = player.px - VIEW_TILES_X / 2;
  const startY = player.py - VIEW_TILES_Y / 2;

  const lightX = offX + VIEW_TILES_X / 2 * size;
  const lightY = offY + VIEW_TILES_Y / 2 * size;
  const lightRadiusTiles = now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
  const radiusPx = lightRadiusTiles * size;

  ctx.save();
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.clip();

  drawWorld(ctx, state.map, state.hazards, elapsed, startX, startY, size, offX, offY);
  drawPlayer(ctx, player, now, lightX, lightY, size);

  // Remote player — only visible when within suit light radius.
  if (state.online?.enabled && state.remote?.active) {
    const distTiles = Math.hypot(state.remote.px - player.px, state.remote.py - player.py);
    if (distTiles <= lightRadiusTiles) {
      const rrx = offX + (state.remote.px - startX) * size;
      const rry = offY + (state.remote.py - startY) * size;
      drawPlayer(ctx, state.remote, now, rrx, rry, size);
    }
  }

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

  const { map, hazards } = state;
  const size = Math.floor(Math.min(width / map.width, height / map.height));
  const offX  = Math.floor((width  - size * map.width)  / 2);
  const offY  = Math.floor((height - size * map.height) / 2);
  const elapsed = now - (state.gameStartAt || 0);

  drawWorld(ctx, map, hazards, elapsed, 0, 0, size, offX, offY, map.width, map.height);

  const { player } = state;
  const pcx = offX + player.px * size;
  const pcy = offY + player.py * size;

  drawPlayer(ctx, player, now, pcx, pcy, size);

  const lightRadius = now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.48)';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.arc(pcx, pcy, lightRadius * size, 0, Math.PI * 2);
  ctx.stroke();

  // Show remote player spawn in debug too
  if (state.remote) {
    const rcx = offX + state.remote.px * size;
    const rcy = offY + state.remote.py * size;
    ctx.strokeStyle = 'rgba(255, 140, 66, 0.5)';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.arc(rcx, rcy, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }

  const fontSize = Math.max(11, Math.floor(width * 0.016));
  ctx.fillStyle = '#76f4ff';
  ctx.font = `${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`DEBUG — ${state.mapId ?? 'map'}  [${(state.mapIndex ?? 0) + 1}]`, 8, 8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(10, Math.floor(fontSize * 0.82))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('F3 toggle  |  [ ] cycle maps (resets player)', 8, 8 + fontSize + 3);
}
