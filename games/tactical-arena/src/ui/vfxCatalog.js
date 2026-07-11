const STATUS_VFX = Object.freeze({
  poison: Object.freeze({ type: "poison", label: "POI", color: "#78d46b", glow: "#315f29", ring: "bubble" }),
  slow: Object.freeze({ type: "slow", label: "SLW", color: "#70b7ff", glow: "#244c80", ring: "drag" }),
  blind: Object.freeze({ type: "blind", label: "BLD", color: "#f0d77a", glow: "#705f1e", ring: "blink" }),
  silence: Object.freeze({ type: "silence", label: "SIL", color: "#c89cff", glow: "#553276", ring: "mute" }),
  stun: Object.freeze({ type: "stun", label: "STN", color: "#ffe45e", glow: "#7a6310", ring: "jolt" })
});

// Witch Doctor stances — the "Dancing Man" passive. Each stance gets a persistent
// on-board badge (unitRenderer.js) + a HUD tag color, keyed by the SAME `stance` id
// the catalog data (witch-doctor.js) and rules/stances.js already use. Adding a future
// stance-bearing unit just needs an entry here — nothing else hard-codes these ids.
const STANCE_VFX = Object.freeze({
  rain: Object.freeze({ label: "Rain Stance", glyph: "\u{1F327}", color: "#6fb7f2", glow: "#1f4a72" }),
  fire: Object.freeze({ label: "Fire Stance", glyph: "\u{1F525}", color: "#ff8a4c", glow: "#7a2c10" }),
  spirit: Object.freeze({ label: "Spirit Stance", glyph: "\u{1F47B}", color: "#bff4d2", glow: "#2e6b4a" }),
  misfortune: Object.freeze({ label: "Misfortune Stance", glyph: "\u{1F408}‍⬛", color: "#c89cff", glow: "#3a1d5c" }),
  blackDeath: Object.freeze({ label: "Black Death Stance", glyph: "☠", color: "#e2536e", glow: "#3a0812" })
});

// Real projectile specs consumed by effects.js's flight primitive. `shape` picks the
// built figure: "arrow" (shaft + head, rotates to heading), "orb" (glowing magic
// bolt with a mote tail), "tracer" (a flat, fast rifle streak), "lob" (a tumbling
// cigar/smoke canister), "rock" (an irregular boulder on a high arc). Every ranged BASIC attack resolves its projectile
// here by unit type; rolled attack ARTS override it via their recipe's `projectile`.
const ATTACK_PROJECTILES = Object.freeze({
  archer: Object.freeze({ shape: "arrow", arcHeight: 62, durationMs: 430, size: 1, colors: Object.freeze({ core: "#f2e4b8", trail: "#8a6d3a" }) }),
  sniper: Object.freeze({ shape: "tracer", arcHeight: 8, durationMs: 230, size: 1, colors: Object.freeze({ core: "#ffd9a0", trail: "#c0653a" }) }),
  magician: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 430, size: 1, colors: Object.freeze({ core: "#a0c8ff", trail: "#4488dd" }) }),
  summoner: Object.freeze({ shape: "orb", arcHeight: 48, durationMs: 440, size: 1, colors: Object.freeze({ core: "#cbb8ff", trail: "#553276" }) }),
  mystic: Object.freeze({ shape: "orb", arcHeight: 50, durationMs: 460, size: 0.9, colors: Object.freeze({ core: "#bff4d2", trail: "#64d99a" }) }),
  necromancer: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 450, size: 1, colors: Object.freeze({ core: "#9be08a", trail: "#38256f" }) }),
  nemesis: Object.freeze({ shape: "orb", arcHeight: 44, durationMs: 420, size: 1.1, colors: Object.freeze({ core: "#c89cff", trail: "#241030" }) }),
  // Angel is a bow user — a radiant, gold-white blessed arrow (its magic tint reads holy).
  angel: Object.freeze({ shape: "arrow", arcHeight: 58, durationMs: 430, size: 1, colors: Object.freeze({ core: "#fff2a8", trail: "#d8c078" }) }),
  "fat-bowman": Object.freeze({ shape: "arrow", arcHeight: 64, durationMs: 450, size: 1.08, colors: Object.freeze({ core: "#ffd9a0", trail: "#8a5a30" }) }),
  miner: Object.freeze({ shape: "rock", arcHeight: 48, durationMs: 420, size: 0.75, colors: Object.freeze({ core: "#d8b35e", trail: "#6b5630" }) }),
  "big-brother": Object.freeze({ shape: "tracer", arcHeight: 10, durationMs: 280, size: 1.25, colors: Object.freeze({ core: "#8ed6e8", trail: "#395d68" }) }),
  "little-brother": Object.freeze({ shape: "tracer", arcHeight: 24, durationMs: 320, size: 1.15, colors: Object.freeze({ core: "#ffca8a", trail: "#8a3a22" }) })
});

const DEFAULT_ATTACK_PROJECTILE = Object.freeze({
  shape: "orb",
  arcHeight: 50,
  durationMs: 430,
  size: 1,
  colors: Object.freeze({ core: "#f7e27d", trail: "#8a6d3a" })
});

