const weather = (id, label, persistent) => Object.freeze({
  id,
  label,
  persistent: Object.freeze(persistent)
});

export const WEATHER_TYPES = Object.freeze({
  blizzard: weather("blizzard", "Blizzard", { movementArtRangeBonus: 1 }),
  spring: weather("spring", "Spring Shower", { restoreBonus: 1 }),
  heatwave: weather("heatwave", "Heatwave", { critDamageBonus: 1, critCreatesFire: Object.freeze({ kind: "fire", permanent: true }) }),
  thunderstorm: weather("thunderstorm", "Thunderstorm", { artMpCostReduction: 1, minArtMpCost: 0 })
});

export const WEATHER_LABELS = Object.freeze(Object.fromEntries(
  Object.values(WEATHER_TYPES).map((entry) => [entry.id, entry.label])
));

export function normalizeWeatherSpec(spec) {
  const id = typeof spec === "string" ? spec : spec?.id;
  if (!Object.hasOwn(WEATHER_TYPES, id)) return null;
  const sourceId = typeof spec === "object" && spec?.sourceId ? String(spec.sourceId) : null;
  return { id, sourceId };
}
