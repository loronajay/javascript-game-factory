// GameController translates local pointer input into authoritative commands and
// animates the events the reducer returns.
//
// It owns two kinds of state, kept strictly separate:
//   * this.match — authoritative, serializable match state (from core/). Only
//     the reducer changes it. This is what an online host would broadcast.
//   * this.ui — throwaway local state (selected unit, action mode, legal-tile
//     highlight set, animation lock). Never authoritative, never networked.
//
// The renderers were written against the prototype's combined state object, so
// `view()` merges the authoritative match with the UI bits under the same field
// names. That lets the existing SVG/HUD renderers stay untouched.

import {
  ACTION_MODES,
  BOARD_SIZES,
  DEFAULT_BOARD_SIZE,
  UNIT_TYPES,
} from "../config.js";
import {
  createBoardMetrics,
  createBoardViewBox,
  tileKey,
} from "../geometry/isometric.js";
import { getLegalMoves } from "../rules/movement.js";
import {
  getLegalAttackTargets,
  getLegalHealTargets,
} from "../rules/combat.js";
import { unitAt } from "../state/gameState.js";
import {
  createMatchState,
  findUnit,
  getActivationUnit,
} from "../core/state.js";
import { applyCommand } from "../core/reducer.js";
import { EVENTS } from "../core/events.js";
import * as cmd from "../core/commands.js";
import { chooseActivation, cpuRng } from "../ai/cpuController.js";
import { winnerLabel, teamColor } from "../render/labels.js";
import { BoardRenderer } from "../render/boardRenderer.js";
import { UnitRenderer } from "../render/unitRenderer.js";
import { OverlayRenderer } from "../render/overlayRenderer.js";
import { HudRenderer } from "../render/hudRenderer.js";
import { EffectsRenderer } from "../render/effectsRenderer.js";

export class GameController {
  constructor({ elements, messages, onMatchComplete }) {
    this.elements = elements;
    this.messages = messages;
    // Routed to the results screen when a match ends. Defaults to a no-op so the
    // controller stays usable headlessly / in isolation.
    this.onMatchComplete = onMatchComplete ?? (() => {});

    // Current match framing. `mode` drives mode-specific chrome (e.g. the Restart
    // button only exists for local play); `startedAt` backs the results duration.
    this.mode = "hotseat";
    this.startedAt = 0;
    // Roster framing for the current match, reused by restart/rematch. Populated
    // by startMatch; defaults to the classic two-player free-for-all duel.
    this.matchConfig = {
      size: DEFAULT_BOARD_SIZE,
      playerCount: 2,
      format: "ffa",
      teamColors: null,
      teamNames: null,
      difficulty: "normal",
    };

    // CPU control for single-player. Null in hot-seat/online; in single-player it
    // names the difficulty and which seats the computer drives (P2 in v1).
    this.cpu = null;

    this.match = createMatchState({ size: DEFAULT_BOARD_SIZE, seed: newSeed() });
    this.ui = createUiState();
    this.metrics = createBoardMetrics(this.match.size);

    this.boardRenderer = new BoardRenderer({
      boardLayer: elements.boardLayer,
      metrics: this.metrics,
      onTileClick: (x, y) => this.handleTileClick(x, y),
    });

    this.unitRenderer = new UnitRenderer({
      unitsLayer: elements.unitsLayer,
      metrics: this.metrics,
      onUnitClick: (id) => this.handleUnitClick(id),
    });

    this.overlayRenderer = new OverlayRenderer(elements.boardLayer);
    this.hudRenderer = new HudRenderer(elements);
    this.effectsRenderer = new EffectsRenderer({
      unitsLayer: elements.unitsLayer,
      effectsLayer: elements.effectsLayer,
      diceOverlay: elements.diceOverlay,
      dieFace: elements.dieFace,
      metrics: this.metrics,
    });
  }

