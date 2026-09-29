// The Market Square's Exchange Board, server side: the only way tickets move
// from one player to another, and only in return for goods.
//
// Every move is one transaction and the rules are services/farm-listing-policy:
//   - LISTING takes the goods off the seller's STORED farm (furniture off the
//     shelf) and holds them on the listing row — escrow — so they cannot be
//     sold twice, traded away, or brought back by a stale save;
//   - BUYING spends the buyer's tickets, pays the seller the price less the
//     Market's fee (which goes to nobody), puts the goods on the buyer's farm
//     and records the sale, all or nothing, once per purchase id;
//   - WITHDRAWING (open or expired) puts what is left back on the seller's farm.
//
// A LIVE ANIMAL (livestock plan Phase 6) is escrowed as its own row: listing it
// turns it `listed` (off the farm, on clock zero), buying lands it on the
// buyer's farm only where they can keep it — checked BEFORE a ticket moves —
// and taking it down brings it home (db/farm-livestock-transfer.mts). A FISH
// works the same way out of the creel (db/farm-fish-listing.mts): a buyer needs
// room in theirs.
//
// Locks: every move that touches two players takes both players' advisory
// locks in player-id order first, so two farmers buying from each other at the
// same moment queue rather than deadlock; the listing row is then locked FOR
// UPDATE, then the farm.

import { randomUUID } from "node:crypto";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { unplacedFarmPieces } from "../services/farm-carpentry-catalog.mjs";
import {
  BOARD_PAGE,
  DAILY_LISTINGS_CREATED,
  DAILY_LISTING_EARN_LIMIT,
  DAILY_LISTING_PURCHASES,
  DAILY_LISTING_SPEND_LIMIT,
  LISTING_FEE_RATE,
  LISTING_ID,
  LISTING_PURCHASE_ID,
  MAX_LISTING_UNIT_PRICE,
  LISTING_TTL_MS,
  MAX_OPEN_LISTINGS,
  addListedGoods,
  checkListingPurchase,
  listingDayStart,
  listingView,
  normalizeListingRequest,
  normalizeListingRow,
  takeListedGoods,
  type FarmListing,
} from "../services/farm-listing-policy.mjs";
import { awardTicketsInTransaction, spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, saveFarm, transaction } from "./farm-economy.mjs";
import { consignLivestock, listedLivestockCards, planListedLanding, writeListedLanding } from "./farm-livestock-transfer.mjs";
import { checkListedFishLanding, consignFish, landListedFish, listedFishCards } from "./farm-fish-listing.mjs";

function required(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

async function lockPlayers(client: any, playerIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(playerIds)].sort()) await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`farm-listing:${id}`]);
}

async function lockedListing(client: any, listingId: string, now: number): Promise<FarmListing | null> {
  const result = await client.query(`select * from farm_market_listings where listing_id = $1 for update`, [listingId]);
  return normalizeListingRow(result.rows?.[0], now);
}

async function writeListing(client: any, listing: FarmListing, now: number): Promise<void> {
  await client.query(
    `update farm_market_listings set quantity = $2, status = $3, closed_at = $4 where listing_id = $1`,
    [listing.id, listing.quantity, listing.status, listing.status === "open" ? null : new Date(now)],
  );
}

/** Today's numbers for one player, from the sale and listing records. */
async function dailyTotals(client: any, playerId: string, now: number) {
  const since = new Date(listingDayStart(now));
  const bought = await client.query(
    `select count(*)::int as purchases, coalesce(sum(total), 0)::int as spent from farm_market_listing_sales where buyer_id = $1 and created_at >= $2`,
    [playerId, since],
  );
  const sold = await client.query(
    `select coalesce(sum(proceeds), 0)::int as earned from farm_market_listing_sales where seller_id = $1 and created_at >= $2`,
    [playerId, since],
  );
  const listed = await client.query(
    `select count(*)::int as created from farm_market_listings where seller_id = $1 and created_at >= $2`,
    [playerId, since],
  );
  return {
    purchases: Number(bought.rows?.[0]?.purchases) || 0,
    spent: Number(bought.rows?.[0]?.spent) || 0,
    earned: Number(sold.rows?.[0]?.earned) || 0,
    created: Number(listed.rows?.[0]?.created) || 0,
  };
}

