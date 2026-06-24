// Tactical tokens stay legible when the whole battlefield is visible. This is
// deliberately icon-first: at this scale, a clear role silhouette beats a tiny
// character illustration.
const TEAM_PALETTES = Object.freeze({
  player: Object.freeze({
    body: '#4fc9d0',
    light: '#d4ffff',
    dark: '#0d3439',
    rim: '#a8fff7',
    weapon: '#e7fff7',
    accent: '#d9ffa1',
  }),
  enemy: Object.freeze({
    body: '#dc685d',
    light: '#ffe0d8',
    dark: '#5c211e',
    rim: '#ffada1',
    weapon: '#fff0d2',
    accent: '#ffd06d',
  }),
});

const UNIT_RENDER_PROFILES = Object.freeze({
  striker: Object.freeze({ marker: 'diamond', weapon: 'blade', accent: 'chevron' }),
  guard: Object.freeze({ marker: 'shield', weapon: 'spear', accent: 'bar' }),
  breaker: Object.freeze({ marker: 'octagon', weapon: 'hammer', accent: 'core' }),
  marksman: Object.freeze({ marker: 'triangle', weapon: 'rifle', accent: 'scope' }),
  turret: Object.freeze({ marker: 'turret', weapon: 'cannon', accent: 'reticle' }),
  'shock-mine': Object.freeze({ marker: 'mine', weapon: 'spikes', accent: 'charge' }),
});

export function getUnitRenderProfile(type) {
  return UNIT_RENDER_PROFILES[type] ?? UNIT_RENDER_PROFILES.striker;
}

export function getTeamPalette(side) {
  return TEAM_PALETTES[side] ?? TEAM_PALETTES.player;
}

export function getUnitVisualRadius(authoredRadius, worldScale, minimumScreenRadius = 13) {
  return Math.max(authoredRadius, minimumScreenRadius / Math.max(worldScale, 0.01));
}

export function drawUnitToken(ctx, {
  type,
  side,
  radius,
  flashing = false,
  selected = false,
}) {
  const profile = getUnitRenderProfile(type);
  const palette = getTeamPalette(side);
  const body = flashing ? '#ffffff' : palette.body;
  const light = flashing ? '#ffffff' : palette.light;

  ctx.save();
  ctx.scale(radius / 18, radius / 18);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.dark;

  if (selected) {
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 2;
  }

  drawMarker(ctx, profile.marker, body, light, palette);
  drawWeapon(ctx, profile.weapon, palette.weapon, palette.dark);
  drawAccent(ctx, profile.accent, palette.accent, palette.dark);
  ctx.restore();
}

function drawMarker(ctx, marker, body, light, palette) {
  ctx.fillStyle = body;
  if (marker === 'turret') {
    ctx.beginPath();
    ctx.moveTo(-14, 11);
    ctx.lineTo(-10, -8);
    ctx.lineTo(10, -8);
    ctx.lineTo(14, 11);
    ctx.closePath();
  } else if (marker === 'mine') {
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
  } else if (marker === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(12, -7);
    ctx.lineTo(10, 9);
    ctx.lineTo(0, 15);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-12, -7);
    ctx.closePath();
  } else if (marker === 'octagon') {
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const angle = -Math.PI / 8 + index * Math.PI / 4;
      const x = Math.cos(angle) * 13;
      const y = Math.sin(angle) * 13;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (marker === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 11);
    ctx.lineTo(-12, 11);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(14, 0);
    ctx.lineTo(0, 15);
    ctx.lineTo(-14, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = light;
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.arc(-4, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.dark;
}

function drawWeapon(ctx, weapon, color, outline) {
  ctx.fillStyle = color;
  ctx.strokeStyle = outline;
  if (weapon === 'cannon') {
    ctx.fillRect(-3.5, -27, 7, 25);
    ctx.fillRect(-9, -27, 18, 6);
    ctx.strokeRect(-3.5, -27, 7, 25);
  } else if (weapon === 'spikes') {
    for (let index = 0; index < 6; index += 1) {
      ctx.save();
      ctx.rotate(index * Math.PI / 3);
      ctx.fillRect(-1.5, -21, 3, 10);
      ctx.restore();
    }
  } else if (weapon === 'spear') {
    ctx.fillRect(-1.8, -23, 3.6, 29);
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(4.5, -20);
    ctx.lineTo(-4.5, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'hammer') {
    ctx.fillRect(-1.8, -19, 3.6, 27);
    ctx.fillRect(-10, -23, 20, 7);
    ctx.strokeRect(-10, -23, 20, 7);
  } else if (weapon === 'rifle') {
    ctx.fillRect(-2, -27, 4, 32);
    ctx.fillRect(-7, -19, 14, 4);
    ctx.strokeRect(-2, -27, 4, 32);
  } else {
    ctx.save();
    ctx.rotate(0.45);
    ctx.fillRect(8, -20, 3.8, 28);
    ctx.beginPath();
    ctx.moveTo(10, -25);
    ctx.lineTo(15, -18);
    ctx.lineTo(5, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawAccent(ctx, accent, color, outline) {
  ctx.fillStyle = color;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  if (accent === 'reticle') {
    ctx.beginPath();
    ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (accent === 'charge') {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (accent === 'bar') {
    ctx.fillRect(-7, -2, 14, 4);
  } else if (accent === 'core') {
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (accent === 'scope') {
    ctx.beginPath();
    ctx.arc(0, -5, 3.4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-5, -3);
    ctx.lineTo(0, 3);
    ctx.lineTo(5, -3);
    ctx.stroke();
  }
}
