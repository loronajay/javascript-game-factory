// The Cove, as data. PURE — no THREE, no DOM, no storage.
//
// The Cove is the third shared place down the farm road: out of the Market
// Square's north gate and down to the water. It is two waters split by a
// spit of land — the freshwater LAGOON to the west, the SEA to the east — with
// a strip of shore along the south where the gate, the shops and the campfire
// are. The sea's near water is the REEF shelf; past the long pier's head it
// drops off into the DEEP.
//
// This file is the one description of that shape, read by everyone who needs
// it so none of them can drift:
// - the page's terrain mesh samples `coveGroundAt` (a bank down to each
//   water's bed) and lays one water plane at `COVE_WATER_LEVEL`;
// - the walker is handed `coveObstacles` (the water, less the docks) and
//   `covePlatforms` (the docks' decks), so the body walks the shore and the
//   docks and never the water;
// - a cast lands where `coveZoneAt` says it does, and the server holds a cast
//   to the same answer (platform-api/src/services/farm-fish-catalog.mts carries
//   the same shapes; tests/farm-fishing.test.mjs holds them equal);
// - the shadows (farm-fish.mts) swim inside `SHADOW_WATERS`.
//
// x runs east, z runs SOUTH (three's convention); the gate is on the south
// edge and the player walks in looking north over the water.
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { normalizeFarmLayout } from "./farm-layout.mjs";
export const COVE_PRESENCE_ROOM = "farm:cove";
export const COVE_BOUNDS = Object.freeze({ width: 40, depth: 40, wallInset: 0.3 });
/** The water's surface: a hand below the shore, so the bank reads. */
export const COVE_WATER_LEVEL = -0.3;
/** Where the shore meets the water, north of which (smaller z) the land is water on both sides of the spit. */
export const SHORE_Z = 6;
/** The spit's half-width: the land between the lagoon and the sea. */
export const SPIT_HALF = 2;
/** The reef shelf ends and the Deep begins north of this line (sea side only). */
export const DEEP_Z = -8;
const rect = (minX, maxX, minZ, maxZ) => Object.freeze({ minX, maxX, minZ, maxZ });
const HALF = COVE_BOUNDS.width / 2;
/** The waters inside the walkable bounds: what the walker keeps out of. */
export const LAGOON_RECT = rect(-HALF, -SPIT_HALF, -HALF, SHORE_Z);
export const SEA_RECT = rect(SPIT_HALF, HALF, -HALF, SHORE_Z);
/**
 * The waters as far as the eye goes. The lagoon is closed — land rings it
 * past the bounds — and the sea runs out to the horizon north and east.
 */
const FAR = 400;
export const LAGOON_FAR = rect(-46, -SPIT_HALF, -44, SHORE_Z);
export const SEA_FAR = rect(SPIT_HALF, FAR, -FAR, SHORE_Z);
/** Where the spit ends (the lighthouse stands on its tip) and the sea wraps round it, a sandbar away from the lagoon. */
export const SPIT_END_Z = -26;
export const NORTH_SEA_FAR = rect(-SPIT_HALF, FAR, -FAR, SPIT_END_Z);
export const LIGHTHOUSE = Object.freeze({ x: 0, z: SPIT_END_Z + 3 });
/** How round the waters' corners are, in metres. */
const CORNER = 3;
const dock = (id, kind, deck) => Object.freeze({ id, kind, deck });
/**
 * The lagoon's little jetty, the long pier out over the reef, and the pier's
 * wide head: the only place a cast reaches the Deep. Each deck starts a little
 * way up the shore so there is no seam to step over.
 */
