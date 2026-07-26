// Server-authoritative consumable catalog for Tactical Arena.
//
// Consumables are the one shop kind that is NOT an entitlement: they stack, they are spent,
// and some of them grant something else when spent. That means two things have to be
// server-side. First, pricing — the Stripe path must never trust a client-named amount
// (same rule as services/valor-catalog). Second, the roll: a "Random Epic Skin" that picks
// its skin on the client would let a tampered client name the skin it wants, so the pick
// happens here and the entitlement is granted inside the same transaction that spends the
// item.
//
// This module is deliberately dependency-free (it does NOT import services/payments, which
// imports it) — the skin catalog is passed in by the caller instead. The offers below MUST
// stay in lockstep with games/tactical-arena/src/progression/marketplace.js CONSUMABLE_OFFERS
// so displayed prices match charges and displayed effects match what is granted.

import { randomInt } from "node:crypto";

// Skin rarity is a pure function of the skin's USD price, matching the client's
// SKIN_PRICE_BY_RARITY table in games/tactical-arena/src/ui/skinModel.js.
const SKIN_RARITY_BY_CENTS: Record<number, string> = Object.freeze({
  99: "common",
  199: "rare",
  299: "epic",
  399: "legendary",
  499: "legendary+",
});

const CONSUMABLE_CATALOG = Object.freeze([
  Object.freeze({
    id: "valor-boost-1",
    sku: "ta.consumable.valor-boost-1",
    name: "Valor Boost I",
    amountCents: 199,
    currency: "usd",
    durationHours: 24,
    activationTrigger: "valor-gained",
    effect: Object.freeze({ kind: "valor-boost", percentBonus: 20 }),
  }),
  Object.freeze({
    id: "valor-boost-2",
    sku: "ta.consumable.valor-boost-2",
    name: "Valor Boost II",
    amountCents: 299,
    currency: "usd",
    durationHours: 24,
    activationTrigger: "valor-gained",
    effect: Object.freeze({ kind: "valor-boost", percentBonus: 40 }),
  }),
  Object.freeze({
    id: "valor-boost-3",
    sku: "ta.consumable.valor-boost-3",
    name: "Valor Boost III",
    amountCents: 399,
    currency: "usd",
    durationHours: 24,
    activationTrigger: "valor-gained",
    effect: Object.freeze({ kind: "valor-boost", percentBonus: 65 }),
  }),
  Object.freeze({
    id: "valor-boost-x",
    sku: "ta.consumable.valor-boost-x",
    name: "Valor Boost X",
    amountCents: 599,
    currency: "usd",
    durationHours: 24,
    activationTrigger: "valor-gained",
    effect: Object.freeze({ kind: "valor-boost", percentBonus: 100 }),
  }),
  Object.freeze({
    id: "random-rare-skin",
    sku: "ta.consumable.random-rare-skin",
    name: "Random Rare Skin",
    amountCents: 99,
    currency: "usd",
    durationHours: null,
    activationTrigger: "immediate",
    effect: Object.freeze({ kind: "random-unowned-skin", rarity: "rare", count: 1 }),
  }),
  Object.freeze({
    id: "random-epic-skin",
    sku: "ta.consumable.random-epic-skin",
    name: "Random Epic Skin",
    amountCents: 199,
    currency: "usd",
    durationHours: null,
    activationTrigger: "immediate",
    effect: Object.freeze({ kind: "random-unowned-skin", rarity: "epic", count: 1 }),
  }),
  Object.freeze({
    id: "random-legendary-skin",
    sku: "ta.consumable.random-legendary-skin",
    name: "Random Legendary Skin",
    amountCents: 299,
    currency: "usd",
    durationHours: null,
    activationTrigger: "immediate",
    effect: Object.freeze({ kind: "random-unowned-skin", rarity: "legendary", count: 1 }),
  }),
  Object.freeze({
    id: "five-random-epic-skins",
    sku: "ta.consumable.five-random-epic-skins",
    name: "5 Random Epic Skins",
    amountCents: 999,
    currency: "usd",
    durationHours: null,
    activationTrigger: "immediate",
    effect: Object.freeze({ kind: "random-unowned-skin", rarity: "epic", count: 5 }),
  }),
  Object.freeze({
    id: "campaign-damage-boost",
    sku: "ta.consumable.campaign-damage-boost",
    name: "Campaign Boost",
    amountCents: 99,
    currency: "usd",
    durationHours: 24,
    activationTrigger: "campaign-mission-started",
    effect: Object.freeze({ kind: "campaign-damage-boost", damageBonus: 2 }),
  }),
]);

// The most a single activation may grant, whatever the catalog says. A guard against a
// future catalog typo turning one purchase into an unbounded skin grant.
export const MAX_CONSUMABLE_SKIN_GRANTS = 10;

function cleanText(value: any, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function getConsumableOffers(): readonly any[] {
  return CONSUMABLE_CATALOG;
}

export function getConsumableOffer(itemId: any): any {
  const id = cleanText(itemId, 120);
  return CONSUMABLE_CATALOG.find((offer) => offer.id === id) || null;
}

export function getConsumableOfferBySku(sku: any): any {
  const cleanSku = cleanText(sku, 200);
  return CONSUMABLE_CATALOG.find((offer) => offer.sku === cleanSku) || null;
}

export function skinRarity(amountCents: any): string {
  const cents = Math.floor(Number(amountCents));
  return SKIN_RARITY_BY_CENTS[cents] || "";
}

// Uniform draw without replacement over the skins of `rarity` the player does not own yet.
// Returns fewer than `count` (possibly zero) when the pool is short — the caller decides
// whether a short/empty roll is still worth spending the item on.
export function selectRandomUnownedSkins(
  skinCatalog: readonly any[],
  { rarity, count = 1, ownedEntitlementIds = new Set<string>(), randomIndex = randomInt }: any = {},
): any[] {
  const wantedRarity = cleanText(rarity, 40);
  const wanted = Math.max(0, Math.min(MAX_CONSUMABLE_SKIN_GRANTS, Math.floor(Number(count)) || 0));
  if (!wantedRarity || !wanted) return [];

  const pool = (Array.isArray(skinCatalog) ? skinCatalog : []).filter((skin: any) =>
    skinRarity(skin?.amountCents) === wantedRarity && !ownedEntitlementIds.has(skin?.entitlementId));

  const picks: any[] = [];
  while (picks.length < wanted && pool.length) {
    const index = randomIndex(pool.length);
    picks.push(pool[index]);
    pool.splice(index, 1);
  }
  return picks;
}
