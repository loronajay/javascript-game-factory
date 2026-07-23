// Ranked DB barrel. The ranked persistence layer is split by concern; this module keeps
// the historical `db/ranked.mjs` import path stable for the server and routes by
// re-exporting every public function. See the split modules for behavior:
//   - ranked-shared.mts   slug validation, row serialization, stale-active expiry
//   - ranked-match.mts    matchmaking + start + result/ELO resolution + rendezvous
//   - ranked-profile.mts  cosmetic ranked identity (title/avatar) storage
//   - ranked-queries.mts  public cards, me-standing, unit stats, leaderboard
//   - ranked-history.mts  match-history list + detail, on the shared match-history contract
export { RANKED_ACTIVE_MATCH_TTL_HOURS, isValidRankedSlug, serializeMatchForPlayer, isStaleActiveRankedMatch, expireStaleActiveRankedMatches, } from "./ranked-shared.mjs";
export { enqueueRanked, pollRanked, cancelRanked, startRankedMatch, finalizeForfeits, reportRankedResult, setRankedLobbyCode, } from "./ranked-match.mjs";
export { RANKED_TITLE_MAX_LENGTH, getRankedProfile, saveRankedProfile, } from "./ranked-profile.mjs";
export { getPublicRankedCard, getRankedStanding, getRankedUnitStats, getRankedLeaderboard, } from "./ranked-queries.mjs";
export { getRankedMatches, getRankedMatchDetail, } from "./ranked-history.mjs";
