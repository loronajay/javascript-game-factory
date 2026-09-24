import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isGameResultSlug } from "../services/game-result-catalog.mjs";
// Cabinet result settlement — the ticket path for games without an
// achievement run (services/game-result-catalog).
//
//   POST /games/:slug/results   { result }   settle one completed result (auth, self only)
//
// This is deliberately NOT an award route: the body describes what happened
// in a match and the server decides what it pays. A body naming an amount is
// refused by the normalizer. The acting player is the token's playerId, never
// a body field. A settled result is a 200 whether it paid or not — a loss that
// pays completion and a fenced result that pays zero are both ordinary
// outcomes, and a cabinet must never treat "no tickets" as a failure.
export async function handleGameResultRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const match = pathname.match(/^\/games\/([^/]+)\/results$/);
    if (!match || method !== "POST")
        return false;
    const gameSlug = decodeURIComponent(match[1]);
    if (!isGameResultSlug(gameSlug)) {
        writeJson(res, 404, { status: "error", error: "unknown_result_game", timestamp }, requestOrigin);
        return true;
    }
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    if (typeof services?.submitGameResult !== "function") {
        writeJson(res, 503, { status: "error", error: "game_results_not_configured", timestamp }, requestOrigin);
        return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return true;
    }
    let settled;
    try {
        settled = await services.submitGameResult({ gameSlug, playerId: authClaims.playerId, result: body.value?.result });
    }
    catch {
        settled = null;
    }
    if (!settled) {
        writeJson(res, 500, { status: "error", error: "game_results_unavailable", timestamp }, requestOrigin);
        return true;
    }
    if (settled.error) {
        writeJson(res, 400, { status: "error", error: settled.error, timestamp }, requestOrigin);
        return true;
    }
    writeJson(res, 200, { ok: true, ...settled }, requestOrigin);
    return true;
}
