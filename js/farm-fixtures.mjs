// What stands inside and around a building besides its walls — the hay pile,
// the workbench, the stalls, the loft and the ladder up to it — as DATA in the
// building's frame.
//
// Pure: no THREE, no DOM. This is the fixture counterpart of `shellWalls` in
// `farm-scene.mts`: the builders in `farm-props-buildings.mts` draw a box for
// every fixture here, and `farmObstacles` hands the same boxes to the walker
// and the pet sim, so nothing the eye sees inside a building is something the
// body slips through. A prop that the player can use (a bench to sit on) lists
// its fixture here too; its footprint stays the thing that collides.
//
// FIVE KINDS. `solid` blocks the body. `platform` is a floor the player can
// stand on at `top` (a hay loft, a silo catwalk) — it is solid to a body whose
// span crosses it and support to a body above it. `ladder` is a solid the
// player climbs: its climbing face is the fixture's local +z, and `climbsTo`
// names the platform it ends on, in the same building. `seat` is a solid the
// player sits on, facing the fixture's local +z, at `top`. `door` is a solid
// leaf on a hinge at one end of its width: E swings it by `door.swing`, and
// OPEN IT IS STILL SOLID, standing at its swung angle (`fixtureDoorPose`), so
// a half-door stood open against a partition is a thing the body walks round
// and not through. Which doors stand open is state the field keeps per door
// id (`<instanceId>-<name>`), beside the buildings' own doors.
//
// EVERY FIXTURE HAS A VERTICAL SPAN. `bottom`/`top` are what let a loft exist
// at all: a body on the ground walks under a loft at 2.2 m, and a body on the
// loft walks beside the hay that stands on it. `farm-body.mts` filters by span.
import { roundFace } from "./farm-shell.mjs";
/** The ladder's standard box: rung width across, a hand's depth, standing against its platform's edge. */
export const LADDER_WIDTH = 0.5;
export const LADDER_DEPTH = 0.1;
/** Where the climber stands, out from the ladder's centre along its climbing face. */
export const LADDER_FOOT_OFFSET = 0.45;
/** How far inside a platform's edge the climber is put on stepping off the ladder. */
export const LADDER_EXIT_INSET = 0.35;
function fixture(name, spec) {
    return Object.freeze({
        name,
        kind: spec.kind ?? "solid",
        x: spec.x,
        z: spec.z,
        rotationY: spec.rotationY ?? 0,
        width: spec.width,
        depth: spec.depth,
        bottom: spec.bottom ?? 0,
        top: spec.top,
        climbsTo: spec.climbsTo ?? "",
        door: spec.door ?? null,
    });
}
/** A ladder standing at (x, z), rungs facing `rotationY`'s local +z, ending on `climbsTo` at `top`. */
function ladder(name, x, z, rotationY, top, climbsTo) {
    return fixture(name, { kind: "ladder", x, z, rotationY, width: LADDER_WIDTH, depth: LADDER_DEPTH, top, climbsTo });
}
/** How far a hinged leaf swings: a hair short of square, so a leaf opened flat against a wall stops just off it. */
export const DOOR_OPEN_ANGLE = Math.PI / 2 - 0.04;
/** A leaf's thickness, and the gap left between its hinge edge and the wall or post it hangs beside. */
const LEAF_DEPTH = 0.05;
const LEAF_CLEARANCE = 0.06;
/**
 * The signed swing that carries a leaf hung on `hinge` toward local `toward`
 * (−1 = −z, 1 = +z). Three's y-rotation maps (x, z) → (x cos θ + z sin θ,
 * −x sin θ + z cos θ): a leaf on the +x hinge extends to −x, and a NEGATIVE θ
 * carries that free end to −z.
 */
