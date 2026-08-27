import { readJsonBody, writeJson } from "../http-utils.mjs";
export async function handlePaymentRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const { createPremiumCheckoutSession, fulfillPremiumCheckoutSession, fulfillStripeWebhook, fulfillPlayPurchase } = services;
    const checkoutMatch = pathname.match(/^\/payments\/(tactical-arena|yam-bowling)\/checkout-sessions$/);
    if (method === "POST" && checkoutMatch) {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        const routeGameSlug = checkoutMatch[1];
        const requestedGameSlug = typeof body.value?.gameSlug === "string" ? body.value.gameSlug.trim() : "";
        if (requestedGameSlug && requestedGameSlug !== routeGameSlug) {
            writeJson(res, 400, { status: "error", error: "game_mismatch", timestamp }, requestOrigin);
            return true;
        }
        body.value = { ...body.value, gameSlug: routeGameSlug };
        const requestedPlayerId = typeof body.value?.playerId === "string" ? body.value.playerId.trim() : "";
        if (requestedPlayerId && requestedPlayerId !== authClaims.playerId) {
            writeJson(res, 403, { status: "error", error: "player_mismatch", timestamp }, requestOrigin);
            return true;
        }
        if (typeof createPremiumCheckoutSession !== "function") {
            writeJson(res, 503, { status: "error", error: "checkout_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await createPremiumCheckoutSession({
            playerId: authClaims.playerId,
            body: body.value,
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, {
                status: "error",
                error: result?.error || "checkout_failed",
                message: result?.message || undefined,
                param: result?.param || undefined,
                timestamp,
            }, requestOrigin);
            return true;
        }
        writeJson(res, 200, {
            url: result.url || "",
            sessionId: result.sessionId || "",
            clientSecret: result.clientSecret || "",
            publishableKey: result.publishableKey || "",
        }, requestOrigin);
        return true;
    }
    const fulfillmentMatch = pathname.match(/^\/payments\/(tactical-arena|yam-bowling)\/checkout-sessions\/fulfill$/);
    if (method === "POST" && fulfillmentMatch) {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        if (typeof fulfillPremiumCheckoutSession !== "function") {
            writeJson(res, 503, { status: "error", error: "checkout_fulfillment_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await fulfillPremiumCheckoutSession({
            playerId: authClaims.playerId,
            body: body.value,
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, {
                status: "error",
                error: result?.error || "checkout_fulfillment_failed",
                message: result?.message || undefined,
                timestamp,
            }, requestOrigin);
            return true;
        }
        writeJson(res, 200, {
            ok: true,
            alreadyProcessed: Boolean(result.alreadyProcessed),
            progress: result.progress || null,
        }, requestOrigin);
        return true;
    }
    // The Android in-app-purchase counterpart to the Stripe fulfill route above. The client
    // posts a Google Play purchase token; the server verifies it with Google, resolves the
    // product from its own catalog, and grants. Returns `consume` because only the server
    // knows whether the product is a consumable — the client uses it to settle the purchase.
    if (method === "POST" && pathname === "/payments/tactical-arena/play-purchases") {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        if (typeof fulfillPlayPurchase !== "function") {
            writeJson(res, 503, { status: "error", error: "play_billing_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await fulfillPlayPurchase({
            playerId: authClaims.playerId,
            body: body.value,
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, {
                status: "error",
                error: result?.error || "play_purchase_failed",
                timestamp,
            }, requestOrigin);
            return true;
        }
        writeJson(res, 200, {
            ok: true,
            alreadyProcessed: Boolean(result.alreadyProcessed),
            consume: Boolean(result.consume),
            entitlements: Array.isArray(result.entitlements) ? result.entitlements : [],
            progress: result.progress || null,
        }, requestOrigin);
        return true;
    }
    if (method === "POST" && pathname === "/payments/stripe/webhook") {
        if (typeof fulfillStripeWebhook !== "function") {
            writeJson(res, 503, { status: "error", error: "stripe_webhook_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const result = await fulfillStripeWebhook({
            req,
            signature: req?.headers?.["stripe-signature"] || "",
        });
        if (!result?.ok) {
            writeJson(res, result?.statusCode || 400, {
                status: "error",
                error: result?.error || "webhook_failed",
                timestamp,
            }, requestOrigin);
            return true;
        }
        writeJson(res, 200, { received: true }, requestOrigin);
        return true;
    }
    return false;
}
