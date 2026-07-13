import test from "node:test";
import assert from "node:assert/strict";

import {
  FINAL_BATTLE_BOSS_HP,
  FINAL_BATTLE_BOSS_ID,
  FINAL_BATTLE_BOSS_STRENGTH,
  FINAL_BATTLE_DUEL_BOARD_SIZE,
  FINAL_BATTLE_DUEL_HP,
  FINAL_BATTLE_MISSION_ID,
  MAX_CAMPAIGN_MISSIONS,
  createCampaignMatchConfig,
  campaignRestrictedUnitTypes,
  campaignSelectableUnitTypes,
  evaluateCampaignMission,
  getCampaignMission,
  prepareCampaignMatchState,
  campaignOpeningScript,
  campaignPostMatchCutsceneScript,
  finalBattleDefeatScript,
  finalBattleDuelScript,
} from "../src/campaign/campaign.js";
import {
  FINAL_BATTLE_DUEL_COUNT,
  FINAL_BATTLE_STAGE_LAST_STAND,
  advanceFinalBattleStage,
  getFinalBattleRules,
} from "../src/campaign/missions/the-final-battle/stages.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { applyCommand } from "../src/core/reducer.js";
import { resolveVictory } from "../src/core/turnEngine.js";
import { getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getAttackSplashDamage } from "../src/rules/combat.js";
import { musicKeyForMatchMode } from "../src/audio/sounds.js";

const SQUAD = ["swordsman", "archer", "mystic", "magician"];

function finalBattleState(squad = SQUAD) {
  return prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(FINAL_BATTLE_MISSION_ID, squad)),
    FINAL_BATTLE_MISSION_ID,
  );
}

// Walks the mission the way a winning player does: through all four duels and into the last
// stand, killing each mirror outright rather than playing the duel out.
function playToLastStand(state) {
  let next = advanceFinalBattleStage(state); // confrontation -> duel 1
  for (let duel = 1; duel <= FINAL_BATTLE_DUEL_COUNT; duel += 1) {
    const mirror = next.units.find((unit) => unit.player === 2);
    mirror.hp = 0;
    resolveVictory(next);
    next = advanceFinalBattleStage(next);
  }
  return next;
}

test("The Final Battle is the last stop on the trail, at the void gate, rewarding Blacksword", () => {
  const mission = getCampaignMission(FINAL_BATTLE_MISSION_ID);

  assert.equal(mission.title, "The Final Battle");
  assert.equal(mission.locationName, "The Void Gate");
  assert.equal(mission.playerSlots, 4);
  assert.equal(mission.requiresPreviousMissionsComplete, true);
  assert.deepEqual([...mission.rewardUnits], ["blacksword"]);
  assert.equal(MAX_CAMPAIGN_MISSIONS, 22);

  // The blackout, the mirror duels, and the split of the party are the mission. The brief
  // must not hand any of them to the player in advance.
  assert.doesNotMatch(mission.description, /duel|mirror|copy|copies|blackout|dark|stage|100/i);
});

test("the battle music is the final battle theme", () => {
  assert.equal(musicKeyForMatchMode("campaign", FINAL_BATTLE_MISSION_ID), "finalBattle");
});

test("the King cannot be brought — every party member has to survive a solo duel", () => {
  // A non-combatant commander has no way to fight a 1v1, and a lone King does not sustain a
  // victory — he would hand the duel away the moment it started.
  assert.deepEqual(campaignRestrictedUnitTypes(undefined, FINAL_BATTLE_MISSION_ID), ["king"]);
  assert.ok(!campaignSelectableUnitTypes(undefined, undefined, FINAL_BATTLE_MISSION_ID).includes("king"));
  // Mission-scoped, not global: no other mission locks him out for this reason.
  assert.ok(!campaignRestrictedUnitTypes(undefined, "the-showdown").includes("king"));
});

// --- Stage 0: the confrontation -------------------------------------------------------

