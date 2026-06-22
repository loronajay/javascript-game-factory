import { TILE } from './map-data.js';
import { CONFIG } from '../config.js';

// Applies a MapDef to a MapData instance.
// Accepts a rand() function so the same seed produces identical output across calls.
export class MapGenerator {
  constructor(map) {
    this.map = map;
  }

  applyDef(def, rand) {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        this.map.variance[this.map.index(x, y)] = rand();
      }
    }

    for (const layer of (def.layers ?? [])) this.applyLayer(layer, rand);
    for (const s of (def.clearSpawns ?? [])) this.clearSpawnArea(s.x, s.y, s.radius);

    for (const gate of (def.gates ?? [])) {
      if (gate.wall) this.addRect(gate.wall.x, gate.wall.y, gate.wall.w, gate.wall.h);
      if (gate.carve) this.carveGap(gate.carve.x, gate.carve.y, gate.carve.w, gate.carve.h);
      this.map.addDestructibleRect(gate.x, gate.y, gate.w, gate.h, gate.hp ?? CONFIG.destructibleWallHp);
    }

    for (const d of (def.destructibles ?? [])) {
      this.map.addDestructibleRect(d.x, d.y, d.w, d.h, d.hp ?? CONFIG.destructibleWallHp);
    }

    for (const r of (def.resources ?? [])) {
      this.map.addResourceNode(r.x, r.y, r.kind ?? 'biomass');
    }

    for (const landmark of (def.landmarks ?? [])) this.map.addLandmark(landmark);
  }

  applyLayer(layer, rand) {
    switch (layer.type) {
      case 'fill':   this.map.tiles.fill(TILE.FLOOR); break;
      case 'border': this.addBorder(); break;
      case 'rect':   this.addRect(layer.x, layer.y, layer.w, layer.h); break;
      case 'gap':    this.carveGap(layer.x, layer.y, layer.w, layer.h); break;
      case 'path':   this.addWallPath(layer.points, layer.width ?? 1); break;
      case 'naturalWallPath':
        this.addNaturalWallPath(layer.points, layer.width ?? 1, layer.hp, layer.kind);
        if (layer.rotational) {
          this.addNaturalWallPath(
            layer.points.map((point) => ({ x: this.map.width - 1 - point.x, y: this.map.height - 1 - point.y })),
            layer.width ?? 1,
            layer.hp,
            layer.kind,
          );
        }
        break;
      case 'maze':   this.addMazeCluster(layer.x, layer.y, layer.w, layer.h); break;
      case 'decor':  this.addDecorPatches(rand, layer.count ?? 420, layer.density ?? 0.55); break;
    }
  }

  addBorder() {
    const { width, height } = this.map;
    for (let x = 0; x < width; x++) {
      this.map.set(x, 0, TILE.WALL);
      this.map.set(x, height - 1, TILE.WALL);
    }
    for (let y = 0; y < height; y++) {
      this.map.set(0, y, TILE.WALL);
      this.map.set(width - 1, y, TILE.WALL);
    }
  }

  addRect(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.map.set(xx, yy, TILE.WALL);
    }
  }

  carveGap(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.map.set(xx, yy, TILE.FLOOR);
    }
  }

  // An authored, grid-snapped wall run. This keeps visual reference geometry
  // (diagonals and octagons) in the level definition rather than burying it in
  // a procedural maze algorithm.
  addWallPath(points, width = 1) {
    if (!Array.isArray(points) || points.length < 2) return;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      this.addWallLine(from.x, from.y, to.x, to.y, width);
    }
  }

  addWallLine(x0, y0, x1, y1, width) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    const radius = Math.max(0, Math.floor((width - 1) / 2));

    while (true) {
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) this.map.set(x + ox, y + oy, TILE.WALL);
      }
      if (x === x1 && y === y1) break;
      const twiceError = error * 2;
      if (twiceError >= dy) { error += dy; x += sx; }
      if (twiceError <= dx) { error += dx; y += sy; }
    }
  }

  addNaturalWallPath(points, width = 1, hp = CONFIG.destructibleWallHp, kind = 'naturalWall') {
    if (!Array.isArray(points) || points.length < 2) return;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      this.addNaturalWallLine(from.x, from.y, to.x, to.y, width, hp, kind);
    }
  }

  addNaturalWallLine(x0, y0, x1, y1, width, hp, kind) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    const radius = Math.max(0, Math.floor((width - 1) / 2));

    while (true) {
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) this.map.addDestructibleTile(x + ox, y + oy, hp, kind);
      }
      if (x === x1 && y === y1) break;
      const twiceError = error * 2;
      if (twiceError >= dy) { error += dy; x += sx; }
      if (twiceError <= dx) { error += dx; y += sy; }
    }
  }

  addMazeCluster(x, y, w, h) {
    for (let xx = x; xx < x + w; xx += 4) this.addRect(xx, y, 2, h);
    for (let yy = y + 3; yy < y + h; yy += 7) this.addRect(x, yy, w, 2);
    for (let yy = y + 2; yy < y + h; yy += 8) {
      const gapX = x + 2 + ((yy * 7) % Math.max(4, w - 6));
      this.carveGap(gapX, yy, 4, 2);
    }
    for (let xx = x + 2; xx < x + w; xx += 8) {
      const gapY = y + 2 + ((xx * 5) % Math.max(4, h - 6));
      this.carveGap(xx, gapY, 2, 4);
    }
  }

  addDecorPatches(rand, count = 420, density = 0.55) {
    const { width, height } = this.map;
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(rand() * (width - 4));
      const y = 2 + Math.floor(rand() * (height - 4));
      if (this.map.get(x, y) === TILE.FLOOR && rand() < density) this.map.set(x, y, TILE.DECOR);
    }
  }

  clearSpawnArea(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.map.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) this.map.set(x, y, TILE.FLOOR);
      }
    }
  }
}
