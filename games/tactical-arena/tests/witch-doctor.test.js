import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES, getArt, getEffectiveStats } from "../src/core/unitCatalog.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { isFireDamageImmune, resolvePhysicalStrike } from "../src/rules/combat.js";
import { buffAlliesValue } from "../src/ai/evaluate.js";
import { chooseActivation } from "../src/ai/cpuController.js";
import { getAbilityVfx, getStanceVfx } from "../src/ui/vfxCatalog.js";

// The Witch Doctor is a dance-caster whose "Dancing Man" passive is a persistent
// STANCE set by the dance it used last. These tests build their own fixtures (never
// the default corner spawns) and drive real commands through the reducer, so they
// prove the stance seams end to end rather than the data in isolation.

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.0 };

function findId(state, id) {
  return state.units.find((u) => u.id === id);
}

function activate(state, unitId) {
  const player = state.units.find((u) => u.id === unitId).player;
  const r = applyCommand(state, beginActivation(player, unitId));
  assert.ok(r.accepted, `beginActivation ${unitId} failed: ${r.errorCode}`);
  return r.nextState;
}

// --- Catalog / registration ---

test("Witch Doctor is registered with the scoped stat block", () => {
  const wd = UNIT_TYPES["witch-doctor"];
  assert.ok(wd, "witch-doctor missing from UNIT_TYPES");
  assert.equal(wd.stats.maxHp, 24);
  assert.equal(wd.stats.maxMp, 30);
  assert.equal(wd.stats.moveRange, 2);
  assert.equal(wd.stats.attackRange, 4);
  assert.equal(wd.stats.strength, 8);
  assert.equal(wd.stats.defense, 3);
});

test("Witch Doctor has Dancing Man + five dances (Black Death rage-locked)", () => {
  const wd = UNIT_TYPES["witch-doctor"];
  assert.equal(wd.passive.id, "dancing-man");
  assert.equal(wd.passive.effect.type, "stanceSystem");
  const actives = wd.arts.filter((a) => a.kind === "active").map((a) => a.id);
  assert.deepEqual(actives, ["rain-dance", "fire-dance", "spirit-dance", "misfortune-dance", "black-death-dance"]);
  assert.equal(getArt("witch-doctor", "black-death-dance").rageLocked, true);
  // Every dance declares its stance and a valid CPU intent.
  for (const art of wd.arts.filter((a) => a.kind === "active")) {
    assert.ok(art.stance, `${art.id} must name a stance`);
    assert.ok(art.ai?.intent, `${art.id} must declare ai.intent`);
  }
});

// --- Dancing Man: stance is set by the last dance and persists ---

test("each dance sets the Witch Doctor's stance, spends MP, and ends the activation", () => {
  const cases = [
    ["rain-dance", "rain", 2],
    ["fire-dance", "fire", 3],
    ["spirit-dance", "spirit", 0],
    ["misfortune-dance", "misfortune", 5]
  ];
  for (const [artId, stance, cost] of cases) {
    const state = createBattleState({
      units: [
        { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
        { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
        { id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }
      ]
    });
    const s = activate(state, "wd");
    const r = applyCommand(s, useArt(1, "wd", artId));
    assert.ok(r.accepted, `${artId} rejected: ${r.errorCode}`);
    const wd = findId(r.nextState, "wd");
    assert.equal(wd.stance, stance, `${artId} should enter ${stance}`);
    assert.equal(wd.mp, 30 - cost, `${artId} MP`);
    assert.equal(wd.spent, true, `${artId} spends the activation`);
  }
});

// --- Rain Dance / Rain Stance ---

test("Rain Dance heals every ally for 1 and enters Rain Stance", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0, hp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });
  const s = activate(state, "wd");
  const r = applyCommand(s, useArt(1, "wd", "rain-dance"));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "ally").hp, 11, "ally healed 1 from neutral (no bonus yet)");
  assert.equal(findId(r.nextState, "wd").stance, "rain");
});

test("Rain Stance adds +1 to every heal globally (a Mystic's Wish heals 2)", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "rain" },
      { id: "mystic", player: 1, type: "mystic", x: 1, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 2, y: 0, hp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const s = activate(state, "mystic");
  const r = applyCommand(s, useArt(1, "mystic", "wish"));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "ally").hp, 12, "Wish's base 1 + Rain's global +1");
});

