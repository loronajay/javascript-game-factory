// Livestock (planning-docs/FARM_LIVESTOCK_PLAN.md). A herd is public — a
// visitor sees the animals in the pens — and every change is the owner's own:
// the Livestock Dealer's sale, leading an animal to another home, a new name.
//
//   GET  /games/farm/livestock/:playerId                          that farm's herd
//   POST /games/farm/livestock/purchases  { purchaseId, speciesId, homeId?, name? }   the Livestock Dealer
//   POST /games/farm/livestock/moves      { animalId, homeId | null }                  to another home
//   POST /games/farm/livestock/names      { animalId, name }                           rename
import { readJsonBody, writeJson } from "../http-utils.mjs";
const HERD_PATH = /^\/games\/farm\/livestock\/([^/]+)$/;
const POSTS = Object.freeze({
    "/games/farm/livestock/purchases": "buyFarmLivestock",
    "/games/farm/livestock/moves": "moveFarmLivestock",
    "/games/farm/livestock/names": "renameFarmLivestock",
});
// A refusal about the state of the farm rather than a malformed request.
const CONFLICTS = new Set(["no_room", "home_full", "herd_full", "insufficient_tickets", "farm_not_initialized", "unknown_home"]);
export async function handleFarmLivestockRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    if (!pathname.startsWith("/games/farm/livestock"))
        return false;
    const postService = method === "POST" ? POSTS[pathname] : undefined;
    const herd = method === "GET" ? HERD_PATH.exec(pathname) : null;
    if (!postService && !herd)
        return false;
    if (herd) {
        const service = services?.getFarmLivestock;
        if (typeof service !== "function") {
            writeJson(res, 503, { status: "error", error: "farm_livestock_not_configured", timestamp }, requestOrigin);
            return true;
        }
        try {
            writeJson(res, 200, await service({ playerId: decodeURIComponent(herd[1]) }), requestOrigin);
        }
        catch {
            writeJson(res, 500, { status: "error", error: "farm_livestock_unavailable", timestamp }, requestOrigin);
        }
        return true;
    }
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const service = services?.[postService];
    if (typeof service !== "function") {
        writeJson(res, 503, { status: "error", error: "farm_livestock_not_configured", timestamp }, requestOrigin);
        return true;
    }
    const playerId = authClaims.playerId;
    try {
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const value = body.value ?? {};
        const outcome = postService === "buyFarmLivestock"
            ? await service({ playerId, purchaseId: value.purchaseId, speciesId: value.speciesId, homeId: value.homeId, name: value.name })
            : postService === "moveFarmLivestock"
                ? await service({ playerId, animalId: value.animalId, homeId: value.homeId })
                : await service({ playerId, animalId: value.animalId, name: value.name });
        if (!outcome?.ok) {
            const status = outcome?.error === "not_found" ? 404 : CONFLICTS.has(outcome?.error) ? 409 : 400;
            writeJson(res, status, { status: "error", ...outcome, timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { result: outcome }, requestOrigin);
    }
    catch {
        writeJson(res, 400, { status: "error", error: "invalid_farm_livestock", timestamp }, requestOrigin);
    }
    return true;
}
