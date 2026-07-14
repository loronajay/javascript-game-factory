import test from "node:test";
import assert from "node:assert/strict";

import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { getActiveWeather, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { findUnit } from "../src/core/state.js";
import { resolveVictory } from "../src/core/turnEngine.js";
import { isUnitUnlocked } from "../src/ui/squadModel.js";
import {
  BROTHERS_MISSION_ID,
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_FAT_TYPES,
  HASBEEN_HEROES_MISSION_ID,
  HASBEEN_MYSTIC_SKIN_PACK,
  MAX_CAMPAIGN_MISSIONS,
  MINER_MISSION_ID,
  NECROMANCER_MISSION_ID,
  NOT_MY_KING_ENEMY_TYPES,
  NOT_MY_KING_MISSION_ID,
  MONK_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  RONIN_MISSION_ID,
  SNIPER_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  SHOWDOWN_FAT_TYPES,
  SHOWDOWN_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VIRUS_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  WANDERING_PARTY_SKIN_PACK,
  WITCH_DOCTOR_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
  applyLockedSlots,
  brothersDefeatScript,
  brothersMissionOpeningScript,
  brothersRageWarningScript,
  shouldShowBrothersRageWarning,
  campaignMapCutsceneScript,
  campaignOpeningScript,
  campaignPostMatchCutsceneScript,
  campaignRewardPickedScript,
  campaignSelectableUnitTypes,
  hasbeenHeroesMissionOpeningScript,
  hasbeenHeroesDefeatScript,
  hasbeenFatRageWarningScript,
  shouldShowHasbeenFatRageWarning,
  markCampaignPostMatchCutsceneSeen,
  shouldShowCampaignPostMatchCutscene,
  clodMissionOpeningScript,
  clodRageWarningScript,
  applyMonkTrialIntroBeat,
  createCampaignMatchConfig,
  completeCampaignMission,
  evaluateCampaignMission,
  fatherTimeMissionOpeningScript,
  fatherTimeRageWarningScript,
  gargoyleMissionOpeningScript,
  gargoyleRageWarningScript,
  getCampaignMap,
  getCampaignMission,
  markCampaignMapCutsceneSeen,
  minerBlastingCapSplashWarningScript,
  minerDefeatScript,
  minerMissionOpeningScript,
  minerRageWarningScript,
  notMyKingDefeatScript,
  notMyKingEnemyRageWarningScript,
  notMyKingMissionOpeningScript,
  roninBlindWarningScript,
  roninDefeatScript,
  roninMissionOpeningScript,
  roninRageWarningScript,
  wrongPlaceDefeatScript,
  wrongPlaceMissionOpeningScript,
  monkMissionOpeningScript,
  necromancerMissionOpeningScript,
  necromancerRageWarningScript,
  necromancerStatusWarningScript,
  necromancerSummonWarningScript,
  normalizeCampaignSquad,
  outOfRetirementAngelRageWarningScript,
  outOfRetirementDefeatScript,
  outOfRetirementLightseekerWarningScript,
  outOfRetirementMissionOpeningScript,
  outOfRetirementStatusTauntScript,
  prepareCampaignMatchState,
  resetCampaignProgress,
  shouldShowClodRageWarning,
  shouldShowFatherTimeRageWarning,
  shouldShowGargoyleRageWarning,
  shouldShowMinerBlastingCapSplashWarning,
  shouldShowMinerRageWarning,
  shouldShowNotMyKingEnemyRageWarning,
  shouldShowCampaignMapCutscene,
  shouldShowNecromancerRageWarning,
  shouldShowNecromancerStatusWarning,
  shouldShowNecromancerSummonWarning,
  shouldShowOutOfRetirementAngelRageWarning,
  shouldShowPaladinLightseekerWarning,
  shouldShowPaladinRageWarning,
  shouldShowPaladinStatusTaunt,
  shouldShowRoninBlindWarning,
  shouldShowRoninRageWarning,
  shouldShowSniperFireWarning,
  shouldShowSpiritWoodsGreatFloodDialogue,
  shouldShowSpiritWoodsPaladinStatusTaunt,
  shouldShowSpiritWoodsTreantFireTaunt,
  shouldShowSpiritWoodsTreantPoisonTaunt,
  shouldShowVirusEnemyStatusTaunt,
  shouldShowVirusPoisonWarning,
  shouldShowWitchDoctorBlockedShotWarning,
  shouldShowWitchDoctorFireWarning,
  shouldShowWitchDoctorGhoulWarning,
  shouldShowWitchDoctorRageWarning,
  paladinDefeatScript,
  paladinLightseekerWarningScript,
  paladinMissionOpeningScript,
  paladinRageWarningScript,
  paladinStatusTauntScript,
  sniperFireWarningScript,
  sniperMissionOpeningScript,
  spiritWoodsGreatFloodScript,
  spiritWoodsMissionOpeningScript,
  spiritWoodsPaladinStatusTauntScript,
  spiritWoodsTreantFireTauntScript,
  spiritWoodsTreantPoisonTauntScript,
  showdownDefeatScript,
  showdownFatRageWarningScript,
  showdownMissionOpeningScript,
  shouldShowShowdownFatRageWarning,
  virusEnemyStatusTauntScript,
  virusMissionOpeningScript,
  virusPoisonWarningScript,
  voidwoodDefeatScript,
  voidwoodEnemyFallScript,
  voidwoodMissionOpeningScript,
  witchDoctorBlockedShotWarningScript,
  witchDoctorFireWarningScript,
  witchDoctorGhoulWarningScript,
  witchDoctorMissionOpeningScript,
  witchDoctorRageWarningScript,
  writeCampaignProgress,
} from "../src/campaign/campaign.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation } from "../src/core/commands.js";
import { isProgressSkinUnlocked, readUnlockProgress } from "../src/progression/unlocks.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("fresh campaign map surveys the active campaign graph with Clod live and the rest gated", () => {
  const map = getCampaignMap(storageAdapter());

  assert.equal(map.totalStars, 0);
  // The full journey is always visible so the player gets an overview.
  assert.equal(map.nodes.length, MAX_CAMPAIGN_MISSIONS);
  assert.equal(map.nodes[0].id, CLOD_MISSION_ID);
  assert.equal(map.nodes[0].status, "available");
  assert.equal(map.nodes[0].displayType, "clod");
  assert.equal(map.nodes[1].id, NECROMANCER_MISSION_ID);
  assert.equal(map.nodes[1].status, "locked");
  assert.equal(map.nodes[1].displayType, null);

  // Every node carries a derived canvas position; the graph carries trail edges.
  for (const node of map.nodes) {
    assert.equal(typeof node.position.x, "number");
    assert.equal(typeof node.position.y, "number");
  }
  assert.ok(map.edges.length >= map.nodes.length - 1, "trails connect the graph");
  const clodEdge = map.edges.find((edge) => edge.from === CLOD_MISSION_ID || edge.to === CLOD_MISSION_ID);
  assert.ok(clodEdge, "the opening stop is on a trail");
  assert.match(clodEdge.d, /^M /, "trail carries an SVG path");
  // Trails into locked ground stay locked; the opener touches only itself so far.
  assert.ok(map.edges.every((edge) => edge.status === "open" || edge.status === "locked"));
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

function witchDoctorMatchState(squad = ["archer"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(WITCH_DOCTOR_MISSION_ID, squad)),
    WITCH_DOCTOR_MISSION_ID,
  );
}

function fatherTimeMatchState(squad = ["swordsman", "archer"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(FATHER_TIME_MISSION_ID, squad)),
    FATHER_TIME_MISSION_ID,
  );
}

function virusMatchState(squad = ["swordsman", "archer", "mystic", "witch-doctor"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(VIRUS_MISSION_ID, squad)),
    VIRUS_MISSION_ID,
  );
}

function paladinMatchState(squad = ["swordsman"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(PALADIN_MISSION_ID, squad)),
    PALADIN_MISSION_ID,
  );
}

function monkMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(MONK_MISSION_ID, squad)),
    MONK_MISSION_ID,
  );
}

function gargoyleMatchState(squad = ["swordsman"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(GARGOYLE_MISSION_ID, squad)),
    GARGOYLE_MISSION_ID,
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
  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 4, y: 9 });
  assert.deepEqual(findUnit(match, "p1-1-mystic").position, { x: 2, y: 10 });
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

// --- Mission 3: Cursed Swamp of the Witch Doctor ------------------------------

test("Witch Doctor mission appears as the third swamp stop once enough stars are banked", () => {
  const storage = storageAdapter();
  const clod = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  const wonClod = {
    ...clod,
    phase: "complete",
    winner: 1,
    units: clod.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  };
  completeCampaignMission(storage, CLOD_MISSION_ID, wonClod, { clodChargeHitCount: 1 });

  const necro = necromancerMatchState();
  const wonNecro = {
    ...necro,
    phase: "complete",
    winner: 1,
    units: necro.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  };
  completeCampaignMission(storage, NECROMANCER_MISSION_ID, wonNecro, { cleanseUsed: true, spreadHitCount: 0 });

  const map = getCampaignMap(storage);
  const node = map.nodes[2];
  assert.equal(node.id, WITCH_DOCTOR_MISSION_ID);
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "witch-doctor");
  assert.equal(node.biome, "swamp");
});

test("Witch Doctor mission builds a 9x9 solo gauntlet: a spread Ghoul lattice ringed by a map-edge fire border", () => {
  // squadLocked pins the squad to the Archer regardless of what's passed in.
  const config = createCampaignMatchConfig(WITCH_DOCTOR_MISSION_ID, ["mystic"]);
  const match = witchDoctorMatchState(["mystic"]);
  const ghouls = match.units.filter((unit) => unit.type === "ghoul");
  const fires = Object.values(match.tileObjects ?? {}).filter((obj) => obj.kind === "fire");

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["archer"]);
  assert.deepEqual(config.squads[2], ["witch-doctor"]);
  assert.equal(config.teamNames[2], "Swamp Coven");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p1-0-archer").position, { x: 0, y: 8 });
  assert.deepEqual(findUnit(match, "p2-0-witch-doctor").position, { x: 6, y: 2 });
  assert.equal(findUnit(match, "p1-0-archer").hp, 12);
  assert.equal(findUnit(match, "p2-0-witch-doctor").hp, 12);
  assert.equal(ghouls.length, 8); // a spread 3x3 lattice (spacing 2) minus the Witch Doctor's slot
  assert.equal(ghouls.every((unit) => unit.hp === 5 && unit.mp === 0 && unit.spent === true), true);
  assert.equal(ghouls.every((unit) => unit.summonerId == null), true);
  assert.equal(Object.values(match.tileObjects ?? {}).some((obj) => obj.kind === "wall"), false);
  assert.equal(fires.length, 53);
  assert.equal(fires.every((obj) => obj.permanent === true), true);

  const ghoulKeys = new Set(ghouls.map((unit) => `${unit.position.x},${unit.position.y}`));
  // The lattice fills the full 3x3 spacing-2 grid (x,y each in {2,4,6}) except the Witch
  // Doctor's own top-right slot (6,2) — no ninth Ghoul there.
  for (const x of [2, 4, 6]) {
    for (const y of [2, 4, 6]) {
      if (x === 6 && y === 2) continue;
      assert.ok(ghoulKeys.has(`${x},${y}`), `lattice tile (${x},${y}) is occupied`);
    }
  }
  assert.ok(!ghoulKeys.has("6,2"), "the Witch Doctor's slot has no Ghoul");

  const fireAt = (x, y) => (match.tileObjects ?? {})[`${x},${y}`]?.kind === "fire";
  // A full 1-tile fire border runs along every true map edge except the Archer's own
  // spawn tile — this is what closes the edge-creep loophole.
  for (let x = 0; x <= 8; x += 1) assert.ok(fireAt(x, 0), `top edge (${x},0) burns`);
  for (let x = 1; x <= 8; x += 1) assert.ok(fireAt(x, 8), `bottom edge (${x},8) burns`);
  for (let y = 0; y <= 8; y += 1) assert.ok(fireAt(8, y), `right edge (8,${y}) burns`);
  for (let y = 0; y <= 7; y += 1) assert.ok(fireAt(0, y), `left edge (0,${y}) burns`);
  assert.ok(!fireAt(0, 8), "the Archer's own spawn tile never burns");

  // Each Ghoul's own orthogonal (not diagonal) neighbours burn too, sitting immediately
  // adjacent to the map-edge border with no safe gap between them.
  for (const [x, y] of [[2, 1], [4, 1], [2, 3], [1, 2], [3, 2]]) {
    assert.ok(fireAt(x, y), `lattice orthogonal fire tile (${x},${y}) burns`);
  }
  // A diagonal gap between Ghouls stays fire-free but is still covered by Ghoul-Bite range
  // (Chebyshev 1) from more than one neighbour — orthogonal-only fire, diagonal bite risk.
  assert.ok(!fireAt(3, 3), "a diagonal lattice gap doesn't burn even though it's bite range");

  // No fully hazard-free path exists from the Archer's spawn corner to the Witch Doctor:
  // other than his own tile and the spawn, the only tiles with neither fire nor any Ghoul
  // within Bite range (Chebyshev 1) sit isolated right next to his vacated lattice slot,
  // unreachable without first crossing a covered tile.
  const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const biteFree = (x, y) => ghouls.every((g) => chebyshev(g.position, { x, y }) > 1);
  const clear = (x, y) => !fireAt(x, y) && biteFree(x, y) && !ghoulKeys.has(`${x},${y}`);
  const clearTiles = [];
  for (let x = 0; x <= 8; x += 1) {
    for (let y = 0; y <= 8; y += 1) {
      if (clear(x, y)) clearTiles.push(`${x},${y}`);
    }
  }
  assert.deepEqual(
    clearTiles.sort(),
    ["0,8", "6,1", "6,2", "7,1", "7,2"].sort(),
    "the only fully-clear tiles are the spawn and a small pocket around the Witch Doctor's slot"
  );
});

test("Witch Doctor mission dialogue covers body-block, fire, Ghoul bite, and RAGE warnings", () => {
  const state = witchDoctorMatchState();
  const dispatched = campaignOpeningScript(WITCH_DOCTOR_MISSION_ID, state);
  const direct = witchDoctorMissionOpeningScript(state);

  assert.deepEqual(dispatched, direct);
  assert.equal(direct.length >= 2, true);
  assert.equal(direct[0].speakerId, "p2-0-witch-doctor");
  assert.match(direct[0].text, /flame|fire/i);
  assert.match(direct.at(-1).text, /straight line|straight shot|line/i);

  assert.equal(shouldShowWitchDoctorFireWarning({ ...state, phase: "playing" }, { fireDamageTakenCount: 1 }), true);
  assert.equal(shouldShowWitchDoctorFireWarning({ ...state, phase: "playing" }, { fireDamageTakenCount: 1, warningShown: true }), false);
  assert.match(witchDoctorFireWarningScript(state)[0].text, /swamp|fire/i);

  assert.equal(shouldShowWitchDoctorBlockedShotWarning({ ...state, phase: "playing" }, { blockedShotQueued: true }), true);
  assert.equal(shouldShowWitchDoctorBlockedShotWarning({ ...state, phase: "playing" }, { blockedShotQueued: false }), false);
  assert.match(witchDoctorBlockedShotWarningScript(state)[0].text, /arrow|spread|wide/i);

  assert.equal(shouldShowWitchDoctorGhoulWarning({ ...state, phase: "playing" }, { ghoulBiteTakenCount: 1 }), true);
  assert.match(witchDoctorGhoulWarningScript(state)[0].text, /close|near/i);

  const withHp = (hp) => ({
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-witch-doctor" ? { ...unit, hp } : unit),
  });
  assert.equal(shouldShowWitchDoctorRageWarning(withHp(6)), false);
  assert.equal(shouldShowWitchDoctorRageWarning(withHp(5)), true);
  assert.equal(shouldShowWitchDoctorRageWarning(withHp(5), { warningShown: true }), false);
  assert.match(witchDoctorRageWarningScript(withHp(5))[0].text, /dance|dark|swamp/i);
});

test("Witch Doctor grading rewards a cleared Ghoul, no hazard damage, and a no-Black-Death bonus", () => {
  const base = witchDoctorMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(WITCH_DOCTOR_MISSION_ID, won, {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "ghoulCleared", "unscathed"]);
  assert.equal(perfect.bonusObjectives[0].id, "noBlackDeath");
  assert.equal(perfect.earnedBonusStars, 1);

  const routedOnly = evaluateCampaignMission(WITCH_DOCTOR_MISSION_ID, won, {
    ghoulsDefeatedCount: 0,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });
  assert.equal(routedOnly.objectives.find((objective) => objective.id === "ghoulCleared").earned, false);
  assert.equal(routedOnly.stars, 3, "the bonus can cover one missed base objective");

  const scorched = evaluateCampaignMission(WITCH_DOCTOR_MISSION_ID, won, {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 1,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: true,
  });
  assert.equal(scorched.objectives.find((objective) => objective.id === "unscathed").earned, false);
  assert.equal(scorched.bonusObjectives[0].earned, false);
  assert.equal(scorched.stars, 2);
});

test("completing the Witch Doctor mission unlocks Witch Doctor and records its stars", () => {
  const storage = storageAdapter();
  const base = witchDoctorMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, WITCH_DOCTOR_MISSION_ID, won, {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["witch-doctor"]);
  assert.equal(isUnitUnlocked("witch-doctor", storage), true);
  assert.equal(readCampaignProgressStars(storage, WITCH_DOCTOR_MISSION_ID), 3);
});

