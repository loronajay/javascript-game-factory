const RENTAL_LEVEL = 30;
const SLOT_NAMES = ['top', 'middle', 'bottom'];

const RENTAL_ROSTER = [
  {
    id: 'salamander',
    name: 'Salamander',
    element: 'fire',
    role: 'Magic Art pressure',
    baseStats: { hp: 36, mp: 27, strength: 7, defense: 7, intelligence: 16, spirit: 11, speed: 14 },
    growth:    { hp: 3.4, mp: 2.85, strength: 0.7, defense: 0.75, intelligence: 1.75, spirit: 1.05, speed: 1.45 },
    resistances: { neutral: 1, fire: 0.5, water: 1.5, gaia: 0.75, ice: 0.75, earth: 1.25, wind: 1, light: 1, dark: 1 },
    sprite: '../game-docs/creatures/salamander/salamander.png',
  },
  {
    id: 'aquaphant',
    name: 'Aquaphant',
    element: 'water',
    role: 'Sustain bruiser',
    baseStats: { hp: 48, mp: 24, strength: 10, defense: 14, intelligence: 11, spirit: 12, speed: 6 },
    growth:    { hp: 5.0, mp: 2.55, strength: 1.0, defense: 1.45, intelligence: 1.15, spirit: 1.15, speed: 0.6 },
    resistances: { neutral: 1, fire: 0.75, water: 0.5, gaia: 1.25, ice: 0.75, earth: 1, wind: 1, light: 1, dark: 1 },
    sprite: '../game-docs/creatures/aquaphant/aquaphant.png',
  },
  {
    id: 'pengun',
    name: 'Pengun',
    element: 'ice',
    role: 'Control / debuff',
    baseStats: { hp: 34, mp: 26, strength: 6, defense: 8, intelligence: 13, spirit: 11, speed: 16 },
    growth:    { hp: 3.35, mp: 2.7, strength: 0.65, defense: 0.85, intelligence: 1.45, spirit: 1.1, speed: 1.7 },
    resistances: { neutral: 1, fire: 1.5, water: 0.75, gaia: 1, ice: 0.5, earth: 1, wind: 1, light: 1, dark: 1 },
    sprite: '../game-docs/creatures/pengun/pengun.png',
  },
  {
    id: 'flor',
    name: 'Flor',
    element: 'gaia',
    role: 'Sustain / control',
    baseStats: { hp: 38, mp: 28, strength: 7, defense: 10, intelligence: 11, spirit: 15, speed: 9 },
    growth:    { hp: 3.9, mp: 3.1, strength: 0.7, defense: 1.15, intelligence: 1.15, spirit: 1.65, speed: 0.95 },
    resistances: { neutral: 1, fire: 1.25, water: 0.75, gaia: 0.5, ice: 1, earth: 0.75, wind: 1, light: 1, dark: 1.25 },
    sprite: '../game-docs/creatures/flor/flor.png',
  },
];

const MOVES_DATA = [
  { id: 'basic_attack',  name: 'Attack',        owner: 'shared',     learnedAt: 1,  category: 'basic',   damageClass: 'physical', element: 'neutral', basePower: 12, offensiveScaling: 0.75, mpCost: 0,  accuracy: 100, canCrit: true,  movePowerModifier: 0 },
  { id: 'sprout_tap',    name: 'Sprout Tap',    owner: 'flor',       learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'petal_mend',    name: 'Petal Mend',    owner: 'flor',       learnedAt: 1,  category: 'heal',    damageClass: 'heal',     element: 'gaia',    basePower: 24, offensiveScaling: 0.55, mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'root_snare',    name: 'Root Snare',    owner: 'flor',       learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 12, offensiveScaling: 0.85, mpCost: 6,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'verdant_guard', name: 'Verdant Guard', owner: 'flor',       learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'bubble_shot',   name: 'Bubble Shot',   owner: 'aquaphant',  learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'soak_hide',     name: 'Soak Hide',     owner: 'aquaphant',  learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'tidal_bump',    name: 'Tidal Bump',    owner: 'aquaphant',  learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 24, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'surge_crash',   name: 'Surge Crash',   owner: 'aquaphant',  learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 36, offensiveScaling: 1.05, mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ice_pebble',    name: 'Ice Pebble',    owner: 'pengun',     learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cold_feet',     name: 'Cold Feet',     owner: 'pengun',     learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 92,  canCrit: false, movePowerModifier: 0 },
  { id: 'snow_blind',    name: 'Snow Blind',    owner: 'pengun',     learnedAt: 10, category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 7,  accuracy: 88,  canCrit: false, movePowerModifier: 0 },
  { id: 'frost_nip',     name: 'Frost Nip',     owner: 'pengun',     learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 23, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shatter_chill', name: 'Shatter Chill', owner: 'pengun',     learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 34, offensiveScaling: 1.05, mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spark_flick',   name: 'Spark Flick',   owner: 'salamander', learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'heat_haze',     name: 'Heat Haze',     owner: 'salamander', learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'flare_bite',    name: 'Flare Bite',    owner: 'salamander', learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 26, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cinder_burst',  name: 'Cinder Burst',  owner: 'salamander', learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 38, offensiveScaling: 1.1,  mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
];

function getMoveData(moveId) {
  return MOVES_DATA.find(m => m.id === moveId) || null;
}

function getCreatureMoves(creatureId) {
  return MOVES_DATA.filter(m =>
    (m.owner === creatureId || m.owner === 'shared') && m.learnedAt <= RENTAL_LEVEL
  );
}

function resolveStats(creature, level) {
  const out = {};
  for (const k of Object.keys(creature.baseStats)) {
    out[k] = Math.max(1, Math.floor(creature.baseStats[k] + creature.growth[k] * (level - 1)));
  }
  return out;
}

function buildRentalCreature(creature, slot) {
  const stats = resolveStats(creature, RENTAL_LEVEL);
  return {
    runtimeId: `${creature.id}-${Math.random().toString(36).slice(2, 7)}`,
    creatureId: creature.id,
    displayName: creature.name,
    element: creature.element,
    role: creature.role,
    level: RENTAL_LEVEL,
    slot,
    hp: { current: stats.hp, max: stats.hp },
    mp: { current: stats.mp, max: stats.mp },
    stats,
    resistances: creature.resistances,
    moves: getCreatureMoves(creature.id),
    sprite: creature.sprite,
    isKnockedOut: false,
    isDefending: false,
  };
}

const MODES = [
  { id: 'training',  label: 'Training Battle', desc: 'Solo vs AI — pick both teams',  icon: '⚔️',  available: true  },
  { id: 'direct',   label: 'Direct Rental',   desc: 'Fast casual — pick full teams', icon: '🎮', available: false },
  { id: 'draft',    label: 'Rental Draft',    desc: 'Competitive draft format',       icon: '🏆', available: false },
  { id: 'imported', label: 'Imported Battle', desc: 'Bring your RPG creatures',       icon: '📦', available: false },
  { id: 'custom',   label: 'Custom Battle',   desc: 'Flexible ruleset',               icon: '⚙️',  available: false },
];