export const COVE_DOCKS = Object.freeze([
    dock("lagoon-jetty", "pier", rect(-11.2, -8.8, -2, SHORE_Z + 0.8)),
    dock("sea-pier", "pier", rect(9.8, 12.2, -7, SHORE_Z + 0.8)),
    dock("sea-pier-head", "head", rect(7.6, 14.4, -11, -7)),
]);
export function insideRect(point, box, margin = 0) {
    return point.x >= box.minX - margin && point.x <= box.maxX + margin && point.z >= box.minZ - margin && point.z <= box.maxZ + margin;
}
export function onDock(point, margin = 0) {
    return COVE_DOCKS.find((entry) => insideRect(point, entry.deck, margin)) ?? null;
}
/** The part of `box` not covered by `hole`, as up to four boxes. */
export function subtractRect(box, hole) {
    const overlaps = hole.minX < box.maxX && hole.maxX > box.minX && hole.minZ < box.maxZ && hole.maxZ > box.minZ;
    if (!overlaps)
        return [box];
    const out = [];
    const minX = Math.max(box.minX, hole.minX);
    const maxX = Math.min(box.maxX, hole.maxX);
    if (hole.minZ > box.minZ)
        out.push(rect(box.minX, box.maxX, box.minZ, hole.minZ));
    if (hole.maxZ < box.maxZ)
        out.push(rect(box.minX, box.maxX, hole.maxZ, box.maxZ));
    const top = Math.max(box.minZ, hole.minZ);
    const bottom = Math.min(box.maxZ, hole.maxZ);
    if (minX > box.minX)
        out.push(rect(box.minX, minX, top, bottom));
    if (maxX < box.maxX)
        out.push(rect(maxX, box.maxX, top, bottom));
    return out.filter((entry) => entry.maxX - entry.minX > 1e-6 && entry.maxZ - entry.minZ > 1e-6);
}
/** The water the body cannot walk into: both waters, with every dock's deck cut out of them. */
export function coveWaterBlocks() {
    let blocks = [LAGOON_RECT, SEA_RECT];
    for (const entry of COVE_DOCKS)
        blocks = blocks.flatMap((box) => subtractRect(box, entry.deck));
    return blocks;
}
/** The water as solids for the walker: full height, so nothing climbs onto it. */
export function coveObstacles() {
    return coveWaterBlocks().map((box, index) => Object.freeze({
        instanceId: `cove-water-${index}`,
        x: (box.minX + box.maxX) / 2,
        z: (box.minZ + box.maxZ) / 2,
        rotationY: 0,
        footprint: Object.freeze({ width: box.maxX - box.minX, depth: box.maxZ - box.minZ }),
        bottom: -Infinity,
        top: Infinity,
    }));
}
/** The docks' decks, so a body over the water stands on the planks and not on the bed below. */
export function covePlatforms() {
    return COVE_DOCKS.map((entry) => Object.freeze({
        id: entry.id,
        x: (entry.deck.minX + entry.deck.maxX) / 2,
        z: (entry.deck.minZ + entry.deck.maxZ) / 2,
        rotationY: 0,
        width: entry.deck.maxX - entry.deck.minX,
        depth: entry.deck.maxZ - entry.deck.minZ,
        top: 0,
    }));
}
// ---------------------------------------------------------------- the ground and the water
/** Signed distance into a rounded box: positive inside, negative outside, in metres. */
export function roundedInside(point, box, radius = CORNER) {
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const hx = (box.maxX - box.minX) / 2 - radius;
    const hz = (box.maxZ - box.minZ) / 2 - radius;
    const qx = Math.abs(point.x - cx) - hx;
    const qz = Math.abs(point.z - cz) - hz;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius;
    return -outside;
}
/** Which water a point is in (as far as the eye goes), how far in, or null on land. */
export function coveWaterAt(point) {
    const lagoon = roundedInside(point, LAGOON_FAR);
    if (lagoon > 0)
        return { water: "lagoon", inside: lagoon };
    const sea = Math.max(roundedInside(point, SEA_FAR), roundedInside(point, NORTH_SEA_FAR));
    if (sea > 0)
        return { water: "sea", inside: sea };
    return null;
}
/** Signed distance to the water's edge: positive in the water, negative on land (how far to the nearest water). */
export function coveWaterDistance(point) {
    return Math.max(roundedInside(point, LAGOON_FAR), roundedInside(point, SEA_FAR), roundedInside(point, NORTH_SEA_FAR));
}
/** The fishing zone at a point on the water, or null on land, too close in under the bank, or under a dock. */
export const CAST_SHORE_MARGIN = 0.9;
export function coveZoneAt(point) {
    const water = coveWaterAt(point);
    if (!water || water.inside < CAST_SHORE_MARGIN)
        return null;
    if (onDock(point, 0.3))
        return null;
    if (water.water === "lagoon")
        return "lagoon";
    return point.z < DEEP_Z ? "deep" : "reef";
}
/** How deep each water's bed lies at its middle. The Deep keeps going down. */
const BED = Object.freeze({ lagoon: -1.5, reef: -2.6, deep: -7 });
/** The bank: the shore falls this far over this many metres into the water. */
const BANK_DROP = 0.9;
const BANK_WIDTH = 1.6;
const smooth = (t) => {
    const clamped = Math.min(1, Math.max(0, t));
    return clamped * clamped * (3 - 2 * clamped);
};
/**
 * The ground's height anywhere, in or out of the bounds: 0 on land, down a
 * bank at the water's edge, then out to the bed. The sea's bed falls away
 * past the reef line into the Deep.
 */
