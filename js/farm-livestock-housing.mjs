// Where livestock live: the homes a farm's buildings make, as DATA.
//
// Pure — no THREE, no DOM. A home is a box on the field an animal is kept
// inside (its region), how many animals it takes (its slots), and whether an
// animal there strolls about (`roam`) or stands in its place. The homes come
// from the decor rows alone, so they move with their building, and they vanish
// with it: an animal whose home is gone waits out on the field until it is
// given another.
//
//   · every Stable stall is a home for one (`<instanceId>#stall-N`) — it stands
//   · the Barn's floor in front of the loft is a home for two (`#floor`)
//   · a Small Pen holds two, a Large Pen four (`#pen`) — they roam
//
// The server counts the same homes from the same rows
// (`platform-api/src/services/farm-livestock-catalog.mts` `farmLivestockHomes`)
// to refuse an animal a farm has no room for, and a test holds the two equal.
// Room is the buildings' to give, never a species cap: a bigger farm later is
// more buildings, not a rule change.
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { barnFloor, stableStalls } from "./farm-fixtures.mjs";
import { buildingLocalToWorld } from "./farm-shell.mjs";
/** How many a pen holds, by catalog id. */
export const PEN_SLOTS = Object.freeze({
    "decor.building.pen-small": 2,
    "decor.building.pen-large": 4,
});
export const BARN_SLOTS = 2;
/** A pen's animals keep this far in from its rails. */
const PEN_INSET = 0.12;
function home(row, suffix, kind, title, slots, roam, box) {
    const centre = buildingLocalToWorld(row, box);
    return Object.freeze({
        id: `${row.instanceId}#${suffix}`,
        instanceId: row.instanceId,
        kind,
        title,
        slots,
        roam,
        x: centre.x,
        z: centre.z,
        rotationY: row.rotationY,
        width: box.width,
        depth: box.depth,
    });
}
/** Every home on the farm, in the order the decor rows stand in. */
export function livestockHomes(decor) {
    const homes = [];
    let stables = 0;
    let pens = 0;
    for (const row of decor) {
        const definition = findFarmDecor(row.itemId);
        if (!definition?.shell)
            continue;
        if (definition.id === "decor.building.stable") {
            stables += 1;
            for (const [index, stall] of stableStalls(definition).entries()) {
                homes.push(home(row, stall.name, "stall", `Stable${stables > 1 ? ` ${stables}` : ""} · stall ${index + 1}`, 1, false, stall));
            }
        }
        else if (definition.id === "decor.building.barn") {
            homes.push(home(row, "floor", "barn", "Barn floor", BARN_SLOTS, true, barnFloor(definition)));
        }
        else if (PEN_SLOTS[definition.id]) {
            pens += 1;
            const t = definition.shell.wallThickness;
            const box = { x: 0, z: 0, width: definition.footprint.width - (t + PEN_INSET) * 2, depth: definition.footprint.depth - (t + PEN_INSET) * 2 };
            homes.push(home(row, "pen", "pen", `${definition.title} ${pens}`, PEN_SLOTS[definition.id], true, box));
        }
    }
    return Object.freeze(homes);
}
export function totalLivestockSlots(homes) {
    return homes.reduce((sum, entry) => sum + entry.slots, 0);
}
/** How many animals live in each home now, by home id (animals naming a home that is gone count nowhere). */
export function homeOccupancy(homes, herd) {
    const counts = new Map(homes.map((entry) => [entry.id, 0]));
    for (const animal of herd) {
        if (animal.homeId && counts.has(animal.homeId))
            counts.set(animal.homeId, counts.get(animal.homeId) + 1);
    }
    return counts;
}
/** The homes with room for one more, in order. */
export function homesWithRoom(homes, herd) {
    const counts = homeOccupancy(homes, herd);
    return homes.filter((entry) => (counts.get(entry.id) ?? 0) < entry.slots);
}
/** A field point in the home's own frame. */
export function homeLocal(entry, point) {
    const dx = point.x - entry.x;
    const dz = point.z - entry.z;
    const cosine = Math.cos(entry.rotationY);
    const sine = Math.sin(entry.rotationY);
    return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
}
/** A point in the home's frame → the field. */
export function homeToWorld(entry, local) {
    return buildingLocalToWorld(entry, local);
}
/** True when a body of `margin` radius at the point is wholly inside the home (a margin wider than the home is capped, so a big animal still fits a small stall). */
export function insideHome(entry, point, margin = 0) {
    const local = homeLocal(entry, point);
    const insetX = Math.min(margin, entry.width / 2 - 0.05);
    const insetZ = Math.min(margin, entry.depth / 2 - 0.05);
    return Math.abs(local.x) <= entry.width / 2 - insetX && Math.abs(local.z) <= entry.depth / 2 - insetZ;
}
