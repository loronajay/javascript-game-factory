import { Input } from './input.js';
import { Runner } from './runner.js';
import { Camera } from './camera.js';
import { ToolRegistry, BuilderController, makeTool } from './tools.js';
import { Renderer } from './renderer.js';
import { rectsOverlap } from './utils.js';
import { getStageById, getStageSequence } from './stages/stage-registry.js';
import { normalizeViewMode, VIEW_MODES } from './view-modes.js';
import { TOOL_DEFS } from './constants.js';
import { updateMovingHazards } from './hazards.js';

const CONTROL_ROLES = Object.freeze({
  RUNNER: 'runner',
  BUILDER: 'builder',
  // Local co-op: one machine's keyboard drives the Runner and its mouse the Builder.
  LOCAL: 'local',
  INERT: 'inert',
});

// How many Runner world syncs a Builder prediction outlives before the Builder
// concludes the Runner never applied it. Syncs arrive every 3 ticks (50ms), so
// this covers a 600ms round trip — generous for a relay, short enough that a
// rejected placement does not linger.
const PREDICTION_GRACE_SNAPSHOTS = 12;

const INERT_INPUT = Object.freeze({
  axisX: () => 0,
  upHeld: () => false,
  downHeld: () => false,
  jumpHeld: () => false,
  consumeJumpPressed: () => false,
  consumeReposition: () => false,
  cameraNudgeX: () => 0,
});

function normalizeControlRole(value) {
  if (value === CONTROL_ROLES.RUNNER || value === CONTROL_ROLES.BUILDER) return value;
  if (value === CONTROL_ROLES.LOCAL) return value;
  return CONTROL_ROLES.INERT;
}

export class Game {
  constructor(canvas, {
    initialStageId = null,
    viewMode = VIEW_MODES.SHARED,
    localControlRole = CONTROL_ROLES.LOCAL,
    onStageClear = null,
    onStageFailure = null,
  } = {}) {
    this.canvas = canvas;
    this.stageSequence = getStageSequence(initialStageId ? getStageById(initialStageId).packId : undefined);
    this.stageIndex = Math.max(0, this.stageSequence.indexOf(initialStageId ?? this.stageSequence[0]));
    this.viewMode = normalizeViewMode(viewMode);
    this.localControlRole = normalizeControlRole(localControlRole);
    this.onStageClear = onStageClear;
    this.onStageFailure = onStageFailure;
    this.input = new Input(canvas);
    this.remoteRunnerInput = null;
    this.remoteBuilderCursor = null;
    this.audioEvents = [];
    this.loadStage(this.stageSequence[this.stageIndex]);
  }

  currentStageId() {
    return this.stageSequence[this.stageIndex];
  }

  updateAnimation(dt) {
    this.renderer.runnerRenderer.animation.update(this.runner, dt);
  }

  loadStage(stageId) {
    this.stage = getStageById(stageId);
    this.resetRuntime();
  }

  resetRuntime() {
    this.registry = new ToolRegistry(this.stage);
    this.runner = new Runner(this.stage);
    this.camera = new Camera(this.stage);
    this.builder = new BuilderController(this.stage, this.registry);
    this.renderer = new Renderer(this.canvas, this.stage, this.registry, this.runner, this.builder, this.camera, { viewMode: this.viewMode });
    this.timeRemainingMs = this.stage.timerMs;
    this.elapsedMs = 0;
    this.cleared = false;
    this.stageEnded = false;
    this.remoteBuilderCursor = null;
    this.syncMovingHazards();
  }

  // Moving hazards run off the stage timer rather than the local tick count, so
  // a client that only receives snapshots still draws the ball where the host has it.
  hazardTime() {
    return Math.max(0, this.stage.timerMs - this.timeRemainingMs) / 1000;
  }

  syncMovingHazards() {
    updateMovingHazards(this.stage, this.hazardTime());
  }

  setRemoteBuilderCursor(cursor = null) {
    this.remoteBuilderCursor = cursor ? { ...cursor } : null;
  }

  setLocalControlRole(localControlRole) {
    this.localControlRole = normalizeControlRole(localControlRole);
  }

  advanceStage() {
    this.stageIndex = (this.stageIndex + 1) % this.stageSequence.length;
    this.loadStage(this.stageSequence[this.stageIndex]);
  }

