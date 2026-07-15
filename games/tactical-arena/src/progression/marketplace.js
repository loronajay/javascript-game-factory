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
  Object.freeze({ id: "skins", label: "Skins" }),
  Object.freeze({ id: "boosts", label: "Boosts" }),
]);

const UNIT_PRICE_BY_CLASS = Object.freeze({
  melee: 450,
  ranger: 450,
  support: 550,
  mage: 600,
  tank: 700,
});

const UNIT_PRICE_OVERRIDES = Object.freeze({
  angel: 800,
  "big-brother": 750,
  blacksword: 750,
  clod: 500,
  gargoyle: 800,
  juggernaut: 800,
  king: 900,
  "little-brother": 700,
  "mother-nature": 900,
  nemesis: 850,
  ronin: 700,
  summoner: 850,
  treant: 800,
});

export function unitValorCost(typeOrDef) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const def = UNIT_TYPES[type];
  if (!def || def.summon) return null;
  return UNIT_PRICE_OVERRIDES[type] ?? UNIT_PRICE_BY_CLASS[def.classType] ?? 650;
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

export function getUnitOffer(type, storage = globalThis.localStorage) {
  const def = UNIT_TYPES[type];
  if (!def || def.summon) return null;
  const cost = unitValorCost(type);
  const owned = isProgressUnitUnlocked(type, storage);
  return Object.freeze({
    id: `unit:${type}`,
    kind: "unit",
    type,
    name: def.name,
    classType: def.classType,
    owned,
    purchasable: !owned && Number.isFinite(cost),
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
  return Object.freeze({
    id: skin.id,
    kind: "skin",
    type,
    slug,
    name: skin.name,
    unitName: def.name,
    collectionName: skin.collectionName,
    rarity: skin.rarity,
    sku: skin.sku,
    entitlementId: skin.entitlementId,
    owned: skin.unlocked,
    price: skin.price,
  });
}

export function getSkinOffers(storage = globalThis.localStorage) {
  return Object.freeze(UNIT_TYPE_KEYS.flatMap((type) =>
    getUnitSkins(type, storage).map((skin) => getSkinOffer(type, skin.slug, storage)).filter(Boolean)));
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