function doorSwing(hinge, toward, angle = DOOR_OPEN_ANGLE) {
    return hinge * toward * angle;
}
/** A door leaf whose hinge edge sits at `hingeX` (a hair off the wall it hangs beside), `width` wide, shut across `z`, swinging `toward`. */
function door(name, spec) {
    const hinge = spec.hinge;
    return fixture(name, {
        kind: "door",
        x: spec.hingeX - hinge * spec.width / 2,
        z: spec.z,
        width: spec.width,
        depth: LEAF_DEPTH,
        top: spec.top,
        door: { hinge, swing: doorSwing(hinge, spec.toward), reach: spec.reach, label: spec.label },
    });
}
function barnFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    const loftTop = 2.2;
    const loftDepth = 1.6;
    const loftFront = -halfD + t + loftDepth;
    return [
        // The hay loft across the back, its ladder against the loft's front edge, and a stack of hay up on it.
        fixture("loft", { kind: "platform", x: 0, z: -halfD + t + loftDepth / 2, width: footprint.width - t * 2, depth: loftDepth, bottom: loftTop - 0.1, top: loftTop }),
        ladder("ladder", 2.2, loftFront + LADDER_DEPTH / 2 + 0.01, 0, loftTop, "loft"),
        fixture("loft-hay", { x: -2.2, z: -halfD + t + 0.75, width: 1.4, depth: 1.0, bottom: loftTop, top: loftTop + 0.8 }),
        // Under the loft: the hay pile in the back-west corner. The workbench is on the WEST wall's front half, well away from the ladder.
        fixture("hay-pile", { x: -halfW + t + 1.2, z: -halfD + t + 0.8, width: 2.2, depth: 1.4, top: 1.6 }),
        fixture("workbench", { x: -halfW + t + 0.45, z: 1.2, width: 0.7, depth: 2, top: 0.94 }),
    ];
}
function stableFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    const stalls = 3;
    const stallWidth = (footprint.width - t * 2) / stalls;
    const stallDepth = 1.6;
    const frontZ = -halfD + t + stallDepth + 0.02;
    const doorWidth = 1.0;
    const fixtures = [];
    for (let index = 0; index <= stalls; index += 1) {
        const x = -halfW + t + index * stallWidth;
        if (index > 0 && index < stalls)
            fixtures.push(fixture(`stall-wall-${index}`, { x, z: -halfD + t + stallDepth / 2, width: 0.06, depth: stallDepth, top: 1.4 }));
        if (index === stalls)
            break;
        // The stall's front: a fixed half-wall from the west, and a half-door at the east end hung on the partition (or the east wall)
        // beside it, swinging INTO the stall so the aisle stays clear and the open leaf lies flat against that partition.
        const east = x + stallWidth;
        const hingeX = east - LEAF_CLEARANCE;
        const panelWest = x + LEAF_CLEARANCE;
        const panelEast = hingeX - doorWidth - 0.01;
        fixtures.push(fixture(`stall-front-${index + 1}`, { x: (panelWest + panelEast) / 2, z: frontZ, width: panelEast - panelWest, depth: LEAF_DEPTH, top: 1.2 }));
        fixtures.push(door(`stall-door-${index + 1}`, { hingeX, z: frontZ, width: doorWidth, top: 1.2, hinge: 1, toward: -1, reach: 1.6, label: "stall door" }));
    }
    fixtures.push(fixture("saddle-rack", { x: halfW - t - 0.4, z: 0.9, width: 0.5, depth: 0.3, top: 1.12 }));
    return fixtures;
}
function cottageFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    return [
        fixture("table", { x: 0, z: 0.2, width: 1.2, depth: 0.8, top: 0.79 }),
        // Two stools, each facing the table across it.
        fixture("stool-north", { kind: "seat", x: 0, z: -0.5, rotationY: 0, width: 0.36, depth: 0.36, top: 0.475 }),
        fixture("stool-south", { kind: "seat", x: 0, z: 0.9, rotationY: Math.PI, width: 0.36, depth: 0.36, top: 0.475 }),
        fixture("hearth", { x: halfW - 1.2, z: -halfD + t + 0.2, width: 1.4, depth: 0.4, top: 1.3 }),
    ];
}
function greenhouseFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    return [-1, 1].map((side) => fixture(side < 0 ? "bench-west" : "bench-east", { x: side * (halfW - t - 0.45), z: 0, width: 0.7, depth: footprint.depth - t * 2 - 0.4, top: 1.3 }));
}
function shedFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    return [
        fixture("shelves", { x: 0, z: -halfD + t + 0.2, width: footprint.width - t * 2 - 0.1, depth: 0.35, bottom: 0.68, top: 1.92 }),
        fixture("workbench", { x: halfW - t - 0.3, z: 0.25, width: 0.5, depth: 1.5, top: 0.88 }),
        fixture("tools", { x: -halfW + t + 0.2, z: 0, width: 0.3, depth: 1.0, top: 1.8 }),
    ];
}
function coopFixtures({ footprint, shell }) {
    const t = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    return [
        fixture("nest-boxes", { x: 0, z: -halfD + t + 0.25, width: footprint.width - t * 2 - 0.2, depth: 0.5, bottom: 0.675, top: 1.2 }),
        // The roost is a perch along the west side, so the path to the nest boxes stays open on the east.
        fixture("roost", { x: -halfW + t + 0.5, z: 0.3, width: 0.9, depth: 0.06, bottom: 0.97, top: 1.03 }),
    ];
}
/** The catwalk ring round the top of a round tower: one platform per face, a rail on its outer edge, a gap in the rail where the ladder lands. */
function catwalkFixtures(building, ladderFace, top, width) {
    const shell = building.shell;
    const fixtures = [];
    for (let index = 0; index < shell.sides; index += 1) {
        const face = roundFace(shell, building.footprint, index);
        const radius = face.apothem + width / 2;
        const outerLength = 2 * (face.apothem + width) * Math.tan(Math.PI / shell.sides);
        fixtures.push(fixture(`catwalk-${index}`, { kind: "platform", x: Math.sin(face.angle) * radius, z: Math.cos(face.angle) * radius, rotationY: face.angle, width: outerLength, depth: width, bottom: top - 0.1, top }));
        const railRadius = face.apothem + width - 0.05;
        // A hair short of the corner, so neighbouring rails meet rather than cross.
        const railLength = 2 * railRadius * Math.tan(Math.PI / shell.sides) - 0.08;
        if (index === ladderFace) {
            // Two halves either side of the ladder's landing.
            const gap = LADDER_WIDTH + 0.5;
            const half = (railLength - gap) / 2;
            for (const side of [-1, 1]) {
                const along = side * (gap / 2 + half / 2);
                const cx = Math.sin(face.angle) * railRadius + Math.cos(face.angle) * along;
                const cz = Math.cos(face.angle) * railRadius - Math.sin(face.angle) * along;
                fixtures.push(fixture(`rail-${index}${side < 0 ? "a" : "b"}`, { x: cx, z: cz, rotationY: face.angle, width: half, depth: 0.06, bottom: top, top: top + 1.05 }));
            }
        }
        else {
            fixtures.push(fixture(`rail-${index}`, { x: Math.sin(face.angle) * railRadius, z: Math.cos(face.angle) * railRadius, rotationY: face.angle, width: railLength, depth: 0.06, bottom: top, top: top + 1.05 }));
        }
    }
    return fixtures;
}
function siloFixtures(building) {
    const shell = building.shell;
    const face = roundFace(shell, building.footprint, 0);
    const inner = face.apothem - shell.wallThickness;
    const catwalkTop = shell.wallHeight - 0.3;
    return [
        // The grain heap against the back and a spill either side of the way in.
        fixture("grain", { x: 0, z: -inner * 0.36, width: inner * 1.2, depth: inner * 1.2, top: 1.4 }),
        fixture("spill-east", { x: 1.05, z: 0.75, width: 0.6, depth: 0.6, top: 0.36 }),
        fixture("spill-west", { x: -1.05, z: 0.75, width: 0.6, depth: 0.6, top: 0.36 }),
        // The ladder up the back face, on the outside, to the catwalk round the top.
        ladder("ladder", 0, -face.apothem - 0.18, Math.PI, catwalkTop, "catwalk-4"),
        ...catwalkFixtures(building, 4, catwalkTop, 1.1),
    ];
}
function windmillFixtures(building) {
    const shell = building.shell;
    const face = roundFace(shell, building.footprint, 0);
    const inner = face.apothem - shell.wallThickness;
    const loftTop = 3.0;
    const loftFront = -0.3;
    const loftBack = -inner + 0.4;
    return [
        fixture("millstone", { x: 0, z: -0.55, width: 1.4, depth: 1.4, top: 0.7 }),
        // The shaft rises out of the stone and through the loft to the cap.
        fixture("shaft", { x: 0, z: -0.55, width: 0.16, depth: 0.16, bottom: 0.7, top: Infinity }),
        fixture("sacks", { x: -1.0, z: 0.7, width: 0.8, depth: 0.9, top: 0.5 }),
        // A loft across the back half (its corners sit inside the wall's thickness), its ladder against the loft's front edge east of the millstone.
        fixture("loft", { kind: "platform", x: 0, z: (loftFront + loftBack) / 2, width: 2.6, depth: loftFront - loftBack, bottom: loftTop - 0.1, top: loftTop }),
        ladder("ladder", 1.1, loftFront + LADDER_DEPTH / 2 + 0.01, 0, loftTop, "loft"),
    ];
}
function gazeboFixtures({ footprint, shell }) {
    const post = shell.wallThickness;
    const halfW = footprint.width / 2;
    const halfD = footprint.depth / 2;
    const railLength = footprint.width - post * 2;
    const seatTop = 0.58;
    return [
        // Railings on the back and both sides; the front is open.
        fixture("rail-back", { x: 0, z: -halfD + post / 2, width: railLength, depth: 0.1, bottom: 0.3, top: 1.0 }),
        fixture("rail-west", { x: -halfW + post / 2, z: 0, rotationY: Math.PI / 2, width: footprint.depth - post * 2, depth: 0.1, bottom: 0.3, top: 1.0 }),
        fixture("rail-east", { x: halfW - post / 2, z: 0, rotationY: Math.PI / 2, width: footprint.depth - post * 2, depth: 0.1, bottom: 0.3, top: 1.0 }),
        // The bench ring, every bench facing into the middle.
        fixture("bench-back", { kind: "seat", x: 0, z: -halfD + post + 0.25, rotationY: 0, width: railLength - 0.2, depth: 0.4, top: seatTop }),
        fixture("bench-west", { kind: "seat", x: -halfW + post + 0.25, z: 0, rotationY: Math.PI / 2, width: footprint.depth - post * 2 - 1.6, depth: 0.4, top: seatTop }),
        fixture("bench-east", { kind: "seat", x: halfW - post - 0.25, z: 0, rotationY: -Math.PI / 2, width: footprint.depth - post * 2 - 1.6, depth: 0.4, top: seatTop }),
    ];
}
/** The garden bench: its seat is the slats, facing local +z away from the backrest. */
function benchFixtures() {
    return [fixture("seat", { kind: "seat", x: 0, z: 0.02, rotationY: 0, width: 1.6, depth: 0.5, top: 0.47 })];
}
const FIXTURES_BY_MODEL = Object.freeze({
    barn: barnFixtures,
    stable: stableFixtures,
    cottage: cottageFixtures,
    greenhouse: greenhouseFixtures,
    shed: shedFixtures,
    coop: coopFixtures,
    silo: siloFixtures,
    windmill: windmillFixtures,
    gazebo: gazeboFixtures,
    bench: benchFixtures,
});
const NONE = Object.freeze([]);
const cache = new Map();
/** Every fixture of a catalog item, in its frame; empty for an item that is only its footprint. */
export function farmFixtures(definition) {
    const cached = cache.get(definition.id);
    if (cached)
        return cached;
    const build = FIXTURES_BY_MODEL[definition.model];
    const fixtures = build ? Object.freeze(build(definition)) : NONE;
    cache.set(definition.id, fixtures);
    return fixtures;
}
/** The fixture called `name`, for a builder that draws it. Throws for a name the item has no fixture for. */
export function fixtureNamed(definition, name) {
    const found = farmFixtures(definition).find((entry) => entry.name === name);
    if (!found)
        throw new Error(`${definition.id} has no fixture ${name}`);
    return found;
}
/** The models whose fixtures this file describes; a builder for one of them draws from the list. */
export function fixtureModelNames() {
    return Object.keys(FIXTURES_BY_MODEL);
}
/** A point in a fixture's frame → the item's frame (the fixture's own turn applied). */
export function fixtureLocalToItem(entry, local) {
    const cosine = Math.cos(entry.rotationY);
    const sine = Math.sin(entry.rotationY);
    return { x: entry.x + local.x * cosine + local.z * sine, z: entry.z - local.x * sine + local.z * cosine };
}
/** A door fixture's hinge, in the item's frame: the end of its width the leaf hangs on. */
export function fixtureDoorHinge(entry) {
    const hinge = entry.door?.hinge ?? 1;
    return fixtureLocalToItem(entry, { x: hinge * entry.width / 2, z: 0 });
}
/**
 * Where a door fixture's box stands, in the item's frame: shut, its own
 * centre and turn; open, swung about its hinge by its `door.swing`. The
 * obstacle list and the drawn leaf both read this, so the leaf the eye sees
 * standing open is exactly the box the body cannot pass.
 */
