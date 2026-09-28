// Fishing at the Cove. The shadows and the Cove Records are public (anyone in
// the Cove sees the same fish and the same board); everything else is self
// only — a player casts, lands, sells, releases and shops for themselves.
//
//   GET  /games/farm/fishing/shadows                                  the shadows swimming now
//   GET  /games/farm/fishing/records                                  the Cove Records board
//   GET  /games/farm/fishing/fish?ids=a,b                             fish by id (a trade's, a trophy mount's)
//   GET  /games/farm/fishing                                          my tackle, level, creel, Fishdex
//   POST /games/farm/fishing/casts          { castId, point, shadowId?, rodId, bait }   a cast
//   POST /games/farm/fishing/casts/:id/landing  { outcome, grade }    how it ended
//   POST /games/farm/fishing/sales          { saleId, fishIds }        the Fishmonger
//   POST /games/farm/fishing/releases       { fishIds }                let them go
//   POST /games/farm/fishing/locks          { fishId, locked }         keep one safe
//   POST /games/farm/fishing/tackle         { purchaseId, itemId, quantity }  Bait & Tackle
//   POST /games/farm/fishing/mounts         { fishId, mounted, purchaseId }   mount one, or take it down
import { readJsonBody, writeJson } from "../http-utils.mjs";
const LANDING_PATH = /^\/games\/farm\/fishing\/casts\/([^/]+)\/landing$/;
const POSTS = Object.freeze({
    "/games/farm/fishing/casts": "castFarmLine",
    "/games/farm/fishing/sales": "sellFarmFish",
    "/games/farm/fishing/releases": "releaseFarmFish",
    "/games/farm/fishing/locks": "lockFarmFish",
    "/games/farm/fishing/tackle": "buyFarmTackle",
    "/games/farm/fishing/mounts": "mountFarmFish",
});
// A refusal about the state of the world rather than a malformed request.
const CONFLICTS = new Set([
    "zone_locked", "rod_not_owned", "no_bait", "creel_full", "too_many_casts", "duplicate_cast", "cast_closed",
    "cast_expired", "too_soon", "already_caught", "not_in_creel", "fish_locked", "already_owned", "level_too_low",
    "tackle_full", "insufficient_tickets", "not_mounted", "already_mounted", "too_many_mounted",
]);
export async function handleFarmFishingRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    if (!pathname.startsWith("/games/farm/fishing"))
        return false;
    const publicRead = method === "GET" && (pathname === "/games/farm/fishing/shadows" || pathname === "/games/farm/fishing/records" || pathname === "/games/farm/fishing/fish");
    const selfRead = method === "GET" && pathname === "/games/farm/fishing";
    const landing = method === "POST" ? LANDING_PATH.exec(pathname) : null;
    const postService = method === "POST" ? POSTS[pathname] : undefined;
    if (!publicRead && !selfRead && !landing && !postService)
        return false;
    if (publicRead) {
        const service = pathname.endsWith("/shadows") ? services?.getFarmFishShadows : pathname.endsWith("/fish") ? services?.getFarmFishDetails : services?.getFarmFishRecords;
        if (typeof service !== "function") {
            writeJson(res, 503, { status: "error", error: "farm_fishing_not_configured", timestamp }, requestOrigin);
            return true;
        }
        try {
            const key = pathname.endsWith("/shadows") ? "shadows" : pathname.endsWith("/fish") ? "details" : "records";
            const ids = pathname.endsWith("/fish") ? (new URL(req?.url || "/", "http://localhost").searchParams.get("ids") ?? "").split(",").filter(Boolean) : undefined;
            writeJson(res, 200, { [key]: await service(ids ? { ids } : {}) }, requestOrigin);
        }
        catch {
            writeJson(res, 500, { status: "error", error: "farm_fishing_unavailable", timestamp }, requestOrigin);
        }
        return true;
    }
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const serviceName = selfRead ? "getFarmFishing" : landing ? "landFarmCast" : postService;
    const service = services?.[serviceName];
    if (typeof service !== "function") {
        writeJson(res, 503, { status: "error", error: "farm_fishing_not_configured", timestamp }, requestOrigin);
        return true;
    }
    const playerId = authClaims.playerId;
    try {
        if (selfRead) {
            writeJson(res, 200, { fishing: await service({ playerId }) }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const value = body.value ?? {};
        const outcome = landing
            ? await service({ playerId, castId: decodeURIComponent(landing[1]), outcome: value.outcome, grade: value.grade })
            : serviceName === "castFarmLine"
                ? await service({ playerId, castId: value.castId, point: value.point, shadowId: value.shadowId, rodId: value.rodId, bait: value.bait })
                : serviceName === "sellFarmFish"
                    ? await service({ playerId, saleId: value.saleId, fishIds: value.fishIds })
                    : serviceName === "releaseFarmFish"
                        ? await service({ playerId, fishIds: value.fishIds })
                        : serviceName === "lockFarmFish"
                            ? await service({ playerId, fishId: value.fishId, locked: value.locked })
                            : serviceName === "mountFarmFish"
                                ? await service({ playerId, fishId: value.fishId, mounted: value.mounted, purchaseId: value.purchaseId })
                                : await service({ playerId, purchaseId: value.purchaseId, itemId: value.itemId, quantity: value.quantity });
        if (!outcome?.ok) {
            const status = outcome?.error === "not_found" ? 404 : CONFLICTS.has(outcome?.error) ? 409 : 400;
            writeJson(res, status, { status: "error", ...outcome, timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { result: outcome }, requestOrigin);
    }
    catch {
        writeJson(res, 400, { status: "error", error: "invalid_farm_fishing", timestamp }, requestOrigin);
    }
    return true;
}
