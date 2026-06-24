export const COUNTER_MULTIPLIERS = Object.freeze({
  strong: 2.15,
  neutral: 1,
  weak: 0.48,
});

const UNIT_ICON_DRAWINGS = Object.freeze({
  striker: `
    <path class="icon-shadow" d="M13 51c10 7 28 7 38 0-4 10-34 10-38 0Z"/>
    <path d="M32 8 52 31 32 54 12 31Z"/>
    <path class="icon-weapon" d="m42 10 5 3-18 29-5-3 18-29Z"/>
    <path class="icon-detail" d="m25 28 7 7 8-10"/>`,
  guard: `
    <path class="icon-shadow" d="M13 51c10 7 28 7 38 0-4 10-34 10-38 0Z"/>
    <path d="M32 8 51 18l-3 25-16 12-16-12-3-25Z"/>
    <path class="icon-weapon" d="M30 2h4v47h-4zM25 9l7-9 7 9Z"/>
    <path class="icon-detail" d="M22 27h20"/>`,
  breaker: `
    <path class="icon-shadow" d="M11 51c11 7 31 7 42 0-4 10-38 10-42 0Z"/>
    <path d="M22 7h20l14 14v20L42 55H22L8 41V21Z"/>
    <path class="icon-weapon" d="M30 7h5v43h-5zM16 4h33v12H16Z"/>
    <circle class="icon-weapon" cx="32" cy="32" r="5"/>
    <path class="icon-detail" d="M22 43h20"/>`,
  marksman: `
    <path class="icon-shadow" d="M14 51c10 7 27 7 37 0-4 10-33 10-37 0Z"/>
    <path d="M32 7 55 51H9Z"/>
    <path class="icon-weapon" d="M30 1h5v43h-5zM22 15h21v5H22Z"/>
    <circle class="icon-detail" cx="32" cy="25" r="5"/>`,
  turret: `
    <path class="icon-shadow" d="M11 51c11 7 31 7 42 0-4 10-38 10-42 0Z"/>
    <path d="M13 44 19 26h26l6 18-8 10H21Z"/>
    <path class="icon-weapon" d="M29 6h7v28h-7zM23 5h19v7H23Z"/>
    <circle class="icon-detail" cx="32" cy="37" r="5"/>`,
  'shock-mine': `
    <path class="icon-shadow" d="M14 49c10 7 26 7 36 0-4 10-32 10-36 0Z"/>
    <circle cx="32" cy="33" r="17"/>
    <path class="icon-weapon" d="m32 6 4 12H28L32 6Zm21 23-12 4v-8l12 4ZM11 29l12-4v8l-12-4Zm30 25-4-12h8l-4 12ZM23 54l4-12h-8l4 12Z"/>
    <circle class="icon-detail" cx="32" cy="33" r="5"/>`,
});

export function unitIconSvg(typeId) {
  const drawing = UNIT_ICON_DRAWINGS[typeId] ?? UNIT_ICON_DRAWINGS.striker;
  return `<svg class="unit-portrait-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${drawing}</svg>`;
}

