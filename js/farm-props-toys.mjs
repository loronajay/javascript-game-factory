// Pet toys: three procedural placeable toys for every species, the way
// `farm-props-dwellings.mts` holds their homes. Which species a toy belongs to
// is care data (`farm-pet-care.mts`); this module only draws. Every toy stands
// on its footprint centre at y = 0; a swimmer's toys are built to stand on a
// pond bed, under water, where the world sets them down. A few move (a
// spinner turns, kelp sways, bubbles rise): those return an `animate`.
import { box, cylinder, sphere, standard } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder, tsphere } from "./farm-materials.mjs";
const timber = (THREE, color = "#8a5a34") => farmMaterial(THREE, "wood", { colors: [color, "#3e2615", "#b88450"], metresPerTile: 0.6 });
const bark = (THREE) => farmMaterial(THREE, "bark", { metresPerTile: 0.6 });
const stone = (THREE, colors = ["#8a8f92", "#5f6568", "#b0b5b7"]) => farmMaterial(THREE, "fieldstone", { colors, metresPerTile: 0.5, bumpScale: 0.03 });
const rope = (THREE) => standard(THREE, "#c9a66b", 1, 0);
const glowing = (THREE, color, intensity = 1.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
const glass = (THREE, color, opacity = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, transparent: true, opacity, depthWrite: false });
const still = (group) => ({ group, animate: null });
/** A rope hanging straight down from `top` to `bottom` (y values) at x/z. */
function cord(THREE, group, x, z, top, bottom, material) {
    return cylinder(THREE, group, 0.008, 0.008, top - bottom, [x, (top + bottom) / 2, z], material, 5, false);
}
/** A cylinder lying along x. */
function lying(THREE, group, radius, length, position, material, textured = false) {
    const mesh = textured
        ? tcylinder(THREE, group, radius, radius, length, position, material, 14)
        : cylinder(THREE, group, radius, radius, length, position, material, 14);
    mesh.rotation.z = Math.PI / 2;
    return mesh;
}
function torus(THREE, group, radius, tube, position, material, flat = true) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 28), material);
    mesh.position.set(position[0], position[1], position[2]);
    if (flat)
        mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}