  // Wire static controls once. A match is not started here — the screen manager
  // calls startMatch() when the match screen is entered.
  start() {
    this.bindControls();
  }

  // Begin a match for a given mode + roster framing. Called by the match
  // screen's onEnter (fresh match and rematch both route through here).
  startMatch({
    mode = "hotseat",
    size = DEFAULT_BOARD_SIZE,
    playerCount = 2,
    format = "ffa",
    teamColors = null,
    teamNames = null,
    difficulty = "normal",
  } = {}) {
    this.mode = mode;
    this.matchConfig = { size, playerCount, format, teamColors, teamNames, difficulty };
    // Single-player drives Player 2 with the CPU; every other mode is human-only.
    this.cpu = mode === "single" ? { difficulty, players: new Set([2]) } : null;
    this.startedAt = Date.now();
    this.applyRestartVisibility();
    this.reset();
  }

  // True when the given seat is computer-controlled this match.
  isCpu(player) {
    return Boolean(this.cpu?.players.has(player));
  }

  // Restart the current match: same mode and roster, fresh seed.
  restart() {
    this.startMatch({ mode: this.mode, ...this.matchConfig });
  }

  // Restart is a local-only affordance. Online clients cannot unilaterally reset
  // a shared match, so it is hidden outside single-player and hot-seat play.
  applyRestartVisibility() {
    const local = this.mode === "single" || this.mode === "hotseat";
    this.elements.restartBtn.hidden = !local;
  }

  reset() {
    const { size, playerCount, format, teamColors, teamNames } = this.matchConfig;
    const boardSize = Number(size);

    if (!BOARD_SIZES.includes(boardSize)) {
      throw new Error(`Unsupported board size: ${size}`);
    }

    this.match = createMatchState({
      size: boardSize,
      seed: newSeed(),
      mode: this.mode,
      playerCount,
      format,
      teamColors,
      teamNames,
    });
    this.ui = createUiState();
    this.metrics = createBoardMetrics(this.match.size);
    this.updateRendererMetrics();
    this.applyViewBox();

    this.renderAll();
    this.messages.show("Player 1 begins. Select any unspent piece.");
  }

  // Render-facing view: authoritative state plus the local UI fields the
  // renderers expect under their original names.
  view() {
    return {
      ...this.match,
      selectedId: this.ui.selectedId,
      mode: this.ui.actionMode,
      legalTiles: this.ui.legalTiles,
      locked: this.ui.locked,
    };
  }

  // Submit a command to the authoritative reducer. On accept, swap in the new
  // state and return the result (with events). On reject, surface the reason
  // and return null. Never partially applies.
  dispatch(command) {
    const result = applyCommand(this.match, command);

    if (!result.accepted) {
      this.messages.show(messageForError(result.errorCode));
      return null;
    }

    this.match = result.nextState;
    return result;
  }

  bindControls() {
    this.elements.moveBtn.addEventListener(
      "click",
      () => this.setMode(ACTION_MODES.MOVE),
    );
    this.elements.attackBtn.addEventListener(
      "click",
      () => this.setMode(ACTION_MODES.ATTACK),
    );
    this.elements.healBtn.addEventListener(
      "click",
      () => this.setMode(ACTION_MODES.HEAL),
    );
    this.elements.defendBtn.addEventListener(
      "click",
      () => this.defendSelected(),
    );
    this.elements.cancelMoveBtn.addEventListener(
      "click",
      () => this.cancelMove(),
    );
    this.elements.finishBtn.addEventListener(
      "click",
      () => this.finishActivation(),
    );
    this.elements.restartBtn.addEventListener(
      "click",
      () => this.restart(),
    );
  }

