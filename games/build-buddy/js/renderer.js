import { VIEW } from './constants.js';
import { BackgroundRenderer } from './render/background-renderer.js';
import { TerrainRenderer } from './render/terrain-renderer.js';
import { ToolRenderer } from './render/tool-renderer.js';
import { GoalRenderer } from './render/goal-renderer.js';
import { GhostRenderer } from './render/ghost-renderer.js';
import { RunnerRenderer } from './render/runner-renderer.js';
import { HudRenderer } from './render/hud-renderer.js';
import { normalizeViewMode, viewModeConfig } from './view-modes.js';

export class Renderer {
  constructor(canvas, stage, registry, runner, builder, camera, { viewMode = 'hybrid' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stage = stage;
    this.registry = registry;
    this.runner = runner;
    this.builder = builder;
    this.camera = camera;
    this.viewMode = normalizeViewMode(viewMode);

    this.background = new BackgroundRenderer(stage, camera);
    this.terrain = new TerrainRenderer(stage);
    this.tools = new ToolRenderer(registry);
    this.goal = new GoalRenderer(stage);
    this.ghost = new GhostRenderer(builder);
    this.runnerRenderer = new RunnerRenderer(runner);
    this.hud = new HudRenderer(stage, registry, runner, builder);
  }

  setViewMode(viewMode) {
    this.viewMode = normalizeViewMode(viewMode);
  }

  render(game) {
    const ctx = this.ctx;
    const cfg = viewModeConfig(this.viewMode);
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);

    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    this.background.draw(ctx, game);
    if (cfg.showBuilderZones) this.terrain.drawZones(ctx);
    this.terrain.draw(ctx, this.tools);
    this.tools.draw(ctx);
    this.goal.draw(ctx);
    this.ghost.draw(ctx, game.remoteBuilderCursor ?? null);
    if (cfg.showRunner) this.runnerRenderer.draw(ctx, { showSafetyZone: cfg.showSafetyZone });
    ctx.restore();

    this.hud.draw(ctx, game, { viewMode: this.viewMode });
  }
}
