import { UNIT_TYPES } from "../core/unitCatalog.js";
import { getUnitSkins } from "../ui/skinModel.js";
import { UNIT_TYPE_KEYS, groupedUnitTypes } from "../ui/squadModel.js";
import {
  VALOR_RESOURCE,
  isProgressUnitUnlocked,
  readUnlockProgress,
  writeUnlockProgress,
} from "./unlocks.js";

export const SHOP_TABS = Object.freeze([
  Object.freeze({ id: "units", label: "Units" }),
  Object.freeze({ id: "skin-packs", label: "Skin Packs" }),
  Object.freeze({ id: "skins", label: "Skins" }),
  Object.freeze({ id: "boosts", label: "Boosts" }),
]);

const UNIT_VALOR_COST_BY_STAR = Object.freeze({
  1: 450,
  2: 650,
  3: 850,
  4: 1150,
});

const UNIT_PREMIUM_PRICE_CENTS_BY_STAR = Object.freeze({
  1: 99,
  2: 199,
  3: 299,
  4: 399,
});

const UNIT_VALOR_STAR_BY_TYPE = Object.freeze({
  juggernaut: 1,
  "big-brother": 1,
  "witch-doctor": 1,
  monk: 1,

  paladin: 2,
  sniper: 2,
  miner: 2,
  necromancer: 2,
  virus: 2,
  clod: 2,
  gargoyle: 2,
  "father-time": 2,

  "fat-knight": 3,
  ronin: 3,
  angel: 3,
  "fat-bowman": 3,
  "little-brother": 3,
  king: 3,
  "fat-cleric": 3,
  "fat-wizard": 3,
  treant: 3,
  "riot-cop": 3,

  blacksword: 4,
  "mother-nature": 4,
  nemesis: 4,
  summoner: 4,
});

const SKIN_VALOR_PER_USD = 850;
const SKIN_VALOR_CURVE_EXPONENT = 0.88;

const SKIN_PACK_PRICES = Object.freeze({
  "summer-vibes": Object.freeze({ cents: 1499, valor: 12500 }),
  halloween: Object.freeze({ cents: 2499, valor: 19500 }),
  arcane: Object.freeze({ cents: 1999, valor: 16000 }),
  "blood-moon": Object.freeze({ cents: 2499, valor: 19000 }),
  "void-dweller": Object.freeze({ cents: 2499, valor: 19500 }),
  "desert-warriors": Object.freeze({ cents: 599, valor: 4750 }),
  geisha: Object.freeze({ cents: 1199, valor: 8750 }),
  "riot-cop": Object.freeze({ cents: 899, valor: 6750 }),
  "southern-kingdom": Object.freeze({ cents: 999, valor: 7250 }),
  "grim-reaper": Object.freeze({ cents: 499, valor: 3750 }),
  infernal: Object.freeze({ cents: 499, valor: 3750 }),
  medieval: Object.freeze({ cents: 299, valor: 2500 }),
});

function unitStar(typeOrDef) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const def = UNIT_TYPES[type];
  if (!def || def.summon) return null;
  return UNIT_VALOR_STAR_BY_TYPE[type] ?? null;
}

export function unitValorCost(typeOrDef) {
  return UNIT_VALOR_COST_BY_STAR[unitStar(typeOrDef)] ?? null;
}

export function unitPremiumPrice(typeOrDef) {
  const cents = UNIT_PREMIUM_PRICE_CENTS_BY_STAR[unitStar(typeOrDef)] ?? null;
  if (!cents) return null;
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  return Object.freeze({
    kind: "premium",
    sku: `ta.unit.${type}`,
    currency: "USD",
    cents,
  });
}

export function formatValor(amount) {
  return `${Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString("en-US")} ${VALOR_RESOURCE.name}`;
}

export function formatValorAmount(amount) {
  return Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString("en-US");
}

export function formatPremiumPrice(price) {
  if (!price || price.kind !== "premium") return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency ?? "USD",
  }).format((Number(price.cents) || 0) / 100);
}

export function skinValorCost(price) {
  if (!price || price.kind !== "premium") return null;
  const cents = Math.max(0, Math.floor(Number(price.cents) || 0));
  if (!cents) return null;
  const dollars = cents / 100;
  return roundValorAmount(SKIN_VALOR_PER_USD * (dollars ** SKIN_VALOR_CURVE_EXPONENT));
}

export function getUnitOffer(type, storage = globalThis.localStorage) {
  const def = UNIT_TYPES[type];
  if (!def || def.summon) return null;
  const cost = unitValorCost(type);
  const premiumPrice = unitPremiumPrice(type);
  const owned = isProgressUnitUnlocked(type, storage);
  return Object.freeze({
    id: `unit:${type}`,
    kind: "unit",
    type,
    name: def.name,
    classType: def.classType,
    sku: premiumPrice?.sku ?? `ta.unit.${type}`,
    entitlementId: `unit:${type}`,
    owned,
    purchasable: !owned && Number.isFinite(cost),
    premiumPrice,
    price: Object.freeze({
      kind: "valor",
      resourceId: VALOR_RESOURCE.id,
      amount: cost,
    }),
  });
}

