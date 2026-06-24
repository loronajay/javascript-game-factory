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
  COLORBLIND_PLAYER_COLORS,
  COLORBLIND_TEAM_COLORS,
  DEFAULT_BOARD_SIZE,
  MAX_HP,
  UNIT_TYPES,
} from "../config.js";
import {
  createBoardMetrics,
  createBoardViewBox,
  tileKey,
} from "../geometry/isometric.js";
import { getLegalMoves } from "../rules/movement.js";
import {
  getAttackRangeTiles,
  getHealRangeTiles,
  getLegalAttackTargets,
  getLegalHealTargets,
} from "../rules/combat.js";
import { colorOf, teamOf, unitAt } from "../state/gameState.js";
import {
  createMatchState,
  findUnit,
  getActivationUnit,
} from "../core/state.js";
import { applyCommand } from "../core/reducer.js";
import { EVENTS } from "../core/events.js";
import * as cmd from "../core/commands.js";
import { chooseActivation, cpuRng } from "../ai/cpuController.js";
import { winnerLabel, teamColor, teamLabel } from "../render/labels.js";
import { BoardRenderer } from "../render/boardRenderer.js";
import { UnitRenderer } from "../render/unitRenderer.js";
import { OverlayRenderer } from "../render/overlayRenderer.js";
import { ForecastRenderer } from "../render/forecastRenderer.js";
import { HudRenderer } from "../render/hudRenderer.js";
import { EffectsRenderer } from "../render/effectsRenderer.js";
import { renderAmbient } from "../render/ambient.js";
import { scale } from "../render/timing.js";