// --- Mission 4: Timeless Woods ------------------------------------------------

test("Timeless Woods replaces the fourth placeholder once enough stars are banked", () => {
  const storage = storageAdapter();
  const mapBefore = getCampaignMap(storage);
  assert.equal(mapBefore.nodes[3].id, FATHER_TIME_MISSION_ID);
  assert.equal(mapBefore.nodes[3].status, "locked");
  assert.equal(mapBefore.nodes[3].displayType, null);

  // Six banked stars from earlier missions reveal Mission 4.
  const clod = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  completeCampaignMission(storage, CLOD_MISSION_ID, {
    ...clod,
    phase: "complete",
    winner: 1,
    units: clod.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  }, { clodChargeHitCount: 1 });
  const necro = necromancerMatchState();
  completeCampaignMission(storage, NECROMANCER_MISSION_ID, {
    ...necro,
    phase: "complete",
    winner: 1,
    units: necro.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  }, { cleanseUsed: true, spreadHitCount: 0 });

  const node = getCampaignMap(storage).nodes[3];
  assert.equal(node.id, FATHER_TIME_MISSION_ID);
  assert.equal(node.title, "Timeless Woods");
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "father-time");
  assert.equal(node.biome, "forest");
});

test("Timeless Woods builds an 11x11 normal-placement fight against Father Time and an Archer", () => {
  const config = createCampaignMatchConfig(FATHER_TIME_MISSION_ID, ["swordsman", "mystic"]);
  const match = fatherTimeMatchState(["swordsman", "mystic"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 11);
  assert.deepEqual(config.squads[1], ["swordsman", "mystic"]);
  assert.deepEqual(config.squads[2], ["father-time", "archer"]);
  assert.equal(config.teamNames[2], "Timeless Court");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 1, y: 10 });
  assert.deepEqual(findUnit(match, "p1-1-mystic").position, { x: 0, y: 9 });
  assert.deepEqual(findUnit(match, "p2-0-father-time").position, { x: 9, y: 0 });
  assert.deepEqual(findUnit(match, "p2-1-archer").position, { x: 10, y: 1 });
  assert.equal(findUnit(match, "p2-0-father-time").hp, 13);
  assert.equal(findUnit(match, "p2-1-archer").hp, 12);
});

test("Timeless Woods opening and RAGE warning teach Age buffs and Rewind", () => {
  const state = fatherTimeMatchState();
  const dispatched = campaignOpeningScript(FATHER_TIME_MISSION_ID, state);
  const direct = fatherTimeMissionOpeningScript(state);

  assert.deepEqual(dispatched, direct);
  assert.equal(direct.length >= 4, true);
  assert.equal(direct[0].speakerId, "p2-0-father-time");
  assert.equal(direct[1].speakerId, "p2-1-archer");
  assert.match(direct.map((line) => line.text).join(" "), /Age/i);
  assert.match(direct.map((line) => line.text).join(" "), /STR|DEF|stat/i);
  assert.match(direct.map((line) => line.text).join(" "), /Rewind|revive|fallen/i);

  const withHp = (hp) => ({
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-father-time" ? { ...unit, hp } : unit),
  });
  assert.equal(shouldShowFatherTimeRageWarning(withHp(6)), false);
  assert.equal(shouldShowFatherTimeRageWarning(withHp(5)), true);
  assert.equal(shouldShowFatherTimeRageWarning(withHp(5), { warningShown: true }), false);
  assert.match(fatherTimeRageWarningScript(withHp(5)).map((line) => line.text).join(" "), /Rewind|fallen|revive/i);
});

test("Father Time opens Timeless Woods by Aging the Archer's strength", () => {
  const state = { ...fatherTimeMatchState(["swordsman", "mystic"]), currentPlayer: 2 };
  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });

  assert.ok(commands.some((command) =>
    command.type === "USE_ART" &&
    command.unitId === "p2-0-father-time" &&
    command.artId === "age" &&
    command.targetId === "p2-1-archer" &&
    command.stat === "strength"
  ));
});

test("Timeless Woods grading rewards no losses, Archer first, no Rewind, and a blind bonus", () => {
  const base = fatherTimeMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(FATHER_TIME_MISSION_ID, won, {
    archerDefeatedBeforeFatherTime: true,
    rewindUsed: false,
    archerBlinded: true,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["survive", "archerFirst", "noRewind"]);
  assert.equal(perfect.bonusObjectives[0].id, "blindArcher");
  assert.equal(perfect.earnedBonusStars, 1);

  const fatherTimeFirst = evaluateCampaignMission(FATHER_TIME_MISSION_ID, won, {
    archerDefeatedBeforeFatherTime: false,
    rewindUsed: true,
    archerBlinded: false,
  });
  assert.equal(fatherTimeFirst.objectives.find((objective) => objective.id === "archerFirst").earned, false);
  assert.equal(fatherTimeFirst.objectives.find((objective) => objective.id === "noRewind").earned, false);
  assert.equal(fatherTimeFirst.bonusObjectives[0].earned, false);
  assert.equal(fatherTimeFirst.stars, 1);

  const archerStillBlind = {
    ...won,
    units: won.units.map((unit) =>
      unit.id === "p2-1-archer" ? { ...unit, statuses: [{ type: "blind", duration: 1 }] } : unit),
  };
  const finalStatusBonus = evaluateCampaignMission(FATHER_TIME_MISSION_ID, archerStillBlind, {
    archerDefeatedBeforeFatherTime: false,
    rewindUsed: false,
  });
  assert.equal(finalStatusBonus.bonusObjectives[0].earned, true);
});

test("completing Timeless Woods unlocks Father Time and records its stars", () => {
  const storage = storageAdapter();
  const base = fatherTimeMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, FATHER_TIME_MISSION_ID, won, {
    archerDefeatedBeforeFatherTime: true,
    rewindUsed: false,
    archerBlinded: true,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["father-time"]);
  assert.equal(isUnitUnlocked("father-time", storage), true);
  assert.equal(readCampaignProgressStars(storage, FATHER_TIME_MISSION_ID), 3);
});

// --- Mission 5: Root of the Virus ---------------------------------------------

test("Root of the Virus replaces the fifth swamp placeholder once enough stars are banked", () => {
  const storage = storageAdapter();
  const perfect = (missionId, state, meta) => completeCampaignMission(storage, missionId, {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  }, meta);

  perfect(CLOD_MISSION_ID, prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  ), { clodChargeHitCount: 1 });
  perfect(NECROMANCER_MISSION_ID, necromancerMatchState(), { cleanseUsed: true, spreadHitCount: 0 });
  perfect(WITCH_DOCTOR_MISSION_ID, witchDoctorMatchState(), {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });

  const node = getCampaignMap(storage).nodes[4];
  assert.equal(node.id, VIRUS_MISSION_ID);
  assert.equal(node.title, "Root of the Virus");
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "virus");
  assert.equal(node.biome, "swamp");
});

test("Root of the Virus builds a full-HP 11x11 4v4 duel against three Viruses and a Witch Doctor", () => {
  const config = createCampaignMatchConfig(VIRUS_MISSION_ID, ["swordsman", "archer", "mystic", "witch-doctor"]);
  const match = virusMatchState(["swordsman", "archer", "mystic", "witch-doctor"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 11);
  assert.deepEqual(config.squads[1], ["swordsman", "archer", "mystic", "witch-doctor"]);
  assert.deepEqual(config.squads[2], ["virus", "virus", "virus", "witch-doctor"]);
  assert.equal(config.teamNames[2], "Viral Root");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 1, y: 10 });
  assert.deepEqual(findUnit(match, "p1-3-witch-doctor").position, { x: 1, y: 9 });
  assert.deepEqual(findUnit(match, "p2-0-virus").position, { x: 9, y: 0 });
  assert.deepEqual(findUnit(match, "p2-3-witch-doctor").position, { x: 9, y: 1 });
  assert.equal(findUnit(match, "p1-2-mystic").hp, 23);
  assert.equal(findUnit(match, "p1-3-witch-doctor").hp, 24);
  assert.equal(findUnit(match, "p2-0-virus").hp, 25);
  assert.equal(findUnit(match, "p2-3-witch-doctor").hp, 24);
  assert.equal(match.aiProfile?.virusMisfortune?.sourceId, "p2-3-witch-doctor");
});

test("Root of the Virus dialogue covers banter, first poison, and status payback", () => {
  const state = virusMatchState();
  const direct = virusMissionOpeningScript(state);

  assert.deepEqual(campaignOpeningScript(VIRUS_MISSION_ID, state), direct);
  assert.equal(direct.length >= 3, true);
  assert.equal(direct[0].speakerId, "p2-3-witch-doctor");
  assert.match(direct.map((line) => line.text).join(" "), /root|virus|poison|spread/i);

  const poisoned = {
    ...state,
    phase: "playing",
    units: state.units.map((unit) =>
      unit.id === "p1-0-swordsman" ? { ...unit, statuses: [{ type: "poison", duration: "permanent" }] } : unit),
  };
  assert.equal(shouldShowVirusPoisonWarning(poisoned), true);
  assert.equal(shouldShowVirusPoisonWarning(poisoned, { warningShown: true }), false);
  assert.match(virusPoisonWarningScript(poisoned).map((line) => line.text).join(" "), /poison|spread|apart/i);

  const cursedEnemy = {
    ...state,
    phase: "playing",
    units: state.units.map((unit) =>
      unit.id === "p2-0-virus" ? { ...unit, statuses: [{ type: "silence", duration: 1 }] } : unit),
  };
  assert.equal(shouldShowVirusEnemyStatusTaunt(cursedEnemy, { playerAfflictedEnemyStatus: true }), true);
  assert.match(virusEnemyStatusTauntScript(cursedEnemy).map((line) => line.text).join(" "), /medicine|taste|curse|status/i);
});

test("Witch Doctor opens the Virus squad synergy with Misfortune Dance when a Virus can follow up", () => {
  const state = {
    ...virusMatchState(),
    currentPlayer: 2,
    units: virusMatchState().units.map((unit) => {
      if (unit.id === "p2-3-witch-doctor") return { ...unit, position: { x: 5, y: 5 } };
      if (unit.id === "p2-0-virus") return { ...unit, position: { x: 5, y: 6 } };
      if (unit.id === "p1-0-swordsman") return { ...unit, position: { x: 5, y: 8 } };
      return unit;
    }),
  };
  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });

  assert.ok(commands.some((command) =>
    command.type === "USE_ART" &&
    command.unitId === "p2-3-witch-doctor" &&
    command.artId === "misfortune-dance"
  ));
});

test("Root of the Virus grading rewards victory, no Spread, drafting Mystic, and the Witch Doctor plus Mystic bonus", () => {
  const base = virusMatchState(["swordsman", "archer", "mystic", "witch-doctor"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(VIRUS_MISSION_ID, won, { spreadHitCount: 0 });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noSpread", "draftMystic"]);
  assert.equal(perfect.bonusObjectives[0].id, "mysticWitchDoctor");
  assert.equal(perfect.earnedBonusStars, 1);

  const spread = evaluateCampaignMission(VIRUS_MISSION_ID, won, { spreadHitCount: 1 });
  assert.equal(spread.objectives.find((objective) => objective.id === "noSpread").earned, false);
  assert.equal(spread.stars, 3, "the bonus can cover one missed base objective");

  const noMysticBase = virusMatchState(["swordsman", "archer", "magician", "witch-doctor"]);
  const noMysticWon = {
    ...noMysticBase,
    phase: "complete",
    winner: 1,
    units: noMysticBase.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
  const noMystic = evaluateCampaignMission(VIRUS_MISSION_ID, noMysticWon, { spreadHitCount: 0 });
  assert.equal(noMystic.objectives.find((objective) => objective.id === "draftMystic").earned, false);
  assert.equal(noMystic.bonusObjectives[0].earned, false);
  assert.equal(noMystic.stars, 2);
});

test("completing Root of the Virus unlocks Virus and records its stars", () => {
  const storage = storageAdapter();
  const base = virusMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, VIRUS_MISSION_ID, won, { spreadHitCount: 0 });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["virus"]);
  assert.equal(isUnitUnlocked("virus", storage), true);
  assert.equal(readCampaignProgressStars(storage, VIRUS_MISSION_ID), 3);
});

// --- Mission 6: Wandering Paladin ---------------------------------------------

test("Wandering Paladin replaces the sixth coastal placeholder once enough stars are banked", () => {
  const storage = storageAdapter();
  const perfect = (missionId, state, meta) => completeCampaignMission(storage, missionId, {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  }, meta);

  perfect(CLOD_MISSION_ID, prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  ), { clodChargeHitCount: 1 });
  perfect(NECROMANCER_MISSION_ID, necromancerMatchState(), { cleanseUsed: true, spreadHitCount: 0 });
  perfect(WITCH_DOCTOR_MISSION_ID, witchDoctorMatchState(), {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });
  perfect(FATHER_TIME_MISSION_ID, fatherTimeMatchState(), {
    archerDefeatedBeforeFatherTime: true,
    rewindUsed: false,
    archerBlinded: true,
  });
  perfect(VIRUS_MISSION_ID, virusMatchState(), { spreadHitCount: 0 });

  const node = getCampaignMap(storage).nodes[5];
  assert.equal(node.id, PALADIN_MISSION_ID);
  assert.equal(node.title, "Wandering Paladin");
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "paladin");
  assert.equal(node.biome, "water");
});

test("Wandering Paladin builds a full-HP 5x5 chosen-unit duel with Paladin in the far corner", () => {
  const config = createCampaignMatchConfig(PALADIN_MISSION_ID, ["mystic"]);
  const match = paladinMatchState(["mystic"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 5);
  assert.deepEqual(config.squads[1], ["mystic"]);
  assert.deepEqual(config.squads[2], ["paladin"]);
  assert.equal(config.teamNames[2], "Wandering Paladin");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p1-0-mystic").position, { x: 0, y: 4 });
  assert.deepEqual(findUnit(match, "p2-0-paladin").position, { x: 4, y: 0 });
  assert.equal(findUnit(match, "p1-0-mystic").hp, 23);
  assert.equal(findUnit(match, "p2-0-paladin").hp, 26);
});

test("Wandering Paladin map cutscene is a first-click switch cleared by progress reset", () => {
  const storage = storageAdapter();

  assert.equal(shouldShowCampaignMapCutscene(storage, PALADIN_MISSION_ID), true);
  const script = campaignMapCutsceneScript(PALADIN_MISSION_ID);
  assert.equal(script.length >= 3, true);
  assert.match(script.map((line) => line.text).join(" "), /road north|royal sorcerer|worthy/i);
  markCampaignMapCutsceneSeen(storage, PALADIN_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, PALADIN_MISSION_ID), false);

  resetCampaignProgress(storage);
  assert.equal(shouldShowCampaignMapCutscene(storage, PALADIN_MISSION_ID), true);
  assert.equal(shouldShowCampaignMapCutscene(storage, CLOD_MISSION_ID), false);
});

test("Wandering Paladin dialogue covers the duel, Lightseeker, status immunity, RAGE, and defeat", () => {
  const state = paladinMatchState(["mystic"]);
  const direct = paladinMissionOpeningScript(state);

  assert.deepEqual(campaignOpeningScript(PALADIN_MISSION_ID, state), direct);
  assert.equal(direct.length >= 2, true);
  assert.equal(direct[0].speakerId, "p2-0-paladin");
  assert.match(direct.map((line) => line.text).join(" "), /duel|join|worthy/i);

  assert.equal(shouldShowPaladinLightseekerWarning({ ...state, phase: "playing" }, { lightseekerDamageTakenCount: 1 }), true);
  assert.equal(shouldShowPaladinLightseekerWarning({ ...state, phase: "playing" }, { lightseekerDamageTakenCount: 1, warningShown: true }), false);
  assert.match(paladinLightseekerWarningScript(state).map((line) => line.text).join(" "), /Lightseeker|light/i);

  assert.equal(shouldShowPaladinStatusTaunt({ ...state, phase: "playing" }, { statusAttempted: true }), true);
  assert.equal(shouldShowPaladinStatusTaunt({ ...state, phase: "playing" }, { statusAttempted: true, warningShown: true }), false);
  assert.match(paladinStatusTauntScript(state).map((line) => line.text).join(" "), /immune|Chosen|status/i);

  const withHp = (hp) => ({
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-paladin" ? { ...unit, hp } : unit),
  });
  assert.equal(shouldShowPaladinRageWarning(withHp(6)), false);
  assert.equal(shouldShowPaladinRageWarning(withHp(5)), true);
  assert.equal(shouldShowPaladinRageWarning(withHp(5), { warningShown: true }), false);
  assert.match(paladinRageWarningScript(withHp(5)).map((line) => line.text).join(" "), /heat|RAGE|realm/i);

  const defeated = withHp(0);
  assert.match(paladinDefeatScript(defeated).map((line) => line.text).join(" "), /worthy|join/i);
});