test("Rain Stance: attacking charges +2 MOVE, consumed as a buff next activation", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "rain" },
      { id: "foe", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const s = activate(state, "wd");
  const r = applyCommand(s, attack(1, "wd", "foe", NORMAL_HIT));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "wd").rainCharged, 2, "attack charges the haste");

  // The charge becomes a live +MOVE buff at the Witch Doctor's next begin-activation.
  const fresh = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 3, y: 3, rainCharged: 2 },
      { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const opened = activate(fresh, "wd");
  const wd = findId(opened, "wd");
  assert.equal(wd.rainCharged, 0, "charge is consumed");
  assert.equal(getEffectiveStats(wd, opened).moveRange, 2 + 2, "haste buff is live this turn");
});

// --- Fire Stance ---

test("Fire Stance raises the Witch Doctor's STR to 9", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "fire" },
      { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  assert.equal(getEffectiveStats(findId(state, "wd"), state).strength, 9);
});

test("Fire Stance adds +1 damage to a crit (and only to a crit)", () => {
  const build = (stance, mods) => createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance, statModifiers: mods },
      { id: "foe", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  // Isolate the crit bonus: compare Fire Stance vs a neutral WD boosted to the same
  // STR 9, so only the stance's critBonus differs.
  const fire = build("fire", {});
  const boosted = build(null, { strength: 1 });
  const crit = (state) => resolvePhysicalStrike(findId(state, "wd"), findId(state, "foe"), { critical: true, state }).damage;
  const normal = (state) => resolvePhysicalStrike(findId(state, "wd"), findId(state, "foe"), { critical: false, state }).damage;
  assert.equal(crit(fire), crit(boosted) + 1, "Fire Stance crit carries +1");
  assert.equal(normal(fire), normal(boosted), "no bonus on a normal hit (forecast stays honest)");
});

test("Fire Dance buffs allies +1 STR for a turn and enters Fire Stance", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const baseStr = getEffectiveStats(findId(state, "ally"), state).strength;
  const s = activate(state, "wd");
  const r = applyCommand(s, useArt(1, "wd", "fire-dance"));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "wd").stance, "fire");
  const ally = findId(r.nextState, "ally");
  assert.ok(ally.statuses.some((st) => st.type === "empowered"), "ally is empowered");
  assert.equal(getEffectiveStats(ally, r.nextState).strength, baseStr + 1);
});

// --- Spirit Stance ---

test("Spirit Stance: attacking restores 3 MP to allies within 2 (not beyond)", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "spirit" },
      { id: "near", player: 1, type: "mystic", x: 2, y: 0, mp: 10 },
      { id: "far", player: 1, type: "mystic", x: 5, y: 0, mp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const s = activate(state, "wd");
  const r = applyCommand(s, attack(1, "wd", "foe", NORMAL_HIT));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "near").mp, 13, "ally within 2 gains 3 MP");
  assert.equal(findId(r.nextState, "far").mp, 10, "ally beyond 2 is unaffected");
});

test("Spirit Dance restores 1 MP to every ally and enters Spirit Stance", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
      { id: "ally", player: 1, type: "mystic", x: 5, y: 5, mp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const s = activate(state, "wd");
  const r = applyCommand(s, useArt(1, "wd", "spirit-dance"));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "ally").mp, 11);
  assert.equal(findId(r.nextState, "wd").stance, "spirit");
});

// --- Misfortune Stance ---

test("Misfortune Dance clears every status from all units, allies and foes", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0, statuses: [{ type: "poison", duration: "permanent" }] },
      { id: "foe", player: 2, type: "swordsman", x: 2, y: 0, statuses: [{ type: "blind", duration: 2 }] }
    ]
  });
  const s = activate(state, "wd");
  const r = applyCommand(s, useArt(1, "wd", "misfortune-dance"));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "ally").statuses.length, 0, "ally cleansed");
  assert.equal(findId(r.nextState, "foe").statuses.length, 0, "foe cleansed");
  assert.equal(findId(r.nextState, "wd").stance, "misfortune");
});

