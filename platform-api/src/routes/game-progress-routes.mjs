import { readJsonBody, writeJson } from "../http-utils.mjs";
import { isPubliclyClaimableKind, isValidGameClaimKind, isValidGameProgressSlug, } from "../db/game-progress.mjs";
export async function handleGameProgressRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const { getGameProgress, recordGameProgressClaim } = services;
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
    return false;
}
