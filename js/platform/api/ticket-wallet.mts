import { createPlatformApiClient } from "./platform-api.mjs";

export const TICKET_BALANCE_UPDATED_EVENT = "javascript-game-factory:ticket-balance";

export function formatTicketBalance(value: unknown, locale?: string): string {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance) || balance < 0) return "—";
  return balance.toLocaleString(locale);
}

export function publishTicketBalance(value: unknown, target: any = globalThis.document ?? globalThis): boolean {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance) || balance < 0 || !target?.dispatchEvent) return false;
  const event = typeof CustomEvent === "function"
    ? new CustomEvent(TICKET_BALANCE_UPDATED_EVENT, { detail: { balance } })
    : { type: TICKET_BALANCE_UPDATED_EVENT, detail: { balance } };
  target.dispatchEvent(event);
  return true;
}

export function createTicketWalletClient(options: any = {}) {
  const api = createPlatformApiClient(options);

  return {
    getWallet() {
      return api.fetchTicketWallet();
    },
  };
}
