import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCampaignSkinRewardClaim,
  buildTutorialCompleteClaim,
  buildTutorialSkinChoiceClaim,
  buildTutorialUnitRewardClaim,
  buildTutorialValorClaim,
  PENDING_GAME_PROGRESS_CLAIMS_KEY,
  TACTICAL_ARENA_GAME_SLUG,
  buildCampaignSkinChoiceClaim,
  buildCampaignUnitRewardClaim,
  buildCampaignUnitChoiceClaim,
  buildCampaignValorClaim,
  enqueueGameProgressClaim,
  flushPendingGameProgressClaims,
  readPendingGameProgressClaims,
} from "../src/platform/gameProgressClient.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import {
  CLOD_MISSION_ID,
  completeCampaignMission,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import {
  BROTHERS_UNIT_PACK_ID,
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  TUTORIAL_VALOR_REWARD,
  WANDERING_SKIN_PACK_ID,
  selectCampaignRewardSkin,
  selectCampaignRewardUnit,
  selectTutorialRewardSkin,
} from "../src/progression/unlocks.js";
import { grantCampaignMissionValor } from "../src/progression/valorRewards.js";
import {
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_BASICS_ID,
  TUTORIAL_DAMAGE_TYPES_ID,
  TUTORIAL_RAGE_ID,
  TUTORIAL_STATUS_EFFECTS_ID,
  completeTutorial,
} from "../src/tutorials/basics.js";

const SIGNED_IN_ACCOUNT = Object.freeze({ authenticated: true, playerId: "player-1", token: "token-1" });

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function wonClodMission() {
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  return {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  };
}

test("game progress claims are normalized and deduped as an offline queue", () => {
  const storage = storageAdapter();
  const claim = buildCampaignValorClaim({ missionId: "clod-trial", amount: 75, stars: 3 });

  const first = enqueueGameProgressClaim(storage, claim);
  const duplicate = enqueueGameProgressClaim(storage, { ...claim, payload: { amount: 999 } });

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.errorCode, "CLAIM_ALREADY_PENDING");
  assert.deepEqual(readPendingGameProgressClaims(storage), [claim]);
  assert.equal(JSON.parse(storage.getItem(PENDING_GAME_PROGRESS_CLAIMS_KEY)).length, 1);
});

test("pending game progress claims flush through the platform API and clear only synced claims", async () => {
  const storage = storageAdapter();
  const claim = buildCampaignSkinChoiceClaim({
    packId: WANDERING_SKIN_PACK_ID,
    choice: { type: "archer", slug: "wandering" },
  });
  enqueueGameProgressClaim(storage, claim);

  const calls = [];
  const result = await flushPendingGameProgressClaims({
    storage,
    account: SIGNED_IN_ACCOUNT,
    apiClient: {
      isConfigured: true,
      async recordGameProgressClaim(gameSlug, payload) {
        calls.push({ gameSlug, payload });
        return { ok: true, alreadyProcessed: false, progress: { valorBalance: 150 } };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.syncedCount, 1);
  assert.deepEqual(calls, [{ gameSlug: TACTICAL_ARENA_GAME_SLUG, payload: claim }]);
  assert.deepEqual(readPendingGameProgressClaims(storage), []);
});

test("pending game progress claims stay queued while logged out or unavailable", async () => {
  const storage = storageAdapter();
  const claim = buildCampaignUnitChoiceClaim({ packId: BROTHERS_UNIT_PACK_ID, choice: "big-brother" });
  enqueueGameProgressClaim(storage, claim);

  const loggedOut = await flushPendingGameProgressClaims({
    storage,
    account: { authenticated: false },
    apiClient: { isConfigured: true, recordGameProgressClaim: async () => ({ ok: true }) },
  });
  const unavailable = await flushPendingGameProgressClaims({
    storage,
    account: SIGNED_IN_ACCOUNT,
    apiClient: { isConfigured: false, recordGameProgressClaim: async () => ({ ok: true }) },
  });

  assert.equal(loggedOut.ok, false);
  assert.equal(loggedOut.errorCode, "ACCOUNT_LOGIN_REQUIRED");
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.errorCode, "PROGRESS_API_UNAVAILABLE");
  assert.deepEqual(readPendingGameProgressClaims(storage), [claim]);
});

test("campaign Valor and reward choices enqueue platform progress claims", () => {
  const storage = storageAdapter();

  grantCampaignMissionValor(storage, "clod-trial", 75, { stars: 3 });
  selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "archer", slug: "wandering" });
  selectCampaignRewardUnit(storage, BROTHERS_UNIT_PACK_ID, "little-brother");

  assert.deepEqual(readPendingGameProgressClaims(storage), [
    buildCampaignValorClaim({ missionId: "clod-trial", amount: 75, stars: 3 }),
    buildCampaignSkinChoiceClaim({
      packId: WANDERING_SKIN_PACK_ID,
      choice: { type: "archer", slug: "wandering" },
    }),
    buildCampaignUnitChoiceClaim({ packId: BROTHERS_UNIT_PACK_ID, choice: "little-brother" }),
  ]);
});

test("campaign completion enqueues direct unit and skin entitlement claims", () => {
  const storage = storageAdapter();

  completeCampaignMission(storage, CLOD_MISSION_ID, wonClodMission(), { clodChargeHitCount: 1 });
  enqueueGameProgressClaim(storage, buildCampaignSkinRewardClaim({
    missionId: "voidwood-forest",
    skin: { type: "treant", slug: "voidroot" },
    stars: 3,
  }));

  assert.deepEqual(readPendingGameProgressClaims(storage), [
    buildCampaignValorClaim({ missionId: CLOD_MISSION_ID, amount: 55, stars: 3 }),
    buildCampaignUnitRewardClaim({ missionId: CLOD_MISSION_ID, type: "clod", stars: 3 }),
    buildCampaignSkinRewardClaim({
      missionId: "voidwood-forest",
      skin: { type: "treant", slug: "voidroot" },
      stars: 3,
    }),
  ]);
});

test("tutorial completion and rewards enqueue platform progress claims", () => {
  const storage = storageAdapter();
  const completedTutorials = [
    TUTORIAL_BASICS_ID,
    TUTORIAL_ARTS_MP_ID,
    TUTORIAL_DAMAGE_TYPES_ID,
    TUTORIAL_RAGE_ID,
    TUTORIAL_STATUS_EFFECTS_ID,
  ];

  for (const tutorialId of completedTutorials) {
    completeTutorial(storage, tutorialId);
  }
  selectTutorialRewardSkin(storage, { type: "juggernaut", slug: "bio-mech" });

  assert.deepEqual(readPendingGameProgressClaims(storage), [
    buildTutorialCompleteClaim({ tutorialId: TUTORIAL_BASICS_ID }),
    buildTutorialCompleteClaim({ tutorialId: TUTORIAL_ARTS_MP_ID }),
    buildTutorialCompleteClaim({ tutorialId: TUTORIAL_DAMAGE_TYPES_ID }),
    buildTutorialCompleteClaim({ tutorialId: TUTORIAL_RAGE_ID }),
    buildTutorialCompleteClaim({ tutorialId: TUTORIAL_STATUS_EFFECTS_ID }),
    buildTutorialValorClaim({ amount: TUTORIAL_VALOR_REWARD, completedTutorials }),
    buildTutorialUnitRewardClaim({ type: TUTORIAL_JUGGERNAUT_REWARD_UNIT }),
    buildTutorialSkinChoiceClaim({ choice: { type: "juggernaut", slug: "bio-mech" } }),
  ]);
});
