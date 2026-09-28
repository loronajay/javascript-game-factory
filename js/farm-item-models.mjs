// Every item the farm hands the player, as a model — one registry, one key
// scheme, so no list anywhere has to fall back to a word or a colour chip:
//
//   produce:<id>        a crop or a fruit from the harvest basket
//   log:<species>       a bundle of felled timber
//   sapling:<species>   a young tree, root-balled in burlap
//   supply:<itemId>     a sack of pet food
//   dish:<recipe>@<n>   a cooked dish with n stars (dish:<recipe> is two)
//   plank:<species>     a short stack of sawn planks
//   piece:<item>@<n>    a made piece of furniture in the finish of n stars
//
// Produce is `farm-produce-models.mts` and dishes `farm-dish-models.mts`;
// the goods that are not food live here. Models are built at true size, base
// on y = 0, so the same one can sit on a worktop or fill a card.
import { farmMaterial, tcylinder } from "./farm-materials.mjs";
import { findTreeSpecies } from "./farm-catalog/trees.mjs";
import { findRecipe, parseDishKey } from "./farm-catalog/recipes.mjs";
import { PET_CARE } from "./farm-pet-care.mjs";
import { createProduceModel } from "./farm-produce-models.mjs";
import { createDishModel } from "./farm-dish-models.mjs";
import { PLANK_SPECIES, parsePieceKey } from "./farm-catalog/carpentry.mjs";
import { findFarmDecor } from "./farm-catalog/decor.mjs";
import { createFurniturePiece } from "./farm-props-furniture.mjs";
import { lathe, leaf, paintedSurface, paintedTexture, place, surface, tint } from "./farm-item-geometry.mjs";
export const itemKey = Object.freeze({
    produce: (id) => `produce:${id}`,
    log: (speciesId) => `log:${speciesId}`,
    sapling: (speciesId) => `sapling:${speciesId}`,
    supply: (itemId) => `supply:${itemId}`,
    dish: (recipeId, stars = 2) => `dish:${recipeId}@${stars}`,
    plank: (speciesId) => `plank:${speciesId}`,
    piece: (itemId, stars = 2) => `piece:${itemId}@${stars}`,
});
export function parseItemKey(key) {
    const match = /^(produce|log|sapling|supply|dish|plank|piece):(.+)$/.exec(key);
    return match ? Object.freeze({ kind: match[1], id: match[2] }) : null;
}
// ---------------------------------------------------------------- logs
const BARK = Object.freeze({
    oak: ["#6b4a2e", "#3a2716", "#8a6240"],
    pine: ["#7a4a30", "#40261a", "#9a6a48"],
    birch: ["#ece8dc", "#2b2b2b", "#f8f5ec"],
    willow: ["#6f6453", "#3d362c", "#8e826c"],
});
const HEARTWOOD = Object.freeze({ oak: "#c99a62", pine: "#e0b77a", birch: "#efe0bf", willow: "#d6c09a" });
/** The sawn end of a log: growth rings round a darker heart. */
function endGrain(THREE, species) {
    const wood = HEARTWOOD[species] ?? "#c99a62";
    const texture = paintedTexture(THREE, 128, 128, (context, w, h) => {
        context.fillStyle = wood;
        context.fillRect(0, 0, w, h);
        context.strokeStyle = tint(wood, -0.28);
        for (let ring = 6; ring < w / 2; ring += 7) {
            context.lineWidth = ring % 3 === 0 ? 2 : 1;
            context.beginPath();
            context.arc(w / 2 + Math.sin(ring) * 1.5, h / 2, ring, 0, Math.PI * 2);
            context.stroke();
        }
        context.fillStyle = tint(wood, -0.35);
        context.beginPath();
        context.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
        context.fill();
    });
    return paintedSurface(THREE, wood, texture, { roughness: 0.9 });
}
function createLogModel(THREE, speciesId) {
    const species = findTreeSpecies(speciesId);
    if (!species || species.kind !== "timber")
        return null;
    const group = new THREE.Group();
    group.name = `log-${speciesId}`;
    const bark = farmMaterial(THREE, "bark", { colors: [...(BARK[speciesId] ?? BARK.oak)], metresPerTile: 0.35 });
    const face = endGrain(THREE, speciesId);
    const radius = 0.055;
    const length = 0.36;
    // Two logs side by side and one across the top of them: a woodpile's worth.
    const logs = [[0, radius, -radius * 1.02, 0], [0, radius, radius * 1.02, 0.12], [0.012, radius * 2.72, 0, -0.08]];
    for (const [x, y, z, turn] of logs) {
        const log = new THREE.Group();
        tcylinder(THREE, log, radius, radius * 1.04, length, [0, 0, 0], bark, 10);
        for (const side of [-1, 1]) {
            const cap = new THREE.CircleGeometry(radius * 0.94, 16);
            place(THREE, log, cap, face, [0, (side * length) / 2 + side * 0.0008, 0], [side * -Math.PI / 2, 0, 0]);
        }
        log.rotation.set(0, turn, Math.PI / 2);
        log.position.set(x, y, z);
        group.add(log);
    }
    return group;
}
// ---------------------------------------------------------------- saplings
function canopy(THREE, group, species, top) {
    const [light, mid, dark] = species.kind === "fruit" ? species.leaves : ["#5a9a3e", "#3f7f34", "#2f5f28"];
    const leafy = (color, radius, x, y, z) => place(THREE, group, new THREE.IcosahedronGeometry(radius * 1.45, 0), surface(THREE, color, { roughness: 0.8 }), [x * 1.4, y + (y - top) * 0.4 + radius * 0.4, z * 1.4], [x * 20, z * 20, 0]);
    switch (species.model) {
        case "pine":
            for (const [radius, y, height] of [[0.07, top - 0.02, 0.1], [0.052, top + 0.05, 0.09], [0.032, top + 0.11, 0.07]]) {
                place(THREE, group, new THREE.ConeGeometry(radius, height, 7), surface(THREE, "#2f6b3a", { roughness: 0.85 }), [0, y, 0]);
            }
            return;
        case "willow":
            leafy("#7fb35a", 0.06, 0, top + 0.02, 0);
            for (let index = 0; index < 9; index += 1) {
                const angle = (index / 9) * Math.PI * 2;
                const strand = new THREE.CylinderGeometry(0.004, 0.002, 0.09, 4);
                place(THREE, group, strand, surface(THREE, "#9ac46a"), [Math.cos(angle) * 0.055, top - 0.03, Math.sin(angle) * 0.055]);
            }
            return;
        case "birch":
            leafy("#8fc262", 0.05, 0.01, top + 0.02, 0);
            leafy("#7fb35a", 0.04, -0.03, top + 0.05, 0.01);
            return;
        default:
            leafy(mid, 0.058, 0, top + 0.02, 0);
            leafy(light, 0.044, 0.04, top + 0.035, 0.012);
            leafy(dark, 0.042, -0.035, top + 0.01, -0.01);
            if (species.kind === "fruit") {
                for (const [x, z] of [[0.045, 0.03], [-0.03, 0.04]]) {
                    place(THREE, group, new THREE.SphereGeometry(0.011, 8, 6), surface(THREE, species.fruitColor, { roughness: 0.35 }), [x, top - 0.012, z]);
                }
            }
    }
}
function createSaplingModel(THREE, speciesId) {
    const species = findTreeSpecies(speciesId);
    if (!species)
        return null;
    const group = new THREE.Group();
    group.name = `sapling-${speciesId}`;
    // Root-balled in burlap and tied off with twine, as a nursery sells it.
    place(THREE, group, new THREE.SphereGeometry(0.065, 10, 7), surface(THREE, "#b8955a", { roughness: 1 }), [0, 0.042, 0], [0, 0, 0], [1, 0.72, 1]);
    place(THREE, group, new THREE.TorusGeometry(0.03, 0.004, 4, 12), surface(THREE, "#8a6a3a", { roughness: 1 }), [0, 0.086, 0], [Math.PI / 2, 0, 0]);
    const barkColor = species.model === "birch" ? "#ece8dc" : "#6b4a2e";
    const height = 0.15;
    place(THREE, group, new THREE.CylinderGeometry(0.006, 0.009, height, 6), surface(THREE, barkColor, { roughness: 0.9 }), [0, 0.08 + height / 2, 0]);
    leaf(THREE, group, "#5a9a3e", 0.04, [0.012, 0.16, 0], [0, 0.5, -0.4]);
    canopy(THREE, group, species, 0.08 + height);
    return group;
}
// ---------------------------------------------------------------- pet food
const SACK_COLORS = Object.freeze({
    "food.dog-food": "#b8452f",
    "food.waterfowl-feed": "#3f7fb8",
    "food.bamboo-bites": "#5f9a3c",
    "food.river-grubs": "#7a5a34",
    "food.river-hay": "#c99a2e",
    "food.browse-bundle": "#6f8f4e",
    "food.fruit-mix": "#b8457a",
    "food.shark-feed": "#3f5f7a",
    "food.deep-sea-feed": "#30263f",
    "food.plankton-blend": "#2f9a8f",
});
function createSackModel(THREE, itemId) {
    const care = PET_CARE.find((entry) => entry.food.itemId === itemId);
    if (!care)
        return null;
    const color = SACK_COLORS[itemId] ?? "#8a6a3a";
    const group = new THREE.Group();
    group.name = `supply-${itemId}`;
    const profile = [[0, 0], [0.06, 0], [0.074, 0.02], [0.078, 0.08], [0.07, 0.15], [0.05, 0.18], [0.045, 0.19]];
    // The sack is kraft paper with the brand's colour printed round it and the feed's name on the front.
    // A lathe wraps from +z toward +x; the label sits an eighth of the way round, where a card's three-quarter view looks.
    const texture = paintedTexture(THREE, 512, 256, (context, w, h) => {
        context.fillStyle = "#d9c49a";
        context.fillRect(0, 0, w, h);
        context.fillStyle = color;
        context.fillRect(0, h * 0.22, w, h * 0.56);
        context.fillStyle = "#fff8e6";
        context.textAlign = "center";
        context.textBaseline = "middle";
        const words = care.food.title.toUpperCase().split(" ");
        const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : words;
        context.font = "800 34px Georgia, serif";
        lines.forEach((line, index) => context.fillText(line, w * 0.12, h / 2 + (index - (lines.length - 1) / 2) * 38, w * 0.2));
    });
    place(THREE, group, lathe(THREE, profile), paintedSurface(THREE, "#d9c49a", texture, { roughness: 0.95 }), [0, 0, 0]);
    // The folded, stitched top.
    place(THREE, group, new THREE.BoxGeometry(0.11, 0.035, 0.022), surface(THREE, "#cdb78c", { roughness: 1 }), [0, 0.2, 0]);
    place(THREE, group, new THREE.BoxGeometry(0.112, 0.004, 0.024), surface(THREE, tint(color, -0.2)), [0, 0.19, 0]);
    return group;
}
/** Compost: a small wooden pail heaped with dark crumbly soil and a few spent leaves. */
function createCompostModel(THREE) {
    const group = new THREE.Group();
    group.name = "supply-compost";
    const pail = [[0, 0], [0.07, 0], [0.074, 0.012], [0.084, 0.12], [0.078, 0.12], [0.068, 0.014], [0, 0.014]];
    place(THREE, group, lathe(THREE, pail), surface(THREE, "#8a5f38", { roughness: 0.9 }), [0, 0, 0]);
    // Two iron hoops round the staves.
    const iron = surface(THREE, "#4a4a4a", { roughness: 0.5 });
    for (const y of [0.03, 0.1])
        place(THREE, group, new THREE.TorusGeometry(0.073 + y * 0.1, 0.004, 6, 24), iron, [0, y, 0], [Math.PI / 2, 0, 0]);
    // The heap, domed above the rim, with a few crumbs and spent leaves on top.
    place(THREE, group, new THREE.SphereGeometry(0.078, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), surface(THREE, "#3b2a1c", { roughness: 1 }), [0, 0.11, 0], [0, 0, 0], [1, 0.55, 1]);
    const crumbs = surface(THREE, "#2a1e14", { roughness: 1 });
    for (const [x, z] of [[0.03, 0.02], [-0.035, 0.01], [0.005, -0.04], [-0.01, 0.035]])
        place(THREE, group, new THREE.SphereGeometry(0.012, 6, 5), crumbs, [x, 0.145, z]);
    leaf(THREE, group, "#8a7a3a", 0.05, [0.02, 0.152, -0.015], [0.2, 0.4, 0]);
    leaf(THREE, group, "#6f5a2c", 0.045, [-0.025, 0.15, 0.02], [-0.15, 2.1, 0]);
    return group;
}
// ---------------------------------------------------------------- planks
/** A short, slightly skewed stack of sawn planks in the species' own wood. */
export function createPlankModel(THREE, speciesId) {
    const species = PLANK_SPECIES.find((entry) => entry.id === speciesId) ?? PLANK_SPECIES[0];
    const group = new THREE.Group();
    const wood = farmMaterial(THREE, "wood", { colors: [species.color, species.grain, tint(species.color, 0.15)], metresPerTile: 0.5 });
    const layout = [[0, 0.02, 0, 0], [0.01, 0.06, 0.012, 0.05], [-0.015, 0.1, -0.01, -0.07]];
    for (const [x, y, z, turn] of layout) {
        const plank = place(THREE, group, new THREE.BoxGeometry(0.5, 0.036, 0.11), wood, [x, y, z]);
        plank.rotation.y = turn;
    }
    return group;
}
// ---------------------------------------------------------------- the registry
/** The model for an item key, or null for a key no item answers to. */
export function createFarmItemModel(THREE, key) {
    const parsed = parseItemKey(key);
    if (!parsed)
        return null;
    switch (parsed.kind) {
        // A graded key ("tomato@perfect") is still a tomato: the grade is on the label, not the model.
        case "produce": return createProduceModel(THREE, parsed.id.split("@")[0]);
        case "log": return createLogModel(THREE, parsed.id);
        case "sapling": return createSaplingModel(THREE, parsed.id);
        case "supply": return parsed.id === "compost" ? createCompostModel(THREE) : createSackModel(THREE, parsed.id);
        case "dish": {
            const dish = parseDishKey(parsed.id);
            if (dish)
                return createDishModel(THREE, dish.recipe, dish.stars);
            const recipe = findRecipe(parsed.id);
            return recipe ? createDishModel(THREE, recipe) : null;
        }
        case "plank": return PLANK_SPECIES.some((species) => species.id === parsed.id) ? createPlankModel(THREE, parsed.id) : null;
        case "piece": {
            const piece = parsePieceKey(parsed.id);
            const definition = piece ? findFarmDecor(piece.pattern.id) : undefined;
            return piece && definition ? createFurniturePiece(THREE, definition.model, piece.pattern.id, piece.stars) : null;
        }
    }
}
