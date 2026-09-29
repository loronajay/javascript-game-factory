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
//   · the Chicken Coop's floor holds six chickens and nothing else (`#coop`)
//
// A home may take only some species (`species`): the coop is for chickens.
// Chickens may still live in a pen, a stall or on the barn floor.
//
// The server counts the same homes from the same rows
// (`platform-api/src/services/farm-livestock-catalog.mts` `farmLivestockHomes`)
// to refuse an animal a farm has no room for, and a test holds the two equal.
// Room is the buildings' to give, never a species cap: a bigger farm later is
// more buildings, not a rule change.
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { barnFloor, coopFloor, stableStalls } from "./farm-fixtures.mjs";
import { buildingLocalToWorld } from "./farm-shell.mjs";
/** How many a pen holds, by catalog id. */
export const PEN_SLOTS = Object.freeze({
    "decor.building.pen-small": 2,
    "decor.building.pen-large": 4,
});
export const BARN_SLOTS = 2;
export const COOP_SLOTS = 6;
/** The coop is for chickens only. */
export const COOP_SPECIES = Object.freeze(["livestock.chicken"]);
/** A pen's animals keep this far in from its rails. */
const PEN_INSET = 0.12;
function home(row, suffix, kind, title, slots, roam, box, species = null) {
    const centre = buildingLocalToWorld(row, box);
    return Object.freeze({
        id: `${row.instanceId}#${suffix}`,
        instanceId: row.instanceId,
        kind,
        title,
        slots,
        roam,
        species,
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
    let coops = 0;
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
        else if (definition.id === "decor.building.coop") {
            coops += 1;
            homes.push(home(row, "coop", "coop", `Chicken Coop${coops > 1 ? ` ${coops}` : ""}`, COOP_SLOTS, true, coopFloor(definition), COOP_SPECIES));
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
/** Whether a home takes this species (every home takes any species unless it names some). */
export function homeTakes(entry, speciesId) {
    return !entry.species || entry.species.includes(speciesId);
}
/** The homes with room for one more, in order — for one of `speciesId`, when given. */
export function homesWithRoom(homes, herd, speciesId) {
    const counts = homeOccupancy(homes, herd);
    return homes.filter((entry) => (counts.get(entry.id) ?? 0) < entry.slots && (speciesId === undefined || homeTakes(entry, speciesId)));
}
/**
 * The homes the HERD can use (FARM_RIDING_PLAN.md): every home, less the
 * Stable stalls the farm's horses live in. A horse is a pet in the farm
 * document, not a herd row, but its stall's one place is gone, so the herd,
 * the Dealer and the Herd panel never see that stall at all. The server's
 * `farmHerdHomes` takes the same stalls away.
 */
export function herdHomes(decor, pets) {
    const taken = new Set(pets.map((pet) => pet.stall).filter((stall) => typeof stall === "string" && stall.length > 0));
    return taken.size ? Object.freeze(livestockHomes(decor).filter((entry) => !taken.has(entry.id))) : livestockHomes(decor);
}
/** The Stable stalls free for a horse: no livestock in them and no horse. */
export function freeHorseStalls(decor, pets, herd) {
    const counts = homeOccupancy(herdHomes(decor, pets), herd);
    return herdHomes(decor, pets).filter((entry) => entry.kind === "stall" && (counts.get(entry.id) ?? 0) < entry.slots);
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
