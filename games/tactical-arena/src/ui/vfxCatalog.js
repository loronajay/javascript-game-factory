const STATUS_VFX = Object.freeze({
  poison: Object.freeze({ type: "poison", label: "POI", color: "#78d46b", glow: "#315f29", ring: "bubble" }),
  slow: Object.freeze({ type: "slow", label: "SLW", color: "#70b7ff", glow: "#244c80", ring: "drag" }),
  blind: Object.freeze({ type: "blind", label: "BLD", color: "#f0d77a", glow: "#705f1e", ring: "blink" }),
  silence: Object.freeze({ type: "silence", label: "SIL", color: "#c89cff", glow: "#553276", ring: "mute" })
});

const ABILITY_VFX = Object.freeze({
  footwork: Object.freeze({
    type: "dashTrail",
    durationMs: 760,
    afterimageCount: 4,
    sparkCount: 10,
    colors: Object.freeze({ core: "#f8f2c0", trail: "#7fd7ff", impact: "#fff1a6" })
  }),
  "volley-shot": Object.freeze({
    type: "projectileFan",
    projectileCount: 7,
    spread: 34,
    arcHeight: 78,
    staggerMs: 42,
    durationMs: 520,
    impactRadius: 22,
    colors: Object.freeze({ core: "#f7e27d", trail: "#f2b84b", impact: "#fff1a6" })
  }),
  "life-sap": Object.freeze({
    type: "drain",
    particleCount: 18,
    durationMs: 680,
    staggerMs: 18,
    curveHeight: 54,
    colors: Object.freeze({ core: "#8cf0a4", trail: "#3fbf86", impact: "#d8ffd6" })
  }),
  "poison-arrow": Object.freeze({
    type: "statusStrike",
    status: "poison",
    motif: "venom",
    particleCount: 14,
    colors: Object.freeze({ core: "#78d46b", trail: "#315f29", impact: "#a8ff91" })
  }),
  "leg-shot": Object.freeze({
    type: "statusStrike",
    status: "slow",
    motif: "snare",
    ringCount: 3,
    colors: Object.freeze({ core: "#70b7ff", trail: "#244c80", impact: "#c9e6ff" })
  }),
  moonstrike: Object.freeze({
    type: "statusStrike",
    status: "blind",
    motif: "moon",
    particleCount: 9,
    colors: Object.freeze({ core: "#f0d77a", trail: "#705f1e", impact: "#fff2a8" })
  }),
  "mage-killer": Object.freeze({
    type: "statusStrike",
    status: "silence",
    motif: "silenceRune",
    runeCount: 4,
    colors: Object.freeze({ core: "#c89cff", trail: "#553276", impact: "#ead6ff" })
  }),
  silence: Object.freeze({
    type: "statusStrike",
    status: "silence",
    motif: "silenceRune",
    runeCount: 5,
    colors: Object.freeze({ core: "#c89cff", trail: "#553276", impact: "#ead6ff" })
  }),
  pray: Object.freeze({
    type: "healPulse",
    particleCount: 10,
    radius: 34,
    durationMs: 620,
    colors: Object.freeze({ core: "#bff4d2", trail: "#64d99a", impact: "#f7ffd8" })
  }),
  wish: Object.freeze({
    type: "healPulse",
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
