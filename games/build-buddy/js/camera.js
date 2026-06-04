import { clamp, approach } from './utils.js';
import { VIEW } from './constants.js';

export class Camera {
  constructor(stage) {
    this.stage = stage;
    this.x = 0;
    this.y = 0;
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
