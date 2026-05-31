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

const ONLINE_STAGE_ROUNDS = 5;
const ONLINE_STAGE_KEYS = new Set(['single', 'battlefield', 'moving', 'none']);

function normalizeOnlineSeed(seed) {
  const n = Number(seed);
  return Number.isFinite(n) ? n : 0;
}

function pickOnlineStage(seed, roundNum) {
  const stages = ['single', 'battlefield', 'battlefield', 'moving', 'none'];
  const normalizedSeed = normalizeOnlineSeed(seed);
  const normalizedRound = Math.max(1, Math.floor(Number(roundNum) || 1));
  const idx = Math.abs(Math.floor(normalizedSeed * 9301 + normalizedRound * 49297)) % stages.length;
  return stages[idx];
}

function buildOnlineStagePlan(seed, rounds = ONLINE_STAGE_ROUNDS) {
  const normalizedSeed = normalizeOnlineSeed(seed);
  const count = Math.max(1, Math.floor(Number(rounds) || ONLINE_STAGE_ROUNDS));
  return {
    seed: normalizedSeed,
    stages: Array.from({ length: count }, (_, index) => pickOnlineStage(normalizedSeed, index + 1)),
  };
}

function normalizeOnlineStagePlan(settings, fallbackSeed = 0) {
  const stages = Array.isArray(settings?.stagePlan)
    ? settings.stagePlan
    : Array.isArray(settings?.stages)
      ? settings.stages
      : [];
  const plan = stages.filter(stage => ONLINE_STAGE_KEYS.has(stage));
  if (plan.length === 0) return null;
  const seed = Number.isFinite(Number(settings?.seed)) ? Number(settings.seed) : normalizeOnlineSeed(fallbackSeed);
  return { seed, stages: plan };
}

function getOnlineStageForRound(stagePlan, seed, roundNum) {
  const index = Math.max(1, Math.floor(Number(roundNum) || 1)) - 1;
  const plannedStage = Array.isArray(stagePlan?.stages) ? stagePlan.stages[index] : null;
  return typeof plannedStage === 'string' && plannedStage
    ? plannedStage
    : pickOnlineStage(seed, roundNum);
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

export {
  buildOnlineStagePlan,
  drawOnlineCountdown,
  EMPTY_INPUT,
  getOnlineStageForRound,
  inputsDiffer,
  normalizeOnlineStagePlan,
  normalizeOnlineSeed,
  pickOnlineStage,
};
