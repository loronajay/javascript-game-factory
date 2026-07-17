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
  purchaseSkinWithValor,
  purchaseUnitWithValor,
  skinValorCost,
  unitPremiumPrice,
  unitValorCost,
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

test("unit offers use Valor for active purchases and expose premium USD display prices", () => {
  const storage = storageAdapter();
  const unit = getUnitOffer("clod", storage);
  const skin = getSkinOffer("swordsman", "medieval", storage);

  assert.equal(unit.price.kind, "valor");
  assert.equal(unit.price.resourceId, "valor");
  assert.equal(unit.owned, false);
  assert.equal(formatValor(unit.price.amount), `${unit.price.amount} Valor`);
  assert.equal(unit.premiumPrice.kind, "premium");
  assert.equal(unit.premiumPrice.currency, "USD");
  assert.equal(unit.premiumPrice.cents, 199);
  assert.equal(formatPremiumPrice(unit.premiumPrice), "$1.99");
  assert.match(unit.sku, /^ta\.unit\.clod$/);

  assert.equal(skin.price.kind, "premium");
  assert.equal(skin.price.currency, "USD");
  assert.ok(skin.price.cents > 0);
  assert.match(skin.sku, /^ta\.skin\.swordsman\.medieval$/);
  assert.equal(formatPremiumPrice(skin.price), "$1.99");
});

test("unit premium prices follow the invisible star buckets", () => {
  assert.equal(unitPremiumPrice("monk").cents, 99);
  assert.equal(unitPremiumPrice("clod").cents, 199);
  assert.equal(unitPremiumPrice("fat-knight").cents, 299);
  assert.equal(unitPremiumPrice("blacksword").cents, 399);
  assert.equal(unitPremiumPrice("ghoul"), null);
});

test("skin Valor prices are derived from the USD premium price with a fairer high-price curve", () => {
  const storage = storageAdapter();
  const common = getSkinOffer("magician", "summer-vibes", storage);

  assert.equal(skinValorCost({ kind: "premium", currency: "USD", cents: 99 }), 850);
  assert.equal(skinValorCost({ kind: "premium", currency: "USD", cents: 199 }), 1550);
  assert.equal(skinValorCost({ kind: "premium", currency: "USD", cents: 499 }), 3500);
  assert.ok(
    skinValorCost({ kind: "premium", currency: "USD", cents: 199 }) < skinValorCost({ kind: "premium", currency: "USD", cents: 99 }) * 2,
    "the curve should not simply double the Valor cost when the USD price roughly doubles"
  );
  assert.ok(
    skinValorCost({ kind: "premium", currency: "USD", cents: 499 }) / 4.99 < skinValorCost({ kind: "premium", currency: "USD", cents: 99 }) / 0.99,
    "higher USD prices should have a lower Valor-per-dollar rate"
  );
  assert.equal(common.price.cents, 99);
  assert.deepEqual(common.valorPrice, {
    kind: "valor",
    resourceId: "valor",
    amount: 850,
  });
});

test("skin offers expose the authored rarity price buckets and donation notes", () => {
  const storage = storageAdapter();
  const cases = [
    ["swordsman", "summer-vibes", "common", 99],
    ["swordsman", "medieval", "rare", 199],
    ["swordsman", "blood-moon", "epic", 299],
    ["paladin", "crusader", "legendary", 399],
    ["blacksword", "apprentice", "legendary+", 499],
  ];

  for (const [type, slug, rarity, cents] of cases) {
    const offer = getSkinOffer(type, slug, storage);
    assert.equal(offer.rarity, rarity, `${type}:${slug} rarity`);
    assert.equal(offer.price.cents, cents, `${type}:${slug} price`);
  }

  const charity = getSkinOffer("juggernaut", "fuck-cancer", storage);
  assert.equal(charity.rarity, "legendary");
  assert.equal(charity.price.cents, 399);
  assert.equal(charity.donationNote, "All proceeds for this skin will be donated for cancer research.");

  const arcane = getSkinOffer("swordsman", "arcane", storage);
  assert.equal(arcane.packName, "Arcane Pack");
  const exclusive = getSkinOffer("swordsman", "enchanted", storage);
  assert.equal(exclusive.availabilityNote, "Halloween exclusive");
});

test("unit Valor costs follow the invisible star buckets", () => {
  const expectedCosts = {
    juggernaut: 450,
    "big-brother": 450,
    "witch-doctor": 450,
    monk: 450,
    paladin: 650,
    sniper: 650,
    miner: 650,
    necromancer: 650,
    virus: 650,
    clod: 650,
    gargoyle: 650,
    "father-time": 650,
    "fat-knight": 850,
    ronin: 850,
    angel: 850,
    "fat-bowman": 850,
    "little-brother": 850,
    king: 850,
    "fat-cleric": 850,
    "fat-wizard": 850,
    treant: 850,
    "riot-cop": 850,
    blacksword: 1150,
    "mother-nature": 1150,
    nemesis: 1150,
    summoner: 1150,
  };

  for (const [type, cost] of Object.entries(expectedCosts)) {
    assert.equal(unitValorCost(type), cost, `${type} should cost ${cost} Valor`);
    assert.equal(getUnitOffer(type).price.amount, cost, `${type} offer should cost ${cost} Valor`);
  }
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

test("purchasing a skin with Valor spends Valor and unlocks the skin", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 3000 });

  const result = purchaseSkinWithValor(storage, "magician", "summer-vibes");
  const offer = getSkinOffer("magician", "summer-vibes", storage);
  const progress = readUnlockProgress(storage);

  assert.equal(result.accepted, true);
  assert.equal(offer.owned, true);
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "magician" && skin.slug === "summer-vibes"));
  assert.equal(progress.valorBalance, 3000 - result.offer.valorPrice.amount);
});

test("skin Valor purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseSkinWithValor(storage, "dragon", "summer-vibes").errorCode, "SKIN_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseSkinWithValor(storage, "magician", "summer-vibes").errorCode, "INSUFFICIENT_VALOR");

  writeUnlockProgress(storage, {
    valorBalance: 9999,
    purchasedSkins: [{ type: "magician", slug: "summer-vibes" }],
  });
  assert.equal(purchaseSkinWithValor(storage, "magician", "summer-vibes").errorCode, "SKIN_ALREADY_OWNED");
});

test("unit purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseUnitWithValor(storage, "swordsman").errorCode, "UNIT_ALREADY_OWNED");
  assert.equal(purchaseUnitWithValor(storage, "ghoul").errorCode, "UNIT_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseUnitWithValor(storage, "clod").errorCode, "INSUFFICIENT_VALOR");
});
