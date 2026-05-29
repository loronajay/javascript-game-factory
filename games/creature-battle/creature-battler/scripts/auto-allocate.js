// auto-allocate.js — Picks a class route and equips passives for a creature automatically.
// Used by the class customization screen for quick battle setup in training mode.

const _ROUTE_STAT_WEIGHTS = {
  strength:               ['strength'],
  defense:                ['defense'],
  intelligence:           ['intelligence'],
  spirit:                 ['spirit'],
  speed:                  ['speed'],
  strength_defense:       ['strength', 'defense'],
  strength_intelligence:  ['strength', 'intelligence'],
  strength_spirit:        ['strength', 'spirit'],
  strength_speed:         ['strength', 'speed'],
  defense_intelligence:   ['defense', 'intelligence'],
  defense_spirit:         ['defense', 'spirit'],
  defense_speed:          ['defense', 'speed'],
  intelligence_spirit:    ['intelligence', 'spirit'],
  intelligence_speed:     ['intelligence', 'speed'],
  spirit_speed:           ['spirit', 'speed'],
  no_allocation:          [],
};

// Average growth rate across the route's primary stats. Unimplemented routes return -1.
function _scoreRouteForCreature(routeId, creature) {
  if (!getClassRoute(routeId)) return -1;
  const stats = _ROUTE_STAT_WEIGHTS[routeId];
  if (!stats || stats.length === 0) return 0;
  const total = stats.reduce((sum, s) => sum + (creature.growth[s] || 0), 0);
  return total / stats.length;
}

// Higher score = prefer this passive. stat boosts first, then damage, then defensive, then utility.
// Rank bonus nudges higher-tier variants above lower-tier ones when categories tie.
function _scorePassive(passive) {
  const base = { stat: 3, damage: 2, resistance: 2, resource: 1, utility: 1 }[passive.category] ?? 1;
  const rankBonus = passive.rank ? (passive.rank - 1) * 0.5 : 0;
  return base + rankBonus;
}

// Returns { routeId, equippedPassives: [id, id, id] } for a given creature and level.
// Picks the best implemented route by stat growth fit, then the top 3 passives by score.
function autoAllocateCreature(creatureId, level) {
  const creature = RENTAL_ROSTER.find(r => r.id === creatureId);
  if (!creature) return { routeId: null, equippedPassives: [] };

  let bestRoute = null;
  let bestScore = -1;
  for (const stub of ROUTE_STUBS) {
    const score = _scoreRouteForCreature(stub.id, creature);
    if (score > bestScore) {
      bestScore = score;
      bestRoute = stub.id;
    }
  }

  if (!bestRoute) return { routeId: null, equippedPassives: [] };

  const pool = resolveClassPool(bestRoute, level);
  const sorted = [...pool.passives].sort((a, b) => _scorePassive(b) - _scorePassive(a));
  const equippedPassives = sorted.slice(0, 3).map(p => p.id);

  return { routeId: bestRoute, equippedPassives };
}