  // Wrap the viewBox tightly around the board so it scales up to fill the stage,
  // and re-center the decorative aura glow on the new board bounds.
  applyViewBox() {
    const view = createBoardViewBox(this.metrics, this.match.size);

    this.elements.svg.setAttribute(
      "viewBox",
      `${view.x} ${view.y} ${view.width} ${view.height}`,
    );

    const glow = this.elements.svg.querySelector("#boardGlow");
    if (glow) {
      const { bounds } = view;
      glow.setAttribute("cx", String((bounds.minX + bounds.maxX) / 2));
      glow.setAttribute("cy", String((bounds.minY + bounds.maxY) / 2));
      glow.setAttribute("rx", String((bounds.maxX - bounds.minX) / 2 + 40));
      glow.setAttribute("ry", String((bounds.maxY - bounds.minY) / 2 + 30));
    }
  }

  updateRendererMetrics() {
    this.boardRenderer.setMetrics(this.metrics);
    this.unitRenderer.setMetrics(this.metrics);
    this.effectsRenderer.setMetrics(this.metrics);
  }

  renderAll() {
    this.boardRenderer.render(this.match.size);
    this.renderDynamic();
  }

  renderDynamic() {
    const view = this.view();
    this.unitRenderer.render(view);
    this.overlayRenderer.render(view);
    this.hudRenderer.render(view);
  }

  // Keep the UI's selected unit in sync with the authoritative activation.
  syncSelection() {
    this.ui.selectedId = this.match.activation?.unitId ?? null;
  }

  clearMode() {
    this.ui.actionMode = null;
    this.ui.legalTiles = new Set();
  }

  handleUnitClick(id) {
    this.selectUnit(id);
  }

  selectUnit(id) {
    if (this.ui.locked || this.match.winner) {
      return;
    }

    const unit = findUnit(this.match, id);
    if (!unit || unit.hp <= 0) {
      return;
    }

    // While targeting, a unit click is a target choice, not a re-selection.
    if (
      this.ui.actionMode === ACTION_MODES.ATTACK ||
      this.ui.actionMode === ACTION_MODES.HEAL
    ) {
      this.handleTargetUnit(unit);
      return;
    }

    // Re-affirming the current unit is a no-op (avoids a redundant message).
    if (this.match.activation?.unitId === id) {
      return;
    }

    const result = this.dispatch(cmd.beginActivation(this.match.currentPlayer, id));
    if (!result) {
      return;
    }

    this.clearMode();
    this.syncSelection();
    this.renderDynamic();
    this.messages.show(`${UNIT_TYPES[unit.type].name} selected.`);
  }

  handleTileClick(x, y) {
    if (this.ui.locked || this.match.winner) {
      return;
    }

    if (this.ui.actionMode === ACTION_MODES.MOVE) {
      if (!this.ui.legalTiles.has(tileKey(x, y))) {
        this.messages.show("That tile is not reachable.");
        return;
      }

      void this.moveSelectedTo(x, y);
      return;
    }

    if (
      this.ui.actionMode === ACTION_MODES.ATTACK ||
      this.ui.actionMode === ACTION_MODES.HEAL
    ) {
      const target = unitAt(this.match, x, y);

      if (target) {
        this.handleTargetUnit(target);
      } else {
        this.messages.show("Choose a highlighted piece.");
      }

      return;
    }

    const occupant = unitAt(this.match, x, y);
    if (occupant) {
      this.selectUnit(occupant.id);
    }
  }

  // Enter an action mode and compute the highlight set locally. Targeting math
  // is UI-only; the reducer re-validates the chosen command authoritatively.
  setMode(mode) {
    const unit = getActivationUnit(this.match);

    if (!unit || this.ui.locked || this.match.winner) {
      return;
    }

    this.ui.actionMode = mode;

    switch (mode) {
      case ACTION_MODES.MOVE:
        this.ui.legalTiles = getLegalMoves(this.match, unit);
        break;
      case ACTION_MODES.ATTACK:
        this.ui.legalTiles = getLegalAttackTargets(this.match, unit);
        break;
      case ACTION_MODES.HEAL:
        this.ui.legalTiles = getLegalHealTargets(this.match, unit);
        break;
      default:
        this.ui.legalTiles = new Set();
    }

    this.overlayRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    if (this.ui.legalTiles.size === 0) {
      const emptyLabel = {
        [ACTION_MODES.MOVE]: "legal movement tiles",
        [ACTION_MODES.ATTACK]: "valid targets",
        [ACTION_MODES.HEAL]: "injured allies in range",
      }[mode];

      this.messages.show(`No ${emptyLabel}.`);
    }
  }