export function fixtureDoorPose(entry, open) {
    if (!open || !entry.door)
        return { x: entry.x, z: entry.z, rotationY: entry.rotationY };
    const hinge = fixtureDoorHinge(entry);
    const rotationY = entry.rotationY + entry.door.swing;
    const cosine = Math.cos(rotationY);
    const sine = Math.sin(rotationY);
    // The centre is half a leaf from the hinge, along the swung leaf's own x, away from the hinge end.
    const along = -entry.door.hinge * entry.width / 2;
    return { x: hinge.x + along * cosine, z: hinge.z - along * sine, rotationY };
}
/** Where a climber stands at the ladder's foot, in the item's frame: out along the climbing face. */
export function ladderFoot(entry) {
    return fixtureLocalToItem(entry, { x: 0, z: LADDER_DEPTH / 2 + LADDER_FOOT_OFFSET });
}
/**
 * Where a climber steps off at the top, in the item's frame: the ladder's own
 * spot pulled inside the platform's box by `LADDER_EXIT_INSET`. A loft ladder
 * lands a step in from the edge; a catwalk ladder lands on the catwalk itself.
 */
export function ladderExit(entry, platform) {
    const cosine = Math.cos(platform.rotationY);
    const sine = Math.sin(platform.rotationY);
    const dx = entry.x - platform.x;
    const dz = entry.z - platform.z;
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    const limitX = Math.max(0, platform.width / 2 - LADDER_EXIT_INSET);
    const limitZ = Math.max(0, platform.depth / 2 - LADDER_EXIT_INSET);
    const clampedX = Math.min(limitX, Math.max(-limitX, localX));
    const clampedZ = Math.min(limitZ, Math.max(-limitZ, localZ));
    return fixtureLocalToItem(platform, { x: clampedX, z: clampedZ });
}
