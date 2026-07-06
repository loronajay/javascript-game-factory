import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, useArt } from "../src/core/commands.js";
import { getArt, getArtMpCost, getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

const MISS = { attackRoll: 0.01 };
const HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

test("Fat Wizard is registered with his mage stat block and arts", () => {
  const def = getUnitType("fat-wizard");
  assert.equal(def.name, "Fat Wizard");
  assert.equal(def.classType, "mage");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 3, strength: 7, defense: 7, maxHp: 30, maxMp: 35 });
  assert.deepEqual(def.arts.map((art) => art.id), ["zap", "study", "surge", "relay-power", "brothers-in-arms"]);
});

test("Study locks onto one enemy, adds Fat Wizard damage, and leeches HP/MP from magic damage", () => {
  const state = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, hp: 20, mp: 20 },
    { id: "studied", type: "swordsman", player: 2, x: 5, y: 8 },
    { id: "other", type: "swordsman", player: 2, x: 6, y: 8 }
  ]);

  let s = run(state, beginActivation(1, "fw")).nextState;
  let studied = run(s, useArt(1, "fw", "study", { targetId: "studied" }));
  assert.equal(findUnit(studied.nextState, "fw").studiedTargetId, "studied");

  studied.nextState.currentPlayer = 1;
  findUnit(studied.nextState, "fw").spent = false;
  s = run(studied.nextState, beginActivation(1, "fw")).nextState;
  const locked = applyCommand(s, useArt(1, "fw", "study", { targetId: "other" }));
  assert.equal(locked.accepted, false, "Study is unusable while the studied target lives");

  const zap = run(s, useArt(1, "fw", "zap", { targetId: "studied", ...HIT }));
  const fw = findUnit(zap.nextState, "fw");
  assert.equal(findUnit(zap.nextState, "studied").hp, 19, "5 magic + 1 Study damage");
  assert.equal(fw.hp, 22, "magic damage to the studied target restores 2 HP");
  assert.equal(fw.mp, 17, "Zap costs 5 MP, then Study restores 2 MP");
  assert.deepEqual(zap.events.filter((event) => event.type === "STUDY_LEECH").map((event) => event.targetId), ["studied"]);
});

test("Clumsy: a missed Zap splashes nearby allies and foes around the original target", () => {
  const state = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5 },
    { id: "target", type: "swordsman", player: 2, x: 5, y: 9 },
    { id: "near-foe", type: "swordsman", player: 2, x: 6, y: 9 },
    { id: "near-ally", type: "swordsman", player: 1, x: 4, y: 8 },
    { id: "far", type: "swordsman", player: 2, x: 7, y: 9 }
  ]);
  let s = run(state, beginActivation(1, "fw")).nextState;
  const result = run(s, useArt(1, "fw", "zap", { targetId: "target", ...MISS }));

  assert.equal(findUnit(result.nextState, "target").hp, 25, "the missed target is not splashed");
  assert.equal(findUnit(result.nextState, "near-foe").hp, 23);
  assert.equal(findUnit(result.nextState, "near-ally").hp, 23);
  assert.equal(findUnit(result.nextState, "far").hp, 25);
  assert.deepEqual(result.events[0].splashDamageByTarget, { "near-foe": 2, "near-ally": 2 });
});

test("Zap crit silences normally, but raging Lazy Cast makes Zap free, stronger, splashy, and stunning", () => {
  const normal = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5 },
    { id: "target", type: "swordsman", player: 2, x: 5, y: 9 },
    { id: "near", type: "swordsman", player: 2, x: 6, y: 9 }
  ]);
  let s = run(normal, beginActivation(1, "fw")).nextState;
  let result = run(s, useArt(1, "fw", "zap", { targetId: "target", ...CRIT }));
  assert.equal(findUnit(result.nextState, "target").hp, 17, "crit Zap deals ceil(5 * 1.5) magic");
  assert.deepEqual(findUnit(result.nextState, "target").statuses.map((status) => status.type), ["silence"]);
  assert.equal(findUnit(result.nextState, "near").hp, 22, "crit Zap splashes 3 magic");

  const raging = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, hp: 5, mp: 0 },
    { id: "idle", type: "swordsman", player: 1, x: 2, y: 2 },
    { id: "target", type: "swordsman", player: 2, x: 5, y: 9 },
    { id: "near", type: "swordsman", player: 2, x: 6, y: 9 }
  ]);
  assert.equal(isRaging(findUnit(raging, "fw")), true);
  assert.equal(getArtMpCost(findUnit(raging, "fw"), getArt("fat-wizard", "zap"), raging), 0);
  s = run(raging, beginActivation(1, "fw")).nextState;
  result = run(s, useArt(1, "fw", "zap", { targetId: "target", ...CRIT }));
  assert.equal(findUnit(result.nextState, "target").hp, 13, "Lazy Cast increases Zap to 8 before crit");
  assert.deepEqual(findUnit(result.nextState, "target").statuses.map((status) => status.type), ["stun"]);
  assert.equal(findUnit(result.nextState, "near").hp, 22);
  assert.equal(findUnit(result.nextState, "fw").mp, 0);
});

