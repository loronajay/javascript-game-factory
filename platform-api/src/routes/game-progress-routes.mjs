import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isPubliclyClaimableKind, isValidGameClaimKind, isValidGameProgressSlug, } from "../db/game-progress.mjs";
export async function handleGameProgressRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const { getGameProgress, recordGameProgressClaim, spendValor, resetCampaign, backfillOwnership } = services;
    const getMatch = pathname.match(/^\/game-progress\/([^/]+)$/);
    if (method === "GET" && getMatch) {
        const gameSlug = decodeURIComponent(getMatch[1]);
        if (!isValidGameProgressSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const progress = await getGameProgress(authClaims.playerId, gameSlug);
        if (!progress) {
            writeJson(res, 500, { status: "error", error: "progress_unavailable", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { progress }, requestOrigin);
        return true;
    }
    const claimMatch = pathname.match(/^\/game-progress\/([^/]+)\/claims$/);
    if (method === "POST" && claimMatch) {
        const gameSlug = decodeURIComponent(claimMatch[1]);
        if (!isValidGameProgressSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const { claimId, kind, sourceId, payload } = body.value || {};
        if (!claimId || typeof claimId !== "string") {
            writeJson(res, 400, { status: "error", error: "missing_claim_id", timestamp }, requestOrigin);
            return true;
        }
        if (!isValidGameClaimKind(kind)) {
            writeJson(res, 400, { status: "error", error: "invalid_claim_kind", timestamp }, requestOrigin);
            return true;
        }
        // Real-money entitlements can only be granted by the server-side Stripe
        // fulfillment path, never by a client posting a claim directly.
        if (!isPubliclyClaimableKind(kind)) {
            writeJson(res, 403, { status: "error", error: "claim_kind_forbidden", timestamp }, requestOrigin);
            return true;
        }
        const result = await recordGameProgressClaim({
            playerId: authClaims.playerId,
            gameSlug,
            claimId,
            kind,
            sourceId,
            payload,
        });
        if (!result) {
            writeJson(res, 500, { status: "error", error: "claim_failed", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, result, requestOrigin);
        return true;
    }
    // Server-authoritative Valor spend: the price is computed server-side and the
    // deduct+grant happens in one atomic transaction. The client only names the offer.
    const spendMatch = pathname.match(/^\/game-progress\/([^/]+)\/spend$/);
    if (method === "POST" && spendMatch) {
        const gameSlug = decodeURIComponent(spendMatch[1]);
        if (!isValidGameProgressSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        if (typeof spendValor !== "function") {
            writeJson(res, 503, { status: "error", error: "spend_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const result = await spendValor({
            playerId: authClaims.playerId,
            gameSlug,
            offer: body.value?.offer,
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, { status: "error", error: result?.error || "spend_failed", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, {
            ok: true,
            valorSpent: result.valorSpent,
            entitlementIds: result.entitlementIds || [],
            progress: result.progress || null,
        }, requestOrigin);
        return true;
    }
    // Reset campaign mission progress only (Valor / unlocks / skins / tutorials preserved).
    const resetMatch = pathname.match(/^\/game-progress\/([^/]+)\/reset$/);
    if (method === "POST" && resetMatch) {
        const gameSlug = decodeURIComponent(resetMatch[1]);
        if (!isValidGameProgressSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        if (typeof resetCampaign !== "function") {
            writeJson(res, 503, { status: "error", error: "reset_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await resetCampaign({ playerId: authClaims.playerId, gameSlug });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, { status: "error", error: result?.error || "reset_failed", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { ok: true, progress: result.progress || null }, requestOrigin);
        return true;
    }
    // One-time ownership migration: grandfathers a signed-in player's existing local owned set
    // to the server so the switch to server-authoritative ownership loses no progress.
    const backfillMatch = pathname.match(/^\/game-progress\/([^/]+)\/backfill$/);
    if (method === "POST" && backfillMatch) {
        const gameSlug = decodeURIComponent(backfillMatch[1]);
        if (!isValidGameProgressSlug(gameSlug)) {
            writeJson(res, 400, { status: "error", error: "invalid_game_slug", timestamp }, requestOrigin);
            return true;
        }
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        if (typeof backfillOwnership !== "function") {
            writeJson(res, 503, { status: "error", error: "backfill_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const result = await backfillOwnership({
            playerId: authClaims.playerId,
            gameSlug,
            entitlementIds: body.value?.entitlementIds,
            valorBalance: body.value?.valorBalance,
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, { status: "error", error: result?.error || "backfill_failed", timestamp }, requestOrigin);
            return true;
        }
        writeJson(res, 200, {
            ok: true,
            alreadyMigrated: Boolean(result.alreadyMigrated),
            progress: result.progress || null,
        }, requestOrigin);
        return true;
    }
    return false;
}
