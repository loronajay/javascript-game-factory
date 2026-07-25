import { writeJson } from "../http-utils.mjs";
import { listLadders } from "../services/ladder-catalog.mjs";
// Platform ladder routes — public reads, no auth. Standings are public information;
// the auth gate on the /ranked family exists because those routes also queue and
// report matches, which these never do.
//
//   GET /ladders                       the ladder registry (what games have ladders)
//   GET /ladders/:gameSlug[?limit=]    public top-N board for one ladder
//   GET /players/:playerId/ladders     one player's placements across every ladder
//
// This handler must be dispatched before the /players family so the ladders suffix
// is not swallowed by a broader player route.
export async function handleLadderRoute(context) {
    const { req, res, method, pathname, requestOrigin, timestamp, services } = context;
    const { getLadderStandings, getPlayerLadderPlacements } = services;
    if (method !== "GET")
        return false;
    if (pathname === "/ladders") {
        writeJson(res, 200, { ladders: listLadders() }, requestOrigin);
        return true;
    }
    const searchParams = new URL(req.url || "/", "http://localhost").searchParams;
    const boardMatch = pathname.match(/^\/ladders\/([^/]+)$/);
    if (boardMatch) {
        const gameSlug = decodeURIComponent(boardMatch[1]);
        const ladder = await getLadderStandings(gameSlug, { limit: searchParams.get("limit") });
        if (!ladder) {
            writeJson(res, 404, { status: "error", error: "unknown_ladder", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { ladder }, requestOrigin);
        return true;
    }
    const placementsMatch = pathname.match(/^\/players\/([^/]+)\/ladders$/);
    if (placementsMatch) {
        const playerId = decodeURIComponent(placementsMatch[1]);
        const result = await getPlayerLadderPlacements(playerId, { limit: searchParams.get("limit") });
        if (!result) {
            writeJson(res, 500, { status: "error", error: "placements_unavailable", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, result, requestOrigin);
        return true;
    }
    return false;
}
