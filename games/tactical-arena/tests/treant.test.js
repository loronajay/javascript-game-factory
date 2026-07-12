import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType, getAbilityUsesRemaining } from "../src/core/unitCatalog.js";
import { canUseArt } from "../src/rules/arts.js";
import { finalizeMagicDamage, getFireVulnerability, resolvePhysicalStrike } from "../src/rules/combat.js";
import { applyStatus, isPetrified } from "../src/rules/statuses.js";
import { getAbilityVfx, getStatusVfx } from "../src/ui/vfxCatalog.js";
import { generatePlans, toCommands } from "../src/ai/plans.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Combat is stochastic, so any test asserting an outcome pins the rolls.
const HIT = { attackRoll: 0.5, critRoll: 0.99 };            // lands, no crit
const CRIT = { attackRoll: 0.5, critRoll: 0.0 };            // lands + crit
const HIT_STATUS = { ...HIT, effectRoll: 0.0 };            // lands + status/heal applies

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

// Cycle a unit through a bare defend turn to hand the turn back.
function passDefend(state, player, id) {
  let s = run(state, beginActivation(player, id)).nextState;
  s = run(s, defend(player, id)).nextState;
  s = run(s, finishActivation(player, id)).nextState;
  return s;
}

test("Treant is registered with its tank stat block", () => {
  const def = getUnitType("treant");
  assert.equal(def.name, "Treant");
  assert.equal(def.classType, "tank");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 2, strength: 7, defense: 6, maxHp: 30, maxMp: 30 });
});

test("Enchanted Roots makes the Treant immune to poison but not other statuses", () => {
  const treant = findUnit(scenario([{ id: "treant", player: 1, type: "treant", x: 6, y: 6 }]), "treant");
  assert.equal(applyStatus(treant, { type: "poison", duration: "permanent" }).applied, false, "Enchanted Roots blocks poison");
  assert.equal(applyStatus(treant, { type: "slow", duration: 1 }).applied, true, "only poison is immune");
});

// --- Enchanted Roots (weather affinity + fire vulnerability) -----------------

test("Enchanted Roots: Snow grants +1 DEF", () => {
  const state = scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6 }], { weather: "blizzard" });
  assert.equal(getEffectiveStats(findUnit(state, "t"), state).defense, 6 + 1);
});

test("Enchanted Roots: Fire grants +2 STR / -1 DEF", () => {
  const state = scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6 }], { weather: "heatwave" });
  const stats = getEffectiveStats(findUnit(state, "t"), state);
  assert.equal(stats.strength, 7 + 2);
  assert.equal(stats.defense, 6 - 1);
});

test("Enchanted Roots: no weather leaves the base stat block", () => {
  const state = scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6 }]);
  const stats = getEffectiveStats(findUnit(state, "t"), state);
  assert.equal(stats.strength, 7);
  assert.equal(stats.defense, 6);
});

test("Enchanted Roots: Rain restores HP per turn rollover (stacking Spring's global restore bonus)", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 20 },
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ], { weather: "spring" });
  // Treant passes its turn; the rollover fires the regen. Spring ("Spring Shower") also
  // carries a global restoreBonus of +1, so the 1 HP regen lands as 2.
  const after = passDefend(state, 1, "t");
  assert.equal(findUnit(after, "t").hp, 22);
});

test("Enchanted Roots: fire vulnerability is +1", () => {
  const state = scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6 }]);
  assert.equal(getFireVulnerability(findUnit(state, "t")), 1);
});

test("Enchanted Roots: a fire tile deals 1 extra to the Treant", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 20 },
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ]);
  state.tileObjects["6,6"] = { kind: "fire", turnsLeft: 3 };
  const after = passDefend(state, 1, "t");
  assert.equal(findUnit(after, "t").hp, 20 - 2, "1 base fire + 1 vulnerability");
});

