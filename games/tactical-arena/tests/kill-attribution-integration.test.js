import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, concede, defend, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getSoulShuffleChoices } from "../src/core/unitCatalog.js";
import { CAUSE } from "../src/core/killAttribution.js";

// End-to-end attribution through the REAL reducer. The unit tests in
// kill-attribution.test.js lock the scope semantics; these prove the scopes are
// actually wired into the paths that kill people — especially the three that have no
// obvious killer: fire tiles, self-damage, and the Beckoned-ghost sacrifice.

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

function deathOf(events, unitId) {
  return events.find((event) => event.type === "UNIT_DEFEATED" && event.unitId === unitId);
}

// Run a full activation for player 1 so the turn rolls over and hazards tick.
function rolloverAfterP1(state, unitId) {
  const begun = applyCommand(state, beginActivation(1, unitId));
  return applyCommand(begun.nextState, defend(1, unitId));
}

test("a plain attack kill credits the attacker and increments its tally", () => {
  const state = createBattleState({
    units: [
      { id: "hero", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "foe", player: 2, type: "swordsman", hp: 1, x: 1, y: 0 },
      { id: "foe2", player: 2, type: "swordsman", x: 6, y: 6 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "hero"));
  const result = applyCommand(begun.nextState, attack(1, "hero", "foe", NORMAL_HIT));

  assert.equal(result.accepted, true);
  const death = deathOf(result.events, "foe");
  assert.deepEqual(death, { type: "UNIT_DEFEATED", unitId: "foe", killerId: "hero", cause: CAUSE.UNIT });
  assert.equal(findUnit(result.nextState, "hero").kills, 1);
  assert.equal(findUnit(result.nextState, "foe").killedBy, "hero");
});

test("a unit that burns to death credits whoever lit that tile", () => {
  // The Sniper lights the tile the enemy is standing on, then the turn rolls over and
  // the fire ticks. Nobody is "acting" when it burns — the credit rides on the tile.
  const state = createBattleState({
    units: [
      { id: "sniper", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "burned", player: 2, type: "swordsman", hp: 1, x: 1, y: 0 },
      { id: "spare", player: 2, type: "swordsman", x: 6, y: 6 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "sniper"));
  const lit = applyCommand(begun.nextState, useArt(1, "sniper", "throw-cigar", { targetPosition: { x: 1, y: 0 } }));
  assert.equal(lit.accepted, true, lit.errorCode);
  assert.equal(lit.nextState.tileObjects["1,0"].ownerId, "sniper");

  // Throw Cigar spends the activation, so the turn has already rolled to player 2.
  const burned = findUnit(lit.nextState, "burned");
  assert.equal(burned.hp, 0, "1 HP target burned down at the rollover");
  assert.equal(burned.killedBy, "sniper");
  assert.equal(burned.deathCause, CAUSE.FIRE);
  assert.equal(findUnit(lit.nextState, "sniper").kills, 1);
});

test("authored mission fire with no owner kills without crediting anyone", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "doomed", player: 2, type: "swordsman", hp: 1, x: 5, y: 5 },
      { id: "spare", player: 2, type: "swordsman", x: 6, y: 6 }
    ],
    tileObjects: [{ x: 5, y: 5, kind: "fire", turnsLeft: 3 }]
  });
  const rolled = rolloverAfterP1(state, "p1");

  const doomed = findUnit(rolled.nextState, "doomed");
  assert.equal(doomed.hp, 0);
  assert.equal(doomed.killedBy, null, "nobody lit this fire");
  assert.equal(doomed.deathCause, CAUSE.ENVIRONMENT);
  assert.equal(findUnit(rolled.nextState, "p1").kills, 0);
  assert.ok(deathOf(rolled.events, "doomed"), "the death is still announced");
});

