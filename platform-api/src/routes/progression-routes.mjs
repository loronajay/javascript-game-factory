import { writeJson } from "../http-utils.mjs";
// The read side of earned advancement. There is deliberately NO write route
// here: XP is awarded inside the rating transaction (db/ratings.mts), keyed by
// the same session id that decides a match settles once. A second endpoint that
// could grant would be a second key, free to disagree with the first.
//
// Public, like game-profile-routes and unlike loadout-routes: a mastery level is
// something a profile exists to show, and milestone 6 renders an opponent's
// bowler mastery on a Match Found card.
function isValidGameSlug(slug) {
    return typeof slug === "string" && /^[a-z0-9-]{1,60}$/.test(slug);
}
export async function handleProgressionRoute(context) {
    const { res, method, pathname, requestOrigin, timestamp, services } = context;
    const { getGameXpProgress } = services || {};
    // GET /progression/:gameSlug/:playerId — public; one player's XP document.
    const getMatch = pathname.match(/^\/progression\/([^/]+)\/([^/]+)$/);
    if (method === "GET" && getMatch) {
        const gameSlug = decodeURIComponent(getMatch[1]);
        const playerId = decodeURIComponent(getMatch[2]);
        if (!isValidGameSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        // Null service rather than a no-op stub, the same distinction the loadout and
        // leaderboard families draw: an unconfigured backend must say so rather than
        // report an empty progression a client would cache as "level 1".
        if (typeof getGameXpProgress !== "function") {
            writeJson(res, 503, { status: "error", error: "progression_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const progress = await getGameXpProgress(gameSlug, playerId);
        if (!progress) {
            // A slug with no catalog entry earns nothing and has nothing to report.
            writeJson(res, 404, { status: "error", error: "progression_unavailable", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { progression: progress }, requestOrigin);
        return true;
    }
    return false;
}
