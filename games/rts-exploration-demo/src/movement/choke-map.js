import { CONFIG } from '../config.js';
import { estimateColumnsAtPoint } from './group-planner.js';

const DEFAULT_MAX_COLUMNS = 3;

export class ChokeMap {
  constructor(map, options = {}) {
    this.map = map;
    this.clearanceRadius = options.clearanceRadius ?? Math.max(8, Math.floor(CONFIG.tileSize * 0.42));
    this.spacing = options.spacing ?? Math.max(18, CONFIG.formationSpacing * 0.82);
    this.maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
    this.version = 0;
    this.cells = new Map();
    this.rebuild();
  }

  rebuild() {
    this.cells.clear();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        if (!this.map.tileHasClearance?.(x, y, this.clearanceRadius)) continue;
        const center = this.map.tileCenter(x, y);
        const horizontal = estimateColumnsAtPoint(this.map, center, this.clearanceRadius, { x: 1, y: 0 }, this.spacing);
        const vertical = estimateColumnsAtPoint(this.map, center, this.clearanceRadius, { x: 0, y: 1 }, this.spacing);
        const columns = Math.max(1, Math.min(this.maxColumns, horizontal, vertical));
        this.cells.set(tileKey(x, y), {
          tileX: x,
          tileY: y,
          clearanceRadius: this.clearanceRadius,
          columns,
          isChoke: columns <= 1,
          horizontalColumns: horizontal,
          verticalColumns: vertical,
        });
      }
    }
    this.version += 1;
  }

  getTileInfo(tileX, tileY) {
    return this.cells.get(tileKey(tileX, tileY)) ?? {
      tileX,
      tileY,
      clearanceRadius: this.clearanceRadius,
      columns: 0,
      isChoke: false,
      horizontalColumns: 0,
      verticalColumns: 0,
    };
  }

  getWorldInfo(worldX, worldY) {
    const tile = this.map.worldToTile(worldX, worldY);
    return this.getTileInfo(tile.x, tile.y);
  }

  isChokeTile(tileX, tileY) {
    return !!this.getTileInfo(tileX, tileY).isChoke;
  }

  sampleChokeCellsAlongSegment(ax, ay, bx, by, maxCells = 3) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return [];
    const step = Math.max(6, this.map.tileSize * 0.55);
    const samples = Math.max(1, Math.ceil(dist / step));
    const cells = [];
    const seen = new Set();
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const tile = this.map.worldToTile(ax + dx * t, ay + dy * t);
      const key = tileKey(tile.x, tile.y);
      if (seen.has(key)) continue;
      seen.add(key);
      const info = this.getTileInfo(tile.x, tile.y);
      if (!info.isChoke) continue;
      cells.push({ ...info, key });
      if (cells.length >= maxCells) break;
    }
    return cells;
  }

  debugCells(limit = 260) {
    const out = [];
    for (const info of this.cells.values()) {
      if (!info.isChoke) continue;
      out.push(info);
      if (out.length >= limit) break;
    }
    return out;
  }
}

export function tileKey(tileX, tileY) {
  return `${tileX},${tileY}`;
}