const ABILITY_VFX = Object.freeze({
  footwork: Object.freeze({
    type: "dashTrail",
    soundKey: "footwork",
    durationMs: 760,
    stepMs: 190,
    afterimageCount: 4,
    sparkCount: 10,
    colors: Object.freeze({ core: "#f8f2c0", trail: "#7fd7ff", impact: "#fff1a6" })
  }),
  stumble: Object.freeze({
    type: "dashTrail",
    soundKey: "footwork",
    durationMs: 820,
    stepMs: 170,
    afterimageCount: 3,
    sparkCount: 12,
    colors: Object.freeze({ core: "#fff0a8", trail: "#d7c07f", impact: "#ffd074" })
  }),
  fart: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    radius: 1,
    ringCount: 2,
    particleCount: 16,
    colors: Object.freeze({ core: "#b7e878", trail: "#6b8f35", impact: "#e4ff9a" })
  }),
  zap: Object.freeze({
    type: "projectileFan",
    soundKey: "spark",
    projectileCount: 1,
    spread: 0,
    arcHeight: 48,
    staggerMs: 0,
    durationMs: 390,
    impactRadius: 22,
    windup: Object.freeze({ style: "gather", durationMs: 260, particleCount: 7 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 44, durationMs: 390, size: 1.05, colors: Object.freeze({ core: "#f7e27d", trail: "#7a5aa8" }) }),
    colors: Object.freeze({ core: "#f7e27d", trail: "#7a5aa8", impact: "#fff3b0" })
  }),
  study: Object.freeze({
    type: "statusStrike",
    soundKey: "age",
    motif: "silenceRune",
    runeCount: 3,
    particleCount: 10,
    windup: Object.freeze({ style: "gather", durationMs: 300, particleCount: 6 }),
    castProjectile: Object.freeze({ shape: "orb", arcHeight: 42, durationMs: 410, size: 0.9, colors: Object.freeze({ core: "#f2d98a", trail: "#6a4a8a" }) }),
    colors: Object.freeze({ core: "#f2d98a", trail: "#6a4a8a", impact: "#fff0c0" })
  }),
  surge: Object.freeze({
    type: "healPulse",
    soundKey: "pray",
    particleCount: 10,
    radius: 30,
    durationMs: 560,
    windup: Object.freeze({ style: "gather", durationMs: 300, particleCount: 7 }),
    colors: Object.freeze({ core: "#8cf0d0", trail: "#2a8a72", impact: "#e0fff8" })
  }),
  "relay-power": Object.freeze({
    type: "healPulse",
    soundKey: "recharge",
    particleCount: 8,
    radius: 26,
    durationMs: 500,
    colors: Object.freeze({ core: "#a0c8ff", trail: "#4c6fb0", impact: "#e0f0ff" })
  }),
  "volley-shot": Object.freeze({
    type: "volleyRain",
    staggerMs: 65,
    durationMs: 380,
    arcHeight: 60,
    projectile: Object.freeze({ shape: "arrow", size: 0.8, colors: Object.freeze({ core: "#f2e4b8", trail: "#8a6d3a" }) }),
    colors: Object.freeze({ core: "#f7e27d", trail: "#8aacac", impact: "#fff1a6" })
  }),
  "life-sap": Object.freeze({
    type: "drain",
    soundKey: "lifeSap",
    particleCount: 18,
    durationMs: 680,
    staggerMs: 18,
    curveHeight: 54,
    // Signature: a pulsing life-tether arcs between victim and drinker while the
    // motes travel it, and the drinker pulses as the stolen life lands.
    tether: true,
    colors: Object.freeze({ core: "#8cf0a4", trail: "#3fbf86", impact: "#d8ffd6" })
  }),
  "poison-arrow": Object.freeze({
    type: "statusStrike",
    soundKey: "poisonArrow",
    status: "poison",
    motif: "venom",
    particleCount: 14,
    // `projectile` = the ATTACK travel (flown by animateAttack in place of the unit's
    // basic-attack projectile); the venom motif then blooms from the arrow that landed.
    projectile: Object.freeze({ shape: "arrow", arcHeight: 62, durationMs: 430, size: 1, colors: Object.freeze({ core: "#a8ff91", trail: "#315f29" }) }),
    colors: Object.freeze({ core: "#78d46b", trail: "#315f29", impact: "#a8ff91" })
  }),
  "curve-shot": Object.freeze({
    type: "statusStrike",
    soundKey: "poisonArrow",
    motif: "impact",
    particleCount: 8,
    projectile: Object.freeze({ shape: "arrow", arcHeight: 76, durationMs: 460, size: 1.08, colors: Object.freeze({ core: "#ffd9a0", trail: "#8a5a30" }) }),
    colors: Object.freeze({ core: "#ffd9a0", trail: "#8a5a30", impact: "#fff0c8" })
  }),
  dragonsbane: Object.freeze({
    type: "statusStrike",
    soundKey: "poisonArrow",
    status: "poison",
    motif: "venom",
    particleCount: 16,
    projectile: Object.freeze({ shape: "arrow", arcHeight: 66, durationMs: 450, size: 1.12, colors: Object.freeze({ core: "#c6ff9e", trail: "#2f6b1f" }) }),
    colors: Object.freeze({ core: "#78d46b", trail: "#2f6b1f", impact: "#c6ff9e" })
  }),
  "leg-shot": Object.freeze({
    type: "statusStrike",
    soundKey: "slowApplied",
    status: "slow",
    motif: "snare",
    ringCount: 3,
    projectile: Object.freeze({ shape: "arrow", arcHeight: 40, durationMs: 380, size: 1, colors: Object.freeze({ core: "#c9e6ff", trail: "#244c80" }) }),
    colors: Object.freeze({ core: "#70b7ff", trail: "#244c80", impact: "#c9e6ff" })
  }),
  moonstrike: Object.freeze({
    type: "statusStrike",
    soundKey: "blindApplied",
    status: "blind",
    motif: "moon",
    particleCount: 9,
    colors: Object.freeze({ core: "#f0d77a", trail: "#705f1e", impact: "#fff2a8" })
  }),
  "mage-killer": Object.freeze({
    type: "statusStrike",
    soundKey: "silenceApplied",
    status: "silence",
    motif: "silenceRune",
    runeCount: 4,
    colors: Object.freeze({ core: "#c89cff", trail: "#553276", impact: "#ead6ff" })
  }),
  silence: Object.freeze({
    type: "statusStrike",
    soundKey: "silenceApplied",
    status: "silence",
    motif: "silenceRune",
    runeCount: 5,
    // `windup` = caster anticipation played before the release ("gather" pulls motes
    // into the caster with a swelling core + castCharge riser; "toss" leans the token
    // back for a beat then snaps it forward). The ability's own sound fires at release.
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 8 }),
    // `castProjectile` = travel played INSIDE statusStrike (pure casts have no attack
    // phase, so the hush glides from the Mystic before the runes seal the target).
    castProjectile: Object.freeze({ shape: "orb", arcHeight: 54, durationMs: 480, size: 0.9, colors: Object.freeze({ core: "#c89cff", trail: "#553276" }) }),
    colors: Object.freeze({ core: "#c89cff", trail: "#553276", impact: "#ead6ff" })
  }),
  "smoke-bomb": Object.freeze({
    type: "statusStrike",
    soundKey: "smokeBomb",
    status: "blind",
    motif: "smoke",
    puffCount: 7,
    windup: Object.freeze({ style: "toss" }),
    castProjectile: Object.freeze({ shape: "lob", arcHeight: 76, durationMs: 560, size: 1, colors: Object.freeze({ core: "#d8d3c8", trail: "#8a8478" }) }),
    colors: Object.freeze({ core: "#d8d3c8", trail: "#8a8478", impact: "#ece8de" })
  }),
  spark: Object.freeze({
    type: "projectileFan",
    soundKey: "spark",
    projectileCount: 1,
    spread: 0,
    arcHeight: 52,
    staggerMs: 0,
    durationMs: 400,
    impactRadius: 20,
    windup: Object.freeze({ style: "gather", durationMs: 300, particleCount: 7 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 400, size: 1.1, colors: Object.freeze({ core: "#a0c8ff", trail: "#4488dd" }) }),
    colors: Object.freeze({ core: "#a0c8ff", trail: "#4488dd", impact: "#d8eeff" })
  }),
  flee: Object.freeze({
    type: "dashTrail",
    soundKey: "flee",
    durationMs: 380,
    afterimageCount: 2,
    sparkCount: 8,
    colors: Object.freeze({ core: "#e0c0ff", trail: "#9958d8", impact: "#f0e0ff" })
  }),
  dematerialize: Object.freeze({
    type: "dashTrail",
    soundKey: "flee",
    durationMs: 420,
    afterimageCount: 3,
    sparkCount: 12,
    colors: Object.freeze({ core: "#d8ccff", trail: "#553276", impact: "#f2ecff" })
  }),
  banish: Object.freeze({
    type: "statusStrike",
    soundKey: "banish",
    status: "silence",
    motif: "silenceRune",
    runeCount: 4,
    particleCount: 14,
    windup: Object.freeze({ style: "gather", durationMs: 460, particleCount: 10 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 58, durationMs: 470, size: 1.3, colors: Object.freeze({ core: "#9966ff", trail: "#4422aa" }) }),
    colors: Object.freeze({ core: "#9966ff", trail: "#4422aa", impact: "#ccaaff" })
  }),
  nuke: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 3,
    shake: 12,
    particleCount: 26,
    radius: 48,
    durationMs: 720,
    // The rage ultimate earns the longest, heaviest gather in the game — and the
    // full signature detonation: whole-board bloom at release, a light pillar at
    // the epicenter, and a scorch afterglow that lingers on the ground.
    windup: Object.freeze({ style: "gather", durationMs: 560, particleCount: 14 }),
    boardFlash: true,
    pillar: true,
    afterglow: true,
    colors: Object.freeze({ core: "#9966ff", trail: "#4422aa", impact: "#ccaaff" })
  }),
  "dark-bomb": Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    // A self-centred detonation, not a single bolt: implosion → shockwave → debris,
    // with the ground ring sweeping the whole 2-tile blast footprint (blastTiles).
    blast: true,
    blastTiles: 2,
    shake: 10,
    particleCount: 24,
    radius: 46,
    durationMs: 700,
    windup: Object.freeze({ style: "gather", durationMs: 500, particleCount: 12 }),
    // Scorch lingers, but no pillar/board bloom — those stay Nuke's signature.
    afterglow: true,
    colors: Object.freeze({ core: "#b48cff", trail: "#2a1746", impact: "#9be08a" })
  }),
  "throw-cigar": Object.freeze({
    // A tossed, tumbling cigar on a high lob that lands where the fire ignites.
    type: "lob",
    soundKey: "throwCigar",
    impactKind: "fire",
    windup: Object.freeze({ style: "toss" }),
    projectile: Object.freeze({ shape: "lob", arcHeight: 82, durationMs: 600, size: 0.9, colors: Object.freeze({ core: "#ffb45e", trail: "#8a5a30" }) }),
    colors: Object.freeze({ core: "#ffb45e", trail: "#8a5a30", impact: "#ffd9a0" })
  }),
  "summon-ghoul": Object.freeze({
    // Signature: the grave-rising. The necromancer gathers, a dark stream pours
    // into the chosen tile, a summoning circle contracts, soil bursts upward, a
    // wraith silhouette climbs out, and lingering miasma masks the ghoul's arrival.
    type: "summonRise",
    soundKey: "darkseeker",
    soilCount: 8,
    miasmaCount: 6,
    riseDurationMs: 520,
    windup: Object.freeze({ style: "gather", durationMs: 460, particleCount: 10 }),
    stream: Object.freeze({ shape: "orb", arcHeight: 32, durationMs: 400, size: 1.1, colors: Object.freeze({ core: "#9be08a", trail: "#244d1f" }) }),
    colors: Object.freeze({ core: "#9be08a", trail: "#244d1f", impact: "#e8ffd6" })
  }),
  summon: Object.freeze({
    type: "summonRise",
    soundKey: "darkseeker",
    soilCount: 4,
    miasmaCount: 10,
    riseDurationMs: 520,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 10 }),
    stream: Object.freeze({ shape: "orb", arcHeight: 34, durationMs: 420, size: 1.1, colors: Object.freeze({ core: "#d8ccff", trail: "#553276" }) }),
    colors: Object.freeze({ core: "#cbb8ff", trail: "#553276", impact: "#f2ecff" })
  }),
  beckon: Object.freeze({
    type: "summonRise",
    soundKey: "rageActivated",
    soilCount: 5,
    miasmaCount: 14,
    riseDurationMs: 600,
    windup: Object.freeze({ style: "gather", durationMs: 520, particleCount: 14 }),
    stream: Object.freeze({ shape: "orb", arcHeight: 38, durationMs: 470, size: 1.25, colors: Object.freeze({ core: "#ffb0f0", trail: "#5a1d76" }) }),
    colors: Object.freeze({ core: "#ffb0f0", trail: "#5a1d76", impact: "#ffe6ff" })
  }),
  wither: Object.freeze({
    type: "statusStrike",
    soundKey: "slowApplied",
    status: "slow",
    motif: "snare",
    ringCount: 3,
    windup: Object.freeze({ style: "gather", durationMs: 400, particleCount: 8 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 50, durationMs: 450, size: 1, colors: Object.freeze({ core: "#9b8cff", trail: "#2a1746" }) }),
    colors: Object.freeze({ core: "#9b8cff", trail: "#2a1746", impact: "#cdbcff" })
  }),
  // Virus — Cough flies a toxic orb that poisons on the roll; the three globals are
  // self-centred green bursts (Smog blind cloud, Poison Tick convulsion, Explosion).
  cough: Object.freeze({
    type: "statusStrike",
    soundKey: "poisonArrow",
    status: "poison",
    motif: "venom",
    particleCount: 14,
    windup: Object.freeze({ style: "gather", durationMs: 340, particleCount: 8 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 52, durationMs: 440, size: 1.1, colors: Object.freeze({ core: "#9be86b", trail: "#2f6b1f" }) }),
    colors: Object.freeze({ core: "#78d46b", trail: "#2f6b1f", impact: "#c6ff9e" })
  }),
  smog: Object.freeze({
    type: "magicBurst",
    soundKey: "smokeBomb",
    particleCount: 20,
    radius: 46,
    durationMs: 620,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 8 }),
    colors: Object.freeze({ core: "#a8b89a", trail: "#3d4a34", impact: "#d7e0c8" })
  }),
  "poison-tick": Object.freeze({
    type: "magicBurst",
    soundKey: "poisonArrow",
    particleCount: 14,
    radius: 32,
    durationMs: 500,
    colors: Object.freeze({ core: "#9be86b", trail: "#2f6b1f", impact: "#c6ff9e" })
  }),
  explosion: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 2,
    shake: 12,
    particleCount: 24,
    radius: 46,
    durationMs: 700,
    windup: Object.freeze({ style: "gather", durationMs: 300, particleCount: 10 }),
    afterglow: true,
    colors: Object.freeze({ core: "#9be86b", trail: "#2f6b1f", impact: "#e6ffcc" })
  }),
  lightseeker: Object.freeze({
    type: "magicBurst",
    soundKey: "lightseeker",
    particleCount: 14,
    radius: 44,
    durationMs: 560,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 8 }),
    colors: Object.freeze({ core: "#f7e27d", trail: "#d8eeff", impact: "#fff7b8" })
  }),
  darkseeker: Object.freeze({
    type: "magicBurst",
    soundKey: "darkseeker",
    particleCount: 16,
    radius: 50,
    durationMs: 620,
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 9 }),
    colors: Object.freeze({ core: "#9b8cff", trail: "#38256f", impact: "#d6c8ff" })
  }),
  "hand-of-life": Object.freeze({
    type: "healPulse",
    soundKey: "handOfLife",
    particleCount: 9,
    radius: 30,
    durationMs: 560,
    // Kept short — it's a passive proc riding a turn rollover, not a chosen cast.
    windup: Object.freeze({ style: "gather", durationMs: 300, particleCount: 6 }),
    colors: Object.freeze({ core: "#f7e27d", trail: "#c8962a", impact: "#fffbe0" })
  }),
  pray: Object.freeze({
    type: "healPulse",
    soundKey: "pray",
    particleCount: 10,
    radius: 34,
    durationMs: 620,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 8 }),
    colors: Object.freeze({ core: "#bff4d2", trail: "#64d99a", impact: "#f7ffd8" })
  }),
  wish: Object.freeze({
    type: "healPulse",
    soundKey: "wish",
    particleCount: 7,
    radius: 24,
    durationMs: 520,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 6 }),
    colors: Object.freeze({ core: "#dfffd8", trail: "#8cf0a4", impact: "#fff7b8" })
  }),
  purify: Object.freeze({
    type: "projectileFan",
    soundKey: "pray",
    projectileCount: 1,
    spread: 0,
    arcHeight: 52,
    staggerMs: 0,
    durationMs: 460,
    impactRadius: 24,
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 8 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 52, durationMs: 460, size: 1, colors: Object.freeze({ core: "#dfffd8", trail: "#64d99a" }) }),
    colors: Object.freeze({ core: "#dfffd8", trail: "#64d99a", impact: "#ffffff" })
  }),
  // Fat Cleric — Hope: a warm radiant heal-pulse washing over the whole nearby squad.
  hope: Object.freeze({
    type: "healPulse",
    soundKey: "pray",
    particleCount: 11,
    radius: 36,
    durationMs: 620,
    windup: Object.freeze({ style: "gather", durationMs: 400, particleCount: 8 }),
    colors: Object.freeze({ core: "#ffe9b0", trail: "#f0c874", impact: "#fff7d8" })
  }),
  // Fat Cleric — Cleanse: a clean gold-white mote that lifts the negative statuses off.
  cleanse: Object.freeze({
    type: "projectileFan",
    soundKey: "pray",
    projectileCount: 1,
    spread: 0,
    arcHeight: 52,
    staggerMs: 0,
    durationMs: 460,
    impactRadius: 24,
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 8 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 52, durationMs: 460, size: 1, colors: Object.freeze({ core: "#fff2c0", trail: "#e0b45a" }) }),
    colors: Object.freeze({ core: "#fff2c0", trail: "#e0b45a", impact: "#ffffff" })
  }),
  // Fat Cleric — Focus Prayer: a focused single-target radiant heal-pulse.
  "focus-prayer": Object.freeze({
    type: "healPulse",
    soundKey: "wish",
    particleCount: 9,
    radius: 28,
    durationMs: 560,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 7 }),
    colors: Object.freeze({ core: "#ffe9b0", trail: "#e6b45a", impact: "#fffbe0" })
  }),
  // Witch Doctor dances — every dance is a GLOBAL effect (a team-wide or board-wide
  // ritual, never a single-target cast), so they share one recipe type ("ritual"):
  // a long gather on the dancer, a whole-board color wash, a rippling ring that
  // sweeps past the edges of any board size, and a beacon pulse that arrives at
  // every affected tile staggered by distance from the dancer — the wave visibly
  // propagates outward instead of just appearing everywhere at once.
  "rain-dance": Object.freeze({
    type: "ritual",
    soundKey: "pray",
    durationMs: 900,
    particleCount: 16,
    windup: Object.freeze({ style: "gather", durationMs: 460, particleCount: 10 }),
    colors: Object.freeze({ core: "#6fb7f2", trail: "#1f4a72", impact: "#e6f4ff" })
  }),
  "fire-dance": Object.freeze({
    type: "ritual",
    soundKey: "rageActivated",
    durationMs: 860,
    particleCount: 18,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 10 }),
    colors: Object.freeze({ core: "#ff8a4c", trail: "#7a2c10", impact: "#ffe0b8" })
  }),
  "spirit-dance": Object.freeze({
    type: "ritual",
    soundKey: "handOfLife",
    durationMs: 860,
    particleCount: 16,
    windup: Object.freeze({ style: "gather", durationMs: 400, particleCount: 9 }),
    colors: Object.freeze({ core: "#bff4d2", trail: "#2e6b4a", impact: "#eafff0" })
  }),
  "misfortune-dance": Object.freeze({
    type: "ritual",
    soundKey: "banish",
    durationMs: 940,
    particleCount: 18,
    windup: Object.freeze({ style: "gather", durationMs: 480, particleCount: 11 }),
    colors: Object.freeze({ core: "#c89cff", trail: "#3a1d5c", impact: "#241030" })
  }),
  "black-death-dance": Object.freeze({
    type: "ritual",
    soundKey: "nuke",
    durationMs: 980,
    particleCount: 22,
    shake: 8,
    windup: Object.freeze({ style: "gather", durationMs: 520, particleCount: 13 }),
    colors: Object.freeze({ core: "#e2536e", trail: "#3a0812", impact: "#ff9fb0" })
  }),
  // Father Time — Age: a slow amber time-mote glides to the target (a gather winds it
  // up first), then a soft impact where the ±stat float lands. Ally buff / enemy drain
  // share the motif; the color of the float (set in main.js) tells them apart.
  age: Object.freeze({
    type: "projectileFan",
    soundKey: "age",
    projectileCount: 1,
    spread: 0,
    arcHeight: 44,
    staggerMs: 0,
    durationMs: 460,
    impactRadius: 18,
    windup: Object.freeze({ style: "gather", durationMs: 320, particleCount: 7 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 44, durationMs: 460, size: 1, colors: Object.freeze({ core: "#f2d98a", trail: "#8a6a2a" }) }),
    colors: Object.freeze({ core: "#f2d98a", trail: "#8a6a2a", impact: "#fff0c0" })
  }),
  // Time Stretch: a teal chrono-mote flicks to the target (haste on an ally, slow on an
  // enemy). No windup — it's a quick tempo tweak, not a heavy cast.
  "time-stretch": Object.freeze({
    type: "projectileFan",
    soundKey: "timeStretch",
    projectileCount: 1,
    spread: 0,
    arcHeight: 48,
    staggerMs: 0,
    durationMs: 420,
    impactRadius: 18,
    projectile: Object.freeze({ shape: "orb", arcHeight: 48, durationMs: 420, size: 1, colors: Object.freeze({ core: "#7fe0d0", trail: "#2a6a66" }) }),
    colors: Object.freeze({ core: "#7fe0d0", trail: "#2a6a66", impact: "#d8fff8" })
  }),
  // Juggernaut — Tether Grab: a metallic grapple-line snaps out to the caught unit (the
  // haul-in itself is the target's slide, animated in main.js), then a soft magic tick.
  "tether-grab": Object.freeze({
    type: "projectileFan",
    soundKey: "tetherGrab",
    projectileCount: 1,
    spread: 0,
    arcHeight: 18,
    staggerMs: 0,
    durationMs: 300,
    impactRadius: 16,
    projectile: Object.freeze({ shape: "tracer", arcHeight: 12, durationMs: 300, size: 1.1, colors: Object.freeze({ core: "#d0d4dc", trail: "#6a6f78" }) }),
    colors: Object.freeze({ core: "#d0d4dc", trail: "#6a6f78", impact: "#e8ecf2" })
  }),
  // Rocket Punch: a heavy piston-fist rockets down the line and slams the first enemy.
  "rocket-punch": Object.freeze({
    type: "projectileFan",
    soundKey: "rocketPunch",
    projectileCount: 1,
    spread: 0,
    arcHeight: 10,
    staggerMs: 0,
    durationMs: 260,
    impactRadius: 26,
    projectile: Object.freeze({ shape: "tracer", arcHeight: 6, durationMs: 260, size: 1.6, colors: Object.freeze({ core: "#ffca8a", trail: "#8a5230" }) }),
    colors: Object.freeze({ core: "#ffca8a", trail: "#c0653a", impact: "#ffe0b0" })
  }),
  // Recharge: the reactor vents — a blue power-pulse over the Juggernaut itself.
  recharge: Object.freeze({
    type: "healPulse",
    soundKey: "recharge",
    particleCount: 10,
    radius: 30,
    durationMs: 520,
    colors: Object.freeze({ core: "#8cc8ff", trail: "#3f7fd0", impact: "#e0f0ff" })
  }),
  // Self Destruct (RAGE): a full core overload — board bloom, screen shake, a 4-tile
  // shockwave, and a lingering scorch where the Juggernaut stood.
  "self-destruct": Object.freeze({
    type: "magicBurst",
    soundKey: "selfDestruct",
    blast: true,
    blastTiles: 4,
    shake: 14,
    particleCount: 28,
    radius: 54,
    durationMs: 760,
    boardFlash: true,
    afterglow: true,
    colors: Object.freeze({ core: "#ffe6a0", trail: "#c0451f", impact: "#ffffff" })
  }),
  // Rewind (RAGE): a golden life-stream pours into the placement tile and the fallen
  // ally rises from it — reuses the summon-rise signature with a warm, hopeful palette.
  rewind: Object.freeze({
    type: "summonRise",
    soundKey: "rewind",
    soilCount: 6,
    miasmaCount: 6,
    riseDurationMs: 560,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 10 }),
    stream: Object.freeze({ shape: "orb", arcHeight: 34, durationMs: 420, size: 1.1, colors: Object.freeze({ core: "#f7e9c0", trail: "#c8a24a" }) }),
    colors: Object.freeze({ core: "#f7e9c0", trail: "#c8a24a", impact: "#fff7d8" })
  }),
  // The King's four commands (Strike / Hold / Pursue / Higher Ground). Each is a GLOBAL
  // team order — a decisive battlefield command radiating from the King's banner to every
  // squadmate — so they reuse the `ritual` motif (a color wash, a ring that ripples past
  // any board size, and a beacon pulse landing on each ally, staggered by distance). A
  // short, sharp gather (the King raising his hand) precedes the release; the per-command
  // color keys the buff it grants: crimson STR / steel DEF / green MOVE / gold range.
  strike: Object.freeze({
    type: "ritual",
    soundKey: "rageActivated",
    durationMs: 720,
    particleCount: 14,
    shake: 4,
    windup: Object.freeze({ style: "gather", durationMs: 260, particleCount: 7 }),
    colors: Object.freeze({ core: "#ff6a5c", trail: "#7a2118", impact: "#ffd0c8" })
  }),
  hold: Object.freeze({
    type: "ritual",
    soundKey: "defend",
    durationMs: 720,
    particleCount: 14,
    windup: Object.freeze({ style: "gather", durationMs: 260, particleCount: 7 }),
    colors: Object.freeze({ core: "#8cc0f0", trail: "#25507a", impact: "#dbeeff" })
  }),
  pursue: Object.freeze({
    type: "ritual",
    soundKey: "footwork",
    durationMs: 700,
    particleCount: 14,
    windup: Object.freeze({ style: "gather", durationMs: 240, particleCount: 6 }),
    colors: Object.freeze({ core: "#8fe08a", trail: "#2a6b32", impact: "#e0ffd8" })
  }),
  "higher-ground": Object.freeze({
    type: "ritual",
    soundKey: "pray",
    durationMs: 720,
    particleCount: 14,
    windup: Object.freeze({ style: "gather", durationMs: 260, particleCount: 7 }),
    colors: Object.freeze({ core: "#f2d472", trail: "#8a6a1e", impact: "#fff3c8" })
  }),
  "front-kick": Object.freeze({
    type: "statusStrike",
    soundKey: "attackHit",
    motif: "impact",
    particleCount: 8,
    colors: Object.freeze({ core: "#f0e0b0", trail: "#7a5a30", impact: "#fff1c8" })
  }),
  protect: Object.freeze({
    type: "healPulse",
    soundKey: "defend",
    particleCount: 8,
    radius: 28,
    durationMs: 460,
    colors: Object.freeze({ core: "#d8ecff", trail: "#557ca8", impact: "#f5fbff" })
  }),
  // Angel — Anoint: a warm gold blessing-mote glides to the ally (a quick tempo cast, no
  // heavy gather), then a soft impact where the +1 range float lands.
  anoint: Object.freeze({
    type: "projectileFan",
    soundKey: "handOfLife",
    projectileCount: 1,
    spread: 0,
    arcHeight: 46,
    staggerMs: 0,
    durationMs: 440,
    impactRadius: 18,
    projectile: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 440, size: 1, colors: Object.freeze({ core: "#fff2a8", trail: "#c8a24a" }) }),
    colors: Object.freeze({ core: "#fff2a8", trail: "#c8a24a", impact: "#fff7d8" })
  }),
  // Angel — Elevate: a soft radiant heal-pulse washing over the white-tile allies.
  elevate: Object.freeze({
    type: "healPulse",
    soundKey: "pray",
    particleCount: 10,
    radius: 32,
    durationMs: 560,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 7 }),
    colors: Object.freeze({ core: "#fff2c0", trail: "#d8b45a", impact: "#fffbe0" })
  }),
  // Angel — Heavenseeker (RAGE): a holy burst sweeping every white tile — the seeker
  // motif (like Light/Darkseeker) in a radiant gold-white palette.
  heavenseeker: Object.freeze({
    type: "magicBurst",
    soundKey: "lightseeker",
    particleCount: 18,
    radius: 52,
    durationMs: 640,
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 9 }),
    colors: Object.freeze({ core: "#fff2a8", trail: "#f0e0b0", impact: "#ffffff" })
  }),
  // Gargoyle — Flight: a heavy stone-winged surge from origin to landing tile (a motion
  // art, so no windup), trailing dust; the landing blast is floated by main.js.
  flight: Object.freeze({
    type: "dashTrail",
    soundKey: "flee",
    durationMs: 420,
    afterimageCount: 3,
    sparkCount: 10,
    colors: Object.freeze({ core: "#d8cdbc", trail: "#8a8478", impact: "#f0e6d0" })
  }),
  // Gargoyle — Pyroclasm: a self-centred eruption of molten fire along the rays. A short
  // gather (the stone drawing heat inward) precedes the burst; fiery palette + shake.
  pyroclasm: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 3,
    shake: 9,
    particleCount: 22,
    radius: 50,
    durationMs: 680,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 11 }),
    colors: Object.freeze({ core: "#ff8a4c", trail: "#7a2c10", impact: "#ffd9a0" })
  }),
  "dark-pulse": Object.freeze({
    type: "darkPulseScatter",
    soundKey: "darkseeker",
    shake: 8,
    particleCount: 4,
    durationMs: 520,
    staggerMs: 22,
    windup: Object.freeze({ style: "gather", durationMs: 420, particleCount: 12 }),
    projectile: Object.freeze({ shape: "orb", arcHeight: 14, durationMs: 430, size: 1.05, colors: Object.freeze({ core: "#c89cff", trail: "#241030" }) }),
    colors: Object.freeze({ core: "#c89cff", trail: "#241030", impact: "#ead6ff" })
  }),
  "realm-traversal": Object.freeze({
    type: "dashTrail",
    soundKey: "flee",
    durationMs: 430,
    afterimageCount: 3,
    sparkCount: 12,
    colors: Object.freeze({ core: "#c89cff", trail: "#3a1d5c", impact: "#ead6ff" })
  }),
  // Clod — Quake: a self-centred ground slam. A short gather (stone drawing in) then an
  // earthen shockwave rippling out. Dusty tan/moss palette.
  quake: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    shake: 8,
    particleCount: 20,
    radius: 46,
    durationMs: 640,
    windup: Object.freeze({ style: "gather", durationMs: 340, particleCount: 9 }),
    colors: Object.freeze({ core: "#c8b06a", trail: "#5a4a2a", impact: "#e6d8a8" })
  }),
  // Clod — Stone Throw: a heaved boulder that tumbles on a high arc (toss windup), landing
  // a heavy physical impact. Its impact/floats are driven by resolveCombat.
  "stone-throw": Object.freeze({
    type: "statusStrike",
    soundKey: "attackHit",
    motif: "impact",
    windup: Object.freeze({ style: "toss" }),
    projectile: Object.freeze({ shape: "rock", arcHeight: 72, durationMs: 540, size: 1.2, colors: Object.freeze({ core: "#9a8c70", trail: "#5a4c38" }) }),
    colors: Object.freeze({ core: "#b7a888", trail: "#5a4c38", impact: "#d8ccb0" })
  }),
  // Clod — Thunderous Charge (RAGE): a full ground-shattering slam — board bloom, screen
  // shake, a 2-tile shockwave, and a lingering scorch, in a stony tan palette.
  "thunderous-charge": Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 2,
    shake: 12,
    particleCount: 24,
    radius: 50,
    durationMs: 720,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 10 }),
    boardFlash: true,
    afterglow: true,
    colors: Object.freeze({ core: "#c9b37a", trail: "#5a4326", impact: "#efe0b0" })
  }),
  "ore-harvest": Object.freeze({
    type: "healPulse",
    soundKey: "recharge",
    particleCount: 10,
    radius: 28,
    durationMs: 520,
    colors: Object.freeze({ core: "#d8b35e", trail: "#6b5630", impact: "#fff0b8" })
  }),
  "ore-abundance": Object.freeze({
    type: "healPulse",
    soundKey: "recharge",
    particleCount: 16,
    radius: 34,
    durationMs: 640,
    windup: Object.freeze({ style: "gather", durationMs: 320, particleCount: 9 }),
    colors: Object.freeze({ core: "#8ed6e8", trail: "#5d6b7a", impact: "#ffffff" })
  }),
  headlamp: Object.freeze({
    type: "statusStrike",
    soundKey: "blindApplied",
    status: "blind",
    motif: "blink",
    particleCount: 10,
    colors: Object.freeze({ core: "#f0d77a", trail: "#705f1e", impact: "#fff2a8" })
  }),
  "shaft-prop": Object.freeze({
    type: "magicBurst",
    soundKey: "buildCover",
    particleCount: 10,
    radius: 26,
    durationMs: 460,
    colors: Object.freeze({ core: "#c8a46a", trail: "#5a4630", impact: "#f0d8a0" })
  }),
  "blasting-cap": Object.freeze({
    type: "statusStrike",
    soundKey: "nuke",
    motif: "impact",
    particleCount: 12,
    windup: Object.freeze({ style: "toss" }),
    projectile: Object.freeze({ shape: "lob", arcHeight: 70, durationMs: 500, size: 0.8, colors: Object.freeze({ core: "#d8b35e", trail: "#5a4630" }) }),
    colors: Object.freeze({ core: "#d8b35e", trail: "#6b5630", impact: "#fff0b8" })
  }),
  // Riot Cop — Stun Gun: an electric dart tracer, no windup (a quick snap shot). Its
  // impact/floats + the STUN/SLOW readout are driven by resolveCombat.
  "stun-gun": Object.freeze({
    type: "statusStrike",
    soundKey: "spark",
    motif: "impact",
    projectile: Object.freeze({ shape: "tracer", arcHeight: 12, durationMs: 300, size: 0.9, colors: Object.freeze({ core: "#8fe6ff", trail: "#2f6fae" }) }),
    colors: Object.freeze({ core: "#8fe6ff", trail: "#2f6fae", impact: "#dff6ff" })
  }),
  // Riot Cop — Smoke Bomb: a canister lobbed at a tile that bursts into a blinding cloud.
  "smoke-bomb-riot": Object.freeze({
    type: "lob",
    soundKey: "smokeBomb",
    motif: "smoke",
    puffCount: 10,
    windup: Object.freeze({ style: "toss" }),
    projectile: Object.freeze({ shape: "lob", arcHeight: 78, durationMs: 560, size: 1, colors: Object.freeze({ core: "#cfd3cb", trail: "#7c8078" }) }),
    colors: Object.freeze({ core: "#cfd3cb", trail: "#7c8078", impact: "#e8ece2" })
  }),
  // Riot Cop — Cover: a steel-blue guard pulse as he braces in the ally's place.
  cover: Object.freeze({
    type: "healPulse",
    soundKey: "buildCover",
    particleCount: 10,
    radius: 30,
    durationMs: 460,
    colors: Object.freeze({ core: "#bcd0e8", trail: "#4a5a70", impact: "#e6eefa" })
  }),
  // Riot Cop — Lockdown (RAGE): a riot-shield shockwave crackdown that washes the whole area.
  lockdown: Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 3,
    shake: 10,
    particleCount: 20,
    radius: 46,
    durationMs: 680,
    windup: Object.freeze({ style: "gather", durationMs: 340, particleCount: 10 }),
    boardFlash: true,
    colors: Object.freeze({ core: "#8fb4e8", trail: "#33507e", impact: "#dbe8fb" })
  }),
  "force-tug": Object.freeze({
    type: "statusStrike",
    soundKey: "tetherGrab",
    status: "slow",
    motif: "snare",
    particleCount: 10,
    projectile: Object.freeze({ shape: "tracer", arcHeight: 12, durationMs: 300, size: 1.1, colors: Object.freeze({ core: "#8ed6e8", trail: "#395d68" }) }),
    colors: Object.freeze({ core: "#8ed6e8", trail: "#395d68", impact: "#e8fbff" })
  }),
  "force-push": Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    radius: 1,
    ringCount: 3,
    particleCount: 18,
    colors: Object.freeze({ core: "#8ed6e8", trail: "#395d68", impact: "#ffffff" })
  }),
  "polarity-shift": Object.freeze({
    type: "ritual",
    soundKey: "recharge",
    durationMs: 780,
    particleCount: 16,
    windup: Object.freeze({ style: "gather", durationMs: 320, particleCount: 8 }),
    colors: Object.freeze({ core: "#8ed6e8", trail: "#b08cff", impact: "#ffffff" })
  }),
  "cannon-fire": Object.freeze({
    type: "statusStrike",
    soundKey: "rocketPunch",
    status: "stun",
    motif: "impact",
    particleCount: 12,
    projectile: Object.freeze({ shape: "tracer", arcHeight: 18, durationMs: 330, size: 1.35, colors: Object.freeze({ core: "#ffb45e", trail: "#7a2c10" }) }),
    colors: Object.freeze({ core: "#ff8a4c", trail: "#7a2c10", impact: "#ffe0b8" })
  }),
  flamethrower: Object.freeze({
    type: "volleyRain",
    soundKey: "nuke",
    staggerMs: 28,
    durationMs: 260,
    arcHeight: 18,
    projectile: Object.freeze({ shape: "orb", size: 0.75, colors: Object.freeze({ core: "#ffb45e", trail: "#7a2c10" }) }),
    colors: Object.freeze({ core: "#ff8a4c", trail: "#7a2c10", impact: "#ffd9a0" })
  }),
  // Mother Nature - each weather is a global ritual with a distinct battlefield read.
  blizzard: Object.freeze({
    type: "ritual",
    soundKey: "slowApplied",
    durationMs: 860,
    particleCount: 18,
    windup: Object.freeze({ style: "gather", durationMs: 360, particleCount: 9 }),
    colors: Object.freeze({ core: "#8ed6e8", trail: "#2b5f80", impact: "#e6f8ff" })
  }),
  "spring-shower": Object.freeze({
    type: "ritual",
    soundKey: "pray",
    durationMs: 820,
    particleCount: 18,
    windup: Object.freeze({ style: "gather", durationMs: 340, particleCount: 8 }),
    colors: Object.freeze({ core: "#8cf0a4", trail: "#2e7a4a", impact: "#e8ffe6" })
  }),
  heatwave: Object.freeze({
    type: "ritual",
    soundKey: "rageActivated",
    durationMs: 860,
    particleCount: 20,
    shake: 5,
    windup: Object.freeze({ style: "gather", durationMs: 380, particleCount: 10 }),
    colors: Object.freeze({ core: "#ff9a4c", trail: "#7a2c10", impact: "#ffe0b8" })
  }),
  thunderstorm: Object.freeze({
    type: "ritual",
    soundKey: "spark",
    durationMs: 900,
    particleCount: 20,
    shake: 6,
    windup: Object.freeze({ style: "gather", durationMs: 400, particleCount: 10 }),
    colors: Object.freeze({ core: "#b08cff", trail: "#2c286f", impact: "#f0e6ff" })
  }),
  // Landscaper raises terrain or punishes blocked movement with a physical hit.
  landscaper: Object.freeze({
    type: "projectileFan",
    soundKey: "buildCover",
    projectileCount: 1,
    spread: 0,
    arcHeight: 34,
    staggerMs: 0,
    durationMs: 420,
    impactRadius: 24,
    windup: Object.freeze({ style: "gather", durationMs: 260, particleCount: 7 }),
    projectile: Object.freeze({ shape: "rock", arcHeight: 34, durationMs: 420, size: 0.9, colors: Object.freeze({ core: "#c8b06a", trail: "#4f6b38" }) }),
    colors: Object.freeze({ core: "#c8b06a", trail: "#4f6b38", impact: "#e6d8a8" })
  }),
  "great-flood": Object.freeze({
    type: "magicBurst",
    soundKey: "nuke",
    blast: true,
    blastTiles: 4,
    shake: 12,
    particleCount: 30,
    radius: 58,
    durationMs: 780,
    boardFlash: true,
    windup: Object.freeze({ style: "gather", durationMs: 540, particleCount: 14 }),
    colors: Object.freeze({ core: "#6fb7f2", trail: "#1f4a72", impact: "#e6f4ff" })
  }),
  // Ronin - Flashing Steel: a brighter blinding cut (Moonstrike's motif, higher blind).
  "flashing-steel": Object.freeze({
    type: "statusStrike",
    soundKey: "blindApplied",
    status: "blind",
    motif: "moon",
    particleCount: 11,
    colors: Object.freeze({ core: "#e8eef7", trail: "#5a6270", impact: "#ffffff" })
  }),
  // Ronin — Shuriken: a fast thrown blade (a spinning tracer) for the range-3 true hit.
  shuriken: Object.freeze({
    type: "statusStrike",
    soundKey: "attackHit",
    motif: "impact",
    particleCount: 8,
    projectile: Object.freeze({ shape: "tracer", arcHeight: 8, durationMs: 240, size: 0.9, colors: Object.freeze({ core: "#d7dde6", trail: "#3a4048" }) }),
    colors: Object.freeze({ core: "#d7dde6", trail: "#3a4048", impact: "#ffffff" })
  }),
  // Ronin — Challenge: a taunting grudge mark (no damage), a snare-style flourish on the foe.
  challenge: Object.freeze({
    type: "statusStrike",
    soundKey: "recharge",
    status: "challenged",
    motif: "snare",
    particleCount: 10,
    colors: Object.freeze({ core: "#e0645e", trail: "#5a1e1e", impact: "#ffd0cc" })
  })
});

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]));
}

