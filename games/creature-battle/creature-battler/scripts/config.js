const SLOT_NAMES = ['top', 'middle', 'bottom'];

const LEVEL_TIERS = [
  { level: 5,   label: 'Beginner'   },
  { level: 10,  label: 'Novice'     },
  { level: 20,  label: 'Apprentice' },
  { level: 30,  label: 'Standard'   },
  { level: 50,  label: 'Veteran'    },
  { level: 75,  label: 'Expert'     },
  { level: 100, label: 'Maximum'    },
];

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
  { id: 'basic_attack',  name: 'Attack',        targeting: 'single',      desc: 'A straightforward physical strike.',                                  owner: 'shared',     learnedAt: 1,  category: 'basic',   damageClass: 'physical', element: 'neutral', basePower: 12, offensiveScaling: 0.75, mpCost: 0,  accuracy: 100, canCrit: true,  movePowerModifier: 0 },
  { id: 'sprout_tap',    name: 'Sprout Tap',    targeting: 'single',      desc: 'Tap a foe with a budding gaia strike.',                              owner: 'flor',       learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'petal_mend',    name: 'Petal Mend',    targeting: 'all_allies',  desc: 'Rain healing petals on the whole team, restoring HP to all allies.', owner: 'flor',       learnedAt: 1,  category: 'heal',    damageClass: 'heal',     element: 'gaia',    basePower: 14, offensiveScaling: 0.35, mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'root_snare',    name: 'Root Snare',    targeting: 'single',      desc: 'Bind a foe in erupting roots, dealing gaia magic damage.',           owner: 'flor',       learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 12, offensiveScaling: 0.85, mpCost: 6,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'verdant_guard', name: 'Verdant Guard', targeting: 'self',        desc: 'Wrap self in living bark, boosting defense this turn.',              owner: 'flor',       learnedAt: 20, category: 'art',     damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'bubble_shot',   name: 'Bubble Shot',   targeting: 'single',      desc: 'Fire a pressurized water bubble at an enemy.',                       owner: 'aquaphant',  learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'soak_hide',     name: 'Soak Hide',     targeting: 'self',        desc: 'Saturate hide with water to harden defenses this turn.',             owner: 'aquaphant',  learnedAt: 1,  category: 'art',     damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'tidal_bump',    name: 'Tidal Bump',    targeting: 'single',      desc: 'Crash a rolling wave of water into a target.',                       owner: 'aquaphant',  learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 24, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'surge_crash',   name: 'Surge Crash',   targeting: 'all_enemies', desc: 'Unleash a surging torrent that crashes into all enemies at once.',   owner: 'aquaphant',  learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 20, offensiveScaling: 0.85, mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ice_pebble',    name: 'Ice Pebble',    targeting: 'single',      desc: 'Hurl a sharp shard of ice at a target.',                             owner: 'pengun',     learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cold_feet',     name: 'Cold Feet',     targeting: 'single',      desc: 'Flash-freeze the ground beneath one foe to slow and disrupt them.',  owner: 'pengun',     learnedAt: 1,  category: 'art',     damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 92,  canCrit: false, movePowerModifier: 0 },
  { id: 'snow_blind',    name: 'Snow Blind',    targeting: 'single',      desc: "Blast snow into one foe's eyes, impairing their aim.",               owner: 'pengun',     learnedAt: 10, category: 'art',     damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 7,  accuracy: 88,  canCrit: false, movePowerModifier: 0 },
  { id: 'frost_nip',     name: 'Frost Nip',     targeting: 'single',      desc: 'Nip at a foe with biting cold for ice magic damage.',                owner: 'pengun',     learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 23, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shatter_chill', name: 'Shatter Chill', targeting: 'all_enemies', desc: 'Detonate a frozen blast that shatters across all enemies.',          owner: 'pengun',     learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 18, offensiveScaling: 0.85, mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spark_flick',   name: 'Spark Flick',   targeting: 'single',      desc: 'Snap hot sparks at a foe with a fiery flick.',                       owner: 'salamander', learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'heat_haze',     name: 'Heat Haze',     targeting: 'single',      desc: 'Distort the air around one target with shimmering heat.',            owner: 'salamander', learnedAt: 1,  category: 'art',     damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'flare_bite',    name: 'Flare Bite',    targeting: 'single',      desc: 'Chomp down with a jaw wreathed in fire for solid fire damage.',      owner: 'salamander', learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 26, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cinder_burst',  name: 'Cinder Burst',  targeting: 'all_enemies', desc: 'Detonate an ember that bursts with fire damage across all enemies.', owner: 'salamander', learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 22, offensiveScaling: 0.9,  mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
];

function getMoveData(moveId) {
  return MOVES_DATA.find(m => m.id === moveId) || null;
}

function getCreatureMoves(creatureId, level) {
  const lvl = level !== undefined ? level : state.battleConfig.level;
  return MOVES_DATA.filter(m =>
    (m.owner === creatureId || m.owner === 'shared') && m.learnedAt <= lvl
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
  const level = state.battleConfig.level;
  const stats = resolveStats(creature, level);
  return {
    runtimeId: `${creature.id}-${Math.random().toString(36).slice(2, 7)}`,
    creatureId: creature.id,
    displayName: creature.name,
    element: creature.element,
    role: creature.role,
    level,
    slot,
    hp: { current: stats.hp, max: stats.hp },
    mp: { current: stats.mp, max: stats.mp },
    stats,
    resistances: creature.resistances,
    moves: getCreatureMoves(creature.id, level),
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