test("Enchanted Roots: fire-based magic deals +1 to the Treant", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6 },
    { id: "mage", type: "magician", player: 2, x: 8, y: 6 }
  ]);
  const t = findUnit(state, "t");
  const mage = findUnit(state, "mage");
  const withFire = finalizeMagicDamage({ attacker: mage, target: t, state, rawDamage: 6, art: { fireDamage: true } });
  const noFire = finalizeMagicDamage({ attacker: mage, target: t, state, rawDamage: 6, art: {} });
  assert.equal(withFire - noFire, 1);
});

// --- Grove Ward (magic reduction aura) --------------------------------------

test("Grove Ward: an ally takes 1 less magic damage while the Treant lives", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6 },
    { id: "ally", type: "swordsman", player: 1, x: 7, y: 6 },
    { id: "mage", type: "magician", player: 2, x: 9, y: 6 }
  ]);
  const mage = findUnit(state, "mage");
  const ally = findUnit(state, "ally");
  const reduced = finalizeMagicDamage({ attacker: mage, target: ally, state, rawDamage: 5 });
  assert.equal(reduced, 4, "Dead Zone-style -1 magic");
});

// --- Deep Roots (positional defense) ----------------------------------------

test("Deep Roots: +2 DEF when every enemy AND every other ally is inside attack range", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 7 }, // within range 2
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 8 }   // within range 2
  ]);
  assert.equal(getEffectiveStats(findUnit(state, "t"), state).defense, 6 + 2);
});

test("Deep Roots: only the ally half applies when an enemy sits outside attack range", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 7 }, // within range 2
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 11 }  // distance 5 > range 2
  ]);
  assert.equal(getEffectiveStats(findUnit(state, "t"), state).defense, 6 + 1);
});

test("Deep Roots: a lone Treant with no team earns no ally bonus", () => {
  const state = scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6 }]);
  assert.equal(getEffectiveStats(findUnit(state, "t"), state).defense, 6);
});

// --- Verdant Bond (crit slow + buff share) ----------------------------------

test("Verdant Bond: a critical basic attack slows the target 1 MOVE", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 7, hp: 25 }
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, { type: "ATTACK", player: 1, actorId: "t", targetId: "foe", ...CRIT }).nextState;
  const foe = findUnit(s, "foe");
  const slow = (foe.statuses ?? []).find((st) => st.type === "slow");
  assert.ok(slow, "foe is slowed on a crit");
  assert.equal(slow.statModifiers.moveRange, -1);
});

test("Verdant Bond: an ally buffed within 2 tiles shares the buff onto the Treant", () => {
  const state = scenario([
    { id: "ft", type: "father-time", player: 1, x: 5, y: 5, mp: 40 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "t", type: "treant", player: 1, x: 5, y: 7 } // 1 tile from the ally
  ]);
  let s = run(state, beginActivation(1, "ft")).nextState;
  s = run(s, useArt(1, "ft", "time-stretch", { targetId: "ally" })).nextState;
  const ally = findUnit(s, "ally");
  const treant = findUnit(s, "t");
  assert.ok((ally.statuses ?? []).some((st) => st.type === "empowered"), "ally is empowered");
  assert.ok((treant.statuses ?? []).some((st) => st.type === "empowered"), "Treant shares the buff");
});

// --- Ether (MP recovery banks +STR) -----------------------------------------

test("Ether: recovering MP banks a +2 STR buff applied on the next activation", () => {
  // Source Shift raises MP (HP 20 > MP 8): after paying 1/1 and swapping, MP 8 -> 19.
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 20, mp: 8 },
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "source-shift")).nextState;
  const shifted = findUnit(s, "t");
  assert.equal(shifted.mp, 19, "HP and MP swapped after the 1/1 cost");
  assert.ok(shifted.etherCharged, "Ether armed after MP went up");

  // Pass to the Treant's next turn and confirm the +2 STR lands.
  s = passDefend(s, 2, "foe");
  s = run(s, beginActivation(1, "t")).nextState;
  const treant = findUnit(s, "t");
  assert.ok((treant.statuses ?? []).some((st) => st.type === "empowered" && st.statModifiers.strength === 2));
  assert.equal(getEffectiveStats(treant, s).strength, 7 + 2);
});