test("the mission opens with Blacksword alone in the middle of the board", () => {
  const state = finalBattleState();
  const rules = getFinalBattleRules(state);
  const boss = state.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);

  assert.equal(rules.stage, 0);
  assert.equal(rules.lastStage, FINAL_BATTLE_STAGE_LAST_STAND);
  assert.deepEqual([...rules.duelTypes], SQUAD);
  assert.deepEqual(boss.position, { x: 5, y: 5 });
  assert.equal(state.units.filter((unit) => unit.player === 1).length, 4);
  assert.equal(state.units.filter((unit) => unit.player === 2).length, 1);
});

test("the boss is a granted stat block, not a re-tuned unit — the drafted Blacksword is untouched", () => {
  const state = finalBattleState();
  const boss = state.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);
  const stats = getEffectiveStats(boss, state);

  assert.equal(boss.hp, FINAL_BATTLE_BOSS_HP);
  assert.equal(stats.maxHp, FINAL_BATTLE_BOSS_HP);
  assert.equal(stats.strength, FINAL_BATTLE_BOSS_STRENGTH);
  assert.equal(boss.skin, "void-dweller");

  // The unit the player is about to unlock keeps its own numbers.
  const definition = getUnitType("blacksword");
  assert.equal(definition.stats.maxHp, 30);
  assert.equal(definition.stats.strength, 10);
});

test("Void Reach is granted to the one body, not to the unit type", () => {
  const state = finalBattleState();
  const boss = state.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);
  const splash = getAttackSplashDamage(boss);

  assert.equal(splash.amount, 3);
  assert.equal(splash.radius, 1);
  assert.deepEqual({ ...splash.affinityBonus }, { affinity: "dark", amount: 1 });

  // A plain Blacksword — the one the player unlocks — carries no splash at all.
  assert.equal(getAttackSplashDamage({ type: "blacksword" }), null);
});

// --- Stages 1-4: the mirror duels -----------------------------------------------------

test("the first duel is your slot-one unit against a copy of itself, alone on a 5x5 at 10 HP", () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  const rules = getFinalBattleRules(duel);
  const champion = duel.units.find((unit) => unit.player === 1);
  const mirror = duel.units.find((unit) => unit.player === 2);

  assert.equal(rules.stage, 1);
  assert.equal(duel.size, FINAL_BATTLE_DUEL_BOARD_SIZE);
  assert.equal(duel.units.length, 2);
  assert.equal(champion.type, SQUAD[0]);
  assert.equal(mirror.type, SQUAD[0]);
  assert.equal(mirror.finalBattleMirror, true);
  assert.equal(champion.hp, FINAL_BATTLE_DUEL_HP);
  assert.equal(mirror.hp, FINAL_BATTLE_DUEL_HP);
  // Opposite corners of the small board: nowhere to hide.
  assert.deepEqual(champion.position, { x: 0, y: 4 });
  assert.deepEqual(mirror.position, { x: 4, y: 0 });

  // The rest of the party — and Blacksword — are off the board entirely, not merely hidden.
  // Anything left standing on it would feed auras, line of sight, AI targeting, and victory.
  assert.equal(rules.bench.length, 4);
  assert.ok(rules.bench.some((unit) => unit.id === FINAL_BATTLE_BOSS_ID));
});

test("the duels run in squad-slot order, one per party member", () => {
  let state = advanceFinalBattleStage(finalBattleState());
  for (let duel = 1; duel <= FINAL_BATTLE_DUEL_COUNT; duel += 1) {
    assert.equal(getFinalBattleRules(state).stage, duel);
    assert.equal(state.units.find((unit) => unit.player === 1).type, SQUAD[duel - 1]);
    state = advanceFinalBattleStage(state);
  }
  assert.equal(getFinalBattleRules(state).stage, FINAL_BATTLE_STAGE_LAST_STAND);
});

test("winning a duel does not end the match — it flags the next stage instead", () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 2).hp = 0;
  resolveVictory(duel);

  // The engine has to complete: a side with no living bodies stalls the turn loop. main.js
  // reverts this synchronously and drives the blackout off `pendingStage`.
  assert.equal(duel.phase, "complete");
  assert.equal(duel.winner, 1);
  assert.equal(getFinalBattleRules(duel).pendingStage, true);
});

