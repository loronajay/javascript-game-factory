const STATUS_VFX = Object.freeze({
  poison: Object.freeze({ type: "poison", label: "POI", color: "#78d46b", glow: "#315f29", ring: "bubble" }),
  slow: Object.freeze({ type: "slow", label: "SLW", color: "#70b7ff", glow: "#244c80", ring: "drag" }),
  blind: Object.freeze({ type: "blind", label: "BLD", color: "#f0d77a", glow: "#705f1e", ring: "blink" }),
  silence: Object.freeze({ type: "silence", label: "SIL", color: "#c89cff", glow: "#553276", ring: "mute" }),
  stun: Object.freeze({ type: "stun", label: "STN", color: "#ffe45e", glow: "#7a6310", ring: "jolt" })
});

// Real projectile specs consumed by effects.js's flight primitive. `shape` picks the
// built figure: "arrow" (shaft + head, rotates to heading), "orb" (glowing magic
// bolt with a mote tail), "tracer" (a flat, fast rifle streak), "lob" (a tumbling
// thrown object on a high arc). Every ranged BASIC attack resolves its projectile
// here by unit type; rolled attack ARTS override it via their recipe's `projectile`.
const ATTACK_PROJECTILES = Object.freeze({
  archer: Object.freeze({ shape: "arrow", arcHeight: 62, durationMs: 430, size: 1, colors: Object.freeze({ core: "#f2e4b8", trail: "#8a6d3a" }) }),
  sniper: Object.freeze({ shape: "tracer", arcHeight: 8, durationMs: 230, size: 1, colors: Object.freeze({ core: "#ffd9a0", trail: "#c0653a" }) }),
  magician: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 430, size: 1, colors: Object.freeze({ core: "#a0c8ff", trail: "#4488dd" }) }),
  mystic: Object.freeze({ shape: "orb", arcHeight: 50, durationMs: 460, size: 0.9, colors: Object.freeze({ core: "#bff4d2", trail: "#64d99a" }) }),
  necromancer: Object.freeze({ shape: "orb", arcHeight: 46, durationMs: 450, size: 1, colors: Object.freeze({ core: "#9be08a", trail: "#38256f" }) })
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
    // The rage ultimate earns the longest, heaviest gather in the game.
    windup: Object.freeze({ style: "gather", durationMs: 560, particleCount: 14 }),
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
    type: "magicBurst",
    soundKey: "darkseeker",
    particleCount: 14,
    radius: 34,
    durationMs: 600,
    windup: Object.freeze({ style: "gather", durationMs: 460, particleCount: 10 }),
    colors: Object.freeze({ core: "#9be08a", trail: "#244d1f", impact: "#e8ffd6" })
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
