import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import { getSoulShuffleChoices, getUnitType, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { findUnit } from "../src/core/state.js";
import { resolveVictory } from "../src/core/turnEngine.js";
import { musicKeyForMatchMode } from "../src/audio/sounds.js";
import {
  MAX_CAMPAIGN_MISSIONS,
  VOID_CASTLE_MISSION_ID,
  applyVoidCastleIntroBeat,
  applyVoidCastlePartyHeal,
  applyVoidCastleSplit,
  completeCampaignMission,
  createCampaignMatchConfig,
  evaluateCampaignMission,
  getCampaignMission,
  prepareCampaignMatchState,
  voidCastleSplitScript,
  campaignMapCutsceneScript,
  campaignPostMatchCutsceneScript,
  campaignOpeningScript,
} from "../src/campaign/campaign.js";
import {
  VOID_CASTLE_GHOST_FAKE_NAMES,
  VOID_CASTLE_GHOST_POOLS,
} from "../src/campaign/missions/void-ridden-castle/ghosts.js";
import { isUnitUnlocked } from "../src/ui/squadModel.js";

const SQUAD = ["swordsman", "archer", "mystic", "magician"];

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function castleState(squad = SQUAD) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(VOID_CASTLE_MISSION_ID, squad)),
    VOID_CASTLE_MISSION_ID,
  );
}

// Drives the board to the end of phase 1 the way a real match does: kill every enemy, then
// let resolveVictory settle it.
function clearPhaseOne(state) {
  for (const unit of state.units) {
    if (unit.player === 2) unit.hp = 0;
  }
  resolveVictory(state);
  return state;
}

test("Void Ridden Castle is the penultimate stop, a 13x13 4v4 rewarding Nemesis", () => {
  const mission = getCampaignMission(VOID_CASTLE_MISSION_ID);
  const config = createCampaignMatchConfig(VOID_CASTLE_MISSION_ID, SQUAD);

  assert.equal(mission.title, "Void Ridden Castle");
  assert.equal(mission.locationName, "Highspire Castle");
  assert.equal(mission.playerSlots, 4);
  assert.equal(mission.size, 13);
  assert.equal(mission.requiresPreviousMissionsComplete, true);
  assert.deepEqual([...mission.rewardUnits], ["nemesis"]);
  assert.equal(mission.rewardLabel, "Nemesis");
  assert.deepEqual([...config.squads[2]], ["summoner", "nemesis", "nemesis", "nemesis"]);
  // The castle is stop 21 of 22 — The Final Battle now sits behind it at the void gate.
  assert.equal(MAX_CAMPAIGN_MISSIONS, 22);

  // The mission blurb must not give away either surprise.
  assert.doesNotMatch(mission.description, /split|four Summoners|copy|copies|decoy|fake|two-part|ghost/i);
});

test("completing Void Ridden Castle unlocks Nemesis but not the Summoner", () => {
  const storage = storageAdapter();
  const won = applyVoidCastleSplit(clearPhaseOne(castleState()));
  findUnit(won, won.missionRules.voidCastleTrial.realSummonerId).hp = 0;
  resolveVictory(won);

  const completed = completeCampaignMission(storage, VOID_CASTLE_MISSION_ID, won, {});

  assert.deepEqual(completed.newRewardUnits, ["nemesis"]);
  assert.equal(isUnitUnlocked("nemesis", storage), true);
  assert.equal(isUnitUnlocked("summoner", storage), false);
});

test("the battle music is the Summoner's theme", () => {
  assert.equal(musicKeyForMatchMode("campaign", VOID_CASTLE_MISSION_ID), "summonerBattle");
});

test("phase 1 walls the Summoner into the corner behind three Nemesis, two of them held back", () => {
  const match = castleState();
  const summoner = match.units.find((unit) => unit.player === 2 && unit.type === "summoner");
  const nemesis = match.units.filter((unit) => unit.player === 2 && unit.type === "nemesis");

  assert.equal(match.missionRules.voidCastleTrial.phase, 1);
  assert.equal(match.missionRules.voidCastleTrial.pendingSplit, false);
  assert.equal(match.missionRules.voidCastleTrial.realSummonerId, null);
  assert.deepEqual(summoner.position, { x: 12, y: 0 });
  assert.equal(summoner.skin, "void-dweller");
  assert.equal(summoner.hp, getUnitType("summoner").stats.maxHp);
  assert.equal(nemesis.length, 3);
  assert.deepEqual(nemesis.map((unit) => unit.hp), [10, 10, 10]);

  // Exactly one Nemesis greets the party; the other two appear when he "splits".
  assert.equal(nemesis.filter((unit) => unit.introHidden).length, 2);
  assert.equal(nemesis.filter((unit) => !unit.introHidden).length, 1);

  // The phase-1 Summoner is the genuine article, so his ghosts already speak truthfully.
  assert.equal(summoner.trialRealSummoner, true);
  assert.equal(summoner.ghostFakeArtNames, undefined);
  assert.deepEqual(summoner.ghostPool, [...VOID_CASTLE_GHOST_POOLS[0]]);
});

