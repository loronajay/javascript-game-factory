import { CONFIG } from './config.js';
import { clamp, seededRandom } from './utils.js';

export const TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  DECOR: 2,
  DESTRUCTIBLE: 3,
});

export class GameMap {
  constructor(width = CONFIG.mapWidth, height = CONFIG.mapHeight, tileSize = CONFIG.tileSize) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.worldWidth = width * tileSize;
    this.worldHeight = height * tileSize;
    this.tiles = new Uint8Array(width * height);
    this.variance = new Float32Array(width * height);
    this.destructibles = new Map();
    this.resourceNodes = [];
    this.generate();
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

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
    return true;
  }

  isDestructibleTile(x, y) {
    return this.inBounds(x, y) && this.get(x, y) === TILE.DESTRUCTIBLE && this.destructibles.has(this.index(x, y));
  }

  getDestructible(x, y) {
    return this.destructibles.get(this.index(x, y)) ?? null;
  }

  addDestructibleRect(x, y, w, h, hp = CONFIG.destructibleWallHp) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!this.inBounds(xx, yy)) continue;
        this.set(xx, yy, TILE.DESTRUCTIBLE);
        this.destructibles.set(this.index(xx, yy), { x: xx, y: yy, hp, maxHp: hp });
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
      return true;
    }
    return false;
  }

  destructibleCount() {
    return this.destructibles.size;
  }

  addResourceNode(tileX, tileY, kind = 'biomass') {
    if (!this.inBounds(tileX, tileY) || !this.isWalkableTile(tileX, tileY)) return null;
    const center = this.tileCenter(tileX, tileY);
    const node = {
      id: `res_${this.resourceNodes.length + 1}`,
      kind,
      tileX,
      tileY,
      x: center.x,
      y: center.y,
      discovered: false,
    };
    this.resourceNodes.push(node);
    return node;
  }

  addAuthoredResourceNodes() {
    // Economy is intentionally not active yet. These are visible guarded
    // landmarks so creature placement already communicates future map value.
    this.addResourceNode(31, 21, 'biomass');
    this.addResourceNode(44, 42, 'biomass');
    this.addResourceNode(84, 44, 'crystal');
    this.addResourceNode(103, 57, 'crystal');
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

  generate() {
    const rand = seededRandom(9142026);
    this.tiles.fill(TILE.FLOOR);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.variance[this.index(x, y)] = rand();
      }
    }

    this.addBorder();
    this.addRect(20, 16, 8, 34);
    this.addRect(32, 28, 28, 5);
    this.addRect(46, 34, 6, 24);
    this.addRect(16, 70, 42, 5);
    this.addRect(70, 14, 5, 48);
    this.addRect(82, 30, 24, 5);
    this.addRect(98, 35, 5, 30);
    this.addRect(68, 78, 38, 5);
    this.addRect(58, 92, 6, 23);
    this.addRect(86, 98, 26, 5);

    this.carveGap(20, 25, 8, 3);
    this.carveGap(38, 28, 5, 5);
    this.carveGap(46, 45, 6, 4);
    this.carveGap(30, 70, 5, 5);
    this.carveGap(70, 36, 5, 5);
    this.carveGap(93, 30, 4, 5);
    this.carveGap(98, 52, 5, 5);
    this.carveGap(80, 78, 6, 5);
    this.carveGap(58, 104, 6, 4);
    this.carveGap(96, 98, 5, 5);


    this.addMazeCluster(42, 48, 30, 24);
    this.addMazeCluster(76, 62, 34, 26);
    this.addDecorPatches(rand);
    this.clearSpawnArea(10, 10, 10);
    this.clearSpawnArea(116, 116, 10);

    this.addAuthoredDestructibleGates();
    this.addAuthoredResourceNodes();
  }


  addAuthoredDestructibleGates() {
    // These are not random debris. They are membrane gates placed inside
    // deliberate wall lines so the player must bring grunts to open routes.
    // Each gate tile has its own HP; one broken tile is enough to make a
    // narrow scouting breach, while wider gates can be cleared by multiple grunts.

    // East spawn gate: blocks the first direct route out of the safe hive pocket.
    this.addRect(22, 5, 1, 22);
    this.carveGap(22, 14, 1, 3);
    this.addDestructibleRect(22, 14, 1, 3);

    // South spawn gate: blocks a second lane and gives an immediate combat test.
    this.addRect(6, 28, 22, 1);
    this.carveGap(14, 28, 3, 1);
    this.addDestructibleRect(14, 28, 3, 1);

    // Mid corridor gates using existing carved route logic.
    this.addDestructibleRect(38, 30, 3, 1);
    this.addDestructibleRect(47, 45, 3, 1);
    this.addDestructibleRect(71, 37, 3, 2);
    this.addDestructibleRect(99, 53, 3, 2);
  }

  addBorder() {
    for (let x = 0; x < this.width; x++) {
      this.set(x, 0, TILE.WALL);
      this.set(x, this.height - 1, TILE.WALL);
    }
    for (let y = 0; y < this.height; y++) {
      this.set(0, y, TILE.WALL);
      this.set(this.width - 1, y, TILE.WALL);
    }
  }

  addRect(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, TILE.WALL);
    }
  }

  carveGap(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, TILE.FLOOR);
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

  addDecorPatches(rand) {
    for (let i = 0; i < 420; i++) {
      const x = 2 + Math.floor(rand() * (this.width - 4));
      const y = 2 + Math.floor(rand() * (this.height - 4));
      if (this.get(x, y) === TILE.FLOOR && rand() < 0.55) this.set(x, y, TILE.DECOR);
    }
  }

  clearSpawnArea(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) this.set(x, y, TILE.FLOOR);
      }
    }
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