test("Wandering Paladin grading rewards victory, avoiding Lightseeker damage, no status attempts, and a melee bonus", () => {
  const base = paladinMatchState(["swordsman"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(PALADIN_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noLightseeker", "noStatus"]);
  assert.equal(perfect.bonusObjectives[0].id, "meleeDuel");
  assert.equal(perfect.earnedBonusStars, 1);

  const hitByLight = evaluateCampaignMission(PALADIN_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 1,
    paladinStatusAttempted: false,
  });
  assert.equal(hitByLight.objectives.find((objective) => objective.id === "noLightseeker").earned, false);
  assert.equal(hitByLight.stars, 3, "the melee bonus can cover one missed base objective");

  const casterBase = paladinMatchState(["mystic"]);
  const casterWon = {
    ...casterBase,
    phase: "complete",
    winner: 1,
    units: casterBase.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
  const statusCaster = evaluateCampaignMission(PALADIN_MISSION_ID, casterWon, {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: true,
  });
  assert.equal(statusCaster.objectives.find((objective) => objective.id === "noStatus").earned, false);
  assert.equal(statusCaster.bonusObjectives[0].earned, false);
  assert.equal(statusCaster.stars, 2);
});

test("completing Wandering Paladin unlocks Paladin and records its stars", () => {
  const storage = storageAdapter();
  const base = paladinMatchState(["swordsman"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, PALADIN_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["paladin"]);
  assert.equal(isUnitUnlocked("paladin", storage), true);
  assert.equal(readCampaignProgressStars(storage, PALADIN_MISSION_ID), 3);
});

// --- Mission 7: Temple Trial of the Monk --------------------------------------

test("Temple Trial of the Monk replaces the seventh coastal placeholder once enough stars are banked", () => {
  const storage = storageAdapter();
  const perfect = (missionId, state, meta) => completeCampaignMission(storage, missionId, {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  }, meta);

  perfect(CLOD_MISSION_ID, prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  ), { clodChargeHitCount: 1 });
  perfect(NECROMANCER_MISSION_ID, necromancerMatchState(), { cleanseUsed: true, spreadHitCount: 0 });
  perfect(WITCH_DOCTOR_MISSION_ID, witchDoctorMatchState(), {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });
  perfect(FATHER_TIME_MISSION_ID, fatherTimeMatchState(), {
    archerDefeatedBeforeFatherTime: true,
    rewindUsed: false,
    archerBlinded: true,
  });
  perfect(VIRUS_MISSION_ID, virusMatchState(), { spreadHitCount: 0 });
  perfect(PALADIN_MISSION_ID, paladinMatchState(), {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
  });

  const node = getCampaignMap(storage).nodes[6];
  assert.equal(node.id, MONK_MISSION_ID);
  assert.equal(node.title, "Temple Trial of the Monk");
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "monk");
  assert.equal(node.biome, "water");
});

test("Temple Trial builds a full-HP 9x9 4v4 with one real Monk and three fake-art decoys", () => {
  const config = createCampaignMatchConfig(MONK_MISSION_ID, ["swordsman", "archer", "mystic", "magician"]);
  const mission = getCampaignMission(MONK_MISSION_ID);
  const match = monkMatchState(["swordsman", "archer", "mystic", "magician"]);
  const enemyMonks = match.units.filter((unit) => unit.player === 2 && unit.type === "monk");
  const realMonk = enemyMonks.find((unit) => unit.trialRealMonk);
  const fakeMonks = enemyMonks.filter((unit) => unit.trialFakeMonk);
  const visibleUnits = match.units.filter((unit) => !unit.introHidden);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 9);
  assert.doesNotMatch(mission.description, /fake ART|no true Monk|canon|Front Kick|Protect/i);
  assert.deepEqual(config.squads[1], ["swordsman", "archer", "mystic", "magician"]);
  assert.deepEqual(config.squads[2], ["monk", "monk", "monk", "monk"]);
  assert.equal(config.teamNames[2], "Temple Monks");
  assert.equal(match.currentPlayer, 1);

  assert.equal(enemyMonks.length, 4);
  assert.equal(fakeMonks.length, 3);
  assert.ok(realMonk, "one monk should be marked as real");
  assert.equal(match.missionRules?.monkTrial?.realMonkId, realMonk.id);
  assert.deepEqual(visibleUnits.map((unit) => unit.id), [realMonk.id]);
  assert.deepEqual(realMonk.position, { x: 4, y: 4 });
  assert.equal(realMonk.trialIntroAlert, false);
  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 1, y: 8 });
  assert.deepEqual(findUnit(match, "p1-3-magician").position, { x: 1, y: 7 });
  assert.equal(realMonk.hp, 26);
  assert.ok(fakeMonks.every((unit) => unit.hp === 26 && unit.fakeArtNames?.["front-kick"] !== "Front Kick"));
});

test("Temple Trial intro beats reveal the squad, move the Monk, then split into shuffled corner bodies", () => {
  const staged = monkMatchState(["swordsman", "archer", "mystic", "magician"]);
  const realMonk = staged.units.find((unit) => unit.trialRealMonk);

  const confronted = applyMonkTrialIntroBeat(staged, "monkIntroRevealAndMove");
  const confrontedReal = findUnit(confronted, realMonk.id);
  assert.ok(confronted.units.filter((unit) => unit.player === 1).every((unit) => !unit.introHidden));
  assert.deepEqual(confrontedReal.position, { x: 8, y: 0 });
  assert.equal(confrontedReal.trialIntroAlert, true);
  assert.ok(confronted.units.filter((unit) => unit.trialFakeMonk).every((unit) => unit.introHidden));

  const split = applyMonkTrialIntroBeat(confronted, "monkIntroSplitShuffle");
  const enemyPositions = split.units
    .filter((unit) => unit.player === 2 && unit.type === "monk")
    .map((unit) => `${unit.position.x},${unit.position.y}`)
    .sort();
  assert.deepEqual(enemyPositions, ["7,0", "7,1", "8,0", "8,1"]);
  assert.ok(split.units.every((unit) => !unit.introHidden));
  assert.ok(split.units.every((unit) => unit.trialIntroAlert !== true));
  assert.equal(split.missionRules?.monkTrial?.introComplete, true);
});

test("Temple Trial CPU opens with clue-giving Monk ARTS after the split", () => {
  const staged = monkMatchState(["swordsman", "archer", "mystic", "magician"]);
  const confronted = applyMonkTrialIntroBeat(staged, "monkIntroRevealAndMove");
  const split = {
    ...applyMonkTrialIntroBeat(confronted, "monkIntroSplitShuffle"),
    currentPlayer: 2,
  };

  const commands = chooseActivation(split, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(split) });

  assert.ok(commands.some((command) =>
    command.type === "USE_ART" &&
    ["front-kick", "protect"].includes(command.artId)
  ), "the Temple Trial monk AI should reveal real/fake art callouts instead of only basic attacking");

  let after = split;
  for (const command of commands) {
    const result = applyCommand(after, command);
    assert.ok(result.accepted, `${command.type} rejected (${result.errorCode})`);
    after = result.nextState;
  }
});

test("Temple Trial dialogue drives visual intro beats without narrating the split as text", () => {
  const state = monkMatchState();
  const direct = monkMissionOpeningScript(state);
  const copy = direct.map((line) => line.text).join(" ");

  assert.deepEqual(campaignOpeningScript(MONK_MISSION_ID, state), direct);
  assert.equal(direct.length >= 4, true);
  assert.equal(direct[0].speaker, "monk");
  assert.equal(direct[0].afterAction, "monkIntroRevealAndMove");
  assert.equal(direct[2].afterAction, "monkIntroSplitShuffle");
  assert.match(copy, /peace|disturbance|worthy|real monk|combat knowledge/i);
  assert.doesNotMatch(copy, /vanishes|splits into four bodies|shuffles/i);
  assert.doesNotMatch(copy, /Front Kick|Protect|Heightened Sense|canon kit|fake ART/i);
});

test("Temple Trial ends as soon as the real Monk dies and clears all fake monks", () => {
  const base = monkMatchState();
  const real = base.units.find((unit) => unit.trialRealMonk);
  const droppedReal = {
    ...base,
    units: base.units.map((unit) => unit.id === real.id ? { ...unit, hp: 0 } : unit),
  };

  resolveVictory(droppedReal);

  assert.equal(droppedReal.phase, "complete");
  assert.equal(droppedReal.winner, 1);
  assert.ok(droppedReal.units.filter((unit) => unit.trialFakeMonk).every((unit) => unit.hp === 0));
});

test("Temple Trial grading rewards victory, full survival, no blind attempts, and the real-first bonus", () => {
  const base = monkMatchState();
  const real = base.units.find((unit) => unit.trialRealMonk);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => {
      if (unit.player === 2) return { ...unit, hp: unit.id === real.id ? 0 : unit.hp };
      return { ...unit, hp: Math.max(1, unit.hp) };
    }),
  };

  const perfect = evaluateCampaignMission(MONK_MISSION_ID, won, {
    monkFakeKilledBeforeReal: false,
    monkBlindAttempted: false,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "survive", "noBlind"]);
  assert.equal(perfect.bonusObjectives[0].id, "realFirst");
  assert.equal(perfect.earnedBonusStars, 1);

  const oneDown = {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-1-archer" ? { ...unit, hp: 0 } : unit),
  };
  const coveredByBonus = evaluateCampaignMission(MONK_MISSION_ID, oneDown, {
    monkFakeKilledBeforeReal: false,
    monkBlindAttempted: false,
  });
  assert.equal(coveredByBonus.objectives.find((objective) => objective.id === "survive").earned, false);
  assert.equal(coveredByBonus.stars, 3, "the real-first bonus can cover one missed base objective");

  const fakeFirstBlind = evaluateCampaignMission(MONK_MISSION_ID, won, {
    monkFakeKilledBeforeReal: true,
    monkBlindAttempted: true,
  });
  assert.equal(fakeFirstBlind.objectives.find((objective) => objective.id === "noBlind").earned, false);
  assert.equal(fakeFirstBlind.bonusObjectives[0].earned, false);
  assert.equal(fakeFirstBlind.stars, 2);
});

test("completing Temple Trial unlocks Monk and records its stars", () => {
  const storage = storageAdapter();
  const base = monkMatchState();
  const real = base.units.find((unit) => unit.trialRealMonk);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: unit.id === real.id ? 0 : unit.hp } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, MONK_MISSION_ID, won, {
    monkFakeKilledBeforeReal: false,
    monkBlindAttempted: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["monk"]);
  assert.equal(isUnitUnlocked("monk", storage), true);
  assert.equal(readCampaignProgressStars(storage, MONK_MISSION_ID), 3);
});

// --- Mission 8: Gargoyle's Inferno -------------------------------------------

test("Gargoyle's Inferno replaces the eighth Ashfall Flats placeholder once enough stars are banked", () => {
  const storage = storageAdapter();
  const perfect = (missionId, state, meta) => completeCampaignMission(storage, missionId, {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  }, meta);

  perfect(CLOD_MISSION_ID, prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  ), { clodChargeHitCount: 1 });
  perfect(NECROMANCER_MISSION_ID, necromancerMatchState(), { cleanseUsed: true, spreadHitCount: 0 });
  perfect(WITCH_DOCTOR_MISSION_ID, witchDoctorMatchState(), {
    ghoulsDefeatedCount: 1,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
  });
  perfect(FATHER_TIME_MISSION_ID, fatherTimeMatchState(), {
    archerDefeatedBeforeFatherTime: true,
    rewindUsed: false,
    archerBlinded: true,
  });
  perfect(VIRUS_MISSION_ID, virusMatchState(), { spreadHitCount: 0 });
  perfect(PALADIN_MISSION_ID, paladinMatchState(), {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
  });
  perfect(MONK_MISSION_ID, monkMatchState(), {
    monkFakeKilledBeforeReal: false,
    monkBlindAttempted: false,
  });

  // Mechs on the Farm now sits between Monk and Gargoyle on the trail, so Gargoyle is
  // node index 8 (Mechs on the Farm is index 7).
  const node = getCampaignMap(storage).nodes[8];
  assert.equal(node.id, GARGOYLE_MISSION_ID);
  assert.equal(node.title, "Gargoyle's Inferno");
  assert.equal(node.locationName, "Ashfall Flats");
  assert.equal(node.status, "available");
  assert.equal(node.displayType, "gargoyle");
  assert.equal(node.biome, "volcanic");
});

test("Gargoyle's Inferno builds a full-HP 9x9 chosen-unit duel with random inferno fires armed", () => {
  const config = createCampaignMatchConfig(GARGOYLE_MISSION_ID, ["mystic"]);
  const match = gargoyleMatchState(["mystic"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["mystic"]);
  assert.deepEqual(config.squads[2], ["gargoyle"]);
  assert.equal(config.teamNames[2], "Ashfall Guardian");
  assert.equal(match.currentPlayer, 1);

  assert.deepEqual(findUnit(match, "p1-0-mystic").position, { x: 0, y: 8 });
  assert.deepEqual(findUnit(match, "p2-0-gargoyle").position, { x: 8, y: 0 });
  assert.equal(findUnit(match, "p1-0-mystic").hp, 23);
  assert.equal(findUnit(match, "p2-0-gargoyle").hp, 30);
  assert.deepEqual(match.weather, { id: "heatwave", sourceId: null });
  assert.equal(getActiveWeather(match).id, "heatwave");
  assert.deepEqual(match.missionRules?.randomFire, {
    sourceId: "p2-0-gargoyle",
    turnsLeft: 3,
  });
});

test("Gargoyle's Inferno map cutscene is first-view only and uses party ruin banter", () => {
  const storage = storageAdapter();

  assert.equal(shouldShowCampaignMapCutscene(storage, GARGOYLE_MISSION_ID), true);
  const script = campaignMapCutsceneScript(GARGOYLE_MISSION_ID);
  assert.equal(script.length >= 3, true);
  assert.match(script.map((line) => line.text).join(" "), /ruins|entrance|climb|look/i);
  assert.ok(script.some((line) => line.speaker === "swordsman"));

  markCampaignMapCutsceneSeen(storage, GARGOYLE_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, GARGOYLE_MISSION_ID), false);

  resetCampaignProgress(storage);
  assert.equal(shouldShowCampaignMapCutscene(storage, GARGOYLE_MISSION_ID), true);
});

test("Gargoyle's Inferno dialogue covers the ruin trap banter and RAGE eruption warning", () => {
  const state = gargoyleMatchState(["swordsman"]);
  const direct = gargoyleMissionOpeningScript(state);

  assert.deepEqual(campaignOpeningScript(GARGOYLE_MISSION_ID, state), direct);
  assert.equal(direct.length >= 3, true);
  assert.equal(direct[0].speakerId, "p2-0-gargoyle");
  assert.match(direct.map((line) => line.text).join(" "), /ruins|flame|crisp|trapped/i);

  const withHp = (hp) => ({
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-gargoyle" ? { ...unit, hp } : unit),
  });
  assert.equal(shouldShowGargoyleRageWarning(withHp(6)), false);
  assert.equal(shouldShowGargoyleRageWarning(withHp(5)), true);
  assert.equal(shouldShowGargoyleRageWarning(withHp(5), { warningShown: true }), false);
  assert.match(gargoyleRageWarningScript(withHp(5)).map((line) => line.text).join(" "), /ARR+G|RAGE|Pyroclasm|erupts/i);
});

test("Gargoyle's Inferno lights one random open space on fire at each turn rollover", () => {
  let state = gargoyleMatchState(["swordsman"]);
  state = {
    ...state,
    rngState: 123,
  };

  state = applyCommand(state, beginActivation(1, "p1-0-swordsman")).nextState;
  state = applyCommand(state, defend(1, "p1-0-swordsman")).nextState;
  const finished = applyCommand(state, finishActivation(1, "p1-0-swordsman"));
  const event = finished.events.find((e) => e.type === "RANDOM_FIRE_LIT");
  const fireEntries = Object.entries(finished.nextState.tileObjects ?? {})
    .filter(([, obj]) => obj.kind === "fire");

  assert.ok(event, "turn rollover should surface the lit fire tile");
  assert.deepEqual(event.sourceId, "p2-0-gargoyle");
  assert.equal(fireEntries.length, 1);
  assert.deepEqual(fireEntries[0][1], { kind: "fire", turnsLeft: 3 });
  assert.deepEqual(fireEntries[0][0], `${event.position.x},${event.position.y}`);
  assert.notDeepEqual(event.position, findUnit(finished.nextState, "p1-0-swordsman").position);
  assert.notDeepEqual(event.position, findUnit(finished.nextState, "p2-0-gargoyle").position);
});

