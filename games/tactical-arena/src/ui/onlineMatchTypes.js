// Online match-type catalog + pure lookups, split out of onlineFlow.js. The four online
// formats and their player counts / board format / label live here; onlineFlow keeps the
// thin closure wrappers (activeMatchType/matchTypeConfig/isDraftMatch) that resolve the
// live lobby's type before delegating to these.

export const MATCH_TYPES = Object.freeze({
  duel: Object.freeze({ minPlayers: 2, maxPlayers: 2, format: "ffa", label: "Classic 1v1" }),
  draft1v1: Object.freeze({ minPlayers: 2, maxPlayers: 2, format: "ffa", label: "Draft 1v1", draft: true }),
  ffa4: Object.freeze({ minPlayers: 4, maxPlayers: 4, format: "ffa", label: "4 Player FFA" }),
  teams4: Object.freeze({ minPlayers: 4, maxPlayers: 4, format: "teams", label: "2v2 Teams" }),
});

export function normalizeMatchType(matchType) {
  return MATCH_TYPES[matchType] ? matchType : "duel";
}

export function matchTypeConfigFor(matchType) {
  return MATCH_TYPES[normalizeMatchType(matchType)];
}

export function isDraftMatchType(matchType) {
  return !!matchTypeConfigFor(matchType).draft;
}