  async moveSelectedTo(x, y) {
    const unitId = this.match.activation?.unitId;
    if (!unitId) {
      return;
    }

    const result = this.dispatch(
      cmd.moveUnit(this.match.currentPlayer, unitId, x, y),
    );
    if (!result) {
      return;
    }

    const moved = result.events.find((event) => event.type === EVENTS.UNIT_MOVED);

    this.ui.locked = true;
    this.clearMode();
    this.unitRenderer.render(this.view());

    await this.effectsRenderer.animateMovement(
      findUnit(this.match, unitId),
      moved.from,
      moved.to,
    );

    this.ui.locked = false;
    this.afterActionResolved("Movement committed. Attack, heal, or defend.");
  }

  handleTargetUnit(target) {
    const actor = getActivationUnit(this.match);

    if (!actor || this.ui.locked) {
      return;
    }

    if (!this.ui.legalTiles.has(tileKey(target.x, target.y))) {
      this.messages.show("That piece is not a legal target.");
      return;
    }

    if (this.ui.actionMode === ACTION_MODES.ATTACK) {
      void this.resolveAttack(actor.id, target.id);
    } else if (this.ui.actionMode === ACTION_MODES.HEAL) {
      void this.resolveHeal(actor.id, target.id);
    }
  }

  async resolveAttack(actorId, targetId) {
    const result = this.dispatch(
      cmd.attack(this.match.currentPlayer, actorId, targetId),
    );
    if (!result) {
      return;
    }

    this.ui.locked = true;
    this.clearMode();
    this.overlayRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    const attacker = findUnit(this.match, actorId);
    const target = findUnit(this.match, targetId);
    const resolved = result.events.find(
      (event) => event.type === EVENTS.ATTACK_RESOLVED,
    );

    await this.effectsRenderer.animateAttack(attacker, target);
    await this.effectsRenderer.rollDie(resolved.roll);

    if (!resolved.hit) {
      await this.effectsRenderer.floatText(target, "MISS", "#ffffff");
      this.messages.show(`${UNIT_TYPES[attacker.type].name} missed.`);
    } else {
      await this.effectsRenderer.animateHit(
        target,
        resolved.damage,
        resolved.critical,
      );

      const criticalText = resolved.critical ? " Critical hit." : "";
      const defenseText = resolved.defended
        ? " Defense reduced the damage."
        : "";

      this.messages.show(
        `${UNIT_TYPES[attacker.type].name} dealt ` +
          `${resolved.damage} damage.${criticalText}${defenseText}`,
      );

      const eliminated = result.events.some(
        (event) =>
          event.type === EVENTS.UNIT_ELIMINATED && event.unitId === targetId,
      );

      if (eliminated) {
        await this.effectsRenderer.animateDeath(target);
        this.messages.show(`${UNIT_TYPES[target.type].name} was eliminated.`);
      }
    }

    this.ui.locked = false;
    this.unitRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    if (this.match.phase === "complete") {
      this.handleMatchComplete();
      return;
    }

    this.afterActionResolved("Attack complete. Move now or finish this activation.");
  }