// ---------------------------------------------------------------- corgi
export function createTennisBall(THREE) {
    const group = new THREE.Group();
    sphere(THREE, group, 0.12, [0, 0.12, 0], standard(THREE, "#cbea45", 0.9, 0));
    torus(THREE, group, 0.121, 0.008, [0, 0.12, 0], standard(THREE, "#f5f0d0", 0.85, 0));
    return group;
}
export function createRopeToy(THREE) {
    const group = new THREE.Group();
    const material = standard(THREE, "#d9b36c", 1, 0);
    lying(THREE, group, 0.045, 0.42, [0, 0.08, 0], material);
    for (const x of [-0.23, 0.23])
        sphere(THREE, group, 0.085, [x, 0.08, 0], material).scale.set(0.8, 1, 0.8);
    return group;
}
export function createBone(THREE) {
    const group = new THREE.Group();
    const material = standard(THREE, "#eee5ce", 0.95, 0);
    lying(THREE, group, 0.055, 0.32, [0, 0.08, 0], material);
    for (const x of [-0.18, 0.18])
        for (const z of [-0.055, 0.055])
            sphere(THREE, group, 0.075, [x, 0.08, z], material);
    return group;
}
// ---------------------------------------------------------------- duck
function splashTub(THREE) {
    const group = new THREE.Group();
    const tin = farmMaterial(THREE, "galvanised", { metresPerTile: 0.4 });
    tcylinder(THREE, group, 0.38, 0.33, 0.26, [0, 0.13, 0], tin, 20);
    torus(THREE, group, 0.38, 0.02, [0, 0.26, 0], tin);
    cylinder(THREE, group, 0.355, 0.355, 0.02, [0, 0.23, 0], glass(THREE, "#6fb6d9", 0.8), 20, false);
    // A splash-board to hop up on.
    tbox(THREE, group, [0.22, 0.05, 0.3], [0.44, 0.12, 0], timber(THREE, "#b98447")).rotation.z = 0.5;
    return still(group);
}
function peckingBell(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#6d4b2f");
    tbox(THREE, group, [0.26, 0.04, 0.26], [0, 0.02, 0], wood);
    tbox(THREE, group, [0.05, 0.62, 0.05], [-0.09, 0.33, 0], wood);
    tbox(THREE, group, [0.22, 0.04, 0.04], [0, 0.62, 0], wood);
    const swing = new THREE.Group();
    swing.position.set(0.08, 0.6, 0);
    group.add(swing);
    cord(THREE, swing, 0, 0, 0, -0.18, rope(THREE));
    cylinder(THREE, swing, 0.035, 0.075, 0.1, [0, -0.23, 0], standard(THREE, "#d9b44a", 0.3, 0.8), 14);
    sphere(THREE, swing, 0.02, [0, -0.29, 0], standard(THREE, "#5a4a2a", 0.4, 0.6));
    let time = 0;
    return { group, animate: (dt) => { time += dt; swing.rotation.z = Math.sin(time * 1.7) * 0.12; } };
}
function rubberDuckling(THREE) {
    const group = new THREE.Group();
    const yellow = standard(THREE, "#f6d23b", 0.35, 0);
    sphere(THREE, group, 0.09, [0, 0.07, 0], yellow).scale.set(1.25, 0.8, 1);
    sphere(THREE, group, 0.055, [0.06, 0.15, 0], yellow);
    box(THREE, group, [0.05, 0.015, 0.04], [0.12, 0.145, 0], standard(THREE, "#f08a24", 0.4, 0));
    for (const z of [-0.028, 0.028])
        sphere(THREE, group, 0.01, [0.1, 0.165, z], standard(THREE, "#1a1a1a", 0.3, 0));
    return still(group);
}
// ---------------------------------------------------------------- red panda
function bambooClimber(THREE) {
    const group = new THREE.Group();
    const cane = standard(THREE, "#9fbf5a", 0.55, 0);
    const node = standard(THREE, "#6f8f3a", 0.6, 0);
    const posts = [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]];
    for (const [x, z] of posts) {
        cylinder(THREE, group, 0.045, 0.05, 1.4, [x, 0.7, z], cane, 10);
        for (const y of [0.35, 0.7, 1.05])
            cylinder(THREE, group, 0.055, 0.055, 0.03, [x, y, z], node, 10, false);
    }
    for (const y of [0.45, 0.9])
        for (const z of [-0.32, 0.32])
            lying(THREE, group, 0.035, 0.84, [0, y, z], cane);
    tbox(THREE, group, [0.95, 0.05, 0.75], [0, 1.25, 0], timber(THREE, "#b98447"));
    // A tuft of leaves on the lookout.
    for (const [x, z] of [[-0.3, -0.2], [0.25, 0.15]])
        tsphere(THREE, group, 0.14, [x, 1.34, z], farmMaterial(THREE, "foliage", { metresPerTile: 0.5 })).scale.set(1, 0.6, 1);
    return still(group);
}
function pinecone(THREE, group, position, lean) {
    const cone = new THREE.Group();
    cone.position.set(position[0], position[1], position[2]);
    cone.rotation.z = lean;
    group.add(cone);
    const scale = standard(THREE, "#7a4f2a", 0.9, 0);
    for (let tier = 0; tier < 4; tier += 1)
        sphere(THREE, cone, 0.05 - tier * 0.008, [0, tier * 0.035, 0], scale).scale.set(1, 0.7, 1);
}
function pineconePuzzle(THREE) {
    const group = new THREE.Group();
    tbox(THREE, group, [0.4, 0.14, 0.4], [0, 0.07, 0], timber(THREE, "#c89a5a"));
    const hole = standard(THREE, "#2a1c10", 1, 0);
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]])
        cylinder(THREE, group, 0.045, 0.045, 0.01, [x, 0.141, z], hole, 12, false);
    pinecone(THREE, group, [-0.1, 0.17, -0.1], 0);
    pinecone(THREE, group, [0.1, 0.17, 0.1], 0.2);
    pinecone(THREE, group, [0.28, 0.04, -0.12], 1.4);
    return still(group);
}
function leafHammock(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#8a5a34");
    for (const x of [-0.68, 0.68])
        tbox(THREE, group, [0.08, 0.9, 0.08], [x, 0.45, 0], wood);
    const sling = new THREE.Group();
    sling.position.y = 0.72;
    group.add(sling);
    const leaf = farmMaterial(THREE, "foliage", { colors: ["#5f8f48", "#3f6a30", "#8fbf5f"], metresPerTile: 0.5 });
    const bed = sphere(THREE, sling, 0.5, [0, -0.12, 0], leaf);
    bed.scale.set(1.15, 0.18, 0.45);
    for (const x of [-0.6, 0.6]) {
        const line = cylinder(THREE, sling, 0.01, 0.01, 0.2, [x * 0.92, 0.04, 0], rope(THREE), 5, false);
        line.rotation.z = x < 0 ? -1.1 : 1.1;
    }
    let time = 0;
    return { group, animate: (dt) => { time += dt; sling.rotation.x = Math.sin(time * 0.9) * 0.08; } };
}
// ---------------------------------------------------------------- platypus
function logTunnel(THREE) {
    const group = new THREE.Group();
    lying(THREE, group, 0.26, 1.1, [0, 0.26, 0], bark(THREE), true);
    const heart = standard(THREE, "#c9a06a", 0.9, 0);
    const hollow = standard(THREE, "#1c130b", 1, 0);
    for (const side of [-1, 1]) {
        lying(THREE, group, 0.24, 0.01, [side * 0.556, 0.26, 0], heart);
        lying(THREE, group, 0.17, 0.02, [side * 0.558, 0.26, 0], hollow);
    }
    return still(group);
}
function pebblePile(THREE) {
    const group = new THREE.Group();
    const shades = ["#9aa0a2", "#7d8588", "#b8b1a2", "#6c7275", "#a89c86"];
    const stones = [
        [0, 0.06, 0, 0.09], [-0.13, 0.04, 0.06, 0.06], [0.12, 0.04, -0.05, 0.065], [0.05, 0.04, 0.15, 0.05],
        [-0.08, 0.04, -0.15, 0.055], [0.18, 0.03, 0.12, 0.04], [-0.2, 0.03, -0.05, 0.045], [0.02, 0.13, 0.02, 0.05], [-0.04, 0.1, 0.08, 0.045],
    ];
    stones.forEach(([x, y, z, r], index) => sphere(THREE, group, r, [x, y, z], standard(THREE, shades[index % shades.length], 0.7, 0)).scale.set(1.2, 0.7, 1));
    return still(group);
}
function paddlePool(THREE) {
    const group = new THREE.Group();
    torus(THREE, group, 0.48, 0.07, [0, 0.07, 0], standard(THREE, "#e8e1cf", 0.5, 0));
    torus(THREE, group, 0.48, 0.072, [0, 0.14, 0], standard(THREE, "#4fa3d9", 0.5, 0));
    cylinder(THREE, group, 0.47, 0.47, 0.02, [0, 0.01, 0], standard(THREE, "#4fa3d9", 0.5, 0), 24, false);
    cylinder(THREE, group, 0.44, 0.44, 0.02, [0, 0.12, 0], glass(THREE, "#7fc6e8", 0.75), 24, false);
    return still(group);
}
// ---------------------------------------------------------------- hippo
function beachBall(THREE) {
    const group = new THREE.Group();
    const colors = ["#e8453c", "#f5f0d0", "#2f7fd9", "#f6d23b", "#3fae5a", "#f5f0d0"];
    colors.forEach((color, index) => {
        const segment = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 16, (index / 6) * Math.PI * 2, Math.PI / 3), standard(THREE, color, 0.35, 0));
        segment.position.y = 0.35;
        segment.castShadow = true;
        group.add(segment);
    });
    return still(group);
}
function scratchingPost(THREE) {
    const group = new THREE.Group();
    tbox(THREE, group, [0.45, 0.08, 0.45], [0, 0.04, 0], timber(THREE, "#8a5a34"));
    tcylinder(THREE, group, 0.1, 0.1, 1.1, [0, 0.63, 0], farmMaterial(THREE, "straw", { colors: ["#c9a66b", "#8f6d3a", "#e2c78f"], metresPerTile: 0.25 }), 14);
    tbox(THREE, group, [0.28, 0.06, 0.28], [0, 1.21, 0], timber(THREE, "#8a5a34"));
    return still(group);
}
function watermelon(THREE) {
    const group = new THREE.Group();
    sphere(THREE, group, 0.2, [-0.05, 0.16, 0], standard(THREE, "#3f7228", 0.5, 0)).scale.set(1.25, 0.8, 0.9);
    // A slice already taken out of it, lying flat beside: green rind under red flesh.
    const half = (radius, height, y, color) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16, 1, false, 0, Math.PI), standard(THREE, color, 0.6, 0));
        mesh.position.set(0.2, y, 0.08);
        mesh.rotation.y = 0.6;
        mesh.castShadow = true;
        group.add(mesh);
    };
    half(0.13, 0.03, 0.015, "#3f7228");
    half(0.115, 0.036, 0.018, "#e8453c");
    return still(group);
}
// ---------------------------------------------------------------- rhino
function tractorTire(THREE) {
    const group = new THREE.Group();
    const rubber = standard(THREE, "#2b2b2b", 0.95, 0);
    torus(THREE, group, 0.42, 0.17, [0, 0.17, 0], rubber);
    // Tread lugs around the outside.
    for (let index = 0; index < 18; index += 1) {
        const angle = (index / 18) * Math.PI * 2;
        const lug = box(THREE, group, [0.06, 0.26, 0.05], [Math.cos(angle) * 0.58, 0.17, Math.sin(angle) * 0.58], rubber, false);
        lug.rotation.y = -angle;
        lug.rotation.z = 0.4;
    }
    return still(group);
}
function scratchBoulder(THREE) {
    const group = new THREE.Group();
    const rock = stone(THREE, ["#928671", "#6e6555", "#b5aa92"]);
    tsphere(THREE, group, 0.45, [0, 0.36, 0], rock).scale.set(1.05, 0.85, 0.95);
    tsphere(THREE, group, 0.28, [0.3, 0.2, 0.18], rock);
    tsphere(THREE, group, 0.2, [-0.34, 0.14, -0.14], rock);
    // Polished where horns have rubbed it.
    sphere(THREE, group, 0.2, [0.05, 0.55, 0.3], standard(THREE, "#b9ab8e", 0.25, 0)).scale.set(1, 0.6, 0.5);
    return still(group);
}
function pushingLog(THREE) {
    const group = new THREE.Group();
    lying(THREE, group, 0.2, 1.5, [0, 0.2, 0], bark(THREE), true);
    for (const side of [-1, 1])
        lying(THREE, group, 0.185, 0.01, [side * 0.756, 0.2, 0], standard(THREE, "#c9a06a", 0.9, 0));
    const knot = sphere(THREE, group, 0.07, [0.3, 0.36, 0.08], standard(THREE, "#4a321f", 0.9, 0));
    knot.scale.set(1, 0.5, 1);
    return still(group);
}
// ---------------------------------------------------------------- horse
function saltLick(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#6b4527");
    tbox(THREE, group, [0.08, 0.9, 0.08], [0, 0.45, 0], wood);
    tbox(THREE, group, [0.34, 0.04, 0.34], [0, 0.02, 0], wood);
    // The block on its holder, worn smooth on one face.
    const holder = standard(THREE, "#3b3b3b", 0.6, 0.5);
    tbox(THREE, group, [0.26, 0.03, 0.2], [0, 0.72, 0.1], holder);
    box(THREE, group, [0.22, 0.2, 0.16], [0, 0.84, 0.1], standard(THREE, "#e9ddd0", 0.55, 0));
    sphere(THREE, group, 0.07, [0, 0.86, 0.18], standard(THREE, "#d9c6b0", 0.3, 0)).scale.set(1.2, 0.8, 0.4);
    return still(group);
}
function hangingBall(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#5d3a1f");
    for (const x of [-0.55, 0.55])
        tbox(THREE, group, [0.09, 2, 0.09], [x, 1, 0], wood);
    tbox(THREE, group, [1.2, 0.09, 0.09], [0, 1.98, 0], wood);
    const swing = new THREE.Group();
    swing.position.y = 1.94;
    group.add(swing);
    cord(THREE, swing, 0, 0, 0, -0.62, rope(THREE));
    sphere(THREE, swing, 0.2, [0, -0.8, 0], standard(THREE, "#e8453c", 0.45, 0));
    torus(THREE, swing, 0.2, 0.012, [0, -0.8, 0], standard(THREE, "#f5f0d0", 0.5, 0), false);
    let time = 0;
    return { group, animate: (dt) => { time += dt; swing.rotation.z = Math.sin(time * 1.1) * 0.12; } };
}
function jumpPole(THREE) {
    const group = new THREE.Group();
    const white = standard(THREE, "#f2f2ee", 0.6, 0);
    const red = standard(THREE, "#d83c3c", 0.6, 0);
    // Two wings and a striped pole across them at a small horse's height.
    for (const x of [-1.1, 1.1]) {
        tbox(THREE, group, [0.1, 0.95, 0.1], [x, 0.475, 0], white);
        tbox(THREE, group, [0.36, 0.06, 0.36], [x, 0.03, 0], white);
        box(THREE, group, [0.06, 0.05, 0.14], [x - Math.sign(x) * 0.08, 0.62, 0], standard(THREE, "#555555", 0.5, 0.6));
    }
    for (let index = 0; index < 8; index += 1) {
        lying(THREE, group, 0.05, 0.25, [-0.875 + index * 0.25, 0.66, 0], index % 2 ? red : white);
    }
    return still(group);
}
// ---------------------------------------------------------------- bat
function fruitMobile(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#5d3a1f");
    tbox(THREE, group, [0.32, 0.05, 0.32], [0, 0.025, 0], wood);
    tbox(THREE, group, [0.07, 1.9, 0.07], [0, 0.95, 0], wood);
    const mobile = new THREE.Group();
    mobile.position.y = 1.9;
    group.add(mobile);
    lying(THREE, mobile, 0.02, 0.9, [0, 0, 0], wood);
    lying(THREE, mobile, 0.02, 0.9, [0, 0, 0], wood).rotation.set(0, Math.PI / 2, Math.PI / 2);
    const fruit = [[0.42, 0, "#f0a030"], [-0.42, 0, "#b8457a"], [0, 0.42, "#e8453c"], [0, -0.42, "#6a3d9a"]];
    for (const [x, z, color] of fruit) {
        cord(THREE, mobile, x, z, 0, -0.42, rope(THREE));
        sphere(THREE, mobile, 0.07, [x, -0.48, z], standard(THREE, color, 0.5, 0));
    }
    let time = 0;
    return { group, animate: (dt) => { time += dt; mobile.rotation.y += dt * 0.35; mobile.rotation.z = Math.sin(time * 0.8) * 0.04; } };
}
function mothLantern(THREE) {
    const group = new THREE.Group();
    const iron = standard(THREE, "#2b2b2b", 0.5, 0.6);
    cylinder(THREE, group, 0.14, 0.16, 0.06, [0, 0.03, 0], iron, 12);
    cylinder(THREE, group, 0.03, 0.03, 1.3, [0, 0.68, 0], iron, 8);
    box(THREE, group, [0.2, 0.26, 0.2], [0, 1.46, 0], glowing(THREE, "#ffd9a0", 1.6), false);
    const cap = cylinder(THREE, group, 0.02, 0.17, 0.1, [0, 1.64, 0], iron, 4);
    cap.rotation.y = Math.PI / 4;
    const moths = new THREE.Group();
    moths.position.y = 1.46;
    group.add(moths);
    const wing = standard(THREE, "#d9cfb8", 0.9, 0);
    for (let index = 0; index < 3; index += 1) {
        const angle = (index / 3) * Math.PI * 2;
        sphere(THREE, moths, 0.025, [Math.cos(angle) * 0.24, (index - 1) * 0.06, Math.sin(angle) * 0.24], wing).scale.set(1.6, 0.3, 1);
    }
    let time = 0;
    return { group, animate: (dt) => { time += dt; moths.rotation.y += dt * 1.6; moths.position.y = 1.46 + Math.sin(time * 3) * 0.03; } };
}
function swingPerch(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#5d3a1f");
    for (const x of [-0.5, 0.5])
        for (const z of [-1, 1]) {
            const leg = tbox(THREE, group, [0.05, 1.5, 0.05], [x, 0.72, z * 0.14], wood);
            leg.rotation.x = -z * 0.19;
        }
    tbox(THREE, group, [1.08, 0.06, 0.06], [0, 1.44, 0], wood);
    const swing = new THREE.Group();
    swing.position.y = 1.42;
    group.add(swing);
    for (const x of [-0.25, 0.25])
        cord(THREE, swing, x, 0, 0, -0.5, rope(THREE));
    lying(THREE, swing, 0.025, 0.6, [0, -0.5, 0], timber(THREE, "#c9a06a"));
    let time = 0;
    return { group, animate: (dt) => { time += dt; swing.rotation.x = Math.sin(time * 1.3) * 0.22; } };
}
// ---------------------------------------------------------------- shark (in a pond)
function chewRing(THREE) {
    const group = new THREE.Group();
    torus(THREE, group, 0.27, 0.07, [0, 0.07, 0], standard(THREE, "#f07a3a", 0.45, 0));
    for (let index = 0; index < 4; index += 1) {
        const band = torus(THREE, group, 0.075, 0.012, [Math.cos(index * Math.PI / 2) * 0.27, 0.07, Math.sin(index * Math.PI / 2) * 0.27], standard(THREE, "#f5f0d0", 0.5, 0), false);
        band.rotation.y = -index * Math.PI / 2;
    }
    return still(group);
}
function sunkenChest(THREE) {
    const group = new THREE.Group();
    const wood = timber(THREE, "#6d4b2f");
    const brass = standard(THREE, "#d9b44a", 0.35, 0.75);
    tbox(THREE, group, [0.78, 0.34, 0.48], [0, 0.17, 0], wood);
    // A barrel lid: a half cylinder along the chest's length, curve up.
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.78, 14, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.34;
    lid.castShadow = true;
    group.add(lid);
    for (const x of [-0.3, 0.3])
        box(THREE, group, [0.05, 0.36, 0.5], [x, 0.18, 0], brass, false);
    box(THREE, group, [0.1, 0.1, 0.03], [0, 0.3, 0.25], brass, false);
    // Coins spilled on the bed.
    for (const [x, z] of [[0.45, 0.2], [0.5, 0.05], [0.38, 0.3], [-0.46, 0.22]])
        cylinder(THREE, group, 0.035, 0.035, 0.012, [x, 0.006, z], brass, 10, false);
    return still(group);
}
function kelpGarden(THREE) {
    const group = new THREE.Group();
    const leaf = standard(THREE, "#3f7a3a", 0.8, 0);
    const light = standard(THREE, "#6f9a3c", 0.8, 0);
    tsphere(THREE, group, 0.46, [0, 0.02, 0], stone(THREE, ["#6f7a5a", "#4f5a40", "#8f9a78"])).scale.set(1, 0.12, 1);
    const strands = [];
    const spots = [[0, 0, 1.0], [0.25, 0.1, 0.8], [-0.22, 0.15, 0.9], [0.1, -0.28, 0.7], [-0.3, -0.15, 0.6], [0.3, -0.2, 0.55], [-0.05, 0.3, 0.75]];
    spots.forEach(([x, z, height], index) => {
        const strand = new THREE.Group();
        strand.position.set(x, 0.05, z);
        group.add(strand);
        box(THREE, strand, [0.06, height, 0.015], [0, height / 2, 0], index % 2 ? light : leaf, false);
        strands.push(strand);
    });
    let time = 0;
    return { group, animate: (dt) => { time += dt; strands.forEach((strand, index) => { strand.rotation.z = Math.sin(time * 0.9 + index) * 0.14; strand.rotation.x = Math.cos(time * 0.7 + index * 1.7) * 0.08; }); } };
}
// ---------------------------------------------------------------- anglerfish (in a pond)
function glowStone(THREE) {
    const group = new THREE.Group();
    const rock = stone(THREE, ["#343247", "#252439", "#5f5b73"]);
    tsphere(THREE, group, 0.2, [0, 0.14, 0], rock).scale.set(1.2, 0.8, 1);
    tsphere(THREE, group, 0.12, [0.17, 0.08, 0.1], rock);
    const crystal = glowing(THREE, "#67d9d0", 2.2);
    for (const [x, y, z, tilt] of [[-0.05, 0.3, 0, 0.2], [0.08, 0.27, -0.06, -0.3], [0.2, 0.18, 0.12, 0.5]]) {
        const shard = cylinder(THREE, group, 0, 0.035, 0.16, [x, y, z], crystal, 5, false);
        shard.rotation.z = tilt;
    }
    return still(group);
}
function oldAnchor(THREE) {
    const group = new THREE.Group();
    const rust = standard(THREE, "#6a4a38", 0.85, 0.5);
    lying(THREE, group, 0.035, 0.72, [0, 0.05, 0], rust);
    // Stock across the top, ring beyond it.
    cylinder(THREE, group, 0.025, 0.025, 0.42, [-0.33, 0.05, 0], rust, 8).rotation.x = Math.PI / 2;
    torus(THREE, group, 0.07, 0.015, [-0.43, 0.05, 0], rust, true);
    // Arms and flukes at the crown.
    for (const side of [-1, 1]) {
        const arm = cylinder(THREE, group, 0.03, 0.03, 0.3, [0.3, 0.05, side * 0.12], rust, 8);
        arm.rotation.x = Math.PI / 2;
        arm.rotation.z = side * 0.7;
        arm.rotation.y = side * 0.9;
        box(THREE, group, [0.1, 0.03, 0.1], [0.24, 0.04, side * 0.24], rust);
    }
    // A crust of weed on it.
    sphere(THREE, group, 0.05, [0.05, 0.08, 0.02], standard(THREE, "#3f7a3a", 0.9, 0)).scale.set(2, 0.4, 1);
    return still(group);
}
function bubbleStone(THREE) {
    const group = new THREE.Group();
    tsphere(THREE, group, 0.2, [0, 0.12, 0], stone(THREE)).scale.set(1.1, 0.7, 1);
    const bubbles = [];
    const air = glass(THREE, "#dff4ff", 0.45);
    for (let index = 0; index < 6; index += 1)
        bubbles.push(sphere(THREE, group, 0.025 + (index % 3) * 0.01, [Math.sin(index * 2.1) * 0.05, 0.25 + index * 0.18, Math.cos(index * 1.7) * 0.05], air));
    return {
        group,
        animate: (dt) => {
            for (const bubble of bubbles) {
                bubble.position.y += dt * 0.35;
                if (bubble.position.y > 1.3)
                    bubble.position.y = 0.22;
            }
        },
    };
}
// ---------------------------------------------------------------- jellyfish (in a pond)
function glassFloat(THREE) {
    const group = new THREE.Group();
    tsphere(THREE, group, 0.07, [0, 0.05, 0], stone(THREE)).scale.set(1.2, 0.7, 1);
    const float = new THREE.Group();
    group.add(float);
    cord(THREE, float, 0, 0, 0.62, 0.08, rope(THREE));
    sphere(THREE, float, 0.14, [0, 0.74, 0], glass(THREE, "#6fc7b8", 0.55));
    torus(THREE, float, 0.142, 0.008, [0, 0.74, 0], rope(THREE));
    let time = 0;
    return { group, animate: (dt) => { time += dt; float.rotation.z = Math.sin(time * 0.8) * 0.1; float.rotation.x = Math.cos(time * 0.6) * 0.08; } };
}
function coralFan(THREE) {
    const group = new THREE.Group();
    tsphere(THREE, group, 0.14, [0, 0.05, 0], stone(THREE, ["#b8a98c", "#8f846c", "#d8ccb0"])).scale.set(2.4, 0.5, 1);
    const fans = [[-0.18, 0.45, "#d99ac6"], [0.2, 0.34, "#e86a8a"]];
    for (const [x, radius, color] of fans) {
        const fan = new THREE.Mesh(new THREE.CircleGeometry(radius, 18, 0, Math.PI), new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
        fan.position.set(x, 0.08, 0);
        fan.rotation.y = x * 0.8;
        group.add(fan);
        cylinder(THREE, group, 0.015, 0.02, 0.1, [x, 0.08, 0], standard(THREE, color, 0.8, 0), 6, false);
    }
    return still(group);
}
function currentSpinner(THREE) {
    const group = new THREE.Group();
    tsphere(THREE, group, 0.1, [0, 0.04, 0], stone(THREE)).scale.set(1.4, 0.6, 1.4);
    cylinder(THREE, group, 0.015, 0.015, 0.6, [0, 0.33, 0], standard(THREE, "#b8a98c", 0.7, 0.2), 6);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.62, 0.03);
    group.add(wheel);
    const colours = ["#67b6c7", "#f5f0d0", "#67b6c7", "#f5f0d0"];
    colours.forEach((color, index) => {
        const arm = new THREE.Group();
        arm.rotation.z = index * Math.PI / 2;
        wheel.add(arm);
        box(THREE, arm, [0.2, 0.08, 0.01], [0.1, 0, 0], standard(THREE, color, 0.5, 0), false).rotation.x = 0.35;
    });
    sphere(THREE, wheel, 0.025, [0, 0, 0.01], standard(THREE, "#d9b44a", 0.4, 0.6));
    return { group, animate: (dt) => { wheel.rotation.z -= dt * 1.4; } };
}
/** Every toy builder by the catalog's `model` name. */
export const FARM_TOY_BUILDERS = Object.freeze({
    "tennis-ball": (THREE) => still(createTennisBall(THREE)),
    "rope-toy": (THREE) => still(createRopeToy(THREE)),
    bone: (THREE) => still(createBone(THREE)),
    "toy-splash-tub": splashTub,
    "toy-pecking-bell": peckingBell,
    "toy-rubber-duckling": rubberDuckling,
    "toy-bamboo-climber": bambooClimber,
    "toy-pinecone-puzzle": pineconePuzzle,
    "toy-leaf-hammock": leafHammock,
    "toy-log-tunnel": logTunnel,
    "toy-pebble-pile": pebblePile,
    "toy-paddle-pool": paddlePool,
    "toy-beach-ball": beachBall,
    "toy-scratching-post": scratchingPost,
    "toy-watermelon": watermelon,
    "toy-tractor-tire": tractorTire,
    "toy-scratch-boulder": scratchBoulder,
    "toy-pushing-log": pushingLog,
    "toy-salt-lick": saltLick,
    "toy-hanging-ball": hangingBall,
    "toy-jump-pole": jumpPole,
    "toy-fruit-mobile": fruitMobile,
    "toy-moth-lantern": mothLantern,
    "toy-swing-perch": swingPerch,
    "toy-chew-ring": chewRing,
    "toy-sunken-chest": sunkenChest,
    "toy-kelp-garden": kelpGarden,
    "toy-glow-stone": glowStone,
    "toy-old-anchor": oldAnchor,
    "toy-bubble-stone": bubbleStone,
    "toy-glass-float": glassFloat,
    "toy-coral-fan": coralFan,
    "toy-current-spinner": currentSpinner,
});
