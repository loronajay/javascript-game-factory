import { clamp, approach } from './utils.js';
import { VIEW } from './constants.js';

export class Camera {
  constructor(stage) {
    this.stage = stage;
    const startX = stage.start?.x ?? 0;
    const startY = stage.start?.y ?? 0;
    this.x = clamp(startX - VIEW.width * 0.42, 0, Math.max(0, stage.width - VIEW.width));
    this.y = clamp(startY - VIEW.height * 0.58, 0, Math.max(0, stage.height - VIEW.height));
    this.builderNudgeX = 0;
  }

  update(dt, runner, input) {
    const desiredX = runner.x + runner.w / 2 - VIEW.width * 0.42;
    const desiredY = runner.y + runner.h / 2 - VIEW.height * 0.58;
    this.builderNudgeX = approach(this.builderNudgeX, input.cameraNudgeX() * 260, 720 * dt);
    this.x = clamp(desiredX + this.builderNudgeX, 0, this.stage.width - VIEW.width);
    this.y = clamp(desiredY, 0, this.stage.height - VIEW.height);
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}
