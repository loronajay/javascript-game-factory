(function attachMapPreview(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelMapPreview = api;
})(typeof window !== 'undefined' ? window : globalThis, function createMapPreviewApi() {
  'use strict';

  // A map's floorplan, as a drawable.
  //
  // The picker has to show what a building looks like before you commit to entering it, and the
  // honest source for that is the building itself. Anything else — a screenshot, a hand-drawn
  // diagram — is a second description of the same walls that goes stale the moment the plan moves,
  // and it is one more thing a new map has to ship before it can be offered.
  //
  // So a preview is *derived*: the plan's own colliders projected straight down, the rooms it names
  // placed as dots, and the whole thing normalised into a unit box. A map that changes its walls
  // changes its preview in the same commit, and a map that adds a level gets a third panel for free.
  //
  // There is no SVG in here and no document — it returns numbers, and the menu turns them into
  // elements. That keeps it testable in `node --test` alongside every other pure rule.

  // Walls only. A slab covers the whole footprint and a ceiling covers it again, so drawing every
  // box would render a solid rectangle; the walls are what makes a plan legible from above.
  const WALL_KINDS = new Set(['wall', 'trim']);

  // Rounded to keep the emitted numbers short — this ends up in an attribute string.
  const round2 = (value) => Math.round(value * 100) / 100;

  function footprintOf(plan) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const entry of plan.boxes) {
      if (!WALL_KINDS.has(entry.kind)) continue;
      const halfW = Math.abs(entry.w) / 2;
      const halfD = Math.abs(entry.d) / 2;
      minX = Math.min(minX, entry.x - halfW);
      maxX = Math.max(maxX, entry.x + halfW);
      minZ = Math.min(minZ, entry.z - halfD);
      maxZ = Math.max(maxZ, entry.z + halfD);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minZ, maxZ };
  }

  // Which levels a plan actually has something on. Floor 0 is "between floors" — a stairwell, a
  // moving cabin — and is never a level a player picks, so it is not a panel.
  function floorsOf(plan) {
    const floors = new Set();
    for (const entry of plan.boxes) if (entry.floor >= 1) floors.add(entry.floor);
    return [...floors].sort((a, b) => a - b);
  }

  // One level, as a list of rectangles in a 0..width / 0..height box.
  //
  // The projection flips Z so that -Z (the direction every building in this game faces its entrance)
  // is at the bottom of the drawing, which is how a floorplan is normally read.
  function createFloorPreview(plan, floor, options = {}) {
    let { width = 100, height = 100 } = options;
    const padding = options.padding === undefined ? 2 : options.padding;
    const footprint = footprintOf(plan);
    if (!footprint) return { width, height, walls: [], rooms: [], stairs: [] };

    const spanX = footprint.maxX - footprint.minX || 1;
    const spanZ = footprint.maxZ - footprint.minZ || 1;
    // One scale for both axes, so a long thin building reads as long and thin rather than as a square.
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
    // The panel is then trimmed to what was actually drawn. A fixed square box would letterbox a wide
    // building — Cinder Mall is 96m by 72m — and the empty margin is what makes a small preview
    // unreadable, because the plan inside it has to shrink to fit a box that is mostly nothing.
    const panelWidth = round2(spanX * scale + padding * 2);
    const panelHeight = round2(spanZ * scale + padding * 2);
    const offsetX = padding;
    const offsetY = padding;
    width = panelWidth;
    height = panelHeight;

    const toX = (x) => round2(offsetX + (x - footprint.minX) * scale);
    const toY = (z) => round2(offsetY + (footprint.maxZ - z) * scale);

    const walls = [];
    for (const entry of plan.boxes) {
      if (entry.floor !== floor || !WALL_KINDS.has(entry.kind)) continue;
      const halfW = Math.abs(entry.w) / 2;
      const halfD = Math.abs(entry.d) / 2;
      const x = toX(entry.x - halfW);
      const y = toY(entry.z + halfD);
      walls.push({
        x, y,
        // A 0.22m wall is a fraction of a pixel at this scale, so give every wall a floor width or
        // the plan disappears into a grey haze.
        w: Math.max(0.6, round2(halfW * 2 * scale)),
        h: Math.max(0.6, round2(halfD * 2 * scale)),
      });
    }

    const rooms = (plan.roomCenters || [])
      .filter((room) => room.floor === floor)
      .map((room) => ({ id: room.roomNumber, x: toX(room.x), y: toY(room.z) }));

    // The ways up, so a reader can see how the levels connect. A ramp is a run; a rect on floor 0 is
    // a landing. Both belong to no level, so they are drawn on every one.
    const stairs = [];
    for (const surface of plan.surfaces || []) {
      if (surface.floor !== 0) continue;
      if (surface.kind !== 'ramp' && surface.kind !== 'rect') continue;
      stairs.push({
        x: toX(surface.minX), y: toY(surface.maxZ),
        w: Math.max(1, round2((surface.maxX - surface.minX) * scale)),
        h: Math.max(1, round2((surface.maxZ - surface.minZ) * scale)),
      });
    }

    return { width, height, walls, rooms, stairs };
  }

  // Every level of a building, ready to be drawn side by side.
  function createMapPreview(plan, options = {}) {
    return floorsOf(plan).map((floor) => ({ floor, ...createFloorPreview(plan, floor, options) }));
  }

  return { createFloorPreview, createMapPreview, floorsOf, footprintOf };
});
