import test from "node:test";
import assert from "node:assert/strict";

import {
  BROTHERS_UNIT_PACK_ID,
  LEGACY_TUTORIAL_PROGRESS_KEY,
  OUT_OF_RETIREMENT_SKIN_REWARDS,
  STARTING_VALOR_BALANCE,
  TUTORIAL_VALOR_REWARD,
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  TUTORIAL_PROGRESS_KEY,
  TUTORIAL_REWARD_SKIN_CHOICES,
  VALOR_RESOURCE,
  WANDERING_SKIN_PACK_ID,
  grantPremiumSkinPurchase,
  getCampaignUnitReward,
  getCampaignUnitRewardChoices,
  getCampaignSkinReward,
  getCampaignSkinRewardChoices,
  isCampaignUnitRewardGranted,
  isCampaignSkinRewardGranted,
  isProgressSkinUnlocked,
  readUnlockProgress,
  resetUnlockProgress,
  selectCampaignRewardSkin,
  selectCampaignRewardUnit,
  selectTutorialRewardSkin,
  writeUnlockProgress
} from "../src/progression/unlocks.js";
import {
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_BASICS_ID,
  TUTORIAL_DAMAGE_TYPES_ID,
  TUTORIAL_RAGE_ID,
  completeTutorial,
} from "../src/tutorials/basics.js";
import { availableTypesForSlot, isUnitUnlocked } from "../src/ui/squadModel.js";
import { getSkin, normalizeSkinSlug } from "../src/ui/skinModel.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("tutorial reward choices match the first skin-choice pool", () => {
  assert.deepEqual(TUTORIAL_REWARD_SKIN_CHOICES, [
    { type: "juggernaut", slug: "bio-mech" },
    { type: "swordsman", slug: "medieval" },
    { type: "archer", slug: "desert-warrior" },
    { type: "mystic", slug: "enlightened" },
    { type: "magician", slug: "summer-vibes" },
  ]);
});

test("fresh profiles start with no Valor for unit purchases", () => {
  const progress = readUnlockProgress(storageAdapter());

  assert.equal(VALOR_RESOURCE.id, "valor");
  assert.equal(VALOR_RESOURCE.name, "Valor");
  assert.equal(STARTING_VALOR_BALANCE, 0);
  assert.equal(progress.valorBalance, 0);
  assert.deepEqual(progress.purchasedSkins, []);
});

test("completing all tutorial entries unlocks Juggernaut but waits for a skin choice", () => {
  const storage = storageAdapter();
  for (const tutorialId of [TUTORIAL_BASICS_ID, TUTORIAL_ARTS_MP_ID, TUTORIAL_DAMAGE_TYPES_ID]) {
    completeTutorial(storage, tutorialId);
  }
  let progress = completeTutorial(storage, TUTORIAL_RAGE_ID);

  assert.equal(progress.allTutorialsComplete, true);
  assert.equal(progress.rewardGranted, false);
  assert.equal(progress.selectedRewardSkin, null);
  assert.equal(progress.valorBalance, TUTORIAL_VALOR_REWARD);
  assert.equal(progress.tutorialValorGranted, true);
  assert.ok(progress.unlockedUnits.includes(TUTORIAL_JUGGERNAUT_REWARD_UNIT));
  assert.equal(isUnitUnlocked("juggernaut", storage), true);
  assert.ok(availableTypesForSlot(["swordsman", "archer", "mystic", "magician"], 0, true, storage).includes("juggernaut"));

  progress = readUnlockProgress(storage);
  assert.equal(progress.allTutorialsComplete, true);
  assert.equal(progress.valorBalance, TUTORIAL_VALOR_REWARD);
  assert.ok(progress.unlockedUnits.includes("juggernaut"));
});

test("tutorial Valor is granted only once after all tutorials are complete", () => {
  const storage = storageAdapter();

  for (const tutorialId of [TUTORIAL_BASICS_ID, TUTORIAL_ARTS_MP_ID, TUTORIAL_DAMAGE_TYPES_ID, TUTORIAL_RAGE_ID]) {
    completeTutorial(storage, tutorialId);
  }
  completeTutorial(storage, TUTORIAL_RAGE_ID);
  completeTutorial(storage, TUTORIAL_BASICS_ID);

  const progress = readUnlockProgress(storage);
  assert.equal(progress.valorBalance, TUTORIAL_VALOR_REWARD);
  assert.equal(progress.tutorialValorGranted, true);
});

