import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import { findUnit } from "../src/core/state.js";
import { isUnitUnlocked } from "../src/ui/squadModel.js";
import {
  CLOD_MISSION_ID,
  clodMissionOpeningScript,
  clodRageWarningScript,
  createCampaignMatchConfig,
  completeCampaignMission,
  evaluateCampaignMission,
  getCampaignMap,
  normalizeCampaignSquad,
  prepareCampaignMatchState,
  shouldShowClodRageWarning,
} from "../src/campaign/campaign.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("fresh campaign map starts on Clod and hides the next node behind a question mark", () => {
  const map = getCampaignMap(storageAdapter());

  assert.equal(map.totalStars, 0);
  assert.equal(map.nodes[0].id, CLOD_MISSION_ID);
  assert.equal(map.nodes[0].status, "available");
  assert.equal(map.nodes[0].displayType, "clod");
  assert.deepEqual(map.nodes[0].routeFrom, { x: 12, y: 84 });
  assert.deepEqual(map.nodes[0].routeTo, map.nodes[0].position);
  assert.equal(map.nodes[1].status, "locked");
  assert.equal(map.nodes[1].displayType, null);
  assert.deepEqual(map.nodes[1].routeFrom, map.nodes[0].position);
  assert.deepEqual(map.nodes[1].routeTo, map.nodes[1].position);
});

test("Clod mission config creates a two-unit player squad against Clod and Juggernaut at half HP", () => {
  const config = createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"]);
  const match = prepareCampaignMatchState(createMatchState(config), CLOD_MISSION_ID);

  assert.equal(config.mode, "campaign");
  assert.deepEqual(config.squads[1], ["mystic", "magician"]);
  assert.deepEqual(config.squads[2], ["clod", "juggernaut"]);
  assert.equal(match.currentPlayer, 1);

  assert.equal(findUnit(match, "p1-0-mystic").hp, 12);
  assert.equal(findUnit(match, "p1-1-magician").hp, 12);
  assert.equal(findUnit(match, "p2-0-clod").hp, 15);
  assert.equal(findUnit(match, "p2-1-juggernaut").hp, 15);
  assert.deepEqual(findUnit(match, "p2-0-clod").position, { x: 7, y: 5 });
});

test("Clod mission opens by warning the player to spread out", () => {
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const script = clodMissionOpeningScript(state);

  assert.equal(script.length >= 2, true);
  assert.match(script.map((line) => line.text).join(" "), /spread/i);
  assert.match(script.map((line) => line.text).join(" "), /Thunderous Charge/i);
});

test("Clod rage warning queues only once Clod is alive and raging", () => {
  const baseState = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const healthyClod = {
    ...baseState,
    phase: "playing",
    units: baseState.units.map((unit) => unit.id === "p2-0-clod" ? { ...unit, hp: 6 } : unit),
  };
  const ragingClod = {
    ...baseState,
    phase: "playing",
    units: baseState.units.map((unit) => unit.id === "p2-0-clod" ? { ...unit, hp: 5 } : unit),
  };
  const defeatedClod = {
    ...baseState,
    phase: "playing",
    units: baseState.units.map((unit) => unit.id === "p2-0-clod" ? { ...unit, hp: 0 } : unit),
  };

  assert.equal(shouldShowClodRageWarning(healthyClod), false);
  assert.equal(shouldShowClodRageWarning(ragingClod), true);
  assert.equal(shouldShowClodRageWarning(defeatedClod), false);
  assert.equal(shouldShowClodRageWarning(ragingClod, { warningShown: true }), false);
  assert.equal(shouldShowClodRageWarning(ragingClod, { chargeUsed: true }), false);
  assert.equal(clodRageWarningScript(ragingClod).length >= 2, true);
});

test("campaign squad normalization supports authored squad sizes from one to four", () => {
  const selected = ["mystic", "magician", "archer", "swordsman"];

  assert.deepEqual(normalizeCampaignSquad(selected, 1), ["mystic"]);
  assert.deepEqual(normalizeCampaignSquad(selected, 2), ["mystic", "magician"]);
  assert.deepEqual(normalizeCampaignSquad(selected, 3), ["mystic", "magician", "archer"]);
  assert.deepEqual(normalizeCampaignSquad(selected, 4), ["mystic", "magician", "archer", "swordsman"]);
  assert.deepEqual(normalizeCampaignSquad(["clod"], 4), ["clod", "swordsman", "archer", "mystic"]);
});

test("campaign grading awards completion, survival, and charge-spacing stars", () => {
  const baseState = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const won = {
    ...baseState,
    phase: "complete",
    winner: 1,
    units: baseState.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }
    ),
  };

  const perfect = evaluateCampaignMission(CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.label), [
    "Complete the mission",
    "Keep both chosen units alive",
    "Have Clod only hit one unit with Thunderous Charge",
  ]);
  assert.equal(evaluateCampaignMission(CLOD_MISSION_ID, won, { clodChargeHitCount: 2 }).stars, 2);

  const oneSurvivor = {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-1-magician" ? { ...unit, hp: 0 } : unit),
  };
  assert.equal(evaluateCampaignMission(CLOD_MISSION_ID, oneSurvivor, { clodChargeHitCount: 1 }).stars, 2);
});

test("defending Clod's charge grants a hidden bonus star without exceeding the three-star cap", () => {
  const baseState = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const wonWithOneDefeated = {
    ...baseState,
    phase: "complete",
    winner: 1,
    units: baseState.units.map((unit) => {
      if (unit.player === 2) return { ...unit, hp: 0 };
      if (unit.id === "p1-1-magician") return { ...unit, hp: 0 };
      return { ...unit, hp: Math.max(1, unit.hp) };
    }),
  };

  const noBonus = evaluateCampaignMission(CLOD_MISSION_ID, wonWithOneDefeated, {
    clodChargeHitCount: 1,
    chargeDefended: false,
  });
  const withBonus = evaluateCampaignMission(CLOD_MISSION_ID, wonWithOneDefeated, {
    clodChargeHitCount: 1,
    chargeDefended: true,
  });
  assert.equal(noBonus.stars, 2);
  assert.equal(withBonus.stars, 3);
  assert.equal(withBonus.earnedBonusStars, 1);
  assert.equal(withBonus.bonusObjectives[0].label, "Bonus: defend against Thunderous Charge");
});

test("completing Clod mission saves best stars, unlocks Clod, and reveals Necromancer placeholder", () => {
  const storage = storageAdapter();
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const won = {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  };

  const completed = completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });
  assert.equal(completed.stars, 3);
  assert.equal(completed.newRewardUnits.includes("clod"), true);
  assert.equal(isUnitUnlocked("clod", storage), true);

  const map = getCampaignMap(storage);
  assert.equal(map.totalStars, 3);
  assert.equal(map.nodes[0].stars, 3);
  assert.equal(map.nodes[1].status, "coming-soon");
  assert.equal(map.nodes[1].displayType, "necromancer");

  const lowerReplay = completeCampaignMission(storage, CLOD_MISSION_ID, {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-1-magician" ? { ...unit, hp: 0 } : unit),
  }, { clodChargeHitCount: 2 });
  assert.equal(lowerReplay.progress.missionStars[CLOD_MISSION_ID], 3);
});
