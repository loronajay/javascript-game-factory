// Pet Games trophies: the cups a Barnyard Dash Grand Prix win puts on the farm.
//
// One silhouette per cup, one metal per class (bronze Rookie, silver Pro, gold
// Champion — the tier is the end of the item id), each on a turned timber
// plinth. Procedural like every farm prop: cylinders, spheres and a torus or
// two, with the plinth in the farm's own grained wood. Each stands on its
// footprint centre at y = 0.
import { box, cylinder, sphere, standard } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tcylinder } from "./farm-materials.mjs";
import { TROPHY_TIERS } from "./farm-catalog/decor.mjs";
/** The tier a trophy row is, read off the end of its id (`…-gold`). */
export function trophyTier(itemId) {
    return TROPHY_TIERS.find((tier) => itemId.endsWith(`-${tier.id}`)) ?? TROPHY_TIERS[0];
}
function metal(THREE, color) {
    // Metallic but not mirror-dark: the farm has no environment map for a true metal to reflect.
    return standard(THREE, color, 0.32, 0.55);
}
function ring(THREE, group, radius, tube, position, material, upright = false) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 28), material);
    mesh.position.set(position[0], position[1], position[2]);
    if (!upright)
        mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
}
/** The plinth every cup stands on, with a brass plate on its face. */
function plinth(THREE, group, color) {
    const wood = farmMaterial(THREE, "wood", { colors: ["#4a2d18", "#2a180b", "#7a5434"], metresPerTile: 0.4 });
    tcylinder(THREE, group, 0.2, 0.24, 0.12, [0, 0.06, 0], wood, 20);
    tcylinder(THREE, group, 0.17, 0.2, 0.08, [0, 0.16, 0], wood, 20);
    box(THREE, group, [0.16, 0.05, 0.01], [0, 0.07, 0.235], metal(THREE, color), false);
    return 0.2;
}
/** A two-handled loving cup: the circuit's classic shape. */
function lovingCup(THREE, group, base, material) {
    cylinder(THREE, group, 0.05, 0.1, 0.05, [0, base + 0.025, 0], material, 20);
    cylinder(THREE, group, 0.025, 0.035, 0.14, [0, base + 0.12, 0], material, 14);
    sphere(THREE, group, 0.045, [0, base + 0.2, 0], material);
    cylinder(THREE, group, 0.15, 0.07, 0.2, [0, base + 0.32, 0], material, 24);
    ring(THREE, group, 0.15, 0.012, [0, base + 0.42, 0], material);
    for (const side of [-1, 1]) {
        const handle = ring(THREE, group, 0.06, 0.012, [side * 0.16, base + 0.33, 0], material, true);
        handle.rotation.y = Math.PI / 2;
        handle.scale.set(1, 1.3, 1);
    }
    return base + 0.44;
}
/** Clover Cup: a loving cup crowned with a four-leaf clover. */
function cloverCup(THREE, definition) {
    const group = new THREE.Group();
    const tier = trophyTier(definition.id);
    const material = metal(THREE, tier.color);
    const top = lovingCup(THREE, group, plinth(THREE, group, tier.color), material);
    const leaf = standard(THREE, "#3f9a4a", 0.5, 0.2);
    cylinder(THREE, group, 0.008, 0.008, 0.06, [0, top + 0.03, 0], material, 6);
    for (let index = 0; index < 4; index += 1) {
        const angle = (index * Math.PI) / 2 + Math.PI / 4;
        sphere(THREE, group, 0.035, [Math.cos(angle) * 0.035, top + 0.07, Math.sin(angle) * 0.035], leaf).scale.set(1, 0.35, 1);
    }
    return group;
}
/** Harvest Cup: a deep urn with a sheaf of wheat rising from it. */
function harvestCup(THREE, definition) {
    const group = new THREE.Group();
    const tier = trophyTier(definition.id);
    const material = metal(THREE, tier.color);
    const base = plinth(THREE, group, tier.color);
    cylinder(THREE, group, 0.06, 0.11, 0.06, [0, base + 0.03, 0], material, 20);
    cylinder(THREE, group, 0.03, 0.04, 0.1, [0, base + 0.11, 0], material, 14);
    sphere(THREE, group, 0.13, [0, base + 0.27, 0], material).scale.set(1, 1.1, 1);
    cylinder(THREE, group, 0.1, 0.12, 0.05, [0, base + 0.4, 0], material, 22);
    const straw = standard(THREE, "#e2c15a", 0.8, 0.1);
    for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2;
        const lean = 0.18;
        const stalk = cylinder(THREE, group, 0.006, 0.006, 0.22, [Math.cos(angle) * 0.03, base + 0.52, Math.sin(angle) * 0.03], straw, 5, false);
        stalk.rotation.z = Math.cos(angle) * lean;
        stalk.rotation.x = -Math.sin(angle) * lean;
        sphere(THREE, group, 0.018, [Math.cos(angle) * 0.055, base + 0.63, Math.sin(angle) * 0.055], straw).scale.set(0.7, 1.8, 0.7);
    }
    return group;
}
/** Blue Ribbon Cup: the tall one, with a rosette and its two tails pinned to the front. */
function blueRibbonCup(THREE, definition) {
    const group = new THREE.Group();
    const tier = trophyTier(definition.id);
    const material = metal(THREE, tier.color);
    const base = plinth(THREE, group, tier.color);
    cylinder(THREE, group, 0.045, 0.1, 0.06, [0, base + 0.03, 0], material, 20);
    cylinder(THREE, group, 0.02, 0.03, 0.24, [0, base + 0.18, 0], material, 14);
    sphere(THREE, group, 0.04, [0, base + 0.3, 0], material);
    cylinder(THREE, group, 0.17, 0.06, 0.28, [0, base + 0.46, 0], material, 26);
    ring(THREE, group, 0.17, 0.014, [0, base + 0.6, 0], material);
    sphere(THREE, group, 0.05, [0, base + 0.66, 0], material);
    const ribbon = standard(THREE, "#2f5fd0", 0.7, 0.05);
    const rosette = cylinder(THREE, group, 0.07, 0.07, 0.015, [0, base + 0.44, 0.13], ribbon, 18);
    rosette.rotation.x = Math.PI / 2;
    const centre = cylinder(THREE, group, 0.03, 0.03, 0.02, [0, base + 0.44, 0.14], material, 14);
    centre.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
        const tail = box(THREE, group, [0.035, 0.14, 0.008], [side * 0.03, base + 0.34, 0.125], ribbon, false);
        tail.rotation.z = side * 0.25;
    }
    return group;
}
/** Every trophy model by the catalog's `model` name (`trophy-<cup>`). */
export const FARM_TROPHY_BUILDERS = Object.freeze({
    "trophy-clover-cup": cloverCup,
    "trophy-harvest-cup": harvestCup,
    "trophy-blue-ribbon-cup": blueRibbonCup,
});