// --- Enrich ------------------------------------------------------------------

test("Enrich: restores 3 MP to an ally (2 MP cost, cannot self-target)", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, mp: 30 },
    { id: "ally", type: "magician", player: 1, x: 6, y: 8, mp: 5 }
  ]);
  // Cannot target self.
  const selfCmd = applyCommand(run(state, beginActivation(1, "t")).nextState, useArt(1, "t", "enrich", { targetId: "t" }));
  assert.equal(selfCmd.accepted, false);

  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "enrich", { targetId: "ally" })).nextState;
  assert.equal(findUnit(s, "ally").mp, 8, "+3 MP");
  assert.equal(findUnit(s, "t").mp, 28, "-2 MP cost");
});

test("Enrich: restores 3 HP instead when the ally is at full MP", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, mp: 30 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 8, hp: 10 } // maxMp 20, starts full
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "enrich", { targetId: "ally" })).nextState;
  assert.equal(findUnit(s, "ally").hp, 13, "+3 HP because MP was full");
});

// --- Source Shift ------------------------------------------------------------

test("Source Shift: swaps HP and MP, costs 1/1, and is a finite 3-use resource", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 25, mp: 4 },
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "source-shift")).nextState;
  const t = findUnit(s, "t");
  // pay 1/1 -> hp24, mp3, then swap -> hp3, mp24.
  assert.equal(t.hp, 3);
  assert.equal(t.mp, 24);
  const art = getUnitType("treant").arts.find((a) => a.id === "source-shift");
  assert.equal(getAbilityUsesRemaining(t, art), 2, "one of three uses spent");
});

// --- Soul Sap ----------------------------------------------------------------

test("Soul Sap: an attack drains half the damage dealt back as MP", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, mp: 10 },
    { id: "foe", type: "nemesis", player: 2, x: 6, y: 7, hp: 25 } // DEF 2 -> 5 damage, restore round(2.5)=3
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  const result = run(s, useArt(1, "t", "soul-sap", { targetId: "foe", ...HIT_STATUS }));
  s = result.nextState;
  const t = findUnit(s, "t");
  // -2 cost + 3 drained MP = net +1 (10 -> 11).
  assert.equal(t.mp, 11);
  assert.equal(findUnit(s, "foe").hp, 20, "5 physical dealt");
});

// --- Petrify (RAGE) ----------------------------------------------------------

test("Petrify: only usable while raging", () => {
  const healthy = run(scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 30 }]), beginActivation(1, "t")).nextState;
  assert.equal(canUseArt(healthy, findUnit(healthy, "t"), "petrify"), false);

  const raging = run(scenario([{ id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 5 }]), beginActivation(1, "t")).nextState;
  assert.equal(canUseArt(raging, findUnit(raging, "t"), "petrify"), true);
});

test("Petrify: becomes an invulnerable statue that cannot act", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 7, hp: 25 }
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "petrify")).nextState;
  const t = findUnit(s, "t");
  assert.ok(isPetrified(t), "petrified status applied");
  assert.equal(t.petrified, 2, "2-turn countdown");
  // Invulnerable: a physical or magic strike deals 0.
  const foe = findUnit(s, "foe");
  assert.equal(resolvePhysicalStrike(foe, t, { state: s }).damage, 0);
  assert.equal(finalizeMagicDamage({ attacker: foe, target: t, state: s, rawDamage: 9 }), 0);
});

test("Petrify: a petrified Treant cannot open an activation", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ]);
  const t = findUnit(state, "t");
  t.statuses = [{ type: "petrified", duration: "permanent" }];
  t.petrified = 2;
  const rejected = applyCommand(state, beginActivation(1, "t"));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.errorCode, "UNIT_SPENT");
});

