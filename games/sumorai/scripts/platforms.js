// Platform layout definitions and runtime helpers.
// Each platform: { cx, y, hw, vx, minX, maxX }
//   cx  — center x (mutable; moving platforms update this each tick)
//   y   — standing surface y (physics collision)
//   hw  — half-width
//   vx  — velocity x per tick (0 = static; non-zero = moving)
//   minX/maxX — bounce bounds for cx (only used when vx != 0)

const LAYOUT_DEFS = {
  none: [],

  single: [
    { cx: 320, y: 235, hw: 68, vx: 0 },
  ],

  // Classic three-platform layout: two side steps + one top center.
  // Side platforms reachable from floor; top reachable only from a side platform.
  battlefield: [
    { cx: 165, y: 270, hw: 55, vx: 0 },
    { cx: 475, y: 270, hw: 55, vx: 0 },
    { cx: 320, y: 200, hw: 60, vx: 0 },
  ],

  moving: [
    { cx: 320, y: 235, hw: 60, vx: 1.2, minX: 140, maxX: 500 },
  ],
};

function createPlatforms(layoutKey) {
  const defs = LAYOUT_DEFS[layoutKey] ?? LAYOUT_DEFS.single;
  return defs.map(def => ({ ...def }));  // mutable clone per round
}

function updatePlatforms(platforms) {
  for (const plat of platforms) {
    if (!plat.vx) continue;
    plat.cx += plat.vx;
    if      (plat.cx >= plat.maxX) { plat.cx = plat.maxX; plat.vx = -Math.abs(plat.vx); }
    else if (plat.cx <= plat.minX) { plat.cx = plat.minX; plat.vx =  Math.abs(plat.vx); }
  }
}

export { LAYOUT_DEFS, createPlatforms, updatePlatforms };