test("Gargoyle's Inferno grading rewards victory, avoiding Pyroclasm and fire, with a pre-RAGE kill bonus", () => {
  const base = gargoyleMatchState(["swordsman"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(GARGOYLE_MISSION_ID, won, {
    gargoylePyroclasmDamageTakenCount: 0,
    fireDamageTakenCount: 0,
    gargoyleEnteredRage: false,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noPyroclasm", "noFire"]);
  assert.equal(perfect.bonusObjectives[0].id, "preRageKill");
  assert.equal(perfect.earnedBonusStars, 1);

  const burned = evaluateCampaignMission(GARGOYLE_MISSION_ID, won, {
    gargoylePyroclasmDamageTakenCount: 0,
    fireDamageTakenCount: 1,
    gargoyleEnteredRage: false,
  });
  assert.equal(burned.objectives.find((objective) => objective.id === "noFire").earned, false);
  assert.equal(burned.stars, 3, "the pre-RAGE bonus can cover one missed base objective");

  const scorchedRage = evaluateCampaignMission(GARGOYLE_MISSION_ID, won, {
    gargoylePyroclasmDamageTakenCount: 1,
    fireDamageTakenCount: 1,
    gargoyleEnteredRage: true,
  });
  assert.equal(scorchedRage.objectives.find((objective) => objective.id === "noPyroclasm").earned, false);
  assert.equal(scorchedRage.bonusObjectives[0].earned, false);
  assert.equal(scorchedRage.stars, 1);
});

test("completing Gargoyle's Inferno unlocks Gargoyle and records its stars", () => {
  const storage = storageAdapter();
  const base = gargoyleMatchState(["swordsman"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, GARGOYLE_MISSION_ID, won, {
    gargoylePyroclasmDamageTakenCount: 0,
    fireDamageTakenCount: 0,
    gargoyleEnteredRage: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["gargoyle"]);
  assert.equal(isUnitUnlocked("gargoyle", storage), true);
  assert.equal(readCampaignProgressStars(storage, GARGOYLE_MISSION_ID), 3);
});

function sniperMatchState(squad = ["archer", "swordsman"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(SNIPER_MISSION_ID, squad)),
    SNIPER_MISSION_ID,
  );
}

test("The High Ground of the Sniper reveals on the plateau once 16 stars are banked", () => {
  const storage = storageAdapter();

  // At zero stars the plateau stop is charted but locked, with its portrait hidden.
  const lockedNode = getCampaignMap(storage).nodes.find((node) => node.id === SNIPER_MISSION_ID);
  assert.ok(lockedNode, "the plateau stop is on the campaign trail");
  assert.equal(lockedNode.status, "locked");
  assert.equal(lockedNode.locationName, "The High Cliffs");
  assert.equal(lockedNode.displayType, null);
  assert.equal(lockedNode.requiredStars, 16);

  // Bank enough stars across earlier missions to clear the 16-star gate.
  writeCampaignProgress(storage, {
    completedMissions: [
      CLOD_MISSION_ID, NECROMANCER_MISSION_ID, WITCH_DOCTOR_MISSION_ID,
      FATHER_TIME_MISSION_ID, VIRUS_MISSION_ID, PALADIN_MISSION_ID,
    ],
    missionStars: {
      [CLOD_MISSION_ID]: 3, [NECROMANCER_MISSION_ID]: 3, [WITCH_DOCTOR_MISSION_ID]: 3,
      [FATHER_TIME_MISSION_ID]: 3, [VIRUS_MISSION_ID]: 3, [PALADIN_MISSION_ID]: 3,
    },
  });

  const node = getCampaignMap(storage).nodes.find((node) => node.id === SNIPER_MISSION_ID);
  assert.equal(node.status, "available");
  assert.equal(node.title, "The High Ground of the Sniper");
  assert.equal(node.displayType, "sniper");
  assert.equal(node.biome, "plateau");
});

test("The High Ground builds a full-HP 13x13 2v2 with the Archer locked in slot one", () => {
  const config = createCampaignMatchConfig(SNIPER_MISSION_ID, ["archer", "magician"]);
  const match = sniperMatchState(["archer", "magician"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 13);
  assert.deepEqual(config.squads[1], ["archer", "magician"]);
  assert.deepEqual(config.squads[2], ["sniper", "clod"]);
  assert.equal(config.teamNames[2], "The High Guard");
  assert.equal(match.currentPlayer, 1);

  // Standard opposing-corner formation; the Archer is pinned to slot one (p1-0).
  assert.deepEqual(findUnit(match, "p1-0-archer").position, { x: 1, y: 12 });
  assert.deepEqual(findUnit(match, "p1-1-magician").position, { x: 0, y: 11 });
  assert.deepEqual(findUnit(match, "p2-0-sniper").position, { x: 11, y: 0 });
  assert.deepEqual(findUnit(match, "p2-1-clod").position, { x: 12, y: 1 });

  // Full HP (this is a standard duel, not a half-HP lesson).
  assert.equal(findUnit(match, "p1-0-archer").hp, 24);
  assert.equal(findUnit(match, "p2-0-sniper").hp, 23);
  assert.equal(findUnit(match, "p2-1-clod").hp, 30);
});

test("The High Ground lays dense cover pockets and permanent cliff-fire bands", () => {
  const match = sniperMatchState();
  const objects = match.tileObjects ?? {};

  const walls = Object.entries(objects).filter(([, obj]) => obj.kind === "wall");
  const fires = Object.entries(objects).filter(([, obj]) => obj.kind === "fire");
  assert.equal(walls.length, 9, "nine cover walls on the plateau");
  assert.equal(fires.length, 12, "twelve cliff-fire tiles");

  // Walls are 1-HP (one Archer shot each); fire is permanent terrain, not a countdown.
  for (const key of ["3,10", "4,9", "3,8", "9,3", "10,3", "9,4", "5,6", "6,6", "7,6"]) {
    assert.deepEqual(objects[key], { kind: "wall", hp: 1 }, `${key} is a destructible wall`);
  }
  for (const key of ["2,7", "3,7", "4,7", "8,5", "9,5", "10,5", "5,10", "6,10", "7,10", "5,2", "6,2", "7,2"]) {
    assert.deepEqual(objects[key], { kind: "fire", permanent: true }, `${key} is permanent cliff-fire`);
  }

  // Hazards spread across every quadrant, with readable clusters instead of one-off scatter.
  const wallXs = walls.map(([key]) => Number(key.split(",")[0]));
  const wallYs = walls.map(([key]) => Number(key.split(",")[1]));
  assert.ok(Math.max(...wallXs) - Math.min(...wallXs) > 6, "walls spread across the width");
  assert.ok(Math.max(...wallYs) - Math.min(...wallYs) > 6, "walls spread across the height");

  // Neither hazard sits on a spawn tile.
  for (const spawn of ["1,12", "0,11", "11,0", "12,1"]) {
    assert.equal(objects[spawn], undefined, `${spawn} is a clear spawn`);
  }
});

test("applyLockedSlots forces the Archer into slot one regardless of the sent squad", () => {
  const mission = getCampaignMission(SNIPER_MISSION_ID);

  // A well-formed pick is untouched.
  assert.deepEqual(applyLockedSlots(["archer", "magician"], mission), ["archer", "magician"]);
  // The pin overrides slot one and pulls a stray Archer out of slot two to avoid a dupe.
  assert.deepEqual(applyLockedSlots(["magician", "archer"], mission), ["archer", null]);
  // Missions with no lockedSlots pass through unchanged.
  assert.deepEqual(applyLockedSlots(["mystic", "magician"], getCampaignMission(CLOD_MISSION_ID)), ["mystic", "magician"]);

  // Even a bad config call still deploys the Archer in slot one and a valid ally.
  const config = createCampaignMatchConfig(SNIPER_MISSION_ID, ["magician", "mystic"]);
  assert.equal(config.squads[1][0], "archer");
  assert.equal(config.squads[1].length, 2);
  assert.ok(!config.squads[1].slice(1).includes("archer"));
});

test("The High Ground opening banter and permanent-fire warning read for the duel", () => {
  const state = sniperMatchState();
  const opening = sniperMissionOpeningScript(state);

  assert.deepEqual(campaignOpeningScript(SNIPER_MISSION_ID, state), opening);
  assert.equal(opening.length >= 3, true);
  assert.equal(opening[0].speakerId, "p2-0-sniper");
  assert.equal(opening[1].speakerId, "p2-1-clod");
  assert.equal(opening[2].speakerId, "p1-0-archer");
  assert.match(opening.map((line) => line.text).join(" "), /plateau|high|cover|flame|scope/i);

  const playing = { ...state, phase: "playing" };
  assert.equal(shouldShowSniperFireWarning(playing, { fireDamageTakenCount: 0 }), false);
  assert.equal(shouldShowSniperFireWarning(playing, { fireDamageTakenCount: 1 }), true);
  assert.equal(shouldShowSniperFireWarning(playing, { fireDamageTakenCount: 1, warningShown: true }), false);
  assert.match(sniperFireWarningScript(playing).map((line) => line.text).join(" "), /burn out|cliffs|route/i);
});

test("The High Ground grading rewards victory, a wall break, avoiding fire, and blinding the Sniper", () => {
  const base = sniperMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(SNIPER_MISSION_ID, won, {
    wallDestroyedCount: 1,
    fireDamageTakenCount: 0,
    sniperBlinded: true,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "wallBreak", "noFire"]);
  assert.equal(perfect.bonusObjectives[0].id, "blindSniper");
  assert.equal(perfect.earnedBonusStars, 1);

  const noWall = evaluateCampaignMission(SNIPER_MISSION_ID, won, {
    wallDestroyedCount: 0,
    fireDamageTakenCount: 0,
    sniperBlinded: true,
  });
  assert.equal(noWall.objectives.find((objective) => objective.id === "wallBreak").earned, false);
  assert.equal(noWall.stars, 3, "the blind bonus can cover one missed base objective");

  const messy = evaluateCampaignMission(SNIPER_MISSION_ID, won, {
    wallDestroyedCount: 0,
    fireDamageTakenCount: 2,
    sniperBlinded: false,
  });
  assert.equal(messy.objectives.find((objective) => objective.id === "noFire").earned, false);
  assert.equal(messy.bonusObjectives[0].earned, false);
  assert.equal(messy.stars, 1);

  // A loss earns nothing, even with every side objective hit.
  const lost = evaluateCampaignMission(SNIPER_MISSION_ID, { ...base, phase: "complete", winner: 2 }, {
    wallDestroyedCount: 1,
    fireDamageTakenCount: 0,
    sniperBlinded: true,
  });
  assert.equal(lost.victory, false);
  assert.equal(lost.stars, 0);
});

test("completing The High Ground unlocks the Sniper and records its stars", () => {
  const storage = storageAdapter();
  const base = sniperMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, SNIPER_MISSION_ID, won, {
    wallDestroyedCount: 1,
    fireDamageTakenCount: 0,
    sniperBlinded: true,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["sniper"]);
  assert.equal(isUnitUnlocked("sniper", storage), true);
  assert.equal(readCampaignProgressStars(storage, SNIPER_MISSION_ID), 3);
});

function readCampaignProgressStars(storage, missionId) {
  return getCampaignMap(storage).nodes.find((node) => node.id === missionId)?.stars ?? 0;
}

// --- Mission 10: The Wandering Party ------------------------------------------

function wanderingMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(WANDERING_PARTY_MISSION_ID, squad)),
    WANDERING_PARTY_MISSION_ID,
  );
}

test("The Wandering Party builds a full-HP 13x13 4v4 with the enemy party in wandering skins", () => {
  const config = createCampaignMatchConfig(WANDERING_PARTY_MISSION_ID, ["paladin", "necromancer", "clod", "gargoyle"]);
  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 13);
  // The player brings whatever squad they picked; the enemy is always the four wanderers.
  assert.deepEqual(config.squads[1], ["paladin", "necromancer", "clod", "gargoyle"]);
  assert.deepEqual(config.squads[2], ["swordsman", "archer", "mystic", "magician"]);
  assert.equal(config.teamNames[2], "The Wanderers");

  const match = wanderingMatchState();
  // Every enemy party member wears the wandering skin (regardless of account unlocks);
  // the player's own units carry no forced skin.
  for (const unit of match.units.filter((u) => u.player === 2)) {
    assert.equal(unit.skin, "wandering", `${unit.type} wears the wandering skin`);
  }
  for (const unit of match.units.filter((u) => u.player === 1)) {
    assert.equal(unit.skin ?? null, null);
  }
  // Full-HP friendly duel.
  assert.equal(findUnit(match, "p2-0-swordsman").hp, getUnitType("swordsman").stats.maxHp);
});

test("The Wandering Party replaces the Cinderwood placeholder with an authored skin-reward mission", () => {
  const mission = getCampaignMission(WANDERING_PARTY_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.locationName, "Cinderwood");
  assert.equal(mission.requiredStars, 18);
  assert.deepEqual(mission.rewardUnits, []);
  assert.equal(mission.rewardSkinPack, WANDERING_PARTY_SKIN_PACK);
  // The node is still present on the map.
  const map = getCampaignMap(storageAdapter());
  assert.equal(map.nodes.length, MAX_CAMPAIGN_MISSIONS);
  assert.ok(map.nodes.some((node) => node.id === WANDERING_PARTY_MISSION_ID));
});

test("The Wandering Party is a flat three stars for a win, nothing for a loss", () => {
  const base = wanderingMatchState();
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
  const win = evaluateCampaignMission(WANDERING_PARTY_MISSION_ID, won, {});
  assert.equal(win.victory, true);
  assert.equal(win.stars, 3);
  assert.equal(win.bonusObjectives.length, 0);

  const lost = { ...won, winner: 2, units: base.units.map((unit) => unit.player === 1 ? { ...unit, hp: 0 } : unit) };
  const loss = evaluateCampaignMission(WANDERING_PARTY_MISSION_ID, lost, {});
  assert.equal(loss.victory, false);
  assert.equal(loss.stars, 0);
});

test("The Wandering Party runs a wandering-skinned overworld cutscene, flag-gated once", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, WANDERING_PARTY_MISSION_ID), true);
  const script = campaignMapCutsceneScript(WANDERING_PARTY_MISSION_ID);
  assert.equal(script.length >= 4, true);
  // The wanderers' lines wear the wandering skin; the player's lines do not.
  assert.ok(script.some((line) => line.skin === "wandering"));
  assert.ok(script.some((line) => line.speaker === "swordsman" && line.skin !== "wandering"));
  assert.match(script.map((line) => line.text).join(" "), /wander|costume|friendly|bout/i);

  markCampaignMapCutsceneSeen(storage, WANDERING_PARTY_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, WANDERING_PARTY_MISSION_ID), false);
  // The post-match cutscene tracks a SEPARATE flag, so it's still pending after the map one.
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, WANDERING_PARTY_MISSION_ID), true);
});

test("The Wandering Party post-match cutscene is wandering-skinned and gated by its own flag", () => {
  const storage = storageAdapter();
  const script = campaignPostMatchCutsceneScript(WANDERING_PARTY_MISSION_ID);
  assert.equal(script.length >= 3, true);
  assert.ok(script.some((line) => line.skin === "wandering"));
  assert.match(script.map((line) => line.text).join(" "), /costume|wander|travel|skill/i);

  assert.equal(shouldShowCampaignPostMatchCutscene(storage, WANDERING_PARTY_MISSION_ID), true);
  markCampaignPostMatchCutsceneSeen(storage, WANDERING_PARTY_MISSION_ID);
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, WANDERING_PARTY_MISSION_ID), false);
  // Marking the post-match flag doesn't burn the overworld one.
  assert.equal(shouldShowCampaignMapCutscene(storage, WANDERING_PARTY_MISSION_ID), true);
  // Other missions have no post-match cutscene.
  assert.deepEqual(campaignPostMatchCutsceneScript(SNIPER_MISSION_ID), []);
});

// --- Mission 11: Dug Your Own Grave ------------------------------------------

function minerMatchState(squad = ["sniper"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(MINER_MISSION_ID, squad)),
    MINER_MISSION_ID,
  );
}

test("Dug Your Own Grave replaces Whisperwood Eaves with a full-HP 9x9 Miner duel", () => {
  const mission = getCampaignMission(MINER_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.locationName, "Whisperwood Eaves");
  assert.equal(mission.requiredStars, 20);
  assert.deepEqual(mission.rewardUnits, ["miner"]);

  const config = createCampaignMatchConfig(MINER_MISSION_ID, ["sniper"]);
  const match = minerMatchState(["sniper"]);

  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["sniper"]);
  assert.deepEqual(config.squads[2], ["miner"]);
  assert.equal(config.teamNames[2], "Buried Claim");
  assert.deepEqual(findUnit(match, "p1-0-sniper").position, { x: 0, y: 8 });
  assert.deepEqual(findUnit(match, "p2-0-miner").position, { x: 8, y: 0 });
  assert.equal(findUnit(match, "p1-0-sniper").hp, getUnitType("sniper").stats.maxHp);
  assert.equal(findUnit(match, "p2-0-miner").hp, getUnitType("miner").stats.maxHp);
});

test("Dug Your Own Grave covers every non-spawn walkable tile with a 1-HP wall", () => {
  const match = minerMatchState(["swordsman"]);
  const walls = Object.entries(match.tileObjects ?? {}).filter(([, obj]) => obj.kind === "wall");

  assert.equal(walls.length, 79, "9x9 board minus the two duelists' spawn tiles");
  assert.equal(match.tileObjects["0,8"], undefined);
  assert.equal(match.tileObjects["8,0"], undefined);
  for (const [key, obj] of walls) {
    assert.deepEqual(obj, { kind: "wall", hp: 1 }, `${key} is a diggable wall`);
  }
});

