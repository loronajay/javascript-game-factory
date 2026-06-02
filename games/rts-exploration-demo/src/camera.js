import { clamp } from './utils.js';

export class Camera {
  constructor({ worldWidth, worldHeight, viewportWidth, viewportHeight }) {
    this.x = 0;
    this.y = 0;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  resize(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.clampToWorld();
  }

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clampToWorld();
  }

  centerOn(worldX, worldY) {
    this.x = worldX - this.viewportWidth / 2;
    this.y = worldY - this.viewportHeight / 2;
    this.clampToWorld();
  }

  clampToWorld() {
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - this.viewportWidth));
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - this.viewportHeight));
  }

  screenToWorld(screenX, screenY) {
    return { x: screenX + this.x, y: screenY + this.y };
  }

  worldToScreen(worldX, worldY) {
    return { x: worldX - this.x, y: worldY - this.y };
  }
}
