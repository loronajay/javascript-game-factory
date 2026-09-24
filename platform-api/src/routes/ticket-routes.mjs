import { readJsonBody, writeJson } from "../http-utils.mjs";
// Ticket reads are self-only. There is intentionally no public award route:
// game validators and achievement transactions call the ledger internally after
// deciding an outcome, so a cabinet can never choose its own payout.
export async function handleTicketRoute(context) {
    const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
    const shopMatch = pathname.match(/^\/tickets\/shops\/([a-z0-9-]+)$/);
    const purchaseMatch = pathname.match(/^\/tickets\/shops\/([a-z0-9-]+)\/purchases$/);
    if (!(pathname === "/tickets/wallet" && method === "GET")
        && !(shopMatch && method === "GET")
        && !(purchaseMatch && method === "POST"))
        return false;
    if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
        return true;
    }
    if (shopMatch) {
        if (typeof services?.getTicketShop !== "function") {
            writeJson(res, 503, { status: "error", error: "ticket_shop_not_configured", timestamp }, requestOrigin);
            return true;
        }
        try {
            const shop = await services.getTicketShop({ playerId: authClaims.playerId, shopSlug: shopMatch[1] });
            writeJson(res, 200, { shop }, requestOrigin);
        }
        catch (error) {
            writeJson(res, 404, { status: "error", error: "unknown_ticket_shop", timestamp }, requestOrigin);
        }
        return true;
    }
    if (purchaseMatch) {
        if (typeof services?.purchaseTicketShopItem !== "function") {
            writeJson(res, 503, { status: "error", error: "ticket_shop_not_configured", timestamp }, requestOrigin);
            return true;
        }
        const body = await readJsonBody(req);
        if (!body.ok) {
            writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
            return true;
        }
        try {
            const purchase = await services.purchaseTicketShopItem({
                playerId: authClaims.playerId,
                shopSlug: purchaseMatch[1],
                itemId: body.value?.itemId,
            });
            if (!purchase?.ok) {
                writeJson(res, purchase?.error === "insufficient_tickets" ? 409 : 400, { status: "error", ...purchase, timestamp }, requestOrigin);
                return true;
            }
            writeJson(res, 200, { purchase }, requestOrigin);
        }
        catch (error) {
            writeJson(res, 400, { status: "error", error: "invalid_shop_purchase", timestamp }, requestOrigin);
        }
        return true;
    }
    if (typeof services?.getTicketWallet !== "function") {
        writeJson(res, 503, { status: "error", error: "tickets_not_configured", timestamp }, requestOrigin);
        return true;
    }
    const wallet = await services.getTicketWallet(authClaims.playerId);
    if (!wallet) {
        writeJson(res, 500, { status: "error", error: "ticket_wallet_unavailable", timestamp }, requestOrigin);
        return true;
    }
    writeJson(res, 200, { wallet }, requestOrigin);
    return true;
}
