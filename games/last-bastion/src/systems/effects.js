import { clamp } from '../core/math.js';

export function addHitEffect(game, {
  x,
  y,
  damage,
  side = 'player',
  strong = false,
  weak = false,
  matchup = 'neutral',
}) {
  game.effects.push({
    type: 'hit',
    x,
    y,
    life: 0.22,
    maxLife: 0.22,
    strong,
    weak,
    matchup,
    damage,
    side,
    label: matchup === 'strong'
      ? `STRONG - ${damage}`
      : matchup === 'weak'
        ? `WEAK - ${damage}`
        : `${damage}`,
  });
}

export function addMeleeSwingEffect(game, { attacker, defender }) {
  const dx = defender.x - attacker.x;
  const dy = defender.y - attacker.y;
  const styles = { striker: 'sweep', guard: 'thrust', breaker: 'smash' };
  game.effects.push({
    type: 'slash',
    x: attacker.x,
    y: attacker.y,
    angle: Math.atan2(dy, dx),
    style: styles[attacker.type] ?? 'sweep',
    side: attacker.side,
    life: 0.18,
    maxLife: 0.18,
  });
}

export function addExplosionEffect(game, { x, y, side = 'player', radius = 76 }) {
  game.effects.push({
    type: 'explosion',
    x,
    y,
    side,
    radius,
    life: 0.42,
    maxLife: 0.42,
  });
}

export function launchProjectile(game, {
  source,
  target,
  damage,
  strong = false,
  weak = false,
  matchup = 'neutral',
  speed = 520,
  side = 'player',
}) {
  game.effects.push({
    type: 'projectile',
    x: source.x,
    y: source.y,
    previousX: source.x,
    previousY: source.y,
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
    damage,
    strong,
    weak,
    matchup,
    speed,
    side,
    life: 3,
    maxLife: 3,
  });
}

export function updateCombatEffects(game, dt) {
  const unitsById = new Map(game.units.map((unit) => [unit.id, unit]));
  for (const effect of game.effects) {
    if (effect.type === 'projectile') updateProjectile(game, effect, unitsById, dt);
    else effect.life -= dt;
  }
  game.effects = game.effects.filter((effect) => effect.life > 0);
}

function updateProjectile(game, projectile, unitsById, dt) {
  const target = unitsById.get(projectile.targetId);
  if (target && !target.dead) {
    projectile.targetX = target.x;
    projectile.targetY = target.y;
  }

  projectile.previousX = projectile.x;
  projectile.previousY = projectile.y;
  const dx = projectile.targetX - projectile.x;
  const dy = projectile.targetY - projectile.y;
  const distance = Math.hypot(dx, dy);
  const step = projectile.speed * dt;

  if (distance > step && distance > 0.001) {
    projectile.x += dx / distance * step;
    projectile.y += dy / distance * step;
    projectile.life -= dt;
    return;
  }

  projectile.x = projectile.targetX;
  projectile.y = projectile.targetY;
  if (target && !target.dead) {
    target.hp = clamp(target.hp - projectile.damage, 0, target.maxHp);
    target.flash = 0.13;
  }
  game.playSound?.('arrow-hit');
  projectile.type = 'hit';
  projectile.life = 0.22;
  projectile.maxLife = 0.22;
  projectile.label = projectile.matchup === 'strong'
    ? `STRONG - ${projectile.damage}`
    : projectile.matchup === 'weak'
      ? `WEAK - ${projectile.damage}`
      : `${projectile.damage}`;
}
