import {
  attack,
  attackTile,
  cancelMove,
  defend,
  finishActivation,
  moveUnit,
  useArt,
} from "../core/commands.js";
import { applyCommand } from "../core/reducer.js";
import {
  areAllies,
  areEnemies,
  findUnit,
  isWallAt,
  unitAt,
} from "../core/state.js";
import {
  getArt,
  getAvailableArts,
  getEffectiveStats,
  getSoulShuffleChoices,
  getUnitType,
} from "../core/unitCatalog.js";
import {
  getConeOriginForTarget,
  getFirePlacementTiles,
  getFlightTiles,
  getFootworkStepOptions,
  getFootworkSteps,
  getLegalFleeTiles,
  getLineTargets,
  getProtectLandingTiles,
  getRevivePlacementTiles,
  getReviveTargets,
  getRushStepOptions,
  getRushSteps,
  getSelfBlastRadius,
  getSummonPlacementTiles,
  getTargetedBlastAimTiles,
  getVolleyShotOriginForTarget,
  getWallPlacementTiles,
} from "../rules/arts.js";
import { isWallBetween } from "../rules/combat.js";
import { canTrample, chebyshevDistance, getTrampleMoveOptions, positionKey } from "../rules/movement.js";
import { isTempoBattle } from "../core/tempoBattle.js";
import { teamColor } from "../match/matchBuilder.js";
import { createBoardMetrics } from "./isometric.js";
import { isHealArtConfirmTile } from "./boardRenderer.js";
import { unitCenter } from "./battleEventPresenter.js";