  stageStats(extra = {}) {
    return {
      stageId: this.currentStageId(),
      timeLimitMs: this.stage.timerMs,
      timeClearedMs: Math.round(this.elapsedMs),
      runnerDeaths: this.runner.deaths,
      toolUseCount: this.registry.toolUseCount,
      ...extra,
    };
  }

  // The world as the authoritative client (the Runner's, online) sees it. Only
  // active tools ride along: a tool absent from a sync is a tool the Runner no
  // longer has, and the replica deactivates it.
  createStateSnapshot(tick = 0) {
    return {
      tick,
      runner: {
        x: this.runner.x,
        y: this.runner.y,
        vx: this.runner.vx,
        vy: this.runner.vy,
        dead: this.runner.dead,
        grounded: this.runner.grounded,
        climbing: this.runner.climbing,
        facing: this.runner.facing,
        deaths: this.runner.deaths,
        repositions: this.runner.repositions,
      },
      tools: this.registry.tools.filter((tool) => tool.active).map((tool) => ({
        id: tool.id,
        toolType: tool.toolType,
        x: tool.x,
        y: tool.y,
        active: true,
        activated: tool.activated === true,
      })),
      timerMs: this.timeRemainingMs,
      elapsedMs: this.elapsedMs,
      stageStatus: this.stageEnded ? (this.cleared ? 'clear' : 'fail') : 'playing',
    };
  }

  // Reconcile this replica with an authoritative world sync. Tools are matched
  // by id (a placement's command id, or a kit slot), so the Builder's predicted
  // copy and the Runner's copy are the same object. A tool still marked as a
  // prediction is left alone until the Runner either confirms it (the sync
  // agrees with the prediction) or the grace window runs out — otherwise a sync
  // the Runner sent *before* the command reached them would undo the click and
  // the next one would redo it, and the Builder would watch their own tools
  // flicker.
  applyStateSnapshot(snapshot = {}) {
    if (snapshot.runner) {
      this.runner.x = Number(snapshot.runner.x) || 0;
      this.runner.y = Number(snapshot.runner.y) || 0;
      this.runner.vx = Number(snapshot.runner.vx) || 0;
      this.runner.vy = Number(snapshot.runner.vy) || 0;
      this.runner.dead = snapshot.runner.dead === true;
      if (typeof snapshot.runner.grounded === 'boolean') this.runner.grounded = snapshot.runner.grounded;
      if (typeof snapshot.runner.climbing === 'boolean') this.runner.climbing = snapshot.runner.climbing;
      if (snapshot.runner.facing === -1 || snapshot.runner.facing === 1) this.runner.facing = snapshot.runner.facing;
      if (Number.isFinite(Number(snapshot.runner.deaths))) this.runner.deaths = Number(snapshot.runner.deaths);
      if (Number.isFinite(Number(snapshot.runner.repositions))) this.runner.repositions = Number(snapshot.runner.repositions);
    }
    if (snapshot.timerMs !== undefined && Number.isFinite(Number(snapshot.timerMs))) {
      this.timeRemainingMs = Math.max(0, Number(snapshot.timerMs));
      this.syncMovingHazards();
    }
    if (snapshot.elapsedMs !== undefined && Number.isFinite(Number(snapshot.elapsedMs))) {
      this.elapsedMs = Math.max(0, Number(snapshot.elapsedMs));
    }
    if (Array.isArray(snapshot.tools)) {
      const remoteById = new Map(snapshot.tools.map((tool) => [tool.id, tool]));
      for (const localTool of this.registry.tools) {
        const remoteTool = remoteById.get(localTool.id);
        const remoteActive = !!remoteTool && remoteTool.active !== false;
        if (localTool.pendingSnapshots > 0) {
          if (remoteActive === localTool.active) {
            localTool.pendingSnapshots = 0;
          } else {
            localTool.pendingSnapshots -= 1;
            continue;
          }
        }
        localTool.active = remoteActive;
        if (remoteTool) {
          localTool.x = Number(remoteTool.x) || 0;
          localTool.y = Number(remoteTool.y) || 0;
          if (typeof remoteTool.activated === 'boolean') localTool.activated = remoteTool.activated;
        }
      }
      for (const remoteTool of snapshot.tools) {
        if (remoteTool.active === false || !TOOL_DEFS[remoteTool.toolType]) continue;
        if (this.registry.tools.some((tool) => tool.id === remoteTool.id)) continue;
        const tool = makeTool(remoteTool.toolType, Number(remoteTool.x) || 0, Number(remoteTool.y) || 0, remoteTool.id);
        if (typeof remoteTool.activated === 'boolean') tool.activated = remoteTool.activated;
        this.registry.tools.push(tool);
      }
    }
  }

