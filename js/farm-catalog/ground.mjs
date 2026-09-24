// The farm's ground catalog: every finish the field can wear, as DATA.
//
// This folder is a pure layer like `arcade-room-catalog/` — no THREE, no DOM,
// no canvas, no storage — so the whole catalog is validated under node in CI.
// A ground is a `SurfaceStyle` exactly as the room's floors are, drawn by the
// same procedural renderer (`arcade-room-surfaces.mts`), which is what lets
// the farm add `grass` and `dirt` as two more patterns rather than a second
// texture pipeline. The room could pick them up as floors tomorrow.
const STARTER = Object.freeze({ type: "starter", source: "The Farm" });
const PURCHASE = Object.freeze({ type: "purchase", source: "Farm Shop" });
function ground(id, title, swatch, style, unlock = PURCHASE) {
    return Object.freeze({ id: `ground.${id}`, title, swatch, style: Object.freeze({ ...style, colors: Object.freeze([...style.colors]) }), unlock });
}
// `repeat` is tiles per 20 m; a 28 m field at 7 gives a 2.85 m tile, big
// enough that blades and clods read as texture rather than noise underfoot.
export const GROUND_CATALOG = Object.freeze([
    ground("meadow", "Meadow", ["#5f9a3c", "#3f7228"], { pattern: "grass", colors: ["#5f9a3c", "#3f7228", "#8dc45a", "#7a5a34"], repeat: 7, roughness: 0.95, metalness: 0 }, STARTER),
    ground("clover", "Clover Field", ["#3f8a46", "#2b6331"], { pattern: "grass", colors: ["#3f8a46", "#2b6331", "#6fb56c", "#d9e6b2"], repeat: 7, roughness: 0.95, metalness: 0 }),
    ground("dry", "Dry Pasture", ["#a89a4e", "#7f7236"], { pattern: "grass", colors: ["#a89a4e", "#7f7236", "#c9bd6f", "#8a6a3f"], repeat: 7, roughness: 0.95, metalness: 0 }),
    ground("mud", "Mud Yard", ["#6b4b2c", "#4e351e"], { pattern: "dirt", colors: ["#6b4b2c", "#4e351e", "#86623c", "#5a7a34"], repeat: 6, roughness: 0.9, metalness: 0 }),
    ground("gravel", "Gravel Lot", ["#8e8b82", "#6c6961"], { pattern: "dirt", colors: ["#8e8b82", "#6c6961", "#b0ada4", "#7a8a60"], repeat: 8, roughness: 0.85, metalness: 0 }),
]);
export const DEFAULT_GROUND_ID = "ground.meadow";
export function findGround(id) {
    return typeof id === "string" ? GROUND_CATALOG.find((entry) => entry.id === id) : undefined;
}
export function allGroundIds() {
    return GROUND_CATALOG.map((entry) => entry.id);
}
/** The id to actually render: itself when known, else the starter meadow. */
export function normalizeGroundId(id) {
    return findGround(id)?.id ?? DEFAULT_GROUND_ID;
}
