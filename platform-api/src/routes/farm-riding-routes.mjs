// Riding (planning-docs/FARM_RIDING_PLAN.md): Hollis's horses, course runs at
// Windrush Downs, and its races. Every write is the signed-in player's own;
// the race list is public (a signed-in reader also gets their seat).
//
//   POST /games/farm/horses/purchases        { day, slot, name? }                      one of the day's horses from the Livestock Dealer
//   POST /games/farm/riding/runs             { horseId, courseId, ticks, faults, start, inputs }   a finished course run, ridden again for XP
//   GET  /games/farm/downs/races                                                        the race board
//   POST /games/farm/downs/races             { courseId, maxRiders, stake, horseId, name }   post a race (and enter it)
//   POST /games/farm/downs/races/:id/entries { horseId, name }                          enter
//   POST /games/farm/downs/races/:id/leave                                             leave (the poster leaving takes it down)
//   POST /games/farm/downs/races/:id/start                                             the poster closes the gate
//   POST /games/farm/downs/races/:id/bets    { riderId, amount, name }                  back a rider
//   POST /games/farm/downs/races/:id/settle  { result, signature }                      the race room's signed finish order
import { readJsonBody, writeJson } from "../http-utils.mjs";
const POSTS = Object.freeze({
    "/games/farm/horses/purchases": "buyFarmHorse",
    "/games/farm/riding/runs": "submitFarmRidingRun",
    "/games/farm/downs/races": "postFarmRace",
});
const RACE_ACTION = /^\/games\/farm\/downs\/races\/(race-[A-Za-z0-9-]{8,64})\/(entries|leave|start|bets|settle)$/;
const RACE_SERVICES = Object.freeze({
    entries: "enterFarmRace", leave: "leaveFarmRace", start: "startFarmRace", bets: "betFarmRace", settle: "settleFarmRace",
});
// A refusal about the state of the farm, the race or the day rather than a malformed request.
const CONFLICTS = new Set([
    "farm_not_initialized", "already_bought", "farm_full", "level_too_low", "no_stall", "insufficient_tickets", "stock_changed",
    "no_horse", "replay_mismatch", "daily_run_limit",
    "races_unavailable", "too_many_races", "already_racing", "daily_spend_limit", "gate_closed", "race_full", "backed_this_race",
    "not_entered", "not_poster", "too_few_riders", "betting_closed", "riding_this_race", "unknown_rider", "too_many_bets", "not_running",
]);
export async function handleFarmRidingRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    if (method === "GET" && pathname === "/games/farm/downs/races") {
        const service = services?.listFarmRaces;
        if (typeof service !== "function") {
            writeJson(res, 503, { status: "error", error: "farm_riding_not_configured", timestamp }, requestOrigin);
            return true;
        }
        try {
            writeJson(res, 200, await service({ playerId: authClaims?.playerId ?? "" }), requestOrigin);
        }
        catch {
            writeJson(res, 500, { status: "error", error: "farm_races_unavailable", timestamp }, requestOrigin);
        }
        return true;
    }
    const raceAction = method === "POST" ? RACE_ACTION.exec(pathname) : null;
    const postService = method === "POST" ? (POSTS[pathname] ?? (raceAction ? RACE_SERVICES[raceAction[2]] : undefined)) : undefined;
    if (!postService)
        return false;
    // Settling is the one write a rider hands in on the race room's behalf; the signature is the authority, and still only a signed-in player may hand it in.
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const service = services?.[postService];
    if (typeof service !== "function") {
        writeJson(res, 503, { status: "error", error: "farm_riding_not_configured", timestamp }, requestOrigin);
        return true;
    }
    try {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const value = body.value ?? {};
        const outcome = await service({ ...value, playerId: authClaims.playerId, ...(raceAction ? { raceId: raceAction[1] } : {}) });
        if (!outcome?.ok) {
            const status = outcome?.error === "not_found" ? 404 : CONFLICTS.has(outcome?.error) ? 409 : 400;
            writeJson(res, status, { status: "error", ...outcome, timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { result: outcome }, requestOrigin);
    }
    catch {
        writeJson(res, 400, { status: "error", error: "invalid_farm_riding", timestamp }, requestOrigin);
    }
    return true;
}
