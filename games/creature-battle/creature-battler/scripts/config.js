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
