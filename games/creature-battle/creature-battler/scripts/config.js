const SLOT_NAMES = ['top', 'middle', 'bottom'];

const ROSTER_COLS = 3;

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
    baseStats: { hp: 72, mp: 27, strength: 7, defense: 7, intelligence: 16, spirit: 11, speed: 14 },
    growth:    { hp: 6.8, mp: 2.85, strength: 0.7, defense: 0.75, intelligence: 1.75, spirit: 1.05, speed: 1.45 },
    resistances: {},
    sprite: 'shared/creatures/salamander/salamander.png',
  },
  {
    id: 'aquaphant',
    name: 'Aquaphant',
    element: 'water',
    role: 'Sustain bruiser',
    baseStats: { hp: 96, mp: 24, strength: 10, defense: 14, intelligence: 11, spirit: 12, speed: 6 },
    growth:    { hp: 10.0, mp: 2.55, strength: 1.0, defense: 1.45, intelligence: 1.15, spirit: 1.15, speed: 0.6 },
    resistances: {},
    sprite: 'shared/creatures/aquaphant/aquaphant.png',
  },
  {
    id: 'pengun',
    name: 'Pengun',
    element: 'ice',
    role: 'Control / debuff',
    baseStats: { hp: 68, mp: 26, strength: 6, defense: 8, intelligence: 13, spirit: 11, speed: 16 },
    growth:    { hp: 6.7, mp: 2.7, strength: 0.65, defense: 0.85, intelligence: 1.45, spirit: 1.1, speed: 1.7 },
    resistances: {},
    sprite: 'shared/creatures/pengun/pengun.png',
  },
  {
    id: 'flor',
    name: 'Flor',
    element: 'gaia',
    role: 'Sustain / control',
    baseStats: { hp: 76, mp: 28, strength: 7, defense: 10, intelligence: 11, spirit: 15, speed: 9 },
    growth:    { hp: 7.8, mp: 3.1, strength: 0.7, defense: 1.15, intelligence: 1.15, spirit: 1.65, speed: 0.95 },
    resistances: {},
    sprite: 'shared/creatures/flor/flor.png',
  },
  {
    id: 'clod',
    name: 'Clod',
    element: 'earth',
    role: 'Physical tank / cleanup',
    baseStats: { hp: 100, mp: 18, strength: 17, defense: 20, intelligence: 5, spirit: 9, speed: 5 },
    growth:    { hp: 10.5, mp: 1.8, strength: 1.65, defense: 2.0, intelligence: 0.5, spirit: 0.85, speed: 0.55 },
    resistances: {},
    sprite: 'shared/creatures/clod/clod.png',
  },
  {
    id: 'galeon',
    name: 'Galeon',
    element: 'wind',
    role: 'Speed / tempo combo setup',
    baseStats: { hp: 60, mp: 22, strength: 7, defense: 9, intelligence: 17, spirit: 13, speed: 22 },
    growth:    { hp: 10.0, mp: 2.2, strength: 0.7, defense: 0.9, intelligence: 1.7, spirit: 1.3, speed: 2.2 },
    resistances: {},
    sprite: 'shared/creatures/galeon/galeon.png',
  },
  {
    id: 'voltwing',
    name: 'Voltwing',
    element: 'wind',
    role: 'Evasive pressure / multi-target setup',
    baseStats: { hp: 52, mp: 24, strength: 6, defense: 7, intelligence: 16, spirit: 11, speed: 20 },
    growth:    { hp: 9.0, mp: 2.4, strength: 0.6, defense: 0.7, intelligence: 1.6, spirit: 1.1, speed: 2.0 },
    resistances: {},
    sprite: 'shared/creatures/voltwing/voltwing.png',
  },
  {
    id: 'lumora',
    name: 'Lumora',
    element: 'light',
    role: 'Support / cleansing / accuracy stability',
    baseStats: { hp: 76, mp: 30, strength: 6, defense: 11, intelligence: 13, spirit: 20, speed: 10 },
    growth:    { hp: 11.5, mp: 3.0, strength: 0.6, defense: 1.1, intelligence: 1.3, spirit: 2.0, speed: 1.0 },
    resistances: {},
    sprite: 'shared/creatures/lumora/lumora.png',
  },
  {
    id: 'nocthorn',
    name: 'Nocthorn',
    element: 'dark',
    role: 'Risk/reward offense / disruption',
    baseStats: { hp: 62, mp: 22, strength: 8, defense: 8, intelligence: 20, spirit: 10, speed: 16 },
    growth:    { hp: 10.0, mp: 2.2, strength: 0.8, defense: 0.8, intelligence: 2.0, spirit: 1.0, speed: 1.6 },
    resistances: {},
    sprite: 'shared/creatures/nocthorn/nocthorn.png',
  },
  {
    id: 'emberjaw',
    name: 'Emberjaw',
    element: 'fire',
    role: 'Physical elemental attacker',
    baseStats: { hp: 80, mp: 18, strength: 20, defense: 10, intelligence: 7, spirit: 8, speed: 17 },
    growth:    { hp: 11.0, mp: 1.8, strength: 2.0, defense: 1.0, intelligence: 0.7, spirit: 0.8, speed: 1.7 },
    resistances: {},
    sprite: 'shared/creatures/emberjaw/emberjaw.png',
  },
  {
    id: 'tidecalf',
    name: 'Tidecalf',
    element: 'water',
    role: 'Defensive support / MP-efficient Arts',
    baseStats: { hp: 100, mp: 20, strength: 8, defense: 22, intelligence: 12, spirit: 16, speed: 8 },
    growth:    { hp: 12.0, mp: 2.0, strength: 0.8, defense: 2.2, intelligence: 1.2, spirit: 1.6, speed: 0.8 },
    resistances: {},
    sprite: 'shared/creatures/tidecalf/tidecalf.png',
  },
  {
    id: 'gravemoss',
    name: 'Gravemoss',
    element: 'earth',
    role: 'Anti-physical wall / attrition',
    baseStats: { hp: 120, mp: 16, strength: 14, defense: 24, intelligence: 6, spirit: 16, speed: 4 },
    growth:    { hp: 13.0, mp: 1.6, strength: 1.4, defense: 2.4, intelligence: 0.6, spirit: 1.6, speed: 0.4 },
    resistances: {},
    sprite: 'shared/creatures/gravemoss/gravemoss.png',
  },
];

