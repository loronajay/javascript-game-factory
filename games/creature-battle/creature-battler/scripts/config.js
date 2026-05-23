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
