// Single source of truth for health-tone thresholds, shared by the board pieces,
// the selected-unit card, and the squad chips so a unit's HP reads the same color
// everywhere. Returns a class suffix consumed as `.hp-high` / `.hp-mid` / `.hp-low`.
export function hpClass(hp, maxHp) {
  const ratio = maxHp > 0 ? hp / maxHp : 0;

  if (ratio > 0.5) {
    return "hp-high";
  }

  if (ratio > 0.25) {
    return "hp-mid";
  }

  return "hp-low";
}