const MOVES_DATA = [
  // ── Shared ───────────────────────────────────────────────────────────────────
  { id: 'basic_attack',     name: 'Attack',          targeting: 'single',      desc: 'A straightforward physical strike.',                                              owner: 'shared',     learnedAt: 1,  category: 'basic',   damageClass: 'physical', element: 'neutral', basePower: 12, offensiveScaling: 0.75, mpCost: 0,  accuracy: 100, canCrit: true,  movePowerModifier: 0 },

  // ── Flor ─────────────────────────────────────────────────────────────────────
  { id: 'sprout_tap',       name: 'Sprout Tap',      targeting: 'single',      desc: 'Tap a foe with a budding gaia strike.',                                          owner: 'flor',       learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'petal_mend',       name: 'Petal Mend',      targeting: 'all_allies',  desc: 'Rain healing petals on the whole team, restoring HP to all allies.',             owner: 'flor',       learnedAt: 1,  category: 'heal',    damageClass: 'heal',     element: 'gaia',    basePower: 14, offensiveScaling: 0.35, mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'thorn_bind',       name: 'Thorn Bind',      targeting: 'single',      desc: 'Snare a foe in sharp vines, dealing gaia damage and lowering Defense.',          owner: 'flor',       learnedAt: 8,  category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 10, offensiveScaling: 0.75, mpCost: 9,  accuracy: 90,  canCrit: false, movePowerModifier: 0 },
  { id: 'root_snare',       name: 'Root Snare',      targeting: 'single',      desc: 'Bind a foe in erupting roots, dealing gaia magic damage and lowering Speed.',   owner: 'flor',       learnedAt: 12, category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 12, offensiveScaling: 0.85, mpCost: 6,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'verdant_guard',    name: 'Verdant Guard',   targeting: 'single_ally', desc: 'Wrap an ally in living bark to raise Spirit temporarily.',                       owner: 'flor',       learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'toxic_spores',     name: 'Toxic Spores',    targeting: 'single',      desc: 'Release a cloud of toxic spores that poison the target indefinitely.',            owner: 'flor',       learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 11, accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'poison',  permanent: true } },
  { id: 'bloom_surge',      name: 'Bloom Surge',     targeting: 'self',        desc: 'Channel vibrant growth energy to raise both Intelligence and Spirit.',           owner: 'flor',       learnedAt: 25, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 9,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'cleanse',          name: 'Cleanse',         targeting: 'single_ally', desc: 'Wash away all status effects afflicting one ally.',                                 owner: 'flor',       learnedAt: 27, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'sprout_tap_2',     name: 'Sprout Tap 2',    targeting: 'single',      desc: 'A stronger gaia strike with greater magical force.',                             owner: 'flor',       learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 26, offensiveScaling: 0.95, mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'pollen_veil',      name: 'Pollen Veil',     targeting: 'single',      desc: 'Blanket a foe in silencing pollen, preventing them from using arts.',             owner: 'flor',       learnedAt: 32, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 86,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'silence', duration: 2 } },
  { id: 'natures_ward',     name: "Nature's Ward",   targeting: 'all_allies',  desc: 'Call on the forest to raise Spirit for all allies.',                             owner: 'flor',       learnedAt: 38, category: 'utility', damageClass: 'utility',  element: 'gaia',    basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'petal_mend_2',     name: 'Petal Mend 2',    targeting: 'all_allies',  desc: 'A richer bloom of healing petals that restores more HP to all allies.',         owner: 'flor',       learnedAt: 42, category: 'heal',    damageClass: 'heal',     element: 'gaia',    basePower: 26, offensiveScaling: 0.35, mpCost: 14, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'sprout_tap_3',     name: 'Sprout Tap 3',    targeting: 'single',      desc: 'A fully matured gaia strike channeling deep forest power.',                     owner: 'flor',       learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'gaia',    basePower: 42, offensiveScaling: 0.95, mpCost: 12, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'petal_mend_3',     name: 'Petal Mend 3',    targeting: 'all_allies',  desc: 'A torrent of restorative petals with deep healing power for all allies.',       owner: 'flor',       learnedAt: 58, category: 'heal',    damageClass: 'heal',     element: 'gaia',    basePower: 40, offensiveScaling: 0.35, mpCost: 22, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'world_tree',       name: 'World Tree',      targeting: 'all_enemies', desc: 'Channel the World Tree to strike all foes with gaia energy while healing the whole party.', owner: 'flor', learnedAt: 65, category: 'art', damageClass: 'magic', element: 'gaia', basePower: 38, offensiveScaling: 0.8, mpCost: 30, accuracy: 88, canCrit: true, movePowerModifier: 0, healAllAllies: true, allyHealBasePower: 22, allyHealScaling: 0.35 },

  // ── Aquaphant ────────────────────────────────────────────────────────────────
  { id: 'bubble_shot',      name: 'Bubble Shot',     targeting: 'single',      desc: 'Fire a pressurized water bubble at an enemy.',                                   owner: 'aquaphant',  learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'soak_hide',        name: 'Soak Hide',       targeting: 'self',        desc: 'Saturate hide with water to raise Defense temporarily.',                         owner: 'aquaphant',  learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'healing_wave',     name: 'Healing Wave',    targeting: 'self',        desc: 'Wash over self in a soothing wave, restoring HP.',                              owner: 'aquaphant',  learnedAt: 8,  category: 'heal',    damageClass: 'heal',     element: 'water',   basePower: 16, offensiveScaling: 0.35, mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'tidal_bump',       name: 'Tidal Bump',      targeting: 'single',      desc: 'Crash a rolling wave of water into a target.',                                   owner: 'aquaphant',  learnedAt: 12, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 24, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'hydro_skin',       name: 'Hydro Skin',      targeting: 'self',        desc: 'Coat skin in dense water pressure to raise Defense and Spirit together.',       owner: 'aquaphant',  learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'undertow',         name: 'Undertow',        targeting: 'single',      desc: 'Drag a foe into a powerful current, slowing their movement to a crawl.',            owner: 'aquaphant',  learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'slow',    duration: 3 } },
  { id: 'surge_crash',      name: 'Surge Crash',     targeting: 'all_enemies', desc: 'Unleash a surging torrent that crashes into all enemies at once.',              owner: 'aquaphant',  learnedAt: 25, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 20, offensiveScaling: 0.85, mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'bubble_shot_2',    name: 'Bubble Shot 2',   targeting: 'single',      desc: 'A high-pressure water burst with greater force behind it.',                     owner: 'aquaphant',  learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 28, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'whirlpool',        name: 'Whirlpool',       targeting: 'single',      desc: "Trap a foe in a churning vortex, lowering their Speed and Accuracy.",           owner: 'aquaphant',  learnedAt: 38, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 88,  canCrit: false, movePowerModifier: 0 },
  { id: 'surge_crash_2',    name: 'Surge Crash 2',   targeting: 'all_enemies', desc: 'A larger surge that hammers all enemies with increased pressure.',              owner: 'aquaphant',  learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 34, offensiveScaling: 0.85, mpCost: 18, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'bubble_shot_3',    name: 'Bubble Shot 3',   targeting: 'single',      desc: 'A focused hydro lance of maximum water pressure.',                              owner: 'aquaphant',  learnedAt: 52, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 44, offensiveScaling: 1.0,  mpCost: 12, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'surge_crash_3',    name: 'Surge Crash 3',   targeting: 'all_enemies', desc: 'A tidal assault that batters the entire enemy formation.',                      owner: 'aquaphant',  learnedAt: 58, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 50, offensiveScaling: 0.85, mpCost: 26, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'torrent',          name: 'Torrent',         targeting: 'single',      desc: 'Unleash a devastating torrent that drains enemy life to restore own HP.',       owner: 'aquaphant',  learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 68, offensiveScaling: 1.0,  mpCost: 30, accuracy: 88,  canCrit: true,  movePowerModifier: 0, lifeSteal: 0.25 },

  // ── Pengun ───────────────────────────────────────────────────────────────────
  { id: 'ice_pebble',       name: 'Ice Pebble',      targeting: 'single',      desc: 'Hurl a sharp shard of ice at a target.',                                         owner: 'pengun',     learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 14, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cold_feet',        name: 'Cold Feet',       targeting: 'single',      desc: 'Flash-freeze the ground beneath one foe to slow and disrupt them.',             owner: 'pengun',     learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 92,  canCrit: false, movePowerModifier: 0 },
  { id: 'glacier_wall',     name: 'Glacier Wall',    targeting: 'self',        desc: 'Encase self in dense ice plating to raise Defense and Spirit.',                 owner: 'pengun',     learnedAt: 8,  category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'snow_blind',       name: 'Snow Blind',      targeting: 'single',      desc: "Blast snow into one foe's eyes, impairing their aim.",                          owner: 'pengun',     learnedAt: 12, category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 7,  accuracy: 88,  canCrit: false, movePowerModifier: 0 },
  { id: 'whiteout',         name: 'Whiteout',        targeting: 'single',      desc: 'Hurl a blinding flurry of snow and ice, leaving the target unable to see.',         owner: 'pengun',     learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'blind',   duration: 2 } },
  { id: 'frost_nip',        name: 'Frost Nip',       targeting: 'single',      desc: 'Nip at a foe with biting cold for ice magic damage.',                           owner: 'pengun',     learnedAt: 15, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 23, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shatter_chill',    name: 'Shatter Chill',   targeting: 'all_enemies', desc: 'Detonate a frozen blast that shatters across all enemies.',                     owner: 'pengun',     learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 18, offensiveScaling: 0.85, mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ice_pebble_2',     name: 'Ice Pebble 2',    targeting: 'single',      desc: 'A larger, faster ice shard with more penetrating force.',                       owner: 'pengun',     learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 26, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ice_lock',         name: 'Ice Lock',        targeting: 'single',      desc: 'Encase a foe in a solid prison of ice, stunning them for one turn.',                 owner: 'pengun',     learnedAt: 30, category: 'utility', damageClass: 'utility',  element: 'ice',     basePower: 0,  offensiveScaling: 0,    mpCost: 14, accuracy: 82,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'stun',    duration: 1 } },
  { id: 'frozen_pulse',     name: 'Frozen Pulse',    targeting: 'single',      desc: 'A freezing burst that deals ice damage and lowers the target Speed.',           owner: 'pengun',     learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 18, offensiveScaling: 0.85, mpCost: 10, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'blizzard',         name: 'Blizzard',        targeting: 'all_enemies', desc: 'Sweep a freezing storm across all enemies.',                                     owner: 'pengun',     learnedAt: 42, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 12, offensiveScaling: 0.7,  mpCost: 14, accuracy: 90,  canCrit: false, movePowerModifier: 0 },
  { id: 'shatter_chill_2',  name: 'Shatter Chill 2', targeting: 'all_enemies', desc: 'A more powerful frozen detonation that shatters across all enemies.',           owner: 'pengun',     learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 32, offensiveScaling: 0.85, mpCost: 18, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ice_pebble_3',     name: 'Ice Pebble 3',    targeting: 'single',      desc: 'A razor-edged ice lance launched at crushing velocity.',                        owner: 'pengun',     learnedAt: 52, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 42, offensiveScaling: 1.0,  mpCost: 12, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shatter_chill_3',  name: 'Shatter Chill 3', targeting: 'all_enemies', desc: 'Detonate a field-wide frozen blast of devastating scale.',                      owner: 'pengun',     learnedAt: 58, category: 'art',     damageClass: 'magic',    element: 'ice',     basePower: 46, offensiveScaling: 0.85, mpCost: 26, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'absolute_zero',    name: 'Absolute Zero',   targeting: 'single',      desc: 'Plunge a target into perfect cold for massive ice damage, lowering Speed and Accuracy.', owner: 'pengun', learnedAt: 65, category: 'art', damageClass: 'magic', element: 'ice', basePower: 72, offensiveScaling: 1.0, mpCost: 32, accuracy: 88, canCrit: true, movePowerModifier: 0 },

  // ── Salamander ───────────────────────────────────────────────────────────────
  { id: 'spark_flick',      name: 'Spark Flick',     targeting: 'single',      desc: 'Snap hot sparks at a foe with a fiery flick.',                                   owner: 'salamander', learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 15, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'heat_haze',        name: 'Heat Haze',       targeting: 'self',        desc: 'Distort the air around self to raise Evasion temporarily.',                      owner: 'salamander', learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'ember_trail',      name: 'Ember Trail',     targeting: 'single',      desc: 'Leave lingering embers on a foe — low damage now, Burn later.',                 owner: 'salamander', learnedAt: 8,  category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 8,  offensiveScaling: 0.65, mpCost: 5,  accuracy: 96,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'burn', duration: 3 } },
  { id: 'flare_bite',       name: 'Flare Bite',      targeting: 'single',      desc: 'Chomp down with a jaw wreathed in fire for solid fire damage.',                 owner: 'salamander', learnedAt: 12, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 26, offensiveScaling: 1.0,  mpCost: 7,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ash_veil',         name: 'Ash Veil',        targeting: 'self',        desc: 'Shroud self in cooling ash to raise Spirit temporarily.',                        owner: 'salamander', learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 7,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'smoke_screen',     name: 'Smoke Screen',    targeting: 'single',      desc: 'Shroud a foe in thick smoke, impairing their vision so all attacks miss.',          owner: 'salamander', learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 9,  accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'blind',   duration: 2 } },
  { id: 'cinder_burst',     name: 'Cinder Burst',    targeting: 'all_enemies', desc: 'Detonate an ember that bursts with fire damage across all enemies.',            owner: 'salamander', learnedAt: 22, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 22, offensiveScaling: 0.9,  mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spark_flick_2',    name: 'Spark Flick 2',   targeting: 'single',      desc: 'A crackling flick that delivers a sharper burst of fire energy.',               owner: 'salamander', learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 30, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'scorch',           name: 'Scorch',          targeting: 'single',      desc: 'Strike twice in quick succession with concentrated fire bursts.',                owner: 'salamander', learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 14, offensiveScaling: 0.8,  mpCost: 9,  accuracy: 92,  canCrit: true,  movePowerModifier: 0, hitCount: 2 },
  { id: 'cinder_burst_2',   name: 'Cinder Burst 2',  targeting: 'all_enemies', desc: 'An intense cinder detonation with greater heat and force.',                     owner: 'salamander', learnedAt: 42, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 36, offensiveScaling: 0.9,  mpCost: 18, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spark_flick_3',    name: 'Spark Flick 3',   targeting: 'single',      desc: 'A full-force fire burst channeling the heat of a living blaze.',                owner: 'salamander', learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 46, offensiveScaling: 1.0,  mpCost: 12, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cinder_burst_3',   name: 'Cinder Burst 3',  targeting: 'all_enemies', desc: 'A field-scorching eruption that overwhelms all enemies with flame.',            owner: 'salamander', learnedAt: 58, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 52, offensiveScaling: 0.9,  mpCost: 26, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'magma_surge',      name: 'Magma Surge',     targeting: 'all_enemies', desc: 'Erupt the battlefield with a surge of magma that engulfs all enemies.',         owner: 'salamander', learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'fire',    basePower: 64, offensiveScaling: 0.85, mpCost: 32, accuracy: 82,  canCrit: true,  movePowerModifier: 0 },

  // ── Clod ─────────────────────────────────────────────────────────────────────
  { id: 'stone_strike',     name: 'Stone Strike',    targeting: 'single',      desc: 'Drive a heavy stone fist into one foe for solid earth physical damage.',          owner: 'clod',       learnedAt: 1,  category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 16, offensiveScaling: 1.0,  mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'boulder_wall',     name: 'Boulder Wall',    targeting: 'self',        desc: 'Harden into dense rock, raising Defense by two stages.',                         owner: 'clod',       learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'rock_toss',        name: 'Rock Toss',       targeting: 'single',      desc: 'Hurl a jagged chunk of earth at a target for earth physical damage.',            owner: 'clod',       learnedAt: 8,  category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 22, offensiveScaling: 0.9,  mpCost: 6,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'mud_slap',         name: 'Mud Slap',        targeting: 'single',      desc: 'Sling a heavy glob of mud at a foe to slow their movement.',                     owner: 'clod',       learnedAt: 10, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'slow', duration: 2 } },
  { id: 'earthen_shell',    name: 'Earthen Shell',   targeting: 'self',        desc: 'Coat self in layered earth armor, raising Defense and Spirit.',                  owner: 'clod',       learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'quake_stomp',      name: 'Quake Stomp',     targeting: 'all_enemies', desc: 'Slam the ground to send a shockwave crashing into all enemies.',                 owner: 'clod',       learnedAt: 20, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 20, offensiveScaling: 0.8,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'dust_cloud',       name: 'Dust Cloud',      targeting: 'all_enemies', desc: 'Kick up a blinding cloud of dust and grit that impairs all enemies.',            owner: 'clod',       learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 85,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'blind', duration: 1 } },
  { id: 'stone_strike_2',   name: 'Stone Strike 2',  targeting: 'single',      desc: 'A heavier stone blow with greater force behind it.',                             owner: 'clod',       learnedAt: 28, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 30, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'rubble_crash',     name: 'Rubble Crash',    targeting: 'single',      desc: 'Crash down on a foe with a heavy mass of rubble for earth physical damage.',    owner: 'clod',       learnedAt: 30, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 42, offensiveScaling: 1.0,  mpCost: 12, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'gravel_barrage',   name: 'Gravel Barrage',  targeting: 'single',      desc: 'Launch a rapid volley of gravel shards that strikes twice.',                     owner: 'clod',       learnedAt: 35, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 15, offensiveScaling: 0.8,  mpCost: 10, accuracy: 90,  canCrit: true,  movePowerModifier: 0, hitCount: 2 },
  { id: 'quake_stomp_2',    name: 'Quake Stomp 2',   targeting: 'all_enemies', desc: 'A deeper seismic slam that sends a crushing wave through all enemies.',          owner: 'clod',       learnedAt: 42, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 34, offensiveScaling: 0.8,  mpCost: 18, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'gravel_barrage_2', name: 'Gravel Barrage 2', targeting: 'single',     desc: 'A relentless three-shot volley of high-velocity earth shards.',                  owner: 'clod',       learnedAt: 45, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 18, offensiveScaling: 0.8,  mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0, hitCount: 3 },
  { id: 'stone_strike_3',   name: 'Stone Strike 3',  targeting: 'single',      desc: 'A fully empowered earth strike channeling the weight of stone itself.',          owner: 'clod',       learnedAt: 50, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 48, offensiveScaling: 1.0,  mpCost: 12, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'rubble_crash_2',   name: 'Rubble Crash 2',  targeting: 'single',      desc: 'A devastating avalanche that buries one target under massive rubble.',           owner: 'clod',       learnedAt: 55, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 58, offensiveScaling: 1.0,  mpCost: 18, accuracy: 82,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tectonic_crash',   name: 'Tectonic Crash',  targeting: 'single',      desc: 'Split the ground beneath a target with the force of a tectonic collision.',     owner: 'clod',       learnedAt: 65, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 76, offensiveScaling: 1.0,  mpCost: 32, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },

  // ── Galeon ────────────────────────────────────────────────────────────────────
  { id: 'gust_slash',       name: 'Gust Slash',      targeting: 'single',      desc: 'Slash the air around a foe to deal light wind damage.',                           owner: 'galeon',     learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 16, offensiveScaling: 0.95, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tailwind',         name: 'Tailwind',         targeting: 'self',        desc: 'Ride an updraft to sharply raise own Speed by two stages.',                      owner: 'galeon',     learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'wind_blade',       name: 'Wind Blade',       targeting: 'single',      desc: 'Launch a spinning blade of compressed air at a single foe.',                     owner: 'galeon',     learnedAt: 8,  category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 24, offensiveScaling: 0.95, mpCost: 6,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'feather_storm',    name: 'Feather Storm',    targeting: 'all_enemies', desc: 'Summon a storm of razor feathers that lashes all enemies.',                      owner: 'galeon',     learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 14, offensiveScaling: 0.8,  mpCost: 10, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'slipstream',       name: 'Slipstream',       targeting: 'self',        desc: 'Enter a slipstream to raise Speed and Evasion.',                                  owner: 'galeon',     learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'cyclone_shot',     name: 'Cyclone Shot',     targeting: 'single',      desc: 'Fire a tight cyclone burst at one target for solid wind damage.',                 owner: 'galeon',     learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 32, offensiveScaling: 0.95, mpCost: 10, accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'wind_shear',       name: 'Wind Shear',       targeting: 'single',      desc: 'Cut the wind around a foe, slowing their movement.',                              owner: 'galeon',     learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 86,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'slow', duration: 2 } },
  { id: 'gust_slash_2',     name: 'Gust Slash 2',     targeting: 'single',      desc: 'A sharper air slash refined through advanced tempo control.',                     owner: 'galeon',     learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 34, offensiveScaling: 0.95, mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tempest_burst',    name: 'Tempest Burst',    targeting: 'single',      desc: 'Detonate a compressed tempest against a single target.',                          owner: 'galeon',     learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 46, offensiveScaling: 0.95, mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'blade_gale',       name: 'Blade Gale',       targeting: 'single',      desc: 'Send two spinning wind blades in rapid succession.',                              owner: 'galeon',     learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 18, offensiveScaling: 0.85, mpCost: 12, accuracy: 90,  canCrit: true,  movePowerModifier: 0, hitCount: 2 },
  { id: 'cyclone_shot_2',   name: 'Cyclone Shot 2',   targeting: 'single',      desc: 'A reinforced cyclone that hits with greater density and force.',                  owner: 'galeon',     learnedAt: 42, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 48, offensiveScaling: 0.95, mpCost: 16, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'blade_gale_2',     name: 'Blade Gale 2',     targeting: 'single',      desc: 'Three rapid wind blades that shred through a target in sequence.',                owner: 'galeon',     learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 20, offensiveScaling: 0.85, mpCost: 16, accuracy: 88,  canCrit: true,  movePowerModifier: 0, hitCount: 3 },
  { id: 'gust_slash_3',     name: 'Gust Slash 3',     targeting: 'single',      desc: 'A fully empowered air slash channeling pure wind tempo.',                         owner: 'galeon',     learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 52, offensiveScaling: 0.95, mpCost: 14, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tempest_burst_2',  name: 'Tempest Burst 2',  targeting: 'single',      desc: 'A massive concentrated tempest released at full force.',                          owner: 'galeon',     learnedAt: 55, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 64, offensiveScaling: 0.95, mpCost: 20, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'storm_finale',     name: 'Storm Finale',     targeting: 'single',      desc: 'Channel the eye of the storm and strike with peak wind force.',                   owner: 'galeon',     learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 82, offensiveScaling: 1.0,  mpCost: 34, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },

  // ── Voltwing ──────────────────────────────────────────────────────────────────
  { id: 'spark_jab',        name: 'Spark Jab',        targeting: 'single',      desc: 'A fast lightning jab that crackles into a single foe.',                           owner: 'voltwing',   learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 15, offensiveScaling: 0.9,  mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'dodge_step',       name: 'Dodge Step',       targeting: 'self',        desc: 'Blur into the static to sharply raise Evasion by two stages.',                   owner: 'voltwing',   learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'volt_dart',        name: 'Volt Dart',        targeting: 'single',      desc: 'Fire a fast-moving electric shard at one target.',                               owner: 'voltwing',   learnedAt: 8,  category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 22, offensiveScaling: 0.9,  mpCost: 6,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'static_burst',     name: 'Static Burst',     targeting: 'all_enemies', desc: 'Release a charge of static electricity that shocks all enemies.',                owner: 'voltwing',   learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 13, offensiveScaling: 0.75, mpCost: 10, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'phase_shift',      name: 'Phase Shift',      targeting: 'self',        desc: 'Shift into a charged state, raising Speed and Evasion.',                         owner: 'voltwing',   learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'chain_spark',      name: 'Chain Spark',      targeting: 'all_enemies', desc: 'Arc a chain of lightning that leaps between all enemy targets.',                  owner: 'voltwing',   learnedAt: 20, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 18, offensiveScaling: 0.8,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'volt_snap',        name: 'Volt Snap',        targeting: 'single',      desc: 'Snap a sharp electric jolt at a foe with a chance to stun.',                     owner: 'voltwing',   learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'wind',    basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 80,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'stun', duration: 1 } },
  { id: 'spark_jab_2',      name: 'Spark Jab 2',      targeting: 'single',      desc: 'A sharper electric jab with more charge behind it.',                             owner: 'voltwing',   learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 32, offensiveScaling: 0.9,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'lightning_strike', name: 'Lightning Strike', targeting: 'single',      desc: 'Call down a focused bolt of lightning onto a single target.',                    owner: 'voltwing',   learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 44, offensiveScaling: 0.9,  mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'twin_bolt',        name: 'Twin Bolt',        targeting: 'single',      desc: 'Launch two electric bolts in rapid sequence at one target.',                     owner: 'voltwing',   learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 17, offensiveScaling: 0.85, mpCost: 12, accuracy: 90,  canCrit: true,  movePowerModifier: 0, hitCount: 2 },
  { id: 'static_burst_2',   name: 'Static Burst 2',   targeting: 'all_enemies', desc: 'A stronger static discharge that overwhelms all enemies with voltage.',          owner: 'voltwing',   learnedAt: 42, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 28, offensiveScaling: 0.8,  mpCost: 16, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'twin_bolt_2',      name: 'Twin Bolt 2',      targeting: 'single',      desc: 'Three rapid-fire electric bolts that arc into a single target.',                 owner: 'voltwing',   learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 19, offensiveScaling: 0.85, mpCost: 16, accuracy: 88,  canCrit: true,  movePowerModifier: 0, hitCount: 3 },
  { id: 'spark_jab_3',      name: 'Spark Jab 3',      targeting: 'single',      desc: 'A fully overcharged lightning jab at peak electric intensity.',                  owner: 'voltwing',   learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 50, offensiveScaling: 0.9,  mpCost: 14, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'lightning_strike_2', name: 'Lightning Strike 2', targeting: 'single',  desc: 'A supercharged bolt strike that hits with full electrical force.',               owner: 'voltwing',   learnedAt: 55, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 62, offensiveScaling: 0.9,  mpCost: 20, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'thunderclap',      name: 'Thunderclap',      targeting: 'all_enemies', desc: 'Unleash a massive thunderclap that electrocutes the entire enemy field.',        owner: 'voltwing',   learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'wind',    basePower: 48, offensiveScaling: 0.9,  mpCost: 34, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },

  // ── Lumora ────────────────────────────────────────────────────────────────────
  { id: 'radiant_tap',      name: 'Radiant Tap',      targeting: 'single',      desc: 'A gentle touch of light energy that deals light magic damage.',                   owner: 'lumora',     learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 12, offensiveScaling: 0.85, mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'mend_light',       name: 'Mend Light',       targeting: 'single_ally', desc: 'Channel healing light into one ally to restore their HP.',                        owner: 'lumora',     learnedAt: 1,  category: 'heal',    damageClass: 'heal',     element: 'light',   basePower: 18, offensiveScaling: 0.50, mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'cleanse',          name: 'Cleanse',          targeting: 'single_ally', desc: 'Wash away all status effects afflicting one ally.',                               owner: 'lumora',     learnedAt: 8,  category: 'utility', damageClass: 'utility',  element: 'light',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'light_ray',        name: 'Light Ray',        targeting: 'single',      desc: 'Project a focused ray of holy light at a single target.',                         owner: 'lumora',     learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 20, offensiveScaling: 0.85, mpCost: 6,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'rejuvenate',       name: 'Rejuvenate',       targeting: 'all_allies',  desc: 'Rain a soft healing light down on all allies to restore their HP.',               owner: 'lumora',     learnedAt: 18, category: 'heal',    damageClass: 'heal',     element: 'light',   basePower: 12, offensiveScaling: 0.40, mpCost: 14, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'clarity',          name: 'Clarity',          targeting: 'self',        desc: 'Focus into a state of pure clarity to raise Speed and Accuracy.',                 owner: 'lumora',     learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'light',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'blind_flash',      name: 'Blind Flash',      targeting: 'single',      desc: 'Blast a searing flash of light into a foe to impair their vision.',               owner: 'lumora',     learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'light',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 85,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'blind', duration: 2 } },
  { id: 'radiant_tap_2',    name: 'Radiant Tap 2',    targeting: 'single',      desc: 'A stronger radiant strike charged with greater holy energy.',                     owner: 'lumora',     learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 28, offensiveScaling: 0.85, mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'healing_surge',    name: 'Healing Surge',    targeting: 'single_ally', desc: 'Pour a surge of healing light into one ally for a large HP restore.',            owner: 'lumora',     learnedAt: 30, category: 'heal',    damageClass: 'heal',     element: 'light',   basePower: 34, offensiveScaling: 0.55, mpCost: 16, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'light_beam',       name: 'Light Beam',       targeting: 'single',      desc: 'Fire a sustained beam of holy light into a single target.',                       owner: 'lumora',     learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 42, offensiveScaling: 0.85, mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'holy_ward',        name: 'Holy Ward',        targeting: 'self',        desc: 'Surround self in a divine barrier that raises Spirit by two stages.',             owner: 'lumora',     learnedAt: 42, category: 'utility', damageClass: 'utility',  element: 'light',   basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'mend_light_2',     name: 'Mend Light 2',     targeting: 'single_ally', desc: 'A powerful surge of healing light that restores a large amount of HP.',          owner: 'lumora',     learnedAt: 45, category: 'heal',    damageClass: 'heal',     element: 'light',   basePower: 46, offensiveScaling: 0.55, mpCost: 20, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'radiant_tap_3',    name: 'Radiant Tap 3',    targeting: 'single',      desc: 'A fully empowered holy strike channeling radiant peak energy.',                   owner: 'lumora',     learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 50, offensiveScaling: 0.85, mpCost: 14, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'full_restore',     name: 'Full Restore',     targeting: 'all_allies',  desc: 'Release a wave of restorative light that heals the whole team.',                  owner: 'lumora',     learnedAt: 55, category: 'heal',    damageClass: 'heal',     element: 'light',   basePower: 22, offensiveScaling: 0.45, mpCost: 28, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'divine_light',     name: 'Divine Light',     targeting: 'single',      desc: 'Channel pure divine energy into a single target with blinding holy force.',      owner: 'lumora',     learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'light',   basePower: 78, offensiveScaling: 0.90, mpCost: 34, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },

  // ── Nocthorn ──────────────────────────────────────────────────────────────────
  { id: 'shadow_claw',      name: 'Shadow Claw',      targeting: 'single',      desc: 'Rake dark energy across a foe for solid dark magic damage.',                      owner: 'nocthorn',   learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 18, offensiveScaling: 1.0,  mpCost: 4,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'life_drain',       name: 'Life Drain',       targeting: 'single',      desc: 'Siphon vital energy from a foe, dealing dark damage and healing self.',           owner: 'nocthorn',   learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 16, offensiveScaling: 0.9,  mpCost: 6,  accuracy: 90,  canCrit: false, movePowerModifier: 0, lifeSteal: 0.4 },
  { id: 'curse',            name: 'Curse',            targeting: 'single',      desc: 'Brand a foe with a dark curse that inflicts permanent poison.',                    owner: 'nocthorn',   learnedAt: 8,  category: 'utility', damageClass: 'utility',  element: 'dark',    basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'poison', permanent: true } },
  { id: 'dark_pulse',       name: 'Dark Pulse',       targeting: 'single',      desc: 'Release a pulse of void energy into a single target.',                            owner: 'nocthorn',   learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 24, offensiveScaling: 1.0,  mpCost: 6,  accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'silence',          name: 'Silence',          targeting: 'single',      desc: 'Suppress the arcane channels of a foe, silencing their Arts.',                    owner: 'nocthorn',   learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'dark',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 84,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'silence', duration: 2 } },
  { id: 'shadow_surge',     name: 'Shadow Surge',     targeting: 'self',        desc: 'Channel darkness into raw power, sharply raising Intelligence at the cost of Defense.', owner: 'nocthorn', learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'dark',    basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'phantom_strike',   name: 'Phantom Strike',   targeting: 'single',      desc: 'Strike from the void with tremendous dark force — high power, lower accuracy.',   owner: 'nocthorn',   learnedAt: 22, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 38, offensiveScaling: 1.0,  mpCost: 10, accuracy: 78,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shadow_claw_2',    name: 'Shadow Claw 2',    targeting: 'single',      desc: 'A deeper shadow rake with more vicious dark energy behind it.',                   owner: 'nocthorn',   learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 36, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'dark_eruption',    name: 'Dark Eruption',    targeting: 'all_enemies', desc: 'Erupt a burst of dark energy that crashes over all enemies.',                     owner: 'nocthorn',   learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 22, offensiveScaling: 0.85, mpCost: 14, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'soul_rend',        name: 'Soul Rend',        targeting: 'single',      desc: 'Tear into the soul of a foe for dark damage, draining HP back to self.',          owner: 'nocthorn',   learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 32, offensiveScaling: 0.95, mpCost: 14, accuracy: 86,  canCrit: false, movePowerModifier: 0, lifeSteal: 0.5 },
  { id: 'phantom_strike_2', name: 'Phantom Strike 2', targeting: 'single',      desc: 'A devastating void strike — massive power at the cost of significant miss risk.', owner: 'nocthorn',   learnedAt: 42, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 56, offensiveScaling: 1.0,  mpCost: 16, accuracy: 76,  canCrit: true,  movePowerModifier: 0 },
  { id: 'dark_eruption_2',  name: 'Dark Eruption 2',  targeting: 'all_enemies', desc: 'A deeper void eruption that engulfs all enemies in crushing dark energy.',        owner: 'nocthorn',   learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 36, offensiveScaling: 0.85, mpCost: 20, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'shadow_claw_3',    name: 'Shadow Claw 3',    targeting: 'single',      desc: 'A fully unleashed shadow rake at peak dark intensity.',                           owner: 'nocthorn',   learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 54, offensiveScaling: 1.0,  mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'soul_rend_2',      name: 'Soul Rend 2',      targeting: 'single',      desc: 'A soul-tearing strike that drains even more life force back to the attacker.',    owner: 'nocthorn',   learnedAt: 55, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 46, offensiveScaling: 0.95, mpCost: 20, accuracy: 84,  canCrit: false, movePowerModifier: 0, lifeSteal: 0.6 },
  { id: 'void_collapse',    name: 'Void Collapse',    targeting: 'single',      desc: 'Collapse the void onto a single target with catastrophic dark force.',            owner: 'nocthorn',   learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'dark',    basePower: 84, offensiveScaling: 1.0,  mpCost: 34, accuracy: 80,  canCrit: true,  movePowerModifier: 0 },

  // ── Emberjaw ──────────────────────────────────────────────────────────────────
  { id: 'ember_bite',       name: 'Ember Bite',       targeting: 'single',      desc: 'Sink blazing jaws into a foe for solid fire physical damage.',                    owner: 'emberjaw',   learnedAt: 1,  category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 18, offensiveScaling: 1.0,  mpCost: 4,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'flame_charge',     name: 'Flame Charge',     targeting: 'single',      desc: 'Explode forward in a burst of flame for a fast physical fire hit.',               owner: 'emberjaw',   learnedAt: 1,  category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 16, offensiveScaling: 1.0,  mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'fire_fang',        name: 'Fire Fang',        targeting: 'single',      desc: 'Clamp burning fangs onto a foe, dealing fire physical damage and inflicting burn.', owner: 'emberjaw',  learnedAt: 8,  category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 22, offensiveScaling: 0.95, mpCost: 6,  accuracy: 90,  canCrit: true,  movePowerModifier: 0, applyStatus: { id: 'burn', duration: 2 } },
  { id: 'heat_rush',        name: 'Heat Rush',        targeting: 'all_enemies', desc: 'Blaze across the field in a scorching rush that hits all enemies.',               owner: 'emberjaw',   learnedAt: 10, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 14, offensiveScaling: 0.8,  mpCost: 10, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'blaze_stance',     name: 'Blaze Stance',     targeting: 'self',        desc: 'Enter a blazing combat stance that sharply raises Strength by two stages.',       owner: 'emberjaw',   learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'fire',    basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'magma_crash',      name: 'Magma Crash',      targeting: 'single',      desc: 'Crash into a target with a body coated in searing magma for heavy fire damage.',  owner: 'emberjaw',   learnedAt: 20, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 38, offensiveScaling: 1.0,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'cinder_toss',      name: 'Cinder Toss',      targeting: 'single',      desc: 'Hurl a mass of burning cinders to deal fire damage and leave a burn.',           owner: 'emberjaw',   learnedAt: 22, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 26, offensiveScaling: 0.9,  mpCost: 8,  accuracy: 88,  canCrit: true,  movePowerModifier: 0, applyStatus: { id: 'burn', duration: 2 } },
  { id: 'ember_bite_2',     name: 'Ember Bite 2',     targeting: 'single',      desc: 'A deeper blazing bite with more ferocity behind it.',                             owner: 'emberjaw',   learnedAt: 28, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 34, offensiveScaling: 1.0,  mpCost: 8,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'flame_charge_2',   name: 'Flame Charge 2',   targeting: 'single',      desc: 'A supercharged flame dash that erupts on impact.',                               owner: 'emberjaw',   learnedAt: 30, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 44, offensiveScaling: 1.0,  mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'fire_volley',      name: 'Fire Volley',      targeting: 'single',      desc: 'Launch a rapid double strike of blazing physical blows.',                         owner: 'emberjaw',   learnedAt: 35, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 18, offensiveScaling: 0.85, mpCost: 12, accuracy: 90,  canCrit: true,  movePowerModifier: 0, hitCount: 2 },
  { id: 'heat_rush_2',      name: 'Heat Rush 2',      targeting: 'all_enemies', desc: 'A raging inferno charge that scorches all enemies with greater force.',           owner: 'emberjaw',   learnedAt: 42, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 28, offensiveScaling: 0.8,  mpCost: 18, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'fire_volley_2',    name: 'Fire Volley 2',    targeting: 'single',      desc: 'A relentless three-hit blaze barrage delivered at full speed.',                   owner: 'emberjaw',   learnedAt: 45, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 20, offensiveScaling: 0.85, mpCost: 16, accuracy: 88,  canCrit: true,  movePowerModifier: 0, hitCount: 3 },
  { id: 'ember_bite_3',     name: 'Ember Bite 3',     targeting: 'single',      desc: 'A fully unleashed jaw strike pouring all fire force into one hit.',               owner: 'emberjaw',   learnedAt: 50, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 52, offensiveScaling: 1.0,  mpCost: 14, accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'magma_crash_2',    name: 'Magma Crash 2',    targeting: 'single',      desc: 'A devastating magma-fueled body slam at maximum intensity.',                     owner: 'emberjaw',   learnedAt: 55, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 62, offensiveScaling: 1.0,  mpCost: 20, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'inferno_crash',    name: 'Inferno Crash',    targeting: 'single',      desc: 'Detonate a full-body inferno against one target with catastrophic fire force.',   owner: 'emberjaw',   learnedAt: 65, category: 'art',     damageClass: 'physical', element: 'fire',    basePower: 80, offensiveScaling: 1.0,  mpCost: 34, accuracy: 82,  canCrit: true,  movePowerModifier: 0 },

  // ── Tidecalf ──────────────────────────────────────────────────────────────────
  { id: 'tide_slap',        name: 'Tide Slap',        targeting: 'single',      desc: 'Slap a wave of water into a foe for light water magic damage.',                  owner: 'tidecalf',   learnedAt: 1,  category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 16, offensiveScaling: 0.9,  mpCost: 4,  accuracy: 96,  canCrit: true,  movePowerModifier: 0 },
  { id: 'brine_shield',     name: 'Brine Shield',     targeting: 'self',        desc: 'Coat self in dense brine, raising Defense and Spirit.',                          owner: 'tidecalf',   learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 8,  accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'water_jet',        name: 'Water Jet',        targeting: 'single',      desc: 'Fire a pressurized jet of water at a single target.',                            owner: 'tidecalf',   learnedAt: 8,  category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 24, offensiveScaling: 0.9,  mpCost: 6,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'surf_wave',        name: 'Surf Wave',        targeting: 'all_enemies', desc: 'Send a crashing wave sweeping over all enemies.',                                 owner: 'tidecalf',   learnedAt: 10, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 14, offensiveScaling: 0.8,  mpCost: 10, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'barnacle_wall',    name: 'Barnacle Wall',    targeting: 'self',        desc: 'Harden into a barnacle-encrusted shell, raising Defense by two stages.',         owner: 'tidecalf',   learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'whirlpool',        name: 'Whirlpool',        targeting: 'single',      desc: 'Trap a foe in a draining whirlpool that lowers Speed and Accuracy.',             owner: 'tidecalf',   learnedAt: 20, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 88,  canCrit: false, movePowerModifier: 0 },
  { id: 'high_tide',        name: 'High Tide',        targeting: 'all_enemies', desc: 'Unleash a high tide surge that crashes over all enemies.',                       owner: 'tidecalf',   learnedAt: 22, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 18, offensiveScaling: 0.8,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tide_slap_2',      name: 'Tide Slap 2',      targeting: 'single',      desc: 'A heavier water strike with more tidal pressure.',                               owner: 'tidecalf',   learnedAt: 28, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 34, offensiveScaling: 0.9,  mpCost: 8,  accuracy: 94,  canCrit: true,  movePowerModifier: 0 },
  { id: 'deep_surge',       name: 'Deep Surge',       targeting: 'single',      desc: 'Channel deep-water pressure into a focused surge — solid damage, low MP cost.',  owner: 'tidecalf',   learnedAt: 30, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 46, offensiveScaling: 0.9,  mpCost: 12, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tidal_crash',      name: 'Tidal Crash',      targeting: 'single',      desc: 'Crash a full tidal force into a single target.',                                  owner: 'tidecalf',   learnedAt: 35, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 42, offensiveScaling: 0.9,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tide_wall',        name: 'Tide Wall',        targeting: 'self',        desc: 'Raise a wall of dense water, granting a large boost to Defense and Spirit.',     owner: 'tidecalf',   learnedAt: 42, category: 'utility', damageClass: 'utility',  element: 'water',   basePower: 0,  offensiveScaling: 0,    mpCost: 14, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'deep_surge_2',     name: 'Deep Surge 2',     targeting: 'single',      desc: 'A reinforced deep surge at maximum pressure — strong damage for its MP cost.',   owner: 'tidecalf',   learnedAt: 45, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 56, offensiveScaling: 0.9,  mpCost: 16, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'tide_slap_3',      name: 'Tide Slap 3',      targeting: 'single',      desc: 'A fully empowered tidal strike at peak water force.',                            owner: 'tidecalf',   learnedAt: 50, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 52, offensiveScaling: 0.9,  mpCost: 14, accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'high_tide_2',      name: 'High Tide 2',      targeting: 'all_enemies', desc: 'A massive tidal surge that overwhelms all enemies with crushing water.',         owner: 'tidecalf',   learnedAt: 55, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 34, offensiveScaling: 0.8,  mpCost: 18, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'ocean_crush',      name: 'Ocean Crush',      targeting: 'single',      desc: 'Bring the full weight of the ocean crashing down on a single target.',           owner: 'tidecalf',   learnedAt: 65, category: 'art',     damageClass: 'magic',    element: 'water',   basePower: 80, offensiveScaling: 0.9,  mpCost: 32, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },

  // ── Gravemoss ─────────────────────────────────────────────────────────────────
  { id: 'moss_strike',      name: 'Moss Strike',      targeting: 'single',      desc: 'A heavy moss-covered blow that grinds into a foe for earth physical damage.',    owner: 'gravemoss',  learnedAt: 1,  category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 16, offensiveScaling: 0.95, mpCost: 4,  accuracy: 92,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spore_drift',      name: 'Spore Drift',      targeting: 'single',      desc: 'Release a cloud of toxic spores that inflicts permanent poison on one foe.',     owner: 'gravemoss',  learnedAt: 1,  category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 86,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'poison', permanent: true } },
  { id: 'root_grab',        name: 'Root Grab',        targeting: 'single',      desc: 'Shoot roots from the ground to ensnare a foe and slow their movement.',          owner: 'gravemoss',  learnedAt: 8,  category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 6,  accuracy: 88,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'slow', duration: 2 } },
  { id: 'earth_slab',       name: 'Earth Slab',       targeting: 'single',      desc: 'Crush a foe beneath a heavy slab of earth for solid physical damage.',           owner: 'gravemoss',  learnedAt: 10, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 22, offensiveScaling: 0.95, mpCost: 6,  accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'overgrowth',       name: 'Overgrowth',       targeting: 'self',        desc: 'Grow a thick layer of earth and moss armor, raising Defense by two stages.',     owner: 'gravemoss',  learnedAt: 18, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 10, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'mudslide',         name: 'Mudslide',         targeting: 'all_enemies', desc: 'Trigger a sudden mudslide that buries all enemies in earth and debris.',         owner: 'gravemoss',  learnedAt: 20, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 16, offensiveScaling: 0.8,  mpCost: 12, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'vine_snare',       name: 'Vine Snare',       targeting: 'single',      desc: 'Bind a foe tight in crushing vines, stunning them for one round.',               owner: 'gravemoss',  learnedAt: 22, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 76,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'stun', duration: 1 } },
  { id: 'moss_strike_2',    name: 'Moss Strike 2',    targeting: 'single',      desc: 'A heavier moss blow with deeper earth force behind it.',                         owner: 'gravemoss',  learnedAt: 28, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 32, offensiveScaling: 0.95, mpCost: 8,  accuracy: 90,  canCrit: true,  movePowerModifier: 0 },
  { id: 'stone_press',      name: 'Stone Press',      targeting: 'single',      desc: 'Grind a massive stone weight down onto a single target.',                         owner: 'gravemoss',  learnedAt: 30, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 44, offensiveScaling: 0.95, mpCost: 14, accuracy: 86,  canCrit: true,  movePowerModifier: 0 },
  { id: 'spore_burst',      name: 'Spore Burst',      targeting: 'all_enemies', desc: 'Detonate a mass of toxic spores that slows every enemy on the field.',           owner: 'gravemoss',  learnedAt: 35, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 14, accuracy: 82,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'slow', duration: 2 } },
  { id: 'moss_wall',        name: 'Moss Wall',        targeting: 'self',        desc: 'Reinforce with layers of dense earth-moss, raising Defense and Spirit.',         owner: 'gravemoss',  learnedAt: 42, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 12, accuracy: 100, canCrit: false, movePowerModifier: 0 },
  { id: 'stone_press_2',    name: 'Stone Press 2',    targeting: 'single',      desc: 'An overwhelming stone crush that drives down with brutal force.',                 owner: 'gravemoss',  learnedAt: 45, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 56, offensiveScaling: 0.95, mpCost: 18, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
  { id: 'mudslide_2',       name: 'Mudslide 2',       targeting: 'all_enemies', desc: 'A devastating mudslide that swallows all enemies in a torrent of earth.',        owner: 'gravemoss',  learnedAt: 50, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 30, offensiveScaling: 0.8,  mpCost: 18, accuracy: 82,  canCrit: true,  movePowerModifier: 0 },
  { id: 'moss_strike_3',    name: 'Moss Strike 3',    targeting: 'single',      desc: 'A fully empowered earth blow channeling the weight of ancient moss and stone.',   owner: 'gravemoss',  learnedAt: 55, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 52, offensiveScaling: 0.95, mpCost: 14, accuracy: 88,  canCrit: true,  movePowerModifier: 0 },
  { id: 'petrify',          name: 'Petrify',          targeting: 'single',      desc: 'Encase a foe in dense stone and earth, stunning them completely.',               owner: 'gravemoss',  learnedAt: 58, category: 'utility', damageClass: 'utility',  element: 'earth',   basePower: 0,  offensiveScaling: 0,    mpCost: 16, accuracy: 74,  canCrit: false, movePowerModifier: 0, applyStatus: { id: 'stun', duration: 1 } },
  { id: 'ancient_crush',    name: 'Ancient Crush',    targeting: 'single',      desc: 'Channel eons of compressed earth into a single catastrophic physical strike.',   owner: 'gravemoss',  learnedAt: 65, category: 'art',     damageClass: 'physical', element: 'earth',   basePower: 78, offensiveScaling: 0.95, mpCost: 34, accuracy: 84,  canCrit: true,  movePowerModifier: 0 },
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
    statusEffects: [],
    statModifiers: [],
    isKnockedOut: false,
    isDefending: false,
  };
}

