import { CONFIG } from '../config.js';
import { clamp } from '../utils.js';

export const TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  DECOR: 2,
  DESTRUCTIBLE: 3,
});

// Pure data layer: tile grid, walkability queries, coordinate math, destructibles, resources.
// No generation logic lives here — see map-generator.js.
export class MapData {
  constructor(width = CONFIG.mapWidth, height = CONFIG.mapHeight, tileSize = CONFIG.tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.worldWidth = width * tileSize;
    this.worldHeight = height * tileSize;
    this.tiles = new Uint8Array(width * height);
    this.variance = new Float32Array(width * height);
    this.destructibles = new Map();
    this.staticColliders = new Map();
    this.resourceNodes = [];
    // Authored map entities are declarative. Systems may later turn these into
    // live structures, deposits, or neutral units without rediscovering intent
    // from renderer-only coordinates.
    this.landmarks = [];
  }

  index(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  get(x, y) {
    if (!this.inBounds(x, y)) return TILE.WALL;
    return this.tiles[this.index(x, y)];
  }

  set(x, y, value) {
    if (this.inBounds(x, y)) this.tiles[this.index(x, y)] = value;
  }

  isWalkableTile(x, y) {
    const tile = this.get(x, y);
    return this.inBounds(x, y) && tile !== TILE.WALL && tile !== TILE.DESTRUCTIBLE;
  }

  isCircleWalkable(worldX, worldY, radius) {
    const minTile = this.worldToTile(worldX - radius, worldY - radius);
    const maxTile = this.worldToTile(worldX + radius, worldY + radius);
    for (let y = minTile.y; y <= maxTile.y; y++) {
      for (let x = minTile.x; x <= maxTile.x; x++) {
        if (this.isWalkableTile(x, y)) continue;
        const left = x * this.tileSize;
        const top = y * this.tileSize;
        const right = left + this.tileSize;
        const bottom = top + this.tileSize;
        const closestX = clamp(worldX, left, right);
        const closestY = clamp(worldY, top, bottom);
        const dx = worldX - closestX;
        const dy = worldY - closestY;
        if (dx * dx + dy * dy < radius * radius) return false;
      }
    }
    for (const collider of this.staticColliders.values()) {
      if (collider.blocksMovement === false) continue;
      const dx = worldX - collider.x;
      const dy = worldY - collider.y;
      const minDistance = radius + collider.radius;
      if (dx * dx + dy * dy < minDistance * minDistance) return false;
    }
    return true;
  }

  addStaticCollider(collider) {
    if (!collider?.id || !Number.isFinite(collider.x) || !Number.isFinite(collider.y) || !Number.isFinite(collider.radius)) return false;
    this.staticColliders.set(collider.id, collider);
    return true;
  }

  isDestructibleTile(x, y) {
    return this.inBounds(x, y) && this.get(x, y) === TILE.DESTRUCTIBLE && this.destructibles.has(this.index(x, y));
  }

  getDestructible(x, y) {
    return this.destructibles.get(this.index(x, y)) ?? null;
  }

  addDestructibleTile(x, y, hp = CONFIG.destructibleWallHp, kind = 'membrane') {
    if (!this.inBounds(x, y)) return;
    this.set(x, y, TILE.DESTRUCTIBLE);
    this.destructibles.set(this.index(x, y), { x, y, hp, maxHp: hp, kind });
  }

  addDestructibleRect(x, y, w, h, hp = CONFIG.destructibleWallHp, kind = 'membrane') {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.addDestructibleTile(xx, yy, hp, kind);
      }
    }
  }

  damageDestructible(x, y, amount) {
    const key = this.index(x, y);
    const wall = this.destructibles.get(key);
    if (!wall) return false;
    wall.hp = Math.max(0, wall.hp - amount);
    if (wall.hp <= 0) {
      this.destructibles.delete(key);
      this.set(x, y, TILE.FLOOR);
      if (isNaturalWallKind(wall.kind)) this.addWeakSteelDrop(x, y, wall.kind);
      return true;
    }
    return false;
  }

  destructibleCount() { return this.destructibles.size; }

  addResourceNode(tileX, tileY, kind = 'biomass', options = {}) {
    if (!this.inBounds(tileX, tileY) || !this.isWalkableTile(tileX, tileY)) return null;
    const center = this.tileCenter(tileX, tileY);
    const node = {
      id: `res_${this.resourceNodes.length + 1}`,
      kind,
      amount: options.amount ?? 1,
      tileX,
      tileY,
      x: center.x,
      y: center.y,
      discovered: false,
      dropped: options.dropped ?? false,
      sourceKind: options.sourceKind ?? null,
    };
    this.resourceNodes.push(node);
    return node;
  }

  addWeakSteelDrop(tileX, tileY, sourceKind) {
    return this.addResourceNode(tileX, tileY, 'weakSteel', {
      amount: 1,
      dropped: true,
      sourceKind,
    });
  }

  getResourceNode(id) {
    return this.resourceNodes.find((node) => node.id === id) ?? null;
  }

  takeResourceNode(id, amount) {
    const index = this.resourceNodes.findIndex((node) => node.id === id);
    if (index < 0 || amount <= 0) return null;
    const node = this.resourceNodes[index];
    const taken = Math.min(amount, node.amount ?? 1);
    node.amount = Math.max(0, (node.amount ?? 1) - taken);
    if (node.amount === 0) this.resourceNodes.splice(index, 1);
    return { kind: node.kind, amount: taken };
  }

  hitTestResourceNode(worldX, worldY, radius = this.tileSize * 0.55) {
    let best = null;
    let bestDistanceSq = radius * radius;
    for (const node of this.resourceNodes) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        best = node;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  addLandmark(def) {
    if (!this.inBounds(def.tileX, def.tileY)) return null;
    const landmark = Object.freeze({
      ...def,
      id: def.id ?? `landmark_${this.landmarks.length + 1}`,
      kind: def.kind,
      tileX: def.tileX,
      tileY: def.tileY,
      team: def.team ?? null,
      active: def.active ?? true,
    });
    this.landmarks.push(landmark);
    return landmark;
  }

  worldToTile(x, y) {
    return {
      x: clamp(Math.floor(x / this.tileSize), 0, this.width - 1),
      y: clamp(Math.floor(y / this.tileSize), 0, this.height - 1),
    };
  }

  tileCenter(x, y) {
    return {
      x: x * this.tileSize + this.tileSize / 2,
      y: y * this.tileSize + this.tileSize / 2,
    };
  }

  updateResourceDiscovery(fog) {
    for (const node of this.resourceNodes) {
      if (node.discovered) continue;
      if (fog.isVisible(node.tileX, node.tileY)) node.discovered = true;
    }
  }

  nearestWalkableTile(tileX, tileY, maxRadius = 14) {
    if (this.isWalkableTile(tileX, tileY)) return { x: tileX, y: tileY };
    for (let r = 1; r <= maxRadius; r++) {
      for (let y = tileY - r; y <= tileY + r; y++) {
        for (let x = tileX - r; x <= tileX + r; x++) {
          if (Math.abs(x - tileX) !== r && Math.abs(y - tileY) !== r) continue;
          if (this.isWalkableTile(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  tileHasClearance(tileX, tileY, radius) {
    if (!this.isWalkableTile(tileX, tileY)) return false;
    const center = this.tileCenter(tileX, tileY);
    return this.isCircleWalkable(center.x, center.y, radius);
  }

  nearestWalkableTileForRadius(tileX, tileY, radius, maxRadius = 18) {
    if (this.tileHasClearance(tileX, tileY, radius)) return { x: tileX, y: tileY };
    let best = null;
    let bestScore = Infinity;
    for (let r = 1; r <= maxRadius; r++) {
      for (let y = tileY - r; y <= tileY + r; y++) {
        for (let x = tileX - r; x <= tileX + r; x++) {
          if (Math.abs(x - tileX) !== r && Math.abs(y - tileY) !== r) continue;
          if (!this.tileHasClearance(x, y, radius)) continue;
          const score = (x - tileX) * (x - tileX) + (y - tileY) * (y - tileY);
          if (score < bestScore) {
            best = { x, y };
            bestScore = score;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}

function isNaturalWallKind(kind) {
  return kind === 'naturalWall' || kind === 'transitWall' || kind === 'objectiveWall';
}