export function createBattleInputController({
  runtime,
  interaction,
  selectedUnit = () => null,
  inputLocked = () => false,
  isLocalTempoCommander = () => true,
  beginUnit = () => {},
  dispatch = () => false,
  render = () => {},
  setMessage = () => {},
  consumeTutorialPrompt = (fallback) => fallback,
  resolveCombat = async () => false,
  resolveInstantArt = async () => false,
  resolveWallAttack = async () => false,
  maybeAutoFinish = () => {},
  effects = {},
  audio = { play() {} },
  playRolloverFx = async () => {},
  openChoiceModal = async () => null,
  finishNow = () => {},
  resumeActiveMusic = () => {},
}) {
  async function handleTile(position) {
    // Tempo: clicking one of my ready units always commands it instantly — even mid-animation,
    // even while another of mine is selected (it switches). beginTempoUnit frees the slot and
    // gates ownership/readiness/tempoBusy itself.
    if (isTempoBattle(runtime.state)) {
      const clicked = unitAt(runtime.state, position);
      if (clicked && clicked.id !== interaction.selectedId && isLocalTempoCommander(clicked)) {
        beginUnit(clicked); render(); return;
      }
    }
    if (inputLocked()) return;
    const unit = selectedUnit();
    if (!unit) {
      const clicked = unitAt(runtime.state, position);
      if (clicked) beginUnit(clicked);
      render();
      return;
    }
    if (interaction.mode === "move" && canTrample(unit)) {
      // RAGE Trample (Fat Knight): targeted exactly like Footwork/Stumble — one
      // adjacent tile at a time via interaction.footworkPath, not a single click straight to a
      // far destination. The move commits only after the full movement-length path.
      const options = getTrampleMoveOptions(runtime.state, unit, interaction.footworkPath);
      if (!options.has(positionKey(position))) {
        setMessage("Trample: choose the next highlighted tile.", true);
        render();
        return;
      }
      interaction.footworkPath.push(position);
      const maxSteps = getEffectiveStats(unit, runtime.state).moveRange;
      if (interaction.footworkPath.length < maxSteps) {
        const crossedEnemy = Boolean(unitAt(runtime.state, position));
        setMessage(`Trample: ${crossedEnemy ? "enemy crossed. " : ""}Choose step ${interaction.footworkPath.length + 1} of ${maxSteps}.`);
        render();
        return;
      }
      const from = { ...unit.position };
      const actorBefore = unit;
      const path = [...interaction.footworkPath];
      const dest = path[path.length - 1];
      interaction.footworkPath = [];
      if (dispatch(moveUnit(runtime.state.currentPlayer, unit.id, dest.x, dest.y, path), { deferRolloverFx: true })) {
        const moveEvents = [...runtime.lastDispatchEvents];
        const moved = moveEvents.find((e) => e.type === "UNIT_MOVED");
        const completesActivation = runtime.state.activation?.primaryUsed;
        interaction.mode = null;
        setMessage(consumeTutorialPrompt(completesActivation ? "Moved. Activation complete." : "Moved. Now attack or defend to finish."));
        interaction.resolving = true;
        render();
        // Give the harmed tiles the same dash + contact-hit presentation Footwork/
        // Stumble use, instead of silently sliding past the units it just damaged.
        if (moved?.harmed?.length) {
          const metrics = createBoardMetrics(runtime.state.size);
          const harmedByTile = new Map();
          for (const id of moved.harmed) {
            const target = findUnit(runtime.state, id);
            if (target) harmedByTile.set(positionKey(target.position), target);
          }
          await effects.footworkCharge(actorBefore, moved.path, async (tile) => {
            const target = harmedByTile.get(positionKey(tile));
            if (!target) return;
            const center = unitCenter(metrics, target);
            audio.play("attackHit");
            effects.impact(center, false, "true");
            await effects.hitRecoil(target.id, target.position, false);
            const amount = moved.damageByTarget?.[target.id] ?? 0;
            await effects.floatText(center, `-${amount}`, "#ff7684");
            if (target.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
          });
        } else {
          await effects.animateMovement(unit.id, from, dest);
        }
        await playRolloverFx(moveEvents);
        interaction.resolving = false;
        if (completesActivation) maybeAutoFinish();
        render();
        return;
      }
      render();
      return;
    } else if (interaction.mode === "move") {
      const from = { ...unit.position };
      if (dispatch(moveUnit(runtime.state.currentPlayer, unit.id, position.x, position.y), { deferRolloverFx: true })) {
        const moveEvents = [...runtime.lastDispatchEvents];
        const completesActivation = runtime.state.activation?.primaryUsed;
        interaction.mode = null;
        setMessage(consumeTutorialPrompt(completesActivation ? "Moved. Activation complete." : "Moved. Now attack or defend to finish."));
        interaction.resolving = true;
        render();
        await effects.animateMovement(unit.id, from, position);
        await playRolloverFx(moveEvents);
        interaction.resolving = false;
        if (completesActivation) maybeAutoFinish();
        render();
        return;
      }
    } else if (interaction.mode === "attack") {
      const target = unitAt(runtime.state, position);
      if (target) {
        if (await resolveCombat(attack(runtime.state.currentPlayer, unit.id, target.id))) {
          interaction.mode = null;
          setMessage(consumeTutorialPrompt("Attack resolved."));
          maybeAutoFinish();
        }
      } else if (isWallAt(runtime.state, position)) {
        if (await resolveWallAttack(attackTile(runtime.state.currentPlayer, unit.id, position.x, position.y))) {
          interaction.mode = null;
          maybeAutoFinish();
        }
      }
    } else if (interaction.mode === "footwork") {
      const options = getFootworkStepOptions(runtime.state, unit, interaction.footworkPath);
      if (!options.has(positionKey(position))) { setMessage("Choose the next highlighted Footwork tile.", true); }
      else {
        interaction.footworkPath.push(position);
        const steps = getFootworkSteps(unit, runtime.state);
        if (interaction.footworkPath.length === steps) {
          if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "footwork", [...interaction.footworkPath])))
            setMessage("Footwork complete. This unit's activation is complete.");
        } else {
          setMessage(`Footwork: choose step ${interaction.footworkPath.length + 1} of ${steps}.`);
        }
      }
    } else if (interaction.mode?.startsWith("art:") && getAvailableArts(unit).find((a) => a.id === interaction.mode.slice("art:".length))?.targeting?.shape === "rushPath") {
      const artId = interaction.mode.slice("art:".length);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
      const options = getRushStepOptions(runtime.state, unit, interaction.footworkPath, art);
      if (!options.has(positionKey(position))) { setMessage(`${art.name}: choose the next highlighted tile.`, true); }
      else {
        interaction.footworkPath.push(position);
        const steps = getRushSteps(unit, art, runtime.state);
        if (interaction.footworkPath.length === steps) {
          if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, [...interaction.footworkPath])))
            setMessage(`${art.name} complete. This unit's activation is complete.`);
        } else {
          setMessage(`${art.name}: choose step ${interaction.footworkPath.length + 1} of ${steps}.`);
        }
      }
    } else if (interaction.mode?.startsWith("art:") && (() => {
      const art = getArt(unit.type, interaction.mode.slice("art:".length));
      return art?.targeting?.shape === "flee" || art?.resolution === "flee";
    })()) {
      const artId = interaction.mode.slice("art:".length);
      const art = getArt(unit.type, artId);
      const fleeLegal = getLegalFleeTiles(runtime.state, unit, art);
      if (!fleeLegal.has(positionKey(position))) {
        setMessage(`${art.name}: choose a highlighted empty tile to teleport to.`, true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetPosition: position }))) {
        interaction.mode = null;
        setMessage(`${art.name} complete. This unit's activation is complete.`);
      }
    } else if (interaction.mode === "art:flight") {
      const flightLegal = getFlightTiles(runtime.state, unit, getArt(unit.type, "flight"));
      if (!flightLegal.has(positionKey(position))) {
        setMessage("Flight: choose a highlighted empty tile to fly onto.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "flight", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Flight complete. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:volley-shot") {
      const origin = getVolleyShotOriginForTarget(runtime.state, unit, position);
      if (!origin) {
        setMessage("Click a tile inside a highlighted Volley Shot cone.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "volley-shot", { targetPosition: origin }))) {
        setMessage("Volley Shot resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode?.startsWith("art:") && getAvailableArts(unit).find((a) => a.id === interaction.mode.slice("art:".length))?.targeting?.shape === "cone") {
      // Any other cone-shaped ART (e.g. Flamethrower) — same aim-direction targeting
      // as Volley Shot, generalized instead of hardcoded to that one art id.
      const artId = interaction.mode.slice("art:".length);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
      const origin = getConeOriginForTarget(runtime.state, unit, position, art);
      if (!origin) {
        setMessage(`Click a tile inside a highlighted ${art.name} cone.`, true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetPosition: origin }))) {
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else if (interaction.mode?.startsWith("art:") && (() => {
      const art = getArt(unit.type, interaction.mode.slice("art:".length));
      return art?.targeting?.shape === "placement" && (art.resolution === "summon" || art.resolution === "summonGhost");
    })()) {
      const artId = interaction.mode.slice("art:".length);
      const art = getArt(unit.type, artId);
      const placement = getSummonPlacementTiles(runtime.state, unit, art);
      if (!placement.has(positionKey(position))) {
        setMessage(`${art.name}: choose a highlighted empty tile.`, true);
      } else if (art.resolution === "summonGhost") {
        const shuffled = getSoulShuffleChoices(unit, runtime.state.rngState).choices;
        setMessage(`${art.name}: choose a spirit to call.`);
        render();
        const summonType = await openChoiceModal({
          title: `${art.name} — Soul Shuffle`,
          subtitle: "Choose one ghost. It takes a full turn, then dissipates.",
          accent: teamColor(unit.player),
          choices: shuffled.map((type) => ({
            value: type,
            label: getUnitType(type).name,
            sub: getUnitType(type).classType,
            type
          }))
        });
        if (!summonType || interaction.mode !== `art:${artId}`) {
          interaction.mode = null;
          setMessage(`${art.name} cancelled. Choose an action below.`);
          render();
          return;
        }
        if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetPosition: position, summonType }))) {
          interaction.mode = null;
          setMessage(artId === "beckon"
            ? `${getUnitType(summonType).name} beckoned as a raging ghost. Take its turn.`
            : `${getUnitType(summonType).name} called as a ghost. Take its turn.`);
        }
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetPosition: position }))) {
        interaction.mode = null;
        setMessage(`${art.name} complete. This unit's activation is complete.`);
      }
    } else if (interaction.mode === "art:build-cover") {
      const placement = getWallPlacementTiles(runtime.state, unit, getUnitType(unit.type).arts.find((a) => a.id === "build-cover"));
      if (!placement.has(positionKey(position))) {
        setMessage("Build Cover: choose a highlighted empty tile to raise the wall.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "build-cover", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Cover raised. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:shaft-prop") {
      const placement = getWallPlacementTiles(runtime.state, unit, getUnitType(unit.type).arts.find((a) => a.id === "shaft-prop"));
      if (!placement.has(positionKey(position))) {
        setMessage("Shaft Prop: choose a highlighted empty tile to raise the wall.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "shaft-prop", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Shaft prop raised. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:throw-cigar") {
      const placement = getFirePlacementTiles(runtime.state, unit, getUnitType(unit.type).arts.find((a) => a.id === "throw-cigar"));
      if (!placement.has(positionKey(position))) {
        setMessage("Throw Cigar: choose a highlighted tile to set alight.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "throw-cigar", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Fire started. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:age") {
      // Ally-or-enemy targeting, then a STR/DEF stat pick. A wall blocks the cast.
      const target = unitAt(runtime.state, position);
      const inReach = target && chebyshevDistance(unit.position, target.position) <= getEffectiveStats(unit, runtime.state).attackRange &&
        !isWallBetween(runtime.state, unit.position, target.position, unit);
      if (!inReach) {
        setMessage("Age: click a highlighted ally or enemy in range.", true);
      } else {
        const ally = areAllies(target, unit);
        const stat = await openChoiceModal({
          title: `Age — ${ally ? "empower" : "weaken"} ${target.nickname || getUnitType(target.type).name}`,
          subtitle: ally ? "Grant +1 to a stat until Father Time falls." : "Drain 1 from a stat until Father Time falls.",
          accent: teamColor(unit.player),
          choices: [
            { value: "strength", label: "Strength", sub: ally ? "+1 STR" : "−1 STR" },
            { value: "defense", label: "Defense", sub: ally ? "+1 DEF" : "−1 DEF" }
          ]
        });
        if (stat && interaction.mode === "art:age" && await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "age", { targetId: target.id, stat }))) {
          interaction.mode = null;
          setMessage("Age resolved. This unit's activation is complete.");
        }
      }
    } else if (interaction.mode === "art:time-stretch") {
      // Ally → +1 MOVE; enemy → Slow. A wall blocks the enemy path (not a friendly haste).
      const target = unitAt(runtime.state, position);
      const enemy = target && areEnemies(unit, target);
      const inReach = target && chebyshevDistance(unit.position, target.position) <= getEffectiveStats(unit, runtime.state).attackRange &&
        !(enemy && isWallBetween(runtime.state, unit.position, target.position, unit));
      if (!inReach) {
        setMessage("Time Stretch: click a highlighted ally or enemy in range.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "time-stretch", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Time Stretch resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:anoint") {
      // Friendly-only buff: click a highlighted ally in range (never self). A wall does not
      // block a friendly cast.
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "anoint");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Anoint: click a highlighted ally in range (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "anoint", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Anoint resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:purify") {
      // Friendly-only cleanse: click a highlighted ally in range (never self).
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "purify");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Purify: click a highlighted ally in range (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "purify", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Purify resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:cleanse") {
      // Friendly-only negative-status cleanse: click a highlighted ally in range (never self).
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "cleanse");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Cleanse: click a highlighted ally in range (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "cleanse", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Cleanse resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:focus-prayer") {
      // Friendly-only heal-or-backfire prayer: click a highlighted ally in range (never self).
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "focus-prayer");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Focus Prayer: click a highlighted ally in range (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "focus-prayer", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Focus Prayer resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:tether-grab") {
      // Grab the first ally OR enemy on a straight ray within range.
      const target = unitAt(runtime.state, position);
      const targets = getLineTargets(runtime.state, unit, getArt(unit.type, "tether-grab").targeting.range, { includeAllies: true });
      if (!target || !targets.some((entry) => entry.unit.id === target.id)) {
        setMessage("Tether Grab: click a highlighted ally or enemy on a straight line.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "tether-grab", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Tether Grab resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:rocket-punch") {
      // Punch the first ENEMY on a straight ray (an ally on the ray blocks the shot).
      const target = unitAt(runtime.state, position);
      const targets = getLineTargets(runtime.state, unit, getArt(unit.type, "rocket-punch").targeting.range, { includeAllies: false });
      if (!target || !targets.some((entry) => entry.unit.id === target.id)) {
        setMessage("Rocket Punch: click a highlighted enemy on a straight line.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "rocket-punch", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Rocket Punch resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:thunderous-charge") {
      // Charge a highlighted aim tile (never an enemy's tile); the blast hits a 2-tile radius.
      const art = getAvailableArts(unit).find((a) => a.id === "thunderous-charge");
      if (!art || !getTargetedBlastAimTiles(runtime.state, unit, art).has(positionKey(position))) {
        setMessage("Thunderous Charge: click a highlighted tile (not one an enemy stands on).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "thunderous-charge", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Thunderous Charge resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:smoke-bomb-riot") {
      // Riot Cop's Smoke Bomb: pick a highlighted clear tile within range (targetedBlast).
      const art = getAvailableArts(unit).find((a) => a.id === "smoke-bomb-riot");
      if (!art || !getTargetedBlastAimTiles(runtime.state, unit, art).has(positionKey(position))) {
        setMessage("Smoke Bomb: click a highlighted empty tile within range.", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "smoke-bomb-riot", { targetPosition: position }))) {
        interaction.mode = null;
        setMessage("Smoke Bomb thrown. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:enrich") {
      // Treant's Enrich: click a highlighted ally in range to pour MP (or HP) into (never self).
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "enrich");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Enrich: click a highlighted ally in range (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "enrich", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Enrich resolved. This unit's activation is complete.");
      }
    } else if (interaction.mode === "art:cover") {
      // Riot Cop's Cover: click an adjacent ally to swap with (never yourself).
      const target = unitAt(runtime.state, position);
      const art = getArt(unit.type, "cover");
      const reach = art?.targeting?.range ?? getEffectiveStats(unit, runtime.state).attackRange;
      const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
        chebyshevDistance(unit.position, target.position) <= reach;
      if (!inReach) {
        setMessage("Cover: click a highlighted adjacent ally to swap with (not yourself).", true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, "cover", { targetId: target.id }))) {
        interaction.mode = null;
        setMessage("Cover: you swap in and brace. This unit's activation is complete.");
      }
    } else if (interaction.mode?.startsWith("art:") &&
      getAvailableArts(unit).find((a) => a.id === interaction.mode.slice("art:".length))?.targeting?.shape === "revive") {
      const artId = interaction.mode.slice("art:".length);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
      const placement = getRevivePlacementTiles(runtime.state, unit, art);
      if (!interaction.reviveTargetId) {
        setMessage(`${art.name}: choose a fallen ally first.`, true);
      } else if (!placement.has(positionKey(position))) {
        setMessage(`${art.name}: click a highlighted empty tile within ${art.targeting?.radius ?? 3}.`, true);
      } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetId: interaction.reviveTargetId, targetPosition: position }))) {
        interaction.mode = null;
        interaction.reviveTargetId = null;
        setMessage("An ally returns to the field. This unit's activation is complete.");
      }
    } else if (interaction.mode?.startsWith("art:")) {
      const artId = interaction.mode.slice("art:".length);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
      if (art?.targeting?.shape === "nukeAura") {
        // Self-centred blast: any click inside the previewed footprint detonates it.
        const radius = getSelfBlastRadius(runtime.state, unit, art);
        if (chebyshevDistance(unit.position, position) > radius) {
          setMessage(`${art.name}: click inside the highlighted blast zone to detonate.`, true);
        } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId))) {
          interaction.mode = null;
          setMessage(`${art.name} resolved. This unit's activation is complete.`);
        }
      } else if (art?.targeting?.shape === "lineBurst") {
        // Self-centred line burst (Pyroclasm): any click confirms the eruption.
        if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId))) {
          interaction.mode = null;
          setMessage(`${art.name} resolved. This unit's activation is complete.`);
        }
      } else if (art?.effect?.type === "healAllies") {
        if (!isHealArtConfirmTile(runtime.state, unit, art, position)) {
          setMessage(`${art.name}: click a highlighted heal tile to confirm.`, true);
        } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId))) {
          interaction.mode = null;
          setMessage(`${art.name} resolved. This unit's activation is complete.`);
        }
      } else if (art?.targeting?.shape === "protectAlly") {
        const key = positionKey(position);
        const target = runtime.state.units.find((candidate) =>
          candidate.hp > 0 &&
          candidate.player === unit.player &&
          candidate.id !== unit.id &&
          getProtectLandingTiles(runtime.state, unit, candidate, art).has(key));
        if (!target) {
          setMessage(`${art.name}: click a highlighted landing tile beside an ally.`, true);
        } else if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetId: target.id }))) {
          interaction.mode = null;
          setMessage(`${art.name} resolved. This unit's activation is complete.`);
        }
      } else {
        const target = unitAt(runtime.state, position);
        let resolved = false;
        if (art?.id === "blasting-cap" && isWallAt(runtime.state, position)) {
          resolved = await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId, { targetPosition: position }));
        } else if (target) {
          const command = useArt(runtime.state.currentPlayer, unit.id, artId, { targetId: target.id });
          const peek = applyCommand(runtime.state, command);
          const rolled = (peek.events ?? []).some((event) => event.type === "ART_RESOLVED" && "hit" in event);
          resolved = rolled ? await resolveCombat(command) : await resolveInstantArt(command);
        }
        if (resolved) {
          const artName = art?.name ?? artId;
          setMessage(`${artName} resolved. This unit's activation is complete.`);
        }
      }
    } else {
      const clicked = unitAt(runtime.state, position);
      if (clicked && clicked.player === runtime.state.currentPlayer && !clicked.spent && clicked.hp > 0 && clicked.id !== unit.id) {
        // Switch to another ready friendly unit (only allowed if current activation hasn't acted yet)
        beginUnit(clicked);
      } else {
        // Clicking self, empty tile, or enemy with no mode → deselect.
        interaction.selectedId = null;
        interaction.mode = null;
        setMessage("");
      }
    }
    render();
  }
  
  // Action button handler — called by renderActions with the action string.
  async function handleActionClick(action, unit) {
    if (inputLocked()) return;
    if (action === "defend") {
      if (dispatch(defend(runtime.state.currentPlayer, unit.id))) {
        setMessage(consumeTutorialPrompt("Defending: incoming physical and magic damage is halved."));
        finishNow();
      }
      interaction.mode = null;
    } else if (action === "cancel-move") {
      if (dispatch(cancelMove(runtime.state.currentPlayer, unit.id))) {
        interaction.selectedId = unit.id;
        interaction.mode = null;
        interaction.footworkPath = [];
        interaction.volleyShotOrigin = null;
        setMessage("Movement cancelled. Choose an action.");
      }
    } else if (action === "finish") {
      if (dispatch(finishActivation(runtime.state.currentPlayer, unit.id)))
        setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
    } else {
      const deselect = interaction.mode === action;
      interaction.mode = deselect ? null : action;
      interaction.footworkPath = [];
      interaction.volleyShotOrigin = null;
      interaction.reviveTargetId = null;
      if (deselect) {
        setMessage("Choose an action below.");
      } else if (action === "move" && canTrample(unit)) {
        setMessage(`Trample: choose step 1 of up to ${getEffectiveStats(unit, runtime.state).moveRange} — walking into an enemy tramples it for true damage.`);
      } else if (action === "footwork") {
        const footwork = getUnitType(unit.type).arts.find((a) => a.id === "footwork");
        setMessage(`Footwork (${footwork.mpCost} MP): ${footwork.description} Choose step 1 of ${getFootworkSteps(unit, runtime.state)}.`);
      } else if (action.startsWith("art:")) {
        const artId = action.slice(4);
        const art = getAvailableArts(unit).find((a) => a.id === artId);
        if (art?.targeting?.shape === "revive") {
          // Revive arts pick which fallen ally to bring back first (a pop-up), then place
          // them on a highlighted tile. `interaction.mode` stays on this art so the board
          // lights placement tiles behind the pop-up and after it closes.
          const fallen = getReviveTargets(runtime.state, unit);
          if (!fallen.length) {
            interaction.mode = null;
            setMessage(`${art.name}: no fallen allies to bring back.`, true);
            render();
            return;
          }
          setMessage(`${art.name} (${art.mpCost} MP): choose a fallen ally to bring back.`);
          render();
          const hpFraction = Number.isFinite(art.revive?.hpFraction) ? art.revive.hpFraction : 1;
          const hpLabel = hpFraction >= 1 ? "full HP" : `${Math.ceil(hpFraction * 100)}% HP`;
          const chosen = await openChoiceModal({
            title: `${art.name} - bring back`,
            subtitle: `Return a fallen ally to the field at ${hpLabel}.`,
            accent: teamColor(unit.player),
            choices: fallen.map((ally) => ({ value: ally.id, label: ally.nickname || getUnitType(ally.type).name, sub: `Fallen - returns at ${hpLabel}`, type: ally.type }))
          });
          if (!chosen || interaction.mode !== action) {
            interaction.mode = null;
            interaction.reviveTargetId = null;
            setMessage(`${art.name} cancelled. Choose an action below.`);
            render();
            return;
          }
          interaction.reviveTargetId = chosen;
          {
            const revivedUnit = findUnit(runtime.state, chosen);
            setMessage(`${art.name}: click a highlighted tile within ${art.targeting?.radius ?? 3} to place ${revivedUnit.nickname || getUnitType(revivedUnit.type).name}.`);
          }
          render();
          return;
        }
        if (art?.selfCast) {
          // Self-centred AoE blasts (Dark Bomb, Nuke) and the Gargoyle's Pyroclasm line
          // burst preview their footprint first — staying in art interaction.mode lets the board light
          // the zone and its victims; a click confirms (see handleTile). Every other
          // selfCast resolves immediately.
          if (art.targeting?.shape === "nukeAura") {
            setMessage(`${art.name} (${art.mpCost} MP): ${art.description} Click inside the highlighted blast zone to detonate.`);
            render();
            return;
          }
          if (art.targeting?.shape === "lineBurst") {
            setMessage(`${art.name} (${art.mpCost} MP): ${art.description} Click to erupt.`);
            render();
            return;
          }
          if (await resolveInstantArt(useArt(runtime.state.currentPlayer, unit.id, artId))) {
            setMessage(art.bonusActionGroup
              ? `${art.name} resolved. Take the rest of this unit's turn.`
              : `${art.name} resolved. This unit's activation is complete.`);
          }
          render();
          return;
        }
        const lead = action === "art:volley-shot" || art?.targeting?.shape === "cone"
          ? "Hover a direction to preview the cone, then click to fire."
          : art?.targeting?.shape === "targetedBlast"
            ? "Hover a highlighted tile to preview the area, then click it (not a tile a unit stands on)."
          : art?.targeting?.shape === "rushPath"
            ? `Choose step 1 of ${getRushSteps(unit, art, runtime.state)}.`
          : action === "art:flight"
            ? "Choose a highlighted empty tile to fly onto."
          : art?.targeting?.shape === "flee" || art?.resolution === "flee"
            ? "Choose a highlighted empty tile to teleport to."
            : art?.targeting?.shape === "placement" && (art?.resolution === "summon" || art?.resolution === "summonGhost")
              ? "Choose a highlighted empty tile for the summon."
              : action === "art:build-cover"
                ? "Choose a highlighted empty tile to raise the wall."
                : action === "art:shaft-prop"
                  ? "Choose a highlighted empty tile to raise the wall."
                  : action === "art:throw-cigar"
                    ? "Choose a highlighted tile to set alight."
                  : art?.effect?.type === "healAllies"
                    ? "Click any highlighted ally to confirm."
                    : art?.targeting?.shape === "ally"
                      ? "Click a highlighted ally in range (not yourself)."
                    : art?.targeting?.shape === "allyOrEnemy"
                      ? "Click a highlighted ally or enemy in range."
                      : art?.targeting?.shape === "protectAlly"
                        ? "Click a highlighted landing tile beside an ally."
                      : art?.targeting?.shape === "lineAny"
                        ? "Click a highlighted ally or enemy on a straight line to grab it."
                        : art?.targeting?.shape === "lineEnemy"
                          ? "Click a highlighted enemy on a straight line to punch it."
                          : art?.resolution === "statusCast"
                            ? "Choose a highlighted enemy target."
                            : action === "art:blasting-cap"
                              ? "Choose a highlighted enemy or wall target."
                              : "Choose a highlighted enemy target.";
        // Line abilities: the purple wash shows the ability's reach on every ray; if nothing
        // is actually in line there is no legal target, so say so rather than leaving the
        // player clicking an empty ray and wondering why nothing resolves.
        const lineShape = art?.targeting?.shape === "lineAny" || art?.targeting?.shape === "lineEnemy";
        const noLineTarget = lineShape &&
          getLineTargets(runtime.state, unit, art.targeting.range, { includeAllies: art.targeting.shape === "lineAny" }).length === 0;
        if (noLineTarget) {
          setMessage(`${art.name} (${art.mpCost} MP): the purple tiles show its reach, but nothing is in a straight line right now. Reposition, or Escape to choose another action.`, true);
          render();
          return;
        }
        setMessage(`${art.name} (${art.mpCost} MP): ${art.description} ${lead}`);
      } else {
        setMessage(`Choose a highlighted ${action} tile.`);
      }
    }
    render();
  }
  

  return { handleActionClick, handleTile };
}
