import { MapData, TILE } from './map/map-data.js';
import { MapGenerator } from './map/map-generator.js';
import { seededRandom } from './utils.js';
import { CONFIG } from './config.js';

// Re-export TILE so renderer.js and other importers need no changes.
export { TILE };

// Named export for new code. Old `new GameMap()` callers in main.js are updated
// to use buildGameMap(levelDef) instead.
export { MapData as GameMap };

// Build a fully-populated MapData from a level definition object.
// The def is imported from src/maps/ and contains all layout, gate, and resource data.
export function buildGameMap(def) {
  const map = new MapData(
    def.width  ?? CONFIG.mapWidth,
    def.height ?? CONFIG.mapHeight,
    def.tileSize ?? CONFIG.tileSize,
  );
  const rand = seededRandom(def.seed ?? 0);
  new MapGenerator(map).applyDef(def, rand);
  return map;
}