export function retuneVfx(base, overrides = {}) {
  const tuned = clone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value) && tuned[key] && typeof tuned[key] === "object") {
      tuned[key] = retuneVfx(tuned[key], value);
    } else {
      tuned[key] = clone(value);
    }
  }
  return tuned;
}

export function getAbilityVfx(artId, overrides = {}) {
  const template = ABILITY_VFX[artId];
  return template ? retuneVfx(template, overrides) : null;
}

// Per-damage-type impact styling consumed by effects.js's impact(). `motion` picks
// the debris behavior: "chips" (kinetic fragments tumbling outward), "motes" (arcane
// glow points drifting out and up), "embers" (sparks rising with a flicker).
const IMPACT_VFX = Object.freeze({
  physical: Object.freeze({ kind: "physical", flash: "#c0d8f0", critFlash: "#c8e8ff", ring: "#ff7684", critRing: "#80c8f0", spark: "#ffd9a0", sparkCount: 5, motion: "chips" }),
  magic: Object.freeze({ kind: "magic", flash: "#d6e2ff", critFlash: "#e6eeff", ring: "#9d8cff", critRing: "#c4b6ff", spark: "#cbb8ff", sparkCount: 6, motion: "motes" }),
  fire: Object.freeze({ kind: "fire", flash: "#ffd9a0", critFlash: "#ffe8c4", ring: "#ff8a4c", critRing: "#ffb45e", spark: "#ffb45e", sparkCount: 6, motion: "embers" }),
  true: Object.freeze({ kind: "true", flash: "#ffffff", critFlash: "#ffffff", ring: "#e8f4ff", critRing: "#ffffff", spark: "#e8f4ff", sparkCount: 3, motion: "chips" })
});