const MODES = [
  { id: 'training',  label: 'Training Battle', desc: 'Solo vs AI — pick both teams',            icon: '⚔️',  available: true  },
  { id: 'online',    label: 'Online 1v1',       desc: 'Blind pick — match a real opponent',      icon: '🌐',  available: true  },
  { id: 'draft',     label: 'Rental Draft',     desc: 'Competitive draft format — coming soon',  icon: '🏆',  available: false },
  { id: 'imported',  label: 'Imported Battle',  desc: 'Bring your RPG creatures',                icon: '📦',  available: false },
  { id: 'custom',    label: 'Custom Battle',    desc: 'Flexible ruleset',                         icon: '⚙️',  available: false },
];

// Level options for online matchmaking. Index 0 = Any (coordinator resolves randomly after match).
const ONLINE_LEVEL_OPTIONS = [
  { level: 'any', label: 'Any' },
  ...LEVEL_TIERS,
];

// ── Arena registry ────────────────────────────────────────────────────────────

const ARENA_BASE_PATH = 'shared/battle-backgrounds/';

const ARENAS = [
  { id: 'battle-academy',        name: 'Battle Academy'          },
  { id: 'battle-bridge',         name: 'Battle Bridge'           },
  { id: 'castle-ruins',          name: 'Castle Ruins'            },
  { id: 'deep-cavern-arena',     name: 'Deep Cavern'             },
  { id: 'forest-arena-day',      name: 'Forest Arena (Day)'      },
  { id: 'forest-arena-night',    name: 'Forest Arena (Night)'    },
  { id: 'forest-arena-twilight', name: 'Forest Arena (Twilight)' },
  { id: 'forest-labrynth',       name: 'Forest Labyrinth'        },
  { id: 'ice-cave',              name: 'Ice Cave'                },
  { id: 'lava-cavern',           name: 'Lava Cavern'             },
  { id: 'old-ruins',             name: 'Old Ruins'               },
  { id: 'snowy-bridge',          name: 'Snowy Bridge'            },
  { id: 'snowy-forest',          name: 'Snowy Forest'            },
  { id: 'sunset-bridge',         name: 'Sunset Bridge'           },
  { id: 'temple-ruins',          name: 'Temple Ruins'            },
  { id: 'throne-room',           name: 'Throne Room'             },
  { id: 'town-in-flames',        name: 'Town in Flames'          },
  { id: 'village-yard',          name: 'Village Yard'            },
];

// arenaIndex 0 = Random. Returns a resolved { id, name, file } object.
function resolveArena(arenaIndex) {
  const idx = (arenaIndex === 0)
    ? Math.floor(Math.random() * ARENAS.length)
    : arenaIndex - 1;
  const a = ARENAS[idx];
  return { ...a, file: ARENA_BASE_PATH + a.id + '.png' };
}