  async resolveHeal(actorId, targetId) {
    const result = this.dispatch(
      cmd.heal(this.match.currentPlayer, actorId, targetId),
    );
    if (!result) {
      return;
    }

    this.ui.locked = true;
    this.clearMode();
    this.overlayRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    const medic = findUnit(this.match, actorId);
    const target = findUnit(this.match, targetId);
    const resolved = result.events.find(
      (event) => event.type === EVENTS.HEAL_RESOLVED,
    );

    await this.effectsRenderer.animateHealBeam(medic, target);
    await this.effectsRenderer.rollDie(resolved.roll);

    if (!resolved.hit) {
      await this.effectsRenderer.floatText(target, "MISS", "#ffffff");
      this.messages.show("The heal failed.");
    } else {
      await this.effectsRenderer.animateHeal(
        target,
        resolved.healing,
        resolved.critical,
      );

      this.messages.show(
        `${UNIT_TYPES[target.type].name} recovered ` +
          `${resolved.healing} HP` +
          `${resolved.critical ? " on a critical heal" : ""}.`,
      );
    }

    this.ui.locked = false;
    this.unitRenderer.render(this.view());
    this.hudRenderer.render(this.view());
    this.afterActionResolved("Heal complete. Move now or finish this activation.");
  }

  defendSelected() {
    const unit = getActivationUnit(this.match);
    if (!unit || this.ui.locked) {
      return;
    }

    const result = this.dispatch(cmd.defend(this.match.currentPlayer, unit.id));
    if (!result) {
      return;
    }

    this.clearMode();
    this.renderDynamic();
    this.messages.show(`${UNIT_TYPES[unit.type].name} is defending.`);
    // Defend always completes the activation immediately.
    this.finishActivation();
  }

  cancelMove() {
    const unit = getActivationUnit(this.match);
    if (!unit || this.ui.locked) {
      return;
    }

    const result = this.dispatch(cmd.cancelMove(this.match.currentPlayer, unit.id));
    if (!result) {
      return;
    }

    // Snap back to the activation origin and return to the neutral selected
    // state (no movement highlights re-opened, per the scope).
    this.clearMode();
    this.syncSelection();
    this.renderDynamic();
    this.messages.show("Movement cancelled. Choose an action.");
  }

  finishActivation() {
    const unit = getActivationUnit(this.match);
    if (!unit) {
      return;
    }

    const result = this.dispatch(
      cmd.finishActivation(this.match.currentPlayer, unit.id),
    );
    if (!result) {
      return;
    }

    this.ui.selectedId = null;
    this.clearMode();
    this.renderAll();

    const turnChanged = result.events.find(
      (event) => event.type === EVENTS.TURN_CHANGED,
    );
    if (turnChanged) {
      this.messages.show(`Player ${turnChanged.player} squad turn.`);
    }

    // In single-player, when the human hands the turn to the computer, let it
    // take its whole squad turn before input returns.
    if (
      turnChanged &&
      this.match.phase === "playing" &&
      this.isCpu(this.match.currentPlayer)
    ) {
      void this.runCpuTurn();
    }
  }

  // Drive the CPU's full squad turn: ask the AI for one activation at a time and
  // animate each through the same reducer + renderers a human's moves use. Input
  // is locked for the duration; control returns to the human when the turn passes
  // back or the match ends.
  async runCpuTurn() {
    this.ui.locked = true;
    this.ui.selectedId = null;
    this.clearMode();
    this.renderDynamic();
    this.messages.show(`Player ${this.match.currentPlayer} (CPU) is planning…`);
    await sleep(CPU_TURN_LEAD_MS);

    // The guard is a belt-and-braces stop against a planning bug; the AI always
    // returns at least a defend plan, so a living squad cannot truly stall.
    let guard = 0;
    while (
      this.match.phase === "playing" &&
      this.isCpu(this.match.currentPlayer) &&
      guard < CPU_MAX_ACTIVATIONS
    ) {
      guard += 1;
      const commands = chooseActivation(this.match, {
        difficulty: this.cpu.difficulty,
        cpuPlayer: this.match.currentPlayer,
        rng: cpuRng(this.match),
      });
      if (!commands || commands.length === 0) break;

      for (const command of commands) {
        const applied = await this.applyCpuCommand(command);
        if (!applied || this.match.phase === "complete") break;
      }

      if (this.match.phase === "complete") break;
      await sleep(CPU_ACTIVATION_GAP_MS);
    }

    this.ui.locked = false;

    if (this.match.phase === "complete") {
      this.handleMatchComplete();
      return;
    }

    this.ui.selectedId = null;
    this.clearMode();
    this.renderDynamic();
    this.messages.show("Your squad turn. Select an unspent piece.");
  }

