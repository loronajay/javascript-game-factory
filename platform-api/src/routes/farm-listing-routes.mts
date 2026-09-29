// The Market Square's Exchange Board. Self only, every route: a player reads the
// board, lists their own goods, buys from someone else's listing and takes
// their own down. The listing rules (services/farm-listing-policy) decide what
// is allowed; refusals carry the listing as it stands where there is one.
//
//   GET  /games/farm/market/listings                                          the board
//   POST /games/farm/market/listings              { listingId, stack, itemId, quantity, unitPrice }  list
//   POST /games/farm/market/listings/:id/purchases  { quantity, purchaseId }  buy
//   POST /games/farm/market/listings/:id/withdrawal                            take it down

import { readJsonBody, writeJson } from "../http-utils.mjs";

const PURCHASE_PATH = /^\/games\/farm\/market\/listings\/([^/]+)\/purchases$/;
const WITHDRAW_PATH = /^\/games\/farm\/market\/listings\/([^/]+)\/withdrawal$/;

// A refusal about the state of the world rather than a malformed request.
const CONFLICTS = new Set([
  "too_many_listings", "daily_listing_limit", "farm_not_initialized", "not_enough", "price_out_of_band",
  "listing_expired", "listing_closed", "own_listing", "not_enough_listed", "daily_purchase_limit",
  "daily_spend_limit", "seller_daily_limit", "inventory_full", "insufficient_tickets",
  // A live animal or a fish: gone from the farm, or the buyer cannot keep it.
  "died", "husbandry_too_low", "herd_full", "no_room", "creel_full",
]);

export async function handleFarmListingRoute(context: any): Promise<boolean> {
  const { req, res, method, pathname, authClaims, requestOrigin, timestamp, services } = context;
  const reading = pathname === "/games/farm/market/listings" && method === "GET";
  const listing = pathname === "/games/farm/market/listings" && method === "POST";
  const purchase = method === "POST" ? PURCHASE_PATH.exec(pathname) : null;
  const withdrawal = method === "POST" ? WITHDRAW_PATH.exec(pathname) : null;
  if (!reading && !listing && !purchase && !withdrawal) return false;
  if (!authClaims?.playerId) {
    writeJson(res, 401, { status: "error", error: "unauthorized", timestamp }, requestOrigin);
    return true;
  }
  const service = reading ? services?.getFarmListings
    : listing ? services?.createFarmListing
      : purchase ? services?.buyFarmListing
        : services?.withdrawFarmListing;
  if (typeof service !== "function") {
    writeJson(res, 503, { status: "error", error: "farm_listings_not_configured", timestamp }, requestOrigin);
    return true;
  }
  const playerId = authClaims.playerId;
  try {
    if (reading) {
      writeJson(res, 200, { board: await service({ playerId }) }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const value = body.value ?? {};
    const outcome = listing
      ? await service({ playerId, listingId: value.listingId, stack: value.stack, itemId: value.itemId, quantity: value.quantity, unitPrice: value.unitPrice })
      : purchase
        ? await service({ playerId, listingId: decodeURIComponent(purchase[1]!), quantity: value.quantity, purchaseId: value.purchaseId })
        : await service({ playerId, listingId: decodeURIComponent(withdrawal![1]!) });
    if (!outcome?.ok) {
      const status = outcome?.error === "not_found" ? 404 : CONFLICTS.has(outcome?.error) ? 409 : 400;
      writeJson(res, status, { status: "error", ...outcome, timestamp }, requestOrigin);
      return true;
    }
    writeJson(res, 200, { result: outcome }, requestOrigin);
  } catch {
    writeJson(res, 400, { status: "error", error: "invalid_farm_listing", timestamp }, requestOrigin);
  }
  return true;
}
