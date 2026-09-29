// The farm's recipes, as DATA: what each dish takes, how it is cooked, what
// Cooking level teaches it, and what the finished dish LOOKS like. Pure — no
// THREE, no DOM, no imports — so the kitchen rules, the cooking game, the
// views and (mirrored) the API all read one list.
//
// A DISH IS A THING, NOT A LINE OF TEXT. Every recipe carries a `model`: the
// vessel it is served in and what is in it, which `farm-dish-models.mts`
// builds into a 3D dish. The same model is the plate that appears on the
// Kitchen Range when a cook finishes, the portrait on every card that lists
// it, and the stock on the Market's Kitchen counter.
//
// COOKING IS PLAYED. `steps` is the order of short games a cook goes through
// (`farm-cooking.mts`): chop at the board, stir the pot, hold a simmer, pull
// the bake. How well they go decides the dish's stars; what the recipe takes
// and the Cooking XP it pays are fixed here and, on an account farm, decided
// by the server (platform-api/src/services/farm-recipe-catalog.mts is its
// copy; a test holds the two equal).
//
// Ingredients are harvest-basket ids: the sixteen crops and the five fruits,
// and — since livestock — the herd's milk (`milk`, `milk-sheep`) for the
// dairy dishes, the hens' eggs (`egg`), and the Butcher's meat (`beef`, `pork`, `mutton`, `llama-meat`, `chicken-meat`). Every crop and fruit is wanted by at least one recipe. A recipe may also want
// FISH from the Cove's creel: a fish need (farm-fish.mts `parseFishNeed`) and a
// count. The cook takes the least valuable fish that will do, never a locked one.
export const COOK_STEP_TITLES = Object.freeze({
    chop: "Chop",
    stir: "Stir",
    simmer: "Simmer",
    bake: "Bake",
});
const bit = (shape, color, count, size = 1) => Object.freeze({ shape, color, count, size });
function model(spec) {
    return Object.freeze({
        vesselColor: spec.vesselColor ?? "#f1e9da",
        bits: Object.freeze([...(spec.bits ?? [])]),
        crust: spec.crust ?? "none",
        crustColor: spec.crustColor ?? "#d9a45a",
        cloth: spec.cloth ?? "",
        ...spec,
    });
}
function recipe(id, title, spec) {
    return Object.freeze({
        id, title, blurb: spec.blurb, minLevel: spec.minLevel, source: spec.source ?? "level", price: spec.price ?? 0,
        ingredients: Object.freeze({ ...spec.ingredients }),
        steps: Object.freeze([...spec.steps]),
        xp: spec.xp,
        fish: spec.fish ? Object.freeze({ ...spec.fish }) : null,
        model: model(spec.model),
    });
}
const FISH_WHITE = "#f1e6d4";
const BATTER = "#d99a3e";
const HERB = "#3f8a3a";
const CARROT = "#f08a24";
const POTATO = "#e6cf8e";
const GARLIC = "#f3ecd8";
const CREAM = "#fbf6ea";
// The Butcher's meat, cooked.
const BEEF = "#6b2e1e";
const PORK = "#c98a5e";
const SAUSAGE = "#9a4a2e";
const LLAMA = "#7a3f2a";
const CHICKEN = "#d99a55";
const EGG_WHITE = "#fbf8ef";
const YOLK = "#f5b52a";
export const LEVEL_RECIPE_CATALOG = Object.freeze([
    recipe("tomato-sauce", "Tomato Sauce", {
        blurb: "Slow-cooked tomatoes and garlic, sealed under a gingham cloth.",
        minLevel: 1, ingredients: { tomato: 3, garlic: 1 }, steps: ["chop", "simmer"], xp: 80,
        model: { vessel: "jar", vesselColor: "#d8eef0", fill: "#b5261e", cloth: "#c8423a", bits: [bit("leaf", HERB, 1, 1.2)] },
    }),
    recipe("garden-salad", "Garden Salad", {
        blurb: "Crisp cabbage, carrot and radish, tossed in a wooden bowl.",
        minLevel: 1, ingredients: { cabbage: 1, carrot: 1, radish: 1 }, steps: ["chop", "stir"], xp: 70,
        model: { vessel: "bowl", vesselColor: "#9a6a3e", fill: "#6aa84f", bits: [bit("leaf", "#a8d46a", 7, 1.1), bit("cube", CARROT, 6, 0.8), bit("half", "#d8455a", 4, 0.9)] },
    }),
    recipe("farmhouse-breakfast", "Farmhouse Breakfast", {
        blurb: "Two eggs sunny side up with fried potatoes and a grilled tomato.",
        minLevel: 2, ingredients: { egg: 2, potato: 1, tomato: 1 }, steps: ["chop", "bake"], xp: 100,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("round", EGG_WHITE, 2, 3), bit("round", YOLK, 2, 1.2), bit("cube", POTATO, 5, 1), bit("half", "#c9302c", 1, 1.6)] },
    }),
    recipe("farm-stew", "Farm Stew", {
        blurb: "Potato, carrot and garlic simmered thick. A farmhand's supper.",
        minLevel: 3, ingredients: { potato: 2, carrot: 1, garlic: 1 }, steps: ["chop", "simmer"], xp: 110,
        model: { vessel: "bowl", vesselColor: "#e9dcc4", fill: "#7a4a26", bits: [bit("cube", POTATO, 5), bit("cube", CARROT, 4, 0.85), bit("leaf", HERB, 2, 0.7)] },
    }),
    recipe("berry-yogurt", "Berry Yogurt", {
        blurb: "Sheep's milk set overnight, swirled with blueberries.",
        minLevel: 3, ingredients: { "milk-sheep": 2, blueberry: 2 }, steps: ["simmer", "stir"], xp: 120,
        model: { vessel: "cup", vesselColor: "#e8f0f4", fill: "#f5f1e8", bits: [bit("round", "#3f3a86", 6, 1.1), bit("round", "#6b5bc4", 3, 0.9)] },
    }),
    recipe("fish-and-chips", "Fish & Chips", {
        blurb: "Whatever bit this morning, battered and fried, with a heap of chips.",
        minLevel: 4, fish: { need: "rarity=common", count: 1 }, ingredients: { potato: 2 }, steps: ["chop", "simmer"], xp: 130,
        model: { vessel: "plate", vesselColor: "#f4efe6", fill: "#f4efe6", bits: [bit("wedge", BATTER, 2, 3.2), bit("wedge", "#f0d27a", 9, 1.3)] },
    }),
    recipe("pork-sausages", "Pork Sausages", {
        blurb: "Minced pork and garlic, twisted into links and fried brown.",
        minLevel: 4, ingredients: { pork: 2, garlic: 1 }, steps: ["chop", "stir"], xp: 130,
        model: { vessel: "plate", vesselColor: "#f4efe6", fill: "#f4efe6", bits: [bit("bean", SAUSAGE, 5, 3.4), bit("leaf", HERB, 2, 0.8)] },
    }),
    recipe("baked-apples", "Baked Apples", {
        blurb: "Whole apples baked soft in their own caramel.",
        minLevel: 5, ingredients: { apple: 4 }, steps: ["chop", "bake"], xp: 100,
        model: { vessel: "baking-dish", vesselColor: "#e6e0d4", fill: "#9a5a1e", bits: [bit("round", "#c9302c", 4, 4.6)] },
    }),
    recipe("fresh-butter", "Fresh Butter", {
        blurb: "Churned from the morning's milk and patted into a golden block.",
        minLevel: 5, ingredients: { milk: 3 }, steps: ["stir", "chop"], xp: 110,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("cube", "#f6dc7a", 1, 4.2), bit("leaf", HERB, 1, 0.7)] },
    }),
    recipe("chicken-corn-soup", "Chicken & Corn Soup", {
        blurb: "Shredded chicken, sweet corn and carrot in a golden broth.",
        minLevel: 5, ingredients: { "chicken-meat": 1, corn: 2, carrot: 1 }, steps: ["chop", "stir", "simmer"], xp: 140,
        model: { vessel: "bowl", vesselColor: "#e8dcc2", fill: "#e6c46a", bits: [bit("cube", CHICKEN, 5, 1), bit("kernel", "#f2c83a", 12), bit("round", CARROT, 4, 0.8)] },
    }),
    recipe("sunflower-seeds", "Toasted Sunflower Seeds", {
        blurb: "A paper twist of seeds, toasted and salted.",
        minLevel: 6, ingredients: { sunflower: 1 }, steps: ["chop", "bake"], xp: 90,
        model: { vessel: "bag", vesselColor: "#c9a878", fill: "#5a4a36", bits: [bit("seed", "#3b3326", 14, 1.8), bit("seed", "#d8cfb0", 8, 1.8)] },
    }),
    recipe("deviled-eggs", "Deviled Eggs", {
        blurb: "Hard-boiled eggs halved, the yolks whipped with garlic and piped back in.",
        minLevel: 6, ingredients: { egg: 3, garlic: 1 }, steps: ["simmer", "chop", "stir"], xp: 130,
        model: { vessel: "plate", vesselColor: "#3f6f9a", fill: "#3f6f9a", bits: [bit("half", EGG_WHITE, 6, 2), bit("round", YOLK, 6, 1)] },
    }),
    recipe("shepherds-pie", "Shepherd's Pie", {
        blurb: "Minced mutton and carrot under a ridged lid of mashed potato.",
        minLevel: 7, ingredients: { mutton: 2, potato: 2, carrot: 1 }, steps: ["chop", "stir", "bake"], xp: 170,
        model: { vessel: "baking-dish", vesselColor: "#e6e0d4", fill: "#6b3a24", crust: "crumble", crustColor: "#ecd59a", bits: [bit("cube", CARROT, 3, 0.7)] },
    }),
    recipe("berry-preserves", "Berry Preserves", {
        blurb: "Strawberries and blueberries cooked down and jarred for winter.",
        minLevel: 8, ingredients: { strawberry: 3, blueberry: 2 }, steps: ["stir", "simmer"], xp: 140,
        model: { vessel: "jar", vesselColor: "#d8eef0", fill: "#5a1d4a", cloth: "#3f6fb8", bits: [bit("round", "#d02e3a", 1, 1.1)] },
    }),
    recipe("garden-omelette", "Garden Omelette", {
        blurb: "A fluffy three-egg omelette folded over tomato and shredded cabbage.",
        minLevel: 8, ingredients: { egg: 3, tomato: 1, cabbage: 1 }, steps: ["chop", "stir", "bake"], xp: 160,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("half", "#f2d06a", 1, 4.4), bit("cube", "#c9302c", 3, 0.8), bit("leaf", "#8ab55a", 3, 0.9)] },
    }),
    recipe("grilled-snapper", "Grilled Snapper", {
        blurb: "A whole Red Snapper off the pier, grilled with garlic and tomato.",
        minLevel: 9, fish: { need: "species=fish.red-snapper", count: 1 }, ingredients: { garlic: 1, tomato: 1 }, steps: ["chop", "bake"], xp: 190,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("wedge", "#c8483a", 1, 5), bit("half", "#c9302c", 3, 1.1), bit("leaf", HERB, 2, 0.9)] },
    }),
    recipe("creamed-corn", "Creamed Corn", {
        blurb: "Sweet corn simmered soft in fresh milk.",
        minLevel: 9, ingredients: { corn: 2, milk: 1 }, steps: ["chop", "stir", "simmer"], xp: 190,
        model: { vessel: "bowl", vesselColor: "#e9dcc4", fill: "#f3e2a6", bits: [bit("kernel", "#f2c83a", 16), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("corn-chowder", "Corn Chowder", {
        blurb: "Sweet corn and potato in a creamy, peppery broth.",
        minLevel: 10, ingredients: { corn: 2, potato: 1, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 180,
        model: { vessel: "bowl", vesselColor: "#3f6f9a", fill: "#efe3b8", bits: [bit("kernel", "#f2c83a", 14), bit("cube", POTATO, 3, 0.9), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("roast-chicken", "Roast Chicken", {
        blurb: "Chicken roasted golden over potatoes, with a whole bulb of garlic.",
        minLevel: 10, ingredients: { "chicken-meat": 2, potato: 2, garlic: 1 }, steps: ["chop", "simmer", "bake"], xp: 210,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("half", CHICKEN, 1, 4.2), bit("half", POTATO, 4, 1.4), bit("round", GARLIC, 3, 0.9), bit("leaf", HERB, 2, 0.9)] },
    }),
    recipe("feta-salad", "Feta & Tomato Salad", {
        blurb: "Crumbly sheep's-milk feta over tomato and torn cabbage.",
        minLevel: 11, ingredients: { "milk-sheep": 3, tomato: 2, cabbage: 1 }, steps: ["chop", "stir"], xp: 210,
        model: { vessel: "bowl", vesselColor: "#3f6f9a", fill: "#6aa84f", bits: [bit("cube", "#f7f4ea", 7, 1.1), bit("half", "#c9302c", 4, 1), bit("leaf", "#a8d46a", 5, 1)] },
    }),
    recipe("bean-chili", "Bean Chili", {
        blurb: "Beans and tomatoes with a whole head of garlic. It bites back.",
        minLevel: 12, ingredients: { bean: 3, tomato: 2, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 200,
        model: { vessel: "bowl", vesselColor: "#b8452f", fill: "#8e2a16", bits: [bit("bean", "#5a2418", 9), bit("cube", "#c9302c", 3, 0.8), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("beef-stew", "Beef Stew", {
        blurb: "Chunks of beef braised soft with potato, carrot and garlic.",
        minLevel: 12, ingredients: { beef: 2, potato: 1, carrot: 1, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 230,
        model: { vessel: "bowl", vesselColor: "#3f6f9a", fill: "#5a2a18", bits: [bit("cube", BEEF, 6, 1.2), bit("cube", POTATO, 3, 0.9), bit("cube", CARROT, 3, 0.8), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("fish-tacos", "Fish Tacos", {
        blurb: "A reef fish, flaked into corn tortillas with cabbage and tomato.",
        minLevel: 13, fish: { need: "zone=reef", count: 1 }, ingredients: { corn: 1, tomato: 1, cabbage: 1 }, steps: ["chop", "stir", "bake"], xp: 230,
        model: { vessel: "plate", vesselColor: "#f2ece0", fill: "#f2ece0", bits: [bit("half", "#e8c46a", 3, 3.2), bit("cube", FISH_WHITE, 6, 0.9), bit("leaf", "#a8d46a", 4, 0.9), bit("cube", "#c9302c", 4, 0.6)] },
    }),
    recipe("strawberries-and-cream", "Strawberries & Cream", {
        blurb: "Ripe strawberries under a pour of cold, thick cream.",
        minLevel: 14, ingredients: { strawberry: 3, milk: 2 }, steps: ["chop", "stir"], xp: 230,
        model: { vessel: "cup", vesselColor: "#f2ece0", fill: CREAM, bits: [bit("half", "#d02e3a", 5, 1.4), bit("leaf", HERB, 1, 0.6)] },
    }),
    recipe("chicken-cacciatore", "Chicken Cacciatore", {
        blurb: "Hunter's-style chicken braised in tomato and garlic until it falls apart.",
        minLevel: 14, ingredients: { "chicken-meat": 2, tomato: 2, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 240,
        model: { vessel: "bowl", vesselColor: "#7a3a2a", fill: "#b5402e", bits: [bit("cube", CHICKEN, 5, 1.3), bit("half", "#c9302c", 3, 0.9), bit("leaf", HERB, 3, 0.8)] },
    }),
    recipe("roasted-roots", "Roasted Roots", {
        blurb: "Beetroot, carrot and radish roasted until the edges char.",
        minLevel: 15, ingredients: { beetroot: 2, carrot: 2, radish: 1 }, steps: ["chop", "bake"], xp: 220,
        model: { vessel: "plate", vesselColor: "#f4efe6", fill: "#f4efe6", bits: [bit("wedge", "#7a1f3d", 5, 1.8), bit("wedge", CARROT, 5, 1.7), bit("half", "#d8455a", 3, 1.5), bit("leaf", HERB, 2, 1)] },
    }),
    recipe("roast-pork", "Roast Pork & Apples", {
        blurb: "A pork joint roasted on a bed of apples until the crackling snaps.",
        minLevel: 16, ingredients: { pork: 2, apple: 2 }, steps: ["chop", "bake"], xp: 250,
        model: { vessel: "baking-dish", vesselColor: "#7a4a3a", fill: "#9a5a1e", bits: [bit("round", PORK, 1, 5.2), bit("round", "#c9302c", 4, 1.8)] },
    }),
    recipe("lagoon-fish-pie", "Lagoon Fish Pie", {
        blurb: "Two lagoon fish under a lid of mashed potato, baked golden.",
        minLevel: 17, fish: { need: "zone=lagoon", count: 2 }, ingredients: { potato: 2, carrot: 1 }, steps: ["chop", "stir", "bake"], xp: 270,
        model: { vessel: "baking-dish", vesselColor: "#e6e0d4", fill: "#f2dca0", crust: "crumble", crustColor: "#e6c27a", bits: [bit("cube", CARROT, 3, 0.7)] },
    }),
    recipe("custard-tart", "Custard Tart", {
        blurb: "A wobbling egg-and-milk custard, nutmeg-dusted, in a cornmeal crust.",
        minLevel: 17, ingredients: { egg: 3, milk: 2, corn: 1 }, steps: ["stir", "simmer", "bake"], xp: 270,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#f2dc8a", bits: [bit("seed", "#8a5a2b", 8, 0.8)], crustColor: "#d9a45a" },
    }),
    recipe("pumpkin-soup", "Pumpkin Soup", {
        blurb: "Served in the pumpkin it came from, with its seeds toasted on top.",
        minLevel: 18, ingredients: { pumpkin: 1, garlic: 1, carrot: 1 }, steps: ["chop", "simmer", "stir"], xp: 260,
        model: { vessel: "pumpkin", vesselColor: "#e8761c", fill: "#f09a3a", bits: [bit("seed", "#efe6c8", 6), bit("leaf", HERB, 1, 0.8)] },
    }),
    recipe("farmhouse-cheddar", "Farmhouse Cheddar", {
        blurb: "A wedge of sharp cheddar, pressed from a full churn of milk and aged.",
        minLevel: 19, ingredients: { milk: 5 }, steps: ["simmer", "stir", "chop"], xp: 300,
        model: { vessel: "plate", vesselColor: "#9a6a3e", fill: "#9a6a3e", bits: [bit("wedge", "#f0b43a", 1, 4.4), bit("cube", "#f0b43a", 4, 0.9)] },
    }),
    recipe("melon-sorbet", "Melon Sorbet", {
        blurb: "Watermelon and strawberry churned to ice on a summer afternoon.",
        minLevel: 20, ingredients: { watermelon: 1, strawberry: 2 }, steps: ["chop", "stir"], xp: 240,
        model: { vessel: "cup", vesselColor: "#cfe8ec", fill: "#f06a78", bits: [bit("round", "#f28a96", 3, 3), bit("round", "#d02e3a", 1, 1.4)] },
    }),
    recipe("moussaka", "Moussaka", {
        blurb: "Layers of eggplant and spiced mutton under a thick milk custard.",
        minLevel: 20, ingredients: { mutton: 2, eggplant: 2, milk: 1 }, steps: ["chop", "stir", "bake"], xp: 300,
        model: { vessel: "baking-dish", vesselColor: "#e6e0d4", fill: "#f2dca0", crust: "crumble", crustColor: "#e8c26a", bits: [bit("half", "#3d1f48", 3, 1.6)] },
    }),
    recipe("seared-tuna", "Seared Tuna", {
        blurb: "Thick slices of tuna from the Deep, seared at the edges and pink inside.",
        minLevel: 21, fish: { need: "species=fish.tuna", count: 1 }, ingredients: { garlic: 1, radish: 1 }, steps: ["chop", "bake"], xp: 320,
        model: { vessel: "plate", vesselColor: "#2f3a44", fill: "#2f3a44", bits: [bit("slice", "#c44a5a", 6, 2.4), bit("half", "#d8455a", 3, 0.8)] },
    }),
    recipe("chicken-pot-pie", "Chicken Pot Pie", {
        blurb: "Chicken, carrot and potato in a creamy sauce under an egg-glazed lattice.",
        minLevel: 21, ingredients: { "chicken-meat": 2, carrot: 1, potato: 1, milk: 1, egg: 1 }, steps: ["chop", "stir", "bake"], xp: 320,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#f1dca6", crust: "lattice", crustColor: "#d9973e", bits: [bit("cube", CHICKEN, 3, 1)] },
    }),
    recipe("stuffed-eggplant", "Stuffed Eggplant", {
        blurb: "Eggplant halves baked with a tomato-and-garlic filling.",
        minLevel: 22, ingredients: { eggplant: 2, tomato: 1, garlic: 1 }, steps: ["chop", "stir", "bake"], xp: 280,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#b5402e", bits: [bit("half", "#3d1f48", 2, 4.4), bit("leaf", HERB, 3, 1)] },
    }),
    recipe("surf-and-turf", "Surf & Turf", {
        blurb: "A seared beef steak beside a reef fish, with a garlic butter.",
        minLevel: 23, fish: { need: "zone=reef", count: 1 }, ingredients: { beef: 1, garlic: 1 }, steps: ["chop", "bake"], xp: 340,
        model: { vessel: "plate", vesselColor: "#2f3a44", fill: "#2f3a44", bits: [bit("slice", BEEF, 1, 4.4), bit("wedge", FISH_WHITE, 1, 3.4), bit("round", GARLIC, 3, 0.9)] },
    }),
    recipe("pear-tart", "Pear Tart", {
        blurb: "Fanned pear slices on a cornmeal crust.",
        minLevel: 24, ingredients: { pear: 4, corn: 1 }, steps: ["chop", "stir", "bake"], xp: 300,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#d9a64e", bits: [bit("slice", "#e3dc6a", 8, 2.3)], crustColor: "#c98a3e" },
    }),
    recipe("pumpkin-pie", "Pumpkin Pie", {
        blurb: "Spiced pumpkin custard set with milk in a cornmeal crust.",
        minLevel: 25, ingredients: { pumpkin: 1, milk: 2, corn: 1 }, steps: ["chop", "stir", "bake"], xp: 330,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#d9782a", bits: [bit("round", CREAM, 3, 1.2)], crustColor: "#d9a45a" },
    }),
    recipe("cauliflower-gratin", "Cauliflower Gratin", {
        blurb: "Cauliflower and potato baked under a golden crust.",
        minLevel: 26, ingredients: { cauliflower: 1, potato: 2, garlic: 1 }, steps: ["chop", "simmer", "bake"], xp: 320,
        model: { vessel: "baking-dish", vesselColor: "#f2ece0", fill: "#e8c26a", bits: [bit("round", "#f4ecd2", 6, 1.6), bit("round", "#a8621e", 10, 0.8)] },
    }),
    recipe("sushi-platter", "Sushi Platter", {
        blurb: "Two rare fish, sliced thin and laid out on cabbage-leaf rolls.",
        minLevel: 27, fish: { need: "rarity=rare", count: 2 }, ingredients: { cabbage: 1, radish: 1 }, steps: ["chop", "stir"], xp: 380,
        model: { vessel: "plate", vesselColor: "#1f2a30", fill: "#1f2a30", bits: [bit("round", "#f4f1ea", 6, 1.6), bit("slice", "#f08a6a", 6, 1.5), bit("leaf", "#6aa84f", 3, 1)] },
    }),
    recipe("andean-stew", "Andean Stew", {
        blurb: "Llama meat slow-cooked with potato and corn, the way the high valleys make it.",
        minLevel: 28, ingredients: { "llama-meat": 2, potato: 2, corn: 1 }, steps: ["chop", "stir", "simmer"], xp: 360,
        model: { vessel: "bowl", vesselColor: "#b8452f", fill: "#7a3a1e", bits: [bit("cube", LLAMA, 5, 1.2), bit("cube", POTATO, 3, 0.9), bit("kernel", "#f2c83a", 10)] },
    }),
    recipe("aged-pecorino", "Aged Pecorino", {
        blurb: "A hard sheep's-milk cheese, salted and aged until it snaps.",
        minLevel: 29, ingredients: { "milk-sheep": 6 }, steps: ["simmer", "stir", "chop"], xp: 380,
        model: { vessel: "plate", vesselColor: "#6b4a2e", fill: "#6b4a2e", bits: [bit("wedge", "#efe3c2", 1, 4.6), bit("slice", "#efe3c2", 3, 1.4)] },
    }),
    recipe("cherry-pie", "Cherry Pie", {
        blurb: "Dark cherries under a lattice top. The fair's blue-ribbon pie.",
        minLevel: 30, ingredients: { cherry: 6, corn: 1 }, steps: ["stir", "simmer", "bake"], xp: 360,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#8e1026", crust: "lattice", crustColor: "#d9a45a" },
    }),
    recipe("bouillabaisse", "Bouillabaisse", {
        blurb: "Three reef fish in a saffron-red broth. A fisherman's feast.",
        minLevel: 32, fish: { need: "zone=reef", count: 3 }, ingredients: { tomato: 2, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 430,
        model: { vessel: "bowl", vesselColor: "#3f6f9a", fill: "#c8542a", bits: [bit("cube", FISH_WHITE, 6, 1.1), bit("half", "#c9302c", 3, 0.9), bit("leaf", HERB, 2, 0.7)] },
    }),
    recipe("pot-roast", "Sunday Pot Roast", {
        blurb: "A whole beef joint roasted with carrots and potatoes. Feeds the whole farm.",
        minLevel: 33, ingredients: { beef: 3, carrot: 2, potato: 2 }, steps: ["chop", "simmer", "bake"], xp: 420,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("slice", BEEF, 4, 3), bit("wedge", CARROT, 4, 1.6), bit("half", POTATO, 4, 1.5), bit("leaf", HERB, 2, 0.9)] },
    }),
    recipe("peach-cobbler", "Peach Cobbler", {
        blurb: "Soft peaches under a buttery crumble, still bubbling.",
        minLevel: 34, ingredients: { peach: 4, corn: 1 }, steps: ["chop", "stir", "bake"], xp: 400,
        model: { vessel: "baking-dish", vesselColor: "#7a4a3a", fill: "#f2a15a", crust: "crumble", crustColor: "#d9a45a" },
    }),
    recipe("swordfish-steaks", "Swordfish Steaks", {
        blurb: "Swordfish from the Deep, grilled over coals and finished with orange.",
        minLevel: 36, fish: { need: "species=fish.swordfish", count: 1 }, ingredients: { orange: 1, garlic: 1 }, steps: ["chop", "bake"], xp: 470,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("slice", "#e8d6c0", 2, 4.2), bit("slice", "#f7b04a", 3, 1.4), bit("leaf", HERB, 2, 0.9)] },
    }),
    recipe("orange-marmalade", "Orange Marmalade", {
        blurb: "Bitter-sweet oranges, peel and all, set in a jar.",
        minLevel: 38, ingredients: { orange: 4 }, steps: ["chop", "stir", "simmer"], xp: 440,
        model: { vessel: "jar", vesselColor: "#e6f0e8", fill: "#e8761c", cloth: "#e8c23a", bits: [bit("slice", "#f7b04a", 2, 1.2)] },
    }),
]);
/** Recipe cards sold by Basil. These are never granted by the Cooking level tree. */
export const VENDOR_RECIPE_CATALOG = Object.freeze([
    recipe("summer-skewers", "Summer Skewers", {
        blurb: "Charred tomato, eggplant and corn threaded into a bright market supper.",
        minLevel: 1, source: "vendor", price: 180, ingredients: { tomato: 1, eggplant: 1, corn: 1 }, steps: ["chop", "bake"], xp: 120,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#e9eef2", bits: [bit("wedge", "#c9302c", 3, 1.4), bit("cube", "#47235a", 3, 1.3), bit("kernel", "#f2c83a", 7, 1)] },
    }),
    recipe("harvest-curry", "Harvest Curry", {
        blurb: "Pumpkin, cauliflower and beans simmered in a deep golden market curry.",
        minLevel: 1, source: "vendor", price: 320, ingredients: { pumpkin: 1, cauliflower: 1, bean: 2 }, steps: ["chop", "stir", "simmer"], xp: 210,
        model: { vessel: "bowl", vesselColor: "#356b70", fill: "#d58a24", bits: [bit("cube", "#ed8a24", 4, 1.2), bit("round", "#f4ecd2", 4, 1), bit("bean", "#6c2c1e", 6, 0.9)] },
    }),
    recipe("orchard-parfait", "Orchard Parfait", {
        blurb: "Layers of apple, peach and strawberry served cold in a market cup.",
        minLevel: 1, source: "vendor", price: 480, ingredients: { apple: 2, peach: 2, strawberry: 2 }, steps: ["chop", "stir"], xp: 190,
        model: { vessel: "cup", vesselColor: "#d8eef0", fill: "#f3e3c5", bits: [bit("slice", "#b7cf52", 3, 1.4), bit("wedge", "#f2a15a", 3, 1.3), bit("half", "#d02e3a", 3, 1)] },
    }),
    recipe("market-paella", "Market Paella", {
        blurb: "Tomato, beans, corn and garlic baked together for a crowded table.",
        minLevel: 1, source: "vendor", price: 700, ingredients: { tomato: 2, bean: 2, corn: 2, garlic: 1 }, steps: ["chop", "stir", "bake"], xp: 270,
        model: { vessel: "baking-dish", vesselColor: "#3b4652", fill: "#d4a42e", bits: [bit("cube", "#c9302c", 4, 0.9), bit("bean", "#6c2c1e", 7, 0.9), bit("kernel", "#f2c83a", 9, 0.8)] },
    }),
    recipe("five-fruit-crumble", "Five-Fruit Crumble", {
        blurb: "Apple, pear, peach, cherry and blueberry under a market-day crumble.",
        minLevel: 1, source: "vendor", price: 950, ingredients: { apple: 1, pear: 1, peach: 1, cherry: 2, blueberry: 2 }, steps: ["chop", "stir", "bake"], xp: 360,
        model: { vessel: "baking-dish", vesselColor: "#7a4a3a", fill: "#7d2842", crust: "crumble", crustColor: "#d9a45a", bits: [bit("round", "#332b70", 3, 0.7)] },
    }),
]);
export const RECIPE_CATALOG = Object.freeze([...LEVEL_RECIPE_CATALOG, ...VENDOR_RECIPE_CATALOG]);
export function findRecipe(id) {
    return typeof id === "string" ? RECIPE_CATALOG.find((entry) => entry.id === id) : undefined;
}
export const DISH_STARS = Object.freeze([1, 2, 3]);
/** The pantry keys a dish by recipe and stars: "farm-stew@2". */
export function dishKey(recipeId, stars) {
    return `${recipeId}@${stars}`;
}
export function parseDishKey(key) {
    if (typeof key !== "string")
        return null;
    const match = /^([a-z0-9-]+)@([123])$/.exec(key);
    const recipe = match ? findRecipe(match[1]) : undefined;
    return recipe ? Object.freeze({ recipe, stars: Number(match[2]) }) : null;
}
/** Every pantry key there can be, recipe by recipe, one star to three. */
export const DISH_KEYS = Object.freeze(RECIPE_CATALOG.flatMap((entry) => DISH_STARS.map((stars) => dishKey(entry.id, stars))));
/** The item the farm's Kitchen Range is. Free and starter-owned: every farm can cook. */
export const KITCHEN_RANGE_ITEM_ID = "decor.prop.kitchen-range";