test("the opening beat reveals the two held-back Nemesis bodies", () => {
  const revealed = applyVoidCastleIntroBeat(castleState(), "voidCastleNemesisSplit");
  assert.equal(revealed.units.some((unit) => unit.introHidden), false);
  assert.equal(revealed.missionRules.voidCastleTrial.introComplete, true);
});

test("the ghost pools partition every summonable type with no overlap", () => {
  const summonable = Object.keys(UNIT_TYPES).filter((type) => {
    const definition = UNIT_TYPES[type];
    return type !== "summoner" &&
      !definition.summon &&
      !definition.commandOnly &&
      !definition.actsFirst;
  });

  const assigned = VOID_CASTLE_GHOST_POOLS.flatMap((pool) => [...pool]);
  assert.equal(assigned.length, new Set(assigned).size, "a type appears in two Summoners' pools");
  assert.deepEqual([...assigned].sort(), [...summonable].sort());
  for (const pool of VOID_CASTLE_GHOST_POOLS) assert.ok(pool.length >= 6 && pool.length <= 7);
});

test("no summon can ever call a commander — the King and Mother Nature are gated globally", () => {
  // Both carry actsFirst: a ghost that must be commanded before anything else on its side
  // would seize the owner's activation order for the turn it exists.
  const match = castleState();
  const summoner = match.units.find((unit) => unit.type === "summoner");

  for (const pool of VOID_CASTLE_GHOST_POOLS) {
    assert.equal(pool.includes("king"), false);
    assert.equal(pool.includes("mother-nature"), false);
  }

  // Soul Shuffle itself refuses them: hand it a pool of nothing BUT gated types plus one
  // legal unit, and the only thing it can offer is the legal one.
  const gated = { ...summoner, ghostPool: ["king", "mother-nature", "ghoul", "swordsman"] };
  const { choices } = getSoulShuffleChoices(gated, match.rngState);
  assert.deepEqual(choices, ["swordsman"]);
});

test("each decoy's fake ART names cover exactly the ARTS its own pool can cast", () => {
  VOID_CASTLE_GHOST_POOLS.forEach((pool, index) => {
    const fakeNames = VOID_CASTLE_GHOST_FAKE_NAMES[index];
    if (index === 0) {
      assert.equal(fakeNames, null, "the real Summoner's ghosts must not be renamed");
      return;
    }
    // Every art a ghost from this pool could fire is renamed...
    const poolArtIds = new Set();
    for (const type of pool) {
      const definition = getUnitType(type);
      for (const art of [...definition.arts, definition.rageArt].filter(Boolean)) {
        if (art.kind === "passive") continue;
        poolArtIds.add(art.id);
      }
    }
    for (const artId of poolArtIds) {
      assert.ok(fakeNames[artId], `pool ${index} is missing a fake name for "${artId}"`);
    }
    // ...and nothing is renamed that this pool can't actually cast (catches drift/typos).
    for (const artId of Object.keys(fakeNames)) {
      assert.ok(poolArtIds.has(artId), `pool ${index} renames "${artId}", which it cannot cast`);
    }
    // A fake name must actually differ from the real one.
    for (const type of pool) {
      const definition = getUnitType(type);
      for (const art of [...definition.arts, definition.rageArt].filter(Boolean)) {
        if (art.kind === "passive" || !fakeNames[art.id]) continue;
        assert.notEqual(fakeNames[art.id], art.name, `"${art.id}" fake name matches the real one`);
      }
    }
  });
});

test("a Summoner's ghost pool restricts Soul Shuffle to that pool", () => {
  const match = castleState();
  const summoner = match.units.find((unit) => unit.type === "summoner");
  const { choices } = getSoulShuffleChoices(summoner, match.rngState);

  assert.ok(choices.length > 0);
  for (const type of choices) {
    assert.ok(VOID_CASTLE_GHOST_POOLS[0].includes(type), `${type} is outside the real Summoner's pool`);
  }
});

test("felling the phase-1 squad does NOT end the match — it flags the split", () => {
  const match = clearPhaseOne(castleState());
  assert.equal(match.missionRules.voidCastleTrial.pendingSplit, true);
  assert.equal(match.missionRules.voidCastleTrial.phase, 1);
});