test("Dug Your Own Grave map cutscene waits to pick a volunteer until the party asks for one", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, MINER_MISSION_ID), true);
  markCampaignMapCutsceneSeen(storage, MINER_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, MINER_MISSION_ID), true);

  const preChoice = campaignMapCutsceneScript(MINER_MISSION_ID, null, { phase: "preChoice" });
  assert.equal(preChoice.some((line) => line.type === "sniper"), false);
  assert.match(preChoice.map((line) => line.text).join(" "), /someone should check|one person/i);

  const postChoice = campaignMapCutsceneScript(MINER_MISSION_ID, ["sniper"], { phase: "postChoice" });
  assert.equal(postChoice.some((line) => line.type === "sniper"), true);
  assert.match(postChoice.map((line) => line.text).join(" "), /sealed|too thick|cannot hear/i);
  assert.equal(
    postChoice.findIndex((line) => line.type === "sniper") < postChoice.findIndex((line) => /sealed/i.test(line.text)),
    true,
  );

  const mapScript = campaignMapCutsceneScript(MINER_MISSION_ID, ["sniper"]);
  assert.equal(mapScript.length >= 5, true);
  assert.ok(mapScript.some((line) => line.type === "sniper"));
  assert.match(mapScript.map((line) => line.text).join(" "), /hole|sealed|stuck|check/i);
  assert.doesNotMatch(
    mapScript.slice(mapScript.findIndex((line) => /sealed/i.test(line.text)) + 1).map((line) => line.text).join(" "),
    /I am still standing|nobody panic/i,
  );
  assert.doesNotMatch(mapScript.map((line) => line.text).join(" "), /shoot past walls|bonus star|Sniper is/i);
});

test("Dug Your Own Grave battle dialogue covers opening, splash, rage, and defeat", () => {
  const state = minerMatchState(["sniper"]);
  const opening = minerMissionOpeningScript(state);

  assert.deepEqual(campaignOpeningScript(MINER_MISSION_ID, state), opening);
  assert.equal(opening[0].speakerId, "p2-0-miner");
  assert.equal(opening[1].speakerId, "p1-0-sniper");
  assert.match(opening.map((line) => line.text).join(" "), /stuck|trust|help/i);

  const playing = { ...state, phase: "playing" };
  assert.equal(shouldShowMinerBlastingCapSplashWarning(playing, { minerBlastingCapSplashTakenCount: 0 }), false);
  assert.equal(shouldShowMinerBlastingCapSplashWarning(playing, { minerBlastingCapSplashTakenCount: 1 }), true);
  assert.equal(shouldShowMinerBlastingCapSplashWarning(playing, { minerBlastingCapSplashTakenCount: 1, warningShown: true }), false);
  assert.match(minerBlastingCapSplashWarningScript(playing).map((line) => line.text).join(" "), /blast|cap|echo/i);

  const raging = {
    ...playing,
    units: playing.units.map((unit) => unit.id === "p2-0-miner" ? { ...unit, hp: 5 } : unit),
  };
  assert.equal(shouldShowMinerRageWarning(raging, { warningShown: false, minerRageHarvested: true }), true);
  assert.equal(shouldShowMinerRageWarning(raging, { warningShown: false, minerRageHarvested: false }), true);
  assert.match(minerRageWarningScript(raging).map((line) => line.text).join(" "), /diamond|ore|mine/i);
  assert.match(minerDefeatScript({ ...playing, winner: 1 }).map((line) => line.text).join(" "), /air|out|help/i);
});

test("Dug Your Own Grave grading rewards victory, no splash, pre-rage kill, and Sniper bonus", () => {
  const base = minerMatchState(["sniper"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const perfect = evaluateCampaignMission(MINER_MISSION_ID, won, {
    minerBlastingCapSplashTakenCount: 0,
    minerEnteredRage: false,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noBlastingCapSplash", "preRageKill"]);
  assert.equal(perfect.bonusObjectives[0].id, "sniperDuelist");
  assert.equal(perfect.earnedBonusStars, 1);

  const messy = evaluateCampaignMission(MINER_MISSION_ID, won, {
    minerBlastingCapSplashTakenCount: 1,
    minerEnteredRage: true,
  });
  assert.equal(messy.stars, 2, "the Sniper bonus can cover one missed base objective");
  assert.equal(messy.objectives.find((objective) => objective.id === "noBlastingCapSplash").earned, false);
  assert.equal(messy.objectives.find((objective) => objective.id === "preRageKill").earned, false);

  const noBonus = evaluateCampaignMission(MINER_MISSION_ID, minerMatchState(["swordsman"]), {
    minerBlastingCapSplashTakenCount: 0,
    minerEnteredRage: false,
  });
  assert.equal(noBonus.earnedBonusStars, 0);
});

test("completing Dug Your Own Grave unlocks the Miner and records its stars", () => {
  const storage = storageAdapter();
  const base = minerMatchState(["sniper"]);
  const won = {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };

  const completed = completeCampaignMission(storage, MINER_MISSION_ID, won, {
    minerBlastingCapSplashTakenCount: 0,
    minerEnteredRage: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["miner"]);
  assert.equal(isUnitUnlocked("miner", storage), true);
  assert.equal(readCampaignProgressStars(storage, MINER_MISSION_ID), 3);
});

// --- Mission 12: Has-Been Heroes ---------------------------------------------

const STARTER_FOUR = ["swordsman", "archer", "mystic", "magician"];

function hasbeenMatchState(squad = STARTER_FOUR) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(HASBEEN_HEROES_MISSION_ID, squad)),
    HASBEEN_HEROES_MISSION_ID,
  );
}

function hasbeenWonState(base, { survive = true } = {}) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => {
      if (unit.player === 2) return { ...unit, hp: 0 };
      // survive=false drops the first player unit so the survive objective fails.
      if (!survive && unit.id === base.units.find((u) => u.player === 1)?.id) return { ...unit, hp: 0 };
      return { ...unit, hp: Math.max(1, unit.hp) };
    }),
  };
}

test("Has-Been Heroes replaces the Elderroot placeholder with a town skin-reward mission", () => {
  const mission = getCampaignMission(HASBEEN_HEROES_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.locationName, "Highmarket");
  assert.equal(mission.region, "town");
  assert.equal(mission.requiredStars, 22);
  assert.deepEqual(mission.rewardUnits, []);
  assert.equal(mission.rewardSkinPack, HASBEEN_MYSTIC_SKIN_PACK);
  assert.deepEqual(mission.enemySquad, HASBEEN_HEROES_FAT_TYPES);

  // The node reports the new town biome once revealed.
  const map = getCampaignMap(storageAdapter());
  assert.equal(map.nodes.length, MAX_CAMPAIGN_MISSIONS);
  const node = map.nodes.find((n) => n.id === HASBEEN_HEROES_MISSION_ID);
  assert.ok(node);
  assert.equal(node.biome, "town");
  assert.ok(map.regions.some((region) => region.biome === "town"));
  // The old Elderroot placeholder id is gone.
  assert.equal(map.nodes.some((n) => n.id === "uncharted-13"), false);
});