test("Misfortune Stance doubles an ally's status chance (a high roll now lands)", () => {
  // Mystic Silence is 70%. A 0.9 roll fails normally, but an allied Witch Doctor in
  // Misfortune Stance doubles the chance to a capped 100%, so it lands.
  const withWd = (stance) => createBattleState({
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0 },
      { id: "wd", player: 1, type: "witch-doctor", x: 1, y: 0, stance },
      { id: "foe", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const cast = (state) => applyCommand(activate(state, "mystic"), useArt(1, "mystic", "silence", { targetId: "foe", effectRoll: 0.9 }));

  const off = cast(withWd(null));
  assert.ok(off.accepted);
  assert.equal(findId(off.nextState, "foe").statuses.some((s) => s.type === "silence"), false, "0.9 > 0.7 fails without Misfortune");

  const on = cast(withWd("misfortune"));
  assert.ok(on.accepted);
  assert.equal(findId(on.nextState, "foe").statuses.some((s) => s.type === "silence"), true, "Misfortune ×2 lands the silence");
});

test("Misfortune Stance also doubles an ENEMY caster's status chance (it's global, not a team buff)", () => {
  // A Witch Doctor's Misfortune Stance curses the whole battlefield, so even an
  // opposing caster's status roll benefits from the ×2 multiplier.
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "misfortune" },
      { id: "mystic", player: 2, type: "mystic", x: 5, y: 5 },
      { id: "target", player: 1, type: "swordsman", x: 6, y: 5 }
    ]
  });
  state.currentPlayer = 2;
  const s = activate(state, "mystic");
  const r = applyCommand(s, useArt(2, "mystic", "silence", { targetId: "target", effectRoll: 0.9 }));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "target").statuses.some((st) => st.type === "silence"), true, "enemy caster still benefits from the global Misfortune multiplier");
});

// --- Black Death Stance (RAGE) ---

test("Black Death Stance makes the Witch Doctor immune to magic damage", () => {
  const build = (stance) => createBattleState({
    units: [
      { id: "mag", player: 2, type: "magician", x: 1, y: 0 },
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance }
    ],
    // Player 2 acts first so the enemy Magician can cast.
  });
  const cast = (state) => {
    state.currentPlayer = 2;
    return applyCommand(activate(state, "mag"), useArt(2, "mag", "spark", { targetId: "wd", ...NORMAL_HIT }));
  };
  const immune = cast(build("blackDeath"));
  assert.ok(immune.accepted);
  assert.equal(immune.events.find((e) => e.type === "ART_RESOLVED").damage.damage, 0, "Spark deals 0 to a Black Death Witch Doctor");
  assert.equal(findId(immune.nextState, "wd").hp, 23, "the later Black Death rollover tick still applies");
  assert.ok(immune.events.some((event) => event.type === "BLACK_DEATH_DAMAGE" && event.unitId === "wd"));

  const hurt = cast(build(null));
  assert.ok(hurt.events.find((e) => e.type === "ART_RESOLVED").damage.damage > 0, "a stanceless Witch Doctor takes the hit");
});

test("Black Death Stance burns every unit (incl. the Witch Doctor) 1 true dmg per rollover", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, stance: "blackDeath" },
      { id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }
    ]
  });
  const foeMax = UNIT_TYPES.swordsman.stats.maxHp;
  // The Witch Doctor is player 1's only commander, so finishing its turn rolls over
  // to player 2 — firing the Black Death tick once.
  let s = activate(state, "wd");
  s = applyCommand(s, defend(1, "wd")).nextState;
  const r = applyCommand(s, finishActivation(1, "wd"));
  assert.ok(r.accepted);
  assert.ok(r.events.some((e) => e.type === "BLACK_DEATH_DAMAGE"), "tick surfaced an event");
  assert.equal(findId(r.nextState, "wd").hp, 23, "the source Witch Doctor is not spared");
  assert.equal(findId(r.nextState, "foe").hp, foeMax - 1, "the foe burns too");
});

test("Black Death Dance is rage-locked and its self-buff survives to the next turn", () => {
  // Above 5 HP the rage art is unavailable.
  const healthy = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, hp: 24 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });
  const locked = applyCommand(activate(healthy, "wd"), useArt(1, "wd", "black-death-dance"));
  assert.equal(locked.accepted, false, "cannot dance Black Death above 5 HP");

  // At 5 HP or lower it fires. The +2 STR / +1 DEF / +1 MOVE self-buff must NOT be
  // ticked to nothing by the dance's own end-of-turn — it is live afterward. The ally
  // keeps player 1 on the clock, so no rollover tick muddies the assertions.
  const raging = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, hp: 4 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });
  const r = applyCommand(activate(raging, "wd"), useArt(1, "wd", "black-death-dance"));
  assert.ok(r.accepted, `black-death-dance rejected: ${r.errorCode}`);
  const wd = findId(r.nextState, "wd");
  assert.equal(wd.stance, "blackDeath");
  assert.ok(wd.statuses.some((st) => st.type === "empowered"), "self-buff still present after the cast tick");
  assert.equal(getEffectiveStats(wd, r.nextState).strength, 8 + 2, "+2 STR is live");
  assert.equal(wd.statuses.some((st) => st.type === "blind"), false, "the Witch Doctor is not left blind by his own dance");
  assert.ok(findId(r.nextState, "foe").statuses.some((st) => st.type === "blind"), "enemies are blinded");
});

