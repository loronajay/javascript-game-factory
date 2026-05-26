const EMPTY_INPUT = {
  left: false,
  right: false,
  up: false,
  down: false,
  attack: false,
  dash: false,
  projectile: false,
  attackJustPressed: false,
};

function pickOnlineStage(seed, roundNum) {
  const stages = ['single', 'battlefield', 'battlefield', 'moving', 'none'];
  const idx = Math.abs(Math.floor(seed * 9301 + roundNum * 49297)) % stages.length;
  return stages[idx];
}

function inputsDiffer(a, b) {
  return a.left !== b.left || a.right !== b.right || a.up !== b.up ||
         a.down !== b.down || a.attack !== b.attack || a.dash !== b.dash ||
         a.projectile !== b.projectile || a.attackJustPressed !== b.attackJustPressed;
}

function drawOnlineCountdown({
  ctx,
  canvas,
  viewportWidth,
  viewportHeight,
  labels,
  secondsRemaining,
}) {
  const sf = Math.min(canvas.width / viewportWidth, canvas.height / viewportHeight);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.fillStyle = '#0a0608';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = `${Math.round(15 * sf)}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText(`${labels.p1}  vs  ${labels.p2}`, cx, cy - Math.round(68 * sf));
  ctx.fillStyle = '#e05a50';
  ctx.font = `bold ${Math.round(88 * sf)}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText(secondsRemaining > 0 ? String(secondsRemaining) : '!', cx, cy);
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.font = `${Math.round(13 * sf)}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText('Get Ready', cx, cy + Math.round(58 * sf));
  ctx.restore();
}

export { drawOnlineCountdown, EMPTY_INPUT, inputsDiffer, pickOnlineStage };