test("Has-Been Heroes builds a 13x13 4v4 with the worn-out fat squad at 20 HP in the far corner", () => {
  const config = createCampaignMatchConfig(HASBEEN_HEROES_MISSION_ID, ["paladin", "necromancer", "clod", "gargoyle"]);
  assert.equal(config.mode, "campaign");
  assert.equal(config.size, 13);
  assert.deepEqual(config.squads[1], ["paladin", "necromancer", "clod", "gargoyle"]);
  assert.deepEqual(config.squads[2], HASBEEN_HEROES_FAT_TYPES);
  assert.equal(config.teamNames[2], "The Has-Beens");

  const match = hasbeenMatchState();
  // No board hazards, no forced skins on either side; the player squad is full HP but
  // the worn-out fat squad starts at 20 HP apiece.
  const walls = Object.values(match.tileObjects ?? {}).filter((obj) => obj.kind === "wall");
  const fires = Object.values(match.tileObjects ?? {}).filter((obj) => obj.kind === "fire");
  assert.equal(walls.length, 0);
  assert.equal(fires.length, 0);
  for (const unit of match.units) {
    assert.equal(unit.skin ?? null, null, `${unit.type} carries no forced skin`);
    if (unit.player === 2) {
      assert.equal(unit.hp, 20, `${unit.type} starts worn down to 20 HP`);
    } else {
      assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.type} starts at full HP`);
    }
  }
  assert.ok(findUnit(match, "p2-0-fat-knight"));
  assert.ok(findUnit(match, "p2-3-fat-wizard"));
});

test("Has-Been Heroes grading: win, no Fart displacement, survival, and the starter-four bonus", () => {
  const base = hasbeenMatchState(STARTER_FOUR);
  const won = hasbeenWonState(base);

  const perfect = evaluateCampaignMission(HASBEEN_HEROES_MISSION_ID, won, { fartDisplacementDamageTakenCount: 0 });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((o) => o.id), ["complete", "noFartShove", "survive"]);
  assert.equal(perfect.bonusObjectives[0].id, "starterSquad");
  assert.equal(perfect.broughtStarterSquad, true);
  assert.equal(perfect.earnedBonusStars, 1);

  // The starter bonus can cover ONE missed base objective (here: took Fart displacement).
  const cover = evaluateCampaignMission(HASBEEN_HEROES_MISSION_ID, won, { fartDisplacementDamageTakenCount: 2 });
  assert.equal(cover.objectives.find((o) => o.id === "noFartShove").earned, false);
  assert.equal(cover.stars, 3);

  // A messy non-starter win: took Fart damage AND lost a unit AND no starter bonus.
  const messyBase = hasbeenMatchState(["paladin", "necromancer", "clod", "gargoyle"]);
  const messy = evaluateCampaignMission(
    HASBEEN_HEROES_MISSION_ID,
    hasbeenWonState(messyBase, { survive: false }),
    { fartDisplacementDamageTakenCount: 1 },
  );
  assert.equal(messy.broughtStarterSquad, false);
  assert.equal(messy.earnedBonusStars, 0);
  assert.equal(messy.stars, 1, "only the win itself is earned");

  const lost = { ...won, winner: 2 };
  assert.equal(evaluateCampaignMission(HASBEEN_HEROES_MISSION_ID, lost, {}).stars, 0);
});

test("Has-Been Heroes battle dialogue covers opening banter, per-member rage, and defeat", () => {
  const state = hasbeenMatchState();
  const opening = hasbeenHeroesMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(HASBEEN_HEROES_MISSION_ID, state), opening);
  // Every fat member chimes in at least once, plus the player's Fart warning.
  for (const type of HASBEEN_HEROES_FAT_TYPES) {
    const unit = state.units.find((u) => u.player === 2 && u.type === type);
    assert.ok(opening.some((line) => line.speakerId === unit.id), `${type} speaks in the opening`);
  }
  assert.match(opening.map((line) => line.text).join(" "), /fart|shove|wall/i);

  // Each fat member gets its own one-time RAGE popup, gated per member.
  const playing = { ...state, phase: "playing" };
  for (const type of HASBEEN_HEROES_FAT_TYPES) {
    const raging = {
      ...playing,
      units: playing.units.map((unit) => (unit.player === 2 && unit.type === type ? { ...unit, hp: 5 } : unit)),
    };
    assert.equal(shouldShowHasbeenFatRageWarning(raging, type, { warned: false }), true);
    assert.equal(shouldShowHasbeenFatRageWarning(raging, type, { warned: true }), false);
    // A healthy member never triggers its rage line.
    assert.equal(shouldShowHasbeenFatRageWarning(playing, type, { warned: false }), false);
    const script = hasbeenFatRageWarningScript(raging, type);
    assert.equal(script.length, 1);
    assert.equal(script[0].speakerId, raging.units.find((u) => u.player === 2 && u.type === type).id);
  }

  const defeat = hasbeenHeroesDefeatScript({ ...playing, winner: 1 });
  assert.ok(defeat.length >= 4);
  assert.match(defeat.map((line) => line.text).join(" "), /last of us|hungry|nap|tavern/i);
});

test("Has-Been Heroes runs a one-time overworld cutscene where the fat squad blocks the road", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, HASBEEN_HEROES_MISSION_ID), true);
  const script = campaignMapCutsceneScript(HASBEEN_HEROES_MISSION_ID);
  assert.ok(script.length >= 8);
  // The fat squad speaks on the right (player 2); the player's party answers on the left.
  assert.ok(script.some((line) => line.speaker === "fat-knight" && line.side === "right"));
  assert.ok(script.some((line) => line.speaker === "swordsman" && line.side === "left"));
  const text = script.map((line) => line.text).join(" ");
  assert.match(text, /castle|rumor|sorcerer|void|beef|king|banished|framed|break/i);
  assert.doesNotMatch(text, /void gate|cloaked figure|not even from/i);

  markCampaignMapCutsceneSeen(storage, HASBEEN_HEROES_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, HASBEEN_HEROES_MISSION_ID), false);
  // The post-match cutscene tracks a separate flag, so it stays pending.
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, HASBEEN_HEROES_MISSION_ID), true);
});

test("Has-Been Heroes post-match shopping cutscene + Mystic payoff line are wired and gated", () => {
  const storage = storageAdapter();
  const postMatch = campaignPostMatchCutsceneScript(HASBEEN_HEROES_MISSION_ID);
  assert.ok(postMatch.length >= 2);
  assert.match(postMatch.map((line) => line.text).join(" "), /shop|Highmarket/i);

  const picked = campaignRewardPickedScript(HASBEEN_HEROES_MISSION_ID);
  assert.ok(picked.length >= 1);
  assert.match(picked.map((line) => line.text).join(" "), /love it|shopping/i);
  // Other missions have no reward-picked beat.
  assert.deepEqual(campaignRewardPickedScript(MINER_MISSION_ID), []);

  assert.equal(shouldShowCampaignPostMatchCutscene(storage, HASBEEN_HEROES_MISSION_ID), true);
  markCampaignPostMatchCutsceneSeen(storage, HASBEEN_HEROES_MISSION_ID);
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, HASBEEN_HEROES_MISSION_ID), false);
});

// --- Battle for the Bridge (mission 13) --------------------------------------

function roninMatchState(squad = ["swordsman"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(RONIN_MISSION_ID, squad)),
    RONIN_MISSION_ID,
  );
}

function roninWonState(base = roninMatchState(), { playerHp = 1 } = {}) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: playerHp }),
  };
}

test("Battle for the Bridge replaces Thornhollow with a full-HP 9x9 Ronin duel", () => {
  const mission = getCampaignMission(RONIN_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.locationName, "Thornhollow Bridge");
  assert.equal(mission.region, "wood");
  assert.equal(mission.requiredStars, 24);
  assert.equal(mission.playerSlots, 1);
  assert.deepEqual(mission.rewardUnits, ["ronin"]);

  const config = createCampaignMatchConfig(RONIN_MISSION_ID, ["archer"]);
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["archer"]);
  assert.deepEqual(config.squads[2], ["ronin"]);
  assert.equal(config.teamNames[2], "Island Protector");

  const match = roninMatchState(["archer"]);
  assert.deepEqual(findUnit(match, "p1-0-archer").position, { x: 0, y: 4 });
  assert.deepEqual(findUnit(match, "p2-0-ronin").position, { x: 8, y: 4 });
  assert.equal(findUnit(match, "p1-0-archer").hp, getUnitType("archer").stats.maxHp);
  assert.equal(findUnit(match, "p2-0-ronin").hp, getUnitType("ronin").stats.maxHp);
  assert.deepEqual(match.weather, { id: "blizzard", sourceId: null });

  const node = getCampaignMap(storageAdapter()).nodes.find((n) => n.id === RONIN_MISSION_ID);
  assert.ok(node);
  assert.equal(node.locationName, "Thornhollow Bridge");
  assert.equal(node.point.x < 57.9, true, "the Thornhollow node nudges left onto its painted map node");
});

test("Battle for the Bridge mission weather changes every two turn cycles", () => {
  let state = roninMatchState(["swordsman"]);
  assert.equal(getActiveWeather(state).id, "blizzard");

  // A turn cycle is one full round in which both players act; the ronin duel swaps
  // weather every two cycles, so a single cycle must NOT change it.
  const finishP1 = (s) => {
    s = applyCommand(applyCommand(s, beginActivation(1, "p1-0-swordsman")).nextState, defend(1, "p1-0-swordsman")).nextState;
    return applyCommand(s, finishActivation(1, "p1-0-swordsman"));
  };
  const finishP2 = (s) => {
    s = applyCommand(applyCommand(s, beginActivation(2, "p2-0-ronin")).nextState, defend(2, "p2-0-ronin")).nextState;
    return applyCommand(s, finishActivation(2, "p2-0-ronin"));
  };

  // Cycle 1 (turns 1-2) holds the opening weather.
  state = finishP1(state).nextState;
  assert.equal(state.turnNumber, 2);
  assert.equal(getActiveWeather(state).id, "blizzard");
  state = finishP2(state).nextState;
  assert.equal(state.turnNumber, 3);
  assert.equal(getActiveWeather(state).id, "blizzard", "one full cycle must not swap the weather yet");

  // Cycle 2 (turns 3-4): its opening turn still holds, and the rollover into cycle 3
  // is where two full cycles have elapsed and the weather finally advances.
  state = finishP1(state).nextState;
  assert.equal(state.turnNumber, 4);
  assert.equal(getActiveWeather(state).id, "blizzard");
  const intoCycle3 = finishP2(state);
  state = intoCycle3.nextState;
  assert.equal(state.turnNumber, 5);
  assert.equal(getActiveWeather(state).id, "heatwave");
  assert.ok(intoCycle3.events.some((event) => event.type === "MISSION_WEATHER_CHANGED" && event.weather === "heatwave"));

  // Cycles 3-4 hold heatwave; the rollover into cycle 5 advances to the next weather.
  state = finishP1(state).nextState; // turn 6
  state = finishP2(state).nextState; // turn 7
  assert.equal(getActiveWeather(state).id, "heatwave");
  state = finishP1(state).nextState; // turn 8
  state = finishP2(state).nextState; // turn 9 — cycle 5 opens
  assert.equal(state.turnNumber, 9);
  assert.equal(getActiveWeather(state).id, "spring");
});

test("Battle for the Bridge map cutscene repeats and splits around the duel choice", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, RONIN_MISSION_ID), true);
  markCampaignMapCutsceneSeen(storage, RONIN_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, RONIN_MISSION_ID), true);

  const preChoice = campaignMapCutsceneScript(RONIN_MISSION_ID, null, { phase: "preChoice" });
  assert.match(preChoice.map((line) => line.text).join(" "), /bridge|weather|protector|island|one on one/i);
  assert.equal(preChoice.some((line) => line.type === "swordsman" && /handle/i.test(line.text)), false);

  const postChoice = campaignMapCutsceneScript(RONIN_MISSION_ID, ["mystic"], { phase: "postChoice" });
  assert.ok(postChoice.some((line) => line.type === "mystic"));
  assert.match(postChoice.map((line) => line.text).join(" "), /handle|step back/i);

  const full = campaignMapCutsceneScript(RONIN_MISSION_ID, ["swordsman"]);
  assert.ok(full.length > preChoice.length);
  assert.match(full.map((line) => line.text).join(" "), /careful crossing|draws his blade|step back/i);
});

test("Battle for the Bridge dialogue covers opening banter, blind, rage, and post-win recruitment", () => {
  const state = roninMatchState(["swordsman"]);
  const opening = roninMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(RONIN_MISSION_ID, state), opening);
  assert.equal(opening[0].speakerId, "p2-0-ronin");
  assert.equal(opening[1].speakerId, "p1-0-swordsman");
  assert.match(opening.map((line) => line.text).join(" "), /bridge|draw|duel/i);

  const blinded = {
    ...state,
    phase: "playing",
    units: state.units.map((unit) =>
      unit.player === 1 ? { ...unit, statuses: [{ type: "blind", duration: 1 }] } : unit),
  };
  assert.equal(shouldShowRoninBlindWarning(blinded, { warningShown: false, roninBlindApplied: true }), true);
  assert.equal(shouldShowRoninBlindWarning(blinded, { warningShown: true, roninBlindApplied: true }), false);
  assert.match(roninBlindWarningScript(blinded).map((line) => line.text).join(" "), /blind|steel|eyes/i);

  const raging = {
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-ronin" ? { ...unit, hp: 5 } : unit),
  };
  assert.equal(shouldShowRoninRageWarning(raging, { warningShown: false }), true);
  assert.equal(shouldShowRoninRageWarning(raging, { warningShown: true }), false);
  assert.match(roninRageWarningScript(raging).map((line) => line.text).join(" "), /Final Draw|RAGE|recoil|duel/i);

  const defeat = roninDefeatScript({ ...state, winner: 1 });
  assert.match(defeat.map((line) => line.text).join(" "), /king|sorcerer|void|wrongs|just|services/i);
});

test("Battle for the Bridge grading rewards the duel, no blind, no Ronin rage, and Swordsman bonus", () => {
  const won = roninWonState();
  const perfect = evaluateCampaignMission(RONIN_MISSION_ID, won, {
    roninBlindApplied: false,
    roninEnteredRage: false,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noBlind", "preRageKill"]);
  assert.equal(perfect.bonusObjectives[0].id, "swordsmanDuelist");
  assert.equal(perfect.earnedBonusStars, 1);

  const messy = evaluateCampaignMission(RONIN_MISSION_ID, won, {
    roninBlindApplied: true,
    roninEnteredRage: true,
  });
  assert.equal(messy.stars, 2, "the Swordsman bonus can cover one missed base objective");
  assert.equal(messy.objectives.find((objective) => objective.id === "noBlind").earned, false);
  assert.equal(messy.objectives.find((objective) => objective.id === "preRageKill").earned, false);

  const archerWin = evaluateCampaignMission(RONIN_MISSION_ID, roninWonState(roninMatchState(["archer"])), {
    roninBlindApplied: false,
    roninEnteredRage: false,
  });
  assert.equal(archerWin.earnedBonusStars, 0);

  const lost = { ...won, winner: 2 };
  assert.equal(evaluateCampaignMission(RONIN_MISSION_ID, lost, {}).stars, 0);
});

test("Battle for the Bridge still awards an actual double-KO to the Ronin", () => {
  const state = roninMatchState(["swordsman"]);
  const doubleKo = {
    ...state,
    units: state.units.map((unit) => ({ ...unit, hp: 0 })),
  };

  resolveVictory(doubleKo);

  assert.equal(doubleKo.phase, "complete");
  assert.equal(doubleKo.winner, 2);
});

test("completing Battle for the Bridge unlocks the Ronin, records stars, and gates only the post-match cutscene", () => {
  const storage = storageAdapter();
  const won = roninWonState();

  const completed = completeCampaignMission(storage, RONIN_MISSION_ID, won, {
    roninBlindApplied: false,
    roninEnteredRage: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["ronin"]);
  assert.equal(isUnitUnlocked("ronin", storage), true);
  assert.equal(readCampaignProgressStars(storage, RONIN_MISSION_ID), 3);
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, RONIN_MISSION_ID), true);
  markCampaignPostMatchCutsceneSeen(storage, RONIN_MISSION_ID);
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, RONIN_MISSION_ID), false);
  assert.equal(shouldShowCampaignMapCutscene(storage, RONIN_MISSION_ID), true);
});

// --- Wrong Place, Wrong Time (mission 14) -----------------------------------

function wrongPlaceMatchState(squad = STARTER_FOUR) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(WRONG_PLACE_MISSION_ID, squad)),
    WRONG_PLACE_MISSION_ID,
  );
}

function wrongPlaceWonState(base = wrongPlaceMatchState(), { survive = true } = {}) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => {
      if (unit.player === 2) return { ...unit, hp: 0 };
      if (!survive && unit.id === "p1-1-archer") return { ...unit, hp: 0 };
      return { ...unit, hp: Math.max(1, unit.hp) };
    }),
  };
}

test("Wrong Place, Wrong Time promotes Frostcrown Foothills into a town riot-cop mission", () => {
  const mission = getCampaignMission(WRONG_PLACE_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "Wrong Place, Wrong Time");
  assert.equal(mission.locationName, "Frostcrown Foothills");
  assert.equal(mission.region, "town");
  assert.equal(mission.requiredStars, 26);
  assert.equal(mission.playerSlots, 4);
  assert.equal(mission.squadLocked, true);
  assert.deepEqual(mission.defaultSquad, STARTER_FOUR);
  assert.deepEqual(mission.rewardUnits, ["riot-cop"]);

  const node = getCampaignMap(storageAdapter()).nodes.find((n) => n.id === WRONG_PLACE_MISSION_ID);
  assert.ok(node);
  assert.equal(node.biome, "town");
  assert.equal(node.displayType, null, "locked mission keeps its unit hidden");
  assert.equal(node.point.x > 67 && node.point.x < 70, true, "the foothills marker sits on the painted node base");
});

test("Wrong Place, Wrong Time locks the starter squad into a 7x7 rage duel vs named riot cops", () => {
  const config = createCampaignMatchConfig(WRONG_PLACE_MISSION_ID, ["paladin", "ronin", "miner", "clod"]);
  assert.equal(config.size, 7);
  assert.deepEqual(config.squads[1], STARTER_FOUR);
  assert.deepEqual(config.squads[2], ["riot-cop", "riot-cop", "riot-cop", "riot-cop"]);
  assert.deepEqual(config.skins[2], [null, "swat-team", "firefighter", "street-patrol"]);
  assert.deepEqual(config.nicknames[2], ["John", "Mara", "Brock", "Sunny"]);
  assert.equal(config.teamNames[2], "Riot Detail");

  const match = wrongPlaceMatchState(["paladin", "ronin", "miner", "clod"]);
  assert.deepEqual(findUnit(match, "p1-0-swordsman").position, { x: 1, y: 6 });
  assert.deepEqual(findUnit(match, "p1-1-archer").position, { x: 0, y: 5 });
  assert.deepEqual(findUnit(match, "p1-2-mystic").position, { x: 0, y: 6 });
  assert.deepEqual(findUnit(match, "p1-3-magician").position, { x: 1, y: 5 });
  assert.deepEqual(findUnit(match, "p2-0-riot-cop").position, { x: 5, y: 0 });
  assert.deepEqual(findUnit(match, "p2-3-riot-cop").position, { x: 5, y: 1 });

  for (const unit of match.units) {
    assert.equal(unit.hp, 5, `${unit.id} starts at rage HP`);
    assert.equal(isRaging(unit), true, `${unit.id} is raging`);
  }
  assert.equal(findUnit(match, "p2-0-riot-cop").nickname, "John");
  assert.equal(findUnit(match, "p2-0-riot-cop").skin, null);
  assert.equal(findUnit(match, "p2-1-riot-cop").skin, "swat-team");
  assert.equal(findUnit(match, "p2-2-riot-cop").skin, "firefighter");
  assert.equal(findUnit(match, "p2-3-riot-cop").skin, "street-patrol");
});

test("Wrong Place, Wrong Time grading tracks win, survival, no stun, and Magician nuke bonus", () => {
  const won = wrongPlaceWonState();

  const perfect = evaluateCampaignMission(WRONG_PLACE_MISSION_ID, won, {
    wrongPlacePlayerStunned: false,
    wrongPlaceNukedAllEnemies: true,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "survive", "noStun"]);
  assert.equal(perfect.bonusObjectives[0].id, "nukeAll");
  assert.equal(perfect.earnedBonusStars, 1);

  const stunned = evaluateCampaignMission(WRONG_PLACE_MISSION_ID, won, {
    wrongPlacePlayerStunned: true,
    wrongPlaceNukedAllEnemies: false,
  });
  assert.equal(stunned.stars, 2);
  assert.equal(stunned.objectives.find((objective) => objective.id === "noStun").earned, false);

  const oneDown = evaluateCampaignMission(WRONG_PLACE_MISSION_ID, wrongPlaceWonState(undefined, { survive: false }), {
    wrongPlacePlayerStunned: false,
    wrongPlaceNukedAllEnemies: false,
  });
  assert.equal(oneDown.stars, 2);
});

test("Wrong Place, Wrong Time cutscenes and battle dialogue use named riot cops", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, WRONG_PLACE_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(WRONG_PLACE_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /halt|under arrest|us\?/i);
  assert.ok(preBrief.some((line) => line.name === "John" && line.speaker === "riot-cop"));

  markCampaignMapCutsceneSeen(storage, WRONG_PLACE_MISSION_ID);
  assert.equal(shouldShowCampaignMapCutscene(storage, WRONG_PLACE_MISSION_ID), false);
  assert.equal(shouldShowCampaignPostMatchCutscene(storage, WRONG_PLACE_MISSION_ID), true);

  const state = wrongPlaceMatchState();
  const opening = wrongPlaceMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(WRONG_PLACE_MISSION_ID, state), opening);
  assert.match(opening.map((line) => line.text).join(" "), /wizard outfit|criminals|sorcerer|shut it|arrested/i);
  assert.ok(opening.some((line) => line.name === "John" || line.speakerId === "p2-0-riot-cop"));

  const post = campaignPostMatchCutsceneScript(WRONG_PLACE_MISSION_ID);
  assert.deepEqual(post, wrongPlaceDefeatScript());
  assert.match(post.map((line) => line.text).join(" "), /John|wizard costume|wreckage|mosquito|justice|arsonist/i);
});

test("completing Wrong Place, Wrong Time unlocks Riot Cop and records stars", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, WRONG_PLACE_MISSION_ID, wrongPlaceWonState(), {
    wrongPlacePlayerStunned: false,
    wrongPlaceNukedAllEnemies: true,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["riot-cop"]);
  assert.equal(isUnitUnlocked("riot-cop", storage), true);
  assert.equal(readCampaignProgressStars(storage, WRONG_PLACE_MISSION_ID), 3);
});

// --- Out of Retirement (mission 15) ------------------------------------------

function outOfRetirementMatchState(squad = ["swordsman", "mystic"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(OUT_OF_RETIREMENT_MISSION_ID, squad)),
    OUT_OF_RETIREMENT_MISSION_ID,
  );
}

function outOfRetirementWonState(base = outOfRetirementMatchState()) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
}

test("Out of Retirement replaces the Rimefang placeholder on the painted island temple node", () => {
  const mission = getCampaignMission(OUT_OF_RETIREMENT_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "Out of Retirement");
  assert.equal(mission.locationName, "Sunbreak Temple");
  assert.equal(mission.region, "coast");
  assert.equal(mission.requiredStars, 28);
  assert.equal(mission.playerSlots, 2);
  assert.deepEqual(mission.rewardUnits, ["angel"]);
  assert.deepEqual(mission.rewardSkins, [
    { type: "angel", slug: "summer-vibes" },
    { type: "paladin", slug: "summer-vibes" },
  ]);

  const node = getCampaignMap(storageAdapter()).nodes.find((n) => n.id === OUT_OF_RETIREMENT_MISSION_ID);
  assert.ok(node);
  assert.equal(node.biome, "water");
  assert.equal(node.locationName, "Sunbreak Temple");
  assert.equal(node.point.x > 85 && node.point.x < 86, true, "the marker is nudged right onto the painted island node");
  assert.equal(node.point.y > 86.8 && node.point.y < 87.5, true, "the marker is nudged down onto the painted island node");
});

test("Out of Retirement is a hot-weather 7x7 chosen 2v2 against summer Angel and Paladin", () => {
  const config = createCampaignMatchConfig(OUT_OF_RETIREMENT_MISSION_ID, ["swordsman", "mystic"]);
  assert.equal(config.size, 7);
  assert.deepEqual(config.squads[1], ["swordsman", "mystic"]);
  assert.deepEqual(config.squads[2], ["angel", "paladin"]);
  assert.deepEqual(config.skins[2], ["summer-vibes", "summer-vibes"]);
  assert.equal(config.teamNames[2], "Retired Saints");

  const match = outOfRetirementMatchState();
  assert.equal(getActiveWeather(match)?.id, "heatwave");
  assert.equal(findUnit(match, "p2-0-angel").skin, "summer-vibes");
  assert.equal(findUnit(match, "p2-1-paladin").skin, "summer-vibes");
  for (const unit of match.units) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.id} starts at full HP`);
  }
});

test("Out of Retirement grading tracks win, Lightseeker, status attempts, and Angel-first bonus", () => {
  const won = outOfRetirementWonState();

  const perfect = evaluateCampaignMission(OUT_OF_RETIREMENT_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
    angelDefeatedBeforePaladin: true,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noLightseeker", "noStatus"]);
  assert.equal(perfect.bonusObjectives[0].id, "angelFirst");
  assert.deepEqual(perfect.rewardSkins, [
    { type: "angel", slug: "summer-vibes" },
    { type: "paladin", slug: "summer-vibes" },
  ]);

  const messy = evaluateCampaignMission(OUT_OF_RETIREMENT_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 1,
    paladinStatusAttempted: true,
    angelDefeatedBeforePaladin: true,
  });
  assert.equal(messy.stars, 2, "win plus Angel-first bonus covers one missed objective");
  assert.equal(messy.objectives.find((objective) => objective.id === "noLightseeker").earned, false);
  assert.equal(messy.objectives.find((objective) => objective.id === "noStatus").earned, false);
});

test("Out of Retirement dialogue covers the retirees, battle banter, warnings, rage, and pre-results help", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, OUT_OF_RETIREMENT_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(OUT_OF_RETIREMENT_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /retired|north|king|two of us|nap/i);
  assert.ok(preBrief.some((line) => line.speaker === "angel" && line.skin === "summer-vibes"));

  const state = outOfRetirementMatchState();
  const opening = outOfRetirementMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(OUT_OF_RETIREMENT_MISSION_ID, state), opening);
  assert.match(opening.map((line) => line.text).join(" "), /beach|drink|status/i);

  assert.match(outOfRetirementLightseekerWarningScript(state).map((line) => line.text).join(" "), /Lightseeker|Light tiles/i);
  assert.match(outOfRetirementStatusTauntScript(state).map((line) => line.text).join(" "), /Holy Being|Chosen|status/i);
  const raging = {
    ...state,
    phase: "playing",
    units: state.units.map((unit) => unit.id === "p2-0-angel" ? { ...unit, hp: 5 } : unit),
  };
  assert.equal(shouldShowOutOfRetirementAngelRageWarning(raging), true);
  assert.match(outOfRetirementAngelRageWarningScript(raging).map((line) => line.text).join(" "), /Heaven's Wrath|Heavenseeker/i);
  assert.match(outOfRetirementDefeatScript(outOfRetirementWonState()).map((line) => line.text).join(" "), /awake|help|change/i);
});

