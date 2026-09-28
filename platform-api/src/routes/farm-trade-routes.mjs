// Player trading on the Farm. Self only, every route: a player invites, reads
// and moves on their own tables, and the trade rules (services/farm-trade-policy)
// decide whose move is allowed. Refusals still carry the table as it stands, so
// a client whose view fell behind adopts the server's.
//
//   POST /games/farm/trades                  { partnerId }            invite
//   GET  /games/farm/trades/current                                    the table this player is at, or null
//   GET  /games/farm/trades/:id                                        one table, followed to its end
//   POST /games/farm/trades/:id/actions      { type, offer?, revision? } one move
import { readJsonBody, writeJson } from "../http-utils.mjs";
const TRADE_PATH = /^\/games\/farm\/trades\/([^/]+)$/;
const ACTION_PATH = /^\/games\/farm\/trades\/([^/]+)\/actions$/;
// A refusal that is about the state of the world rather than a malformed request.
const CONFLICTS = new Set([
    "already_trading", "partner_busy", "partner_unavailable", "self_trade", "too_many_invites", "daily_limit",
    "farm_not_initialized", "not_enough", "not_invited", "not_open", "not_locked", "stale_revision", "empty_offer",
    "too_many_changes", "trade_expired", "trade_completed", "trade_declined", "trade_cancelled",
    "offer_gone_you", "offer_gone_them", "inventory_full_you", "inventory_full_them",
]);
export async function handleFarmTradeRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const inviting = pathname === "/games/farm/trades" && method === "POST";
    const readingCurrent = pathname === "/games/farm/trades/current" && method === "GET";
    const actionMatch = method === "POST" ? ACTION_PATH.exec(pathname) : null;
    const readMatch = !readingCurrent && method === "GET" ? TRADE_PATH.exec(pathname) : null;
    if (!inviting && !readingCurrent && !actionMatch && !readMatch)
        return false;
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    const service = inviting ? services?.inviteFarmTrade
        : readingCurrent ? services?.getCurrentFarmTrade
            : actionMatch ? services?.actOnFarmTrade
                : services?.getFarmTrade;
    if (typeof service !== "function") {
        writeJson(res, 503, { status: "error", error: "farm_trading_not_configured", timestamp }, requestOrigin);
        return true;
    }
    const playerId = authClaims.playerId;
    try {
        if (readingCurrent) {
            writeJson(res, 200, await service({ playerId }), requestOrigin);
            return true;
        }
        if (readMatch) {
            const found = await service({ playerId, tradeId: decodeURIComponent(readMatch[1]) });
            writeJson(res, found?.ok ? 200 : 404, found?.ok ? { result: found } : { status: "error", ...found, timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const outcome = inviting
            ? await service({ playerId, partnerId: body.value?.partnerId })
            : await service({ playerId, tradeId: decodeURIComponent(actionMatch[1]), action: body.value });
        if (!outcome?.ok) {
            const status = outcome?.error === "not_found" ? 404 : CONFLICTS.has(outcome?.error) ? 409 : 400;
            writeJson(res, status, { status: "error", ...outcome, timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { result: outcome }, requestOrigin);
    }
    catch {
        writeJson(res, 400, { status: "error", error: "invalid_farm_trade", timestamp }, requestOrigin);
    }
    return true;
}