// --- CPU: the dances are in the brain's repertoire (buffAllies plan family) ---

const dance = (id) => getArt("witch-doctor", id);

test("buffAlliesValue gates Fire Dance on an ally who can reach a foe", () => {
  const near = createBattleState({ units: [
    { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
    { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
    { id: "foe", player: 2, type: "swordsman", x: 3, y: 0 }
  ] });
  assert.ok(buffAlliesValue(near, findId(near, "wd"), dance("fire-dance")) > 0, "worth it with a striker in reach");

  const far = createBattleState({ units: [
    { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
    { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
    { id: "foe", player: 2, type: "swordsman", x: 12, y: 12 }
  ] });
  assert.equal(buffAlliesValue(far, findId(far, "wd"), dance("fire-dance")), 0, "no-op with no one in reach");
});

test("buffAlliesValue gates Misfortune Dance on an ally with a harmful status", () => {
  const poisoned = createBattleState({ units: [
    { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
    { id: "ally", player: 1, type: "swordsman", x: 1, y: 0, statuses: [{ type: "poison", duration: "permanent" }] },
    { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
  ] });
  assert.ok(buffAlliesValue(poisoned, findId(poisoned, "wd"), dance("misfortune-dance")) > 0);

  const clean = createBattleState({ units: [
    { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
    { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
    { id: "foe", player: 2, type: "swordsman", x: 9, y: 9 }
  ] });
  assert.equal(buffAlliesValue(clean, findId(clean, "wd"), dance("misfortune-dance")), 0, "nothing to cleanse");
});

test("CPU: a raging Witch Doctor casts Black Death Dance to blind the enemy squad", () => {
  const state = createBattleState({ units: [
    { id: "wd", player: 2, type: "witch-doctor", x: 6, y: 6, hp: 4 },
    { id: "e1", player: 1, type: "swordsman", x: 5, y: 6, hp: 25 },
    { id: "e2", player: 1, type: "swordsman", x: 7, y: 6, hp: 25 },
    { id: "e3", player: 1, type: "swordsman", x: 6, y: 5, hp: 25 }
  ] });
  state.currentPlayer = 2;
  const cmds = chooseActivation(state, { cpuPlayer: 2, difficulty: "hard" });
  assert.ok(cmds.some((c) => c.artId === "black-death-dance"),
    "with three foes to blind and no kill available, the rage dance is the best move");
});

test("CPU: the Witch Doctor cleanses the team with Misfortune Dance when it's the clear play", () => {
  // Three poisoned allies, enemies out of everyone's reach: cleansing beats a lone advance.
  const state = createBattleState({ units: [
    { id: "wd", player: 2, type: "witch-doctor", x: 6, y: 6 },
    { id: "a1", player: 2, type: "swordsman", x: 7, y: 6, statuses: [{ type: "poison", duration: "permanent" }] },
    { id: "a2", player: 2, type: "swordsman", x: 6, y: 7, statuses: [{ type: "poison", duration: "permanent" }] },
    { id: "a3", player: 2, type: "swordsman", x: 7, y: 7, statuses: [{ type: "poison", duration: "permanent" }] },
    { id: "foe", player: 1, type: "swordsman", x: 0, y: 0 }
  ] });
  state.currentPlayer = 2;
  const cmds = chooseActivation(state, { cpuPlayer: 2, difficulty: "hard" });
  assert.ok(cmds.some((c) => c.artId === "misfortune-dance"),
    "cleansing three poisoned allies outscores idle advancing");
});

// --- Dance feedback plumbing (every dance is a GLOBAL effect, not a single-target
// cast) ---. main.js reads these ART_RESOLVED fields to drive the shared "ritual"
// VFX + per-unit float text (see ui/effects.js's `ritual` + ui/vfxCatalog.js's
// "*-dance" entries); pin them here so a future dance can't silently ship mute.

test("team-scoped dances (heal/buff/MP) beacon every living ally, not the whole board", () => {
  const state = createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });
  for (const artId of ["rain-dance", "fire-dance", "spirit-dance"]) {
    const s = activate(state, "wd");
    const r = applyCommand(s, useArt(1, "wd", artId));
    assert.ok(r.accepted, `${artId} rejected: ${r.errorCode}`);
    const event = r.events.find((e) => e.type === "ART_RESOLVED");
    assert.deepEqual(new Set(event.beaconTargetIds), new Set(["wd", "ally"]), `${artId} beacons allies only`);
  }
});

// --- Coal Walker: fire immunity (the same seam Gargoyle's One With The Flames uses) ---

test("Coal Walker: the Witch Doctor is flagged fire-damage immune", () => {
  const state = createBattleState({
    units: [{ id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0 }]
  });
  assert.ok(isFireDamageImmune(findId(state, "wd")));
});

test("Coal Walker: fire tiles do not damage the Witch Doctor", () => {
  const state = createBattleState({
    units: [
      { id: "p1", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "wd", type: "witch-doctor", player: 2, x: 5, y: 5 }
    ],
    tileObjects: [{ x: 5, y: 5, kind: "fire", turnsLeft: 3 }]
  });

  let s = activate(state, "p1");
  s = applyCommand(s, defend(1, "p1")).nextState;
  const res = applyCommand(s, finishActivation(1, "p1"));

  assert.equal(findId(res.nextState, "wd").hp, 24, "Witch Doctor ignores fire tile damage");
  assert.ok(!res.events.some((e) => e.type === "FIRE_DAMAGE" && e.unitId === "wd"), "no burn event is surfaced");
  assert.equal(res.nextState.tileObjects["5,5"].turnsLeft, 2, "the fire still counts down");
});

function freshWdState(hp = 24) {
  return createBattleState({
    units: [
      { id: "wd", player: 1, type: "witch-doctor", x: 0, y: 0, hp },
      { id: "ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
}

test("globally-scoped dances (cleanse/blind) beacon every living unit, allies and foes", () => {
  let s = activate(freshWdState(), "wd");
  let r = applyCommand(s, useArt(1, "wd", "misfortune-dance"));
  assert.ok(r.accepted);
  let event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.deepEqual(new Set(event.beaconTargetIds), new Set(["wd", "ally", "foe"]), "Misfortune Dance beacons the whole board");

  s = activate(freshWdState(5), "wd");
  r = applyCommand(s, useArt(1, "wd", "black-death-dance"));
  assert.ok(r.accepted, `black-death-dance rejected: ${r.errorCode}`);
  event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.deepEqual(new Set(event.beaconTargetIds), new Set(["wd", "ally", "foe"]), "Black Death Dance beacons the whole board");
});

test("Fire Dance's team buff and Black Death Dance's self buff both carry a readable stat label", () => {
  let s = activate(freshWdState(), "wd");
  let r = applyCommand(s, useArt(1, "wd", "fire-dance"));
  assert.ok(r.accepted);
  let event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.buffLabel, "+1 STR");
  assert.deepEqual(event.buffed, ["wd", "ally"]);

  s = activate(freshWdState(5), "wd");
  r = applyCommand(s, useArt(1, "wd", "black-death-dance"));
  assert.ok(r.accepted, `black-death-dance rejected: ${r.errorCode}`);
  event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.selfBuffed, true);
  assert.equal(event.selfBuffLabel, "+2 STR / +1 DEF / +1 MOVE");
});

test("every dance registers a global 'ritual' VFX recipe keyed by its own gather duration", () => {
  const dances = ["rain-dance", "fire-dance", "spirit-dance", "misfortune-dance", "black-death-dance"];
  const distinctColors = new Set();
  for (const artId of dances) {
    const vfx = getAbilityVfx(artId);
    assert.equal(vfx?.type, "ritual", `${artId} should use the shared global-ritual VFX`);
    assert.equal(vfx.windup?.style, "gather", `${artId} should gather before releasing`);
    assert.ok(vfx.soundKey, `${artId} needs a sound`);
    distinctColors.add(vfx.colors.core);
  }
  assert.equal(distinctColors.size, dances.length, "each dance should read as a visually distinct ritual");
});

test("every stance has a registered badge/tag visual", () => {
  for (const stanceId of ["rain", "fire", "spirit", "misfortune", "blackDeath"]) {
    const visual = getStanceVfx(stanceId);
    assert.ok(visual, `${stanceId} missing from STANCE_VFX`);
    assert.ok(visual.glyph, `${stanceId} needs a board-badge glyph`);
    assert.ok(visual.color, `${stanceId} needs a color`);
    assert.ok(visual.label, `${stanceId} needs a label`);
  }
});
