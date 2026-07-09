import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import { findUnit } from "../src/core/state.js";
import { isUnitUnlocked } from "../src/ui/squadModel.js";
import {
  CLOD_MISSION_ID,
  NECROMANCER_MISSION_ID,
  campaignOpeningScript,
  clodMissionOpeningScript,
  clodRageWarningScript,
  createCampaignMatchConfig,
  completeCampaignMission,
  evaluateCampaignMission,
  getCampaignMap,
  necromancerMissionOpeningScript,
  necromancerRageWarningScript,
  necromancerStatusWarningScript,
  necromancerSummonWarningScript,
  normalizeCampaignSquad,
  prepareCampaignMatchState,
  shouldShowClodRageWarning,
  shouldShowNecromancerRageWarning,
  shouldShowNecromancerStatusWarning,
  shouldShowNecromancerSummonWarning,
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

test("Clod mission opens with team banter, then Swordsman warns the player to spread out", () => {
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const script = clodMissionOpeningScript(state);

  assert.equal(script.length >= 3, true);
  assert.equal(script[0].speakerId, "p2-0-clod");
  assert.match(script[0].text, /ridge/i);
  assert.match(script[1].speakerId, /^p1-/);
  assert.equal(script.at(-1).speaker, "swordsman");
  assert.match(script.at(-1).text, /spread/i);
  assert.match(script.at(-1).text, /Thunderous Charge/i);
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
  assert.equal(map.nodes[1].status, "available");
  assert.equal(map.nodes[1].displayType, "necromancer");

  const lowerReplay = completeCampaignMission(storage, CLOD_MISSION_ID, {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-1-magician" ? { ...unit, hp: 0 } : unit),
  }, { clodChargeHitCount: 2 });
  assert.equal(lowerReplay.progress.missionStars[CLOD_MISSION_ID], 3);
});

// --- Mission 2: Necromancer's Gate --------------------------------------------

function necromancerMatchState(squad = ["swordsman", "mystic"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(NECROMANCER_MISSION_ID, squad)),
    NECROMANCER_MISSION_ID,
  );
}

test("Necromancer mission builds a 13x13 board with the enemy caster pair spawned at half HP", () => {
  const config = createCampaignMatchConfig(NECROMANCER_MISSION_ID, ["swordsman", "mystic"]);
  const match = necromancerMatchState(["swordsman", "mystic"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 13);
  assert.deepEqual(config.squads[1], ["swordsman", "mystic"]);
  assert.deepEqual(config.squads[2], ["necromancer", "virus"]);
  assert.equal(config.teamNames[2], "Gatekeepers");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p2-0-necromancer").position, { x: 10, y: 2 });
  assert.deepEqual(findUnit(match, "p2-1-virus").position, { x: 8, y: 5 });
  assert.equal(findUnit(match, "p2-0-necromancer").hp, 12); // ceil(23/2)
  assert.equal(findUnit(match, "p2-1-virus").hp, 13);       // ceil(25/2)
  // Player units spawn by slot index regardless of which units were drafted, well
  // outside the Virus's turn-one Cough range (6 > 5).
  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 2, y: 10 });
  assert.deepEqual(findUnit(match, "p1-1-mystic").position, { x: 4, y: 9 });
});

test("Necromancer mission opens with a Dead Zone + Spread taunt and a cure/spacing hint", () => {
  const state = necromancerMatchState();
  const dispatched = campaignOpeningScript(NECROMANCER_MISSION_ID, state);
  const direct = necromancerMissionOpeningScript(state);

  assert.deepEqual(dispatched, direct);
  assert.equal(direct.length >= 3, true);
  assert.equal(direct[0].speakerId, "p2-0-necromancer");
  assert.match(direct[0].text, /magic/i);
  assert.equal(direct[1].speakerId, "p2-1-virus");
  assert.match(direct[1].text, /close|near/i);
  assert.match(direct.at(-1).speakerId, /^p1-/);
  assert.match(direct.at(-1).text, /curse|cure/i);
});

test("status warning fires once a player unit is debuffed and cures nothing when clean", () => {
  const base = necromancerMatchState();
  const clean = { ...base, phase: "playing" };
  const poisoned = {
    ...base,
    phase: "playing",
    units: base.units.map((unit) =>
      unit.id === "p1-0-swordsman"
        ? { ...unit, statuses: [{ type: "poison", damage: 1 }] }
        : unit),
  };

  assert.equal(shouldShowNecromancerStatusWarning(clean), false);
  assert.equal(shouldShowNecromancerStatusWarning(poisoned), true);
  assert.equal(shouldShowNecromancerStatusWarning(poisoned, { warningShown: true }), false);
  assert.equal(necromancerStatusWarningScript(poisoned).length >= 2, true);
});

