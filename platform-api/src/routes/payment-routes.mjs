import { readJsonBody, writeJson } from "../http-utils.mjs";
export async function handlePaymentRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const { createPremiumCheckoutSession, fulfillStripeWebhook } = services;
    if (method === "POST" && pathname === "/payments/tactical-arena/checkout-sessions") {
        if (!authClaims?.playerId) {
            writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
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
        writeJson(res, 200, { url: result.url }, requestOrigin);
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