test("selecting the tutorial reward unlocks exactly that skin", () => {
  const storage = storageAdapter();
  for (const tutorialId of [TUTORIAL_BASICS_ID, TUTORIAL_ARTS_MP_ID, TUTORIAL_DAMAGE_TYPES_ID, TUTORIAL_RAGE_ID]) {
    completeTutorial(storage, tutorialId);
  }

  const selected = selectTutorialRewardSkin(storage, { type: "juggernaut", slug: "bio-mech" });

  assert.equal(selected.accepted, true);
  assert.equal(selected.progress.rewardGranted, true);
  assert.deepEqual(selected.progress.selectedRewardSkin, { type: "juggernaut", slug: "bio-mech" });
  assert.equal(isProgressSkinUnlocked("juggernaut", "bio-mech", storage), true);
  assert.equal(getSkin("juggernaut", "bio-mech", storage)?.unlocked, true);
  assert.equal(normalizeSkinSlug("juggernaut", "bio-mech", storage), "bio-mech");
  assert.equal(normalizeSkinSlug("swordsman", "medieval", storage), null);
});

test("skin reward cannot be selected before every tutorial is complete", () => {
  const storage = storageAdapter();
  completeTutorial(storage, TUTORIAL_BASICS_ID);

  const selected = selectTutorialRewardSkin(storage, { type: "magician", slug: "summer-vibes" });

  assert.equal(selected.accepted, false);
  assert.equal(selected.errorCode, "TUTORIAL_REWARD_LOCKED");
  assert.equal(isProgressSkinUnlocked("magician", "summer-vibes", storage), false);
});

test("wandering skin pack offers the four wandering skins", () => {
  assert.deepEqual(getCampaignSkinRewardChoices(WANDERING_SKIN_PACK_ID), [
    { type: "swordsman", slug: "wandering" },
    { type: "archer", slug: "wandering" },
    { type: "mystic", slug: "wandering" },
    { type: "magician", slug: "wandering" },
  ]);
  assert.equal(getCampaignSkinRewardChoices("no-such-pack"), null);
});

test("selecting a campaign reward unlocks exactly that skin and is a final one-time grant", () => {
  const storage = storageAdapter();
  assert.equal(isCampaignSkinRewardGranted(storage, WANDERING_SKIN_PACK_ID), false);

  const first = selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "archer", slug: "wandering" });
  assert.equal(first.accepted, true);
  assert.equal(isCampaignSkinRewardGranted(storage, WANDERING_SKIN_PACK_ID), true);
  assert.deepEqual(getCampaignSkinReward(storage, WANDERING_SKIN_PACK_ID), { type: "archer", slug: "wandering" });
  // Only the chosen skin unlocks — the rest of the pack stays locked (no grinding).
  assert.equal(isProgressSkinUnlocked("archer", "wandering", storage), true);
  assert.equal(isProgressSkinUnlocked("swordsman", "wandering", storage), false);
  assert.equal(getSkin("archer", "wandering", storage)?.unlocked, true);
  assert.equal(normalizeSkinSlug("archer", "wandering", storage), "wandering");

  // A second pick is rejected — the choice is final, even for a different skin.
  const second = selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "swordsman", slug: "wandering" });
  assert.equal(second.accepted, false);
  assert.equal(second.errorCode, "CAMPAIGN_REWARD_ALREADY_GRANTED");
  assert.equal(isProgressSkinUnlocked("swordsman", "wandering", storage), false);
});

test("campaign reward rejects unknown packs and off-pack choices", () => {
  const storage = storageAdapter();
  assert.equal(selectCampaignRewardSkin(storage, "bogus", { type: "archer", slug: "wandering" }).errorCode, "INVALID_SKIN_PACK");
  assert.equal(selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "paladin", slug: "count" }).errorCode, "INVALID_CAMPAIGN_REWARD");
  assert.equal(isCampaignSkinRewardGranted(storage, WANDERING_SKIN_PACK_ID), false);
});

test("selecting a campaign unit reward unlocks exactly that unit and is final", () => {
  const storage = storageAdapter();
  assert.deepEqual(getCampaignUnitRewardChoices(BROTHERS_UNIT_PACK_ID), ["big-brother", "little-brother"]);
  assert.equal(getCampaignUnitRewardChoices("no-such-pack"), null);
  assert.equal(isCampaignUnitRewardGranted(storage, BROTHERS_UNIT_PACK_ID), false);

  const first = selectCampaignRewardUnit(storage, BROTHERS_UNIT_PACK_ID, "little-brother");

  assert.equal(first.accepted, true);
  assert.equal(isCampaignUnitRewardGranted(storage, BROTHERS_UNIT_PACK_ID), true);
  assert.equal(getCampaignUnitReward(storage, BROTHERS_UNIT_PACK_ID), "little-brother");
  assert.equal(first.progress.unlockedUnits.includes("little-brother"), true);
  assert.equal(first.progress.unlockedUnits.includes("big-brother"), false);

  const second = selectCampaignRewardUnit(storage, BROTHERS_UNIT_PACK_ID, "big-brother");
  assert.equal(second.accepted, false);
  assert.equal(second.errorCode, "CAMPAIGN_REWARD_ALREADY_GRANTED");
  assert.equal(readUnlockProgress(storage).unlockedUnits.includes("big-brother"), false);
});