export function getUnitOffers(storage = globalThis.localStorage) {
  return Object.freeze(groupedUnitTypes(UNIT_TYPE_KEYS).flatMap((group) =>
    group.types.map((type) => getUnitOffer(type, storage)).filter(Boolean)));
}

export function getSkinOffer(type, slug, storage = globalThis.localStorage) {
  const skin = getUnitSkins(type, storage).find((entry) => entry.slug === slug) ?? null;
  const def = UNIT_TYPES[type];
  if (!skin || !def) return null;
  const valorAmount = skinValorCost(skin.price);
  return Object.freeze({
    id: skin.id,
    kind: "skin",
    type,
    slug,
    name: skin.name,
    unitName: def.name,
    collectionName: skin.collectionName,
    rarity: skin.rarity,
    packId: skin.packId,
    packName: skin.packName,
    availabilityNote: skin.availabilityNote,
    donationNote: skin.donationNote,
    sku: skin.sku,
    entitlementId: skin.entitlementId,
    owned: skin.unlocked,
    price: skin.price,
    valorPrice: valorAmount == null ? null : Object.freeze({
      kind: "valor",
      resourceId: VALOR_RESOURCE.id,
      amount: valorAmount,
    }),
  });
}

export function getSkinOffers(storage = globalThis.localStorage) {
  return Object.freeze(UNIT_TYPE_KEYS.flatMap((type) =>
    getUnitSkins(type, storage).map((skin) => getSkinOffer(type, skin.slug, storage)).filter(Boolean)));
}

function rarityCounts(offers) {
  const counts = {};
  for (const offer of offers) counts[offer.rarity] = (counts[offer.rarity] ?? 0) + 1;
  return Object.freeze(counts);
}

function prorateAmount(baseAmount, totalAmount, unownedAmount, { roundTo = 1 } = {}) {
  if (!Number.isFinite(baseAmount) || !Number.isFinite(totalAmount) || !Number.isFinite(unownedAmount)) return null;
  if (totalAmount <= 0 || unownedAmount <= 0) return 0;
  const raw = baseAmount * (unownedAmount / totalAmount);
  return Math.max(roundTo, Math.round(raw / roundTo) * roundTo);
}

export function getSkinPackOffers(storage = globalThis.localStorage) {
  const offersByPack = new Map();
  for (const offer of getSkinOffers(storage)) {
    if (!offer.packId) continue;
    const list = offersByPack.get(offer.packId) ?? [];
    list.push(offer);
    offersByPack.set(offer.packId, list);
  }

  return Object.freeze([...offersByPack.entries()]
    .map(([packId, offers]) => skinPackOffer(packId, offers))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name) || left.packId.localeCompare(right.packId)));
}

export function getSkinPackOffer(packId, storage = globalThis.localStorage) {
  return getSkinPackOffers(storage).find((offer) => offer.packId === packId) ?? null;
}

function skinPackOffer(packId, offers) {
  const basePrice = SKIN_PACK_PRICES[packId];
  if (!basePrice || !offers.length) return null;
  const sortedOffers = [...offers].sort((left, right) =>
    left.type.localeCompare(right.type) || left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug));
  const unownedSkins = sortedOffers.filter((offer) => !offer.owned);
  const individualPriceCents = sortedOffers.reduce((sum, offer) => sum + (offer.price?.cents ?? 0), 0);
  const unownedPriceCents = unownedSkins.reduce((sum, offer) => sum + (offer.price?.cents ?? 0), 0);
  const individualValorAmount = sortedOffers.reduce((sum, offer) => sum + (offer.valorPrice?.amount ?? 0), 0);
  const unownedValorAmount = unownedSkins.reduce((sum, offer) => sum + (offer.valorPrice?.amount ?? 0), 0);
  const cents = prorateAmount(basePrice.cents, individualPriceCents, unownedPriceCents);
  const valor = prorateAmount(basePrice.valor, individualValorAmount, unownedValorAmount, { roundTo: 50 });
  const first = sortedOffers[0];
  const sku = `ta.skinpack.${packId}`;
  return Object.freeze({
    id: `skin-pack:${packId}`,
    kind: "skin-pack",
    packId,
    name: first.packName,
    collectionName: first.packName,
    sku,
    entitlementId: `skin-pack:${packId}`,
    skinCount: sortedOffers.length,
    ownedSkinCount: sortedOffers.length - unownedSkins.length,
    unownedSkinCount: unownedSkins.length,
    owned: unownedSkins.length === 0,
    rarityCounts: rarityCounts(sortedOffers),
    skins: Object.freeze(sortedOffers),
    unownedSkins: Object.freeze(unownedSkins),
    individualPrice: Object.freeze({
      kind: "premium",
      currency: "USD",
      cents: individualPriceCents,
    }),
    individualValorPrice: Object.freeze({
      kind: "valor",
      resourceId: VALOR_RESOURCE.id,
      amount: individualValorAmount,
    }),
    price: Object.freeze({
      kind: "premium",
      sku,
      currency: "USD",
      cents,
    }),
    valorPrice: Object.freeze({
      kind: "valor",
      resourceId: VALOR_RESOURCE.id,
      amount: valor,
    }),
  });
}