export function getImpactVfx(kind) {
  return clone(IMPACT_VFX[kind] ?? IMPACT_VFX.physical);
}

// The projectile a unit's ranged BASIC attack fires, by unit type. Unknown ranged
// types fall back to a generic gold bolt so a new unit never fires nothing.
export function getAttackProjectile(unitType) {
  return clone(ATTACK_PROJECTILES[unitType] ?? DEFAULT_ATTACK_PROJECTILE);
}

// The badge/tag visuals for a Witch-Doctor-style persistent stance, keyed by the
// same `stance` id carried on `unit.stance` / the catalog's `stances` block. Null
// for an unknown/no stance so callers can cheaply no-op.
export function getStanceVfx(stanceId) {
  return STANCE_VFX[stanceId] ? clone(STANCE_VFX[stanceId]) : null;
}

export function getStatusVfx(status) {
  const type = typeof status === "string" ? status : status?.type;
  return STATUS_VFX[type] ? clone(STATUS_VFX[type]) : null;
}

export function getUnitStatusVfx(statuses = []) {
  const seen = new Set();
  const vfx = [];
  for (const status of statuses) {
    const visual = getStatusVfx(status);
    if (!visual || seen.has(visual.type)) continue;
    seen.add(visual.type);
    vfx.push(visual);
  }
  return vfx;
}