test("campaign unit reward rejects unknown packs and off-pack choices", () => {
  const storage = storageAdapter();
  assert.equal(selectCampaignRewardUnit(storage, "bogus", "big-brother").errorCode, "INVALID_UNIT_PACK");
  assert.equal(selectCampaignRewardUnit(storage, BROTHERS_UNIT_PACK_ID, "clod").errorCode, "INVALID_CAMPAIGN_REWARD");
  assert.equal(isCampaignUnitRewardGranted(storage, BROTHERS_UNIT_PACK_ID), false);
});

test("campaign reward skin survives a read/write round trip and reset clears it", () => {
  const storage = storageAdapter();
  selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "mystic", slug: "wandering" });
  const reread = readUnlockProgress(storage);
  assert.deepEqual(reread.campaignRewardSkins[WANDERING_SKIN_PACK_ID], { type: "mystic", slug: "wandering" });
  assert.ok(reread.unlockedSkins.some((skin) => skin.type === "mystic" && skin.slug === "wandering"));

  resetUnlockProgress(storage);
  assert.equal(isCampaignSkinRewardGranted(storage, WANDERING_SKIN_PACK_ID), false);
  assert.equal(isProgressSkinUnlocked("mystic", "wandering", storage), false);
});

test("direct campaign skin grants are folded into unlocked skins", () => {
  const storage = storageAdapter();
  const progress = writeUnlockProgress(storage, {
    campaignGrantedSkins: OUT_OF_RETIREMENT_SKIN_REWARDS,
  });

  assert.deepEqual(progress.campaignGrantedSkins, [
    { type: "angel", slug: "summer-vibes" },
    { type: "paladin", slug: "summer-vibes" },
  ]);
  assert.equal(isProgressSkinUnlocked("angel", "summer-vibes", storage), true);
  assert.equal(isProgressSkinUnlocked("paladin", "summer-vibes", storage), true);
  assert.equal(normalizeSkinSlug("angel", "summer-vibes", storage), "summer-vibes");
});

test("premium skin purchases are stored separately and folded into unlocked skins", () => {
  const storage = storageAdapter();

  const result = grantPremiumSkinPurchase(storage, { type: "swordsman", slug: "medieval" });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.progress.purchasedSkins, [{ type: "swordsman", slug: "medieval" }]);
  assert.equal(isProgressSkinUnlocked("swordsman", "medieval", storage), true);
  assert.equal(normalizeSkinSlug("swordsman", "medieval", storage), "medieval");

  const duplicate = grantPremiumSkinPurchase(storage, { type: "swordsman", slug: "medieval" });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.errorCode, "PREMIUM_SKIN_ALREADY_OWNED");
});

test("resetting progress clears stored tutorial unlocks and returns to a fresh profile", () => {
  const storage = storageAdapter();
  for (const tutorialId of [TUTORIAL_BASICS_ID, TUTORIAL_ARTS_MP_ID, TUTORIAL_DAMAGE_TYPES_ID, TUTORIAL_RAGE_ID]) {
    completeTutorial(storage, tutorialId);
  }
  selectTutorialRewardSkin(storage, { type: "magician", slug: "summer-vibes" });
  storage.setItem(LEGACY_TUTORIAL_PROGRESS_KEY, JSON.stringify({ completedTutorials: [TUTORIAL_BASICS_ID] }));

  const reset = resetUnlockProgress(storage);

  assert.deepEqual(reset.completedTutorials, []);
  assert.equal(reset.allTutorialsComplete, false);
  assert.equal(reset.valorBalance, STARTING_VALOR_BALANCE);
  assert.deepEqual(reset.unlockedUnits, ["swordsman", "archer", "mystic", "magician"]);
  assert.deepEqual(reset.unlockedSkins, []);
  assert.deepEqual(reset.purchasedSkins, []);
  assert.equal(readUnlockProgress(storage).allTutorialsComplete, false);
  assert.equal(isUnitUnlocked("juggernaut", storage), false);
  assert.equal(isProgressSkinUnlocked("magician", "summer-vibes", storage), false);
  assert.equal(storage.getItem(TUTORIAL_PROGRESS_KEY), null);
  assert.equal(storage.getItem(LEGACY_TUTORIAL_PROGRESS_KEY), null);
});
