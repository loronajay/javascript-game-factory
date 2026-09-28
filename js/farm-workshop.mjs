// The workshop's rules: which patterns a farmer can make right now, what is on
// the furniture shelf, what a mill saws, and where the Workbench and the
// Sawmill are in reach. PURE — no THREE, no DOM, no storage.
//
// Carpentry is account progression end to end. Planks come only from a
// Sawmill and pieces only from the Workbench, and both are made by the server
// (`POST /games/farm/workshop/mills` and `/crafts`,
// platform-api/src/db/farm-workshop.mts); a signed-out farm can walk up to a
// bench and read the pattern book, and is told to sign in to use it. There is
// no local fallback here, unlike the kitchen's: a signed-out farm cannot get
// timber (saplings are a ticket purchase) so it would never have a plank to use.
//
// THE SHELF IS DERIVED. `inventory.furniture` counts every piece the farm owns,
// placed or not; a placed row carries its stars; the shelf is the difference.
// Nothing moves between two counts when a piece is set down or picked up, so
// the two can never disagree.
import { PATTERN_CATALOG, PIECE_STARS, PLANKS_PER_LOG, PLANK_SPECIES, findPattern, pieceKey } from "./farm-catalog/carpentry.mjs";
export function patternAvailability(pattern, planks, level) {
    const lines = Object.entries(pattern.planks).map(([id, need]) => {
        const held = Math.max(0, Math.floor(Number(planks[id]) || 0));
        const title = PLANK_SPECIES.find((species) => species.id === id)?.title ?? id;
        return Object.freeze({ id, title, need, held, short: Math.max(0, need - held) });
    });
    const state = level < pattern.minLevel ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
    return Object.freeze({ pattern, state, lines: Object.freeze(lines) });
}
/** The pattern book in catalog order (which is level order). */
export function patternBook(planks, level) {
    return Object.freeze(PATTERN_CATALOG.map((pattern) => patternAvailability(pattern, planks, level)));
}
// ---------------------------------------------------------------- the shelf
/** How many of each "item@stars" stand on the field. */
export function placedPieces(decor) {
    const placed = {};
    for (const row of decor) {
        if (!row.stars || !findPattern(row.itemId))
            continue;
        const key = pieceKey(row.itemId, row.stars);
        placed[key] = (placed[key] ?? 0) + 1;
    }
    return placed;
}
/** What is on the shelf: owned minus placed, never below zero. Every key there can be. */
export function furnitureShelf(furniture, decor) {
    const placed = placedPieces(decor);
    const shelf = {};
    for (const pattern of PATTERN_CATALOG) {
        for (const stars of PIECE_STARS) {
            const key = pieceKey(pattern.id, stars);
            shelf[key] = Math.max(0, Math.floor(Number(furniture[key]) || 0) - (placed[key] ?? 0));
        }
    }
    return shelf;
}
/** One entry per pattern: what the farm has of it on the shelf and on the field. */
export function shelfEntries(furniture, decor) {
    const shelf = furnitureShelf(furniture, decor);
    const placed = placedPieces(decor);
    return Object.freeze(PATTERN_CATALOG.map((pattern) => {
        const byStars = Object.freeze(Object.fromEntries(PIECE_STARS.map((stars) => [stars, shelf[pieceKey(pattern.id, stars)] ?? 0])));
        const onShelf = PIECE_STARS.reduce((sum, stars) => sum + byStars[stars], 0);
        const best = [...PIECE_STARS].reverse().find((stars) => byStars[stars] > 0) ?? null;
        const standing = PIECE_STARS.reduce((sum, stars) => sum + (placed[pieceKey(pattern.id, stars)] ?? 0), 0);
        return Object.freeze({ pattern, byStars, onShelf, placed: standing, best });
    }));
}
/** The stars of the best piece of `itemId` on the shelf, or null. A placement always takes the finest one to hand. */
export function bestOnShelf(furniture, decor, itemId) {
    const shelf = furnitureShelf(furniture, decor);
    return [...PIECE_STARS].reverse().find((stars) => (shelf[pieceKey(itemId, stars)] ?? 0) > 0) ?? null;
}
/** A copy of a placed piece takes one more of the same stars off the shelf; true when there is one. */
export function shelfHas(furniture, decor, itemId, stars) {
    return (furnitureShelf(furniture, decor)[pieceKey(itemId, stars)] ?? 0) > 0;
}
/** What each timber species could be sawn into right now: the logs held and the planks they would make. */
export function millLines(inventory) {
    return Object.freeze(PLANK_SPECIES.map((species) => {
        const logs = Math.max(0, Math.floor(Number(inventory.logs[species.id]) || 0));
        return Object.freeze({ id: species.id, title: species.title.replace(/ Planks$/, ""), logs, planks: Math.max(0, Math.floor(Number(inventory.planks[species.id]) || 0)) });
    }));
}
/** How many planks `logs` logs saw into. */
export function plankYield(logs) {
    return Math.max(0, Math.floor(logs)) * PLANKS_PER_LOG;
}
// ---------------------------------------------------------------- stations in reach
/**
 * The Workbench and the Sawmill are worked from their front (+z) face, like
 * the Kitchen Range: this is how far from it, and how squarely faced, E works one.
 */
export const STATION_REACH = Object.freeze({ radius: 1.8, facing: 0.35 });
/** The front of a station in the world (`halfDepth` in from its centre) and the way it faces. */
export function stationFront(row, halfDepth) {
    const normal = { x: Math.sin(row.rotationY), z: Math.cos(row.rotationY) };
    return Object.freeze({ x: row.x + normal.x * halfDepth, z: row.z + normal.z * halfDepth, normal: Object.freeze(normal) });
}
/** The station of `itemId` the player stands at the front of and looks at, or null. */
export function findStationInReach(decor, pose, itemId, halfDepth) {
    if (Math.abs(pose.y) > 0.3)
        return null;
    let best = null;
    let bestDistance = Infinity;
    for (const row of decor) {
        if (row.itemId !== itemId)
            continue;
        const front = stationFront(row, halfDepth);
        const distance = Math.hypot(pose.x - front.x, pose.z - front.z);
        if (distance > STATION_REACH.radius)
            continue;
        // In front of it, never round the back.
        if ((pose.x - front.x) * front.normal.x + (pose.z - front.z) * front.normal.z < -0.05)
            continue;
        const toward = { x: row.x - pose.x, z: row.z - pose.z };
        const length = Math.hypot(toward.x, toward.z) || 1;
        const forward = Math.hypot(pose.forward.x, pose.forward.z) || 1;
        if ((pose.forward.x * toward.x + pose.forward.z * toward.z) / (length * forward) < STATION_REACH.facing)
            continue;
        if (distance < bestDistance) {
            best = row;
            bestDistance = distance;
        }
    }
    return best;
}