  // Apply a Builder command to this world. Online, the Runner's client applies
  // the relayed command for real and the Builder's client applies its own as a
  // `predicted` guess that the next world syncs confirm or withdraw. A placement
  // is named by its command id on both sides.
  applyBuilderCommand(command = {}, { predicted = false } = {}) {
    let result;
    if (command.action === 'recall') {
      result = this.registry.recallAll();
    } else if (command.action === 'delete') {
      result = this.registry.deleteAt(command.gridX, command.gridY);
    } else {
      result = this.registry.add(command.toolType, command.gridX, command.gridY, this.runner, {
        id: typeof command.commandId === 'string' ? command.commandId : null,
      });
    }
    const succeeded = result.valid === true || result.deleted === true || result.recalled === true;
    if (predicted && succeeded) {
      for (const tool of result.tools ?? [result.tool]) tool.pendingSnapshots = PREDICTION_GRACE_SNAPSHOTS;
    }
    this.audioEvents.push({ type: succeeded ? 'toolAction' : 'error' });
    return result;
  }

  applyRunnerInputCommand(input = {}) {
    const previous = this.remoteRunnerInputState ?? { jump: false, reposition: false };
    let jumpPressed = input.jump === true && !previous.jump;
    let repositionPressed = input.reposition === true && !previous.reposition;
    this.remoteRunnerInputState = {
      jump: input.jump === true,
      reposition: input.reposition === true,
    };
    this.remoteRunnerInput = {
      axisX: () => (input.right ? 1 : 0) - (input.left ? 1 : 0),
      upHeld: () => input.up === true,
      downHeld: () => input.down === true,
      jumpHeld: () => input.jump === true,
      consumeJumpPressed: () => {
        const pressed = jumpPressed;
        jumpPressed = false;
        return pressed;
      },
      consumeReposition: () => {
        const pressed = repositionPressed;
        repositionPressed = false;
        return pressed;
      },
    };
  }

  endStage(outcome, extra = {}) {
    if (this.stageEnded) return;
    this.stageEnded = true;
    this.cleared = outcome === 'clear';
    const result = { outcome, ...this.stageStats(extra) };
    this.audioEvents.push({ type: outcome === 'clear' ? 'goal' : 'error' });
    if (outcome === 'clear') this.onStageClear?.(result);
    else this.onStageFailure?.(result);
  }

  // `builderActions: false` keeps the Builder's hover preview live but leaves
  // clicks unconsumed, for a controller that turns them into online commands.
  update(dt, { skipEndFrame = false, builderActions = true } = {}) {
    if (this.stageEnded || this.cleared) {
      if (this.input.keys.has('Enter') || this.input.consumeReposition()) this.resetRuntime();
      if (this.input.keys.has('KeyN')) this.advanceStage();
      if (!skipEndFrame) this.input.endFrame();
      return;
    }

    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - dt * 1000);
    this.elapsedMs += dt * 1000;
    const runnerInput = this.remoteRunnerInput
      ?? (this.localControlRole === CONTROL_ROLES.BUILDER || this.localControlRole === CONTROL_ROLES.INERT ? INERT_INPUT : this.input);
    const builderInput = this.localControlRole === CONTROL_ROLES.RUNNER || this.localControlRole === CONTROL_ROLES.INERT ? null : this.input;
    this.syncMovingHazards();
    this.runner.update(dt, runnerInput, this.registry);
    this.registry.markInUse(this.runner);
    this.camera.update(dt, this.runner, builderInput ?? INERT_INPUT);
    if (builderInput && builderActions) this.builder.update(dt, builderInput, this.camera, this.runner);
    else if (builderInput) this.builder.updateHover(builderInput, this.camera, this.runner);

    if (rectsOverlap(this.runner.rect(), this.stage.goal)) this.endStage('clear');
    if (this.timeRemainingMs <= 0) {
      this.timeRemainingMs = 0;
      this.endStage('fail', { reason: 'timer' });
    }

    if (!skipEndFrame) this.input.endFrame();
  }

  render() {
    this.renderer.render(this);
  }

  consumeAudioEvents() {
    return [
      ...this.audioEvents.splice(0),
      ...this.runner.consumeAudioEvents(),
      ...this.builder.consumeAudioEvents(),
    ];
  }
}
