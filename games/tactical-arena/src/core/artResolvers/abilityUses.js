/** Decrements a finite-use ART pool; infinite-use ARTS are unchanged. */
export function spendAbilityUse(unit, art) {
  if (!Number.isFinite(art?.uses)) return;
  if (!unit.abilityUses) unit.abilityUses = {};
  const current = Number.isFinite(unit.abilityUses[art.id]) ? unit.abilityUses[art.id] : art.uses;
  unit.abilityUses[art.id] = Math.max(0, current - 1);
}
