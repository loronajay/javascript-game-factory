import { CONFIG } from './config.js';
import { normalizeRect } from './utils.js';

export class InputController {
  constructor(canvas, camera, units, map) {
    this.canvas = canvas;
    this.camera = camera;
    this.units = units;
    this.map = map;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };
    this.dragStart = null;
    this.dragCurrent = null;
    this.selectionDrag = null;
    this.lastMoveCommand = null;
    this.showFogDebug = false;
    this.showPathDebug = false;
    this.commandState = 'idle';
    this.install();
  }

  install() {
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key.toLowerCase());
      if (event.key === 'Escape') this.units.clearSelection();
      if (event.key === ' ') {
        event.preventDefault();
        const center = this.units.selectedCenter();
        if (center) this.camera.centerOn(center.x, center.y);
      }
      if (event.key.toLowerCase() === 'f') this.showFogDebug = !this.showFogDebug;
      if (event.key.toLowerCase() === 'p') this.showPathDebug = !this.showPathDebug;
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('pointerup', (event) => this.onPointerUp(event));
  }

  update(dt) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;

    const rect = this.canvas.getBoundingClientRect();
    if (!this.pointer.down) {
      if (this.pointer.x <= CONFIG.edgePanSize) dx -= CONFIG.edgePanSpeed / CONFIG.cameraSpeed;
      if (this.pointer.x >= rect.width - CONFIG.edgePanSize) dx += CONFIG.edgePanSpeed / CONFIG.cameraSpeed;
      if (this.pointer.y <= CONFIG.edgePanSize) dy -= CONFIG.edgePanSpeed / CONFIG.cameraSpeed;
      if (this.pointer.y >= rect.height - CONFIG.edgePanSize) dy += CONFIG.edgePanSpeed / CONFIG.cameraSpeed;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.camera.pan((dx / len) * CONFIG.cameraSpeed * dt, (dy / len) * CONFIG.cameraSpeed * dt);
      this.updatePointerWorld();
    }
  }

  onPointerMove(event) {
    const pos = this.eventPosition(event);
    this.pointer.x = pos.x;
    this.pointer.y = pos.y;
    this.updatePointerWorld();
    if (this.pointer.down && this.dragStart) {
      this.dragCurrent = { x: this.pointer.worldX, y: this.pointer.worldY };
      const dist = Math.hypot(this.dragCurrent.x - this.dragStart.x, this.dragCurrent.y - this.dragStart.y);
      if (dist > CONFIG.selectionClickTolerance) {
        this.selectionDrag = normalizeRect(this.dragStart, this.dragCurrent);
        this.commandState = 'selecting';
      }
    }
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture?.(event.pointerId);
    const pos = this.eventPosition(event);
    this.pointer.x = pos.x;
    this.pointer.y = pos.y;
    this.pointer.down = true;
    this.updatePointerWorld();

    if (event.button === 2) {
      const attackableUnit = this.units.hitTestAttackable(this.pointer.worldX, this.pointer.worldY);
      if (attackableUnit) {
        const issued = this.units.attackSelectedUnit(attackableUnit);
        if (issued) this.lastMoveCommand = { x: attackableUnit.x, y: attackableUnit.y, ttl: 0.65, kind: 'attack' };
        this.commandState = issued ? `attack ${attackableUnit.type}` : 'no combat unit selected';
        return;
      }

      const targetTile = this.map.worldToTile(this.pointer.worldX, this.pointer.worldY);
      if (this.map.isDestructibleTile(targetTile.x, targetTile.y)) {
        const issued = this.units.attackSelectedDestructible(targetTile.x, targetTile.y);
        const center = this.map.tileCenter(targetTile.x, targetTile.y);
        if (issued) this.lastMoveCommand = { x: center.x, y: center.y, ttl: 0.65, kind: 'attack' };
        this.commandState = issued ? 'attack wall' : 'no combat unit selected';
        return;
      }

      const issued = this.units.moveSelectedTo(this.pointer.worldX, this.pointer.worldY);
      if (issued) this.lastMoveCommand = { x: this.pointer.worldX, y: this.pointer.worldY, ttl: 0.55, kind: 'move' };
      this.commandState = issued ? 'move issued' : 'no selection';
      return;
    }

    if (event.button === 0) {
      this.dragStart = { x: this.pointer.worldX, y: this.pointer.worldY };
      this.dragCurrent = { ...this.dragStart };
      this.selectionDrag = null;
      this.commandState = 'pending select';
    }
  }

  onPointerUp(event) {
    if (!this.pointer.down) return;
    this.pointer.down = false;
    if (event.button !== 0) return;

    const additive = event.shiftKey;
    if (this.selectionDrag && this.selectionDrag.w > 4 && this.selectionDrag.h > 4) {
      this.units.selectInWorldRect(this.selectionDrag, additive);
      this.commandState = 'box selected';
    } else {
      const unit = this.units.hitTestUnit(this.pointer.worldX, this.pointer.worldY, { selectableOnly: true });
      if (unit) {
        this.units.selectSingle(unit.id, additive);
        this.commandState = 'unit selected';
      } else if (!additive) {
        this.units.clearSelection();
        this.commandState = 'selection cleared';
      }
    }
    this.dragStart = null;
    this.dragCurrent = null;
    this.selectionDrag = null;
  }

  eventPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  updatePointerWorld() {
    const world = this.camera.screenToWorld(this.pointer.x, this.pointer.y);
    this.pointer.worldX = world.x;
    this.pointer.worldY = world.y;
  }

  updateCommandMarker(dt) {
    if (!this.lastMoveCommand) return;
    this.lastMoveCommand.ttl -= dt;
    if (this.lastMoveCommand.ttl <= 0) this.lastMoveCommand = null;
  }
}
