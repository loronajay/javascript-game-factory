import { getArtMpCost, getInitialMp, getSoulShuffleChoices, getUnitType } from "../unitCatalog.js";
import { cloneState, findUnit, teamOfUnit } from "../state.js";
import { getSummonPlacementTiles } from "../../rules/arts.js";
import { positionKey } from "../../rules/movement.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

function createSummon(id, type, player, team, position, summonerId, skin = null, { spent = true, ghost = false, ghostArtId = null, forceRage = false } = {}) {
  const definition = getUnitType(type);
  return {
    id,
    player,
    team,
    type,
    skin,
    position: { ...position },
    hp: forceRage ? Math.min(5, definition.stats.maxHp) : definition.stats.maxHp,
    mp: getInitialMp(definition),
    statModifiers: {},
    statuses: [],
    linkedStatMods: [],
    defending: false,
    mageChargeCount: 0,
    stance: null,
    rainCharged: 0,
    weather: null,
    lastWeather: null,
    weatherMoveCharged: 0,
    command: null,
    previousCommand: null,
    commandTurn: 0,
    volcanicCounter: 0,
    emergencySnackCount: 0,
    stationaryStrength: 0,
    desperationShotSpent: false,
    desperationRageArmed: false,
    skipNextActivation: false,
    realmTraversalCharged: false,
    realmTraversalLocked: false,
    studiedTargetId: null,
    guaranteedCritCharged: false,
    spent,
    summonerId,
    ghost,
    ghostArtId
  };
}

export function resolveSummonGhoul(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getSummonPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const maxActive = art.summon?.maxActive ?? 1;
  const activeSummons = state.units.filter((unit) => unit.hp > 0 && unit.summonerId === actorState.id).length;
  if (activeSummons >= maxActive) {
    return reject(ERR.SUMMON_LIMIT);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  // Unique id across this Necromancer's whole summon history (dead Ghouls stay in
  // the units array), so findUnit never collides with a previous corpse.
  const seq = next.units.filter((unit) => unit.summonerId === actor.id).length;
  const ghoulId = `${actor.id}-${art.summon.type}-${seq}`;
  const ghoul = createSummon(ghoulId, art.summon.type, actor.player, teamOfUnit(actor), placement, actor.id, actor.skin ?? null);
  next.units.push(ghoul);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    summonedUnitId: ghoulId,
    position: { ...placement },
    mpCost: cost
  }]);
}

// Build Cover: drop a destructible wall on a clear tile within range. Spends the
// activation and MP like any active ART; the wall lives in state.tileObjects.

export function resolveSummonGhost(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getSummonPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }

  const storedChoices = Array.isArray(actorState.soulShuffleChoices) && actorState.soulShuffleChoices.length
    ? [...actorState.soulShuffleChoices]
    : null;
  const preview = storedChoices
    ? { choices: storedChoices, rngState: state.rngState }
    : getSoulShuffleChoices(actorState, state.rngState);
  const chosenType = command.summonType ?? preview.choices[0];
  if (!preview.choices.includes(chosenType)) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  if (!storedChoices) next.rngState = preview.rngState;
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.lastGhostType = chosenType;
  actor.soulShuffleChoices = null;
  actor.defending = false;

  const seq = next.units.filter((unit) => unit.summonerId === actor.id && unit.ghost).length;
  const ghostId = `${actor.id}-ghost-${seq}`;
  const ghost = createSummon(ghostId, chosenType, actor.player, teamOfUnit(actor), placement, actor.id, null, {
    spent: false,
    ghost: true,
    ghostArtId: art.id,
    forceRage: art.id === "beckon"
  });
  // A summoner may carry a table of corrupted ART names to hand down to whatever it calls
  // up (Void Ridden Castle's decoy Summoners — their ghosts misname their own ARTS, which
  // is the tell that traces back to the decoy). The ghost only ever looks up ids it owns.
  if (actor.ghostFakeArtNames) ghost.fakeArtNames = { ...actor.ghostFakeArtNames };
  next.units.push(ghost);
  next.activation = {
    unitId: ghost.id,
    origin: { ...ghost.position },
    moved: false,
    primaryUsed: false,
    spellUsed: false,
    bonusActionGroups: [],
    summonerId: actor.id,
    summonerArtId: art.id
  };
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    summonedUnitId: ghostId,
    summonedType: chosenType,
    choices: [...preview.choices],
    position: { ...placement },
    mpCost: cost,
    ghostTurn: true
  }]);
}
