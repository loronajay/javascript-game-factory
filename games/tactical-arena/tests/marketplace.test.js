import test from "node:test";
import assert from "node:assert/strict";

import { STARTING_VALOR_BALANCE, readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import {
  formatPremiumPrice,
  formatValor,
  getConsumableOffer,
  getConsumableOffers,
  getSkinPackOffer,
  getSkinPackOffers,
  getShopCatalog,
  groupSkinOffersByClassAndType,
  getSkinOffer,
  getUnitOffer,
  purchaseSkinPackWithValor,
  purchaseSkinWithValor,
  purchaseUnitWithValor,
  skinValorCost,
  unitPremiumPrice,
  unitValorCost,
} from "../src/progression/marketplace.js";
import { SKIN_MANIFEST } from "../src/ui/skinManifest.generated.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const SIGNED_IN_ACCOUNT = Object.freeze({ authenticated: true, playerId: "factory-player-1" });

test("shop catalog exposes units, premium skins, skin packs, and paid consumables", () => {
  const storage = storageAdapter();
  const catalog = getShopCatalog(storage);

  assert.ok(catalog.units.length > 0);
  assert.ok(catalog.skins.length > 0);
  assert.ok(catalog.skinPacks.length > 0);
  assert.ok(catalog.tabs.some((tab) => tab.id === "skin-packs" && tab.label === "Skin Packs"));
  assert.ok(catalog.tabs.some((tab) => tab.id === "consumables" && tab.label === "Consumables"));
  assert.equal(catalog.tabs.some((tab) => tab.id === "boosts"), false);
  assert.equal(catalog.consumables.length, 9);
  assert.equal(catalog.resource.balance, STARTING_VALOR_BALANCE);
  assert.equal(catalog.resource.name, "Valor");
});

test("consumable offers cover valor boosts, random skin grants, and campaign boost prices", () => {
  const offers = getConsumableOffers();
  const valorBoost = getConsumableOffer("valor-boost-3");
  const campaignBoost = getConsumableOffer("campaign-damage-boost");
  const fiveEpics = getConsumableOffer("five-random-epic-skins");

  assert.equal(offers.length, 9);
  assert.equal(valorBoost.name, "Valor Boost III");
  assert.equal(valorBoost.price.cents, 399);
  assert.equal(valorBoost.effect.percentBonus, 65);
  assert.equal(valorBoost.durationHours, 24);
  assert.equal(valorBoost.activationTrigger, "valor-gained");
  assert.equal(formatPremiumPrice(valorBoost.price), "$3.99");

  assert.equal(fiveEpics.price.cents, 999);
  assert.equal(fiveEpics.effect.rarity, "epic");
  assert.equal(fiveEpics.effect.count, 5);

  assert.equal(campaignBoost.price.cents, 99);
  assert.equal(campaignBoost.effect.damageBonus, 2);
  assert.equal(campaignBoost.activationTrigger, "campaign-mission-started");
});

test("skin pack offers use authored pack metadata and exclude separate Halloween exclusives", () => {
  const storage = storageAdapter();
  const packs = getSkinPackOffers(storage);
  const halloween = packs.find((pack) => pack.packId === "halloween");

  assert.ok(halloween, "Halloween Pack should be offered");
  assert.equal(halloween.name, "Halloween Pack");
  assert.equal(halloween.skinCount, 25);
  assert.equal(halloween.ownedSkinCount, 0);
  assert.equal(halloween.unownedSkinCount, 25);
  assert.equal(halloween.price.cents, 2499);
  assert.equal(halloween.valorPrice.amount, 19500);
  assert.ok(halloween.skins.some((skin) => skin.type === "swordsman" && skin.slug === "pumpkin-knight"));
  assert.equal(
    halloween.skins.some((skin) => skin.type === "swordsman" && skin.slug === "enchanted"),
    false,
    "Halloween-exclusive singles should stay outside the Halloween Pack"
  );
  assert.equal(
    halloween.skins.some((skin) => skin.type === "mother-nature" && skin.slug === "bronze-witch"),
    false,
    "separate exclusive singles should not be pulled into the pack by theme"
  );
});

test("expanded fat squad skin packs expose updated counts, rarities, and prices", () => {
  const storage = storageAdapter();
  const bloodMoon = getSkinPackOffer("blood-moon", storage);
  const southernKingdom = getSkinPackOffer("southern-kingdom", storage);
  const bloodMoonTypes = SKIN_MANIFEST
    .filter((skin) => skin.slug === "blood-moon")
    .filter((skin) => skin.type !== "ghoul")
    .map((skin) => skin.type)
    .sort();

  assert.ok(bloodMoon, "Blood Moon Pack should be offered");
  assert.equal(bloodMoon.skinCount, 30);
  assert.equal(bloodMoon.unownedSkinCount, 30);
  assert.equal(bloodMoon.rarityCounts.epic, 30);
  assert.equal(bloodMoon.individualPrice.cents, 8970);
  assert.equal(bloodMoon.individualValorPrice.amount, 67500);
  assert.equal(bloodMoon.price.cents, 4999);
  assert.equal(bloodMoon.valorPrice.amount, 40000);
  assert.deepEqual(bloodMoon.skins.map((skin) => skin.type).sort(), bloodMoonTypes);
  assert.equal(bloodMoon.skins.some((skin) => skin.type === "ghoul"), false);
  for (const type of bloodMoonTypes) {
    assert.ok(bloodMoon.skins.some((skin) => skin.type === type && skin.slug === "blood-moon"), `${type} Blood Moon skin should be in the pack`);
  }

  assert.ok(southernKingdom, "Southern Kingdom Pack should be offered");
  assert.equal(southernKingdom.skinCount, 12);
  assert.equal(southernKingdom.unownedSkinCount, 12);
  assert.equal(southernKingdom.rarityCounts.epic, 12);
  assert.equal(southernKingdom.individualPrice.cents, 3588);
  assert.equal(southernKingdom.individualValorPrice.amount, 27000);
  assert.equal(southernKingdom.price.cents, 2699);
  assert.equal(southernKingdom.valorPrice.amount, 20250);
  for (const type of ["swordsman", "archer", "mystic", "magician", "fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]) {
    assert.ok(
      southernKingdom.skins.some((skin) => skin.type === type && skin.slug === "southern-kingdom"),
      `${type} Southern Kingdom skin should be in the pack`
    );
  }
});

test("Fuck Cancer charity pack offers every unit skin with charity labeling", () => {
  const storage = storageAdapter();
  const charity = getSkinPackOffer("fuck-cancer", storage);
  const nonSummonUnitCount = Object.values(UNIT_TYPES).filter((unit) => !unit.summon).length;

  assert.ok(charity, "Fuck Cancer Charity Pack should be offered");
  assert.equal(charity.name, "Fuck Cancer Charity Pack");
  assert.equal(charity.skinCount, nonSummonUnitCount);
  assert.equal(charity.ownedSkinCount, 0);
  assert.equal(charity.unownedSkinCount, nonSummonUnitCount);
  assert.equal(charity.rarityCounts.legendary, nonSummonUnitCount);
  assert.equal(charity.price.cents, 4999);
  assert.equal(charity.valorPrice.amount, 42500);
  assert.equal(charity.donationNote, "All proceeds for this pack will be donated for cancer research.");
  assert.ok(charity.skins.every((skin) => skin.slug === "fuck-cancer"));
  assert.ok(charity.skins.every((skin) => skin.rarity === "legendary"));
  assert.ok(charity.skins.every((skin) => skin.donationNote === "All proceeds for this skin will be donated for cancer research."));
  assert.equal(charity.skins.some((skin) => skin.type === "ghoul"), false, "Ghoul should be bundled with Necromancer instead of sold in the charity pack");
});

test("ghoul skins are not sold directly or included in paid skin packs", () => {
  const storage = storageAdapter();
  const catalog = getShopCatalog(storage);

  assert.equal(getSkinOffer("ghoul", "blood-moon", storage), null);
  assert.equal(catalog.skins.some((skin) => skin.type === "ghoul"), false);
  assert.equal(catalog.skinPacks.some((pack) => pack.skins.some((skin) => skin.type === "ghoul")), false);
  assert.equal(purchaseSkinWithValor(storage, "ghoul", "blood-moon").errorCode, "SKIN_NOT_FOR_SALE");
});

test("skin pack offers prorate prices for already owned pack contents", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    purchasedSkins: [{ type: "swordsman", slug: "pumpkin-knight" }],
  });

  const full = getSkinPackOffer("halloween", storageAdapter());
  const partial = getSkinPackOffer("halloween", storage);

  assert.equal(partial.skinCount, full.skinCount);
  assert.equal(partial.ownedSkinCount, 1);
  assert.equal(partial.unownedSkinCount, full.skinCount - 1);
  assert.ok(partial.price.cents < full.price.cents);
  assert.ok(partial.valorPrice.amount < full.valorPrice.amount);
  assert.ok(partial.skins.find((skin) => skin.slug === "pumpkin-knight").owned);
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

  const result = purchaseUnitWithValor(storage, "clod", { account: SIGNED_IN_ACCOUNT });
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

  const result = purchaseSkinWithValor(storage, "magician", "summer-vibes", { account: SIGNED_IN_ACCOUNT });
  const offer = getSkinOffer("magician", "summer-vibes", storage);
  const progress = readUnlockProgress(storage);

  assert.equal(result.accepted, true);
  assert.equal(offer.owned, true);
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "magician" && skin.slug === "summer-vibes"));
  assert.equal(progress.valorBalance, 3000 - result.offer.valorPrice.amount);
});