test("Surge heals one ally and Clumsy restores nearby units on miss, crit, and raging hit", () => {
  const state = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, mp: 20 },
    { id: "target", type: "swordsman", player: 1, x: 5, y: 9, hp: 10 },
    { id: "near-ally", type: "swordsman", player: 1, x: 6, y: 9, hp: 10 },
    { id: "near-foe", type: "swordsman", player: 2, x: 4, y: 8, hp: 10 }
  ]);
  let s = run(state, beginActivation(1, "fw")).nextState;
  let result = run(s, useArt(1, "fw", "surge", { targetId: "target", ...MISS }));
  assert.equal(findUnit(result.nextState, "target").hp, 10, "missed Surge does not heal the target");
  assert.equal(findUnit(result.nextState, "near-ally").hp, 12);
  assert.equal(findUnit(result.nextState, "near-foe").hp, 12);

  const critState = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, mp: 20 },
    { id: "target", type: "swordsman", player: 1, x: 5, y: 9, hp: 10 },
    { id: "near", type: "swordsman", player: 2, x: 6, y: 9, hp: 10 }
  ]);
  s = run(critState, beginActivation(1, "fw")).nextState;
  result = run(s, useArt(1, "fw", "surge", { targetId: "target", ...CRIT }));
  assert.equal(findUnit(result.nextState, "target").hp, 15);
  assert.equal(findUnit(result.nextState, "near").hp, 12);

  const raging = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, hp: 5, mp: 0 },
    { id: "target", type: "swordsman", player: 1, x: 5, y: 9, hp: 10 },
    { id: "near", type: "swordsman", player: 2, x: 6, y: 9, hp: 10 }
  ]);
  s = run(raging, beginActivation(1, "fw")).nextState;
  result = run(s, useArt(1, "fw", "surge", { targetId: "target", ...HIT }));
  assert.equal(findUnit(result.nextState, "target").hp, 14);
  assert.equal(findUnit(result.nextState, "near").hp, 12, "Lazy Cast splashes Surge healing on any hit");
  assert.equal(findUnit(result.nextState, "fw").mp, 0);
});

test("Relay Power transfers 2 HP and 2 MP from Fat Wizard to an ally", () => {
  const state = scenario([
    { id: "fw", type: "fat-wizard", player: 1, x: 5, y: 5, hp: 20, mp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 8, hp: 10, mp: 3 }
  ]);
  let s = run(state, beginActivation(1, "fw")).nextState;
  const result = run(s, useArt(1, "fw", "relay-power", { targetId: "ally" }));

  assert.equal(findUnit(result.nextState, "fw").hp, 18);
  assert.equal(findUnit(result.nextState, "fw").mp, 18);
  assert.equal(findUnit(result.nextState, "ally").hp, 12);
  assert.equal(findUnit(result.nextState, "ally").mp, 5);
});

test("Brothers in Arms is authored as Fat Wizard's team-composition passive", () => {
  const art = getUnitType("fat-wizard").arts.find((entry) => entry.id === "brothers-in-arms");
  assert.deepEqual(art.effect.requiredTypes, ["fat-knight", "fat-cleric", "fat-bowman"]);
  assert.deepEqual(art.effect.stats, { strength: 1 });
  assert.deepEqual(art.effect.sourceDamage, { magic: 1 });
});

test("Fat Wizard's active ARTS register VFX recipes", () => {
  assert.equal(getAbilityVfx("zap").type, "projectileFan");
  assert.equal(getAbilityVfx("study").type, "statusStrike");
  assert.equal(getAbilityVfx("surge").type, "healPulse");
  assert.equal(getAbilityVfx("relay-power").type, "healPulse");
});