export class GameController {
  constructor({ elements, messages, audio, confirm, onMatchComplete, turnAnnouncer }) {
    this.elements = elements;
    this.messages = messages;
    // Presentation-only turn-change sweep. Defaults to a no-op so the controller
    // stays usable headlessly / in isolation.
    this.turnAnnouncer = turnAnnouncer ?? { announce() {} };
    // Presentation-only sound service. Defaults to a silent stub so the
    // controller stays usable headlessly / in isolation (and in node smoke runs).
    this.audio = audio ?? { play() {}, setEnabled() {} };
    // Stylized in-game confirm prompt (Promise<boolean>). Defaults to auto-confirm
    // so the controller stays usable headlessly / in isolation.
    this.confirm = confirm ?? (async () => true);
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

    // Online session (onlineSession.js) when mode === "online"; null otherwise.
    // Owns the relay link; the controller only calls a couple of small hooks on
    // it and reads `mySeat`/`remoteName`. See applyRemoteCommand / dispatch.
    this.net = null;

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
    this.forecastRenderer = new ForecastRenderer({
      forecastLayer: elements.forecastLayer,
      metrics: this.metrics,
    });
    this.hudRenderer = new HudRenderer(elements, {
      onUnitClick: (id) => this.handleUnitClick(id),
    });
    this.effectsRenderer = new EffectsRenderer({
      unitsLayer: elements.unitsLayer,
      effectsLayer: elements.effectsLayer,
      diceOverlay: elements.diceOverlay,
      dieFace: elements.dieFace,
      metrics: this.metrics,
      audio: this.audio,
      svg: elements.svg,
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
    // Online only: the live onlineSession and the relay-provided shared seed. Both
    // clients build the match from the same seed so the seeded core runs in
    // lockstep. `seed` is null for local play (reset() picks a fresh one).
    net = null,
    seed = null,
  } = {}) {
    this.mode = mode;
    this.net = mode === "online" ? net : null;
    this.matchConfig = { size, playerCount, format, teamColors, teamNames, difficulty, seed };
    // Single-player drives Player 2 with the CPU; every other mode is human-only.
    this.cpu = mode === "single" ? { difficulty, players: new Set([2]) } : null;
    this._onlineEnded = false;
    this.startedAt = Date.now();
    this.applyLocalControlVisibility();
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

  // Restart and Concede are local-only affordances. Online clients cannot
  // unilaterally reset a shared match, and conceding online will route through
  // the host instead, so both are hidden outside single-player and hot-seat.
  applyLocalControlVisibility() {
    const local = this.mode === "single" || this.mode === "hotseat";
    // Restart never makes sense online — a shared match can't be unilaterally
    // reset. Concede stays available online; it routes through the normal command
    // broadcast (the conceding player drops, the duel ends).
    this.elements.restartBtn.hidden = !local;
    this.elements.concedeBtn.hidden = !(local || this.mode === "online");
  }

  reset() {
    const { size, playerCount, format, teamColors, teamNames, seed } = this.matchConfig;
    const boardSize = Number(size);

    if (!BOARD_SIZES.includes(boardSize)) {
      throw new Error(`Unsupported board size: ${size}`);
    }

    // Colorblind palette is a presentation swap applied at creation: per-seat hues
    // for duel/FFA, or the two-team variant for 2v2 when the lobby didn't pick
    // explicit team colors. Color is not hashed, so this is safe per-client online.
    // (A mid-match toggle applies to the next match, since hues bake in here.)
    const colorblind = colorblindActive();
    const colors = colorblind && format !== "teams" ? COLORBLIND_PLAYER_COLORS : null;
    const effectiveTeamColors = colorblind && format === "teams"
      ? (teamColors ?? COLORBLIND_TEAM_COLORS)
      : teamColors;

    this.match = createMatchState({
      // Online uses the relay-provided shared seed so both clients run the same
      // dice stream; local play picks a fresh seed each match.
      seed: seed ?? newSeed(),
      size: boardSize,
      mode: this.mode,
      playerCount,
      format,
      colors,
      teamColors: effectiveTeamColors,
      teamNames,
    });
    this.ui = createUiState();
    // Per-seat battle tally for the results "battle report". Presentation only —
    // accumulated from the same authoritative events the renderer animates, never
    // read by the rules. Keyed by player (seat) id; teams are summed at report time.
    this.stats = {};
    this.metrics = createBoardMetrics(this.match.size);
    this.updateRendererMetrics();
    this.applyViewBox();

    this.renderAll();
    this.announceTurn(this.match.currentPlayer);

    if (this.mode === "online") {
      // Register with the relay session (flushes any commands buffered during the
      // lobby → match handoff) and lock input unless we move first.
      this.net?.bind(this);
      this.applyOnlineTurnLock();
    } else {
      this.messages.show("Player 1 begins. Select any unspent piece.");
    }
  }

  // Render-facing view: authoritative state plus the local UI fields the
  // renderers expect under their original names.
  view() {
    return {
      ...this.match,
      selectedId: this.ui.selectedId,
      mode: this.ui.actionMode,
      legalTiles: this.ui.legalTiles,
      rangeTiles: this.ui.rangeTiles,
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
    this.recordStats(result.events);

    // Online: a locally-accepted command is broadcast so the opponent replays it
    // through the same seeded reducer. Remote commands arrive via
    // applyRemoteCommand (which calls applyCommand directly, not dispatch), so
    // they never loop back through here.
    if (this.mode === "online" && this.net) {
      this.net.onLocalCommandApplied(command);
    }
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
    this.elements.concedeBtn.addEventListener(
      "click",
      () => void this.concedeCurrentPlayer(),
    );

    document.addEventListener("keydown", (event) => this.handleHotkey(event));
  }

  // Keyboard shortcuts mirror the action toolbar: 1 Move, 2 Attack, 3 Heal,
  // 4 Defend, F/Enter Finish, C Cancel Move, Escape exit targeting. Each action
  // key gates on the *same* disabled state the HUD already computes for its
  // button, so the keyboard can never trigger something the button wouldn't.
  handleHotkey(event) {
    // Only while the board is the active screen, and never on top of a modal or
    // a text field, or while a key combo is in flight.
    const matchScreen = document.querySelector('[data-screen="match"]');
    if (!matchScreen?.classList.contains("is-active")) return;
    if (document.querySelector(".modal.open")) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;

    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) {
      return;
    }

    const el = this.elements;
    let handled = true;
    // Did the key actually trigger an action (not a disabled/no-op key)? Only
    // then do we echo the toolbar's click sound, so the keyboard feels identical
    // to pressing the on-screen button.
    let fired = false;

    switch (event.key) {
      case "1":
        if (!el.moveBtn.disabled) { this.setMode(ACTION_MODES.MOVE); fired = true; }
        break;
      case "2":
        if (!el.attackBtn.disabled) { this.setMode(ACTION_MODES.ATTACK); fired = true; }
        break;
      case "3":
        if (!el.healBtn.disabled) { this.setMode(ACTION_MODES.HEAL); fired = true; }
        break;
      case "4":
        if (!el.defendBtn.disabled) { this.defendSelected(); fired = true; }
        break;
      case "f":
      case "F":
      case "Enter":
        if (!el.finishBtn.disabled) { this.finishActivation(); fired = true; }
        break;
      case "c":
      case "C":
        if (!el.cancelMoveBtn.disabled) { this.cancelMove(); fired = true; }
        break;
      case "Escape":
        if (!this.ui.locked && this.ui.actionMode) {
          this.exitActionMode();
          fired = true;
        }
        break;
      default:
        handled = false;
    }

    if (handled) event.preventDefault();
    // Echo the toolbar's click sound, exactly as clicking the button would (the
    // Defend key also fires its own brace sound via defendSelected — same as
    // clicking the Defend button, which gets both the click and the brace).
    if (fired) this.audio.play("buttonClick");
  }

  // Drop an in-progress targeting/move highlight without spending the piece,
  // returning to the neutral "piece selected, choose an action" state.
  exitActionMode() {
    if (this.ui.locked || !this.ui.actionMode) return;
    this.clearMode();
    this.renderDynamic();
    this.messages.show("Action cancelled. Choose an action.");
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

    // Scatter the ambient mote field across the fresh viewBox so it tracks the
    // board's real bounds at either size.
    renderAmbient(this.elements.ambientLayer, view);
  }

  updateRendererMetrics() {
    this.boardRenderer.setMetrics(this.metrics);
    this.unitRenderer.setMetrics(this.metrics);
    this.forecastRenderer.setMetrics(this.metrics);
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
    this.forecastRenderer.render(view);
    this.hudRenderer.render(view);
    // Spotlight: dim the static board while a piece is selected so the active
    // unit and its highlighted tiles read first. Purely a CSS hook.
    this.elements.svg.classList.toggle("board-focused", Boolean(this.ui.selectedId));
  }

  // Keep the UI's selected unit in sync with the authoritative activation.
  syncSelection() {
    this.ui.selectedId = this.match.activation?.unitId ?? null;
  }

  clearMode() {
    this.ui.actionMode = null;
    this.ui.legalTiles = new Set();
    this.ui.rangeTiles = new Set();
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
    this.ui.rangeTiles = new Set();

    switch (mode) {
      case ACTION_MODES.MOVE:
        this.ui.legalTiles = getLegalMoves(this.match, unit);
        break;
      case ACTION_MODES.ATTACK:
        this.ui.legalTiles = getLegalAttackTargets(this.match, unit);
        // Show the whole reachable attack radius behind the bright target tiles.
        this.ui.rangeTiles = getAttackRangeTiles(this.match, unit);
        break;
      case ACTION_MODES.HEAL:
        this.ui.legalTiles = getLegalHealTargets(this.match, unit);
        // Show the whole heal radius behind the bright injured-ally tiles.
        this.ui.rangeTiles = getHealRangeTiles(this.match, unit);
        break;
      default:
        this.ui.legalTiles = new Set();
    }

    const view = this.view();
    this.overlayRenderer.render(view);
    this.overlayRenderer.playReveal(view);
    this.forecastRenderer.render(view);
    this.hudRenderer.render(view);

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
    this.forecastRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    const attacker = findUnit(this.match, actorId);
    const target = findUnit(this.match, targetId);
    const resolved = result.events.find(
      (event) => event.type === EVENTS.ATTACK_RESOLVED,
    );

    await this.effectsRenderer.animateAttack(attacker, target);
    await this.effectsRenderer.rollDie(resolved.roll);
    this.audio.play(this.attackSoundKey(resolved, attacker));

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
    this.forecastRenderer.render(this.view());
    this.hudRenderer.render(this.view());

    const medic = findUnit(this.match, actorId);
    const target = findUnit(this.match, targetId);
    const resolved = result.events.find(
      (event) => event.type === EVENTS.HEAL_RESOLVED,
    );

    await this.effectsRenderer.animateHealBeam(medic, target);
    await this.effectsRenderer.rollDie(resolved.roll);
    this.audio.play(this.healSoundKey(resolved));

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
    this.audio.play("defend");
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
      this.announceTurn(turnChanged.player);
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

    // Online: handing the turn to the opponent locks our input until their
    // command stream passes the turn back (see applyRemoteCommand).
    if (turnChanged && this.mode === "online" && this.match.phase === "playing") {
      this.applyOnlineTurnLock();
    }
  }

  // Concede on behalf of the player whose squad turn it is — in hot-seat that is
  // whoever holds the device, in single-player it is always the human (P1, since
  // input is locked during the CPU's turn). The core treats concede as a drop-out:
  // a duel ends, a 3-4 player game plays on with the conceder's squad removed.
  async concedeCurrentPlayer() {
    if (this.ui.locked || this.match.winner) {
      return;
    }

    const player = this.match.currentPlayer;
    const confirmed = await this.confirm({
      title: `Player ${player} — concede?`,
      body:
        "Your squad is removed from the match and you are out. " +
        "This cannot be undone.",
      confirmLabel: "Concede",
      cancelLabel: "Keep playing",
    });
    if (!confirmed) {
      return;
    }

    const result = this.dispatch(cmd.concede(player));
    if (!result) {
      return;
    }

    // Drop the dossier/targeting before animating, then play each unit's death
    // while its element is still on the board (renderAll below clears them).
    this.ui.selectedId = null;
    this.clearMode();
    this.ui.locked = true;

    for (const event of result.events) {
      if (event.type === EVENTS.UNIT_ELIMINATED) {
        const unit = findUnit(this.match, event.unitId);
        if (unit) {
          await this.effectsRenderer.animateDeath(unit);
        }
      }
    }

    this.ui.locked = false;
    this.renderAll();

    if (this.match.phase === "complete") {
      this.handleMatchComplete();
      return;
    }

    // Free-for-all / teams: the match continues. The core has already passed the
    // turn on to the next surviving player; mirror finishActivation's hand-off,
    // including kicking off a CPU turn if that next seat is computer-controlled.
    const turnChanged = result.events.find(
      (event) => event.type === EVENTS.TURN_CHANGED,
    );
    if (turnChanged) {
      this.messages.show(`Player ${turnChanged.player} squad turn.`);
      this.announceTurn(turnChanged.player);
      if (
        this.match.phase === "playing" &&
        this.isCpu(this.match.currentPlayer)
      ) {
        void this.runCpuTurn();
      }
    } else {
      this.messages.show(`Player ${player} conceded.`);
      this.renderDynamic();
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
    this.announceTurn(this.match.currentPlayer);
    this.messages.show("Your squad turn. Select an unspent piece.");
  }

  // Fire the turn-change sweep for the seat now on the clock, tinted to its
  // roster color. Sub-line adapts to who is holding the device.
  announceTurn(player) {
    const cpu = this.isCpu(player);
    const online = this.mode === "online";
    const mine = online && player === this.net?.mySeat;

    let sub;
    if (cpu) sub = "CPU is planning";
    else if (online) sub = mine ? "Your move" : "Opponent's move";
    else if (this.mode === "hotseat") sub = "Pass the device";
    else sub = "Your move";

    let title = `Player ${player}`;
    if (cpu) title = `Player ${player} · CPU`;
    else if (online && !mine) title = `Player ${player} · ${this.remoteSquadLabel()}`;

    this.turnAnnouncer.announce({
      title,
      sub,
      color: colorOf(this.match, player),
    });
  }

  // ── Online (deterministic lockstep) ──────────────────────────────────────
  // Apply a command the OPPONENT issued. It is replayed through the same seeded
  // reducer our own commands use, so the dice match without being sent. Reuses
  // the CPU animation path (animateCpuEvents handles every event type). Called,
  // serialized, by the online session. Returns a promise the session awaits so
  // animations never overlap.
  async applyRemoteCommand(command) {
    if (this.match.phase === "complete" || this._onlineEnded) return false;

    const result = applyCommand(this.match, command);
    if (!result.accepted) {
      // A remote command our reducer rejects means the two states diverged —
      // there is no safe local recovery, so end the match cleanly.
      console.warn("Remote command rejected:", command.type, result.errorCode);
      this.endOnDesync();
      return false;
    }

    this.match = result.nextState;
    this.recordStats(result.events);
    await this.animateCpuEvents(result.events);

    if (this.match.phase === "complete") {
      this.handleMatchComplete();
      return true;
    }

    const turnChanged = result.events.find(
      (event) => event.type === EVENTS.TURN_CHANGED,
    );
    if (turnChanged) {
      this.announceTurn(turnChanged.player);
      this.applyOnlineTurnLock();
    }
    return true;
  }

  // Lock or unlock local input based on whose squad turn it is online. Uses the
  // exact `ui.locked` gate every input handler already respects (same mechanism
  // the CPU turn uses), so no per-handler online checks are needed.
  applyOnlineTurnLock() {
    if (this.mode !== "online" || !this.net || this._onlineEnded) return;
    const mine = this.match.currentPlayer === this.net.mySeat;
    this.ui.selectedId = null;
    this.clearMode();
    this.ui.locked = !mine;
    this.renderDynamic();
    this.messages.show(
      mine
        ? "Your squad turn. Select an unspent piece."
        : `Waiting for ${this.remoteSquadLabel()}…`,
    );
  }

  // Connection desync (mismatched state hash, or a rejected remote command):
  // there is no safe recovery in v1, so stop accepting input and surface the
  // termination to the results screen (scope §11.4).
  endOnDesync() {
    if (this._onlineEnded || this.match.phase === "complete") return;
    this._onlineEnded = true;
    this.ui.selectedId = null;
    this.clearMode();
    this.ui.locked = true;
    this.renderDynamic();
    this.messages.show("Connection desynced — the match was ended.");
    this.net?.dispose();
    this.onMatchComplete(
      this.buildMatchSummary({ terminated: "desync", terminationReason: "Connection desynced." }),
    );
  }

  // Opponent left / socket closed mid-match. Display the reason and return
  // cleanly via the results screen (scope §11.4 — v1 has no reconnect).
  endOnDisconnect(reason) {
    if (this._onlineEnded || this.match.phase === "complete") return;
    this._onlineEnded = true;
    this.ui.selectedId = null;
    this.clearMode();
    this.ui.locked = true;
    this.renderDynamic();
    const message = reason || "Your opponent disconnected.";
    this.messages.show(message);
    this.net?.dispose();
    this.onMatchComplete(
      this.buildMatchSummary({ terminated: "disconnect", terminationReason: message }),
    );
  }

  // Read-only state accessor the online session uses for hashing. Never mutate.
  getMatchState() {
    return this.match;
  }

  // Label for the non-local squad in messages: "CPU" in single-player, the
  // opponent's name (or "Opponent") online.
  remoteSquadLabel() {
    if (this.cpu) return "CPU";
    if (this.mode === "online") return this.net?.remoteName || "Opponent";
    return "Opponent";
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
    this.recordStats(result.events);
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
              `Player ${unit.player} (${this.remoteSquadLabel()}) activates its ${UNIT_TYPES[unit.type].name}.`,
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
          this.audio.play("defend");
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
    this.audio.play(this.attackSoundKey(event, attacker));

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
    this.audio.play(this.healSoundKey(event));

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

  // Outcome sound for a resolved ATTACK. The renderer already played the launch
  // (arrow/medic whoosh) and the dice rattle; this is the impact. A crit reads as
  // a crit even when also defended; otherwise a reduced hit reads as defended;
  // otherwise the ranger gets its arrow thunk and everyone else the generic hit.
  attackSoundKey(event, attacker) {
    if (!event.hit) return "miss";
    if (event.critical) return "criticalHit";
    if (event.defended) return "defendedHit";
    if (attacker?.type === "ranger") return "arrowHit";
    return "attackHit";
  }

  // Outcome sound for a resolved HEAL. A failed heal shares the universal miss.
  healSoundKey(event) {
    if (!event.hit) return "miss";
    return event.critical ? "healCrit" : "heal";
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
    // Online: keep the socket alive briefly so the opponent can also reach this
    // completion before our eventual close would read as a disconnect.
    if (this.mode === "online" && !this._onlineEnded) {
      this._onlineEnded = true;
      this.net?.endMatch();
    }
    this.onMatchComplete(this.buildMatchSummary());
  }

  // Lazily fetch the running tally for a seat.
  statsFor(player) {
    let entry = this.stats[player];
    if (!entry) {
      entry = this.stats[player] = {
        hits: 0,
        misses: 0,
        crits: 0,
        damageDealt: 0,
        kills: 0,
        healingDone: 0,
      };
    }
    return entry;
  }

  // Fold a batch of accepted events into the per-seat battle tally. A kill is
  // attributed to the most recent attacker in the same batch, so a concede's
  // UNIT_ELIMINATED (no preceding attack) is correctly never counted as a kill.
  recordStats(events) {
    let lastAttacker = null;
    for (const event of events) {
      switch (event.type) {
        case EVENTS.ATTACK_RESOLVED: {
          const attacker = findUnit(this.match, event.actorId);
          lastAttacker = attacker?.player ?? null;
          if (lastAttacker == null) break;
          const s = this.statsFor(lastAttacker);
          if (event.hit) {
            s.hits += 1;
            s.damageDealt += event.damage;
            if (event.critical) s.crits += 1;
          } else {
            s.misses += 1;
          }
          break;
        }
        case EVENTS.HEAL_RESOLVED: {
          const healer = findUnit(this.match, event.actorId);
          if (healer && event.hit) {
            this.statsFor(healer.player).healingDone += event.healing;
          }
          lastAttacker = null;
          break;
        }
        case EVENTS.UNIT_ELIMINATED: {
          if (lastAttacker != null) {
            this.statsFor(lastAttacker).kills += 1;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // One battle-report row per team (FFA: one team per player). Survivor/HP figures
  // come from the final authoritative state; damage/kills/healing from the tally.
  // Sorted winner-first, then by surviving HP, so the readout reads top-down.
  buildTeamReports() {
    const match = this.match;
    const teamIds = [];
    for (const id of match.turnOrder) {
      const team = teamOf(match, id);
      if (!teamIds.includes(team)) teamIds.push(team);
    }

    const reports = teamIds.map((teamId) => {
      const memberIds = match.players
        .filter((slot) => slot.team === teamId)
        .map((slot) => slot.id);
      const unitsTotal = memberIds.length * 4;

      let unitsAlive = 0;
      let hpRemaining = 0;
      for (const unit of match.units) {
        if (memberIds.includes(unit.player) && unit.hp > 0) {
          unitsAlive += 1;
          hpRemaining += unit.hp;
        }
      }

      let damageDealt = 0;
      let kills = 0;
      let healingDone = 0;
      for (const pid of memberIds) {
        const s = this.stats[pid];
        if (!s) continue;
        damageDealt += s.damageDealt;
        kills += s.kills;
        healingDone += s.healingDone;
      }

      return {
        teamId,
        label: teamLabel(match, teamId),
        color: teamColor(match, teamId),
        isWinner: teamId === match.winner,
        unitsAlive,
        unitsTotal,
        hpRemaining,
        hpTotal: unitsTotal * MAX_HP,
        damageDealt,
        kills,
        healingDone,
      };
    });

    reports.sort(
      (a, b) =>
        Number(b.isWinner) - Number(a.isWinner) || b.hpRemaining - a.hpRemaining,
    );
    return reports;
  }

  // Snapshot the finished match for the results screen.
  // `extra` carries online termination info (terminated/terminationReason) when a
  // match ends without a clean winner (desync/disconnect); empty for normal ends.
  buildMatchSummary(extra = {}) {
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
      teams: this.buildTeamReports(),
      ...extra,
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

// CPU pacing only. Scaled by the Settings "Animation speed" lever so a fast/instant
// game speeds the opponent's deliberation to match — presentation, never rules.
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, scale(ms)));
}

// Reads the live colorblind preference off the root attribute Settings maintains.
// Guarded so the controller stays harmless if ever constructed off-DOM.
function colorblindActive() {
  return (
    typeof document !== "undefined" &&
    document.documentElement?.getAttribute("data-colorblind") === "on"
  );
}

function createUiState() {
  return {
    selectedId: null,
    actionMode: null,
    legalTiles: new Set(),
    rangeTiles: new Set(),
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
