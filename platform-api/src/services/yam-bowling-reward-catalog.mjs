// A Yam Bowling circuit clear is reported by an installed client, so every input field is
// attacker-controlled. This server catalog fixes the only reward a canonical match can grant
// and the match that must precede it. Rooms and other cosmetics intentionally do not appear:
// their reward cadence has not been designed yet, and the client cannot invent it.
export const YAM_BOWLING_GAME_SLUG = "yam-bowling";
export const YAM_BOWLING_CIRCUIT_CLAIM_KIND = "circuit-clear";
const CIRCUIT_UNLOCKS = Object.freeze([
    ["local-hazel-ward", "hazel-ward"],
    ["local-piper-hart", "piper-hart"],
    ["local-skye-bennett", "skye-bennett"],
    ["local-marisol-cruz", "marisol-cruz"],
    ["local-talia-dodson", "talia-dodson"],
    ["city-lumi-vega", "lumi-vega"],
    ["city-cassy-cruz", "cassy-cruz"],
    ["city-lillie-chen", "lillie-chen"],
    ["city-roxy-chen", "roxy-chen"],
    ["city-carmen-blaze", "carmen-blaze"],
    ["regional-sage-holloway", "sage-holloway"],
    ["regional-claire-rowan", "claire-rowan"],
    ["regional-mina-park", "mina-park"],
    ["regional-kevya-desai", "kevya-desai"],
    ["regional-aaliyah-storm", "aaliyah-storm"],
    ["nationals-fiona-vale", "fiona-vale"],
    ["nationals-imani-cole", "imani-cole"],
    ["nationals-simone-carter", "simone-carter"],
    ["nationals-rei-nakamura", "rei-nakamura"],
    ["nationals-naomi-okafor", "naomi-okafor"],
    ["championship-echo-sterling", "echo-sterling"],
    ["championship-nyx-calder", "nyx-calder"],
    ["championship-sabrina-wilde", "sabrina-wilde"],
    ["championship-scarlett-voss", "scarlett-voss"],
    ["championship-reina-sato", "reina-sato"],
]);
const CIRCUIT_BY_MATCH_ID = new Map(CIRCUIT_UNLOCKS.map(([matchId, bowlerSlug], index) => [
    matchId,
    Object.freeze({
        matchId,
        bowlerSlug,
        previousMatchId: index > 0 ? CIRCUIT_UNLOCKS[index - 1][0] : null,
    }),
]));
function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function rejected() {
    return { ok: false, statusCode: 400, error: "invalid_claim" };
}
export function validateYamBowlingPublicClaim(params = {}) {
    if (cleanText(params.gameSlug, 60) !== YAM_BOWLING_GAME_SLUG
        || cleanText(params.kind, 80) !== YAM_BOWLING_CIRCUIT_CLAIM_KIND)
        return rejected();
    const input = params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
        ? params.payload
        : {};
    const matchId = cleanText(input.matchId || params.sourceId);
    const match = CIRCUIT_BY_MATCH_ID.get(matchId);
    if (!match || cleanText(params.claimId) !== `${YAM_BOWLING_CIRCUIT_CLAIM_KIND}:${matchId}`)
        return rejected();
    const entitlementId = `bowler:${match.bowlerSlug}`;
    return {
        ok: true,
        sourceId: matchId,
        prerequisite: match.previousMatchId
            ? { kind: "campaign-mission", missionId: match.previousMatchId }
            : null,
        payload: {
            matchId,
            achievementId: `beat-${match.bowlerSlug}`,
            unlockedBowlerSlug: match.bowlerSlug,
            entitlementId,
        },
        entitlementGrants: [{ entitlementId, kind: "bowler" }],
        campaignProgress: { missionId: matchId, stars: 1 },
    };
}
export function getYamBowlingCircuitUnlockCatalog() {
    return CIRCUIT_UNLOCKS;
}
