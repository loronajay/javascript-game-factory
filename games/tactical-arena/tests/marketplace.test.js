import test from "node:test";
import assert from "node:assert/strict";

import { STARTING_VALOR_BALANCE, readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";
import {
  formatPremiumPrice,
  formatValor,
  getShopCatalog,
  groupSkinOffersByClassAndType,
  getSkinOffer,
  getUnitOffer,
  purchaseUnitWithValor,
} from "../src/progression/marketplace.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("shop catalog exposes units, premium skins, and an empty boosts tab", () => {
  const storage = storageAdapter();
  const catalog = getShopCatalog(storage);

  assert.ok(catalog.units.length > 0);
  assert.ok(catalog.skins.length > 0);
  assert.deepEqual(catalog.boosts, []);
  assert.equal(catalog.resource.balance, STARTING_VALOR_BALANCE);
  assert.equal(catalog.resource.name, "Valor");
});

test("skin shop offers group by class and then by unit type", () => {
  const storage = storageAdapter();
  const catalog = getShopCatalog(storage);
  const groups = groupSkinOffersByClassAndType(catalog.skins);

  assert.ok(groups.length > 0);
  assert.equal(groups[0].id, "melee");
  assert.ok(groups[0].units.length > 1, "melee skins should be split into unit shelves");

  const swordsman = groups[0].units.find((unit) => unit.type === "swordsman");
  assert.ok(swordsman, "swordsman should render as its own unit shelf");
  assert.equal(swordsman.name, "Swordsman");
  assert.ok(swordsman.offers.length > 0);
  assert.ok(swordsman.offers.every((offer) => offer.type === "swordsman"));
});

test("unit offers use Valor while skin offers use premium prices", () => {
  const storage = storageAdapter();
  const unit = getUnitOffer("clod", storage);
  const skin = getSkinOffer("swordsman", "medieval", storage);

  assert.equal(unit.price.kind, "valor");
  assert.equal(unit.price.resourceId, "valor");
  assert.equal(unit.owned, false);
  assert.equal(formatValor(unit.price.amount), `${unit.price.amount} Valor`);

  assert.equal(skin.price.kind, "premium");
  assert.equal(skin.price.currency, "USD");
  assert.ok(skin.price.cents > 0);
  assert.match(skin.sku, /^ta\.skin\.swordsman\.medieval$/);
  assert.equal(formatPremiumPrice(skin.price), "$2.99");
});

test("purchasing a unit spends Valor and unlocks the unit", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 999 });

  const result = purchaseUnitWithValor(storage, "clod");
  const offer = getUnitOffer("clod", storage);
  const progress = readUnlockProgress(storage);

  assert.equal(result.accepted, true);
  assert.equal(offer.owned, true);
  assert.ok(progress.unlockedUnits.includes("clod"));
  assert.equal(progress.valorBalance, 999 - result.offer.price.amount);
});

test("unit purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseUnitWithValor(storage, "swordsman").errorCode, "UNIT_ALREADY_OWNED");
  assert.equal(purchaseUnitWithValor(storage, "ghoul").errorCode, "UNIT_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseUnitWithValor(storage, "clod").errorCode, "INSUFFICIENT_VALOR");
});
