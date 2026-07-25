// The platform ladder registry — the single plug-in point for "Top Ladder Rankings".
//
// Adding a game's ladder is one entry in LADDERS below. Nothing else on the platform
// side changes: the placement query, the public board route, the profile rail, and the
// /me + /player rankings panels all read this registry.
//
// A ladder must be backed by a rating source the server already owns. Today that is
// game_ratings (ELO), written by POST /ratings/:slug and by the ranked match reporter.
// When a second source appears (e.g. a high-score table), add its `source` value here
// and give db/ladders.mts a branch for it — do not fork the registry.
const LADDERS = [
    {
        gameSlug: "tactical-arena",
        title: "Tactical Arena",
        cabinetSlug: "tactical-arena",
        source: "game-ratings",
        unitLabel: "ELO",
        minMatches: 1,
    },
    {
        gameSlug: "sumorai-ranked",
        title: "Sumorai",
        cabinetSlug: "sumorai",
        source: "game-ratings",
        unitLabel: "ELO",
        minMatches: 1,
    },
];
const BY_SLUG = new Map(LADDERS.map((ladder) => [ladder.gameSlug, ladder]));
export function listLadders() {
    return LADDERS.map((ladder) => ({ ...ladder }));
}
export function getLadder(gameSlug) {
    const slug = typeof gameSlug === "string" ? gameSlug.trim().toLowerCase() : "";
    const ladder = slug ? BY_SLUG.get(slug) : undefined;
    return ladder ? { ...ladder } : null;
}
export function isLadderSlug(gameSlug) {
    return getLadder(gameSlug) !== null;
}
// Formats a rating for display. Kept next to the registry so every surface —
// board rows, profile placements, and any later badge pass — reads the same label.
export function formatLadderRating(ladder, rating) {
    const value = Math.round(Number(rating));
    if (!Number.isFinite(value))
        return "";
    const unit = ladder?.unitLabel || "";
    return unit ? `${value} ${unit}` : String(value);
}
