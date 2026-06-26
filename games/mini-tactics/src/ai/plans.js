// Activation-plan generation for the CPU.
//
// A "plan" is one complete, legal activation for a single unit, expressed at the
// rules level (not yet as commands). Every plan pairs an optional move with the
// required primary action, because a move-only activation is illegal:
//
//   { unitId, moveTo, movePhase, primary }
//     moveTo    — destination tile { x, y }, or null to stay put
//     movePhase — "before" (move, then act) | "after" (act, then retreat) | null
//     primary   — { kind: "attack"|"heal"|"defend", targetId? }
//
// The generator only ever produces plans the reducer will accept; the reducer
// still re-validates each command, so this is an optimization of search space,
// never an authority. Pure and headless.

import { tileKey } from "../geometry/isometric.js";
import { getLegalMoves } from "../rules/movement.js";
import { getLegalAttackTargets, getLegalHealTargets } from "../rules/combat.js";
import { getLegalGuardTargets } from "../rules/guard.js";
import { livingUnits } from "../state/gameState.js";
import { expectedAttack, expectedHeal, nearestEnemyDistance } from "./evaluate.js";

export function generatePlans(state, unit) {
  const plans = [];
  const origin = { x: unit.x, y: unit.y };
  const moveTiles = getLegalMoves(state, unit);
  const destinations = [origin, ...tilesFromKeys(moveTiles)];

  // Move-first family: from every reachable tile (standing still included) each
  // attack and — for a medic — each heal becomes a candidate plan.
  for (const dest of destinations) {
    const stays = dest.x === origin.x && dest.y === origin.y;
    const moveTo = stays ? null : dest;
    const movePhase = stays ? null : "before";

    for (const enemy of attackTargetsFrom(state, unit, dest)) {
      plans.push(plan(unit, moveTo, movePhase, { kind: "attack", targetId: enemy.id }));
    }

    if (unit.type === "medic") {
      for (const ally of healTargetsFrom(state, unit, dest)) {
        plans.push(plan(unit, moveTo, movePhase, { kind: "heal", targetId: ally.id }));
      }
    }

    if (unit.type === "tank") {
      for (const target of guardTargetsFrom(state, unit, dest)) {
        plans.push(plan(unit, moveTo, movePhase, { kind: "guard", targetId: target.id }));
      }
    }
  }

  // Hit-and-run: take the strongest shot available from the origin, then retreat
  // to any reachable tile. Only the single best standing target is expanded so
  // the retreat fan-out stays bounded.
  const standing = attackTargetsFrom(state, unit, origin);
  if (standing.length > 0 && moveTiles.size > 0) {
    const best = bestAttackTarget(unit, standing);
    for (const dest of tilesFromKeys(moveTiles)) {
      plans.push(plan(unit, dest, "after", { kind: "attack", targetId: best.id }));
    }
  }

  // Defend/Guard fallbacks: brace in place, and (if able to move) brace after
  // advancing toward the nearest enemy. These guarantee every unit always has at
  // least one legal plan even with nothing to attack or heal.
  const fallback = unit.type === "tank"
    ? { kind: "guard", targetId: unit.id }
    : { kind: "defend" };
  plans.push(plan(unit, null, null, fallback));
  const advance = advanceTile(state, unit, moveTiles);
  if (advance) {
    plans.push(plan(unit, advance, "before", fallback));
  }

  return plans;
}

// Apply a plan to a lightweight projected board (positions + EXPECTED hp), used
// by the evaluator to score the resulting position. Returns the cloned board, the
// acting unit's projected entry, and its final tile.
export function projectPlan(state, p) {
  const board = livingUnits(state).map((u) => ({ ...u }));
  const byId = new Map(board.map((u) => [u.id, u]));
  const actor = byId.get(p.unitId);
  const finalPos = p.moveTo ?? { x: actor.x, y: actor.y };

  actor.x = finalPos.x;
  actor.y = finalPos.y;

  if (p.primary.kind === "attack") {
    const target = byId.get(p.primary.targetId);
    if (target) target.hp = expectedAttack(actor, target).expTargetHp;
  } else if (p.primary.kind === "heal") {
    const target = byId.get(p.primary.targetId);
    if (target) target.hp = expectedHeal(target).expTargetHp;
  } else if (p.primary.kind === "guard") {
    actor.guardTargetId = p.primary.targetId;
    actor.defending = p.primary.targetId === actor.id;
  } else if (p.primary.kind === "defend") {
    actor.defending = true;
  }

  return { board, actor, finalPos };
}

function plan(unit, moveTo, movePhase, primary) {
  return { unitId: unit.id, moveTo, movePhase, primary };
}

// Enemies this unit could legally attack if it were standing on `pos`. The unit
// is temporarily relocated so line-of-fire and range are computed from there.
function attackTargetsFrom(state, unit, pos) {
  const moved = withUnitAt(state, unit.id, pos);
  const actor = moved.units.find((u) => u.id === unit.id);
  const set = getLegalAttackTargets(moved, actor);
  return livingUnits(moved).filter((u) => set.has(tileKey(u.x, u.y)));
}

// Wounded allies a medic could legally heal from `pos`.
function healTargetsFrom(state, unit, pos) {
  const moved = withUnitAt(state, unit.id, pos);
  const actor = moved.units.find((u) => u.id === unit.id);
  const set = getLegalHealTargets(moved, actor);
  return livingUnits(moved).filter((u) => set.has(tileKey(u.x, u.y)));
}

function guardTargetsFrom(state, unit, pos) {
  const moved = withUnitAt(state, unit.id, pos);
  const actor = moved.units.find((u) => u.id === unit.id);
  const set = getLegalGuardTargets(moved, actor);
  return livingUnits(moved).filter((u) => set.has(tileKey(u.x, u.y)));
}

// The reachable tile that gets this unit closest to the nearest enemy, used as a
// purposeful "advance" when it cannot yet act. Null when it cannot move or no
// move improves its distance.
function advanceTile(state, unit, moveTiles) {
  const here = nearestEnemyDistance(state, state.units, unit.player, unit);
  let best = null;
  let bestDistance = here;

  for (const dest of tilesFromKeys(moveTiles)) {
    const distance = nearestEnemyDistance(state, state.units, unit.player, dest);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = dest;
    }
  }

  return best;
}

function bestAttackTarget(unit, targets) {
  let best = targets[0];
  let bestScore = -Infinity;
  for (const target of targets) {
    const ev = expectedAttack(unit, target);
    // Lethal shots dominate; otherwise prefer the most expected damage.
    const score = ev.pKill * 100 + ev.expDamage;
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

// A shallow state view with one unit relocated, leaving the rules helpers (which
// read state.units / size / players) otherwise untouched.
function withUnitAt(state, unitId, pos) {
  return {
    ...state,
    units: state.units.map((u) =>
      u.id === unitId ? { ...u, x: pos.x, y: pos.y } : u,
    ),
  };
}

function tilesFromKeys(keySet) {
  return [...keySet].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
}