function limits(totals: Awaited<ReturnType<typeof dailyTotals>>) {
  return {
    feeRate: LISTING_FEE_RATE,
    maxUnitPrice: MAX_LISTING_UNIT_PRICE,
    maxOpen: MAX_OPEN_LISTINGS,
    listingsLeftToday: Math.max(0, DAILY_LISTINGS_CREATED - totals.created),
    purchasesLeftToday: Math.max(0, DAILY_LISTING_PURCHASES - totals.purchases),
    spendLeftToday: Math.max(0, DAILY_LISTING_SPEND_LIMIT - totals.spent),
    earnLeftToday: Math.max(0, DAILY_LISTING_EARN_LIMIT - totals.earned),
  };
}

async function sellerName(client: any, playerId: string): Promise<string> {
  const result = await client.query(`select profile_name from player_profiles where player_id = $1`, [playerId]);
  return String(result.rows?.[0]?.profile_name ?? "").slice(0, 40) || "A farmer";
}

/**
 * GET /games/farm/market/listings — the board: the newest open listings from
 * everyone else, every listing of the viewer's that still holds goods (open or
 * expired, so they can take them home), and what today's caps leave them.
 */
export async function getFarmListings(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const open = await pool.query(
    `select * from farm_market_listings where status = 'open' and expires_at > $1 and seller_id <> $2 order by created_at desc limit $3`,
    [new Date(now), playerId, BOARD_PAGE],
  );
  const own = await pool.query(
    `select * from farm_market_listings where seller_id = $1 and status = 'open' order by created_at desc`,
    [playerId],
  );
  const parse = (rows: any[]) => rows.map((row) => normalizeListingRow(row, now)).filter((row): row is FarmListing => Boolean(row));
  const listings = parse(open.rows ?? []);
  const mine = parse(own.rows ?? []);
  // Animals and fish are shown as themselves: their card, read from the waiting rows.
  const waiting = (stack: string) => [...listings, ...mine].filter((row) => row.stack === stack && row.quantity > 0).map((row) => row.itemId);
  const animals = await listedLivestockCards(pool, waiting("livestock"));
  const fish = await listedFishCards(pool, waiting("fish"));
  const cardOf = (row: FarmListing) => (row.stack === "livestock" ? animals.get(row.itemId) : row.stack === "fish" ? fish.get(row.itemId) : null) ?? null;
  const view = (rows: FarmListing[]) => rows
    .filter((row) => (row.stack !== "livestock" && row.stack !== "fish") || row.quantity <= 0 || cardOf(row))
    .map((row) => listingView(row, playerId, cardOf(row)));
  return {
    listings: view(listings),
    mine: view(mine),
    limits: limits(await dailyTotals(pool, playerId, now)),
  };
}

