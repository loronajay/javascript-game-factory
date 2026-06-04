import { Input } from './input.js';
import { Runner } from './runner.js';
import { Camera } from './camera.js';
import { ToolRegistry, BuilderController } from './tools.js';
import { Renderer } from './renderer.js';
import { rectsOverlap } from './utils.js';
import { getStageById, getStageSequence } from './stages/stage-registry.js';
import { normalizeViewMode, VIEW_MODES } from './view-modes.js';

export class Game {
  constructor(canvas, { initialStageId = null, viewMode = VIEW_MODES.HYBRID } = {}) {
    this.canvas = canvas;
    this.stageSequence = getStageSequence();
    this.stageIndex = Math.max(0, this.stageSequence.indexOf(initialStageId ?? this.stageSequence[0]));
    this.viewMode = normalizeViewMode(viewMode);
    this.input = new Input(canvas);
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
    this.cleared = false;
  }

  setViewMode(viewMode) {
    this.viewMode = normalizeViewMode(viewMode);
    this.renderer?.setViewMode(this.viewMode);
  }

  advanceStage() {
    this.stageIndex = (this.stageIndex + 1) % this.stageSequence.length;
    this.loadStage(this.stageSequence[this.stageIndex]);
  }

  update(dt) {
    const requestedViewMode = this.input.consumeViewModeRequest();
    if (requestedViewMode) this.setViewMode(requestedViewMode);

    if (this.cleared) {
      if (this.input.keys.has('Enter') || this.input.consumeReposition()) this.resetRuntime();
      if (this.input.keys.has('KeyN')) this.advanceStage();
      this.input.endFrame();
      return;
    }

    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - dt * 1000);
    this.runner.update(dt, this.input, this.registry);
    this.registry.markInUse(this.runner);
    this.camera.update(dt, this.runner, this.input);
    this.builder.update(dt, this.input, this.camera, this.runner);

    if (rectsOverlap(this.runner.rect(), this.stage.goal)) this.cleared = true;
    if (this.timeRemainingMs <= 0) {
      this.timeRemainingMs = this.stage.timerMs;
      this.runner.kill('timer');
    }

    this.input.endFrame();
  }

  render() {
    this.renderer.render(this);
  }
}
