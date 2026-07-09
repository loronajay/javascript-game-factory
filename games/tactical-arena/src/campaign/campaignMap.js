// Overworld-grid layout for the campaign map. Missions declare a discrete grid
// cell {col,row} plus a list of visual trail `connections` (mission ids); this
// pure module turns that graph into render geometry — node positions as percents
// of the map canvas + curved trail path `d` strings in the same 0..100 space.
// No DOM, so it is unit-tested directly (the themes.js / boardSprites.js pattern).
//
// The map is a survey of the whole campaign: every node is laid out from its cell
// whether or not it is unlocked, and the renderer decides how to draw locked vs
// revealed nodes. Adding a mission is now purely declarative — give it a free cell
// and the trails/positions fall out of the graph instead of hand-placed percents.

export const CAMPAIGN_GRID = Object.freeze({ cols: 7, rows: 5 });

// Inset (in canvas %) so a node's card never sits flush against the canvas edge.
const PAD = Object.freeze({ x: 8, y: 13 });

// How far (in canvas %) a trail bows off the straight line between two nodes, so
// paths read as winding roads rather than rigid wires.
const TRAIL_BEND = 6.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

// Places a grid cell at the center of its column/row band within the padded canvas.
export function cellToPercent(cell, grid = CAMPAIGN_GRID) {
  const spanCols = Math.max(1, (grid?.cols ?? 1) - 1);
  const spanRows = Math.max(1, (grid?.rows ?? 1) - 1);
  const col = clamp(Number(cell?.col) || 0, 0, spanCols);
  const row = clamp(Number(cell?.row) || 0, 0, spanRows);
  return {
    x: round(PAD.x + (col / spanCols) * (100 - 2 * PAD.x)),
    y: round(PAD.y + (row / spanRows) * (100 - 2 * PAD.y)),
  };
}

function authoredPointToPercent(point) {
  if (!point) return null;
  return {
    x: round(clamp(Number(point.x) || 0, 0, 100)),
    y: round(clamp(Number(point.y) || 0, 0, 100)),
  };
}

function edgeKey(a, b) {
  return [a, b].sort().join("::");
}

// Deterministic bend sign from the edge key, so a given pair of nodes always
// curves the same way (stable across renders) but neighbours alternate for variety.
function bendSign(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) & 0xffff;
  return hash % 2 === 0 ? 1 : -1;
}

// Quadratic-bezier trail from A to B, bowed perpendicular to the AB line.
export function buildTrailPath(a, b, key = "") {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = TRAIL_BEND * bendSign(key);
  // Unit perpendicular to AB.
  const px = -dy / len;
  const py = dx / len;
  const cx = round((a.x + b.x) / 2 + px * bend);
  const cy = round((a.y + b.y) / 2 + py * bend);
  return `M ${round(a.x)} ${round(a.y)} Q ${cx} ${cy} ${round(b.x)} ${round(b.y)}`;
}

// Bleed (in canvas %) so a region's terrain blob wraps generously around the nodes
// assigned to it rather than stopping at their centers.
const REGION_BLEED = Object.freeze({ x: 9, y: 13 });

// Derives one terrain box per region from the bounding box of the mission cells
// assigned to that region. Fully data-driven: assign a mission to a region and the
// blob grows to contain it — no hand-placed terrain coordinates. `regionDefs` is the
// ordered biome/label metadata; the returned boxes preserve that order (paint order).
export function computeRegionBoxes(missions = [], regionDefs = [], grid = CAMPAIGN_GRID) {
  const cellsByRegion = new Map();
  for (const mission of missions) {
    if (!mission.region) continue;
    if (!cellsByRegion.has(mission.region)) cellsByRegion.set(mission.region, []);
    cellsByRegion.get(mission.region).push(mission.cell);
  }
  const boxes = [];
  for (const def of regionDefs) {
    const cells = cellsByRegion.get(def.id);
    if (!cells?.length) continue;
    const cols = cells.map((cell) => cell.col);
    const rows = cells.map((cell) => cell.row);
    const min = cellToPercent({ col: Math.min(...cols), row: Math.min(...rows) }, grid);
    const max = cellToPercent({ col: Math.max(...cols), row: Math.max(...rows) }, grid);
    const x = clamp(min.x - REGION_BLEED.x, 0, 100);
    const y = clamp(min.y - REGION_BLEED.y, 0, 100);
    const right = clamp(max.x + REGION_BLEED.x, 0, 100);
    const bottom = clamp(max.y + REGION_BLEED.y, 0, 100);
    boxes.push({
      ...def,
      x: round(x),
      y: round(y),
      w: round(right - x),
      h: round(bottom - y),
      // Label anchors at the blob center so the place name reads like an atlas
      // caption sprawled across its terrain, with nodes sitting on top.
      labelX: round((x + right) / 2),
      labelY: round((y + bottom) / 2),
    });
  }
  return boxes;
}

// Builds every node position + a deduped edge list from the mission graph. Edges
// are undirected: a connection authored on either endpoint yields one trail.
export function computeCampaignGeometry(missions = [], grid = CAMPAIGN_GRID) {
  const positions = {};
  for (const mission of missions) {
    positions[mission.id] = authoredPointToPercent(mission.point) ?? cellToPercent(mission.cell, grid);
  }
  const seen = new Set();
  const edges = [];
  for (const mission of missions) {
    for (const otherId of mission.connections ?? []) {
      if (!positions[otherId] || otherId === mission.id) continue;
      const key = edgeKey(mission.id, otherId);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: mission.id,
        to: otherId,
        key,
        d: buildTrailPath(positions[mission.id], positions[otherId], key),
      });
    }
  }
  return { grid, positions, edges };
}
