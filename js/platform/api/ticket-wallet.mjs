import { createPlatformApiClient } from "./platform-api.mjs";
export const TICKET_BALANCE_UPDATED_EVENT = "javascript-game-factory:ticket-balance";
export function formatTicketBalance(value, locale) {
    const balance = Number(value);
    if (!Number.isSafeInteger(balance) || balance < 0)
        return "—";
    return balance.toLocaleString(locale);
}
export function publishTicketBalance(value, target = globalThis.document ?? globalThis) {
    const balance = Number(value);
    if (!Number.isSafeInteger(balance) || balance < 0 || !target?.dispatchEvent)
        return false;
    const event = typeof CustomEvent === "function"
        ? new CustomEvent(TICKET_BALANCE_UPDATED_EVENT, { detail: { balance } })
        : { type: TICKET_BALANCE_UPDATED_EVENT, detail: { balance } };
    target.dispatchEvent(event);
    return true;
}
export function createTicketWalletClient(options = {}) {
    const api = createPlatformApiClient(options);
    return {
        getWallet() {
            return api.fetchTicketWallet();
        },
        getShop(shopSlug) {
            return api.fetchTicketShop(shopSlug);
        },
        purchaseShopItem(shopSlug, itemId) {
            return api.purchaseTicketShopItem(shopSlug, itemId);
        },
        adoptFarmPet(speciesId, name, purchaseId) {
            return api.adoptFarmPet({ speciesId, name, purchaseId });
        },
        purchaseFarmSupply(itemId, quantity, purchaseId) {
            return api.purchaseFarmSupply({ itemId, quantity, purchaseId });
        },
        harvestFarmCrop(layout, plotId, cellId) {
            return api.harvestFarmCrop({ layout, plotId, cellId });
        },
        harvestFarmTree(layout, plotId) {
            return api.harvestFarmTree({ layout, plotId });
        },
        cookFarmDish(layout, recipeId, scores, cookId) {
            return api.cookFarmDish({ layout, recipeId, scores, cookId });
        },
        millFarmLogs(layout, speciesId, logs, at, millId) {
            return api.millFarmLogs({ layout, speciesId, logs, at, millId });
        },
        craftFarmPiece(layout, itemId, scores, craftId) {
            return api.craftFarmPiece({ layout, itemId, scores, craftId });
        },
        sellFarmProduce(items, saleId) {
            return api.sellFarmProduce({ items, saleId });
        },
        getFarmOrders() {
            return api.fetchFarmOrders();
        },
        fillFarmOrder(orderId) {
            return api.fillFarmOrder({ orderId });
        },
    };
}
