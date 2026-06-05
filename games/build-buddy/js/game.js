import { Input } from './input.js';
import { Runner } from './runner.js';
import { Camera } from './camera.js';
import { ToolRegistry, BuilderController } from './tools.js';
import { Renderer } from './renderer.js';
import { rectsOverlap } from './utils.js';
import { getStageById, getStageSequence } from './stages/stage-registry.js';
import { normalizeViewMode, VIEW_MODES } from './view-modes.js';
import { TOOL_DEFS } from './constants.js';

const CONTROL_ROLES = Object.freeze({
  RUNNER: 'runner',
  BUILDER: 'builder',
  DEBUG: 'debug',
  INERT: 'inert',
});

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
  if (value === CONTROL_ROLES.DEBUG) return value;
  return CONTROL_ROLES.INERT;
}

export class Game {
  constructor(canvas, {
    initialStageId = null,
    viewMode = VIEW_MODES.HYBRID,
    localControlRole = CONTROL_ROLES.DEBUG,
    onStageClear = null,
    onStageFailure = null,
  } = {}) {
    this.canvas = canvas;
    this.stageSequence = getStageSequence();
    this.stageIndex = Math.max(0, this.stageSequence.indexOf(initialStageId ?? this.stageSequence[0]));
    this.viewMode = normalizeViewMode(viewMode);
    this.localControlRole = normalizeControlRole(localControlRole);
    this.onStageClear = onStageClear;
    this.onStageFailure = onStageFailure;
    this.input = new Input(canvas);
    this.remoteRunnerInput = null;
    this.loadStage(this.stageSequence[this.stageIndex]);
  }

  currentStageId() {
    return this.stageSequence[this.stageIndex];
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
  }

  setViewMode(viewMode) {
    if (this.localControlRole !== CONTROL_ROLES.DEBUG) return;
    this.viewMode = normalizeViewMode(viewMode);
    this.renderer?.setViewMode(this.viewMode);
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
      toolUseCount: this.registry.tools.filter((tool) => tool.active).length,
      ...extra,
    };
  }

  createStateSnapshot(tick = 0) {
    return {
      tick,
      runner: {
        x: this.runner.x,
        y: this.runner.y,
        vx: this.runner.vx,
        vy: this.runner.vy,
        dead: this.runner.dead,
      },
      tools: this.registry.tools.map((tool) => ({
        id: tool.id,
        toolType: tool.toolType,
        x: tool.x,
        y: tool.y,
        active: tool.active,
      })),
      timerMs: this.timeRemainingMs,
      stageStatus: this.stageEnded ? (this.cleared ? 'clear' : 'fail') : 'playing',
    };
  }

  applyStateSnapshot(snapshot = {}) {
    if (snapshot.runner) {
      this.runner.x = Number(snapshot.runner.x) || 0;
      this.runner.y = Number(snapshot.runner.y) || 0;
      this.runner.vx = Number(snapshot.runner.vx) || 0;
      this.runner.vy = Number(snapshot.runner.vy) || 0;
      this.runner.dead = snapshot.runner.dead === true;
    }
    if (Number.isFinite(Number(snapshot.timerMs))) {
      this.timeRemainingMs = Math.max(0, Number(snapshot.timerMs));
    }
    if (Array.isArray(snapshot.tools)) {
      for (const remoteTool of snapshot.tools) {
        const localTool = this.registry.tools.find((tool) => tool.id === remoteTool.id);
        if (localTool) {
          localTool.x = Number(remoteTool.x) || 0;
          localTool.y = Number(remoteTool.y) || 0;
          localTool.active = remoteTool.active !== false;
        } else if (remoteTool.active !== false && TOOL_DEFS[remoteTool.toolType]) {
          const def = TOOL_DEFS[remoteTool.toolType];
          this.registry.tools.push({
            id: remoteTool.id,
            toolType: remoteTool.toolType,
            kind: def.kind,
            x: Number(remoteTool.x) || 0,
            y: Number(remoteTool.y) || 0,
            w: def.width,
            h: def.height,
            bounceVy: def.bounceVy ?? 0,
            active: true,
            activated: false,
            usedForRespawn: false,
            inUse: false,
          });
        }
      }
    }
  }

  applyBuilderCommand(command = {}) {
    if (command.action === 'delete') {
      return this.registry.deleteAt(command.gridX, command.gridY);
    }
    return this.registry.add(command.toolType, command.gridX, command.gridY, this.runner);
  }

  applyRunnerInputCommand(input = {}) {
    this.remoteRunnerInput = {
      axisX: () => (input.right ? 1 : 0) - (input.left ? 1 : 0),
      upHeld: () => input.up === true,
      downHeld: () => input.down === true,
      jumpHeld: () => input.jump === true,
      consumeJumpPressed: () => input.jump === true,
      consumeReposition: () => input.reposition === true,
    };
  }

  endStage(outcome, extra = {}) {
    if (this.stageEnded) return;
    this.stageEnded = true;
    this.cleared = outcome === 'clear';
    const result = { outcome, ...this.stageStats(extra) };
    if (outcome === 'clear') this.onStageClear?.(result);
    else this.onStageFailure?.(result);
  }

  update(dt) {
    const requestedViewMode = this.input.consumeViewModeRequest();
    if (requestedViewMode) this.setViewMode(requestedViewMode);

    if (this.stageEnded || this.cleared) {
      if (this.input.keys.has('Enter') || this.input.consumeReposition()) this.resetRuntime();
      if (this.input.keys.has('KeyN')) this.advanceStage();
      this.input.endFrame();
      return;
    }

    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - dt * 1000);
    this.elapsedMs += dt * 1000;
    const runnerInput = this.remoteRunnerInput
      ?? (this.localControlRole === CONTROL_ROLES.BUILDER || this.localControlRole === CONTROL_ROLES.INERT ? INERT_INPUT : this.input);
    const builderInput = this.localControlRole === CONTROL_ROLES.RUNNER || this.localControlRole === CONTROL_ROLES.INERT ? null : this.input;
    this.runner.update(dt, runnerInput, this.registry);
    this.registry.markInUse(this.runner);
    this.camera.update(dt, this.runner, builderInput ?? INERT_INPUT);
    if (builderInput) this.builder.update(dt, builderInput, this.camera, this.runner);

    if (rectsOverlap(this.runner.rect(), this.stage.goal)) this.endStage('clear');
    if (this.timeRemainingMs <= 0) {
      this.timeRemainingMs = 0;
      this.endStage('fail', { reason: 'timer' });
    }

    this.input.endFrame();
  }

  render() {
    this.renderer.render(this);
  }
}