test("purchasing a necromancer skin with Valor unlocks its ghoul companion skin", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 3000 });

  const result = purchaseSkinWithValor(storage, "necromancer", "arcane", { account: SIGNED_IN_ACCOUNT });
  const progress = readUnlockProgress(storage);

  assert.equal(result.accepted, true);
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "necromancer" && skin.slug === "arcane"));
  assert.equal(progress.purchasedSkins.some((skin) => skin.type === "ghoul" && skin.slug === "arcane"), false);
  assert.ok(progress.unlockedSkins.some((skin) => skin.type === "ghoul" && skin.slug === "arcane"));
  assert.equal(getSkinOffer("necromancer", "arcane", storage).owned, true);
  assert.equal(getSkinOffer("ghoul", "arcane", storage), null);
});

test("purchasing a skin pack with Valor spends the prorated pack price and unlocks unowned pack skins", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    valorBalance: 30000,
    purchasedSkins: [{ type: "swordsman", slug: "pumpkin-knight" }],
  });

  const offer = getSkinPackOffer("halloween", storage);
  const result = purchaseSkinPackWithValor(storage, "halloween", { account: SIGNED_IN_ACCOUNT });
  const progress = readUnlockProgress(storage);

  assert.equal(result.accepted, true);
  assert.equal(progress.valorBalance, 30000 - offer.valorPrice.amount);
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "swordsman" && skin.slug === "pumpkin-knight"));
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "juggernaut" && skin.slug === "pumpkin-mech"));
  assert.ok(progress.purchasedSkins.some((skin) => skin.type === "necromancer" && skin.slug === "trick-or-treat"));
  assert.ok(progress.unlockedSkins.some((skin) => skin.type === "ghoul" && skin.slug === "trick-or-treat"));
  assert.equal(progress.purchasedSkins.some((skin) => skin.type === "ghoul"), false);
  assert.equal(
    progress.purchasedSkins.some((skin) => skin.type === "swordsman" && skin.slug === "enchanted"),
    false,
    "pack purchase should not grant separate Halloween-exclusive skins"
  );
  assert.equal(getSkinPackOffer("halloween", storage).owned, true);
});