/** POST /games/farm/market/listings — put goods up. The goods leave the farm now. */
export async function createFarmListing(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const listingId = typeof input?.listingId === "string" ? input.listingId : "";
  if (!LISTING_ID.test(listingId)) return { ok: false, error: "invalid_listing" };
  const parsed = normalizeListingRequest(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { request } = parsed;
  return transaction(pool, async (client) => {
    await lockPlayers(client, [playerId]);
    const existing = await client.query(`select * from farm_market_listings where listing_id = $1`, [listingId]);
    if (existing.rows?.length) {
      const listing = normalizeListingRow(existing.rows[0], now);
      if (listing?.sellerId !== playerId) return { ok: false, error: "invalid_listing" };
      return { ok: true, duplicate: true, listing: listingView(listing, playerId) };
    }
    const openCount = await client.query(`select count(*)::int as count from farm_market_listings where seller_id = $1 and status = 'open'`, [playerId]);
    if ((Number(openCount.rows?.[0]?.count) || 0) >= MAX_OPEN_LISTINGS) return { ok: false, error: "too_many_listings" };
    const totals = await dailyTotals(client, playerId, now);
    if (totals.created >= DAILY_LISTINGS_CREATED) return { ok: false, error: "daily_listing_limit" };
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete") return { ok: false, error: "farm_not_initialized" };
    let layout = farm.layout;
    let animal: unknown = null;
    if (request.stack === "livestock") {
      // The animal leaves the farm as a row of its own; the farm document does not change.
      const consigned = await consignLivestock(client, playerId, farm.layout, request.itemId);
      if (!consigned.ok) return { ok: false, error: consigned.error, layout: farm.layout };
      animal = consigned.card;
    } else if (request.stack === "fish") {
      const consigned = await consignFish(client, playerId, request.itemId);
      if (!consigned.ok) return { ok: false, error: consigned.error, layout: farm.layout };
      animal = consigned.card;
    } else {
      const inventory = farm.layout.agriculture.inventory;
      const shelf = unplacedFarmPieces(inventory.furniture ?? {}, farm.layout.decor ?? []);
      const taken = takeListedGoods(inventory, shelf, request.stack, request.itemId, request.quantity);
      if (!taken) return { ok: false, error: "not_enough", layout: farm.layout };
      layout = normalizeFarmGarage({ ...farm.layout, agriculture: { ...farm.layout.agriculture, inventory: taken } }, { ownedEntitlementIds: farm.owned });
      await saveFarm(client, playerId, layout);
    }
    const name = await sellerName(client, playerId);
    await client.query(
      `insert into farm_market_listings (listing_id, seller_id, seller_name, stack, item_id, quantity, listed_quantity, unit_price, status, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $6, $7, 'open', $8, $9)`,
      [listingId, playerId, name, request.stack, request.itemId, request.quantity, request.unitPrice, new Date(now), new Date(now + LISTING_TTL_MS)],
    );
    const listing = normalizeListingRow({
      listing_id: listingId, seller_id: playerId, seller_name: name, stack: request.stack, item_id: request.itemId,
      quantity: request.quantity, listed_quantity: request.quantity, unit_price: request.unitPrice, status: "open",
      created_at: now, expires_at: now + LISTING_TTL_MS,
    }, now)!;
    return { ok: true, duplicate: false, listing: listingView(listing, playerId, animal), layout };
  });
}

/** POST /games/farm/market/listings/:id/purchases — buy some or all of a listing. */
export async function buyFarmListing(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const listingId = typeof input?.listingId === "string" ? input.listingId : "";
  const purchaseId = typeof input?.purchaseId === "string" ? input.purchaseId : "";
  if (!LISTING_ID.test(listingId)) return { ok: false, error: "not_found" };
  if (!LISTING_PURCHASE_ID.test(purchaseId)) return { ok: false, error: "invalid_purchase" };
  const quantity = Number(input?.quantity);
  return transaction(pool, async (client) => {
    const peek = await client.query(`select seller_id from farm_market_listings where listing_id = $1`, [listingId]);
    const sellerId = peek.rows?.[0]?.seller_id ? String(peek.rows[0].seller_id) : "";
    if (!sellerId) return { ok: false, error: "not_found" };
    await lockPlayers(client, [playerId, sellerId]);
    const done = await client.query(`select * from farm_market_listing_sales where buyer_id = $1 and purchase_id = $2`, [playerId, purchaseId]);
    if (done.rows?.length) {
      const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
      const farm = await lockedFarm(client, playerId);
      return { ok: true, duplicate: true, quantity: Number(done.rows[0].quantity) || 0, total: 0, balance: Number(wallet.rows?.[0]?.balance) || 0, ...(farm ? { layout: farm.layout } : {}) };
    }
    const listing = await lockedListing(client, listingId, now);
    if (!listing) return { ok: false, error: "not_found" };
    const buyer = await dailyTotals(client, playerId, now);
    const seller = await dailyTotals(client, listing.sellerId, now);
    const check = checkListingPurchase({
      listing, buyerId: playerId, quantity,
      buyerSpentToday: buyer.spent, buyerPurchasesToday: buyer.purchases, sellerEarnedToday: seller.earned,
    });
    const view = listingView(listing, playerId);
    if (!check.ok) return { ok: false, error: check.error, listing: view };
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete") return { ok: false, error: "farm_not_initialized", listing: view };
    // An animal must be able to live on the buyer's farm before a ticket moves; goods must fit a stack.
    const landing = listing.stack === "livestock" ? await planListedLanding(client, listing.itemId, { playerId, layout: farm.layout }, true) : null;
    if (landing && !landing.ok) return { ok: false, error: landing.error === "not_found" ? "listing_closed" : landing.error, listing: view };
    const fishLanding = listing.stack === "fish" ? await checkListedFishLanding(client, listing.itemId, playerId, true) : null;
    if (fishLanding && !fishLanding.ok) return { ok: false, error: fishLanding.error === "not_found" ? "listing_closed" : fishLanding.error, listing: view };
    const received = landing || fishLanding ? farm.layout.agriculture.inventory : addListedGoods(farm.layout.agriculture.inventory, listing.stack, listing.itemId, quantity);
    if (!received) return { ok: false, error: "inventory_full", listing: view };
    const { total, fee, proceeds } = check.terms;
    const metadata = { listingId, stack: listing.stack, itemId: listing.itemId, quantity, unitPrice: listing.unitPrice, total, fee };
    const spend = await spendTicketsInTransaction(client, {
      playerId, transactionKey: `farm:listing:buy:${purchaseId}`, amount: total, reason: "farm_listing_purchase",
      metadata: { ...metadata, sellerId: listing.sellerId },
    });
    if (!spend.ok) return { ok: false, error: spend.error, balance: spend.balance, listing: view };
    await awardTicketsInTransaction(client, {
      playerId: listing.sellerId, transactionKey: `farm:listing:sale:${listingId}:${playerId}:${purchaseId}`, amount: proceeds, reason: "farm_listing_sale",
      metadata: { ...metadata, buyerId: playerId, proceeds },
    });
    let layout = farm.layout;
    if (landing?.ok) await writeListedLanding(client, landing.landing);
    else if (fishLanding?.ok) await landListedFish(client, listing.itemId, playerId);
    else {
      layout = normalizeFarmGarage({ ...farm.layout, agriculture: { ...farm.layout.agriculture, inventory: received } }, { ownedEntitlementIds: farm.owned });
      await saveFarm(client, playerId, layout);
    }
    const remaining = listing.quantity - quantity;
    const next: FarmListing = Object.freeze({ ...listing, quantity: remaining, status: remaining > 0 ? "open" : "sold" });
    await writeListing(client, next, now);
    await client.query(
      `insert into farm_market_listing_sales (buyer_id, purchase_id, listing_id, seller_id, stack, item_id, quantity, unit_price, total, fee, proceeds, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [playerId, purchaseId, listingId, listing.sellerId, listing.stack, listing.itemId, quantity, listing.unitPrice, total, fee, proceeds, new Date(now)],
    );
    return { ok: true, duplicate: false, quantity, total, fee, balance: spend.balance, listing: listingView(next, playerId), layout, ...(landing?.ok ? { animal: landing.landing.card, homeId: landing.landing.homeId } : {}), ...(fishLanding?.ok ? { fish: fishLanding.card } : {}) };
  });
}

/** POST /games/farm/market/listings/:id/withdrawal — take a listing down (open or expired) and the goods home. */
export async function withdrawFarmListing(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const listingId = typeof input?.listingId === "string" ? input.listingId : "";
  if (!LISTING_ID.test(listingId)) return { ok: false, error: "not_found" };
  return transaction(pool, async (client) => {
    await lockPlayers(client, [playerId]);
    const listing = await lockedListing(client, listingId, now);
    if (!listing || listing.sellerId !== playerId) return { ok: false, error: "not_found" };
    // "expired" is an open row past its time (normalizeListingRow); a closed row, or one with nothing left, cannot come down again.
    if ((listing.status !== "open" && listing.status !== "expired") || listing.quantity <= 0) return { ok: false, error: "listing_closed", listing: listingView(listing, playerId) };
    const farm = await lockedFarm(client, playerId);
    if (!farm) return { ok: false, error: "farm_not_initialized" };
    let layout = farm.layout;
    if (listing.stack === "livestock") {
      // Home is never refused: to the first place with room, else onto the field to wait for one.
      const landing = await planListedLanding(client, listing.itemId, { playerId, layout: farm.layout }, false);
      if (landing.ok) await writeListedLanding(client, landing.landing);
    } else if (listing.stack === "fish") {
      // Back into the creel, never refused (even past its capacity: it was the seller's already).
      if ((await checkListedFishLanding(client, listing.itemId, playerId, false)).ok) await landListedFish(client, listing.itemId, playerId);
    } else {
      const home = addListedGoods(farm.layout.agriculture.inventory, listing.stack, listing.itemId, listing.quantity);
      if (!home) return { ok: false, error: "inventory_full", listing: listingView(listing, playerId) };
      layout = normalizeFarmGarage({ ...farm.layout, agriculture: { ...farm.layout.agriculture, inventory: home } }, { ownedEntitlementIds: farm.owned });
      await saveFarm(client, playerId, layout);
    }
    const closed: FarmListing = Object.freeze({ ...listing, quantity: 0, status: "withdrawn" });
    await writeListing(client, closed, now);
    return { ok: true, returned: listing.quantity, listing: listingView(closed, playerId), layout };
  });
}

/** A fresh listing id for a client that did not bring one (tests, tools). */
export function newListingId(): string {
  return `listing-${randomUUID()}`;
}
