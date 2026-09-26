// The farm's props, built from the room's decor primitives and the farm's
// own materials: fences, ponds and the yard props, plus the table that
// indexes EVERY builder — these, the buildings in `farm-props-buildings.mts`
// and the plants in `farm-props-plants.mts` — by the catalog's `model` name.
// No art assets — a prop is boxes, cylinders and spheres, the same way every
// room prop is — but nothing is a flat colour either: a rail is grained
// timber, a wall is fieldstone, a bale is straw and a trough is galvanised
// steel, all from `farm-materials.mts` with their tiles in metres.
//
// Every builder centres its model on its footprint (x/z) with its base on the
// ground (y = 0), so `farm-world.mts` places it by `position.set(x, 0, z)` and
// `rotation.y` and nothing else. A stretchable item (a fence) is built for the
// row's length and rebuilt when it changes; a pond is sized to its footprint
// and dug to its depth — its model reaches BELOW y = 0, into the hole the
// world cuts in the field for it.
//
// `FARM_PROP_BUILDERS` is the table the catalog's `model` names index; a
// test asserts every row names a builder.
import { box, cylinder, sphere, standard } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, scaleUvs, tbox, tcylinder, tsphere } from "./farm-materials.mjs";
import { farmDecorFootprint } from "./farm-catalog/decor.mjs";
import { FARM_BUILDING_BUILDERS } from "./farm-props-buildings.mjs";
import { FARM_DWELLING_BUILDERS } from "./farm-props-dwellings.mjs";
import { WATERLINE_RADIUS, WATER_LEVEL, pondProfile } from "./farm-pond.mjs";
import { createAppleTree, createBirch, createBush, createFlowerBed, createLavender, createPine, createPumpkinPatch, createSoilPatch, createStump, createSunflowers, createTree, createVegRows, createWheat, createWillow } from "./farm-props-plants.mjs";
export { createBarn } from "./farm-props-buildings.mjs";
export { createTree, createPine, createBush } from "./farm-props-plants.mjs";
const WOOD = "#8a5a34";
const WOOD_DARK = "#5d3a1f";
const BARN_TRIM = "#f1e6d2";
const WATER = "#3f7fb8";
/** Grained timber in a colour. */
function timber(THREE, color = WOOD, metresPerTile = 1.2) {
    return farmMaterial(THREE, "wood", { colors: [color, "#2f1c0c", "#9a7248"], metresPerTile });
}
/** Painted timber: the grain shows faintly through the paint. */
function painted(THREE, color) {
    return farmMaterial(THREE, "wood", { colors: [color, "#8a8070", "#ffffff"], metresPerTile: 1.2, bumpScale: 0.006 });
}
function ironMaterial(THREE) {
    return standard(THREE, "#2b2b2b", 0.5, 0.6);
}
function strawMaterial(THREE, metresPerTile = 0.6) {
    return farmMaterial(THREE, "straw", { metresPerTile });
}
function stoneMaterial(THREE, metresPerTile = 1.2) {
    return farmMaterial(THREE, "fieldstone", { metresPerTile });
}
function waterMaterial(THREE, opacity = 0.86) {
    return new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.1, metalness: 0.2, transparent: true, opacity });
}
/** A rectangular hay bale: straw all over, two twine bands, and the cut ends a shade paler. */
export function createHayBale(THREE) {
    const group = new THREE.Group();
    const hay = strawMaterial(THREE);
    tbox(THREE, group, [1.4, 0.8, 1], [0, 0.4, 0], hay);
    const ends = farmMaterial(THREE, "straw", { colors: ["#e0c060", "#b08b2f", "#f4dc88"], metresPerTile: 0.4 });
    tbox(THREE, group, [0.02, 0.76, 0.96], [0.7, 0.4, 0], ends, false);
    tbox(THREE, group, [0.02, 0.76, 0.96], [-0.7, 0.4, 0], ends, false);
    // Two twine bands.
    const twine = standard(THREE, "#c9a03a", 0.9, 0);
    for (const x of [-0.42, 0.42]) {
        box(THREE, group, [0.03, 0.82, 1.02], [x, 0.4, 0], twine, false);
    }
    // A few loose wisps on top.
    for (let index = 0; index < 6; index += 1) {
        const wisp = box(THREE, group, [0.3, 0.01, 0.02], [-0.5 + index * 0.2, 0.81, -0.3 + (index % 3) * 0.3], twine, false);
        wisp.rotation.y = index * 0.7;
    }
    return group;
}
/** A galvanised water trough: a ribbed tub on two skids with a float valve, and water in it. */
export function createTrough(THREE) {
    const group = new THREE.Group();
    const steel = farmMaterial(THREE, "corrugated", { colors: ["#9aa2a8", "#6f7780", "#4a5058", "#8a5a2a"], metresPerTile: 0.6 });
    const rim = standard(THREE, "#7e8790", 0.45, 0.6);
    // Skids, then the tub: a floor and four ribbed walls, with a rolled rim on top.
    for (const z of [-0.28, 0.28])
        tbox(THREE, group, [1.6, 0.06, 0.08], [0, 0.03, z], timber(THREE, WOOD_DARK), false);
    tbox(THREE, group, [1.8, 0.06, 0.7], [0, 0.09, 0], rim);
    tbox(THREE, group, [1.8, 0.5, 0.05], [0, 0.34, -0.325], steel);
    tbox(THREE, group, [1.8, 0.5, 0.05], [0, 0.34, 0.325], steel);
    tbox(THREE, group, [0.05, 0.5, 0.7], [-0.875, 0.34, 0], steel);
    tbox(THREE, group, [0.05, 0.5, 0.7], [0.875, 0.34, 0], steel);
    for (const [w, x, z, rot] of [[1.84, 0, -0.325, 0], [1.84, 0, 0.325, 0], [0.74, -0.875, 0, Math.PI / 2], [0.74, 0.875, 0, Math.PI / 2]]) {
        const lip = cylinder(THREE, group, 0.03, 0.03, w, [x, 0.6, z], rim, 8, false);
        lip.rotation.z = Math.PI / 2;
        lip.rotation.y = rot;
    }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.6), waterMaterial(THREE));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.5;
    group.add(water);
    // A float valve at one end.
    cylinder(THREE, group, 0.02, 0.02, 0.4, [0.7, 0.55, -0.2], rim, 6, false).rotation.z = Math.PI / 2;
    sphere(THREE, group, 0.07, [0.55, 0.52, -0.2], standard(THREE, "#d8a020", 0.5, 0.3));
    return group;
}
/**
 * A run of post-and-rail fence `length` metres long along local +x, centred on
 * the group. Posts every ~2 m with capped tops; two rails let into them.
 */
export function createFenceRun(THREE, length) {
    const group = new THREE.Group();
    const post = timber(THREE, WOOD);
    const rail = timber(THREE, WOOD_DARK);
    const { count, step } = postSpacing(length, 2);
    for (let index = 0; index < count; index += 1) {
        const x = -length / 2 + index * step;
        tbox(THREE, group, [0.14, 1.15, 0.14], [x, 0.575, 0], post);
        const cap = tbox(THREE, group, [0.18, 0.05, 0.18], [x, 1.17, 0], post, false);
        cap.castShadow = false;
    }
    for (let index = 0; index < count - 1; index += 1) {
        const centre = -length / 2 + index * step + step / 2;
        tbox(THREE, group, [step - 0.06, 0.1, 0.06], [centre, 0.95, 0], rail);
        tbox(THREE, group, [step - 0.06, 0.1, 0.06], [centre, 0.55, 0], rail);
        // Nail heads where the rails meet the posts.
        for (const x of [centre - step / 2 + 0.08, centre + step / 2 - 0.08])
            for (const y of [0.95, 0.55])
                sphere(THREE, group, 0.012, [x, y, 0.035], ironMaterial(THREE)).castShadow = false;
    }
    return group;
}
function postSpacing(length, spacing) {
    const count = Math.max(2, Math.round(length / spacing) + 1);
    return { count, step: length / (count - 1) };
}
/** A white picket fence: close pickets with pointed tops on two rails, on posts with finials. */
export function createPicketFence(THREE, length) {
    const group = new THREE.Group();
    const paint = painted(THREE, BARN_TRIM);
    const shade = painted(THREE, "#d9cdb5");
    const { count, step } = postSpacing(length, 0.3);
    for (let index = 0; index < count; index += 1) {
        const x = -length / 2 + index * step;
        tbox(THREE, group, [0.09, 0.9, 0.04], [x, 0.45, 0], paint);
        // A pointed cap: a thin pyramid-ish box turned 45°.
        const cap = box(THREE, group, [0.064, 0.064, 0.04], [x, 0.93, 0], paint, false);
        cap.rotation.z = Math.PI / 4;
    }
    tbox(THREE, group, [length, 0.07, 0.03], [0, 0.72, 0.03], shade);
    tbox(THREE, group, [length, 0.07, 0.03], [0, 0.32, 0.03], shade);
    // A post with a finial every couple of metres.
    const posts = postSpacing(length, 2);
    for (let index = 0; index < posts.count; index += 1) {
        const x = -length / 2 + index * posts.step;
        tbox(THREE, group, [0.12, 1.05, 0.12], [x, 0.525, 0], paint);
        sphere(THREE, group, 0.07, [x, 1.11, 0], paint);
    }
    return group;
}
/** A dry-stone wall: one fieldstone run with an uneven top of capstones and the odd stone proud of the face. */
export function createStoneWall(THREE, length) {
    const group = new THREE.Group();
    const stone = stoneMaterial(THREE, 0.9);
    const height = 0.96;
    tbox(THREE, group, [length, height, 0.46], [0, height / 2, 0], stone);
    // Capstones set on edge along the top, each a little different.
    for (let x = -length / 2; x < length / 2; x += 0.34) {
        const w = Math.min(0.3, length / 2 - x);
        if (w <= 0.05)
            break;
        const cap = tbox(THREE, group, [w, 0.16 + ((Math.round(x * 10) % 3) * 0.03), 0.5], [x + w / 2, height + 0.06, 0], stone);
        cap.rotation.x = ((Math.round(x * 7) % 5) - 2) * 0.05;
    }
    // Stones standing proud of the faces.
    for (let x = -length / 2 + 0.25; x < length / 2 - 0.2; x += 0.55) {
        const side = Math.round(x * 3) % 2 ? 1 : -1;
        const bump = tsphere(THREE, group, 0.12, [x, 0.2 + ((Math.round(x * 5) % 3) * 0.25), side * 0.2], stone, 8, 6);
        bump.scale.set(1.2, 0.7, 0.6);
    }
    return group;
}
/**
 * The gate: two tall posts and a hinged panel of rails and a diagonal brace.
 * The panel is a door on the buildings' own contract — `setOpen` starts the
 * swing (outward, toward the row's +z), `update(dt)` eases it — and the scene
 * drops the gate's box from the obstacle list while it stands open.
 */
