export const DEPLOYMENT_ZONE_SIZE = 4;

export const DEFAULT_DEPLOYMENT_POSITIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
]);

export const DEPLOYMENT_TILES = Object.freeze(
  Array.from({ length: DEPLOYMENT_ZONE_SIZE * DEPLOYMENT_ZONE_SIZE }, (_, index) => Object.freeze({
    x: index % DEPLOYMENT_ZONE_SIZE,
    y: Math.floor(index / DEPLOYMENT_ZONE_SIZE),
  }))
);

const CORNERS = Object.freeze([
  Object.freeze({ sx: 0, sy: 1 }),
  Object.freeze({ sx: 1, sy: 0 }),
  Object.freeze({ sx: 0, sy: 0 }),
  Object.freeze({ sx: 1, sy: 1 }),
]);

function key(position) {
  return `${position.x},${position.y}`;
}

function normalizedTile(position) {
  const x = Math.floor(Number(position?.x));
  const y = Math.floor(Number(position?.y));
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || y < 0 || x >= DEPLOYMENT_ZONE_SIZE || y >= DEPLOYMENT_ZONE_SIZE) return null;
  return { x, y };
}

export function normalizeDeploymentPositions(positions, length = DEFAULT_DEPLOYMENT_POSITIONS.length) {
  const count = Math.max(0, Math.min(DEPLOYMENT_TILES.length, Math.floor(Number(length)) || DEFAULT_DEPLOYMENT_POSITIONS.length));
  const input = Array.isArray(positions) ? positions : [];
  const out = [];
  const used = new Set();

  for (let i = 0; i < count; i += 1) {
    const candidate = normalizedTile(input[i]);
    const fallback = normalizedTile(DEFAULT_DEPLOYMENT_POSITIONS[i % DEFAULT_DEPLOYMENT_POSITIONS.length]);
    const chosen = chooseUnused(candidate, fallback, used);
    used.add(key(chosen));
    out.push(Object.freeze(chosen));
  }
  return out;
}

function chooseUnused(candidate, fallback, used) {
  if (candidate && !used.has(key(candidate))) return candidate;
  if (fallback && !used.has(key(fallback))) return fallback;
  return DEPLOYMENT_TILES.find((tile) => !used.has(key(tile))) ?? { x: 0, y: 0 };
}

export function deploymentTileRank(position) {
  const tile = normalizedTile(position) ?? DEFAULT_DEPLOYMENT_POSITIONS[0];
  const advance = tile.x + tile.y;
  if (advance <= 1) return "back";
  if (advance <= 3) return "middle";
  return "front";
}

export function deploymentTileLabel(position) {
  const rank = deploymentTileRank(position);
  return rank === "front" ? "Front" : rank === "middle" ? "Middle" : "Back";
}

export function deploymentSlotDescriptor(index, position) {
  const tile = normalizedTile(position) ?? DEFAULT_DEPLOYMENT_POSITIONS[index % DEFAULT_DEPLOYMENT_POSITIONS.length];
  const rank = deploymentTileRank(tile);
  return Object.freeze({
    index,
    x: tile.x,
    y: tile.y,
    row: rank === "front" ? "front" : rank === "back" ? "back" : "middle",
    rank,
    label: deploymentTileLabel(tile),
  });
}

export function deploymentPositionToBoard(size, cornerIndex, position) {
  const max = Math.max(0, Math.floor(Number(size)) - 1);
  const corner = CORNERS[cornerIndex] ?? CORNERS[0];
  const tile = normalizedTile(position) ?? DEFAULT_DEPLOYMENT_POSITIONS[0];
  const cx = corner.sx === 0 ? 0 : max;
  const cy = corner.sy === 0 ? 0 : max;
  const inwardX = corner.sx === 0 ? 1 : -1;
  const inwardY = corner.sy === 0 ? 1 : -1;
  return {
    x: cx + inwardX * tile.x,
    y: cy + inwardY * tile.y,
  };
}

export function deploymentSlots(size, cornerIndex, positions = DEFAULT_DEPLOYMENT_POSITIONS) {
  return normalizeDeploymentPositions(positions).map((position) => deploymentPositionToBoard(size, cornerIndex, position));
}
