import { isWall } from './map.js';

// Simulation uses tile units (px/py). Only this boundary converts to scene metres.
export const WORLD_3D = Object.freeze({ tileSize: 2.25, wallHeight: 3.15, eyeHeight: 1.58, playerRadius: 0.15 });
export const DEFAULT_THEME = Object.freeze({ wall: 0x43575f, floor: 0x253840, ceiling: 0x25343b, accent: 0x76f4ff });

export function gridToWorld(map, px, py) {
  return { x: (px - map.width / 2) * WORLD_3D.tileSize, z: (py - map.height / 2) * WORLD_3D.tileSize };
}
export function worldToGrid(map, x, z) {
  return { x: Math.floor(x / WORLD_3D.tileSize + map.width / 2), y: Math.floor(z / WORLD_3D.tileSize + map.height / 2) };
}
export function getSpawnYaw(map, start) {
  for (const [dx, dy, yaw] of [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]]) {
    if (!isWall(map, start.x + dx, start.y + dy)) return yaw;
  }
  return 0;
}
function hash(x, y) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// A pure, deterministic build plan. No Three.js objects or duplicated gameplay state.
export function buildMapLayout(map, options = {}) {
  const theme = { ...DEFAULT_THEME };
  for (const key of Object.keys(theme)) {
    const value = options?.theme?.[key];
    if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) theme[key] = value;
  }
  const walls = [], floors = [], strips = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const cell = { x, y, ...gridToWorld(map, x + 0.5, y + 0.5) };
    // Grid columns are carried separately because scene x is in metres.
    cell.tx = x; cell.ty = y;
    if (isWall(map, x, y)) walls.push(cell);
    else { floors.push(cell); if (hash(x, y) % 7 === 0) strips.push(cell); }
  }
  const doors = map.doors.map(door => ({ id: door.id, ...gridToWorld(map, door.x + 0.5, door.y + 0.5),
    alongX: isWall(map, door.x - 1, door.y) && isWall(map, door.x + 1, door.y) }));
  const goals = map.goals.map(goal => gridToWorld(map, goal.x + 0.5, goal.y + 0.5));
  return { theme, walls, floors, strips, doors, goals };
}
