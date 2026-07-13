const STAT_MODIFIER_ABBR = Object.freeze({
  strength: "STR",
  defense: "DEF",
  moveRange: "MOVE",
  attackRange: "RNG",
  maxHp: "HP",
  maxMp: "MP",
});

export function formatStatModifierLabel(statModifiers) {
  return Object.entries(statModifiers ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${value > 0 ? "+" : ""}${value} ${STAT_MODIFIER_ABBR[key] ?? key.toUpperCase()}`)
    .join(" / ");
}
