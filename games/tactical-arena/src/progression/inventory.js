import { getConsumableOffer, getConsumableOffers } from "./marketplace.js";

export const INVENTORY_STORAGE_KEY = "tacticalArenaInventoryV1";

function defaultStorage() {
  return globalThis.localStorage;
}

function nowIso(value = null) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : new Date(0).toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
  }
  return new Date().toISOString();
}

function addHours(iso, hours) {
  const ms = new Date(iso).getTime() + Math.max(0, Number(hours) || 0) * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

function timestamp(value = null) {
  return new Date(nowIso(value)).getTime();
}

function normalizeQuantities(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const offer of getConsumableOffers()) {
    const quantity = Math.max(0, Math.floor(Number(value[offer.id]) || 0));
    if (quantity > 0) out[offer.id] = quantity;
  }
  return out;
}

function normalizeActivation(value) {
  if (!value || typeof value !== "object") return null;
  const offer = getConsumableOffer(value.itemId);
  if (!offer) return null;
  const activatedAt = nowIso(value.activatedAt);
  const status = ["pending", "active", "resolved", "expired"].includes(value.status) ? value.status : "pending";
  const startsAt = value.startsAt ? nowIso(value.startsAt) : null;
  const expiresAt = value.expiresAt ? nowIso(value.expiresAt) : null;
  return Object.freeze({
    id: typeof value.id === "string" && value.id ? value.id : `${offer.id}:${activatedAt}`,
    itemId: offer.id,
    status,
    activatedAt,
    startsAt,
    expiresAt,
    activationTrigger: offer.activationTrigger,
    durationHours: offer.durationHours,
  });
}

function normalizeActivations(value) {
  return (Array.isArray(value) ? value : []).map(normalizeActivation).filter(Boolean);
}

function inventoryFallback() {
  return {
    consumables: {},
    activeConsumables: [],
  };
}

export function normalizeInventory(value = {}) {
  return {
    consumables: normalizeQuantities(value.consumables),
    activeConsumables: normalizeActivations(value.activeConsumables),
  };
}

export function readInventory(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(INVENTORY_STORAGE_KEY);
    if (!raw) return inventoryFallback();
    return normalizeInventory(JSON.parse(raw));
  } catch {
    return inventoryFallback();
  }
}

export function writeInventory(storage, inventory) {
  const normalized = normalizeInventory(inventory);
  try {
    storage?.setItem?.(INVENTORY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Inventory storage is best-effort so menu rendering never crashes.
  }
  return normalized;
}

export function getInventoryCatalog(storage = defaultStorage()) {
  const inventory = readInventory(storage);
  const items = getConsumableOffers().map((offer) => Object.freeze({
    ...offer,
    quantity: inventory.consumables[offer.id] ?? 0,
  }));
  return Object.freeze({
    items: Object.freeze(items),
    ownedItems: Object.freeze(items.filter((item) => item.quantity > 0)),
    activeConsumables: Object.freeze(inventory.activeConsumables.map((activation) => Object.freeze({
      ...activation,
      offer: getConsumableOffer(activation.itemId),
    }))),
  });
}

export function grantConsumable(storage = defaultStorage(), itemId, quantity = 1) {
  const offer = getConsumableOffer(itemId);
  const inventory = readInventory(storage);
  if (!offer) return { accepted: false, errorCode: "CONSUMABLE_NOT_FOUND", inventory };
  const amount = Math.max(1, Math.floor(Number(quantity) || 1));
  const next = writeInventory(storage, {
    ...inventory,
    consumables: {
      ...inventory.consumables,
      [offer.id]: (inventory.consumables[offer.id] ?? 0) + amount,
    },
  });
  return { accepted: true, inventory: next, offer };
}

export function activateConsumable(storage = defaultStorage(), itemId, options = {}) {
  const offer = getConsumableOffer(itemId);
  const inventory = readInventory(storage);
  if (!offer) return { accepted: false, errorCode: "CONSUMABLE_NOT_FOUND", inventory, offer: null };
  const quantity = inventory.consumables[offer.id] ?? 0;
  if (quantity <= 0) return { accepted: false, errorCode: "CONSUMABLE_NOT_OWNED", inventory, offer };

  const activatedAt = nowIso(options.now);
  const status = offer.activationTrigger === "immediate" ? "resolved" : "pending";
  const startsAt = offer.activationTrigger === "immediate" ? activatedAt : null;
  const expiresAt = offer.durationHours && startsAt ? addHours(startsAt, offer.durationHours) : null;
  const activation = Object.freeze({
    id: `${offer.id}:${new Date(activatedAt).getTime()}:${inventory.activeConsumables.length}`,
    itemId: offer.id,
    status,
    activatedAt,
    startsAt,
    expiresAt,
    activationTrigger: offer.activationTrigger,
    durationHours: offer.durationHours,
  });
  const consumables = { ...inventory.consumables, [offer.id]: quantity - 1 };
  if (consumables[offer.id] <= 0) delete consumables[offer.id];
  const next = writeInventory(storage, {
    ...inventory,
    consumables,
    activeConsumables: [...inventory.activeConsumables, activation],
  });
  return { accepted: true, inventory: next, offer, activation };
}

export function startPendingConsumables(storage = defaultStorage(), trigger, options = {}) {
  const inventory = readInventory(storage);
  const startedAt = nowIso(options.now);
  const started = [];
  const activeConsumables = inventory.activeConsumables.map((activation) => {
    if (activation.status !== "pending" || activation.activationTrigger !== trigger) return activation;
    const offer = getConsumableOffer(activation.itemId);
    const next = Object.freeze({
      ...activation,
      status: "active",
      startsAt: startedAt,
      expiresAt: offer?.durationHours ? addHours(startedAt, offer.durationHours) : null,
    });
    started.push(next);
    return next;
  });
  const next = writeInventory(storage, { ...inventory, activeConsumables });
  return { inventory: next, started: Object.freeze(started) };
}

export function getActiveConsumableEffects(storage = defaultStorage(), effectKind, options = {}) {
  const at = timestamp(options.now);
  const inventory = readInventory(storage);
  return Object.freeze(inventory.activeConsumables
    .filter((activation) => activation.status === "active" || activation.status === "resolved")
    .filter((activation) => !activation.expiresAt || timestamp(activation.expiresAt) > at)
    .map((activation) => {
      const offer = getConsumableOffer(activation.itemId);
      return offer ? Object.freeze({ activation, offer, effect: offer.effect }) : null;
    })
    .filter((entry) => entry && (!effectKind || entry.effect?.kind === effectKind)));
}

export function getActiveValorBoostPercent(storage = defaultStorage(), options = {}) {
  return getActiveConsumableEffects(storage, "valor-boost", options)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.effect.percentBonus) || 0), 0);
}

export function getActiveCampaignDamageBoost(storage = defaultStorage(), options = {}) {
  return getActiveConsumableEffects(storage, "campaign-damage-boost", options)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.effect.damageBonus) || 0), 0);
}

export function startValorBoostsForGain(storage = defaultStorage(), options = {}) {
  const started = startPendingConsumables(storage, "valor-gained", options);
  return {
    ...started,
    percentBonus: getActiveValorBoostPercent(storage, options),
  };
}

export function startCampaignDamageBoosts(storage = defaultStorage(), options = {}) {
  const started = startPendingConsumables(storage, "campaign-mission-started", options);
  return {
    ...started,
    damageBonus: getActiveCampaignDamageBoost(storage, options),
  };
}
