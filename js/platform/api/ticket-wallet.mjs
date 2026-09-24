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
    };
}