export function coveGroundAt(point) {
    const water = coveWaterAt(point);
    if (!water)
        return 0;
    const bank = -BANK_DROP * smooth(water.inside / BANK_WIDTH);
    if (water.inside <= BANK_WIDTH)
        return bank;
    const out = water.inside - BANK_WIDTH;
    const floor = water.water === "lagoon"
        ? BED.lagoon
        : BED.reef + (BED.deep - BED.reef) * smooth((DEEP_Z + 2 - point.z) / 10);
    return -BANK_DROP + (floor + BANK_DROP) * smooth(out / 5);
}
/** How much water stands over a point. */
export function coveWaterDepthAt(point) {
    return Math.max(0, COVE_WATER_LEVEL - coveGroundAt(point));
}
// ---------------------------------------------------------------- where the shadows swim
/**
 * Inside the bounds, clear of the banks and the docks, the open water each
 * zone's shadows swim in (farm-fish.mts). A shadow's circle stays inside its
 * box, so it never swims up the bank or under a deck.
 */
export const SHADOW_WATERS = Object.freeze({
    lagoon: Object.freeze([rect(-18.5, -12.4, -18.5, 2.6), rect(-8, -3.8, -18.5, 2.6), rect(-12.4, -8, -18.5, -3.4)]),
    reef: Object.freeze([rect(3.6, 8.6, -6.6, 3), rect(13.4, 18.5, -6.6, 3)]),
    deep: Object.freeze([rect(3.6, 18.5, -18.5, -12.4), rect(3.6, 6.4, -12.4, -8.6), rect(15.6, 18.5, -12.4, -8.6)]),
});
// ---------------------------------------------------------------- the shore
export const COVE_SPAWN = Object.freeze({ x: 0, z: HALF - 2.2, yaw: 0 });
/** The gate in the south wall, back up the road to the Market Square. */
export const COVE_MARKET_GATE = "cove-gate-market";
const WALL = HALF - COVE_BOUNDS.wallInset - 0.25;
const GATE_WIDTH = 2.4;
const SOUTH_RUN = WALL - GATE_WIDTH / 2 + 0.25;
const SIDE_RUN = WALL - SHORE_Z;
const QUARTER = Math.PI / 2;
const row = (instanceId, itemId, x, z, rotationY = 0, length = 0) => Object.freeze({ instanceId, itemId, x, z, rotationY, length });
/** Everything on the shore the farm's catalog already draws. */
export const COVE_DECOR = Object.freeze([
    // The south wall and its gate up to the square; the side walls run down to the water.
    row("cove-wall-sw", "decor.fence.stone-wall", -(GATE_WIDTH / 2 + SOUTH_RUN / 2), WALL, 0, SOUTH_RUN),
    row("cove-wall-se", "decor.fence.stone-wall", GATE_WIDTH / 2 + SOUTH_RUN / 2, WALL, 0, SOUTH_RUN),
    row(COVE_MARKET_GATE, "decor.fence.gate", 0, WALL, 0),
    row("cove-wall-w", "decor.fence.stone-wall", -WALL, SHORE_Z + SIDE_RUN / 2, QUARTER, SIDE_RUN),
    row("cove-wall-e", "decor.fence.stone-wall", WALL, SHORE_Z + SIDE_RUN / 2, QUARTER, SIDE_RUN),
    row("cove-signpost", "decor.prop.signpost", 2.1, WALL - 1.1, 0),
    row("cove-lamp-gate-w", "decor.prop.lamp-post", -1.8, WALL - 1.1),
    // The campfire between the shops, benches round it, for sitting and talking.
    row("cove-campfire", "decor.prop.campfire", 0, 11.4),
    row("cove-bench-w", "decor.prop.bench", -2.5, 11.4, QUARTER),
    row("cove-bench-e", "decor.prop.bench", 2.5, 11.4, -QUARTER),
    row("cove-bench-s", "decor.prop.bench", 0, 13.9, Math.PI),
    // Lamps along the shore path and at the pier heads.
    row("cove-lamp-1", "decor.prop.lamp-post", -6.6, 8.2),
    row("cove-lamp-2", "decor.prop.lamp-post", 6.6, 8.2),
    row("cove-lamp-3", "decor.prop.lamp-post", -13, 8.2),
    row("cove-lamp-4", "decor.prop.lamp-post", 14.2, 8.2),
    // A picnic table and chairs by the lagoon; the anglers' odds and ends by the pier.
    row("cove-picnic", "decor.furniture.picnic-table", -15.4, 10.4),
    row("cove-rocker", "decor.furniture.rocking-chair", -12.2, 12.6, Math.PI * 0.8),
    row("cove-barrel-1", "decor.prop.barrel", 13.8, 8.4),
    row("cove-barrel-2", "decor.prop.barrel", 14.5, 9.1),
    row("cove-crates", "decor.prop.crates", 16.2, 8.6, 0.3),
    row("cove-anchor", "decor.prop.old-anchor", 8, 8.3, 0.6),
    row("cove-logs", "decor.prop.log-pile", -17.2, 16.6, QUARTER),
    // Trees along the shore's back, clear of the path; willows lean over the lagoon.
    row("cove-willow-1", "decor.plant.willow", -18, 7.6),
    row("cove-willow-2", "decor.plant.willow", -4.4, 8),
    row("cove-pine-1", "decor.plant.pine", 18, 17.6),
    row("cove-pine-2", "decor.plant.pine", -18.4, 17.8),
    row("cove-flowers-1", "decor.plant.flower-bed", -6.2, 18.2),
    row("cove-flowers-2", "decor.plant.flower-bed", 6.2, 18.2),
    // Out on the spit: somewhere to sit and look at both waters.
    row("cove-spit-bench", "decor.prop.bench", 0, -4, Math.PI),
    row("cove-spit-lamp", "decor.prop.lamp-post", 0, -10),
]);
/**
 * The Cove's shore as a farm document, so every farm rule that reads a layout
 * reads it unchanged. The decor rows go in as they are: the farm's normalizer
 * would clamp them into a farm's 28 m field, and the Cove is wider.
 */