test("completing Out of Retirement unlocks Angel plus both summer skins", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, OUT_OF_RETIREMENT_MISSION_ID, outOfRetirementWonState(), {
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
    angelDefeatedBeforePaladin: true,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["angel"]);
  assert.deepEqual(completed.newRewardSkins, [
    { type: "angel", slug: "summer-vibes" },
    { type: "paladin", slug: "summer-vibes" },
  ]);
  assert.equal(isUnitUnlocked("angel", storage), true);
  assert.equal(isProgressSkinUnlocked("angel", "summer-vibes", storage), true);
  assert.equal(isProgressSkinUnlocked("paladin", "summer-vibes", storage), true);
  assert.deepEqual(readUnlockProgress(storage).campaignGrantedSkins, [
    { type: "angel", slug: "summer-vibes" },
    { type: "paladin", slug: "summer-vibes" },
  ]);
  assert.equal(readCampaignProgressStars(storage, OUT_OF_RETIREMENT_MISSION_ID), 3);
});

// --- Mission 16: Voidwood Forest --------------------------------------------

function voidwoodMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(VOIDWOOD_MISSION_ID, squad)),
    VOIDWOOD_MISSION_ID,
  );
}

function voidwoodWonState(base = voidwoodMatchState()) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
}

test("Voidwood Forest replaces the White Summit placeholder and nudges the marker down", () => {
  const mission = getCampaignMission(VOIDWOOD_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "Voidwood Forest");
  assert.equal(mission.locationName, "Voidwood Forest");
  assert.equal(mission.requiredStars, 30);
  assert.equal(mission.playerSlots, 4);
  assert.deepEqual(mission.rewardUnits, ["treant"]);
  assert.deepEqual(mission.rewardSkins, [{ type: "treant", slug: "voidroot" }]);
  assert.equal(mission.region, "wood");
  assert.equal(mission.point.x > 74 && mission.point.x < 76, true);
  assert.equal(mission.point.y > 63 && mission.point.y < 66, true, "the old summit node is pulled down onto the painted node");

  const node = getCampaignMap(storageAdapter()).nodes[16];
  assert.equal(node.id, VOIDWOOD_MISSION_ID);
  assert.equal(node.title, "Voidwood Forest");
  assert.equal(node.displayType, null, "locked nodes still hide the unit silhouette");
});

test("Voidwood Forest builds a full-HP 9x9 4v4 against void skins with Witch Doctor ghouls but no fire", () => {
  const config = createCampaignMatchConfig(VOIDWOOD_MISSION_ID, ["swordsman", "archer", "mystic", "magician"]);
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["swordsman", "archer", "mystic", "magician"]);
  assert.deepEqual(config.squads[2], ["treant", "angel", "witch-doctor", "necromancer"]);
  assert.deepEqual(config.skins[2], ["voidroot", "void-dweller", "void-dweller", "void-dweller"]);
  assert.equal(config.teamNames[2], "Voidwood Remnant");

  const match = voidwoodMatchState();
  assert.equal(match.size, 9);
  assert.equal(match.units.filter((unit) => unit.player === 1).length, 4);
  assert.equal(match.units.filter((unit) => unit.player === 2 && unit.type !== "ghoul").length, 4);
  assert.equal(findUnit(match, "p2-0-treant").skin, "voidroot");
  assert.equal(findUnit(match, "p2-1-angel").skin, "void-dweller");
  assert.equal(findUnit(match, "p2-2-witch-doctor").skin, "void-dweller");
  assert.equal(findUnit(match, "p2-3-necromancer").skin, "void-dweller");

  const ghouls = match.units.filter((unit) => unit.type === "ghoul");
  assert.equal(ghouls.length, 8);
  assert.deepEqual(
    ghouls.map((unit) => `${unit.position.x},${unit.position.y}`).sort(),
    ["2,2", "2,4", "2,6", "4,2", "4,4", "4,6", "6,4", "6,6"],
  );
  assert.equal(Object.values(match.tileObjects ?? {}).some((object) => object.kind === "fire"), false);
  for (const unit of match.units.filter((unit) => unit.type !== "ghoul")) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.id} starts at full HP`);
  }
});

test("Voidwood Forest grading tracks Dark Bomb, Ghoul Bite, and no-magic bonus", () => {
  const won = voidwoodWonState();

  const perfect = evaluateCampaignMission(VOIDWOOD_MISSION_ID, won, {
    voidwoodDarkBombDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    playerMagicDamageDealtCount: 0,
  });
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noDarkBomb", "noGhoulBite"]);
  assert.equal(perfect.bonusObjectives[0].id, "noMagicDamage");
  assert.deepEqual(perfect.rewardSkins, [{ type: "treant", slug: "voidroot" }]);

  const messy = evaluateCampaignMission(VOIDWOOD_MISSION_ID, won, {
    voidwoodDarkBombDamageTakenCount: 1,
    ghoulBiteTakenCount: 1,
    playerMagicDamageDealtCount: 0,
  });
  assert.equal(messy.stars, 2, "win plus no-magic bonus covers one missed star");
  assert.equal(messy.objectives.find((objective) => objective.id === "noDarkBomb").earned, false);
  assert.equal(messy.objectives.find((objective) => objective.id === "noGhoulBite").earned, false);
  assert.equal(evaluateCampaignMission(VOIDWOOD_MISSION_ID, won, {
    voidwoodDarkBombDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    playerMagicDamageDealtCount: 1,
  }).earnedBonusStars, 0);
});

test("Voidwood Forest dialogue covers the corrupted Treant, enemy fall lines, restored Treant, and post-match vow", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, VOIDWOOD_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(VOIDWOOD_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /who wakes|wisdom|real Treant|forest belongs to the void|hear from you/i);
  assert.ok(preBrief.some((line) => line.speaker === "treant" && line.skin === "voidroot"));

  const state = voidwoodMatchState();
  const opening = voidwoodMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(VOIDWOOD_MISSION_ID, state), opening);
  assert.equal(opening.length, 0, "battle starts with no banter");

  for (const id of ["p2-0-treant", "p2-1-angel", "p2-2-witch-doctor", "p2-3-necromancer"]) {
    const fallen = {
      ...state,
      units: state.units.map((unit) => unit.id === id ? { ...unit, hp: 0 } : unit),
    };
    const script = voidwoodEnemyFallScript(fallen, id);
    assert.equal(script.length, 1);
    assert.equal(script[0].speakerId, id);
  }

  assert.match(voidwoodDefeatScript(voidwoodWonState()).map((line) => line.text).join(" "), /where am I|what happened/i);
  const post = campaignPostMatchCutsceneScript(VOIDWOOD_MISSION_ID);
  assert.match(post.map((line) => line.text).join(" "), /hostage|void magic|justice|king|old friend/i);
});

test("completing Voidwood Forest unlocks Treant plus the voidroot skin", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, VOIDWOOD_MISSION_ID, voidwoodWonState(), {
    voidwoodDarkBombDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    playerMagicDamageDealtCount: 0,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["treant"]);
  assert.deepEqual(completed.newRewardSkins, [{ type: "treant", slug: "voidroot" }]);
  assert.equal(isUnitUnlocked("treant", storage), true);
  assert.equal(isProgressSkinUnlocked("treant", "voidroot", storage), true);
  assert.equal(readCampaignProgressStars(storage, VOIDWOOD_MISSION_ID), 3);
});

// --- Mission 17: Spirit of the Woods -----------------------------------------

function spiritWoodsMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(SPIRIT_WOODS_MISSION_ID, squad)),
    SPIRIT_WOODS_MISSION_ID,
  );
}

function spiritWoodsWonState(base = spiritWoodsMatchState()) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
}

test("Spirit of the Woods is mission 17 and keeps The Showdown locked until all prior missions complete", () => {
  const mission = getCampaignMission(SPIRIT_WOODS_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "Spirit of the Woods");
  assert.equal(mission.locationName, "Spirit Grove");
  assert.equal(mission.region, "wood");
  assert.equal(mission.requiredStars, 32);
  assert.equal(mission.playerSlots, 4);
  assert.deepEqual(mission.rewardUnits, ["mother-nature"]);

  const fresh = getCampaignMap(storageAdapter());
  const spiritIndex = fresh.nodes.findIndex((node) => node.id === SPIRIT_WOODS_MISSION_ID);
  const wasteIndex = fresh.nodes.findIndex((node) => node.id === SHOWDOWN_MISSION_ID);
  assert.equal(spiritIndex > -1, true);
  assert.equal(wasteIndex, spiritIndex + 1);
  assert.equal(fresh.nodes[spiritIndex].point.x > 29.5 && fresh.nodes[spiritIndex].point.x < 30.5, true, "the marker sits on the painted forest node east of Timeless Woods");
  assert.equal(fresh.nodes[spiritIndex].point.y > 56.5 && fresh.nodes[spiritIndex].point.y < 57.3, true, "the marker sits on the painted forest node east of Timeless Woods");

  const storage = storageAdapter();
  const priorWithoutSpirit = fresh.nodes.slice(0, spiritIndex).map((node) => node.id);
  writeCampaignProgress(storage, {
    completedMissions: priorWithoutSpirit,
    missionStars: Object.fromEntries(priorWithoutSpirit.map((id) => [id, 3])),
  });
  const stillLocked = getCampaignMap(storage).nodes[wasteIndex];
  assert.equal(stillLocked.locationName, "The Shattered Waste");
  assert.equal(stillLocked.status, "locked");

  writeCampaignProgress(storage, {
    completedMissions: [...priorWithoutSpirit, SPIRIT_WOODS_MISSION_ID],
    missionStars: Object.fromEntries([...priorWithoutSpirit, SPIRIT_WOODS_MISSION_ID].map((id) => [id, 1])),
  });
  assert.equal(getCampaignMap(storage).nodes[wasteIndex].status, "available");
});

test("Spirit of the Woods is an 11x11 chosen 4v4 against Mother Nature's court", () => {
  const config = createCampaignMatchConfig(SPIRIT_WOODS_MISSION_ID, ["paladin", "treant", "ronin", "angel"]);
  assert.equal(config.size, 11);
  assert.deepEqual(config.squads[1], ["paladin", "treant", "ronin", "angel"]);
  assert.deepEqual(config.squads[2], ["mother-nature", "treant", "clod", "paladin"]);
  assert.deepEqual(config.skins[2], [null, null, null, "gaia's-protector"]);
  assert.equal(config.teamNames[2], "Wild Court");

  const match = spiritWoodsMatchState();
  assert.equal(match.size, 11);
  for (const unit of match.units) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.id} starts at full HP`);
  }
  assert.equal(findUnit(match, "p2-3-paladin").skin, "gaia's-protector");
});

test("Spirit of the Woods grading tracks Lightseeker, Great Flood, and starter-squad bonus", () => {
  const won = spiritWoodsWonState();

  const perfect = evaluateCampaignMission(SPIRIT_WOODS_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 0,
    motherNatureGreatFloodUsed: false,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noLightseeker", "noGreatFlood"]);
  assert.equal(perfect.bonusObjectives[0].id, "starterSquad");
  assert.equal(perfect.earnedBonusStars, 1);

  const messy = evaluateCampaignMission(SPIRIT_WOODS_MISSION_ID, won, {
    paladinLightseekerDamageTakenCount: 1,
    motherNatureGreatFloodUsed: true,
  });
  assert.equal(messy.stars, 2, "win plus starter-squad bonus covers one missed star");
  assert.equal(messy.objectives.find((objective) => objective.id === "noLightseeker").earned, false);
  assert.equal(messy.objectives.find((objective) => objective.id === "noGreatFlood").earned, false);
});

test("Spirit of the Woods dialogue covers the forest challenge and conditional battle banter", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, SPIRIT_WOODS_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(SPIRIT_WOODS_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /anyone there|gust of wind|not ordinary|ready/i);
  assert.ok(preBrief.some((line) => line.narration === true && /gust of wind/i.test(line.text)));

  const state = spiritWoodsMatchState();
  const opening = spiritWoodsMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(SPIRIT_WOODS_MISSION_ID, state), opening);
  assert.match(opening.map((line) => line.text).join(" "), /disturb my rest|snow storm|void|fight for it|duel/i);

  const playing = { ...state, phase: "playing" };
  assert.equal(shouldShowSpiritWoodsGreatFloodDialogue(playing, { greatFloodUsed: true }), true);
  assert.match(spiritWoodsGreatFloodScript(playing).map((line) => line.text).join(" "), /Great Flood|whole field/i);
  assert.equal(shouldShowSpiritWoodsTreantPoisonTaunt(playing, { poisonAttempted: true }), true);
  assert.match(spiritWoodsTreantPoisonTauntScript(playing).map((line) => line.text).join(" "), /Poison|root/i);
  assert.equal(shouldShowSpiritWoodsPaladinStatusTaunt(playing, { statusAttempted: true }), true);
  assert.match(spiritWoodsPaladinStatusTauntScript(playing).map((line) => line.text).join(" "), /Gaia's protector|curses/i);
  assert.equal(shouldShowSpiritWoodsTreantFireTaunt(playing, { fireHit: true }), true);
  assert.match(spiritWoodsTreantFireTauntScript(playing).map((line) => line.text).join(" "), /Fire|flame/i);

  const post = campaignPostMatchCutsceneScript(SPIRIT_WOODS_MISSION_ID);
  assert.match(post.map((line) => line.text).join(" "), /forest mattered|void spreads|calm the storm|king/i);
});

test("completing Spirit of the Woods unlocks Mother Nature", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, SPIRIT_WOODS_MISSION_ID, spiritWoodsWonState(), {
    paladinLightseekerDamageTakenCount: 0,
    motherNatureGreatFloodUsed: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["mother-nature"]);
  assert.equal(isUnitUnlocked("mother-nature", storage), true);
  assert.deepEqual(campaignSelectableUnitTypes(["mother-nature", "swordsman"], storage, SPIRIT_WOODS_MISSION_ID), ["mother-nature", "swordsman"]);
  assert.deepEqual(campaignSelectableUnitTypes(["mother-nature", "swordsman"], storage, VIRUS_MISSION_ID), ["mother-nature", "swordsman"]);
  assert.equal(readCampaignProgressStars(storage, SPIRIT_WOODS_MISSION_ID), 3);
});

test("campaign squad selection gates Mother Nature from weather-related missions except her own", () => {
  const storage = storageAdapter();
  completeCampaignMission(storage, SPIRIT_WOODS_MISSION_ID, spiritWoodsWonState(), {
    paladinLightseekerDamageTakenCount: 0,
    motherNatureGreatFloodUsed: false,
  });

  const choices = ["mother-nature", "swordsman"];
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, SPIRIT_WOODS_MISSION_ID), choices);
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, VIRUS_MISSION_ID), choices);
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, GARGOYLE_MISSION_ID), ["swordsman"]);
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, OUT_OF_RETIREMENT_MISSION_ID), ["swordsman"]);
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, RONIN_MISSION_ID), ["swordsman"]);
  assert.deepEqual(campaignSelectableUnitTypes(choices, storage, SHOWDOWN_MISSION_ID), ["swordsman"]);
});

// --- Mission 18: The Showdown -------------------------------------------------

function showdownMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(SHOWDOWN_MISSION_ID, squad)),
    SHOWDOWN_MISSION_ID,
  );
}

function showdownWonState(base = showdownMatchState()) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
}

test("The Showdown replaces the Shattered Waste placeholder and unlocks only after all previous missions are complete", () => {
  const mission = getCampaignMission(SHOWDOWN_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "The Showdown");
  assert.equal(mission.locationName, "The Shattered Waste");
  assert.equal(mission.region, "waste");
  assert.equal(mission.requiresPreviousMissionsComplete, true);
  assert.deepEqual(mission.rewardUnits, ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]);

  const fresh = getCampaignMap(storageAdapter());
  const showdownIndex = fresh.nodes.findIndex((node) => node.id === SHOWDOWN_MISSION_ID);
  assert.equal(showdownIndex > -1, true);
  assert.equal(fresh.nodes[showdownIndex].status, "locked");
  assert.equal(fresh.nodes[showdownIndex].displayType, null);

  const storage = storageAdapter();
  const prior = fresh.nodes.slice(0, showdownIndex).map((node) => node.id);
  writeCampaignProgress(storage, {
    completedMissions: prior.slice(0, -1),
    missionStars: Object.fromEntries(prior.slice(0, -1).map((id) => [id, 3])),
  });
  assert.equal(getCampaignMap(storage).nodes[showdownIndex].status, "locked");

  writeCampaignProgress(storage, {
    completedMissions: prior,
    missionStars: Object.fromEntries(prior.map((id) => [id, 1])),
  });
  const unlocked = getCampaignMap(storage).nodes[showdownIndex];
  assert.equal(unlocked.status, "available");
  assert.equal(unlocked.displayType, "fat-knight");
});

