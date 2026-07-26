import test from "node:test";
import assert from "node:assert/strict";

import {
  activateConsumable,
  getActiveCampaignDamageBoost,
  getActiveValorBoostPercent,
  getInventoryCatalog,
  grantConsumable,
  mergeServerInventory,
  readInventory,
  recordConsumableActivation,
  startPendingConsumables,
} from "../src/progression/inventory.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("inventory catalog starts empty but knows every consumable offer", () => {
  const catalog = getInventoryCatalog(storageAdapter());

  assert.equal(catalog.items.length, 9);
  assert.equal(catalog.ownedItems.length, 0);
  assert.equal(catalog.activeConsumables.length, 0);
  assert.ok(catalog.items.some((item) => item.id === "valor-boost-1" && item.quantity === 0));
});

test("granting and activating a consumable decrements quantity and creates a pending activation", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 2);

  let catalog = getInventoryCatalog(storage);
  const item = catalog.items.find((entry) => entry.id === "valor-boost-1");
  assert.equal(item.quantity, 2);
  assert.equal(catalog.ownedItems.length, 1);

  const result = activateConsumable(storage, "valor-boost-1", { now: "2026-07-17T12:00:00.000Z" });
  assert.equal(result.accepted, true);
  assert.equal(result.activation.status, "pending");
  assert.equal(result.activation.activationTrigger, "valor-gained");
  assert.equal(result.activation.startsAt, null);
  assert.equal(result.activation.expiresAt, null);

  catalog = getInventoryCatalog(storage);
  assert.equal(catalog.items.find((entry) => entry.id === "valor-boost-1").quantity, 1);
  assert.equal(catalog.activeConsumables.length, 1);
});

test("pending 24 hour consumables start from their first matching gameplay trigger", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "campaign-damage-boost", 1);
  activateConsumable(storage, "campaign-damage-boost", { now: "2026-07-17T12:00:00.000Z" });

  const skipped = startPendingConsumables(storage, "valor-gained", { now: "2026-07-17T13:00:00.000Z" });
  assert.equal(skipped.started.length, 0);
  assert.equal(readInventory(storage).activeConsumables[0].status, "pending");

  const result = startPendingConsumables(storage, "campaign-mission-started", {
    now: "2026-07-17T14:30:00.000Z",
  });
  assert.equal(result.started.length, 1);

  const active = readInventory(storage).activeConsumables[0];
  assert.equal(active.status, "active");
  assert.equal(active.startsAt, "2026-07-17T14:30:00.000Z");
  assert.equal(active.expiresAt, "2026-07-18T14:30:00.000Z");
});

test("owned timed boosts do not start or apply until activated from inventory", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 1);
  grantConsumable(storage, "campaign-damage-boost", 1);

  const valorTrigger = startPendingConsumables(storage, "valor-gained", { now: "2026-07-17T13:00:00.000Z" });
  const campaignTrigger = startPendingConsumables(storage, "campaign-mission-started", {
    now: "2026-07-17T14:00:00.000Z",
  });

  assert.equal(valorTrigger.started.length, 0);
  assert.equal(campaignTrigger.started.length, 0);
  assert.equal(readInventory(storage).consumables["valor-boost-1"], 1);
  assert.equal(readInventory(storage).consumables["campaign-damage-boost"], 1);
  assert.equal(getActiveValorBoostPercent(storage, { now: "2026-07-17T14:30:00.000Z" }), 0);
  assert.equal(getActiveCampaignDamageBoost(storage, { now: "2026-07-17T14:30:00.000Z" }), 0);
});

test("active boost effect helpers ignore expired activations", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 1);
  activateConsumable(storage, "valor-boost-1", { now: "2026-07-17T12:00:00.000Z" });
  startPendingConsumables(storage, "valor-gained", { now: "2026-07-17T13:00:00.000Z" });

  assert.equal(getActiveValorBoostPercent(storage, { now: "2026-07-18T12:59:00.000Z" }), 20);
  assert.equal(getActiveValorBoostPercent(storage, { now: "2026-07-18T13:00:00.000Z" }), 0);
});

test("activation rejects invalid or unowned consumables", () => {
  const storage = storageAdapter();

  assert.equal(activateConsumable(storage, "valor-boost-1").errorCode, "CONSUMABLE_NOT_OWNED");
  assert.equal(activateConsumable(storage, "bogus").errorCode, "CONSUMABLE_NOT_FOUND");
});

test("the server inventory snapshot is authoritative for a signed-in account", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 5);
  grantConsumable(storage, "campaign-damage-boost", 1);

  mergeServerInventory(storage, {
    inventoryItems: [{ itemId: "valor-boost-1", quantity: 2 }, { itemId: "random-epic-skin", quantity: 1 }],
  }, { authoritative: true });

  const inventory = readInventory(storage);
  assert.equal(inventory.consumables["valor-boost-1"], 2, "the server count replaces an inflated local one");
  assert.equal(inventory.consumables["random-epic-skin"], 1);
  assert.equal(inventory.consumables["campaign-damage-boost"], undefined, "injected local items self-heal away");
});

test("an unconfirmed sync keeps the higher count so an unsynced grant is never dropped", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 5);

  mergeServerInventory(storage, { inventoryItems: [{ itemId: "valor-boost-1", quantity: 2 }] });

  assert.equal(readInventory(storage).consumables["valor-boost-1"], 5);
});

test("the server snapshot cannot introduce an item the catalog does not know", () => {
  const storage = storageAdapter();

  mergeServerInventory(storage, {
    inventoryItems: [{ itemId: "infinite-valor", quantity: 99 }],
  }, { authoritative: true });

  assert.deepEqual(readInventory(storage).consumables, {});
});

test("activation records survive the server merge so armed boosts keep their timers", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "valor-boost-1", 1);
  activateConsumable(storage, "valor-boost-1", { now: "2026-07-17T12:00:00.000Z" });

  mergeServerInventory(storage, { inventoryItems: [] }, { authoritative: true });
  startPendingConsumables(storage, "valor-gained", { now: "2026-07-17T13:00:00.000Z" });

  assert.equal(getActiveValorBoostPercent(storage, { now: "2026-07-17T14:00:00.000Z" }), 20);
});

test("recording an activation arms the boost without spending a second item", () => {
  const storage = storageAdapter();
  grantConsumable(storage, "campaign-damage-boost", 1);

  // The server-authoritative path: the server already decremented the quantity.
  const result = recordConsumableActivation(storage, "campaign-damage-boost", { now: "2026-07-17T12:00:00.000Z" });

  assert.equal(result.accepted, true);
  assert.equal(result.activation.status, "pending");
  assert.equal(readInventory(storage).consumables["campaign-damage-boost"], 1, "quantity is the server's to change");
  startPendingConsumables(storage, "campaign-mission-started", { now: "2026-07-17T13:00:00.000Z" });
  assert.equal(getActiveCampaignDamageBoost(storage, { now: "2026-07-17T14:00:00.000Z" }), 2);
});
