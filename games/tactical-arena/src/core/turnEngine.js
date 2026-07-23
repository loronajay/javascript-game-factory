import { getUnitType, getWeatherAffinityRestore, getWeatherPassiveRestore, sustainsVictory, takesTurns } from "./unitCatalog.js";
import {
  areAllies,
  areEnemies,
  findUnit,
  getTileAffinity,
  livingUnits,
  openAutomaticFirstActivation,
  teamOfUnit,
} from "./state.js";
import { chebyshevDistance } from "../rules/movement.js";

import { applyStatus, isInvulnerable, isPetrified, isStunned, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";

import { finishTempoActivation, isTempoBattle } from "./tempoBattle.js";
import { restoreHp, restoreMp } from "./combatEffects.js";
import { applyAutoStrikeTick, applyBlackDeathTick, applyFireTick, applyRandomFireTick, applyTimeStealTick, applyWeatherCycleTick } from "./turnHazards.js";
import { CAUSE, creditDeaths, snapshotAlive } from "./killAttribution.js";

const MAX_STUN_FAST_FORWARD_ROLLOVERS = 32;

function activeFinalBattleLastStand(state) {
  const rules = state?.missionRules?.finalBattle;
  if (!rules || rules.stage !== rules.lastStage || state.phase !== "playing") return null;
  const boss = findUnit(state, rules.bossId);
  return boss?.hp > 0 ? { rules, boss } : null;
}

// These are position-bound copies, not timed casts. They are tagged so leaving a dark
// tile removes only the void copy while any ordinary timed Blind/Silence survives.
export function syncFinalBattleDarkTileStatuses(state, events = null) {
  const active = activeFinalBattleLastStand(state);
  const rules = state?.missionRules?.finalBattle;
  const source = rules?.darkTileStatusSource ?? "final-battle-dark-tile";
  const statusTypes = rules?.darkTileStatuses ?? ["blind", "silence"];
  for (const unit of state?.units ?? []) {
    const prior = unit.statuses ?? [];
    const had = new Set(prior.filter((status) => status.source === source).map((status) => status.type));
    unit.statuses = prior.filter((status) => status.source !== source);
    const onHazard = Boolean(
      active && unit.player === 1 && unit.hp > 0 && getTileAffinity(state, unit.position) === "dark"
    );
    if (onHazard) {
      for (const type of statusTypes) {
        // Preserve true immunities. A one-shot resistance is not consumed by the floor.
        const result = applyStatus(unit, {
          type,
          duration: "permanent",
          source,
          ignoreResistance: true,
        });
        if (result.applied) unit.statuses = result.statuses;
      }
    }
    const now = new Set(unit.statuses.filter((status) => status.source === source).map((status) => status.type));
    const applied = [...now].filter((type) => !had.has(type));
    const removed = [...had].filter((type) => !now.has(type));
    if (events && (applied.length || removed.length)) {
      events.push({
        type: "VOID_TILE_AFFLICTION",
        unitId: unit.id,
        position: { ...unit.position },
        applied,
        removed,
      });
    }
  }
}

function applyFinalBattleVoidPressure(state, previousPlayer, events) {
  const active = activeFinalBattleLastStand(state);
  if (!active || previousPlayer !== 2 || state.currentPlayer !== 1) return;
  const amount = Math.max(0, Number(active.rules.voidPressureDamage) || 0);
  if (amount <= 0) return;
  const aliveBefore = snapshotAlive(state);
  for (const unit of livingUnits(state, 1)) {
    if (isInvulnerable(unit)) continue;
    const damage = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (damage > 0) {
      events.push({
        type: "VOID_PRESSURE",
        unitId: unit.id,
        position: { ...unit.position },
        damage,
      });
    }
  }
  // The collapsing arena is a mission hazard, not the boss's kill.
  creditDeaths(state, aliveBefore, events, { cause: CAUSE.ENVIRONMENT });
}

export function spendAndAdvance(state, unit) {
  if (isTempoBattle(state)) {
    finishTempoActivation(state, unit);
    return;
  }
  if (unit.ghost && state.activation?.summonerId) {
    const summoner = findUnit(state, state.activation.summonerId);
    const position = { ...unit.position };
    unit.statuses = tickStatuses(unit.statuses);
    unit.spent = true;
    unit.hp = 0;
    if (summoner && summoner.hp > 0) {
      summoner.statuses = tickStatuses(summoner.statuses);
      summoner.spent = true;
    }
    appendPendingRolloverEvents(state, [{
      type: "GHOST_DISSIPATED",
      unitId: unit.id,
      summonerId: state.activation.summonerId,
      artId: state.activation.summonerArtId ?? unit.ghostArtId ?? null,
      position,
      ghostType: unit.type
    }]);
    state.activation = null;
    resolveVictory(state);
    advanceTurnIfExhausted(state);
    return;
  }
  if (getUnitType(unit.type).actsFirst) unit.commandTurn = state.turnNumber;
  unit.statuses = tickStatuses(unit.statuses);
  unit.spent = true;
  // Wanderer (Ronin): duel marks are "enemies that missed me last turn" — clear them once
  // Ronin has had his turn, so a whiff only ever grants the +1 for a single following turn.
  if (unit.duelMarks?.length) unit.duelMarks = [];

  const spellUsed = state.activation?.spellUsed ?? false;
  const realmTraversalActive = state.activation?.unitId === unit.id && state.activation?.realmTraversalActive;
  const passive = getUnitType(unit.type)?.passive;
  if (passive?.effect?.type === "mpRegen") {
    if (spellUsed) {
      unit.mageChargeCount = 0;
    } else {
      unit.mageChargeCount = (unit.mageChargeCount ?? 0) + 1;
      if (unit.mageChargeCount >= passive.effect.interval) {
        const restored = restoreMp(state, unit, unit, passive.effect.amount);
        if (restored.mpRestored > 0 || restored.hpRestored > 0) {
          appendPendingRolloverEvents(state, [{
            type: "PASSIVE_RESTORE",
            unitId: restored.targetId ?? unit.id,
            sourceId: unit.id,
            passiveId: passive.id,
            passiveName: passive.name,
            mpRestored: restored.mpRestored,
            hpRestored: restored.hpRestored
          }]);
        }
        unit.mageChargeCount = 0;
      }
    }
  }

  if (realmTraversalActive) unit.realmTraversalLocked = false;
  state.activation = null;
  advanceTurnIfExhausted(state);
  openAutomaticFirstActivation(state);
}

function appendPendingRolloverEvents(state, events) {
  if (!events.length) return;
  state.pendingRolloverEvents = [...(state.pendingRolloverEvents ?? []), ...events];
}

function autoSpendStunnedUnits(state, player) {
  const events = [];
  for (const member of livingUnits(state, player)) {
    if (!takesTurns(member) || member.spent) continue;
    // Petrify (Treant): a petrified statue takes no action, but each of its own turns it
    // pulses the restore/drain aura and counts down toward waking. Handled before the stun
    // check so a petrified unit is never also processed as merely stunned.
    if (isPetrified(member)) {
      member.defending = false;
      member.statuses = tickStatuses(member.statuses); // the permanent petrified marker survives
      applyPetrifyTurn(state, member, events);
      member.spent = true;
      continue;
    }
    if (!isStunned(member)) continue;

    member.defending = false;
    if (getUnitType(member.type).actsFirst) member.commandTurn = state.turnNumber;
    member.statuses = tickStatuses(member.statuses);
    member.spent = true;
    events.push({ type: "UNIT_STUNNED", unitId: member.id });
  }
  if (events.length) resolveVictory(state);
  return events;
}

// The petrify config a raging Treant declared on its rage art. Read live so the numbers
// stay in the unit definition.
function petrifyConfig(unit) {
  return getUnitType(unit.type).rageArt?.petrify ?? null;
}

// One petrified turn: restore HP/MP to the statue and to allies within radius, drain HP/MP
// from enemies within radius, then count down and wake the unit when the timer expires.
function applyPetrifyTurn(state, unit, events) {
  const cfg = petrifyConfig(unit);
  if (!cfg) { unit.statuses = (unit.statuses ?? []).filter((s) => s.type !== "petrified"); return; }
  const radius = Math.max(0, Number(cfg.radius) || 0);

  const beforeHp = unit.hp;
  const beforeMp = unit.mp;
  restoreHp(state, unit, unit, cfg.selfRestore?.hp ?? 0);
  restoreMp(state, unit, unit, cfg.selfRestore?.mp ?? 0);

  const alliesHealed = [];
  const enemiesDrained = [];
  for (const other of livingUnits(state)) {
    if (other.id === unit.id) continue;
    if (chebyshevDistance(unit.position, other.position) > radius) continue;
    if (areAllies(other, unit)) {
      const b = other.hp + other.mp;
      restoreHp(state, unit, other, cfg.allyRestore?.hp ?? 0);
      restoreMp(state, unit, other, cfg.allyRestore?.mp ?? 0);
      if (other.hp + other.mp > b) alliesHealed.push(other.id);
    } else if (areEnemies(other, unit) && !isInvulnerable(other)) {
      const dh = Math.min(other.hp, Math.max(0, Number(cfg.enemyDrain?.hp) || 0));
      const dm = Math.min(other.mp, Math.max(0, Number(cfg.enemyDrain?.mp) || 0));
      other.hp = Math.max(0, other.hp - dh);
      other.mp = Math.max(0, other.mp - dm);
      if (dh > 0 || dm > 0) enemiesDrained.push(other.id);
    }
  }

  const remaining = (Number.isFinite(unit.petrified) ? unit.petrified : (cfg.turns ?? 1)) - 1;
  if (remaining <= 0) {
    unit.statuses = (unit.statuses ?? []).filter((s) => s.type !== "petrified");
    delete unit.petrified;
  } else {
    unit.petrified = remaining;
  }
  events.push({
    type: "PETRIFY_PULSE",
    unitId: unit.id,
    hpRestored: unit.hp - beforeHp,
    mpRestored: unit.mp - beforeMp,
    alliesHealed,
    enemiesDrained,
    woke: remaining <= 0
  });
  resolveVictory(state);
}

function applySquadTurnChargeStatuses(state, player) {
  const events = [];
  const aliveBefore = snapshotAlive(state);
  // Track the applier of the most recent damaging tick per unit — that is the tick
  // that killed anyone who ends this pass at 0 HP.
  const lastApplierByUnit = new Map();
  for (const member of livingUnits(state, player)) {
    // Petrify (Treant): an invulnerable statue shrugs off poison/DOT ticks too.
    if (isInvulnerable(member)) continue;
    const ticks = resolveTurnStartStatuses(member);
    for (const tick of ticks) lastApplierByUnit.set(tick.unitId, tick.appliedBy ?? null);
    events.push(...ticks);
  }
  // Credit per victim so two units poisoned by different enemies attribute correctly.
  // An untagged poison (pre-existing save, authored mission status) has no applier and
  // falls through as environmental rather than crediting the wrong unit.
  for (const [unitId, appliedBy] of lastApplierByUnit) {
    // Scope the sweep to this one victim: creditDeaths skips any unit missing from the
    // snapshot, so a one-entry map attributes exactly this death and no other.
    const scoped = new Map([[unitId, aliveBefore.get(unitId) ?? false]]);
    creditDeaths(state, scoped, events, {
      killerId: appliedBy,
      cause: appliedBy ? CAUSE.STATUS : CAUSE.ENVIRONMENT,
    });
  }
  if (events.length) resolveVictory(state);
  return events;
}

// Enchanted Roots (Treant): a weather-attuned unit restores HP/MP each full turn cycle
// while the matching weather holds. Data-first off the weatherAffinity passive, so a
// no-op for every unit without it.
function applyWeatherAffinityRegen(state, events) {
  for (const unit of livingUnits(state)) {
    if (isInvulnerable(unit)) continue;
    const affinity = getWeatherAffinityRestore(unit, state);
    const restore = { hp: affinity.hp, mp: affinity.mp };
    if (restore.hp <= 0 && restore.mp <= 0) continue;
    const hp = restoreHp(state, unit, unit, restore.hp);
    const mp = restoreMp(state, unit, unit, restore.mp);
    const hpRestored = hp.hpRestored + mp.hpRestored;
    const mpRestored = hp.mpRestored + mp.mpRestored;
    if (hpRestored > 0 || mpRestored > 0) {
      events.push({ type: "WEATHER_REGEN", unitId: unit.id, hpRestored, mpRestored });
    }
  }
}

function applyWeatherPassiveCycleRegen(state, events) {
  for (const unit of livingUnits(state)) {
    if (isInvulnerable(unit)) continue;
    const restore = getWeatherPassiveRestore(unit, state);
    if (restore.hp <= 0 && restore.mp <= 0) continue;
    const hp = restoreHp(state, unit, unit, restore.hp);
    const mp = restoreMp(state, unit, unit, restore.mp);
    const hpRestored = hp.hpRestored + mp.hpRestored;
    const mpRestored = hp.mpRestored + mp.mpRestored;
    if (hpRestored > 0 || mpRestored > 0) {
      events.push({ type: "WEATHER_REGEN", unitId: unit.id, hpRestored, mpRestored });
    }
  }
}

function didTurnCycleWrap(state, previousPlayer) {
  const order = state.turnOrder?.length ? state.turnOrder : [1, 2];
  const previousIndex = order.indexOf(previousPlayer);
  const currentIndex = order.indexOf(state.currentPlayer);
  if (previousIndex < 0 || currentIndex < 0) return false;
  return currentIndex <= previousIndex;
}

function releaseStunLoopGuard(state) {
  const unitIds = [];
  for (const member of livingUnits(state, state.currentPlayer)) {
    if (!takesTurns(member)) continue;
    // A safety valve for a pathological all-incapacitated board: release both stun and
    // petrify so the turn can resolve.
    member.statuses = (member.statuses ?? []).filter((status) => status.type !== "stun" && status.type !== "petrified");
    if (Number.isFinite(member.petrified)) delete member.petrified;
    member.spent = false;
    unitIds.push(member.id);
  }
  if (unitIds.length) {
    appendPendingRolloverEvents(state, [{
      type: "STUN_LOOP_GUARD",
      player: state.currentPlayer,
      unitIds
    }]);
  }
}

function playerHasLivingTurnUnits(state, player) {
  return livingUnits(state, player).some(takesTurns);
}

export function nextActivePlayer(state, fromPlayer) {
  const order = state.turnOrder?.length ? state.turnOrder : [1, 2];
  const start = Math.max(0, order.indexOf(fromPlayer));
  for (let step = 1; step <= order.length; step += 1) {
    const player = order[(start + step) % order.length];
    if (playerHasLivingTurnUnits(state, player)) return player;
  }
  return fromPlayer;
}

// Pass the turn to the other player once the current one has no unspent living
// commander left. Summons never take turns, so they neither keep the turn open nor
// get their spent flag reset.
function advanceTurnIfExhausted(state) {
  if (state.phase !== "playing") return;
  let rollovers = 0;
  while (
    state.phase === "playing" &&
    !livingUnits(state, state.currentPlayer).some((member) => takesTurns(member) && !member.spent)
  ) {
    if (rollovers >= MAX_STUN_FAST_FORWARD_ROLLOVERS) {
      releaseStunLoopGuard(state);
      break;
    }
    const previousPlayer = state.currentPlayer;
    state.currentPlayer = nextActivePlayer(state, state.currentPlayer);
    state.turnNumber += 1;
    const turnCycleWrapped = didTurnCycleWrap(state, previousPlayer);
    rollovers += 1;
    for (const member of livingUnits(state, state.currentPlayer)) if (takesTurns(member)) member.spent = false;
    appendPendingRolloverEvents(state, applySquadTurnChargeStatuses(state, state.currentPlayer));
    const fireEvents = [];
    applyFinalBattleVoidPressure(state, previousPlayer, fireEvents);
    applyFireTick(state, fireEvents);
    applyBlackDeathTick(state, fireEvents);
    applyTimeStealTick(state, fireEvents);
    applyAutoStrikeTick(state, fireEvents);
    applyRandomFireTick(state, fireEvents);
    applyWeatherCycleTick(state, fireEvents);
    if (turnCycleWrapped) {
      applyWeatherAffinityRegen(state, fireEvents);
      applyWeatherPassiveCycleRegen(state, fireEvents);
    }
    resolveVictory(state);
    appendPendingRolloverEvents(state, fireEvents);
    appendPendingRolloverEvents(state, autoSpendStunnedUnits(state, state.currentPlayer));
    openAutomaticFirstActivation(state);
  }
}

export function resolveVictory(state, options = {}) {
  const actionTakerTeam = Number.isInteger(options.actionTakerTeam) ? options.actionTakerTeam : null;
  const roninDuel = state.missionRules?.roninDuel;
  if (roninDuel) {
    const ronin = state.units.find((unit) => unit.id === roninDuel.roninId) ??
      state.units.find((unit) => unit.player === 2 && unit.type === "ronin");
    const player = state.units.find((unit) => unit.id === roninDuel.playerId) ??
      state.units.find((unit) => unit.player === 1);
    if (ronin && player && ronin.hp <= 0 && player.hp <= 0) {
      state.winner = 2;
      state.phase = "complete";
      state.activation = null;
      return;
    }
  }
  // Void Ridden Castle is a two-part battle. Phase 1 (Summoner + three Nemesis) does NOT
  // end when the last enemy falls: the Summoner refuses the finish, splits into four, and
  // the match continues as phase 2. We can't just decline to set a winner — an enemy team
  // with no living bodies stalls advanceTurnIfExhausted — so phase 1 completes normally
  // and flags `pendingSplit`. The UI layer (main.js) sees the flag, plays the split beat,
  // and calls applyVoidCastleSplit to reopen the board. Nothing else in the engine has to
  // know the match can come back from "complete".
  const voidCastle = state.missionRules?.voidCastleTrial;
  if (voidCastle) {
    const playerAlive = livingUnits(state, 1).some(sustainsVictory);
    if (!playerAlive) {
      state.winner = 2;
      state.phase = "complete";
      state.activation = null;
      return;
    }
    if (voidCastle.phase === 1) {
      if (livingUnits(state, 2).some(sustainsVictory)) return;
      voidCastle.pendingSplit = true;
      state.winner = 1;
      state.phase = "complete";
      state.activation = null;
      return;
    }
    // Phase 2: only the real Summoner sustains the fight. Felling him collapses every
    // decoy with him — the same rule the Monk's temple trial uses.
    const realSummoner = state.units.find((unit) => unit.id === voidCastle.realSummonerId);
    if (realSummoner && realSummoner.hp <= 0) {
      for (const unit of state.units) {
        if (unit.trialDecoySummoner && unit.hp > 0) unit.hp = 0;
      }
      state.winner = 1;
      state.phase = "complete";
      state.activation = null;
    }
    return;
  }
  // The Final Battle is a five-stage battle (see missions/the-final-battle/stages.js). Every
  // stage but the last ends the same way the castle's phase 1 does: the board is cleared, but
  // the MATCH is not over. We can't simply decline to set a winner — a side with no living
  // bodies stalls advanceTurnIfExhausted — so the stage completes normally and flags
  // `pendingStage`; main.js reverts the win and drives the blackout into the next stage.
  //
  // The party is checked FIRST, and that is the whole edge case of the finale: Blacksword's
  // Banish spends every point of his own HP to erase every enemy standing on a dark tile. If
  // he catches all four, nobody is left standing at all — and the side that had to survive is
  // the party. He does not win by outliving you. He wins by taking you with him.
  const finalBattle = state.missionRules?.finalBattle;
  if (finalBattle) {
    const playerAlive = livingUnits(state, 1).some(sustainsVictory);
    if (!playerAlive) {
      state.winner = 2;
      state.phase = "complete";
      state.activation = null;
      return;
    }
    if (livingUnits(state, 2).some(sustainsVictory)) return;
    // `lastStage` rides the rules block rather than being imported, so core stays free of a
    // dependency on the campaign layer (the castle's phase check does the same).
    if (finalBattle.stage < finalBattle.lastStage) finalBattle.pendingStage = true;
    state.winner = 1;
    state.phase = "complete";
    state.activation = null;
    return;
  }
  const monkTrial = state.missionRules?.monkTrial;
  if (monkTrial?.realMonkId) {
    const playerAlive = livingUnits(state, 1).some(sustainsVictory);
    if (!playerAlive) {
      state.winner = 2;
      state.phase = "complete";
      state.activation = null;
      return;
    }
    const realMonk = state.units.find((unit) => unit.id === monkTrial.realMonkId);
    if (realMonk && realMonk.hp <= 0) {
      for (const unit of state.units) {
        if (unit.trialFakeMonk && unit.hp > 0) unit.hp = 0;
      }
      state.winner = 1;
      state.phase = "complete";
      state.activation = null;
      return;
    }
  }
  // Defeat is decided by living units that can actually win, not raw bodies: a player
  // whose only survivor is a turn-less summon or non-combatant commander has lost.
  const livingTeams = new Set(livingUnits(state).filter(sustainsVictory).map(teamOfUnit));
  if (livingTeams.size === 1) {
    state.winner = [...livingTeams][0];
    state.phase = "complete";
    state.activation = null;
  } else if (livingTeams.size === 0 && actionTakerTeam !== null) {
    state.winner = actionTakerTeam;
    state.phase = "complete";
    state.activation = null;
  }
}