export const UNIT_TYPES = {
  striker: {
    id: 'striker',
    name: 'Striker',
    role: 'Fast interceptor',
    summary: 'Rapid response unit that catches slow armored targets before they reach the core.',
    tactics: 'Use on side routes or to intercept Breakers. Avoid prolonged fights with Guards.',
    cost: 90,
    maxHp: 78,
    speed: 63,
    range: 24,
    rangeLabel: 'Melee',
    damage: 14,
    attackCooldown: 0.72,
    windup: 0.18,
    armor: 0,
    strongAgainst: 'breaker',
    weakAgainst: 'guard',
    radius: 14,
    bounty: 31,
  },
  guard: {
    id: 'guard',
    name: 'Guard',
    role: 'Armored blocker',
    summary: 'High-health defensive unit built to anchor chokepoints and absorb pressure.',
    tactics: 'Place at route merges and final approaches. Breakers dismantle Guards quickly.',
    cost: 120,
    maxHp: 145,
    speed: 39,
    range: 25,
    rangeLabel: 'Melee',
    damage: 13,
    attackCooldown: 0.88,
    windup: 0.25,
    armor: 2,
    strongAgainst: 'striker',
    weakAgainst: 'breaker',
    radius: 17,
    bounty: 41,
  },
  breaker: {
    id: 'breaker',
    name: 'Breaker',
    role: 'Anti-armor bruiser',
    summary: 'Slow heavy hitter that destroys Guards and other durable frontline targets.',
    tactics: 'Commit where enemy Guards are expected. Strikers can surround and eliminate it.',
    cost: 145,
    maxHp: 105,
    speed: 45,
    range: 29,
    rangeLabel: 'Melee',
    damage: 25,
    attackCooldown: 1.12,
    windup: 0.34,
    armor: 1,
    strongAgainst: 'guard',
    weakAgainst: 'striker',
    radius: 16,
    bounty: 49,
  },
  marksman: {
    id: 'marksman',
    name: 'Marksman',
    role: 'Long-range support',
    summary: 'Fragile ranged unit that contributes damage from behind a protected frontline.',
    tactics: 'Keep behind Guards or on protected firing angles. Strikers are its direct threat.',
    cost: 170,
    maxHp: 58,
    speed: 35,
    range: 150,
    rangeLabel: 'Long',
    damage: 19,
    attackCooldown: 1.2,
    windup: 0.3,
    projectileSpeed: 520,
    armor: 0,
    strongAgainst: null,
    weakAgainst: 'striker',
    radius: 13,
    bounty: 58,
  },
  turret: {
    id: 'turret',
    name: 'Sentry Turret',
    role: 'Fixed lane defender',
    summary: 'A fixed cannon that automatically covers a lane with rapid long-range fire.',
    tactics: 'Place behind a frontline or near a route merge. It cannot move, retreat, or chase threats.',
    cost: 210,
    maxHp: 96,
    speed: 0,
    range: 190,
    rangeLabel: 'Long',
    damage: 15,
    attackCooldown: 0.55,
    windup: 0.16,
    projectileSpeed: 650,
    armor: 1,
    strongAgainst: null,
    weakAgainst: null,
    stationary: true,
    radius: 16,
    bounty: 60,
  },
  'shock-mine': {
    id: 'shock-mine',
    name: 'Shock Mine',
    role: 'Route ambush trap',
    summary: 'A one-use proximity mine that shocks every enemy caught in its blast.',
    tactics: 'Plant directly on a route scar before a merge. It arms shortly after deployment and is consumed on detonation.',
    cost: 70,
    maxHp: 1,
    speed: 0,
    range: 0,
    rangeLabel: 'Proximity',
    damage: 54,
    attackCooldown: 1,
    windup: 0,
    armor: 0,
    strongAgainst: null,
    weakAgainst: null,
    stationary: true,
    trap: true,
    placement: 'route',
    armTime: 0.7,
    triggerRadius: 50,
    blastRadius: 76,
    radius: 11,
    bounty: 0,
  },
};

export const PLAYER_ROSTER = ['striker', 'guard', 'breaker', 'marksman', 'turret', 'shock-mine'];

export function matchupMultiplier(attacker, defender) {
  if (attacker.strongAgainst === defender.id) return COUNTER_MULTIPLIERS.strong;
  if (attacker.weakAgainst === defender.id) return COUNTER_MULTIPLIERS.weak;
  return COUNTER_MULTIPLIERS.neutral;
}

export function unitDps(unit) {
  return unit.damage / unit.attackCooldown;
}

export function matchupText(unit) {
  const strong = unit.strongAgainst ? UNIT_TYPES[unit.strongAgainst].name : 'None';
  const weak = unit.weakAgainst ? UNIT_TYPES[unit.weakAgainst].name : 'None';
  return { strong, weak };
}