test("the split puts four full-strength Summoners back in the corner and reopens the match", () => {
  const split = applyVoidCastleSplit(clearPhaseOne(castleState()));
  const trial = split.missionRules.voidCastleTrial;
  const summoners = split.units.filter((unit) => unit.hp > 0 && unit.type === "summoner");
  const definition = getUnitType("summoner");

  assert.equal(split.phase, "playing", "the match must come back from the engine's victory");
  assert.equal(split.winner, null);
  assert.equal(trial.phase, 2);
  assert.equal(trial.pendingSplit, false);
  assert.equal(summoners.length, 4);

  const real = summoners.filter((unit) => unit.trialRealSummoner);
  const decoys = summoners.filter((unit) => unit.trialDecoySummoner);
  assert.equal(real.length, 1);
  assert.equal(decoys.length, 3);
  assert.equal(trial.realSummonerId, real[0].id);

  for (const summoner of summoners) {
    assert.equal(summoner.hp, definition.stats.maxHp);
    assert.equal(summoner.mp, definition.stats.maxMp);
    assert.equal(summoner.spent, false);
    assert.equal(summoner.skin, "void-dweller");
    assert.ok(summoner.ghostPool.length >= 6);
  }
  // The real one hands down no lies; each decoy hands down its own.
  assert.equal(real[0].ghostFakeArtNames, undefined);
  for (const decoy of decoys) assert.ok(decoy.ghostFakeArtNames);

  // No two Summoners share a pool, and no two stand on the same tile.
  const pools = summoners.map((unit) => unit.ghostPool.join(","));
  assert.equal(new Set(pools).size, 4);
  const tiles = summoners.map((unit) => `${unit.position.x},${unit.position.y}`);
  assert.equal(new Set(tiles).size, 4);
});

test("the split never lands a Summoner on an occupied tile", () => {
  const match = castleState();
  // Park the whole party in the enemy corner block before the split resolves.
  const party = match.units.filter((unit) => unit.player === 1);
  [{ x: 12, y: 0 }, { x: 11, y: 0 }, { x: 11, y: 1 }, { x: 12, y: 1 }].forEach((tile, index) => {
    party[index].position = { ...tile };
  });
  const split = applyVoidCastleSplit(clearPhaseOne(match));

  const occupied = new Map();
  for (const unit of split.units.filter((u) => u.hp > 0)) {
    const key = `${unit.position.x},${unit.position.y}`;
    assert.equal(occupied.has(key), false, `two living units share ${key}`);
    occupied.set(key, unit.id);
  }
  assert.equal(split.units.filter((u) => u.hp > 0 && u.type === "summoner").length, 4);
});

test("the Mystic's shout restores the living party and leaves the fallen fallen", () => {
  const match = clearPhaseOne(castleState());
  const party = match.units.filter((unit) => unit.player === 1);
  party[0].hp = 3;
  party[0].mp = 0;
  party[1].hp = 0; // fell during phase 1
  const healed = applyVoidCastlePartyHeal(match);

  const survivor = findUnit(healed, party[0].id);
  const fallen = findUnit(healed, party[1].id);
  assert.equal(survivor.hp, getUnitType(survivor.type).stats.maxHp);
  assert.ok(survivor.mp > 0);
  assert.equal(fallen.hp, 0, "a full heal must not resurrect the dead");
});

test("phase 2 is only won by felling the real Summoner — a decoy does nothing", () => {
  const split = applyVoidCastleSplit(clearPhaseOne(castleState()));
  const realId = split.missionRules.voidCastleTrial.realSummonerId;
  const decoys = split.units.filter((unit) => unit.trialDecoySummoner);

  // Cut down every decoy: the fight goes on.
  for (const decoy of decoys) findUnit(split, decoy.id).hp = 0;
  resolveVictory(split);
  assert.equal(split.winner, null);
  assert.equal(split.phase, "playing");

  // Fell the real one and the whole illusion drops with him.
  findUnit(split, realId).hp = 0;
  resolveVictory(split);
  assert.equal(split.winner, 1);
  assert.equal(split.phase, "complete");
});

test("felling the real Summoner collapses every surviving decoy with him", () => {
  const split = applyVoidCastleSplit(clearPhaseOne(castleState()));
  const realId = split.missionRules.voidCastleTrial.realSummonerId;

  findUnit(split, realId).hp = 0;
  resolveVictory(split);

  assert.equal(split.winner, 1);
  for (const decoy of split.units.filter((unit) => unit.trialDecoySummoner)) {
    assert.equal(decoy.hp, 0, "a decoy outlived the Summoner it was cast from");
  }
});