export function createGate(THREE) {
    const group = new THREE.Group();
    const post = timber(THREE, WOOD);
    const rail = timber(THREE, WOOD_DARK);
    const metal = ironMaterial(THREE);
    const width = 2.4;
    for (const x of [-width / 2, width / 2]) {
        tbox(THREE, group, [0.18, 1.35, 0.18], [x, 0.675, 0], post);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.14, 4), post);
        cap.position.set(x, 1.42, 0);
        cap.rotation.y = Math.PI / 4;
        group.add(cap);
    }
    const hinge = new THREE.Group();
    const leafWidth = width - 0.3;
    for (const y of [0.3, 0.62, 0.94])
        tbox(THREE, hinge, [leafWidth, 0.09, 0.06], [leafWidth / 2, y, 0], rail);
    tbox(THREE, hinge, [0.09, 0.8, 0.06], [0.08, 0.62, 0.035], rail);
    tbox(THREE, hinge, [0.09, 0.8, 0.06], [leafWidth - 0.08, 0.62, 0.035], rail);
    const brace = tbox(THREE, hinge, [0.08, Math.hypot(leafWidth, 0.64) - 0.2, 0.05], [leafWidth / 2, 0.62, 0.07], rail, false);
    brace.rotation.z = Math.atan2(leafWidth, 0.64);
    // Strap hinges on the post side, a latch on the other.
    for (const y of [0.3, 0.94]) {
        box(THREE, hinge, [0.5, 0.05, 0.015], [0.3, y, 0.04], metal, false);
        box(THREE, hinge, [0.05, 0.12, 0.05], [-0.05, y, 0], metal, false);
    }
    box(THREE, hinge, [0.16, 0.04, 0.03], [leafWidth - 0.02, 0.66, 0.05], metal, false);
    hinge.position.set(-width / 2 + 0.12, 0, 0);
    group.add(hinge);
    let open = false;
    let swing = 0;
    const doors = Object.freeze({
        setOpen(next) { open = next; },
        isOpen: () => open,
        update(dt) {
            const target = open ? 1 : 0;
            if (swing === target)
                return false;
            swing = target > swing ? Math.min(target, swing + dt * GATE_SWING_SPEED) : Math.max(target, swing - dt * GATE_SWING_SPEED);
            const eased = swing * swing * (3 - 2 * swing);
            // The leaf runs from the hinge toward +x; a negative turn about y carries that edge to +z, out through the fence line.
            hinge.rotation.y = -eased * GATE_SWING;
            return swing !== target;
        },
    });
    return Object.freeze({ group, doors });
}
const GATE_SWING = 1.7;
const GATE_SWING_SPEED = 1.6;
/** A split-rail fence: rough rails resting in crossed posts, the way a pioneer fence goes up. */
export function createSplitRail(THREE, length) {
    const group = new THREE.Group();
    const rail = farmMaterial(THREE, "bark", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 0.5, bumpScale: 0.02 });
    const dark = farmMaterial(THREE, "bark", { colors: [WOOD_DARK, "#2f1c0c", "#8a6240"], metresPerTile: 0.5, bumpScale: 0.02 });
    const { count, step } = postSpacing(length, 2.2);
    for (let index = 0; index < count; index += 1) {
        const x = -length / 2 + index * step;
        for (const sign of [1, -1]) {
            const post = tcylinder(THREE, group, 0.06, 0.07, 1.4, [x, 0.62, 0], dark, 7);
            post.rotation.x = sign * 0.32;
        }
    }
    for (let index = 0; index < count - 1; index += 1) {
        const centre = -length / 2 + index * step + step / 2;
        for (const [y, z] of [[0.35, 0.0], [0.72, 0.05], [1.05, -0.04]]) {
            const bar = tcylinder(THREE, group, 0.05, 0.06, step + 0.2, [centre, y, z], index % 2 ? rail : dark, 7);
            bar.rotation.z = Math.PI / 2;
        }
    }
    return group;
}
/** A wire fence: slim posts with four strands of wire between them, barbed. */
export function createWireFence(THREE, length) {
    const group = new THREE.Group();
    const post = timber(THREE, WOOD);
    const wire = standard(THREE, "#b9bec4", 0.4, 0.7);
    const { count, step } = postSpacing(length, 2.5);
    for (let index = 0; index < count; index += 1) {
        tbox(THREE, group, [0.1, 1.2, 0.1], [-length / 2 + index * step, 0.6, 0], post);
        for (const y of [0.3, 0.6, 0.9, 1.15])
            sphere(THREE, group, 0.014, [-length / 2 + index * step, y, 0.055], wire).castShadow = false;
    }
    for (const y of [0.3, 0.6, 0.9, 1.15]) {
        const strand = cylinder(THREE, group, 0.008, 0.008, length, [0, y, 0], wire, 4, false);
        strand.rotation.z = Math.PI / 2;
        for (let x = -length / 2 + 0.3; x < length / 2; x += 0.5) {
            const barb = box(THREE, group, [0.04, 0.04, 0.008], [x, y, 0], wire, false);
            barb.rotation.z = Math.PI / 4;
        }
    }
    return group;
}
/** A hedgerow: a clipped run of dense leaf, its top a row of overlapping mounds, taller than the animals and solid to the walker. */
export function createHedgeRow(THREE, length) {
    const group = new THREE.Group();
    const leaves = farmMaterial(THREE, "foliage", { colors: ["#3f8a46", "#245420", "#6fb24c"], metresPerTile: 0.6 });
    const dark = farmMaterial(THREE, "foliage", { colors: ["#2b6331", "#173a1c", "#4f9a3a"], metresPerTile: 0.6 });
    tbox(THREE, group, [length, 0.9, 0.6], [0, 0.45, 0], leaves);
    const bumps = Math.max(2, Math.round(length / 0.45));
    for (let index = 0; index < bumps; index += 1) {
        const x = -length / 2 + (index + 0.5) * (length / bumps);
        const blob = tsphere(THREE, group, 0.36, [x, 0.9, (index % 2 ? 0.08 : -0.08)], index % 3 === 0 ? dark : leaves, 12, 10);
        blob.scale.y = 0.75;
        tsphere(THREE, group, 0.3, [x, 0.4, index % 2 ? -0.28 : 0.28], index % 2 ? dark : leaves, 12, 10);
        tsphere(THREE, group, 0.26, [x + 0.15, 0.62, index % 2 ? 0.26 : -0.26], leaves, 10, 8);
    }
    // Woody stems showing at the foot.
    for (let x = -length / 2 + 0.3; x < length / 2; x += 0.6)
        cylinder(THREE, group, 0.03, 0.04, 0.3, [x, 0.12, 0], timber(THREE, WOOD_DARK), 6, false);
    return group;
}
/**
 * A pond DUG INTO the field, sized to its footprint and as deep as its row
 * says. The basin is one mesh sampled from `farm-pond.mts`'s profile — the
 * same heights the player's feet and the swimmers read — running from the
 * grass at the rim down the bank, across the shore shelf and down the slope
 * to the bed; `farm-world.mts` cuts the field away over the same ellipse, so
 * this bowl is the only ground there. Its colour follows the depth: grass at
 * the lip, earth on the bank, sand on the shelf, silt in the deep. The water
 * is a flat, rippling, see-through surface at `WATER_LEVEL` that meets the
 * bank at the waterline, seen from above and from below. Stones sit on the
 * lip, reeds stand on the shelf with their roots in the water, and weed grows
 * on the bed — each at the height the profile gives its spot.
 */
