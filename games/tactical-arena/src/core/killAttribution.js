// Kill attribution: who gets credit when a unit falls.
//
// Damage is applied at ~30 scattered sites across the resolvers, hazards, and
// reactions, and there is no single choke point to hook. Rather than thread an
// attacker argument through every one of them, attribution works in credit
// SCOPES: a caller snapshots which units were alive, runs a chunk of resolution,
// then asks this module to attribute whatever died during it.
//
//   const aliveBefore = snapshotAlive(state);
//   ...damage happens...
//   creditDeaths(state, aliveBefore, events, { killerId: actor.id, cause: CAUSE.UNIT });
//
// Scopes nest, and the INNERMOST one wins: `killedBy` is written exactly once per
// unit and never overwritten, so a narrow scope (a fire tick, a thorns proc, a
// self-sacrifice) claims its kill before the broad per-command scope sweeps up
// whatever is left. That broad scope is the backstop — any death nobody claimed is
// attributed to the acting unit, which is correct for the overwhelming majority of
// deaths (their attack, their ART, their splash).
//
// `kills` is a pure tally. It never affects legality, damage, or the RNG, so it is
// deliberately NOT part of the authoritative state hash (see state-hash.js, which
// excludes it alongside `skin`/`nickname`). Both clients still compute identical
// values from the identical command stream, which is what lets the server credit
// ranked_unit_stats only when both end-of-match reports agree.

import { findUnit } from "./state.js";

// Why a unit died. Drives both kill credit and the match-detail wording.
export const CAUSE = Object.freeze({
  UNIT: "unit",               // a unit's direct action (attack, ART, splash, counter)
  FIRE: "fire",               // standing on a fire tile at rollover
  STATUS: "status",           // poison/DoT tick
  ENVIRONMENT: "environment", // Black Death, void tiles, weather — nobody's doing
  SELF: "self",               // self-damage: HP costs, recoil, sacrifice
  CONCEDE: "concede",         // the player resigned
});

// Causes that can credit a killer at all. Environmental and self causes never do,
// even when a killerId is supplied, so callers can pass context freely.
const CREDITING_CAUSES = new Set([CAUSE.UNIT, CAUSE.FIRE, CAUSE.STATUS]);

export function snapshotAlive(state) {
  const alive = new Map();
  for (const unit of state.units) alive.set(unit.id, unit.hp > 0);
  return alive;
}

// Tag a death that just happened as self-inflicted, WITHOUT announcing it. Used by the
// HP-cost ARTS and the Beckoned-ghost sacrifice, which kill the actor (or its summoner)
// deep inside a resolver that has no event list to hand. The next credit scope to sweep
// this unit honors the tag instead of its own cause, so the death is still announced
// exactly once — it just credits nobody. No-ops unless the unit actually died.
export function markSelfInflicted(unit) {
  if (unit && unit.hp <= 0 && !unit.deathCause) unit.pendingDeathCause = CAUSE.SELF;
}

// True when `killer` should have this kill counted on their record. Self-kills and
// kills on your own team are recorded in `killedBy` (so the UI can still explain the
// death) but never inflate the killer's tally.
function countsAsKill(killer, victim) {
  if (!killer || killer.id === victim.id) return false;
  const killerTeam = killer.team ?? killer.player;
  const victimTeam = victim.team ?? victim.player;
  return killerTeam !== victimTeam;
}

// Attribute every unit that crossed alive -> dead since `aliveBefore` was taken and
// has not already been claimed by a narrower scope. Emits one UNIT_DEFEATED per
// newly-attributed death. Returns the ids attributed, for callers that want them.
export function creditDeaths(state, aliveBefore, events, { killerId = null, cause = CAUSE.UNIT } = {}) {
  const attributed = [];
  for (const unit of state.units) {
    if (unit.hp > 0) continue;
    if (!aliveBefore.get(unit.id)) continue;  // already dead before this scope opened
    // `deathCause` is the single claim marker. `killedBy` cannot serve as one because
    // null is a legitimate attribution (environmental and self deaths have no killer).
    if (unit.deathCause) continue;

    // A pre-tagged self-inflicted death overrides this scope's cause (see
    // markSelfInflicted) so an HP cost or a sacrifice is never blamed on the enemy the
    // actor happened to be fighting.
    const effectiveCause = unit.pendingDeathCause ?? cause;
    delete unit.pendingDeathCause;

    // A killer that is itself already dead still gets credit — trading kills is normal.
    const killer = killerId && killerId !== unit.id ? findUnit(state, killerId) : null;
    const creditable = CREDITING_CAUSES.has(effectiveCause) ? killer : null;

    unit.killedBy = creditable ? creditable.id : null;
    unit.deathCause = effectiveCause;
    if (creditable && countsAsKill(creditable, unit)) {
      creditable.kills = (creditable.kills ?? 0) + 1;
    }
    events.push({ type: "UNIT_DEFEATED", unitId: unit.id, killerId: unit.killedBy, cause: effectiveCause });
    attributed.push(unit.id);
  }
  return attributed;
}