  // Apply one CPU command authoritatively and animate the events it produced.
  // Returns false (stopping the driver) if the reducer rejects it — that would be
  // an AI bug, never a normal player action, so it fails safe instead of looping.
  async applyCpuCommand(command) {
    const result = applyCommand(this.match, command);
    if (!result.accepted) {
      console.warn("CPU command rejected:", command.type, result.errorCode);
      return false;
    }

    this.match = result.nextState;
    await this.animateCpuEvents(result.events);
    return true;
  }

  async animateCpuEvents(events) {
    for (const event of events) {
      switch (event.type) {
        case EVENTS.ACTIVATION_BEGAN: {
          this.ui.selectedId = event.unitId;
          this.renderDynamic();
          const unit = findUnit(this.match, event.unitId);
          if (unit) {
            this.messages.show(
              `Player ${unit.player} (CPU) activates its ${UNIT_TYPES[unit.type].name}.`,
            );
          }
          await sleep(CPU_STEP_MS);
          break;
        }
        case EVENTS.UNIT_MOVED: {
          const unit = findUnit(this.match, event.unitId);
          this.unitRenderer.render(this.view());
          if (unit) {
            await this.effectsRenderer.animateMovement(unit, event.from, event.to);
          }
          break;
        }
        case EVENTS.ATTACK_RESOLVED:
          await this.animateAttackEvent(event);
          break;
        case EVENTS.HEAL_RESOLVED:
          await this.animateHealEvent(event);
          break;
        case EVENTS.UNIT_DEFENDED: {
          const unit = findUnit(this.match, event.unitId);
          this.renderDynamic();
          if (unit) {
            this.messages.show(`${UNIT_TYPES[unit.type].name} braces to defend.`);
          }
          await sleep(CPU_STEP_MS);
          break;
        }
        case EVENTS.UNIT_ELIMINATED: {
          // The dead unit still exists in state (HP 0) until the next render, so
          // its element is present for the death animation. Re-rendering happens
          // after the loop, which clears it.
          const unit = findUnit(this.match, event.unitId);
          if (unit) {
            await this.effectsRenderer.animateDeath(unit);
            this.messages.show(`${UNIT_TYPES[unit.type].name} was eliminated.`);
          }
          break;
        }
        // ACTIVATION_FINISHED / TURN_CHANGED / MATCH_COMPLETE need no animation.
        default:
          break;
      }
    }

    this.renderDynamic();
  }

  async animateAttackEvent(event) {
    const attacker = findUnit(this.match, event.actorId);
    const target = findUnit(this.match, event.targetId);
    if (!attacker || !target) return;

    await this.effectsRenderer.animateAttack(attacker, target);
    await this.effectsRenderer.rollDie(event.roll);

    if (!event.hit) {
      await this.effectsRenderer.floatText(target, "MISS", "#ffffff");
      this.messages.show(`${UNIT_TYPES[attacker.type].name} missed.`);
      return;
    }

    await this.effectsRenderer.animateHit(target, event.damage, event.critical);
    const criticalText = event.critical ? " Critical hit." : "";
    this.messages.show(
      `${UNIT_TYPES[attacker.type].name} dealt ${event.damage} damage.${criticalText}`,
    );
  }

