import { writeJson } from "../http-utils.mjs";

// Ticket reads are self-only. There is intentionally no public award route:
// game validators and achievement transactions call the ledger internally after
// deciding an outcome, so a cabinet can never choose its own payout.
export async function handleTicketRoute(context: any): Promise<boolean> {
  const { res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  if (pathname !== "/tickets/wallet" || method !== "GET") return false;

  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
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