test("skin pack purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseSkinPackWithValor(storage, "bogus").errorCode, "SKIN_PACK_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseSkinPackWithValor(storage, "halloween", { account: SIGNED_IN_ACCOUNT }).errorCode, "INSUFFICIENT_VALOR");

  writeUnlockProgress(storage, {
    valorBalance: 99999,
    purchasedSkins: getSkinPackOffer("medieval", storageAdapter()).skins.map((skin) => ({ type: skin.type, slug: skin.slug })),
  });
  assert.equal(purchaseSkinPackWithValor(storage, "medieval", { account: SIGNED_IN_ACCOUNT }).errorCode, "SKIN_PACK_ALREADY_OWNED");
});

test("skin Valor purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseSkinWithValor(storage, "dragon", "summer-vibes").errorCode, "SKIN_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseSkinWithValor(storage, "magician", "summer-vibes", { account: SIGNED_IN_ACCOUNT }).errorCode, "INSUFFICIENT_VALOR");

  writeUnlockProgress(storage, {
    valorBalance: 9999,
    purchasedSkins: [{ type: "magician", slug: "summer-vibes" }],
  });
  assert.equal(purchaseSkinWithValor(storage, "magician", "summer-vibes", { account: SIGNED_IN_ACCOUNT }).errorCode, "SKIN_ALREADY_OWNED");
});

test("unit purchases reject owned, invalid, and unaffordable offers", () => {
  const storage = storageAdapter();

  assert.equal(purchaseUnitWithValor(storage, "swordsman").errorCode, "UNIT_ALREADY_OWNED");
  assert.equal(purchaseUnitWithValor(storage, "ghoul").errorCode, "UNIT_NOT_FOR_SALE");

  writeUnlockProgress(storage, { valorBalance: 0 });
  assert.equal(purchaseUnitWithValor(storage, "clod", { account: SIGNED_IN_ACCOUNT }).errorCode, "INSUFFICIENT_VALOR");
});

test("shop purchases require a signed-in JavaScript Game Factory account", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, { valorBalance: 99999 });

  const unit = purchaseUnitWithValor(storage, "clod");
  const skin = purchaseSkinWithValor(storage, "magician", "summer-vibes");
  const pack = purchaseSkinPackWithValor(storage, "halloween");
  const progress = readUnlockProgress(storage);

  assert.equal(unit.errorCode, "ACCOUNT_LOGIN_REQUIRED");
  assert.equal(skin.errorCode, "ACCOUNT_LOGIN_REQUIRED");
  assert.equal(pack.errorCode, "ACCOUNT_LOGIN_REQUIRED");
  assert.equal(progress.valorBalance, 99999);
  assert.equal(progress.unlockedUnits.includes("clod"), false);
  assert.equal(progress.purchasedSkins.length, 0);
});
