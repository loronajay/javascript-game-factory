import test from "node:test";
import assert from "node:assert/strict";

import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { getUnitType } from "../src/core/unitCatalog.js";
import { findUnit } from "../src/core/state.js";
import { resolveVictory } from "../src/core/turnEngine.js";
import { isUnitUnlocked } from "../src/ui/squadModel.js";
import {
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  GARGOYLE_MISSION_ID,
  NECROMANCER_MISSION_ID,
  MONK_MISSION_ID,
  PALADIN_MISSION_ID,
  SNIPER_MISSION_ID,
  VIRUS_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  WANDERING_PARTY_SKIN_PACK,
  WITCH_DOCTOR_MISSION_ID,
  applyLockedSlots,
  campaignMapCutsceneScript,
  campaignOpeningScript,
  campaignPostMatchCutsceneScript,
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
  monkMissionOpeningScript,
  necromancerMissionOpeningScript,
  necromancerRageWarningScript,
  necromancerStatusWarningScript,
  necromancerSummonWarningScript,
  normalizeCampaignSquad,
  prepareCampaignMatchState,
  resetCampaignProgress,
  shouldShowClodRageWarning,
  shouldShowFatherTimeRageWarning,
  shouldShowGargoyleRageWarning,
  shouldShowCampaignMapCutscene,
  shouldShowNecromancerRageWarning,
  shouldShowNecromancerStatusWarning,
  shouldShowNecromancerSummonWarning,
  shouldShowPaladinLightseekerWarning,
  shouldShowPaladinRageWarning,
  shouldShowPaladinStatusTaunt,
  shouldShowSniperFireWarning,
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
  virusEnemyStatusTauntScript,
  virusMissionOpeningScript,
  virusPoisonWarningScript,
  witchDoctorBlockedShotWarningScript,
  witchDoctorFireWarningScript,
  witchDoctorGhoulWarningScript,
  witchDoctorMissionOpeningScript,
  witchDoctorRageWarningScript,
  writeCampaignProgress,
} from "../src/campaign/campaign.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation } from "../src/core/commands.js";

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
  assert.equal(map.nodes.length, 19);
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
  assert.equal(campaignMapCutsceneScript(PALADIN_MISSION_ID).length >= 3, true);
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

  const node = getCampaignMap(storage).nodes[7];
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

test("The High Ground scatters destructible cover walls and permanent cliff-fire", () => {
  const match = sniperMatchState();
  const objects = match.tileObjects ?? {};

  const walls = Object.entries(objects).filter(([, obj]) => obj.kind === "wall");
  const fires = Object.entries(objects).filter(([, obj]) => obj.kind === "fire");
  assert.equal(walls.length, 5, "five cover walls on the plateau");
  assert.equal(fires.length, 6, "six cliff-fire tiles");

  // Walls are 1-HP (one Archer shot each); fire is permanent terrain, not a countdown.
  assert.deepEqual(objects["3,9"], { kind: "wall", hp: 1 });
  assert.deepEqual(objects["10,10"], { kind: "wall", hp: 1 });
  assert.deepEqual(objects["6,6"], { kind: "fire", permanent: true });
  assert.deepEqual(objects["9,9"], { kind: "fire", permanent: true });

  // Hazards spread across every quadrant of the board, not one narrow lane.
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
  // The node is still present on the map (a replacement, not an addition).
  const map = getCampaignMap(storageAdapter());
  assert.equal(map.nodes.length, 19);
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