test("losing a duel loses the mission — the copy takes your place", () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  duel.units.find((unit) => unit.player === 1).hp = 0;
  resolveVictory(duel);

  assert.equal(duel.phase, "complete");
  assert.equal(duel.winner, 2);
  assert.equal(getFinalBattleRules(duel).pendingStage, false);
});

// --- Stage 5: the last stand ----------------------------------------------------------

test("the last stand brings all four back whole against Blacksword in the far corner", () => {
  const last = playToLastStand(finalBattleState());
  const rules = getFinalBattleRules(last);
  const party = last.units.filter((unit) => unit.player === 1);
  const boss = last.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);

  assert.equal(rules.stage, FINAL_BATTLE_STAGE_LAST_STAND);
  assert.equal(last.size, 11);
  assert.equal(party.length, 4);
  assert.deepEqual(party.map((unit) => unit.type), SQUAD);
  // Whole: four duels at 10 HP would otherwise leave a party that cannot fight a 100 HP boss.
  for (const unit of party) {
    assert.equal(unit.hp, getUnitType(unit.type).stats.maxHp);
  }
  assert.deepEqual(boss.position, { x: 10, y: 0 });
  assert.equal(boss.hp, FINAL_BATTLE_BOSS_HP);
  assert.equal(getFinalBattleRules(last).pendingStage, false);
});

test("felling Blacksword on the last stand actually ends the match", () => {
  const last = playToLastStand(finalBattleState());
  last.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID).hp = 0;
  resolveVictory(last);

  assert.equal(last.phase, "complete");
  assert.equal(last.winner, 1);
  // No further stage: this is the end of the road, not another blackout.
  assert.equal(getFinalBattleRules(last).pendingStage, false);
});

// --- Void Reach ------------------------------------------------------------------------

test("Void Reach hits the target's neighbours for 3 true, +1 on a dark tile", () => {
  const state = playToLastStand(finalBattleState());
  const boss = state.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);
  const [target, onDark, onLight, far] = state.units.filter((unit) => unit.player === 1);

  // Tile affinity is board parity: an even x+y is light, an odd one is dark. Both neighbours
  // are adjacent to the TARGET (that is what the reach measures from — not from Blacksword).
  boss.position = { x: 4, y: 4 };
  target.position = { x: 5, y: 4 };
  onDark.position = { x: 6, y: 5 };  // 6+5 = 11, dark
  onLight.position = { x: 5, y: 5 }; // 5+5 = 10, light
  far.position = { x: 0, y: 0 };
  const darkHpBefore = onDark.hp;
  const lightHpBefore = onLight.hp;
  const farHpBefore = far.hp;
  state.currentPlayer = 2;

  const result = applyCommand(state, {
    type: "BEGIN_ACTIVATION", player: 2, unitId: boss.id,
  });
  assert.equal(result.accepted, true);
  // Force a landed, non-critical swing (a high roll hits; a high crit roll does not crit) so
  // the splash under test is Void Reach's and not a crit rider's.
  const attack = applyCommand(result.nextState, {
    type: "ATTACK", player: 2, actorId: boss.id, targetId: target.id, attackRoll: 0.99, critRoll: 0.99,
  });
  assert.equal(attack.accepted, true);

  const splash = (attack.events ?? []).find((event) => event.type === "ATTACK_SPLASH");
  assert.ok(splash, "the splash fires on a landed basic attack, not only on a crit");
  assert.equal(splash.damageByTarget[onLight.id], 3);
  assert.equal(splash.damageByTarget[onDark.id], 4); // 3 + 1 for standing on the dark
  assert.ok(!splash.targetIds.includes(far.id));

  const byId = (id) => attack.nextState.units.find((unit) => unit.id === id);
  assert.equal(byId(onLight.id).hp, lightHpBefore - 3);
  assert.equal(byId(onDark.id).hp, darkHpBefore - 4);
  assert.equal(byId(far.id).hp, farHpBefore, "a unit outside the reach takes nothing");
});

// --- Banish: the edge case he wins ----------------------------------------------------

