const STATUS_VFX = Object.freeze({
  poison: Object.freeze({ type: "poison", label: "POI", color: "#78d46b", glow: "#315f29", ring: "bubble" }),
  slow: Object.freeze({ type: "slow", label: "SLW", color: "#70b7ff", glow: "#244c80", ring: "drag" }),
  blind: Object.freeze({ type: "blind", label: "BLD", color: "#f0d77a", glow: "#705f1e", ring: "blink" }),
  silence: Object.freeze({ type: "silence", label: "SIL", color: "#c89cff", glow: "#553276", ring: "mute" }),
  stun: Object.freeze({ type: "stun", label: "STN", color: "#ffe45e", glow: "#7a6310", ring: "jolt" })
});

const ABILITY_VFX = Object.freeze({
  footwork: Object.freeze({
    type: "dashTrail",
    soundKey: "footwork",
    durationMs: 760,
    afterimageCount: 4,
    sparkCount: 10,
    colors: Object.freeze({ core: "#f8f2c0", trail: "#7fd7ff", impact: "#fff1a6" })
  }),
  "volley-shot": Object.freeze({
    type: "volleyRain",
    staggerMs: 65,
    durationMs: 380,
    arcHeight: 60,
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
    colors: Object.freeze({ core: "#78d46b", trail: "#315f29", impact: "#a8ff91" })
  }),
  "leg-shot": Object.freeze({
    type: "statusStrike",
    soundKey: "slowApplied",
    status: "slow",
    motif: "snare",
    ringCount: 3,
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
    colors: Object.freeze({ core: "#c89cff", trail: "#553276", impact: "#ead6ff" })
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
    motif: "banish",
    particleCount: 14,
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
    colors: Object.freeze({ core: "#b48cff", trail: "#2a1746", impact: "#9be08a" })
  }),
  "summon-ghoul": Object.freeze({
    type: "magicBurst",
    soundKey: "darkseeker",
    particleCount: 14,
    radius: 34,
    durationMs: 600,
    colors: Object.freeze({ core: "#9be08a", trail: "#244d1f", impact: "#e8ffd6" })
  }),
  wither: Object.freeze({
    type: "statusStrike",
    soundKey: "slowApplied",
    status: "slow",
    motif: "snare",
    ringCount: 3,
    colors: Object.freeze({ core: "#9b8cff", trail: "#2a1746", impact: "#cdbcff" })
  }),
  lightseeker: Object.freeze({
    type: "magicBurst",
    soundKey: "lightseeker",
    particleCount: 14,
    radius: 44,
    durationMs: 560,
    colors: Object.freeze({ core: "#f7e27d", trail: "#d8eeff", impact: "#fff7b8" })
  }),
  darkseeker: Object.freeze({
    type: "magicBurst",
    soundKey: "darkseeker",
    particleCount: 16,
    radius: 50,
    durationMs: 620,
    colors: Object.freeze({ core: "#9b8cff", trail: "#38256f", impact: "#d6c8ff" })
  }),
  "hand-of-life": Object.freeze({
    type: "healPulse",
    soundKey: "handOfLife",
    particleCount: 9,
    radius: 30,
    durationMs: 560,
    colors: Object.freeze({ core: "#f7e27d", trail: "#c8962a", impact: "#fffbe0" })
  }),
  pray: Object.freeze({
    type: "healPulse",
    soundKey: "pray",
    particleCount: 10,
    radius: 34,
    durationMs: 620,
    colors: Object.freeze({ core: "#bff4d2", trail: "#64d99a", impact: "#f7ffd8" })
  }),
  wish: Object.freeze({
    type: "healPulse",
    soundKey: "wish",
    particleCount: 7,
    radius: 24,
    durationMs: 520,
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