export function groupSkinOffersByClassAndType(offers = []) {
  const offersByType = new Map();
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!offer || !UNIT_TYPES[offer.type]) continue;
    const list = offersByType.get(offer.type) ?? [];
    list.push(offer);
    offersByType.set(offer.type, list);
  }
  return Object.freeze(groupedUnitTypes([...offersByType.keys()]).map((group) => Object.freeze({
    ...group,
    units: Object.freeze(group.types.map((type) => Object.freeze({
      type,
      name: UNIT_TYPES[type].name,
      offers: Object.freeze([...(offersByType.get(type) ?? [])]),
    })).filter((unit) => unit.offers.length > 0)),
  })).filter((group) => group.units.length > 0));
}

export function getShopCatalog(storage = globalThis.localStorage) {
  const progress = readUnlockProgress(storage);
  return Object.freeze({
    tabs: SHOP_TABS,
    resource: Object.freeze({
      ...VALOR_RESOURCE,
      balance: progress.valorBalance,
    }),
    units: getUnitOffers(storage),
    skinPacks: getSkinPackOffers(storage),
    skins: getSkinOffers(storage),
    boosts: Object.freeze([]),
  });
}

export function purchaseUnitWithValor(storage = globalThis.localStorage, type) {
  const offer = getUnitOffer(type, storage);
  const progress = readUnlockProgress(storage);
  if (!offer) return { accepted: false, errorCode: "UNIT_NOT_FOR_SALE", progress, offer: null };
  if (offer.owned) return { accepted: false, errorCode: "UNIT_ALREADY_OWNED", progress, offer };
  if (!offer.purchasable) return { accepted: false, errorCode: "UNIT_NOT_FOR_SALE", progress, offer };
  if (progress.valorBalance < offer.price.amount) {
    return { accepted: false, errorCode: "INSUFFICIENT_VALOR", progress, offer };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance - offer.price.amount,
    unlockedUnits: [...progress.unlockedUnits, type],
  });
  return { accepted: true, progress: next, offer: getUnitOffer(type, storage) };
}

export function purchaseSkinWithValor(storage = globalThis.localStorage, type, slug) {
  const offer = getSkinOffer(type, slug, storage);
  const progress = readUnlockProgress(storage);
  if (!offer || !offer.valorPrice) return { accepted: false, errorCode: "SKIN_NOT_FOR_SALE", progress, offer: null };
  if (offer.owned) return { accepted: false, errorCode: "SKIN_ALREADY_OWNED", progress, offer };
  if (progress.valorBalance < offer.valorPrice.amount) {
    return { accepted: false, errorCode: "INSUFFICIENT_VALOR", progress, offer };
  }
  const selected = { type: offer.type, slug: offer.slug };
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance - offer.valorPrice.amount,
    purchasedSkins: [...progress.purchasedSkins, selected],
  });
  return { accepted: true, progress: next, offer: getSkinOffer(type, slug, storage) };
}

export function purchaseSkinPackWithValor(storage = globalThis.localStorage, packId) {
  const offer = getSkinPackOffer(packId, storage);
  const progress = readUnlockProgress(storage);
  if (!offer || !offer.valorPrice) return { accepted: false, errorCode: "SKIN_PACK_NOT_FOR_SALE", progress, offer: null };
  if (offer.owned || offer.unownedSkinCount <= 0) {
    return { accepted: false, errorCode: "SKIN_PACK_ALREADY_OWNED", progress, offer };
  }
  if (progress.valorBalance < offer.valorPrice.amount) {
    return { accepted: false, errorCode: "INSUFFICIENT_VALOR", progress, offer };
  }
  const purchasedSkins = [
    ...progress.purchasedSkins,
    ...offer.unownedSkins.map((skin) => ({ type: skin.type, slug: skin.slug })),
  ];
  const next = writeUnlockProgress(storage, {
    ...progress,
    valorBalance: progress.valorBalance - offer.valorPrice.amount,
    purchasedSkins,
  });
  return { accepted: true, progress: next, offer: getSkinPackOffer(packId, storage) };
}

function roundValorAmount(amount) {
  return Math.max(0, Math.round((Number(amount) || 0) / 50) * 50);
}