test("Banish taking the whole party with him is a LOSS, not a stalled board", () => {
  const state = playToLastStand(finalBattleState());
  const boss = state.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);

  // Banish is selfKill: he spends every point of his own HP. If it catches all four, NOBODY
  // is left standing — and a naive "one team has living units" check would find no team at
  // all and stall the match forever. The party is what had to survive, so this resolves as a
  // defeat.
  for (const unit of state.units.filter((unit) => unit.player === 1)) unit.hp = 0;
  boss.hp = 0;
  resolveVictory(state);

  assert.equal(state.phase, "complete");
  assert.equal(state.winner, 2);
});

// --- The talking ------------------------------------------------------------------------

test("the opening blacks the screen out and drives straight into the first duel", () => {
  const state = finalBattleState();
  const script = campaignOpeningScript(FINAL_BATTLE_MISSION_ID, state);
  const actions = script.map((line) => line.afterAction).filter(Boolean);

  assert.ok(script.length > 0);
  // Hold the black, keep talking on it, then build the duel and fade back in.
  assert.deepEqual(actions, ["finalBattleBlackoutHold", "finalBattleBlackoutDuel"]);
  // The slot-one unit is the one who asks what happened — not a hardcoded Swordsman.
  const slotOne = state.units.find((unit) => unit.player === 1 && unit.type === SQUAD[0]);
  assert.ok(script.some((line) => line.speakerId === slotOne.id && /GUYS/.test(line.text)));
});

test("the slot-one beat follows the player's actual squad order", () => {
  const squad = ["magician", "mystic", "archer", "swordsman"];
  const state = finalBattleState(squad);
  const script = campaignOpeningScript(FINAL_BATTLE_MISSION_ID, state);
  const magician = state.units.find((unit) => unit.player === 1 && unit.type === "magician");

  assert.ok(script.some((line) => line.speakerId === magician.id && /GUYS/.test(line.text)));
});

test("the duel beat is spoken by the duelist and its copy", () => {
  const duel = advanceFinalBattleStage(finalBattleState());
  const script = finalBattleDuelScript(duel);
  const champion = duel.units.find((unit) => unit.player === 1);
  const mirror = duel.units.find((unit) => unit.player === 2);

  assert.ok(script.some((line) => line.speakerId === champion.id));
  assert.ok(script.some((line) => line.speakerId === mirror.id));
});

test("the killing blow gets its beat, and the ending sends the void beings home", () => {
  const last = playToLastStand(finalBattleState());
  const defeat = finalBattleDefeatScript(last);
  const ending = campaignPostMatchCutsceneScript(FINAL_BATTLE_MISSION_ID);
  const endingText = ending.map((line) => line.text).join(" ");

  assert.match(defeat.map((line) => line.text).join(" "), /What ARE you\?/);
  assert.match(defeat.map((line) => line.text).join(" "), /wretched place/i);

  // The Summoner and Nemesis follow him through the gate.
  assert.ok(ending.some((line) => line.speaker === "summoner"));
  assert.ok(ending.some((line) => line.speaker === "nemesis"));
  // And the player is pointed at what is left to play: online, and the skin store to come.
  assert.match(endingText, /ONLINE VERSUS/);
  assert.match(endingText, /skin store/i);
});

// --- Grading ----------------------------------------------------------------------------

test("winning the finale is a flat three stars with no bonus star", () => {
  const last = playToLastStand(finalBattleState());
  last.units.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID).hp = 0;
  resolveVictory(last);

  const win = evaluateCampaignMission(FINAL_BATTLE_MISSION_ID, last, {});
  assert.equal(win.victory, true);
  assert.equal(win.stars, 3);
  assert.equal(win.bonusObjectives.length, 0);
  assert.equal(win.earnedBonusStars, 0);
  assert.deepEqual([...win.rewardUnits], ["blacksword"]);

  const loss = evaluateCampaignMission(FINAL_BATTLE_MISSION_ID, { ...last, winner: 2 }, {});
  assert.equal(loss.stars, 0);
  assert.deepEqual([...loss.rewardUnits], []);
});