test("Petrify: each of the Treant's turns the statue restores itself and its aura drains enemies", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 5, mp: 10 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 7, hp: 10 }, // within 2
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, hp: 12 }   // within 2
  ]);
  // Treant petrifies, then the ally finishes P1's turn, handing off to P2.
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "petrify")).nextState;
  s = passDefend(s, 1, "ally");
  // P2 passes; the rollover into P1's NEXT turn fires the petrify pulse + countdown.
  s = run(s, beginActivation(2, "foe")).nextState;
  s = run(s, defend(2, "foe")).nextState;
  const pulseResult = run(s, finishActivation(2, "foe"));
  const s2 = pulseResult.nextState;

  const pulse = pulseResult.events.find((e) => e.type === "PETRIFY_PULSE");
  assert.ok(pulse, "a petrify pulse fired at the rollover into P1");
  const t = findUnit(s2, "t");
  assert.equal(t.petrified, 1, "countdown decremented (one of the Treant's two turns)");
  assert.equal(t.hp, 6, "statue restored 1 HP");
  assert.equal(t.mp, 11, "statue restored 1 MP");
  assert.equal(findUnit(s2, "ally").hp, 11, "ally within 2 restored 1 HP");
  assert.equal(findUnit(s2, "foe").hp, 11, "enemy within 2 drained 1 HP");
});

test("Petrify: wakes after exactly 2 of the Treant's turn cycles", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, hp: 5, mp: 10 },
    { id: "ally", type: "swordsman", player: 1, x: 0, y: 0 }, // out of aura range, keeps P1 alive
    { id: "foe", type: "swordsman", player: 2, x: 1, y: 1 }
  ]);
  let s = run(state, beginActivation(1, "t")).nextState;
  s = run(s, useArt(1, "t", "petrify")).nextState;
  // Two full missed turns: each round the statue is auto-spent when P1 comes around. After
  // the second, the countdown hits 0 and the petrified marker lifts.
  for (let round = 0; round < 2; round += 1) {
    s = passDefend(s, 1, "ally");
    s = passDefend(s, 2, "foe");
  }
  assert.ok(!isPetrified(findUnit(s, "t")), "no longer petrified after 2 turn cycles");
  // The turn the counter hit 0 was still auto-spent, so the Treant takes its next full turn
  // (the 3rd cycle) — one more round brings it around, now free to act.
  s = passDefend(s, 1, "ally");
  s = passDefend(s, 2, "foe");
  assert.equal(applyCommand(s, beginActivation(1, "t")).accepted, true);
});

// --- CPU / VFX guards --------------------------------------------------------

test("every Treant plan replays cleanly through the reducer", () => {
  const state = scenario([
    { id: "t", type: "treant", player: 1, x: 6, y: 6, mp: 30 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 7, hp: 10, mp: 4 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 8, hp: 20 }
  ]);
  const plans = generatePlans(state, findUnit(state, "t"));
  assert.ok(plans.length > 0);
  for (const plan of plans) {
    let s = run(state, beginActivation(1, "t")).nextState;
    for (const command of toCommands(1, plan)) {
      const result = applyCommand(s, command);
      assert.ok(result.accepted, `plan command ${command.type} rejected (${result.errorCode})`);
      s = result.nextState;
    }
  }
});

test("Treant arts declare VFX recipes and the petrified status has a badge", () => {
  for (const id of ["enrich", "source-shift", "soul-sap", "petrify"]) {
    assert.ok(getAbilityVfx(id), `${id} should have a VFX recipe`);
  }
  assert.equal(getAbilityVfx("soul-sap").type, "drain");
  assert.equal(getAbilityVfx("soul-sap").colors.core, "#8cc8ff");
  assert.ok(getStatusVfx("petrified"), "petrified status has a badge");
});
