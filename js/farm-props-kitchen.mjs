// The Kitchen Range: where the farm cooks. A cream-enamelled cast-iron wood
// range — firebox, oven, two hot plates, a stovepipe up the back and a brass
// towel rail — beside a painted worktop with a butcher-block top, a chopping
// board and knife, a crock of spoons and a shelf of the farm's own jars, all
// against a tiled splashback.
//
// It is drawn in the frame `farm-kitchen.mts` describes (`KITCHEN_ANCHORS`),
// so the cooking view knows where the board, the pot, the plate and the two
// fire windows are without asking the model. And it carries a small handle
// in `group.userData.kitchen` — the heat in the firebox, the glow in the
// oven, the pot lid and what is in the pot — which is the only way the
// cooking view changes it. Standing idle it smoulders: a banked fire and a
// covered pot.
import { farmMaterial, tbox, tcylinder } from "./farm-materials.mjs";
import { lathe, paintedSurface, paintedTexture, place, surface } from "./farm-item-geometry.mjs";
import { KITCHEN_ANCHORS } from "./farm-kitchen.mjs";
import { createDishModel } from "./farm-dish-models.mjs";
import { findRecipe } from "./farm-catalog/recipes.mjs";
const ENAMEL = "#efe6d2";
const TRIM = "#b8452f";
const IRON = "#26292e";
const BRASS = "#c9a85a";
function iron(THREE, roughness = 0.45) {
    return surface(THREE, IRON, { roughness, metalness: 0.55, flat: false });
}
function brass(THREE) {
    return surface(THREE, BRASS, { roughness: 0.3, metalness: 0.85, flat: false });
}
/** Cream tiles with a row of blue-painted ones along the top, the grout a little grey. */
function tiles(THREE) {
    const texture = paintedTexture(THREE, 512, 128, (context, w, h) => {
        context.fillStyle = "#b9b2a4";
        context.fillRect(0, 0, w, h);
        const size = h / 4;
        for (let row = 0; row < 4; row += 1) {
            for (let column = 0; column < w / size; column += 1) {
                context.fillStyle = row === 0 ? "#3f6f9a" : (row + column) % 5 === 0 ? "#e9dfca" : "#f1e9d8";
                context.fillRect(column * size + 2, row * size + 2, size - 4, size - 4);
                if (row === 0) {
                    context.fillStyle = "#f1e9d8";
                    context.beginPath();
                    context.arc(column * size + size / 2, size / 2, size * 0.22, 0, Math.PI * 2);
                    context.fill();
                }
            }
        }
    });
    return paintedSurface(THREE, "#efe6d2", texture, { roughness: 0.35 });
}
function tea(THREE) {
    const texture = paintedTexture(THREE, 64, 64, (context, w, h) => {
        context.fillStyle = "#f7f2e8";
        context.fillRect(0, 0, w, h);
        context.fillStyle = "rgba(184,69,47,.6)";
        for (let index = 0; index < 8; index += 2) {
            context.fillRect((index * w) / 8, 0, w / 8, h);
            context.fillRect(0, (index * h) / 8, w, h / 8);
        }
    });
    return paintedSurface(THREE, "#f0d6cc", texture, { roughness: 0.95, doubleSided: true });
}
/** The range: body, top, hot plates, doors, rail, legs and pipe. Returns the two fire windows' materials. */
function buildRange(THREE, group) {
    const { hob, kettle, firebox, oven } = KITCHEN_ANCHORS;
    const enamel = surface(THREE, ENAMEL, { roughness: 0.3, flat: false });
    const trim = surface(THREE, TRIM, { roughness: 0.35, flat: false });
    const body = { x: -0.56, width: 1.04, depth: 0.66 };
    tbox(THREE, group, [body.width, 0.72, body.depth], [body.x, 0.5, -0.02], enamel);
    // Red enamel bands at the plinth and under the top, the way the old ranges were trimmed.
    tbox(THREE, group, [body.width + 0.01, 0.05, body.depth + 0.01], [body.x, 0.165, -0.02], trim);
    tbox(THREE, group, [body.width + 0.01, 0.04, body.depth + 0.01], [body.x, 0.84, -0.02], trim);
    tbox(THREE, group, [body.width + 0.04, 0.045, body.depth + 0.06], [body.x, 0.882, -0.02], iron(THREE));
    for (const [x, z] of [[-1.04, -0.31], [-0.08, -0.31], [-1.04, 0.27], [-0.08, 0.27]])
        tcylinder(THREE, group, 0.03, 0.022, 0.14, [x, 0.07, z], iron(THREE), 8);
    // Hot plates with their lifting rings.
    for (const plate of [hob, kettle]) {
        tcylinder(THREE, group, 0.12, 0.12, 0.012, [plate.x, 0.91, plate.z], iron(THREE, 0.7), 20);
        place(THREE, group, new THREE.TorusGeometry(0.08, 0.006, 4, 20), iron(THREE, 0.6), [plate.x, 0.917, plate.z], [Math.PI / 2, 0, 0]);
    }
    // The firebox door with its window, the oven door with its glass, both on iron frames.
    const doorFront = 0.31 + 0.02;
    tbox(THREE, group, [firebox.width + 0.08, firebox.height + 0.08, 0.03], [firebox.x, firebox.y, doorFront - 0.015], iron(THREE));
    const fire = surface(THREE, "#3a1a0a", { roughness: 0.6, flat: false, emissive: "#ff5a14", emissiveIntensity: 0.4 });
    place(THREE, group, new THREE.PlaneGeometry(firebox.width, firebox.height), fire, [firebox.x, firebox.y, firebox.z]).name = "kitchen-firebox-window";
    for (let bar = -2; bar <= 2; bar += 1)
        tbox(THREE, group, [0.012, firebox.height, 0.01], [firebox.x + bar * (firebox.width / 5), firebox.y, firebox.z + 0.006], iron(THREE), false);
    tcylinder(THREE, group, 0.012, 0.012, 0.08, [firebox.x + firebox.width / 2 + 0.02, firebox.y, doorFront + 0.02], brass(THREE), 8).rotation.x = Math.PI / 2;
    tbox(THREE, group, [oven.width + 0.1, oven.height + 0.12, 0.03], [oven.x, oven.y, doorFront - 0.015], iron(THREE));
    const glow = surface(THREE, "#1a1410", { roughness: 0.15, flat: false, emissive: "#ff7a2a", emissiveIntensity: 0 });
    place(THREE, group, new THREE.PlaneGeometry(oven.width, oven.height), glow, [oven.x, oven.y, oven.z]).name = "kitchen-oven-window";
    const handle = tcylinder(THREE, group, 0.012, 0.012, oven.width, [oven.x, oven.y + oven.height / 2 + 0.035, doorFront + 0.035], brass(THREE), 8);
    handle.rotation.z = Math.PI / 2;
    // The ash drawer and the thermometer on the oven door.
    tbox(THREE, group, [0.26, 0.08, 0.02], [firebox.x, 0.26, doorFront - 0.005], iron(THREE));
    tcylinder(THREE, group, 0.04, 0.04, 0.01, [oven.x, oven.y + oven.height / 2 - 0.01, doorFront + 0.008], surface(THREE, "#f4ecd6", { flat: false }), 16).rotation.x = Math.PI / 2;
    // The brass towel rail across the front, a tea towel over it.
    const rail = tcylinder(THREE, group, 0.01, 0.01, 0.96, [body.x, 0.76, 0.385], brass(THREE), 8);
    rail.rotation.z = Math.PI / 2;
    for (const x of [body.x - 0.46, body.x + 0.46])
        tbox(THREE, group, [0.02, 0.02, 0.07], [x, 0.76, 0.35], brass(THREE));
    const towel = new THREE.PlaneGeometry(0.2, 0.28);
    place(THREE, group, towel, tea(THREE), [body.x + 0.22, 0.63, 0.392]);
    // The stovepipe: out of the top at the back and up past the shelf, collared, with a rain cap.
    const pipe = iron(THREE, 0.55);
    tcylinder(THREE, group, 0.07, 0.07, 1.62, [-0.98, 1.72, -0.25], pipe, 14);
    for (const y of [1.05, 1.7, 2.35])
        tcylinder(THREE, group, 0.078, 0.078, 0.03, [-0.98, y, -0.25], pipe, 14);
    tcylinder(THREE, group, 0.0, 0.11, 0.08, [-0.98, 2.6, -0.25], pipe, 14);
    return { fire, oven: glow };
}
/** The pot on the fire: copper, two handles, a lid that lifts, and a hidden surface of whatever is cooking. */
function buildPot(THREE, group) {
    const { hob } = KITCHEN_ANCHORS;
    const copper = surface(THREE, "#b8733a", { roughness: 0.3, metalness: 0.85, flat: false });
    const profile = [[0, 0], [0.1, 0], [0.11, 0.01], [0.112, 0.15], [0.118, 0.158], [0.106, 0.158], [0.104, 0.012], [0, 0.012]];
    place(THREE, group, lathe(THREE, profile, 24), copper, [hob.x, 0.916, hob.z]);
    // Loop handles out of each side: half a torus, turned to bulge away from the pot.
    for (const side of [-1, 1])
        place(THREE, group, new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), copper, [hob.x + side * 0.112, 1.03, hob.z], [0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
    const soupMaterial = surface(THREE, "#7a4a26", { roughness: 0.3, flat: false });
    const soupGeometry = new THREE.CircleGeometry(0.104, 24);
    soupGeometry.rotateX(-Math.PI / 2);
    const soup = place(THREE, group, soupGeometry, soupMaterial, [hob.x, 1.05, hob.z]);
    soup.name = "kitchen-pot-soup";
    soup.visible = false;
    const lid = new THREE.Group();
    lid.name = "kitchen-pot-lid";
    // A shallow dome: a cap off a 0.2 m sphere, wide enough at its rim (0.113 m) to cover the pot.
    place(THREE, lid, new THREE.SphereGeometry(0.2, 24, 6, 0, Math.PI * 2, 0, 0.6), copper, [0, -0.166, 0]);
    place(THREE, lid, new THREE.SphereGeometry(0.018, 10, 8), brass(THREE), [0, 0.045, 0]);
    lid.position.set(KITCHEN_ANCHORS.lidRest.x, KITCHEN_ANCHORS.lidRest.y, KITCHEN_ANCHORS.lidRest.z);
    group.add(lid);
    // A kettle on the other plate.
    const { kettle } = KITCHEN_ANCHORS;
    const kettleProfile = [[0, 0], [0.08, 0], [0.095, 0.03], [0.09, 0.09], [0.06, 0.13], [0.02, 0.14], [0, 0.15]];
    place(THREE, group, lathe(THREE, kettleProfile, 20), surface(THREE, "#3f6f9a", { roughness: 0.3, flat: false }), [kettle.x, 0.916, kettle.z]);
    const spout = new THREE.CylinderGeometry(0.012, 0.02, 0.12, 8);
    place(THREE, group, spout, surface(THREE, "#3f6f9a", { roughness: 0.3, flat: false }), [kettle.x + 0.1, 0.99, kettle.z], [0, 0, -0.9]);
    place(THREE, group, new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI), iron(THREE), [kettle.x, 1.05, kettle.z], [0, 0, 0]);
    return { lid, soup };
}
/** The worktop: a painted cupboard with drawers, a butcher-block top, the board and knife, a crock, a shelf of jars. */
function buildWorktop(THREE, group) {
    const { board, plate } = KITCHEN_ANCHORS;
    const paint = farmMaterial(THREE, "wood", { colors: ["#8fa88a", "#6f8a6a", "#b4c9ae"], metresPerTile: 1.2, bumpScale: 0.006 });
    const block = farmMaterial(THREE, "wood", { colors: ["#c99a62", "#8a6240", "#e0b77a"], metresPerTile: 0.6 });
    const cupboard = { x: 0.57, width: 1.06 };
    tbox(THREE, group, [cupboard.width, 0.8, 0.64], [cupboard.x, 0.44, -0.03], paint);
    tbox(THREE, group, [cupboard.width, 0.04, 0.6], [cupboard.x, 0.02, -0.04], surface(THREE, "#3a3128", { roughness: 0.9 }));
    // Two drawers over two doors, each with a brass knob.
    const face = farmMaterial(THREE, "wood", { colors: ["#9ab594", "#7a9676", "#bdd2b7"], metresPerTile: 1.2, bumpScale: 0.006 });
    for (const x of [cupboard.x - 0.26, cupboard.x + 0.26]) {
        tbox(THREE, group, [0.48, 0.14, 0.02], [x, 0.74, 0.3], face);
        tbox(THREE, group, [0.48, 0.5, 0.02], [x, 0.36, 0.3], face);
        place(THREE, group, new THREE.SphereGeometry(0.016, 10, 8), brass(THREE), [x, 0.74, 0.32]);
        place(THREE, group, new THREE.SphereGeometry(0.016, 10, 8), brass(THREE), [x + (x < cupboard.x ? 0.2 : -0.2), 0.42, 0.32]);
    }
    tbox(THREE, group, [cupboard.width, 0.06, 0.72], [cupboard.x, 0.87, -0.02], block);
    // The chopping board and the knife beside it.
    tbox(THREE, group, [0.38, 0.024, 0.26], [board.x, board.y - 0.012, board.z], farmMaterial(THREE, "wood", { colors: ["#e0c089", "#b89868", "#f0d8a8"], metresPerTile: 0.4 }));
    const knife = new THREE.Group();
    knife.name = "kitchen-knife";
    place(THREE, knife, new THREE.BoxGeometry(0.16, 0.004, 0.03), surface(THREE, "#d8dde2", { roughness: 0.2, metalness: 0.9, flat: false }), [0.08, 0, 0]);
    place(THREE, knife, new THREE.BoxGeometry(0.1, 0.018, 0.022), surface(THREE, "#5d3a1f", { roughness: 0.8 }), [-0.05, 0, 0]);
    knife.position.set(board.x + 0.05, board.y + 0.01, board.z + 0.16);
    knife.rotation.y = -0.2;
    group.add(knife);
    // A crock of wooden spoons at the back corner.
    const crock = surface(THREE, "#6f8fb0", { roughness: 0.35, flat: false });
    tcylinder(THREE, group, 0.05, 0.045, 0.14, [1.0, 0.97, -0.24], crock, 16);
    for (const [dx, lean] of [[-0.015, -0.2], [0.01, 0.1], [0.02, 0.3]]) {
        const spoon = tcylinder(THREE, group, 0.006, 0.008, 0.26, [1.0 + dx, 1.08, -0.24], farmMaterial(THREE, "wood", { colors: ["#c9a06a", "#8a6a3a"] }), 6);
        spoon.rotation.z = lean;
    }
    // The shelf over the worktop, on two brackets, with the farm's jars and a salt pig.
    const shelfWood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128", "#a07650"] });
    tbox(THREE, group, [1.0, 0.03, 0.2], [0.57, 1.42, -0.27], shelfWood);
    for (const x of [0.15, 0.99])
        tbox(THREE, group, [0.03, 0.14, 0.16], [x, 1.34, -0.28], shelfWood);
    [["tomato-sauce", 0.25], ["berry-preserves", 0.43], ["orange-marmalade", 0.61]].forEach(([recipeId, x]) => {
        const recipe = findRecipe(recipeId);
        if (!recipe)
            return;
        const jar = createDishModel(THREE, recipe, 2);
        jar.position.set(x, 1.435, -0.27);
        group.add(jar);
    });
    tcylinder(THREE, group, 0.05, 0.06, 0.09, [0.86, 1.48, -0.27], surface(THREE, "#e9e2d2", { roughness: 0.4, flat: false }), 14);
    // A folded cloth where the plate will be set down.
    place(THREE, group, new THREE.BoxGeometry(0.26, 0.006, 0.22), tea(THREE), [plate.x, plate.y - 0.003, plate.z]);
}
/** The whole Kitchen Range, footprint 2.2 × 0.8 centred on the origin, facing +z. */
export function createKitchenRange(THREE) {
    const group = new THREE.Group();
    group.name = "kitchen-range";
    const { fire, oven } = buildRange(THREE, group);
    const { lid, soup } = buildPot(THREE, group);
    buildWorktop(THREE, group);
    // The splashback behind it all: one painted panel of tiles, mapped whole onto its face (not tiled by the metre).
    place(THREE, group, new THREE.BoxGeometry(2.2, 0.6, 0.03), tiles(THREE), [0, 1.2, -0.385]);
    const light = new THREE.PointLight(0xff8a3c, 0.4, 3.2, 1.8);
    light.position.set(KITCHEN_ANCHORS.firebox.x, 0.55, 0.6);
    group.add(light);
    let heat = 0;
    let ovenGlow = 0;
    let lidOpen = false;
    let time = 0;
    const handle = Object.freeze({
        setHeat: (value) => { heat = Math.min(1, Math.max(0, value)); },
        setOven: (value) => { ovenGlow = Math.min(1, Math.max(0, value)); },
        setLidOpen: (open) => { lidOpen = open; },
        setPotFill: (color) => {
            soup.visible = Boolean(color);
            if (color)
                soup.material.color.set(color);
        },
    });
    group.userData.kitchen = handle;
    return Object.freeze({
        group,
        animate: (dt) => {
            time += dt;
            const flicker = 0.9 + Math.sin(time * 12.3) * 0.06 + Math.sin(time * 27.1) * 0.04;
            fire.emissiveIntensity = (0.35 + heat * 2.4) * flicker;
            light.intensity = (0.4 + heat * 2.6) * flicker;
            oven.emissiveIntensity = ovenGlow * 2.2 * flicker;
            // The lid rides up and back when it is lifted, and rattles on a hot pot.
            const lift = lidOpen ? 1 : 0;
            lid.position.y += ((KITCHEN_ANCHORS.lidRest.y + lift * 0.1) - lid.position.y) * Math.min(1, dt * 10);
            lid.position.x += ((KITCHEN_ANCHORS.hob.x + lift * 0.1) - lid.position.x) * Math.min(1, dt * 10);
            lid.rotation.z = lift * -0.6 + (!lidOpen && heat > 0.6 ? Math.sin(time * 31) * 0.03 * heat : 0);
        },
    });
}
