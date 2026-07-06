export function orderedHitTargets(rolled, findUnitById) {
  if (!rolled || typeof findUnitById !== "function") return [];
  const ids = Array.isArray(rolled.targetIds) && rolled.targetIds.length
    ? rolled.targetIds
    : (rolled.targetId ? [rolled.targetId] : []);
  return ids.map((id) => findUnitById(id)).filter(Boolean);
}

export function healingPresentationTargets(resolved, findUnitById) {
  if (!resolved || typeof findUnitById !== "function") return [];
  const ids = new Set();
  for (const id of resolved.healTargetIds ?? []) ids.add(id);
  for (const id of Object.keys(resolved.healingByTarget ?? {})) ids.add(id);
  return [...ids].map((id) => findUnitById(id)).filter(Boolean);
}

export function clumsySplashTargets(resolved, findUnitById, kind = "damage") {
  if (!resolved || typeof findUnitById !== "function") return [];
  const ids = new Set(resolved.splashTargetIds ?? []);
  const byTarget = kind === "healing" ? resolved.splashHealingByTarget : resolved.splashDamageByTarget;
  for (const id of Object.keys(byTarget ?? {})) ids.add(id);
  return [...ids].map((id) => findUnitById(id)).filter(Boolean);
}
