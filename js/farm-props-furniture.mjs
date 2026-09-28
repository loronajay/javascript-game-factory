// The workshop's models: the Carpenter's Workbench, the farm's own Sawmill,
// and every piece of furniture the bench makes (farm-catalog/carpentry.mts).
//
// A PIECE WEARS ITS STARS. The same pattern is drawn in three finishes, so a
// placed piece shows how well it was made without a label: rough-hewn (one
// star) is pale, dry, matt timber with plain iron; stained (two) is darker
// and richer; varnished (three) is deep and glossy with brass fittings. The
// wood is the pattern's own — oak, pine, birch or willow — from its first
// plank species, so a birch chest is pale and a willow clock is dark.
//
// Every model is procedural (farm-materials' metre-scaled wood tiles and the
// room's primitives): a new piece is a catalog row, a pattern and a builder
// here, never an art asset. Each is drawn facing local +z, standing on y = 0,
// inside the footprint its decor row declares.
import { farmMaterial, tbox, tcylinder, tsphere, shade } from "./farm-materials.mjs";
import { place, seededRandom, surface } from "./farm-item-geometry.mjs";
import { PLANK_SPECIES, findPattern } from "./farm-catalog/carpentry.mjs";
/** The Workbench's working surface in its own frame: where the board being worked lies. */
export const WORKBENCH_ANCHORS = Object.freeze({
    board: Object.freeze({ x: 0, y: 0.95, z: 0.08 }),
    /** Where a finished piece is shown off, on the ground in front of the bench. */
    showcase: Object.freeze({ x: 0, z: 1.25 }),
});
/** The wood a pattern is made of: its first plank species. */
function speciesOf(itemId) {
    const pattern = findPattern(itemId);
    return pattern ? Object.keys(pattern.planks)[0] ?? "oak" : "oak";
}
/** A species' timber at a star level: rough-hewn, stained or varnished. */
export function pieceFinish(THREE, speciesId, stars) {
    const plank = PLANK_SPECIES.find((entry) => entry.id === speciesId) ?? PLANK_SPECIES[0];
    const base = stars === 1 ? shade(plank.color, 0.12) : stars === 2 ? shade(plank.color, -0.2) : shade(plank.color, -0.1);
    const grain = stars === 1 ? shade(plank.grain, 0.1) : shade(plank.grain, -0.18);
    const light = stars === 3 ? shade(plank.color, 0.08) : shade(plank.color, 0.18);
    const roughness = stars === 1 ? 0.95 : stars === 2 ? 0.72 : 0.3;
    const wood = farmMaterial(THREE, "wood", { colors: [base, grain, light], metresPerTile: 0.7, roughness, metalness: stars === 3 ? 0.05 : 0 });
    const end = farmMaterial(THREE, "wood", { colors: [shade(base, -0.12), grain, base], metresPerTile: 0.4, roughness, metalness: 0 });
    const metal = stars === 3
        ? surface(THREE, "#c9a85a", { roughness: 0.28, metalness: 0.85, flat: false })
        : surface(THREE, stars === 2 ? "#3a3d42" : "#55585c", { roughness: 0.55, metalness: 0.6, flat: false });
    return Object.freeze({ wood, end, metal, stars });
}
// ---------------------------------------------------------------- the pieces
function crate(THREE, group, f) {
    const size = 0.72;
    const half = size / 2;
    // Corner posts, then three slats a side with the gaps a crate has.
    for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]])
        tbox(THREE, group, [0.06, size, 0.06], [x * 0.95, size / 2, z * 0.95], f.end);
    for (let index = 0; index < 3; index += 1) {
        const y = 0.12 + index * 0.24;
        tbox(THREE, group, [size, 0.17, 0.03], [0, y, half], f.wood);
        tbox(THREE, group, [size, 0.17, 0.03], [0, y, -half], f.wood);
        tbox(THREE, group, [0.03, 0.17, size], [half, y, 0], f.wood);
        tbox(THREE, group, [0.03, 0.17, size], [-half, y, 0], f.wood);
    }
    tbox(THREE, group, [size - 0.02, 0.02, size - 0.02], [0, 0.02, 0], f.wood);
    // Stencilled with the farm's mark on the front, and a lid leant half off.
    tbox(THREE, group, [size + 0.04, 0.03, size * 0.6], [0.03, size + 0.02, -0.12], f.wood).rotation.z = 0.06;
    if (f.stars === 3)
        for (const x of [-0.25, 0.25])
            tbox(THREE, group, [0.07, 0.03, 0.005], [x, size - 0.08, half + 0.02], f.metal);
}
function planterBox(THREE, group, f, seed) {
    const width = 1.34;
    const depth = 0.44;
    const height = 0.44;
    tbox(THREE, group, [width, height, 0.04], [0, height / 2, depth / 2], f.wood);
    tbox(THREE, group, [width, height, 0.04], [0, height / 2, -depth / 2], f.wood);
    tbox(THREE, group, [0.04, height, depth], [width / 2, height / 2, 0], f.end);
    tbox(THREE, group, [0.04, height, depth], [-width / 2, height / 2, 0], f.end);
    tbox(THREE, group, [width + 0.06, 0.04, depth + 0.08], [0, height + 0.01, 0], f.wood);
    tbox(THREE, group, [width - 0.05, 0.05, depth - 0.05], [0, height - 0.04, 0], farmMaterial(THREE, "soil"));
    const random = seededRandom(`planter-${seed}`);
    const petals = ["#ff6f91", "#ffd33d", "#f4f1e8", "#9a7fd6", "#ff8a3c"];
    const leaves = surface(THREE, "#4f9a3a", { roughness: 0.8 });
    for (let index = 0; index < 11; index += 1) {
        const x = -width / 2 + 0.12 + (index / 10) * (width - 0.24) + (random() - 0.5) * 0.06;
        const z = (random() - 0.5) * (depth - 0.16);
        const tall = 0.14 + random() * 0.16;
        tcylinder(THREE, group, 0.008, 0.01, tall, [x, height + tall / 2, z], leaves, 5, false);
        tsphere(THREE, group, 0.045 + random() * 0.02, [x, height + tall + 0.02, z], surface(THREE, petals[index % petals.length], { roughness: 0.7 }), 8, 6);
    }
}
function stool(THREE, group, f) {
    tcylinder(THREE, group, 0.23, 0.23, 0.05, [0, 0.475, 0], f.wood, 20);
    for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2;
        const leg = tcylinder(THREE, group, 0.022, 0.028, 0.48, [Math.sin(angle) * 0.14, 0.23, Math.cos(angle) * 0.14], f.end, 8);
        leg.rotation.set(Math.cos(angle) * 0.14, 0, -Math.sin(angle) * 0.14);
    }
    // A rung ring a third of the way up.
    place(THREE, group, new THREE.TorusGeometry(0.15, 0.012, 5, 18), f.end, [0, 0.17, 0], [Math.PI / 2, 0, 0]);
}
function chair(THREE, group, f) {
    const seatY = 0.44;
    tbox(THREE, group, [0.5, 0.05, 0.46], [0, seatY, 0.02], f.wood);
    for (const [x, z] of [[-0.21, 0.2], [0.21, 0.2]])
        tcylinder(THREE, group, 0.022, 0.022, seatY, [x, seatY / 2, z], f.end, 8);
    // The back posts run on up past the seat: a ladder-back of three rails.
    for (const x of [-0.21, 0.21])
        tcylinder(THREE, group, 0.024, 0.024, 1.0, [x, 0.5, -0.19], f.end, 8);
    for (const y of [0.64, 0.78, 0.92])
        tbox(THREE, group, [0.42, 0.07, 0.025], [0, y, -0.19], f.wood);
    for (const [z, y] of [[0.2, 0.14], [-0.19, 0.14]])
        tbox(THREE, group, [0.42, 0.025, 0.025], [0, y, z], f.end);
    if (f.stars === 3)
        for (const x of [-0.21, 0.21])
            tsphere(THREE, group, 0.032, [x, 1.01, -0.19], f.metal, 10, 8);
}
function table(THREE, group, f) {
    const top = 0.74;
    for (let index = 0; index < 4; index += 1)
        tbox(THREE, group, [1.6, 0.05, 0.22], [0, top, -0.33 + index * 0.22], f.wood);
    tbox(THREE, group, [1.4, 0.1, 0.03], [0, top - 0.08, 0.36], f.end);
    tbox(THREE, group, [1.4, 0.1, 0.03], [0, top - 0.08, -0.36], f.end);
    for (const [x, z] of [[-0.72, -0.36], [0.72, -0.36], [-0.72, 0.36], [0.72, 0.36]]) {
        // A turned leg: a bead near the top, a taper to the foot.
        tcylinder(THREE, group, 0.035, 0.025, top - 0.03, [x, (top - 0.03) / 2, z], f.end, 10);
        tsphere(THREE, group, 0.045, [x, top - 0.16, z], f.end, 10, 8);
    }
}
function birdhouse(THREE, group, f) {
    tcylinder(THREE, group, 0.04, 0.05, 1.3, [0, 0.65, 0], f.end, 8);
    tbox(THREE, group, [0.28, 0.28, 0.26], [0, 1.44, 0], f.wood);
    // The gable roof, a little overhang all round, and the round door with its perch.
    for (const side of [-1, 1]) {
        const roof = tbox(THREE, group, [0.2, 0.025, 0.34], [side * 0.08, 1.63, 0], surface(THREE, f.stars === 3 ? "#8e2a24" : "#a8312b", { roughness: 0.7 }));
        roof.rotation.z = -side * 0.72;
    }
    place(THREE, group, new THREE.CircleGeometry(0.045, 16), surface(THREE, "#1b140e", { roughness: 1 }), [0, 1.48, 0.131]);
    tcylinder(THREE, group, 0.008, 0.008, 0.08, [0, 1.4, 0.16], f.end, 6).rotation.x = Math.PI / 2;
}
function bookshelf(THREE, group, f, seed) {
    const width = 1.16;
    const depth = 0.36;
    const height = 1.8;
    for (const x of [-width / 2, width / 2])
        tbox(THREE, group, [0.04, height, depth], [x, height / 2, 0], f.wood);
    tbox(THREE, group, [width, height, 0.02], [0, height / 2, -depth / 2 + 0.01], f.end);
    const random = seededRandom(`bookshelf-${seed}`);
    const spines = ["#7a2a24", "#2b4a8a", "#3f7228", "#c9a06a", "#4a3a33", "#8a5a34", "#d9b44a", "#5d3a1f"];
    for (let shelf = 0; shelf < 5; shelf += 1) {
        const y = 0.05 + shelf * 0.43;
        tbox(THREE, group, [width, 0.03, depth], [0, y, 0], f.wood);
        if (shelf === 4)
            continue;
        // A row of books, leaning where the row runs out.
        let x = -width / 2 + 0.05;
        while (x < width / 2 - 0.12 && random() > 0.04) {
            const thick = 0.03 + random() * 0.035;
            const tall = 0.24 + random() * 0.1;
            tbox(THREE, group, [thick, tall, depth * 0.78], [x + thick / 2, y + 0.015 + tall / 2, 0.02], surface(THREE, spines[Math.floor(random() * spines.length)], { roughness: 0.85 }), false);
            x += thick + 0.004;
        }
    }
    tbox(THREE, group, [width + 0.06, 0.05, depth + 0.04], [0, height, 0.01], f.wood);
}
function picnicTable(THREE, group, f) {
    for (let index = 0; index < 4; index += 1)
        tbox(THREE, group, [1.8, 0.045, 0.16], [0, 0.75, -0.26 + index * 0.175], f.wood);
    for (const z of [-0.6, 0.6])
        for (const offset of [-0.07, 0.07])
            tbox(THREE, group, [1.8, 0.04, 0.13], [0, 0.45, z + offset], f.wood);
    // The A-frames at each end carry the top and both benches.
    for (const x of [-0.7, 0.7]) {
        for (const side of [-1, 1]) {
            const leg = tbox(THREE, group, [0.06, 0.86, 0.09], [x, 0.4, side * 0.3], f.end);
            leg.rotation.x = side * 0.62;
        }
        tbox(THREE, group, [0.06, 0.07, 1.36], [x, 0.4, 0], f.end);
        tbox(THREE, group, [0.06, 0.06, 0.7], [x, 0.71, 0], f.end);
    }
}
function storageChest(THREE, group, f) {
    const width = 1.06;
    const depth = 0.56;
    tbox(THREE, group, [width, 0.42, depth], [0, 0.23, 0], f.wood);
    // A rounded lid, the iron bands over it, and the hasp at the front.
    const lid = place(THREE, group, new THREE.CylinderGeometry(depth / 2, depth / 2, width, 18, 1, false, 0, Math.PI), f.wood, [0, 0.44, 0], [0, 0, Math.PI / 2]);
    lid.scale.set(1, 1, 0.5);
    for (const x of [-0.38, 0, 0.38]) {
        tbox(THREE, group, [0.05, 0.43, depth + 0.012], [x, 0.23, 0], f.metal);
        const band = place(THREE, group, new THREE.CylinderGeometry(depth / 2 + 0.006, depth / 2 + 0.006, 0.05, 18, 1, true, 0, Math.PI), f.metal, [x, 0.44, 0], [0, 0, Math.PI / 2]);
        band.scale.set(1, 1, 0.5);
    }
    tbox(THREE, group, [0.08, 0.12, 0.02], [0, 0.38, depth / 2 + 0.01], f.metal);
    for (const x of [-width / 2 - 0.01, width / 2 + 0.01])
        tbox(THREE, group, [0.02, 0.05, 0.16], [x, 0.34, 0], f.metal);
}
function rockingChair(THREE, group, f) {
    // Two runners: shallow arcs the whole chair rocks on, laid as short curved segments touching the ground in the middle.
    const RUNNER_RADIUS = 1.5;
    const SEGMENTS = 8;
    const span = 0.94;
    for (const x of [-0.27, 0.27]) {
        for (let index = 0; index < SEGMENTS; index += 1) {
            const z0 = -span / 2 + (index / SEGMENTS) * span + 0.05;
            const z1 = -span / 2 + ((index + 1) / SEGMENTS) * span + 0.05;
            const lift = (z) => RUNNER_RADIUS - Math.sqrt(RUNNER_RADIUS * RUNNER_RADIUS - (z - 0.05) * (z - 0.05));
            const y0 = lift(z0) + 0.025;
            const y1 = lift(z1) + 0.025;
            const segment = tbox(THREE, group, [0.04, 0.045, Math.hypot(z1 - z0, y1 - y0) + 0.004], [x, (y0 + y1) / 2, (z0 + z1) / 2], f.end);
            segment.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
        }
    }
    const seatY = 0.44;
    tbox(THREE, group, [0.56, 0.05, 0.5], [0, seatY, 0.08], f.wood);
    for (const [x, z] of [[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.15], [0.25, -0.15]])
        tcylinder(THREE, group, 0.022, 0.022, seatY - 0.06, [x, (seatY - 0.06) / 2 + 0.05, z], f.end, 8);
    // The tall spindle back, leaning a touch, with a curved crest rail.
    const back = new THREE.Group();
    back.position.set(0, seatY, -0.17);
    back.rotation.x = -0.18;
    group.add(back);
    for (const x of [-0.26, 0.26])
        tcylinder(THREE, back, 0.026, 0.026, 0.72, [x, 0.36, 0], f.end, 8);
    for (let index = 0; index < 7; index += 1)
        tcylinder(THREE, back, 0.011, 0.011, 0.6, [-0.18 + index * 0.06, 0.32, 0], f.end, 6);
    tbox(THREE, back, [0.62, 0.08, 0.04], [0, 0.7, 0], f.wood);
    // The arms.
    for (const x of [-0.29, 0.29]) {
        tbox(THREE, group, [0.05, 0.03, 0.46], [x, 0.66, 0.06], f.wood);
        tcylinder(THREE, group, 0.016, 0.016, 0.22, [x, 0.55, 0.26], f.end, 6);
    }
}
function gardenArch(THREE, group, f, seed) {
    // The posts stand a hand in from the footprint's ends so the roses stay inside it.
    const half = 0.64;
    const height = 1.85;
    for (const x of [-half, half]) {
        for (const z of [-0.22, 0.22])
            tbox(THREE, group, [0.06, height, 0.06], [x, height / 2, z], f.end);
        // Lattice side panels.
        for (let y = 0.25; y < height - 0.1; y += 0.28)
            tbox(THREE, group, [0.025, 0.025, 0.44], [x, y, 0], f.wood);
        for (const z of [-0.11, 0, 0.11])
            tbox(THREE, group, [0.02, height - 0.2, 0.02], [x, (height - 0.2) / 2 + 0.1, z], f.wood);
    }
    // The arch itself: two half-rings of timber over the path, braced across.
    for (const z of [-0.22, 0.22])
        place(THREE, group, new THREE.TorusGeometry(half, 0.03, 6, 20, Math.PI), f.wood, [0, height, z]);
    for (let index = 1; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI;
        tbox(THREE, group, [0.025, 0.025, 0.5], [Math.cos(angle) * half, height + Math.sin(angle) * half, 0], f.end);
    }
    // Climbing roses on one side and over the top.
    const random = seededRandom(`arch-${seed}`);
    const leaves = surface(THREE, "#3f7f34", { roughness: 0.8 });
    const rose = surface(THREE, f.stars === 3 ? "#c8203c" : "#d8405a", { roughness: 0.6 });
    for (let index = 0; index < 26; index += 1) {
        const t = random();
        const onTop = t > 0.55;
        const angle = onTop ? random() * Math.PI * 0.6 : 0;
        const x = onTop ? -Math.cos(angle) * half : -half;
        const y = onTop ? height + Math.sin(angle) * half : 0.3 + t * (height - 0.3) / 0.55;
        const z = (random() - 0.5) * 0.46;
        tsphere(THREE, group, 0.07 + random() * 0.05, [x + (random() - 0.5) * 0.08, y, z], leaves, 7, 5);
        if (random() > 0.45)
            tsphere(THREE, group, 0.035, [x + (random() - 0.5) * 0.1, y + 0.03, z + (random() > 0.5 ? 0.06 : -0.06)], rose, 8, 6);
    }
}
function porchSwing(THREE, group, f, oak) {
    const height = 2.1;
    // The oak A-frame at each end and the beam across.
    for (const x of [-1.02, 1.02]) {
        for (const side of [-1, 1]) {
            // Splayed legs: as long as the frame is tall, so the tilt keeps both feet on the ground.
            const leg = tbox(THREE, group, [0.08, height, 0.09], [x, height / 2, side * 0.3], oak.end);
            leg.rotation.x = side * 0.27;
        }
        tbox(THREE, group, [0.06, 0.07, 0.84], [x, 0.5, 0], oak.end);
    }
    tbox(THREE, group, [2.18, 0.12, 0.12], [0, height, 0], oak.wood);
    // The willow swing, hung on four chains.
    const seatY = 0.5;
    for (let index = 0; index < 5; index += 1)
        tbox(THREE, group, [1.5, 0.035, 0.09], [0, seatY, -0.17 + index * 0.095], f.wood);
    for (let index = 0; index < 4; index += 1)
        tbox(THREE, group, [1.5, 0.08, 0.03], [0, seatY + 0.15 + index * 0.11, -0.25], f.wood);
    for (const x of [-0.76, 0.76]) {
        tbox(THREE, group, [0.04, 0.24, 0.5], [x, seatY + 0.12, 0], f.end);
        for (const z of [-0.2, 0.2]) {
            const top = height - 0.06;
            const bottom = seatY + 0.25;
            tcylinder(THREE, group, 0.008, 0.008, top - bottom, [x, (top + bottom) / 2, z], f.metal, 5, false);
        }
    }
}
function grandfatherClock(THREE, group, f) {
    tbox(THREE, group, [0.56, 0.5, 0.36], [0, 0.25, 0], f.wood);
    tbox(THREE, group, [0.44, 1.02, 0.28], [0, 1.01, -0.02], f.wood);
    tbox(THREE, group, [0.56, 0.52, 0.36], [0, 1.78, 0], f.wood);
    tbox(THREE, group, [0.6, 0.06, 0.4], [0, 2.06, 0], f.end);
    tbox(THREE, group, [0.6, 0.05, 0.4], [0, 0.52, 0], f.end);
    // The dial with its hours, and the hands at ten past ten.
    const faceZ = 0.181;
    place(THREE, group, new THREE.CircleGeometry(0.19, 28), surface(THREE, "#f4ecd6", { roughness: 0.5, flat: false }), [0, 1.8, faceZ]);
    place(THREE, group, new THREE.TorusGeometry(0.19, 0.012, 6, 28), f.metal, [0, 1.8, faceZ + 0.004]);
    const ink = surface(THREE, "#1b140e", { roughness: 0.6 });
    for (let hour = 0; hour < 12; hour += 1) {
        const angle = (hour / 12) * Math.PI * 2;
        tbox(THREE, group, [0.012, 0.03, 0.004], [Math.sin(angle) * 0.155, 1.8 + Math.cos(angle) * 0.155, faceZ + 0.003], ink, false).rotation.z = -angle;
    }
    for (const [length, angle] of [[0.1, -0.52], [0.14, 1.05]]) {
        const hand = tbox(THREE, group, [0.012, length, 0.004], [Math.sin(angle) * length / 2, 1.8 + Math.cos(angle) * length / 2, faceZ + 0.008], ink, false);
        hand.rotation.z = -angle;
    }
    // A glass door over the waist, the brass pendulum and weights behind it.
    place(THREE, group, new THREE.PlaneGeometry(0.3, 0.84), surface(THREE, "#cfe3ea", { roughness: 0.05, opacity: 0.28, flat: false }), [0, 1.02, 0.125]);
    const brass = surface(THREE, "#c9a85a", { roughness: 0.25, metalness: 0.9, flat: false });
    tcylinder(THREE, group, 0.006, 0.006, 0.62, [0, 1.16, 0.08], brass, 5, false);
    place(THREE, group, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), brass, [0, 0.82, 0.08], [Math.PI / 2, 0, 0]);
    for (const x of [-0.09, 0.09])
        tcylinder(THREE, group, 0.025, 0.025, 0.18, [x, 1.3, 0.04], brass, 10, false);
    // The hood's broken pediment and finial.
    for (const side of [-1, 1])
        tbox(THREE, group, [0.24, 0.05, 0.38], [side * 0.14, 2.13, 0], f.end).rotation.z = -side * 0.35;
    tsphere(THREE, group, 0.035, [0, 2.2, 0], f.stars === 3 ? f.metal : f.end, 10, 8);
}
const PIECES = Object.freeze({
    "furniture-crate": (THREE, group, finish) => crate(THREE, group, finish),
    "furniture-planter-box": planterBox,
    "furniture-stool": (THREE, group, finish) => stool(THREE, group, finish),
    "furniture-chair": (THREE, group, finish) => chair(THREE, group, finish),
    "furniture-table": (THREE, group, finish) => table(THREE, group, finish),
    "furniture-birdhouse": (THREE, group, finish) => birdhouse(THREE, group, finish),
    "furniture-bookshelf": bookshelf,
    "furniture-picnic-table": (THREE, group, finish) => picnicTable(THREE, group, finish),
    "furniture-storage-chest": (THREE, group, finish) => storageChest(THREE, group, finish),
    "furniture-rocking-chair": (THREE, group, finish) => rockingChair(THREE, group, finish),
    "furniture-garden-arch": gardenArch,
    "furniture-porch-swing": (THREE, group, finish) => porchSwing(THREE, group, finish, pieceFinish(THREE, "oak", finish.stars)),
    "furniture-grandfather-clock": (THREE, group, finish) => grandfatherClock(THREE, group, finish),
});
/** The model names this file draws furniture for. */
export function furnitureModelNames() {
    return Object.keys(PIECES);
}
/** A piece of furniture, in the wood of its pattern and the finish of its stars. */
export function createFurniturePiece(THREE, model, itemId, stars, seed = 1) {
    const build = PIECES[model];
    if (!build)
        throw new Error(`No furniture draws ${model}`);
    const group = new THREE.Group();
    build(THREE, group, pieceFinish(THREE, speciesOf(itemId), stars), seed);
    group.userData.pieceStars = stars;
    return group;
}
export function createWorkbench(THREE) {
    const group = new THREE.Group();
    const top = farmMaterial(THREE, "wood", { colors: ["#b98a55", "#6f4a2d", "#d2a878"], metresPerTile: 0.8 });
    const frame = farmMaterial(THREE, "wood", { colors: ["#8a5a34", "#4a2e18", "#a8764a"], metresPerTile: 0.8 });
    const iron = surface(THREE, "#3b444a", { roughness: 0.5, metalness: 0.6, flat: false });
    // A thick top, square legs, stretchers and a lower shelf of offcuts.
    tbox(THREE, group, [2, 0.09, 0.76], [0, 0.86, 0], top);
    for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]])
        tbox(THREE, group, [0.09, 0.82, 0.09], [x, 0.41, z], frame);
    tbox(THREE, group, [1.8, 0.04, 0.6], [0, 0.18, 0], frame);
    for (let index = 0; index < 4; index += 1)
        tbox(THREE, group, [0.5 + index * 0.1, 0.03, 0.1], [-0.4 + index * 0.25, 0.215 + (index % 2) * 0.03, -0.1 + index * 0.08], top, false);
    // The vice on the front left, its screw and handle.
    tbox(THREE, group, [0.3, 0.16, 0.06], [-0.68, 0.8, 0.41], frame);
    tcylinder(THREE, group, 0.018, 0.018, 0.2, [-0.68, 0.8, 0.49], iron, 8).rotation.x = Math.PI / 2;
    tcylinder(THREE, group, 0.01, 0.01, 0.24, [-0.68, 0.8, 0.58], iron, 6).rotation.z = Math.PI / 2;
    // The tool board at the back, with the saw, the hammer, the square and a chalk line on their pegs.
    tbox(THREE, group, [2, 0.9, 0.04], [0, 1.36, -0.36], frame);
    const blade = surface(THREE, "#b9bec4", { roughness: 0.3, metalness: 0.8, flat: false });
    const saw = new THREE.Shape();
    saw.moveTo(0, 0);
    saw.lineTo(0.5, 0.06);
    saw.lineTo(0.5, 0.16);
    saw.lineTo(0, 0.13);
    saw.closePath();
    place(THREE, group, new THREE.ShapeGeometry(saw), blade, [-0.75, 1.3, -0.335]);
    tbox(THREE, group, [0.14, 0.1, 0.03], [-0.2, 1.35, -0.33], frame);
    tcylinder(THREE, group, 0.014, 0.014, 0.34, [0.25, 1.36, -0.32], frame, 6);
    tbox(THREE, group, [0.1, 0.045, 0.045], [0.25, 1.54, -0.32], iron);
    tbox(THREE, group, [0.3, 0.03, 0.01], [0.62, 1.52, -0.335], blade);
    tbox(THREE, group, [0.03, 0.22, 0.01], [0.485, 1.42, -0.335], blade);
    // Shavings on the top.
    const shavings = surface(THREE, "#e6c894", { roughness: 0.9 });
    for (const [x, z] of [[0.55, -0.15], [0.7, 0.05], [0.45, 0.2]])
        place(THREE, group, new THREE.TorusGeometry(0.03, 0.008, 4, 10, 4.5), shavings, [x, 0.915, z], [Math.PI / 2, 0, x * 3]);
    // The board being worked, and what the games leave on it (WorkbenchHandle).
    const { board } = WORKBENCH_ANCHORS;
    const work = new THREE.Group();
    work.position.set(board.x, board.y, board.z);
    work.visible = false;
    group.add(work);
    const halves = [-1, 1].map((side) => {
        const half = tbox(THREE, work, [0.46, 0.035, 0.2], [side * 0.235, 0, 0], top);
        return half;
    });
    const pencil = surface(THREE, "#2b2b2b", { roughness: 0.8 });
    const marks = [0, 1, 2].map((index) => {
        const mark = tbox(THREE, work, [0.006, 0.002, 0.16], [-0.3 + index * 0.3, 0.019, 0], pencil, false);
        mark.visible = false;
        return mark;
    });
    const nails = [0, 1, 2].map((index) => {
        const head = tcylinder(THREE, work, 0.012, 0.012, 0.006, [-0.25 + index * 0.25, 0.02, 0.04], iron, 8, false);
        head.visible = false;
        return head;
    });
    let stage = "idle";
    const handle = Object.freeze({
        setWork(next) {
            stage = next;
            work.visible = next !== "idle";
            // Sawn in two from the saw on, set back together (and nailed) at the end.
            for (const [index, half] of halves.entries())
                half.position.x = (index ? 1 : -1) * (next === "saw" ? 0.25 : 0.235);
            if (next === "idle" || next === "measure") {
                for (const mark of marks)
                    mark.visible = false;
                for (const nail of nails)
                    nail.visible = false;
            }
        },
        setProgress(done) {
            if (stage === "measure")
                marks.forEach((mark, index) => { mark.visible = index < done; });
            if (stage === "saw")
                for (const [index, half] of halves.entries())
                    half.position.x = (index ? 1 : -1) * (0.235 + Math.min(1, done / 8) * 0.03);
            if (stage === "nail")
                nails.forEach((nail, index) => { nail.visible = index < done; });
        },
    });
    group.userData.workbench = handle;
    return group;
}
// ---------------------------------------------------------------- the sawmill
/** The farm's own Sawmill: an open shed over a log carriage and a spinning blade. */
export function createSawmill(THREE) {
    const group = new THREE.Group();
    const frame = farmMaterial(THREE, "wood", { colors: ["#7a5534", "#3e2716", "#9a7248"], metresPerTile: 0.8 });
    const roof = farmMaterial(THREE, "corrugated", { colors: ["#8e9aa3", "#5f6b73", "#a9b3ba", "#8a5a34"], doubleSided: true });
    const iron = surface(THREE, "#3b444a", { roughness: 0.5, metalness: 0.6, flat: false });
    const steel = surface(THREE, "#c3c9ce", { roughness: 0.22, metalness: 0.9, flat: false });
    // Four posts and a lean-to roof.
    for (const [x, z] of [[-1.6, -0.7], [1.6, -0.7], [-1.6, 0.7], [1.6, 0.7]])
        tbox(THREE, group, [0.12, z < 0 ? 2.5 : 2.2, 0.12], [x, (z < 0 ? 2.5 : 2.2) / 2, z], frame);
    const lid = tbox(THREE, group, [3.5, 0.04, 1.8], [0, 2.38, 0], roof);
    lid.rotation.x = 0.17;
    // The carriage: a long bed on trestles, a log riding it, the blade through the middle.
    tbox(THREE, group, [3.1, 0.08, 0.5], [0, 0.78, 0], frame);
    for (const x of [-1.3, -0.4, 0.4, 1.3])
        tbox(THREE, group, [0.08, 0.74, 0.44], [x, 0.37, 0], frame);
    for (const z of [-0.2, 0.2])
        tbox(THREE, group, [3.1, 0.03, 0.03], [0, 0.835, z], iron);
    const bark = farmMaterial(THREE, "bark");
    const log = tcylinder(THREE, group, 0.2, 0.2, 1.2, [-0.9, 1.04, 0], bark, 14);
    log.rotation.z = Math.PI / 2;
    place(THREE, group, new THREE.CircleGeometry(0.19, 14), farmMaterial(THREE, "wood", { colors: ["#d2a878", "#8a6238", "#e6c894"], metresPerTile: 0.3 }), [-0.3, 1.04, 0], [0, Math.PI / 2, 0]);
    // The blade in its guard, the motor housing and belt.
    const blade = new THREE.Group();
    blade.position.set(0.15, 0.92, 0);
    group.add(blade);
    place(THREE, blade, new THREE.CylinderGeometry(0.38, 0.38, 0.012, 32), steel, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let tooth = 0; tooth < 24; tooth += 1) {
        const angle = (tooth / 24) * Math.PI * 2;
        tbox(THREE, blade, [0.035, 0.03, 0.013], [Math.cos(angle) * 0.39, Math.sin(angle) * 0.39, 0], steel, false).rotation.z = angle + 0.4;
    }
    tcylinder(THREE, blade, 0.05, 0.05, 0.05, [0, 0, 0], iron, 12).rotation.x = Math.PI / 2;
    tbox(THREE, group, [0.9, 0.3, 0.1], [0.15, 1.42, -0.1], surface(THREE, "#b8452f", { roughness: 0.5, flat: false }));
    tbox(THREE, group, [0.5, 0.4, 0.4], [0.15, 0.35, -0.5], surface(THREE, "#3f7228", { roughness: 0.55, metalness: 0.3, flat: false }));
    tcylinder(THREE, group, 0.02, 0.02, 0.6, [0.15, 0.64, -0.3], iron, 6).rotation.x = 0.5;
    // Planks stacked at the out end, and sawdust under the blade.
    const plank = farmMaterial(THREE, "wood", { colors: ["#d2a878", "#8a6238", "#e6c894"], metresPerTile: 0.8 });
    for (let row = 0; row < 3; row += 1)
        for (let index = 0; index < 3 - row; index += 1) {
            tbox(THREE, group, [1.1, 0.04, 0.16], [1.05, 0.02 + row * 0.045, 0.45 + index * 0.17 + row * 0.08 - 0.3], plank);
        }
    place(THREE, group, new THREE.SphereGeometry(0.35, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, "#e6c894", { roughness: 1 }), [0.2, 0, 0.1], [0, 0, 0], [1, 0.25, 0.8]);
    let spin = 0;
    return Object.freeze({
        group,
        animate(dt) {
            spin = (spin + dt * 9) % (Math.PI * 2);
            blade.rotation.z = -spin;
        },
    });
}