test("summon warning fires when a Necromancer ghoul is on the board", () => {
  const base = necromancerMatchState();
  const withGhoul = {
    ...base,
    phase: "playing",
    units: [
      ...base.units,
      { id: "p2-0-necromancer-ghoul-0", type: "ghoul", player: 2, hp: 8, position: { x: 9, y: 3 }, summonerId: "p2-0-necromancer", statuses: [] },
    ],
  };

  assert.equal(shouldShowNecromancerSummonWarning(base), false);
  assert.equal(shouldShowNecromancerSummonWarning(withGhoul), true);
  assert.equal(shouldShowNecromancerSummonWarning(withGhoul, { warningShown: true }), false);
  assert.equal(necromancerSummonWarningScript(withGhoul).length >= 2, true);
});

test("rage warning fires only once the Necromancer is alive and at RAGE HP", () => {
  const base = necromancerMatchState();
  const withHp = (hp) => ({
    ...base,
    phase: "playing",
    units: base.units.map((unit) => unit.id === "p2-0-necromancer" ? { ...unit, hp } : unit),
  });

  assert.equal(shouldShowNecromancerRageWarning(withHp(6)), false);
  assert.equal(shouldShowNecromancerRageWarning(withHp(5)), true);
  assert.equal(shouldShowNecromancerRageWarning(withHp(0)), false);
  assert.equal(shouldShowNecromancerRageWarning(withHp(5), { warningShown: true }), false);
  assert.equal(necromancerRageWarningScript(withHp(5)).length >= 2, true);
});

test("Necromancer grading rewards completion, survival, cleansing, and a no-spread bonus", () => {
  const base = necromancerMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(NECROMANCER_MISSION_ID, won, { cleanseUsed: true, spreadHitCount: 0 });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "survive", "cleansed"]);
  assert.equal(perfect.bonusObjectives[0].id, "spread");
  assert.equal(perfect.earnedBonusStars, 1);

  // No cleanse → the third objective star is missing (spread hit removes the bonus too,
  // isolating the cleanse objective at complete + survive = 2 stars).
  const noCleanse = evaluateCampaignMission(NECROMANCER_MISSION_ID, won, { cleanseUsed: false, spreadHitCount: 1 });
  assert.equal(noCleanse.stars, 2);
  assert.equal(noCleanse.objectives.find((o) => o.id === "cleansed").earned, false);
  // A spread between your units drops the bonus but keeps the three base stars capped at 3.
  const spread = evaluateCampaignMission(NECROMANCER_MISSION_ID, won, { cleanseUsed: true, spreadHitCount: 2 });
  assert.equal(spread.stars, 3);
  assert.equal(spread.bonusObjectives[0].earned, false);

  // A dead unit fails survival.
  const oneDown = {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-1-mystic" ? { ...unit, hp: 0 } : unit),
  };
  assert.equal(evaluateCampaignMission(NECROMANCER_MISSION_ID, oneDown, { cleanseUsed: true, spreadHitCount: 0 }).stars, 3);
  assert.equal(
    evaluateCampaignMission(NECROMANCER_MISSION_ID, oneDown, { cleanseUsed: true, spreadHitCount: 0 }).objectives.find((o) => o.id === "survive").earned,
    false,
  );
});

test("completing the Necromancer mission unlocks Necromancer and records its stars", () => {
  const storage = storageAdapter();
  // Seed enough stars to have the node unlocked in progress terms (grading itself does
  // not gate on unlock, but this mirrors real play reaching mission 2).
  const base = necromancerMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, NECROMANCER_MISSION_ID, won, { cleanseUsed: true, spreadHitCount: 0 });
  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.equal(completed.newRewardUnits.includes("necromancer"), true);
  assert.equal(isUnitUnlocked("necromancer", storage), true);
  assert.equal(readCampaignProgressStars(storage, NECROMANCER_MISSION_ID), 3);
});

function readCampaignProgressStars(storage, missionId) {
  return getCampaignMap(storage).nodes.find((node) => node.id === missionId)?.stars ?? 0;
}