test("The Showdown is a full-HP 11x11 4v4 under permanent blizzard", () => {
  const config = createCampaignMatchConfig(SHOWDOWN_MISSION_ID, ["paladin", "treant", "ronin", "angel"]);
  assert.equal(config.size, 11);
  assert.deepEqual(config.squads[1], ["paladin", "treant", "ronin", "angel"]);
  assert.deepEqual(config.squads[2], SHOWDOWN_FAT_TYPES);
  assert.equal(config.teamNames[2], "The Fat Party");

  const match = showdownMatchState();
  assert.equal(match.size, 11);
  assert.equal(getActiveWeather(match)?.id, "blizzard");
  assert.equal(match.missionRules?.permanentWeather?.weather, "blizzard");
  assert.deepEqual(match.units.filter((unit) => unit.player === 2).map((unit) => unit.type), SHOWDOWN_FAT_TYPES);
  for (const unit of match.units) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.id} starts at full HP`);
  }
});

test("The Showdown grading rewards win, any RAGE, survival, and all-standing Footwork bonus", () => {
  const won = showdownWonState();

  const perfect = evaluateCampaignMission(SHOWDOWN_MISSION_ID, won, {
    showdownAnyUnitEnteredRage: true,
    showdownFootworkHitAllEnemies: true,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "rageEntered", "survive"]);
  assert.equal(perfect.bonusObjectives[0].id, "footworkAll");
  assert.equal(perfect.earnedBonusStars, 1);

  const noRage = evaluateCampaignMission(SHOWDOWN_MISSION_ID, won, {
    showdownAnyUnitEnteredRage: false,
    showdownFootworkHitAllEnemies: false,
  });
  assert.equal(noRage.stars, 2);
  assert.equal(noRage.objectives.find((objective) => objective.id === "rageEntered").earned, false);

  const oneDown = {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-0-swordsman" ? { ...unit, hp: 0 } : unit),
  };
  assert.equal(evaluateCampaignMission(SHOWDOWN_MISSION_ID, oneDown, {
    showdownAnyUnitEnteredRage: true,
    showdownFootworkHitAllEnemies: true,
  }).stars, 3, "the bonus can cover one missed base objective");
});

test("The Showdown dialogue covers the cold pass, battle banter, fat RAGE lines, admission, and post-match reveal", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, SHOWDOWN_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(SHOWDOWN_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /calm the storm|forest|void spread|cross|freeze|wannabes|payback|squad/i);

  const state = showdownMatchState();
  const opening = showdownMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(SHOWDOWN_MISSION_ID, state), opening);
  assert.match(opening.map((line) => line.text).join(" "), /king|truth|pass|ruin everything/i);

  const playing = { ...state, phase: "playing" };
  for (const type of SHOWDOWN_FAT_TYPES) {
    const raging = {
      ...playing,
      units: playing.units.map((unit) => unit.player === 2 && unit.type === type ? { ...unit, hp: 5 } : unit),
    };
    assert.equal(shouldShowShowdownFatRageWarning(raging, type, { warned: false }), true);
    assert.equal(shouldShowShowdownFatRageWarning(raging, type, { warned: true }), false);
    assert.match(showdownFatRageWarningScript(raging, type).map((line) => line.text).join(" "), /RAGE|payback|freeze|truth|sorry/i);
  }

  assert.match(showdownDefeatScript(showdownWonState()).map((line) => line.text).join(" "), /got us|better than us|wannabes/i);
  const post = campaignPostMatchCutsceneScript(SHOWDOWN_MISSION_ID);
  assert.match(post.map((line) => line.text).join(" "), /void gate|drunk|cloaked figure|banished|king's name/i);
});

test("completing The Showdown unlocks the full fat party", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, SHOWDOWN_MISSION_ID, showdownWonState(), {
    showdownAnyUnitEnteredRage: true,
    showdownFootworkHitAllEnemies: true,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]);
  for (const type of ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]) {
    assert.equal(isUnitUnlocked(type, storage), true, `${type} unlocked`);
  }
  assert.equal(readCampaignProgressStars(storage, SHOWDOWN_MISSION_ID), 3);
});

// --- Mission 19: Not My King --------------------------------------------------

function notMyKingMatchState(squad = ["swordsman", "archer", "mystic", "magician"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(NOT_MY_KING_MISSION_ID, squad)),
    NOT_MY_KING_MISSION_ID,
  );
}

function notMyKingWonState(base = notMyKingMatchState()) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) =>
      unit.player === 2 ? { ...unit, hp: 0 } : { ...unit, hp: Math.max(1, unit.hp) }),
  };
}

test("Not My King replaces the Iron Citadel placeholder on the lower painted node above The Showdown", () => {
  const mission = getCampaignMission(NOT_MY_KING_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.title, "Not My King");
  assert.equal(mission.locationName, "Ember Crown Rise");
  assert.equal(mission.region, "waste");
  assert.equal(mission.requiresPreviousMissionsComplete, true);
  assert.deepEqual(mission.rewardUnits, ["king"]);

  const fresh = getCampaignMap(storageAdapter());
  const showdownIndex = fresh.nodes.findIndex((node) => node.id === SHOWDOWN_MISSION_ID);
  const kingIndex = fresh.nodes.findIndex((node) => node.id === NOT_MY_KING_MISSION_ID);
  assert.equal(kingIndex, showdownIndex + 1);
  assert.equal(fresh.nodes[kingIndex].locationName.includes("Iron Citadel"), false);
  assert.equal(fresh.nodes[kingIndex].point.x > 83 && fresh.nodes[kingIndex].point.x < 85, true, "the marker sits on the painted snow-route node above The Showdown");
  assert.equal(fresh.nodes[kingIndex].point.y > 30 && fresh.nodes[kingIndex].point.y < 32, true, "the marker sits on the painted snow-route node above The Showdown");

  const storage = storageAdapter();
  const prior = fresh.nodes.slice(0, kingIndex).map((node) => node.id);
  writeCampaignProgress(storage, {
    completedMissions: prior.slice(0, -1),
    missionStars: Object.fromEntries(prior.slice(0, -1).map((id) => [id, 3])),
  });
  assert.equal(getCampaignMap(storage).nodes[kingIndex].status, "locked");

  writeCampaignProgress(storage, {
    completedMissions: prior,
    missionStars: Object.fromEntries(prior.map((id) => [id, 1])),
  });
  const unlocked = getCampaignMap(storage).nodes[kingIndex];
  assert.equal(unlocked.status, "available");
  assert.equal(unlocked.displayType, "king");
});

test("Not My King is a 13x13 chosen 4v4 under permanent heatwave with void enemies and CPU first", () => {
  const config = createCampaignMatchConfig(NOT_MY_KING_MISSION_ID, ["paladin", "treant", "ronin", "angel"]);
  assert.equal(config.size, 13);
  assert.deepEqual(config.squads[1], ["paladin", "treant", "ronin", "angel"]);
  assert.deepEqual(config.squads[2], ["king", "angel", "gargoyle", "father-time"]);
  assert.deepEqual(config.skins[2], ["void-dweller", "void-dweller", "void-dweller", "void-dweller"]);
  assert.equal(config.teamNames[2], "Void Crown");

  const match = notMyKingMatchState();
  assert.equal(match.size, 13);
  assert.equal(match.currentPlayer, 2);
  assert.equal(getActiveWeather(match)?.id, "heatwave");
  assert.equal(match.missionRules?.permanentWeather?.weather, "heatwave");
  assert.deepEqual(match.units.filter((unit) => unit.player === 2).map((unit) => unit.type), NOT_MY_KING_ENEMY_TYPES);
  assert.deepEqual(match.units.filter((unit) => unit.player === 2).map((unit) => unit.skin), ["void-dweller", "void-dweller", "void-dweller", "void-dweller"]);
  assert.equal(findUnit(match, "p2-3-father-time").skin, "void-dweller");
  for (const unit of match.units) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.id} starts at full HP`);
  }
});

test("Not My King CPU can complete Gargoyle Flight without locking its turn", () => {
  const base = notMyKingMatchState();
  const state = {
    ...base,
    currentPlayer: 2,
    activation: null,
    units: base.units.map((unit) => {
      if (unit.id === "p2-2-gargoyle") {
        return { ...unit, position: { x: 7, y: 7 }, spent: false };
      }
      if (unit.player === 2) {
        return {
          ...unit,
          spent: true,
          ...(unit.type === "king" ? { commandTurn: base.turnNumber } : {}),
        };
      }
      if (unit.id === "p1-0-swordsman") {
        return { ...unit, position: { x: 3, y: 3 }, hp: Math.max(1, unit.hp) };
      }
      return { ...unit, hp: 0, spent: true };
    }),
  };

  const commands = chooseActivation(state, {
    difficulty: "normal",
    cpuPlayer: 2,
    rng: cpuRng(state),
  });
  assert.ok(commands.some((command) => command.type === "USE_ART" && command.artId === "flight"));

  let after = state;
  for (const command of commands) {
    const result = applyCommand(after, command);
    assert.ok(result.accepted, `${command.type} rejected (${result.errorCode})`);
    after = result.nextState;
  }
  assert.equal(after.currentPlayer, 1, "Flight must spend the final CPU activation and hand over the turn");
  assert.equal(after.activation, null);
});

test("Not My King grading rewards winning, avoiding enemy RAGE, and survival", () => {
  const won = notMyKingWonState();

  const perfect = evaluateCampaignMission(NOT_MY_KING_MISSION_ID, won, {
    notMyKingEnemyEnteredRage: false,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((objective) => objective.id), ["complete", "noEnemyRage", "survive"]);

  const rage = evaluateCampaignMission(NOT_MY_KING_MISSION_ID, won, {
    notMyKingEnemyEnteredRage: true,
  });
  assert.equal(rage.stars, 2);
  assert.equal(rage.objectives.find((objective) => objective.id === "noEnemyRage").earned, false);

  const oneDown = {
    ...won,
    units: won.units.map((unit) => unit.id === "p1-0-swordsman" ? { ...unit, hp: 0 } : unit),
  };
  assert.equal(evaluateCampaignMission(NOT_MY_KING_MISSION_ID, oneDown, {
    notMyKingEnemyEnteredRage: false,
  }).stars, 2);
});

test("Not My King dialogue covers the inferno cutscene, silent king banter, RAGE ellipses, and the lore reveal", () => {
  const storage = storageAdapter();
  assert.equal(shouldShowCampaignMapCutscene(storage, NOT_MY_KING_MISSION_ID), true);
  const preBrief = campaignMapCutsceneScript(NOT_MY_KING_MISSION_ID);
  assert.match(preBrief.map((line) => line.text).join(" "), /my king|no more|void magic|trap|inferno|embers|ready/i);
  assert.ok(preBrief.some((line) => line.narration === true && /inferno/i.test(line.text)));

  const state = notMyKingMatchState();
  const opening = notMyKingMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(NOT_MY_KING_MISSION_ID, state), opening);
  assert.match(opening.map((line) => line.text).join(" "), /return to your senses|\.\.\./i);

  const playing = { ...state, phase: "playing" };
  for (const type of NOT_MY_KING_ENEMY_TYPES) {
    const raging = {
      ...playing,
      units: playing.units.map((unit) => unit.player === 2 && unit.type === type ? { ...unit, hp: 5 } : unit),
    };
    assert.equal(shouldShowNotMyKingEnemyRageWarning(raging, type, { warned: false }), true);
    assert.equal(shouldShowNotMyKingEnemyRageWarning(raging, type, { warned: true }), false);
    assert.deepEqual(notMyKingEnemyRageWarningScript(raging, type).map((line) => line.text), ["..."]);
  }

  assert.match(notMyKingDefeatScript(notMyKingWonState()).map((line) => line.text).join(" "), /Where am I|kingdom walls/i);
  const post = campaignPostMatchCutsceneScript(NOT_MY_KING_MISSION_ID);
  assert.match(post.map((line) => line.text).join(" "), /sorry|void gate|nemesis|summoner|blacksword|spiritual sites|castle/i);
  assert.ok(post.some((line) => line.speaker === "king"), "post-match lore beat should include the restored King");
  for (const line of post.filter((line) => line.speaker === "king")) {
    assert.equal(line.skin, null, "the King returns to his classic look after the battle");
  }
});

test("completing Not My King unlocks the King", () => {
  const storage = storageAdapter();
  const completed = completeCampaignMission(storage, NOT_MY_KING_MISSION_ID, notMyKingWonState(), {
    notMyKingEnemyEnteredRage: false,
  });

  assert.equal(completed.victory, true);
  assert.equal(completed.stars, 3);
  assert.deepEqual(completed.newRewardUnits, ["king"]);
  assert.equal(isUnitUnlocked("king", storage), true);
  assert.equal(readCampaignProgressStars(storage, NOT_MY_KING_MISSION_ID), 3);
});

// --- Mechs on the Farm (mission 7.5) -----------------------------------------

function brothersMatchState(squad = ["swordsman", "archer"]) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(BROTHERS_MISSION_ID, squad)),
    BROTHERS_MISSION_ID,
  );
}

function brothersWonState(base, { survive = true } = {}) {
  return {
    ...base,
    phase: "complete",
    winner: 1,
    units: base.units.map((unit) => {
      if (unit.player === 2) return { ...unit, hp: 0 };
      if (!survive && unit.id === base.units.find((u) => u.player === 1)?.id) return { ...unit, hp: 0 };
      return { ...unit, hp: Math.max(1, unit.hp) };
    }),
  };
}

test("Mechs on the Farm is a full-HP 9x9 2v2 vs Big and Little Brother, rewarding both", () => {
  const mission = getCampaignMission(BROTHERS_MISSION_ID);
  assert.ok(mission);
  assert.equal(mission.comingSoon ?? false, false);
  assert.equal(mission.requiredStars, 13);
  assert.deepEqual(mission.rewardUnits, ["big-brother", "little-brother"]);
  assert.equal(mission.playerSlots, 2);

  const config = createCampaignMatchConfig(BROTHERS_MISSION_ID, ["swordsman", "archer"]);
  assert.equal(config.size, 9);
  assert.deepEqual(config.squads[1], ["swordsman", "archer"]);
  assert.deepEqual(config.squads[2], ["big-brother", "little-brother"]);
  assert.equal(config.teamNames[2], "The Brothers");

  const match = brothersMatchState();
  const walls = Object.values(match.tileObjects ?? {}).filter((obj) => obj.kind === "wall");
  const fires = Object.values(match.tileObjects ?? {}).filter((obj) => obj.kind === "fire");
  assert.equal(walls.length, 0);
  assert.equal(fires.length, 0);
  for (const unit of match.units) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp, `${unit.type} starts at full HP`);
  }
  assert.ok(findUnit(match, "p2-0-big-brother"));
  assert.ok(findUnit(match, "p2-1-little-brother"));
});

test("Mechs on the Farm grading: win, no double-flame, kill before rage, plus the survival bonus", () => {
  const won = brothersWonState(brothersMatchState());

  const perfect = evaluateCampaignMission(BROTHERS_MISSION_ID, won, {
    flamethrowerBothHitCount: 0,
    brothersEnteredRage: false,
  });
  assert.equal(perfect.victory, true);
  assert.equal(perfect.stars, 3);
  assert.deepEqual(perfect.objectives.map((o) => o.id), ["complete", "noDoubleFlame", "preRageKill"]);
  assert.equal(perfect.bonusObjectives[0].id, "survive");
  assert.equal(perfect.earnedBonusStars, 1);

  // A double-flame + a rage means only the win counts, but the survival bonus covers ONE.
  const messy = evaluateCampaignMission(BROTHERS_MISSION_ID, won, {
    flamethrowerBothHitCount: 1,
    brothersEnteredRage: true,
  });
  assert.equal(messy.objectives.find((o) => o.id === "noDoubleFlame").earned, false);
  assert.equal(messy.objectives.find((o) => o.id === "preRageKill").earned, false);
  assert.equal(messy.stars, 2, "win + survival bonus");

  // Same mess but a unit lost: bonus gone too, only the win remains.
  const messyDead = evaluateCampaignMission(BROTHERS_MISSION_ID, brothersWonState(brothersMatchState(), { survive: false }), {
    flamethrowerBothHitCount: 2,
    brothersEnteredRage: true,
  });
  assert.equal(messyDead.stars, 1);

  const lost = { ...won, winner: 2 };
  assert.equal(evaluateCampaignMission(BROTHERS_MISSION_ID, lost, {}).stars, 0);
});

test("Mechs on the Farm dialogue: arguing brothers turn on the party, each rages, then make up", () => {
  const state = brothersMatchState();
  const opening = brothersMissionOpeningScript(state);
  assert.deepEqual(campaignOpeningScript(BROTHERS_MISSION_ID, state), opening);
  const big = state.units.find((u) => u.id === "p2-0-big-brother");
  const little = state.units.find((u) => u.id === "p2-1-little-brother");
  assert.ok(opening.some((line) => line.speakerId === big.id));
  assert.ok(opening.some((line) => line.speakerId === little.id));
  assert.ok(opening.some((line) => /^p1-/.test(line.speakerId ?? "")), "the party tries to mediate");
  assert.match(opening.map((line) => line.text).join(" "), /stay out of it/i);
  assert.match(opening.map((line) => line.text).join(" "), /truce/i);

  // Each brother has its own one-time RAGE line, gated per brother.
  const playing = { ...state, phase: "playing" };
  for (const type of ["big-brother", "little-brother"]) {
    const raging = {
      ...playing,
      units: playing.units.map((u) => (u.player === 2 && u.type === type ? { ...u, hp: 5 } : u)),
    };
    assert.equal(shouldShowBrothersRageWarning(raging, type, { warned: false }), true);
    assert.equal(shouldShowBrothersRageWarning(raging, type, { warned: true }), false);
    assert.equal(shouldShowBrothersRageWarning(playing, type, { warned: false }), false);
    const script = brothersRageWarningScript(raging, type);
    assert.equal(script.length, 1);
    assert.equal(script[0].speakerId, raging.units.find((u) => u.player === 2 && u.type === type).id);
  }

  const defeat = brothersDefeatScript({ ...playing, winner: 1 });
  assert.ok(defeat.length >= 4);
  assert.match(defeat.map((line) => line.text).join(" "), /sorry|deal|split/i);
});