test("a wiped party loses in either phase", () => {
  const phaseOne = castleState();
  for (const unit of phaseOne.units) if (unit.player === 1) unit.hp = 0;
  resolveVictory(phaseOne);
  assert.equal(phaseOne.winner, 2);

  const phaseTwo = applyVoidCastleSplit(clearPhaseOne(castleState()));
  for (const unit of phaseTwo.units) if (unit.player === 1) unit.hp = 0;
  resolveVictory(phaseTwo);
  assert.equal(phaseTwo.winner, 2);
});

test("stars: win / no Nemesis RAGE / fell the true Summoner without felling a copy", () => {
  const split = applyVoidCastleSplit(clearPhaseOne(castleState()));
  findUnit(split, split.missionRules.voidCastleTrial.realSummonerId).hp = 0;
  resolveVictory(split);

  const clean = evaluateCampaignMission(VOID_CASTLE_MISSION_ID, split, {});
  assert.equal(clean.victory, true);
  assert.equal(clean.stars, 3);
  assert.equal(clean.bonusObjectives[0].earned, true, "the starter four earn the bonus");

  // The collapse of the decoys at the moment of victory must NOT cost the clean-solve star.
  assert.equal(clean.objectives.find((o) => o.id === "cleanSolve").earned, true);

  // Both signature objectives missed. The starter-four bonus still banks a star, so a
  // sloppy run with the original party lands on 2 — the bonus substitutes for a missed
  // star here exactly as it does on every other mission (stars = min(3, objectives + bonus)).
  const messy = evaluateCampaignMission(VOID_CASTLE_MISSION_ID, split, {
    voidCastleNemesisEnteredRage: true,
    voidCastleDecoyKilled: true,
  });
  assert.equal(messy.stars, 2);
  assert.equal(messy.objectives.find((o) => o.id === "noNemesisRage").earned, false);
  assert.equal(messy.objectives.find((o) => o.id === "cleanSolve").earned, false);
  assert.equal(messy.bonusObjectives[0].earned, true);

  // Same sloppy run without the starter four: the win alone, one star.
  const offSquad = applyVoidCastleSplit(clearPhaseOne(castleState(["monk", "gargoyle", "clod", "virus"])));
  findUnit(offSquad, offSquad.missionRules.voidCastleTrial.realSummonerId).hp = 0;
  resolveVictory(offSquad);
  const offSquadMessy = evaluateCampaignMission(VOID_CASTLE_MISSION_ID, offSquad, {
    voidCastleNemesisEnteredRage: true,
    voidCastleDecoyKilled: true,
  });
  assert.equal(offSquadMessy.bonusObjectives[0].earned, false);
  assert.equal(offSquadMessy.stars, 1);
  assert.equal(evaluateCampaignMission(VOID_CASTLE_MISSION_ID, offSquad, {}).stars, 3);
});

test("the split script drives the board changes and never explains the puzzle", () => {
  const split = clearPhaseOne(castleState());
  const lines = voidCastleSplitScript(split);
  const actions = lines.map((line) => line.afterAction).filter(Boolean);

  assert.deepEqual(actions, ["voidCastleSummonerSplit", "voidCastlePartyHeal"]);
  const text = lines.map((line) => line.text).join(" ");
  assert.doesNotMatch(text, /real|fake|decoy|copy is|ART name|ability name|listen to/i);
});

test("the opening and both cutscenes are authored and stay off the answer", () => {
  const opening = campaignOpeningScript(VOID_CASTLE_MISSION_ID, castleState());
  const brief = campaignMapCutsceneScript(VOID_CASTLE_MISSION_ID);
  const after = campaignPostMatchCutsceneScript(VOID_CASTLE_MISSION_ID);

  assert.ok(opening.length > 0);
  assert.ok(brief.length > 0);
  assert.ok(after.length > 0);

  // The brief sets the trap and the refused alliance; the payoff scene points south.
  assert.match(brief.map((l) => l.text).join(" "), /Blacksword/i);
  assert.match(after.map((l) => l.text).join(" "), /crystal|ice/i);

  // No script may hand the player the ghost-name tell.
  for (const script of [opening, brief, after]) {
    assert.doesNotMatch(script.map((l) => l.text).join(" "), /wrong name|misname|incorrect name/i);
  }
});

test("an opening line never speaks through a unit the player did not bring", () => {
  // The squad is player-chosen, so a hardcoded Swordsman/Mystic speaker would be a crash
  // or a ghost portrait. Every party line must resolve to a unit that is actually present.
  const squad = ["gargoyle", "clod", "treant", "monk"];
  const match = castleState(squad);
  const ids = new Set(match.units.filter((unit) => unit.player === 1).map((unit) => unit.id));

  for (const line of campaignOpeningScript(VOID_CASTLE_MISSION_ID, match)) {
    if (!line.speakerId) continue;
    assert.ok(ids.has(line.speakerId), `line speaks through absent unit ${line.speakerId}`);
  }
});