  async animateHealEvent(event) {
    const medic = findUnit(this.match, event.actorId);
    const target = findUnit(this.match, event.targetId);
    if (!medic || !target) return;

    await this.effectsRenderer.animateHealBeam(medic, target);
    await this.effectsRenderer.rollDie(event.roll);

    if (!event.hit) {
      await this.effectsRenderer.floatText(target, "MISS", "#ffffff");
      this.messages.show("The heal failed.");
      return;
    }

    await this.effectsRenderer.animateHeal(target, event.healing, event.critical);
    this.messages.show(
      `${UNIT_TYPES[target.type].name} recovered ${event.healing} HP` +
        `${event.critical ? " on a critical heal" : ""}.`,
    );
  }

  // After a move or primary action resolves, either auto-finish a completed
  // activation or refresh the UI and prompt for the remaining step.
  afterActionResolved(prompt) {
    const activation = this.match.activation;

    if (activation && activation.moved && activation.primaryUsed) {
      this.finishActivation();
      return;
    }

    this.syncSelection();
    this.renderDynamic();
    this.messages.show(prompt);
  }

  handleMatchComplete() {
    this.ui.selectedId = null;
    this.clearMode();
    this.renderAll();
    this.messages.show(`${winnerLabel(this.match, this.match.winner)} wins.`);
    this.onMatchComplete(this.buildMatchSummary());
  }

  // Snapshot the finished match for the results screen.
  buildMatchSummary() {
    return {
      winner: this.match.winner,
      winnerLabel: winnerLabel(this.match, this.match.winner),
      winnerColor: teamColor(this.match, this.match.winner),
      mode: this.mode,
      format: this.match.format,
      size: this.match.size,
      playerCount: this.match.players?.length ?? 2,
      teamColors: this.matchConfig.teamColors,
      teamNames: this.matchConfig.teamNames,
      turns: this.match.turnNumber,
      victoryReason: this.match.victoryReason ?? "elimination",
      durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
      difficulty: this.cpu?.difficulty ?? this.matchConfig.difficulty,
    };
  }
}

// Pacing for the CPU's turn so it reads as a deliberate opponent rather than an
// instant state jump. Tuned for watchability, never for correctness — the rules
// never depend on these.
const CPU_TURN_LEAD_MS = 480; //   pause before the CPU's first move
const CPU_ACTIVATION_GAP_MS = 360; // between one unit finishing and the next
const CPU_STEP_MS = 220; //        small beat on selection / brace
const CPU_MAX_ACTIVATIONS = 64; //  guard against a runaway planning loop

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createUiState() {
  return {
    selectedId: null,
    actionMode: null,
    legalTiles: new Set(),
    locked: false,
  };
}

// Seed selection is allowed to use Math.random — it only picks the deterministic
// stream's starting point. Once chosen, all dice are reproducible from the seed.
function newSeed() {
  return (Math.random() * 0x100000000) | 0;
}

function messageForError(errorCode) {
  switch (errorCode) {
    case "NOT_ACTIVE_PLAYER":
    case "UNIT_NOT_OWNED":
      return "That piece belongs to the other player.";
    case "UNIT_SPENT":
      return "That piece is already spent this squad turn.";
    case "ACTIVATION_ALREADY_OPEN":
      return "Finish the current piece's activation first.";
    case "FINISH_REQUIRES_ACTION":
      return "A piece cannot finish after moving alone.";
    case "MOVE_OUT_OF_RANGE":
      return "That tile is not reachable.";
    case "MOVE_BLOCKED":
      return "Another piece is in the way.";
    case "TARGET_OUT_OF_RANGE":
      return "That target is out of range.";
    case "TARGET_BLOCKED":
      return "A piece is blocking the shot.";
    case "INVALID_TARGET":
      return "That is not a legal target.";
    case "CANCEL_NOT_AVAILABLE":
      return "There is no movement to cancel.";
    case "MATCH_COMPLETE":
      return "The match is over. Restart to play again.";
    default:
      return "That action is not allowed right now.";
  }
}
