import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import {
  CAMPAIGN_MISSIONS,
  CLOD_MISSION_ID,
  completeCampaignMission,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import {
  ONLINE_MATCH_LOSS_VALOR_REWARD,
  ONLINE_MATCH_WIN_VALOR_REWARD,
  grantOnlineMatchValor,
} from "../src/progression/valorRewards.js";
import { skinValorCost, unitValorCost } from "../src/progression/marketplace.js";
import { readUnlockProgress } from "../src/progression/unlocks.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
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

test("every authored campaign mission carries a scoped Valor reward", () => {
  assert.ok(CAMPAIGN_MISSIONS.length >= 20);
  assert.ok(CAMPAIGN_MISSIONS.every((mission) => Number.isInteger(mission.valorReward) && mission.valorReward > 0));
});

test("campaign Valor total is scoped against live shop prices", () => {
  const campaignTotal = CAMPAIGN_MISSIONS.reduce((total, mission) => total + mission.valorReward, 0);
  const firstActTotal = CAMPAIGN_MISSIONS.slice(0, 7).reduce((total, mission) => total + mission.valorReward, 0);
  const cheapestUnitCost = unitValorCost("juggernaut");
  const premiumUnitCost = unitValorCost("blacksword");
  const commonSkinCost = skinValorCost({ kind: "premium", currency: "USD", cents: 199 });

  assert.equal(campaignTotal, 3875);
  assert.ok(firstActTotal >= cheapestUnitCost, "early campaign should fund a low-tier shop pick");
  assert.ok(campaignTotal >= commonSkinCost * 2 + cheapestUnitCost);
  assert.ok(campaignTotal < premiumUnitCost * 4);
});

test("campaign Valor is granted once per victorious mission clear", () => {
  const storage = storageAdapter();
  const won = wonClodMission();
  const mission = CAMPAIGN_MISSIONS.find((candidate) => candidate.id === CLOD_MISSION_ID);

  const first = completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });
  const replay = completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });

  assert.equal(first.valorReward, mission.valorReward);
  assert.equal(first.valorGranted, mission.valorReward);
  assert.equal(replay.valorGranted, 0);
  assert.equal(readUnlockProgress(storage).valorBalance, mission.valorReward);
  assert.deepEqual(readUnlockProgress(storage).campaignValorRewards, [CLOD_MISSION_ID]);
});

test("online match Valor requires a fully played battle and pays winners more than losers", () => {
  const winnerStorage = storageAdapter();
  const loserStorage = storageAdapter();
  const abandonedStorage = storageAdapter();
  const concededStorage = storageAdapter();

  const completed = { mode: "online", phase: "complete", winner: 1, revision: 24 };

  const winner = grantOnlineMatchValor(winnerStorage, { match: completed, mySeat: 1, hadConcede: false });
  const loser = grantOnlineMatchValor(loserStorage, { match: completed, mySeat: 2, hadConcede: false });
  const abandoned = grantOnlineMatchValor(abandonedStorage, {
    match: { ...completed, phase: "playing", revision: 24 },
    mySeat: 1,
    hadConcede: false,
  });
  const conceded = grantOnlineMatchValor(concededStorage, { match: completed, mySeat: 1, hadConcede: true });
  const tooShort = grantOnlineMatchValor(storageAdapter(), {
    match: { ...completed, revision: 3 },
    mySeat: 1,
    hadConcede: false,
  });

  assert.equal(winner.valorGranted, ONLINE_MATCH_WIN_VALOR_REWARD);
  assert.equal(loser.valorGranted, ONLINE_MATCH_LOSS_VALOR_REWARD);
  assert.equal(ONLINE_MATCH_WIN_VALOR_REWARD, 35);
  assert.equal(ONLINE_MATCH_LOSS_VALOR_REWARD, 10);
  assert.ok(ONLINE_MATCH_WIN_VALOR_REWARD > ONLINE_MATCH_LOSS_VALOR_REWARD);
  assert.ok(ONLINE_MATCH_WIN_VALOR_REWARD * 10 < unitValorCost("juggernaut"));
  assert.ok(ONLINE_MATCH_WIN_VALOR_REWARD * 40 < skinValorCost({ kind: "premium", currency: "USD", cents: 199 }));
  assert.equal(readUnlockProgress(winnerStorage).valorBalance, ONLINE_MATCH_WIN_VALOR_REWARD);
  assert.equal(readUnlockProgress(loserStorage).valorBalance, ONLINE_MATCH_LOSS_VALOR_REWARD);
  assert.equal(abandoned.valorGranted, 0);
  assert.equal(conceded.valorGranted, 0);
  assert.equal(tooShort.valorGranted, 0);
  assert.equal(readUnlockProgress(abandonedStorage).valorBalance, 0);
  assert.equal(readUnlockProgress(concededStorage).valorBalance, 0);
});