export function createPond(THREE, width, depth, pondDepth) {
    const group = new THREE.Group();
    const a = width / 2;
    const b = depth / 2;
    const floorAt = (r) => pondProfile(r, pondDepth);
    // The basin: rings of the ellipse from the centre to the rim, finer near the rim where the bank is steep.
    const rings = 44;
    const segments = 72;
    const radii = [];
    for (let ring = 0; ring <= rings; ring += 1) {
        const t = ring / rings;
        radii.push(1 - (1 - t) * (1 - t) * 0.35 - (1 - t) * 0.65);
    }
    const positions = [];
    const uvs = [];
    const colors = [];
    const grassTone = new THREE.Color("#6f9a45");
    const bankTone = new THREE.Color("#8a6a45");
    const sandTone = new THREE.Color("#b7a57c");
    const siltTone = new THREE.Color("#3b3d2c");
    const tone = new THREE.Color();
    const tilesPerMetre = 1 / 1.2;
    for (const r of radii) {
        const y = floorAt(r);
        if (y >= WATER_LEVEL + 0.04) {
            // Dry bank: earth, turning to grass over the last hand of the lip.
            tone.copy(bankTone).lerp(grassTone, Math.min(1, Math.max(0, (r - 0.955) / 0.045)));
        }
        else {
            // The wet margin and under water: sand on the shelf, darkening to silt with depth.
            const deep = Math.min(1, Math.max(0, WATER_LEVEL - y) / Math.max(0.5, pondDepth + WATER_LEVEL));
            tone.copy(sandTone).lerp(siltTone, Math.pow(deep, 0.7));
        }
        for (let segment = 0; segment <= segments; segment += 1) {
            const angle = (segment / segments) * Math.PI * 2;
            const x = Math.cos(angle) * r * a;
            const z = Math.sin(angle) * r * b;
            positions.push(x, y, z);
            uvs.push(x * tilesPerMetre, z * tilesPerMetre);
            colors.push(tone.r, tone.g, tone.b);
        }
    }
    const indices = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring += 1) {
        for (let segment = 0; segment < segments; segment += 1) {
            const inner = ring * stride + segment;
            const outer = inner + stride;
            // Wound so the faces look up out of the bowl.
            indices.push(inner, inner + 1, outer, outer, inner + 1, outer + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Its own copy of the soil tile: the vertex colours tint it, and the shared cached material must not change.
    const soil = farmMaterial(THREE, "soil", { colors: ["#d8cdb8", "#a89a80", "#efe6d2"], metresPerTile: 1.2 });
    const basinMaterial = typeof soil.clone === "function" ? soil.clone() : soil;
    basinMaterial.vertexColors = true;
    const basin = new THREE.Mesh(geometry, basinMaterial);
    basin.name = "pond-basin";
    basin.receiveShadow = true;
    group.add(basin);
    // The water: a flat surface that runs a little into the bank, so the bank is what draws the shoreline.
    const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 64), waterSurfaceMaterial(THREE));
    surface.name = "pond-water";
    surface.scale.set(a * WATERLINE_RADIUS + 0.04, b * WATERLINE_RADIUS + 0.04, 1);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = WATER_LEVEL;
    surface.renderOrder = 2;
    group.add(surface);
    // Stones on the lip, bedded into it at the profile's height.
    const stone = stoneMaterial(THREE, 0.5);
    const count = Math.max(10, Math.round((width + depth) * 2));
    for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + 0.1;
        const jitter = ((index * 37) % 7) / 7;
        const r = 0.965 + (index % 3) * 0.012;
        const pebble = tsphere(THREE, group, 0.08 + jitter * 0.1, [Math.cos(angle) * r * a, floorAt(r) + 0.03, Math.sin(angle) * r * b], stone, 8, 6);
        pebble.scale.set(1.3, 0.55, 1);
        pebble.rotation.y = angle;
    }
    // Grass tufts just past the rim, where the field meets the bank.
    const grass = farmMaterial(THREE, "foliage", { colors: ["#5f9a3c", "#3a6a28", "#8fc45a"], metresPerTile: 0.6 });
    const tufts = Math.max(12, Math.round((width + depth) * 3));
    for (let index = 0; index < tufts; index += 1) {
        const angle = (index / tufts) * Math.PI * 2;
        const tuft = tsphere(THREE, group, 0.12 + ((index * 5) % 3) * 0.03, [Math.cos(angle) * (a + 0.06), 0.04, Math.sin(angle) * (b + 0.06)], grass, 8, 6);
        tuft.scale.y = 0.55;
    }
    // Reeds on the shelf at one end: rooted under water, standing out of it.
    const reed = standard(THREE, "#5a7a34", 0.9, 0);
    const head = standard(THREE, "#5a3d24", 0.9, 0);
    for (let index = 0; index < 9; index += 1) {
        const angle = 3.5 + index * 0.13;
        const r = 0.9 + (index % 3) * 0.015;
        const x = Math.cos(angle) * r * a;
        const z = Math.sin(angle) * r * b;
        const root = floorAt(r);
        const height = 0.9 + (index % 3) * 0.22;
        cylinder(THREE, group, 0.012, 0.018, height, [x, root + height / 2, z], reed, 5, false);
        cylinder(THREE, group, 0.035, 0.035, 0.18, [x, root + height + 0.06, z], head, 6, false);
        const blade = box(THREE, group, [0.03, height * 0.9, 0.006], [x + 0.06, root + height * 0.45, z], reed, false);
        blade.rotation.z = -0.15;
    }
    // Weed on the bed and the lower slope: tufts of thin tapering blades, swaying in the water.
    const weed = new THREE.MeshStandardMaterial({ color: "#4f8a3a", roughness: 0.8, side: THREE.DoubleSide });
    const bladeGeometry = new THREE.ConeGeometry(0.035, 1, 3, 1, true);
    const strands = [];
    const weeds = Math.max(8, Math.round(width * depth * 0.6));
    for (let index = 0; index < weeds; index += 1) {
        const angle = index * 2.399963;
        const r = 0.2 + ((index * 53) % 11) / 11 * 0.58;
        const x = Math.cos(angle) * r * a;
        const z = Math.sin(angle) * r * b;
        const root = floorAt(r);
        const room = WATER_LEVEL - root - 0.15;
        if (room < 0.25)
            continue;
        const height = Math.min(room, 0.35 + ((index * 17) % 7) / 7 * 0.7);
        const strand = new THREE.Group();
        strand.position.set(x, root, z);
        for (let blade = 0; blade < 6; blade += 1) {
            const leaf = new THREE.Mesh(bladeGeometry, weed);
            const tall = height * (0.6 + ((blade * 7 + index) % 5) * 0.1);
            const lean = blade * 1.05;
            leaf.scale.set(1, tall, 1);
            leaf.position.set(Math.cos(lean) * 0.05, tall / 2, Math.sin(lean) * 0.05);
            leaf.rotation.set(Math.sin(lean) * 0.22, 0, -Math.cos(lean) * 0.22);
            strand.add(leaf);
        }
        strand.userData.phase = index * 0.7;
        group.add(strand);
        strands.push(strand);
    }
    let clock = 0;
    const ripples = surface.material.bumpMap;
    return {
        group,
        doors: null,
        fixtureDoors: {},
        animate: (dt) => {
            clock += dt;
            if (ripples?.offset)
                ripples.offset.set(clock * 0.012, clock * 0.007);
            for (const strand of strands) {
                strand.rotation.x = Math.sin(clock * 0.9 + strand.userData.phase) * 0.12;
                strand.rotation.z = Math.cos(clock * 0.7 + strand.userData.phase) * 0.1;
            }
        },
    };
}
/** A lily pond: the dug pond with pads and pink lilies floating on the water. */
export function createLilyPond(THREE, width, depth, pondDepth) {
    const pond = createPond(THREE, width, depth, pondDepth);
    const group = pond.group;
    const pad = farmMaterial(THREE, "foliage", { colors: ["#3f8a46", "#2b6331", "#6fb24c"], metresPerTile: 0.4 });
    const petal = standard(THREE, "#ff8fb0", 0.6, 0);
    const heart = standard(THREE, "#ffd33d", 0.6, 0);
    const surface = WATER_LEVEL + 0.012;
    const spots = [[-0.28, -0.18, 0.22], [0.16, -0.3, 0.18], [0.3, 0.12, 0.24], [-0.1, 0.28, 0.2], [-0.32, 0.22, 0.16], [0.02, -0.02, 0.15], [0.42, -0.1, 0.17], [-0.18, -0.4, 0.19]];
    spots.forEach(([u, v, r], index) => {
        const x = u * (width - 1);
        const z = v * (depth - 1);
        // A pad is cut from a disc with the notch every lily pad has.
        const leaf = new THREE.Mesh(new THREE.CircleGeometry(r, 18, 0.35, Math.PI * 2 - 0.35), pad);
        leaf.rotation.x = -Math.PI / 2;
        leaf.rotation.z = index;
        leaf.position.set(x, surface, z);
        leaf.receiveShadow = true;
        group.add(leaf);
        if (index % 2 === 0) {
            for (let k = 0; k < 6; k += 1) {
                const angle = (k / 6) * Math.PI * 2;
                const p = sphere(THREE, group, 0.06, [x + Math.cos(angle) * 0.07, surface + 0.05, z + Math.sin(angle) * 0.07], petal);
                p.scale.set(1.4, 0.5, 0.8);
                p.rotation.y = -angle;
            }
            sphere(THREE, group, 0.04, [x, surface + 0.08, z], heart);
        }
    });
    return pond;
}
/** Ripples for the pond surface: a soft random height field, tiled, drawn once. */
let rippleCanvas = null;
function rippleTexture(THREE) {
    if (typeof document === "undefined")
        return null;
    if (!rippleCanvas) {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context)
            return null;
        context.fillStyle = "#808080";
        context.fillRect(0, 0, size, size);
        let seed = 7;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
        for (let index = 0; index < 90; index += 1) {
            const x = random() * size;
            const y = random() * size;
            const radius = 6 + random() * 18;
            const light = random() > 0.5;
            for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
                const gradient = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
                gradient.addColorStop(0, light ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)");
                gradient.addColorStop(1, "rgba(128,128,128,0)");
                context.fillStyle = gradient;
                context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
            }
        }
        rippleCanvas = canvas;
    }
    const texture = new THREE.CanvasTexture(rippleCanvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    return texture;
}
/** The water: tinted, glossy and see-through, with moving ripples, drawn from both sides so it is a ceiling from below. */
function waterSurfaceMaterial(THREE) {
    const material = new THREE.MeshStandardMaterial({ color: "#2f6f94", roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false });
    const ripples = rippleTexture(THREE);
    if (ripples) {
        material.bumpMap = ripples;
        material.bumpScale = 0.04;
    }
    return material;
}
/** A scarecrow: a post, a crossbar, a stuffed shirt with straw at the cuffs, a sack head with a stitched face, and a straw hat. */
export function createScarecrow(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, WOOD_DARK);
    const shirt = farmMaterial(THREE, "brick", { colors: ["#b03a3a", "#7a2828", "#c95a4a", "#3a6ab0"], metresPerTile: 0.35, bumpScale: 0.005 });
    const trousers = farmMaterial(THREE, "plaster", { colors: ["#3a5a8a", "#22406a", "#5a7aaa"], metresPerTile: 0.6 });
    const sack = farmMaterial(THREE, "plaster", { colors: ["#d8c39a", "#a8956e", "#f0e2c0"], metresPerTile: 0.4 });
    const straw = strawMaterial(THREE, 0.3);
    tcylinder(THREE, group, 0.05, 0.06, 2.1, [0, 1.05, 0], wood, 8);
    tbox(THREE, group, [1.3, 0.08, 0.08], [0, 1.55, 0], wood);
    tbox(THREE, group, [0.5, 0.7, 0.3], [0, 1.25, 0], shirt);
    tbox(THREE, group, [0.5, 0.18, 0.18], [-0.55, 1.55, 0], shirt);
    tbox(THREE, group, [0.5, 0.18, 0.18], [0.55, 1.55, 0], shirt);
    tbox(THREE, group, [0.42, 0.5, 0.26], [0, 0.65, 0], trousers);
    // Patches on the shirt and a button line.
    box(THREE, group, [0.14, 0.12, 0.01], [0.12, 1.15, 0.16], standard(THREE, "#3a6ab0", 0.9, 0), false);
    for (const y of [1.5, 1.38, 1.26, 1.14])
        sphere(THREE, group, 0.015, [0, y, 0.16], standard(THREE, "#f1e6d2", 0.6, 0)).castShadow = false;
    tsphere(THREE, group, 0.2, [0, 1.85, 0], sack, 12, 10);
    // A stitched face.
    const thread = standard(THREE, "#2b2b2b", 0.9, 0);
    for (const x of [-0.07, 0.07]) {
        const eye = box(THREE, group, [0.05, 0.012, 0.01], [x, 1.9, 0.19], thread, false);
        eye.rotation.z = x > 0 ? 0.7 : -0.7;
        const eye2 = box(THREE, group, [0.05, 0.012, 0.01], [x, 1.9, 0.19], thread, false);
        eye2.rotation.z = x > 0 ? -0.7 : 0.7;
    }
    for (let index = 0; index < 5; index += 1)
        box(THREE, group, [0.03, 0.012, 0.01], [-0.06 + index * 0.03, 1.78 - Math.abs(index - 2) * 0.012, 0.195], thread, false);
    const brim = tcylinder(THREE, group, 0.36, 0.34, 0.03, [0, 2.0, 0], straw, 16);
    brim.rotation.z = 0.08;
    tcylinder(THREE, group, 0.15, 0.19, 0.18, [0, 2.1, 0], straw, 12);
    box(THREE, group, [0.4, 0.04, 0.4], [0, 2.04, 0], standard(THREE, "#a83a3a", 0.8, 0), false);
    // Straw at the cuffs and hem.
    tbox(THREE, group, [0.1, 0.14, 0.14], [-0.83, 1.55, 0], straw, false);
    tbox(THREE, group, [0.1, 0.14, 0.14], [0.83, 1.55, 0], straw, false);
    tbox(THREE, group, [0.44, 0.12, 0.28], [0, 0.4, 0], straw, false);
    // A crow on the crossbar.
    const crow = standard(THREE, "#1b1f24", 0.7, 0);
    sphere(THREE, group, 0.06, [0.5, 1.65, 0], crow).scale.set(1.5, 0.9, 0.8);
    sphere(THREE, group, 0.04, [0.58, 1.71, 0], crow);
    box(THREE, group, [0.05, 0.02, 0.02], [0.63, 1.71, 0], standard(THREE, "#d8a020", 0.6, 0), false);
    return group;
}
/** A stone well: a fieldstone shaft with a slate cap ring, a timber frame, a shingled roof over the winch, and a bucket on the rope. */
export function createWell(THREE) {
    const group = new THREE.Group();
    const stone = stoneMaterial(THREE, 0.9);
    const wood = timber(THREE, WOOD_DARK);
    const roof = farmMaterial(THREE, "shingles", { metresPerTile: 0.8 });
    tcylinder(THREE, group, 0.7, 0.75, 0.9, [0, 0.45, 0], stone, 18);
    tcylinder(THREE, group, 0.76, 0.76, 0.08, [0, 0.94, 0], farmMaterial(THREE, "plaster", { colors: ["#6f6f6f", "#4a4a4a", "#9a9a9a"], metresPerTile: 0.6 }), 18);
    cylinder(THREE, group, 0.52, 0.52, 0.99, [0, 0.5, 0], standard(THREE, "#0e1216", 1, 0), 18, false);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), waterMaterial(THREE, 0.9));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.35;
    group.add(water);
    tbox(THREE, group, [0.12, 1.9, 0.12], [-0.6, 0.95, 0], wood);
    tbox(THREE, group, [0.12, 1.9, 0.12], [0.6, 0.95, 0], wood);
    tbox(THREE, group, [1.4, 0.1, 0.1], [0, 1.95, 0], wood);
    const drum = tcylinder(THREE, group, 0.09, 0.09, 1.2, [0, 1.55, 0], wood, 12);
    drum.rotation.z = Math.PI / 2;
    // Rope wound on the drum, and the crank handle.
    for (let x = -0.25; x <= 0.25; x += 0.05)
        cylinder(THREE, group, 0.1, 0.1, 0.03, [x, 1.55, 0], standard(THREE, "#c9b99c", 1, 0), 12, false).rotation.z = Math.PI / 2;
    const crank = box(THREE, group, [0.05, 0.3, 0.05], [0.72, 1.68, 0], ironMaterial(THREE), false);
    crank.castShadow = false;
    cylinder(THREE, group, 0.025, 0.025, 0.2, [0.72, 1.82, 0.08], wood, 8).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
        const slab = tbox(THREE, group, [1.7, 0.06, 0.8], [0, 2.1, side * 0.32], roof);
        slab.rotation.x = side * 0.62;
    }
    tbox(THREE, group, [1.74, 0.08, 0.18], [0, 2.32, 0], roof, false);
    // Bucket on the rope.
    cylinder(THREE, group, 0.012, 0.012, 0.5, [0, 1.3, 0], standard(THREE, "#c9b99c", 1, 0), 6, false);
    tcylinder(THREE, group, 0.14, 0.11, 0.2, [0, 0.98, 0], farmMaterial(THREE, "battens", { colors: ["#7a4a2a", "#3a2412", "#9a6a44", "#6a3f22"], metresPerTile: 0.5 }), 10);
    cylinder(THREE, group, 0.15, 0.15, 0.02, [0, 1.06, 0], ironMaterial(THREE), 10, false);
    return group;
}
/** A slatted garden bench on cast-iron ends. */
export function createBench(THREE) {
    const group = new THREE.Group();
    const slat = timber(THREE, WOOD, 0.8);
    const iron = ironMaterial(THREE);
    for (const x of [-0.7, 0.7]) {
        box(THREE, group, [0.06, 0.45, 0.5], [x, 0.225, 0], iron);
        box(THREE, group, [0.06, 0.5, 0.06], [x, 0.7, -0.22], iron);
        // A scroll at the foot and a curl at the top of the arm.
        const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), iron);
        scroll.position.set(x, 0.12, 0.2);
        scroll.rotation.y = Math.PI / 2;
        group.add(scroll);
        box(THREE, group, [0.06, 0.05, 0.36], [x, 0.7, -0.05], iron, false);
    }
    for (const z of [-0.2, -0.05, 0.1, 0.25])
        tbox(THREE, group, [1.6, 0.05, 0.12], [0, 0.47, z], slat);
    for (const y of [0.6, 0.75, 0.9])
        tbox(THREE, group, [1.6, 0.1, 0.05], [0, y, -0.24], slat);
    return group;
}
/** A placeable interior bed: timber frame, mattress, folded quilt and pillows. */
export function createBed(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#6a4127", 0.9);
    const linen = standard(THREE, "#f2e5ca", 0.92, 0);
    const quilt = standard(THREE, "#6f8faa", 0.88, 0);
    const pillow = standard(THREE, "#fff8e8", 0.95, 0);
    box(THREE, group, [1.3, 0.16, 2.05], [0, 0.32, 0], wood);
    for (const x of [-0.56, 0.56])
        for (const z of [-0.91, 0.91])
            box(THREE, group, [0.12, 0.45, 0.12], [x, 0.225, z], wood);
    box(THREE, group, [1.18, 0.22, 1.9], [0, 0.5, 0], linen);
    box(THREE, group, [1.2, 0.08, 1.25], [0, 0.65, 0.28], quilt);
    for (const x of [-0.31, 0.31])
        box(THREE, group, [0.52, 0.14, 0.42], [x, 0.67, -0.67], pillow);
    box(THREE, group, [1.34, 0.9, 0.12], [0, 0.72, -0.99], wood);
    for (const x of [-0.56, 0.56])
        box(THREE, group, [0.12, 1.25, 0.12], [x, 0.625, -0.99], wood);
    return group;
}
/** A cast-iron lamp post with a fluted column and a warm lamp that keeps the field readable at night. */
export function createLampPost(THREE) {
    const group = new THREE.Group();
    const iron = ironMaterial(THREE);
    const glass = new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffb347", emissiveIntensity: 1.6, roughness: 0.3, transparent: true, opacity: 0.9 });
    cylinder(THREE, group, 0.14, 0.18, 0.12, [0, 0.06, 0], iron, 10);
    cylinder(THREE, group, 0.1, 0.14, 0.3, [0, 0.27, 0], iron, 10);
    cylinder(THREE, group, 0.05, 0.08, 2.3, [0, 1.55, 0], iron, 10);
    for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        cylinder(THREE, group, 0.012, 0.012, 2.2, [Math.cos(angle) * 0.055, 1.55, Math.sin(angle) * 0.055], iron, 4, false);
    }
    cylinder(THREE, group, 0.09, 0.06, 0.1, [0, 2.72, 0], iron, 10);
    // The lantern: four glass panes in an iron frame under a little pyramid cap.
    box(THREE, group, [0.3, 0.32, 0.3], [0, 2.9, 0], glass);
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]])
        box(THREE, group, [0.03, 0.34, 0.03], [x, 2.9, z], iron, false);
    box(THREE, group, [0.38, 0.05, 0.38], [0, 2.72, 0], iron);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), iron);
    cap.position.y = 3.16;
    cap.rotation.y = Math.PI / 4;
    group.add(cap);
    sphere(THREE, group, 0.03, [0, 3.28, 0], iron);
    const light = new THREE.PointLight(0xffc477, 4, 8, 1.8);
    light.position.set(0, 2.85, 0);
    group.add(light);
    return group;
}
/** A doghouse: a little red plank house with a shingle roof, a dark doorway with an arched top, and a name board. */
export function createDoghouse(THREE) {
    const group = new THREE.Group();
    const wall = farmMaterial(THREE, "planks", { metresPerTile: 0.7 });
    const roof = farmMaterial(THREE, "shingles", { metresPerTile: 0.7 });
    const trim = painted(THREE, BARN_TRIM);
    tbox(THREE, group, [1.1, 0.9, 1.3], [0, 0.45, 0], wall);
    tbox(THREE, group, [1.2, 0.06, 1.4], [0, 0.03, 0], timber(THREE, WOOD_DARK), false);
    box(THREE, group, [0.5, 0.5, 0.04], [0, 0.27, 0.66], standard(THREE, "#1b1f24", 1, 0), false);
    cylinder(THREE, group, 0.25, 0.25, 0.04, [0, 0.52, 0.66], standard(THREE, "#1b1f24", 1, 0), 12, false).rotation.x = Math.PI / 2;
    for (const x of [-0.29, 0.29])
        tbox(THREE, group, [0.06, 0.6, 0.05], [x, 0.3, 0.67], trim, false);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 14, Math.PI), trim);
    arch.position.set(0, 0.52, 0.67);
    group.add(arch);
    for (const side of [-1, 1]) {
        const slab = tbox(THREE, group, [0.78, 0.06, 1.5], [side * 0.31, 1.1, 0], roof);
        slab.rotation.z = side * -0.65;
    }
    tbox(THREE, group, [0.12, 0.08, 1.55], [0, 1.3, 0], roof);
    for (const x of [-0.55, 0.55])
        for (const z of [-0.65, 0.65])
            box(THREE, group, [0.06, 0.9, 0.06], [x, 0.45, z], trim, false);
    tbox(THREE, group, [0.5, 0.14, 0.03], [0, 0.85, 0.66], trim, false);
    // A bowl by the door.
    tcylinder(THREE, group, 0.12, 0.09, 0.08, [0.42, 0.04, 0.85], farmMaterial(THREE, "galvanised", { metresPerTile: 0.4 }), 12);
    return group;
}
/** Small dog toys are procedural catalog props, so placement never depends on external art. */
export function createTennisBall(THREE) {
    const group = new THREE.Group();
    const felt = standard(THREE, "#cbea45", 0.9, 0);
    const seam = standard(THREE, "#f5f0d0", 0.85, 0);
    sphere(THREE, group, 0.12, [0, 0.12, 0], felt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.008, 5, 20), seam);
    ring.position.y = 0.12;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    group.add(ring);
    return group;
}
export function createRopeToy(THREE) {
    const group = new THREE.Group();
    const rope = standard(THREE, "#d9b36c", 1, 0);
    const cord = cylinder(THREE, group, 0.045, 0.045, 0.42, [0, 0.08, 0], rope, 10);
    cord.rotation.z = Math.PI / 2;
    for (const x of [-0.23, 0.23]) {
        const knot = sphere(THREE, group, 0.085, [x, 0.08, 0], rope);
        knot.scale.set(0.8, 1, 0.8);
    }
    return group;
}
export function createBone(THREE) {
    const group = new THREE.Group();
    const bone = standard(THREE, "#eee5ce", 0.95, 0);
    const shaft = cylinder(THREE, group, 0.055, 0.055, 0.32, [0, 0.08, 0], bone, 10);
    shaft.rotation.z = Math.PI / 2;
    for (const x of [-0.18, 0.18])
        for (const z of [-0.055, 0.055]) {
            sphere(THREE, group, 0.075, [x, 0.08, z], bone);
        }
    return group;
}
/** A wheelbarrow: a green steel tray on a spoked wheel with two ash handles, parked on its legs, with a load of earth. */
export function createWheelbarrow(THREE) {
    const group = new THREE.Group();
    const paint = farmMaterial(THREE, "galvanised", { colors: ["#3f7228", "#2a4f1a", "#1c3812"], metresPerTile: 0.6, roughness: 0.5, metalness: 0.4 });
    const wood = timber(THREE, "#c9a06a", 0.6);
    const iron = ironMaterial(THREE);
    const tray = tbox(THREE, group, [0.6, 0.3, 0.8], [0, 0.45, -0.1], paint);
    tray.rotation.x = 0.1;
    const load = tsphere(THREE, group, 0.28, [0, 0.55, -0.1], farmMaterial(THREE, "soil"), 10, 8);
    load.scale.set(1, 0.45, 1.3);
    const wheel = cylinder(THREE, group, 0.2, 0.2, 0.06, [0, 0.2, -0.58], standard(THREE, "#1b1f24", 0.8, 0.1), 14);
    wheel.rotation.z = Math.PI / 2;
    cylinder(THREE, group, 0.05, 0.05, 0.08, [0, 0.2, -0.58], iron, 8).rotation.z = Math.PI / 2;
    for (let spoke = 0; spoke < 4; spoke += 1) {
        const bar = box(THREE, group, [0.02, 0.36, 0.02], [0, 0.2, -0.58], iron, false);
        bar.rotation.x = spoke * Math.PI / 4;
    }
    for (const x of [-0.22, 0.22]) {
        const handle = tcylinder(THREE, group, 0.025, 0.025, 1.3, [x, 0.42, 0.15], wood, 6);
        handle.rotation.x = Math.PI / 2 + 0.12;
        box(THREE, group, [0.05, 0.36, 0.05], [x, 0.18, 0.25], iron, false);
        cylinder(THREE, group, 0.03, 0.03, 0.14, [x, 0.5, 0.78], standard(THREE, "#d43a3a", 0.6, 0.2), 8).rotation.x = Math.PI / 2;
    }
    return group;
}
/** A hay wagon: a plank bed on four spoked wheels with iron tyres, heaped with hay, shafts out the front. */
export function createWagon(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, WOOD);
    const dark = timber(THREE, WOOD_DARK);
    const iron = ironMaterial(THREE);
    const hay = strawMaterial(THREE);
    tbox(THREE, group, [1.5, 0.08, 2.2], [0, 0.6, 0], wood);
    for (const x of [-0.72, 0.72]) {
        tbox(THREE, group, [0.06, 0.4, 2.2], [x, 0.84, 0], dark);
        for (let z = -0.9; z <= 0.9; z += 0.45)
            tbox(THREE, group, [0.08, 0.46, 0.08], [x, 0.85, z], dark, false);
    }
    for (const z of [-1.07, 1.07])
        tbox(THREE, group, [1.5, 0.4, 0.06], [0, 0.84, z], dark);
    tbox(THREE, group, [0.1, 0.1, 2.0], [0, 0.5, 0], dark, false);
    for (const z of [-0.75, 0.75]) {
        tbox(THREE, group, [1.7, 0.08, 0.08], [0, 0.45, z], dark, false);
        for (const x of [-0.82, 0.82]) {
            const rim = cylinder(THREE, group, 0.44, 0.44, 0.06, [x, 0.42, z], iron, 14);
            rim.rotation.z = Math.PI / 2;
            const felloe = tcylinder(THREE, group, 0.4, 0.4, 0.07, [x, 0.42, z], dark, 14);
            felloe.rotation.z = Math.PI / 2;
            cylinder(THREE, group, 0.33, 0.33, 0.08, [x, 0.42, z], standard(THREE, "#0e0e0e", 0.2, 0), 14, false).rotation.z = Math.PI / 2;
            for (let spoke = 0; spoke < 6; spoke += 1) {
                const bar = tbox(THREE, group, [0.05, 0.72, 0.035], [x, 0.42, z], timber(THREE, "#c9a06a"), false);
                bar.rotation.x = spoke * Math.PI / 6;
            }
            cylinder(THREE, group, 0.08, 0.08, 0.12, [x, 0.42, z], dark, 10).rotation.z = Math.PI / 2;
        }
    }
    const heap = tsphere(THREE, group, 0.75, [0, 1.05, 0], hay);
    heap.scale.set(1, 0.55, 1.4);
    const heap2 = tsphere(THREE, group, 0.5, [0.2, 1.25, -0.3], hay);
    heap2.scale.set(1, 0.6, 1.2);
    for (const x of [-0.35, 0.35]) {
        const shaft = tcylinder(THREE, group, 0.035, 0.04, 1.2, [x, 0.55, 1.65], wood, 6);
        shaft.rotation.x = Math.PI / 2;
    }
    return group;
}
/** A barrel: bellied staves under three iron hoops, with a bung in the head. */
export function createBarrel(THREE) {
    const group = new THREE.Group();
    const stave = farmMaterial(THREE, "battens", { colors: ["#7a4a2a", "#3a2412", "#9a6a44", "#6a3f22"], metresPerTile: 0.55 });
    const hoop = standard(THREE, "#3b3b3b", 0.5, 0.6);
    const body = new THREE.Mesh(scaleUvs(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), 0.55, Math.PI * 0.68, 0.9), stave);
    body.position.y = 0.45;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const belly = tcylinder(THREE, group, 0.34, 0.34, 0.5, [0, 0.45, 0], stave, 16, false);
    belly.castShadow = false;
    const bellyTop = tcylinder(THREE, group, 0.3, 0.34, 0.2, [0, 0.8, 0], stave, 16, false);
    const bellyBottom = tcylinder(THREE, group, 0.34, 0.3, 0.2, [0, 0.1, 0], stave, 16, false);
    bellyTop.castShadow = false;
    bellyBottom.castShadow = false;
    cylinder(THREE, group, 0.32, 0.32, 0.05, [0, 0.14, 0], hoop, 16, false);
    cylinder(THREE, group, 0.32, 0.32, 0.05, [0, 0.76, 0], hoop, 16, false);
    cylinder(THREE, group, 0.35, 0.35, 0.05, [0, 0.45, 0], hoop, 16, false);
    tcylinder(THREE, group, 0.28, 0.28, 0.02, [0, 0.9, 0], farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 0.6 }), 16);
    cylinder(THREE, group, 0.04, 0.04, 0.03, [0.12, 0.92, 0], hoop, 8, false);
    return group;
}
/** A crate stack: three planked crates with stencilled boards, one askew on top. */
export function createCrates(THREE) {
    const group = new THREE.Group();
    const plank = farmMaterial(THREE, "planks", { colors: ["#c9a06a", "#8a6a3a", "#e0c090", "#6a4a2a"], metresPerTile: 0.6 });
    const edge = timber(THREE, WOOD, 0.6);
    const crate = (size, position, turn) => {
        const body = tbox(THREE, group, [size, size, size], position, plank);
        body.rotation.y = turn;
        for (const dy of [-1, 1]) {
            const band = tbox(THREE, group, [size + 0.02, 0.06, size + 0.02], [position[0], position[1] + dy * (size / 2 - 0.04), position[2]], edge, false);
            band.rotation.y = turn;
        }
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const half = size / 2 - 0.02;
            const post = tbox(THREE, group, [0.06, size + 0.01, 0.06], [position[0] + dx * half * Math.cos(turn) - dz * half * Math.sin(turn), position[1], position[2] + dx * half * Math.sin(turn) + dz * half * Math.cos(turn)], edge, false);
            post.rotation.y = turn;
        }
        // A stencilled label on the front.
        const label = box(THREE, group, [size * 0.5, size * 0.22, 0.01], [position[0] + Math.sin(turn) * (size / 2 + 0.005), position[1], position[2] + Math.cos(turn) * (size / 2 + 0.005)], standard(THREE, "#4a3a2a", 0.9, 0), false);
        label.rotation.y = turn;
    };
    crate(0.55, [-0.28, 0.275, 0.1], 0);
    crate(0.55, [0.3, 0.275, -0.15], 0.1);
    crate(0.45, [0, 0.775, 0], 0.45);
    // Apples spilling from the top crate.
    const apple = standard(THREE, "#d43a3a", 0.5, 0);
    for (const [x, z] of [[-0.1, 0.05], [0.08, -0.08], [0.02, 0.1], [-0.06, -0.1]])
        sphere(THREE, group, 0.05, [x, 1.03, z], apple);
    return group;
}
/** A log pile: bark logs stacked in a pyramid between two stakes, with rings on the cut ends. */
export function createLogPile(THREE) {
    const group = new THREE.Group();
    const bark = farmMaterial(THREE, "bark", { metresPerTile: 0.5 });
    const cut = farmMaterial(THREE, "wood", { colors: ["#c9a06a", "#8a6a3a", "#e0c090"], metresPerTile: 0.3 });
    const ring = standard(THREE, "#a8824a", 0.9, 0);
    const rows = [5, 4, 3, 2];
    rows.forEach((count, row) => {
        for (let index = 0; index < count; index += 1) {
            const z = -(count - 1) * 0.16 + index * 0.32;
            const y = 0.14 + row * 0.26;
            const log = tcylinder(THREE, group, 0.14, 0.14, 1.4, [0, y, z], bark, 9);
            log.rotation.z = Math.PI / 2;
            log.rotation.y = (row + index) * 0.4;
            for (const x of [-0.7, 0.7]) {
                const end = tcylinder(THREE, group, 0.13, 0.13, 0.02, [x, y, z], cut, 12, false);
                end.rotation.z = Math.PI / 2;
                for (const r of [0.09, 0.05])
                    cylinder(THREE, group, r, r, 0.005, [x + Math.sign(x) * 0.011, y, z], ring, 12, false).rotation.z = Math.PI / 2;
            }
        }
    });
    for (const z of [-0.42, 0.42])
        tbox(THREE, group, [0.07, 1.15, 0.07], [-0.55, 0.575, z], timber(THREE, WOOD_DARK), false);
    // An axe leaning on the pile.
    const handle = cylinder(THREE, group, 0.02, 0.025, 0.8, [0.75, 0.4, 0.5], timber(THREE, "#c9b99c"), 6);
    handle.rotation.z = -0.45;
    box(THREE, group, [0.18, 0.12, 0.03], [0.55, 0.7, 0.5], standard(THREE, "#5a6068", 0.4, 0.7));
    return group;
}
/** A campfire: a ring of fieldstones, crossed bark logs on ash, and a flickering flame that lights the ground around it. */
export function createCampfire(THREE) {
    const group = new THREE.Group();
    const stone = stoneMaterial(THREE, 0.5);
    const bark = farmMaterial(THREE, "bark", { metresPerTile: 0.4 });
    for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2;
        const rock = tsphere(THREE, group, 0.12 + (index % 3) * 0.03, [Math.cos(angle) * 0.5, 0.1, Math.sin(angle) * 0.5], stone, 8, 6);
        rock.scale.y = 0.7;
        rock.rotation.y = angle * 3;
    }
    cylinder(THREE, group, 0.42, 0.42, 0.04, [0, 0.02, 0], standard(THREE, "#3a3128", 1, 0), 14, false);
    cylinder(THREE, group, 0.25, 0.25, 0.05, [0, 0.03, 0], standard(THREE, "#1b1a18", 1, 0), 14, false);
    for (let index = 0; index < 4; index += 1) {
        const log = tcylinder(THREE, group, 0.06, 0.07, 0.7, [0, 0.14, 0], bark, 7);
        log.rotation.z = Math.PI / 2 - 0.35;
        log.rotation.y = index * Math.PI / 4;
    }
    // Glowing embers under the flame.
    const ember = new THREE.MeshStandardMaterial({ color: "#ff6a1a", emissive: "#ff4a00", emissiveIntensity: 2, roughness: 0.8 });
    for (let index = 0; index < 5; index += 1)
        sphere(THREE, group, 0.04, [Math.cos(index * 1.3) * 0.12, 0.1, Math.sin(index * 1.3) * 0.12], ember).castShadow = false;
    const flame = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff8a2b", emissiveIntensity: 2.6, roughness: 0.5, transparent: true, opacity: 0.92 });
    const inner = new THREE.MeshStandardMaterial({ color: "#fff3b0", emissive: "#ffd33d", emissiveIntensity: 3, roughness: 0.5, transparent: true, opacity: 0.95 });
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 8), flame);
    outer.position.y = 0.48;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 8), inner);
    core.position.y = 0.36;
    group.add(outer, core);
    const light = new THREE.PointLight(0xff9a3c, 6, 9, 1.6);
    light.position.set(0, 0.7, 0);
    group.add(light);
    let time = 0;
    return Object.freeze({
        group,
        animate: (dt) => {
            time += dt;
            const flicker = 0.85 + Math.sin(time * 11) * 0.08 + Math.sin(time * 23.7) * 0.07;
            outer.scale.set(flicker, 0.9 + Math.sin(time * 9.3) * 0.12, flicker);
            core.scale.set(1, 0.9 + Math.sin(time * 13.1 + 1) * 0.15, 1);
            light.intensity = 5 + Math.sin(time * 17) * 0.8 + Math.sin(time * 7.3) * 0.5;
        },
    });
}
/** A birdbath: a fluted cast-stone pedestal with a shallow bowl of water and a bird on the rim. */
export function createBirdbath(THREE) {
    const group = new THREE.Group();
    const stone = farmMaterial(THREE, "plaster", { colors: ["#b9bec4", "#8a9096", "#e0e4e8"], metresPerTile: 0.5, bumpScale: 0.015 });
    tcylinder(THREE, group, 0.28, 0.32, 0.08, [0, 0.04, 0], stone, 16);
    tcylinder(THREE, group, 0.09, 0.14, 0.7, [0, 0.43, 0], stone, 12);
    for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        cylinder(THREE, group, 0.02, 0.025, 0.66, [Math.cos(angle) * 0.1, 0.43, Math.sin(angle) * 0.1], stone, 5, false);
    }
    tcylinder(THREE, group, 0.36, 0.2, 0.14, [0, 0.85, 0], stone, 16);
    cylinder(THREE, group, 0.3, 0.3, 0.02, [0, 0.91, 0], standard(THREE, "#7a8086", 0.9, 0), 16, false);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), waterMaterial(THREE, 0.85));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.915;
    group.add(water);
    // A bird on the rim: body, head, beak, tail.
    const blue = standard(THREE, "#3a6ab0", 0.7, 0);
    sphere(THREE, group, 0.05, [0.3, 0.98, 0.05], blue).scale.set(1.4, 0.9, 0.9);
    sphere(THREE, group, 0.035, [0.36, 1.03, 0.05], blue);
    box(THREE, group, [0.04, 0.015, 0.015], [0.4, 1.03, 0.05], standard(THREE, "#d8a020", 0.6, 0), false);
    box(THREE, group, [0.08, 0.02, 0.03], [0.23, 1.0, 0.05], blue, false).rotation.z = 0.4;
    return group;
}
/** A signpost: a weathered post with two arrow boards pointing different ways. */
export function createSignpost(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, WOOD);
    const board = painted(THREE, BARN_TRIM);
    tbox(THREE, group, [0.12, 2.2, 0.12], [0, 1.1, 0], wood);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 4), wood);
    cap.position.set(0, 2.25, 0);
    cap.rotation.y = Math.PI / 4;
    group.add(cap);
    const arrow = (y, turn) => {
        const plank = tbox(THREE, group, [0.8, 0.2, 0.04], [0.32 * Math.cos(turn), y, -0.32 * Math.sin(turn)], board);
        plank.rotation.y = turn;
        const tip = tbox(THREE, group, [0.16, 0.16, 0.04], [0.72 * Math.cos(turn), y, -0.72 * Math.sin(turn)], board, false);
        tip.rotation.y = turn;
        tip.rotation.z = Math.PI / 4;
        // Lettering as a dark bar.
        const text = box(THREE, group, [0.5, 0.05, 0.01], [0.3 * Math.cos(turn) + Math.sin(turn) * 0.025, y, -0.3 * Math.sin(turn) + Math.cos(turn) * 0.025], standard(THREE, "#3a2a1a", 0.9, 0), false);
        text.rotation.y = turn;
        for (const x of [0.02, 0.62])
            sphere(THREE, group, 0.012, [x * Math.cos(turn) + Math.sin(turn) * 0.025, y, -x * Math.sin(turn) + Math.cos(turn) * 0.025], ironMaterial(THREE)).castShadow = false;
    };
    arrow(1.95, 0.3);
    arrow(1.65, 2.6);
    return group;
}
/** A mailbox: a blue box on a post with the flag up and a newspaper tube under it. */
export function createMailbox(THREE) {
    const group = new THREE.Group();
    const post = timber(THREE, WOOD);
    const paint = farmMaterial(THREE, "galvanised", { colors: ["#2b4a8a", "#1c3260", "#12224a"], metresPerTile: 0.6, roughness: 0.45, metalness: 0.4 });
    tbox(THREE, group, [0.1, 1.05, 0.1], [0, 0.525, 0], post);
    tbox(THREE, group, [0.3, 0.04, 0.5], [0, 1.03, 0], post, false);
    tbox(THREE, group, [0.26, 0.2, 0.46], [0, 1.15, 0], paint);
    const dome = tcylinder(THREE, group, 0.13, 0.13, 0.46, [0, 1.25, 0], paint, 12);
    dome.rotation.x = Math.PI / 2;
    // The door at the front with a latch, and the flag.
    cylinder(THREE, group, 0.135, 0.135, 0.01, [0, 1.25, 0.235], standard(THREE, "#1c3260", 0.5, 0.4), 12, false).rotation.x = Math.PI / 2;
    box(THREE, group, [0.26, 0.2, 0.01], [0, 1.15, 0.235], standard(THREE, "#1c3260", 0.5, 0.4), false);
    box(THREE, group, [0.06, 0.03, 0.02], [0, 1.05, 0.245], ironMaterial(THREE), false);
    box(THREE, group, [0.03, 0.18, 0.06], [0.15, 1.35, 0.12], standard(THREE, "#d43a3a", 0.6, 0), false);
    box(THREE, group, [0.03, 0.03, 0.03], [0.15, 1.24, 0.12], ironMaterial(THREE), false);
    // Newspaper tube below.
    cylinder(THREE, group, 0.06, 0.06, 0.4, [0, 0.9, 0.05], standard(THREE, "#d8d8d8", 0.5, 0.3), 10).rotation.x = Math.PI / 2;
    return group;
}
/** A cast-iron hand pump over a stone slab, with a bucket beneath the spout and a puddle. */
export function createWaterPump(THREE) {
    const group = new THREE.Group();
    const iron = ironMaterial(THREE);
    const stone = stoneMaterial(THREE, 0.6);
    tbox(THREE, group, [0.5, 0.1, 0.8], [0, 0.05, 0], stone);
    cylinder(THREE, group, 0.09, 0.11, 0.06, [0, 0.13, -0.2], iron, 10);
    cylinder(THREE, group, 0.07, 0.09, 1.0, [0, 0.6, -0.2], iron, 10);
    cylinder(THREE, group, 0.09, 0.07, 0.08, [0, 1.12, -0.2], iron, 10);
    sphere(THREE, group, 0.05, [0, 1.18, -0.2], iron);
    cylinder(THREE, group, 0.05, 0.05, 0.4, [0, 1.0, 0], iron, 8).rotation.x = Math.PI / 2;
    cylinder(THREE, group, 0.04, 0.04, 0.2, [0, 0.92, 0.2], iron, 8);
    const handle = cylinder(THREE, group, 0.025, 0.025, 0.7, [0, 1.25, -0.4], iron, 8);
    handle.rotation.x = 0.7;
    sphere(THREE, group, 0.04, [0, 1.5, -0.63], iron);
    tcylinder(THREE, group, 0.11, 0.09, 0.22, [0, 0.21, 0.24], farmMaterial(THREE, "galvanised", { metresPerTile: 0.4 }), 10);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), waterMaterial(THREE, 0.6));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0.1, 0.101, 0.3);
    group.add(puddle);
    return group;
}
/** A beehive: a stacked white box hive on a stand, with a tin lid and a few bees drifting over it. */
export function createBeehive(THREE) {
    const group = new THREE.Group();
    const paint = painted(THREE, BARN_TRIM);
    const wood = timber(THREE, WOOD_DARK);
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]])
        tbox(THREE, group, [0.06, 0.3, 0.06], [x, 0.15, z], wood, false);
    tbox(THREE, group, [0.5, 0.06, 0.5], [0, 0.33, 0], wood);
    tbox(THREE, group, [0.48, 0.34, 0.48], [0, 0.53, 0], paint);
    tbox(THREE, group, [0.5, 0.02, 0.5], [0, 0.71, 0], wood, false);
    tbox(THREE, group, [0.48, 0.24, 0.48], [0, 0.83, 0], paint);
    tbox(THREE, group, [0.54, 0.06, 0.54], [0, 0.98, 0], farmMaterial(THREE, "galvanised", { metresPerTile: 0.5 }));
    box(THREE, group, [0.2, 0.04, 0.02], [0, 0.4, 0.25], standard(THREE, "#1b1f24", 1, 0), false);
    tbox(THREE, group, [0.3, 0.02, 0.12], [0, 0.36, 0.3], wood, false);
    // Hand holds on the box sides.
    for (const side of [-1, 1])
        box(THREE, group, [0.02, 0.05, 0.16], [side * 0.25, 0.6, 0], standard(THREE, "#1b1f24", 1, 0), false);
    const bee = standard(THREE, "#ffd33d", 0.6, 0);
    const stripe = standard(THREE, "#1b1f24", 0.6, 0);
    for (const [x, y, z] of [[0.3, 1.2, 0.2], [-0.25, 1.35, -0.1], [0.05, 1.1, 0.4]]) {
        sphere(THREE, group, 0.025, [x, y, z], bee).castShadow = false;
        sphere(THREE, group, 0.026, [x + 0.012, y, z], stripe).castShadow = false;
    }
    return group;
}
/** A small stone marker; its durable inscription lives in layout.petHistory. */
export function createPetTombstone(THREE) {
    const group = new THREE.Group();
    const stone = standard(THREE, "#8f8c86", 0.95, 0);
    const dark = standard(THREE, "#5d5952", 1, 0);
    box(THREE, group, [0.72, 0.12, 0.34], [0, 0.06, 0], dark);
    box(THREE, group, [0.56, 0.72, 0.18], [0, 0.48, 0], stone);
    sphere(THREE, group, 0.28, [0, 0.84, 0], stone).scale.set(1, 0.72, 0.34);
    box(THREE, group, [0.28, 0.035, 0.02], [0, 0.55, 0.101], dark, false);
    return group;
}
const still = (group) => ({ group, doors: null, fixtureDoors: {}, animate: null });
/**
 * Every builder by the catalog's `model` name. A row whose model is missing
 * here fails the catalog test rather than leaving an empty spot in the field.
 */