export function coveLayout() {
    const base = normalizeFarmLayout({
        version: 3,
        onboarding: { status: "complete", introSeen: true },
        ground: "ground.meadow",
        pets: [],
        decor: [],
    });
    return Object.freeze({ ...base, decor: COVE_DECOR });
}
/** Every decor row in the Cove names an item the catalog draws. */
export function coveDecorIsDrawable() {
    return COVE_DECOR.every((entry) => Boolean(findFarmDecor(entry.itemId)));
}
// ---------------------------------------------------------------- the shops
export const TACKLE_STALL_ID = "tackle";
export const FISHMONGER_STALL_ID = "fishmonger";
export const RECORDS_BOARD_ID = "records";
const stall = (spec) => Object.freeze({ footprint: Object.freeze({ width: 3.4, depth: 2 }), ...spec });
/** Stalls face north over the water (their front, local +z, turned half round). */
export const COVE_STALLS = Object.freeze([
    stall({
        id: TACKLE_STALL_ID, kind: "stall", title: "Bait & Tackle", open: true,
        x: -7.6, z: 15.6, rotationY: Math.PI, colors: ["#2f6f8f", "#f4ecd6"],
        keeper: Object.freeze({ name: "Old Pike", avatarId: "avatar.villager-m", greeting: "Worms by the tub, lures on the rack, rods on the wall." }),
        closedNote: "",
    }),
    stall({
        id: FISHMONGER_STALL_ID, kind: "stall", title: "Fishmonger", open: true,
        x: 7.6, z: 15.6, rotationY: Math.PI, colors: ["#c24e3a", "#f4ecd6"],
        keeper: Object.freeze({ name: "Coral", avatarId: "avatar.villager-f", greeting: "Let's see what you caught. The big ones pay best." }),
        closedNote: "",
    }),
    stall({
        id: RECORDS_BOARD_ID, kind: "board", title: "Cove Records", open: true,
        x: -HALF + 1.2, z: 13, rotationY: QUARTER, footprint: Object.freeze({ width: 2.6, depth: 0.5 }),
        colors: ["#1f4f6b", "#f4ecd6"], keeper: null,
        closedNote: "",
        notices: Object.freeze(["Heaviest", "Today", "Record", "All time", "Legends"]),
    }),
]);
export function findCoveStall(id) {
    return COVE_STALLS.find((entry) => entry.id === id);
}
export function coveStallPrompt(entry, signedIn) {
    if (entry.id === RECORDS_BOARD_ID)
        return "Press E to read the Cove Records";
    if (!signedIn)
        return `${entry.title} · sign in to ${entry.id === TACKLE_STALL_ID ? "buy tackle" : "sell your catch"}`;
    return entry.id === TACKLE_STALL_ID
        ? `Press E to buy bait and tackle from ${entry.keeper?.name ?? entry.title}`
        : `Press E to sell your catch to ${entry.keeper?.name ?? entry.title}`;
}
// ---------------------------------------------------------------- where a cast can be made from
/** How far from the water's edge an angler may stand and still cast. */
export const CAST_REACH = 2.4;
/**
 * Can the player cast from here, looking this way? They must stand on the
 * shore or a dock with open water ahead of them within reach. Returns the
 * first point of water ahead (the nearest a cast can land), or null.
 */
export function castOrigin(pose) {
    for (let step = 0.4; step <= CAST_REACH + CAST_SHORE_MARGIN + 0.6; step += 0.2) {
        const point = { x: pose.x + pose.forward.x * step, z: pose.z + pose.forward.z * step };
        if (coveZoneAt(point))
            return point;
    }
    return null;
}
/** Where a cast of `power` (0..1) with `range` metres lands, straight ahead. Never nearer than the first water. */
export function castLanding(pose, power, range) {
    const distance = 2.5 + Math.min(1, Math.max(0, power)) * Math.max(0, range - 2.5);
    return { x: pose.x + pose.forward.x * distance, z: pose.z + pose.forward.z * distance };
}