test("poison credits the unit that applied it, not whoever is acting", () => {
  const state = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "victim", player: 2, type: "swordsman", hp: 1, x: 1, y: 0 },
      { id: "spare", player: 2, type: "swordsman", x: 6, y: 6 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "p1-archer"));
  // Poison Arrow: a landed shot applies permanent poison (effectRoll under the chance).
  const shot = applyCommand(begun.nextState, useArt(1, "p1-archer", "poison-arrow", {
    targetId: "victim", ...NORMAL_HIT, effectRoll: 0.1
  }));
  assert.equal(shot.accepted, true, shot.errorCode);

  const poisoned = findUnit(shot.nextState, "victim");
  if (poisoned.hp > 0) {
    assert.ok(poisoned.statuses.some((s) => s.type === "poison" && s.appliedBy === "p1-archer"),
      "the poison records who applied it");
  } else {
    assert.equal(poisoned.killedBy, "p1-archer");
  }
});

test("a self-destruct ART credits its own death to nobody while still scoring its kills", () => {
  // NOTE: a plain `hpCost` ART can never be the lethal blow — rules/arts.js gates it
  // behind `actor.hp > art.hpCost`. The reachable self-kill is `selfKill` (Juggernaut's
  // Self Destruct, Virus's Explosion, Blacksword's Banish), which is what this covers.
  const state = createBattleState({
    units: [
      { id: "jug", player: 1, type: "juggernaut", hp: 4, x: 4, y: 4 }, // <=5 HP so RAGE is on
      { id: "ally", player: 1, type: "swordsman", x: 0, y: 8 },
      { id: "foe", player: 2, type: "swordsman", hp: 1, x: 5, y: 4 },
      { id: "reserve", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "jug"));
  const boom = applyCommand(begun.nextState, useArt(1, "jug", "self-destruct", {}));
  assert.equal(boom.accepted, true, boom.errorCode);

  const jug = findUnit(boom.nextState, "jug");
  assert.equal(jug.hp, 0, "the self-kill path actually ran");
  assert.equal(jug.killedBy, null, "blowing yourself up is nobody's kill");
  assert.equal(jug.deathCause, CAUSE.SELF);
  assert.ok(deathOf(boom.events, "jug"), "the self-inflicted death is still announced");

  // The blast itself still scores normally against everyone it caught.
  assert.equal(findUnit(boom.nextState, "foe").hp, 0);
  assert.equal(findUnit(boom.nextState, "foe").killedBy, "jug");
  assert.equal(jug.kills, 1, "its own death does not cancel the kills it earned");
});

test("Stone Body thorns credit the defending Gargoyle, not the unit that died", () => {
  const state = createBattleState({
    units: [
      { id: "attacker", player: 1, type: "swordsman", hp: 1, x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 0, y: 3 },
      { id: "gargoyle", player: 2, type: "gargoyle", x: 1, y: 0 }
    ]
  });
  // Pass player 1's turn — BOTH units must act before it rolls over — then put the
  // Gargoyle on Defend and swing into it. Stone Body only bites a MELEE attacker while
  // the Gargoyle is actually defending.
  let passed = rolloverAfterP1(state, "attacker");
  assert.equal(passed.accepted, true, passed.errorCode);
  passed = rolloverAfterP1(passed.nextState, "ally");
  assert.equal(passed.accepted, true, passed.errorCode);

  const gargoyleUp = applyCommand(passed.nextState, beginActivation(2, "gargoyle"));
  assert.equal(gargoyleUp.accepted, true, gargoyleUp.errorCode);
  const guard = applyCommand(gargoyleUp.nextState, defend(2, "gargoyle"));
  assert.equal(guard.accepted, true, guard.errorCode);

  const up = applyCommand(guard.nextState, beginActivation(1, "attacker"));
  assert.equal(up.accepted, true, up.errorCode);
  const swing = applyCommand(up.nextState, attack(1, "attacker", "gargoyle", NORMAL_HIT));
  assert.equal(swing.accepted, true, swing.errorCode);

  const attacker = findUnit(swing.nextState, "attacker");
  assert.equal(attacker.hp, 0, "1 HP attacker dies to the thorns it provoked");
  assert.equal(attacker.killedBy, "gargoyle", "thorns kill in the defender's name");
  assert.equal(attacker.deathCause, CAUSE.UNIT);
  assert.equal(findUnit(swing.nextState, "gargoyle").kills, 1);
});

test("a Beckoned ghost's sacrifice kills its Summoner without crediting the enemy", () => {
  // Beckon's recoil kills the ghost, and spending a Beckoned ghost consumes the
  // Summoner that called it. The enemy being punched must NOT be credited for the
  // Summoner — it never touched it.
  let seed = 1;
  let state = null;
  for (; seed < 500; seed += 1) {
    const candidate = createBattleState({
      seed,
      size: 9,
      units: [
        { id: "summoner", player: 1, type: "summoner", hp: 5, x: 1, y: 1 },
        { id: "ally", player: 1, type: "swordsman", x: 0, y: 8 },
        { id: "foe", player: 2, type: "swordsman", hp: 40, x: 3, y: 1 },
        { id: "reserve", player: 2, type: "swordsman", x: 8, y: 8 }
      ]
    });
    if (getSoulShuffleChoices(findUnit(candidate, "summoner"), candidate.rngState).choices.includes("ronin")) {
      state = candidate;
      break;
    }
  }
  assert.ok(state, "found a seed offering Ronin on Soul Shuffle");

  const opened = applyCommand(state, beginActivation(1, "summoner"));
  const beckoned = applyCommand(opened.nextState, useArt(1, "summoner", "beckon", {
    targetPosition: { x: 2, y: 1 },
    summonType: "ronin"
  }));
  assert.equal(beckoned.accepted, true, beckoned.errorCode);
  const ghostId = beckoned.events.find((entry) => entry.type === "ART_RESOLVED").summonedUnitId;

  const strike = applyCommand(beckoned.nextState, attack(1, ghostId, "foe", NORMAL_HIT));
  assert.equal(strike.accepted, true, strike.errorCode);

  const summoner = findUnit(strike.nextState, "summoner");
  assert.equal(summoner.hp, 0, "the sacrifice path actually ran");
  assert.equal(summoner.killedBy, null, "a sacrifice is nobody's kill");
  assert.equal(summoner.deathCause, CAUSE.SELF);
  assert.equal(findUnit(strike.nextState, "foe").kills, 0, "the punching bag gets no credit");
  assert.ok(deathOf(strike.events, "summoner"), "the sacrifice is still announced");
});

test("conceding wipes the squad without crediting the opponent", () => {
  const state = createBattleState({
    units: [
      { id: "quitter", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "winner", player: 2, type: "swordsman", x: 5, y: 5 }
    ]
  });
  const result = applyCommand(state, concede(1));

  assert.equal(result.accepted, true);
  const death = deathOf(result.events, "quitter");
  assert.equal(death.cause, CAUSE.CONCEDE);
  assert.equal(death.killerId, null);
  assert.equal(findUnit(result.nextState, "winner").kills, 0, "a resignation is not a kill");
  const deaths = result.events.filter((event) => event.type === "UNIT_DEFEATED");
  assert.equal(deaths.length, 1, "each death is announced exactly once");
});

test("kills, killedBy, and deathCause stay out of the authoritative state hash", async () => {
  const { hashState } = await import("../src/core/state-hash.js");
  const state = createBattleState({
    units: [
      { id: "a", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "b", player: 2, type: "swordsman", x: 5, y: 5 }
    ]
  });
  const before = hashState(state);
  const unit = findUnit(state, "a");
  unit.kills = 7;
  unit.killedBy = "b";
  unit.deathCause = CAUSE.UNIT;

  assert.equal(hashState(state), before,
    "statistical fields must never move the hash — they would desync nothing but would " +
    "turn any attribution bug into a false desync");
});