export const FARM_PROP_BUILDERS = Object.freeze({
    // Fences are built for the row's length.
    "fence-post-rail": (THREE, definition, row) => still(createFenceRun(THREE, farmDecorFootprint(definition, row).width)),
    "fence-picket": (THREE, definition, row) => still(createPicketFence(THREE, farmDecorFootprint(definition, row).width)),
    "fence-stone-wall": (THREE, definition, row) => still(createStoneWall(THREE, farmDecorFootprint(definition, row).width)),
    "fence-split-rail": (THREE, definition, row) => still(createSplitRail(THREE, farmDecorFootprint(definition, row).width)),
    "fence-wire": (THREE, definition, row) => still(createWireFence(THREE, farmDecorFootprint(definition, row).width)),
    "fence-hedge": (THREE, definition, row) => still(createHedgeRow(THREE, farmDecorFootprint(definition, row).width)),
    "fence-gate": (THREE) => { const gate = createGate(THREE); return { group: gate.group, doors: gate.doors, fixtureDoors: {}, animate: null }; },
    // Buildings draw their walls from the catalog's shell.
    ...Object.fromEntries(Object.entries(FARM_BUILDING_BUILDERS).map(([name, build]) => [name, (THREE, definition) => build(THREE, definition)])),
    // Plants take the seed so no two are twins.
    "tree-oak": (THREE, _definition, _row, seed) => still(createTree(THREE, seed)),
    "tree-pine": (THREE, _definition, _row, seed) => still(createPine(THREE, seed)),
    "tree-birch": (THREE, _definition, _row, seed) => still(createBirch(THREE, seed)),
    "tree-apple": (THREE, _definition, _row, seed) => still(createAppleTree(THREE, seed)),
    "tree-willow": (THREE, _definition, _row, seed) => still(createWillow(THREE, seed)),
    bush: (THREE, _definition, _row, seed) => still(createBush(THREE, seed)),
    "soil-patch": (THREE) => still(createSoilPatch(THREE)),
    "flower-bed": (THREE, _definition, _row, seed) => still(createFlowerBed(THREE, seed)),
    sunflowers: (THREE, _definition, _row, seed) => still(createSunflowers(THREE, seed)),
    "pumpkin-patch": (THREE, _definition, _row, seed) => still(createPumpkinPatch(THREE, seed)),
    wheat: (THREE, _definition, _row, seed) => still(createWheat(THREE, seed)),
    "veg-rows": (THREE, _definition, _row, seed) => still(createVegRows(THREE, seed)),
    lavender: (THREE, _definition, _row, seed) => still(createLavender(THREE, seed)),
    stump: (THREE) => still(createStump(THREE)),
    // Water is sized to its footprint.
    pond: (THREE, definition) => createPond(THREE, definition.footprint.width, definition.footprint.depth, definition.pond?.depth ?? 1.5),
    "pond-lily": (THREE, definition) => createLilyPond(THREE, definition.footprint.width, definition.footprint.depth, definition.pond?.depth ?? 1.5),
    // Props.
    "hay-bale": (THREE) => still(createHayBale(THREE)),
    trough: (THREE) => still(createTrough(THREE)),
    scarecrow: (THREE) => still(createScarecrow(THREE)),
    well: (THREE) => still(createWell(THREE)),
    bench: (THREE) => still(createBench(THREE)),
    bed: (THREE) => still(createBed(THREE)),
    "lamp-post": (THREE) => still(createLampPost(THREE)),
    doghouse: (THREE) => still(createDoghouse(THREE)),
    ...Object.fromEntries(Object.entries(FARM_DWELLING_BUILDERS).map(([name, build]) => [name, (THREE, definition) => still(build(THREE, definition))])),
    "tennis-ball": (THREE) => still(createTennisBall(THREE)),
    "rope-toy": (THREE) => still(createRopeToy(THREE)),
    bone: (THREE) => still(createBone(THREE)),
    "pet-tombstone": (THREE) => still(createPetTombstone(THREE)),
    wheelbarrow: (THREE) => still(createWheelbarrow(THREE)),
    wagon: (THREE) => still(createWagon(THREE)),
    barrel: (THREE) => still(createBarrel(THREE)),
    crates: (THREE) => still(createCrates(THREE)),
    "log-pile": (THREE) => still(createLogPile(THREE)),
    campfire: (THREE) => { const fire = createCampfire(THREE); return { group: fire.group, doors: null, fixtureDoors: {}, animate: fire.animate }; },
    birdbath: (THREE) => still(createBirdbath(THREE)),
    signpost: (THREE) => still(createSignpost(THREE)),
    mailbox: (THREE) => still(createMailbox(THREE)),
    "water-pump": (THREE) => still(createWaterPump(THREE)),
    beehive: (THREE) => still(createBeehive(THREE)),
});
/** The names every catalog row's `model` must be one of. */
export function farmPropNames() {
    return Object.keys(FARM_PROP_BUILDERS);
}
/** Build the model for a placed row. Throws for a model no builder draws, which the catalog test rules out. */
export function createFarmDecorModel(THREE, definition, row, seed = 1) {
    const build = FARM_PROP_BUILDERS[definition.model];
    if (!build)
        throw new Error(`No farm prop draws ${definition.model}`);
    const model = build(THREE, definition, row, seed);
    model.group.userData.decorInstanceId = row.instanceId;
    return model;
}
