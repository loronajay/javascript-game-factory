// The farm's decor catalog: everything the player can put on the field, as
// DATA. Fences, buildings, plants, water and props.
//
// Pure like the rest of this folder — no THREE, no DOM — and validated under
// node: a test asserts every row names a prop `farm-props.mts` can draw, so a
// row without a builder fails CI rather than an empty spot in the field.
//
// EVERYTHING ON THE FIELD IS A ROW HERE. The barn, the trees, the hay and the
// trough that slice 1 hard-coded are catalog items now, and the starter farm
// is a layout of them (`farm-layout.mts`), so the player can move or remove
// any of it. The perimeter fence is four fence rows and a gate.
//
// A FENCE IS A STRETCHABLE ITEM. Its footprint's width is the row's `length`
// and the editor's end arrows pull it; two fences may cross or meet (they do
// not collide with each other), which is what lets a player pen a corner
// without fighting the overlap rule. Everything else collides.
//
// A BUILDING IS A SHELL YOU WALK INTO. Every building row carries a `shell`:
// box walls with a doorway cut in the +z face, round (octagonal) walls with
// the same doorway, or open posts with no walls at all. `farm-scene.mts`
// turns the shell into the walls the walker and the pet sim collide with, and
// `farm-props-buildings.mts` draws the same walls, so what the eye sees is what
// the body hits and there are no superficial doors: a door on a building is a
// door the player opens with E and goes through.
//
// A GATE IS A DOOR IN A FENCE. It is solid while shut and E swings it, so a
// pen with a gate really pens: the walker and the ground animals are held by
// it until somebody opens it. `gate` carries the reach the way a shell's door does.
//
// WHAT STANDS INSIDE A BUILDING IS DATA TOO. `farm-fixtures.mts` lists every
// building's furniture, lofts and ladders in the building's frame; the
// builders draw from that list and the walker collides with it, so a bench is
// never something the body slips through and a ladder always goes somewhere.
//
// A POND IS A HOLE YOU WALK INTO. `habitat: "water"` marks its footprint as
// the region the three swimmers live in, and the layout's `farmHabitats`
// reads it; `pond.depth` is how far its bed goes down. The pond is the
// ellipse inscribed in the footprint, dug into the field by the one profile
// in `farm-pond.mts`: the ground is cut away over it, the player walks down
// its bank into the water, and the swimmers use the whole volume. It is not
// solid — nothing walks through a wall there — but it is keep-out, so ground
// animals never pick the water as a place to stroll to.
//
// FURNITURE IS MADE, NOT BOUGHT. The `furniture` category is every piece the
// Carpenter's Workbench makes (`farm-catalog/carpentry.mts`, one pattern per
// row, the pattern's id IS the row's id). Its unlock is `crafted`: nothing
// here owns one — the farm's `inventory.furniture` counts how many of each
// piece, at each star level, the farm has made, and a placed row carries the
// stars of the piece it is. The Furniture tab lists what is on the shelf.
//
// AN AQUATIC DWELLING LIVES IN A POND. `aquatic: true` says the item may only
// stand wholly inside a pond's shore line, on the bed; it is the one thing
// that may overlap a pond's box, and it travels with the pond when the pond
// is moved. The Water tab lists them beside the ponds (`farmDecorTab`).
export const FARM_DECOR_CATEGORIES = Object.freeze(["fence", "building", "plant", "water", "prop", "furniture"]);
export const FARM_DECOR_CATEGORY_TITLES = Object.freeze({
    fence: "Fences",
    building: "Buildings",
    plant: "Plants",
    water: "Water",
    prop: "Props",
    furniture: "Furniture",
});
const STARTER = Object.freeze({ type: "starter", source: "The Farm" });
const PURCHASE = Object.freeze({ type: "purchase", source: "Farm Shop" });
const PET_OUTCOME = Object.freeze({ type: "achievement", source: "Pet outcome" });
const CRAFTED = Object.freeze({ type: "crafted", source: "Carpenter's Workbench" });
const NO_LENGTH = Object.freeze({ enabled: false, min: 0, max: 0, default: 0 });
function item(variant, spec) {
    return Object.freeze({
        id: `decor.${spec.category}.${variant}`,
        title: spec.title,
        category: spec.category,
        footprint: Object.freeze({ ...spec.footprint }),
        length: spec.length ? Object.freeze({ enabled: true, ...spec.length }) : NO_LENGTH,
        solid: spec.solid ?? true,
        keepOut: spec.keepOut ?? false,
        habitat: spec.habitat ?? null,
        pond: spec.pond ? Object.freeze({ ...spec.pond }) : null,
        aquatic: spec.aquatic ?? false,
        shell: spec.shell ? Object.freeze({ ...spec.shell, door: spec.shell.door ? Object.freeze({ ...spec.shell.door }) : null }) : null,
        gate: spec.gate ? Object.freeze({ ...spec.gate }) : null,
        doors: Boolean(spec.shell?.door) || Boolean(spec.gate),
        interior: spec.interior ?? false,
        indoors: spec.indoors ?? false,
        dwelling: spec.dwelling ? Object.freeze({ speciesId: spec.dwelling.speciesId, entrance: Object.freeze({ ...spec.dwelling.entrance }) }) : null,
        snapDegrees: spec.snapDegrees ?? 15,
        swatch: Object.freeze([spec.swatch[0], spec.swatch[1]]),
        model: spec.model,
        unlock: spec.unlock ?? PURCHASE,
        catalogVisible: spec.catalogVisible ?? true,
    });
}
/** How long a fence run may be: a single panel up to the whole side of the field. */
const FENCE_LENGTH = Object.freeze({ min: 1, max: 28, default: 4 });
/** Shells. A door's reach is how close the player must be to work it; wide doors are worked from further off. */
function walls(wallHeight, door, wallThickness = 0.2) {
    return { kind: "walls", wallThickness, wallHeight, sides: 4, door };
}
function round(wallHeight, door, sides = 8, wallThickness = 0.2) {
    return { kind: "round", wallThickness, wallHeight, sides, door };
}
function open(wallHeight, wallThickness = 0.2) {
    return { kind: "open", wallThickness, wallHeight, sides: 4, door: null };
}
const DOUBLE_DOOR = Object.freeze({ width: 3, height: 2.7, leaves: 2, reach: 2.6 });
const STABLE_DOOR = Object.freeze({ width: 2.4, height: 2.5, leaves: 2, reach: 2.4 });
const GLASS_DOOR = Object.freeze({ width: 1.8, height: 2.2, leaves: 2, reach: 2.2 });
const SINGLE_DOOR = Object.freeze({ width: 1, height: 2.1, leaves: 1, reach: 1.9 });
const SMALL_DOOR = Object.freeze({ width: 0.9, height: 1.9, leaves: 1, reach: 1.8 });
export const FARM_DECOR_CATALOG = Object.freeze([
    // Fences: stretchable, cross freely, and the walker treats them as walls.
    item("post-rail", { title: "Post & Rail", category: "fence", footprint: { width: 4, depth: 0.14 }, length: FENCE_LENGTH, swatch: ["#8a5a34", "#5d3a1f"], model: "fence-post-rail", unlock: STARTER }),
    item("picket", { title: "Picket Fence", category: "fence", footprint: { width: 4, depth: 0.12 }, length: FENCE_LENGTH, swatch: ["#f1e6d2", "#c9b99c"], model: "fence-picket" }),
    item("stone-wall", { title: "Stone Wall", category: "fence", footprint: { width: 4, depth: 0.5 }, length: FENCE_LENGTH, swatch: ["#8e8b82", "#5f5c55"], model: "fence-stone-wall" }),
    item("split-rail", { title: "Split Rail", category: "fence", footprint: { width: 4, depth: 0.18 }, length: FENCE_LENGTH, swatch: ["#9a7248", "#5d3a1f"], model: "fence-split-rail" }),
    item("wire", { title: "Wire Fence", category: "fence", footprint: { width: 4, depth: 0.12 }, length: FENCE_LENGTH, swatch: ["#8a5a34", "#b9bec4"], model: "fence-wire" }),
    item("hedge", { title: "Hedgerow", category: "fence", footprint: { width: 4, depth: 0.7 }, length: FENCE_LENGTH, swatch: ["#3f8a46", "#2b6331"], model: "fence-hedge" }),
    item("gate", { title: "Gate", category: "fence", footprint: { width: 2.4, depth: 0.14 }, gate: { reach: 1.8 }, swatch: ["#8a5a34", "#f1e6d2"], model: "fence-gate", unlock: STARTER }),
    // Buildings: every one is a shell the player walks into. The footprint is the outer wall line.
    item("barn", { title: "Barn", category: "building", footprint: { width: 7, depth: 5.5 }, keepOut: true, shell: walls(3.4, DOUBLE_DOOR), swatch: ["#a8312b", "#4a3a33"], model: "barn", unlock: STARTER }),
    item("stable", { title: "Stable", category: "building", footprint: { width: 8, depth: 4.2 }, keepOut: true, shell: walls(2.9, STABLE_DOOR), swatch: ["#8a5a34", "#4a3a33"], model: "stable" }),
    // The Farmhouse is the player's home, not a prop: every farm starts with one (a Kitchen Range already
    // inside), and it is big enough — 9 × 7 m, about 55 m² of floor — to furnish: the dining corner and the
    // hearth are built in, and the rest of the room is for a bed, a range and whatever else fits.
    item("cottage", { title: "Farmhouse", category: "building", footprint: { width: 9, depth: 7 }, keepOut: true, shell: walls(3, SINGLE_DOOR, 0.24), swatch: ["#f1e6d2", "#7a4a3a"], model: "cottage", unlock: STARTER }),
    item("greenhouse", { title: "Greenhouse", category: "building", footprint: { width: 5, depth: 3.6 }, keepOut: true, shell: walls(2.4, GLASS_DOOR, 0.12), swatch: ["#bfe6ee", "#f1e6d2"], model: "greenhouse" }),
    item("shed", { title: "Tool Shed", category: "building", footprint: { width: 3, depth: 2.4 }, keepOut: true, shell: walls(2.3, SINGLE_DOOR, 0.12), swatch: ["#6f7d86", "#3b444a"], model: "shed" }),
    item("coop", { title: "Chicken Coop", category: "building", footprint: { width: 2.8, depth: 2.4 }, keepOut: true, shell: walls(2.2, SMALL_DOOR, 0.12), swatch: ["#c98a4b", "#5d3a1f"], model: "coop" }),
    item("silo", { title: "Grain Silo", category: "building", footprint: { width: 3.4, depth: 3.4 }, keepOut: true, shell: round(6.5, SMALL_DOOR, 8, 0.16), snapDegrees: 45, swatch: ["#b9bec4", "#7e8790"], model: "silo" }),
    item("windmill", { title: "Windmill", category: "building", footprint: { width: 4, depth: 4 }, keepOut: true, shell: round(5.2, SINGLE_DOOR, 8, 0.24), snapDegrees: 45, swatch: ["#d9cdb5", "#5d3a1f"], model: "windmill" }),
    item("gazebo", { title: "Gazebo", category: "building", footprint: { width: 4, depth: 4 }, keepOut: true, shell: open(2.6, 0.18), swatch: ["#f1e6d2", "#4a3a33"], model: "gazebo" }),
    // Plants: a tree's footprint is its trunk (you walk under the canopy); beds are not solid.
    item("oak", { title: "Oak Tree", category: "plant", footprint: { width: 0.7, depth: 0.7 }, swatch: ["#3f7f34", "#5d3a1f"], model: "tree-oak", unlock: STARTER }),
    item("pine", { title: "Pine Tree", category: "plant", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#2f6b3a", "#4a3220"], model: "tree-pine" }),
    item("birch", { title: "Birch Tree", category: "plant", footprint: { width: 0.5, depth: 0.5 }, swatch: ["#e8e4d8", "#7fb35a"], model: "tree-birch" }),
    item("apple", { title: "Apple Tree", category: "plant", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#4f9a3a", "#d43a3a"], model: "tree-apple" }),
    item("willow", { title: "Willow", category: "plant", footprint: { width: 0.8, depth: 0.8 }, swatch: ["#7fb35a", "#5d3a1f"], model: "tree-willow" }),
    item("bush", { title: "Hedge Bush", category: "plant", footprint: { width: 1.2, depth: 1 }, swatch: ["#4f9a3a", "#2f6b2a"], model: "bush" }),
    // A Tree Plot is where a productive tree grows (farm-trees.mts): free and repeatable like a growing plot,
    // since how many trees may produce is capped by skill. Its footprint is the trunk it will hold.
    item("tree-plot", { title: "Tree Plot", category: "plant", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#6b4a2e", "#8e8b82"], model: "tree-plot", unlock: STARTER }),
    item("soil-patch", { title: "Growing Plot", category: "plant", footprint: { width: 3, depth: 2 }, solid: false, swatch: ["#5b3820", "#8a633c"], model: "soil-patch", unlock: STARTER }),
    item("flower-bed", { title: "Flower Bed", category: "plant", footprint: { width: 2, depth: 1 }, solid: false, swatch: ["#ff6f91", "#5f9a3c"], model: "flower-bed" }),
    item("sunflowers", { title: "Sunflowers", category: "plant", footprint: { width: 2, depth: 0.8 }, solid: false, swatch: ["#ffd33d", "#4f9a3a"], model: "sunflowers" }),
    item("lavender", { title: "Lavender", category: "plant", footprint: { width: 2, depth: 0.8 }, solid: false, swatch: ["#9a7fd6", "#6f8f5a"], model: "lavender" }),
    item("stump", { title: "Tree Stump", category: "plant", footprint: { width: 0.8, depth: 0.8 }, swatch: ["#9a7248", "#5d3a1f"], model: "stump" }),
    // Water: dug into the field. The player wades in; ground animals keep out; swimmers use the whole volume.
    item("pond-round", { title: "Round Pond", category: "water", footprint: { width: 5, depth: 5 }, solid: false, keepOut: true, habitat: "water", pond: { depth: 2 }, swatch: ["#3f7fb8", "#7a5a34"], model: "pond" }),
    item("pond-long", { title: "Long Pond", category: "water", footprint: { width: 8, depth: 4.5 }, solid: false, keepOut: true, habitat: "water", pond: { depth: 1.8 }, swatch: ["#3f7fb8", "#5f9a3c"], model: "pond" }),
    item("pond-lily", { title: "Lily Pond", category: "water", footprint: { width: 6, depth: 6 }, solid: false, keepOut: true, habitat: "water", pond: { depth: 2.4 }, swatch: ["#3f7fb8", "#ff6f91"], model: "pond-lily" }),
    // Props.
    item("hay-bale", { title: "Hay Bale", category: "prop", footprint: { width: 1.4, depth: 1 }, swatch: ["#d8b24a", "#b08b2f"], model: "hay-bale", unlock: STARTER }),
    item("trough", { title: "Water Trough", category: "prop", footprint: { width: 1.8, depth: 0.7 }, swatch: ["#7e8790", "#3f7fb8"], model: "trough", unlock: STARTER }),
    item("scarecrow", { title: "Scarecrow", category: "prop", footprint: { width: 0.5, depth: 0.5 }, swatch: ["#d8b24a", "#8a5a34"], model: "scarecrow" }),
    item("well", { title: "Stone Well", category: "prop", footprint: { width: 1.6, depth: 1.6 }, swatch: ["#8e8b82", "#4a3a33"], model: "well" }),
    item("bench", { title: "Garden Bench", category: "prop", footprint: { width: 1.6, depth: 0.6 }, indoors: true, swatch: ["#8a5a34", "#5d3a1f"], model: "bench" }),
    // The Kitchen Range is where the Cooking skill is played (farm-kitchen.mts): free, so every farm can cook,
    // and happy out in the yard as a summer kitchen or inside the Farmhouse beside the hearth.
    item("kitchen-range", { title: "Kitchen Range", category: "prop", footprint: { width: 2.2, depth: 0.8 }, indoors: true, swatch: ["#2f3236", "#b8452f"], model: "kitchen-range", unlock: STARTER }),
    // The Carpenter's Workbench is where the Carpentry skill is played (farm-workshop.mts): free like the range.
    item("workbench", { title: "Carpenter's Workbench", category: "prop", footprint: { width: 2, depth: 0.8 }, indoors: true, swatch: ["#9a7248", "#3b444a"], model: "workbench", unlock: STARTER }),
    // A farm's own Sawmill saws logs into planks for nothing; the Market Square's charges a fee per log.
    item("sawmill", { title: "Sawmill", category: "prop", footprint: { width: 3.4, depth: 1.6 }, swatch: ["#7a5534", "#b9bec4"], model: "sawmill" }),
    item("bed", { title: "Farmhouse Bed", category: "prop", footprint: { width: 1.35, depth: 2.1 }, interior: true, swatch: ["#f2e5ca", "#7d9bb8"], model: "bed" }),
    item("lamp-post", { title: "Lamp Post", category: "prop", footprint: { width: 0.3, depth: 0.3 }, swatch: ["#2b2b2b", "#ffd9a0"], model: "lamp-post" }),
    // Pet dwellings are regular placeable props. `keepOut` keeps random wandering from
    // clipping through their art; the entrance dimensions remain the contract for a
    // later deliberate sleep/enter action.
    item("doghouse", { title: "Doghouse", category: "prop", footprint: { width: 1.2, depth: 1.4 }, keepOut: true, dwelling: { speciesId: "pet.corgi", entrance: { width: 0.78, height: 0.72 } }, swatch: ["#a8312b", "#4a3a33"], model: "doghouse", unlock: STARTER }),
    item("duck-coop", { title: "Duck Coop", category: "prop", footprint: { width: 1.5, depth: 1.4 }, keepOut: true, dwelling: { speciesId: "pet.duck", entrance: { width: 0.7, height: 0.65 } }, swatch: ["#d6a35d", "#5d3a1f"], model: "dwelling-duck-coop" }),
    item("treetop-den", { title: "Treetop Den", category: "prop", footprint: { width: 2.2, depth: 1.8 }, keepOut: true, dwelling: { speciesId: "pet.red-panda", entrance: { width: 0.85, height: 0.85 } }, swatch: ["#8a5a34", "#5f8f48"], model: "dwelling-treetop-den" }),
    item("burrow-lodge", { title: "Burrow Lodge", category: "prop", footprint: { width: 1.8, depth: 1.5 }, keepOut: true, dwelling: { speciesId: "pet.platypus", entrance: { width: 0.75, height: 0.55 } }, swatch: ["#6f8f4e", "#6d4b2f"], model: "dwelling-burrow-lodge" }),
    item("mud-wallow-shelter", { title: "Mud-Wallow Shelter", category: "prop", footprint: { width: 3.4, depth: 2.8 }, keepOut: true, dwelling: { speciesId: "pet.hippo", entrance: { width: 1.55, height: 1.35 } }, swatch: ["#8b6548", "#c8ab78"], model: "dwelling-mud-wallow" }),
    item("rhino-shade", { title: "Rhino Shade", category: "prop", footprint: { width: 3.6, depth: 2.8 }, keepOut: true, dwelling: { speciesId: "pet.rhino", entrance: { width: 1.65, height: 1.55 } }, swatch: ["#d1ba83", "#75634b"], model: "dwelling-rhino-shade" }),
    item("roosting-box", { title: "Roosting Box", category: "prop", footprint: { width: 1.5, depth: 1.2 }, keepOut: true, dwelling: { speciesId: "pet.bat", entrance: { width: 0.7, height: 0.8 } }, swatch: ["#5d3a1f", "#30263f"], model: "dwelling-roosting-box" }),
    item("reef-grotto", { title: "Reef Grotto", category: "prop", footprint: { width: 3.4, depth: 2.5 }, keepOut: true, aquatic: true, dwelling: { speciesId: "pet.shark", entrance: { width: 1.45, height: 1.2 } }, swatch: ["#5d7180", "#d77858"], model: "dwelling-reef-grotto" }),
    item("darkwater-cave", { title: "Darkwater Cave", category: "prop", footprint: { width: 2.1, depth: 1.7 }, keepOut: true, aquatic: true, dwelling: { speciesId: "pet.anglerfish", entrance: { width: 0.75, height: 0.7 } }, swatch: ["#343247", "#5f7f92"], model: "dwelling-darkwater-cave" }),
    item("jellyfish-lagoon", { title: "Jellyfish Lagoon", category: "prop", footprint: { width: 2.4, depth: 2.4 }, keepOut: true, aquatic: true, dwelling: { speciesId: "pet.jellyfish", entrance: { width: 0.9, height: 0.9 } }, swatch: ["#67b6c7", "#d99ac6"], model: "dwelling-jellyfish-lagoon" }),
    // Dog toys are ordinary placed rows: owned from the start while progression is unlocked,
    // and cross-referenced by the corgi care row instead of being special-cased in the editor.
    item("tennis-ball", { title: "Tennis Ball", category: "prop", footprint: { width: 0.24, depth: 0.24 }, solid: false, snapDegrees: 45, swatch: ["#cbea45", "#f5f0d0"], model: "tennis-ball", unlock: STARTER }),
    item("rope-toy", { title: "Rope Toy", category: "prop", footprint: { width: 0.55, depth: 0.18 }, solid: false, snapDegrees: 45, swatch: ["#d9b36c", "#8c5638"], model: "rope-toy", unlock: STARTER }),
    item("bone", { title: "Bone", category: "prop", footprint: { width: 0.48, depth: 0.2 }, solid: false, snapDegrees: 45, swatch: ["#eee5ce", "#b8a98c"], model: "bone", unlock: STARTER }),
    // Every other species' three toys (farm-props-toys.mts), cross-referenced the same way by
    // its care row. Low toys are walked over; anything a body would stand against is solid.
    // A swimmer's toys are `aquatic`: they stand on a pond bed like its home.
    item("splash-tub", { title: "Splash Tub", category: "prop", footprint: { width: 0.8, depth: 0.8 }, solid: false, snapDegrees: 45, swatch: ["#9aa6ad", "#6fb6d9"], model: "toy-splash-tub" }),
    item("pecking-bell", { title: "Pecking Bell", category: "prop", footprint: { width: 0.3, depth: 0.3 }, solid: false, snapDegrees: 45, swatch: ["#d9b44a", "#6d4b2f"], model: "toy-pecking-bell" }),
    item("rubber-duckling", { title: "Rubber Duckling", category: "prop", footprint: { width: 0.22, depth: 0.22 }, solid: false, snapDegrees: 45, swatch: ["#f6d23b", "#f08a24"], model: "toy-rubber-duckling" }),
    item("bamboo-climber", { title: "Bamboo Climber", category: "prop", footprint: { width: 1, depth: 0.8 }, snapDegrees: 45, swatch: ["#9fbf5a", "#5f8f48"], model: "toy-bamboo-climber" }),
    item("pinecone-puzzle", { title: "Pinecone Puzzle", category: "prop", footprint: { width: 0.45, depth: 0.45 }, solid: false, snapDegrees: 45, swatch: ["#8a5a34", "#c89a5a"], model: "toy-pinecone-puzzle" }),
    item("leaf-hammock", { title: "Leaf Hammock", category: "prop", footprint: { width: 1.5, depth: 0.6 }, swatch: ["#5f8f48", "#8a5a34"], model: "toy-leaf-hammock" }),
    item("log-tunnel", { title: "Log Tunnel", category: "prop", footprint: { width: 1.2, depth: 0.55 }, snapDegrees: 45, swatch: ["#7a5534", "#4a321f"], model: "toy-log-tunnel" }),
    item("pebble-pile", { title: "Pebble Pile", category: "prop", footprint: { width: 0.55, depth: 0.55 }, solid: false, snapDegrees: 45, swatch: ["#9aa0a2", "#72777a"], model: "toy-pebble-pile" }),
    item("paddle-pool", { title: "Paddle Pool", category: "prop", footprint: { width: 1.1, depth: 1.1 }, solid: false, snapDegrees: 45, swatch: ["#4fa3d9", "#e8e1cf"], model: "toy-paddle-pool" }),
    item("beach-ball", { title: "Beach Ball", category: "prop", footprint: { width: 0.7, depth: 0.7 }, snapDegrees: 45, swatch: ["#e8453c", "#2f7fd9"], model: "toy-beach-ball" }),
    item("scratching-post", { title: "Scratching Post", category: "prop", footprint: { width: 0.45, depth: 0.45 }, snapDegrees: 45, swatch: ["#c9a06a", "#8a5a34"], model: "toy-scratching-post" }),
    item("watermelon", { title: "Watermelon", category: "prop", footprint: { width: 0.55, depth: 0.4 }, solid: false, snapDegrees: 45, swatch: ["#3f7228", "#e8453c"], model: "toy-watermelon" }),
    item("tractor-tire", { title: "Tractor Tire", category: "prop", footprint: { width: 1.2, depth: 1.2 }, snapDegrees: 45, swatch: ["#2b2b2b", "#555555"], model: "toy-tractor-tire" }),
    item("scratch-boulder", { title: "Scratch Boulder", category: "prop", footprint: { width: 1, depth: 0.9 }, swatch: ["#928671", "#6e6555"], model: "toy-scratch-boulder" }),
    item("pushing-log", { title: "Pushing Log", category: "prop", footprint: { width: 1.6, depth: 0.45 }, snapDegrees: 45, swatch: ["#7a5534", "#c9a06a"], model: "toy-pushing-log" }),
    item("fruit-mobile", { title: "Fruit Mobile", category: "prop", footprint: { width: 0.4, depth: 0.4 }, swatch: ["#b8457a", "#f0a030"], model: "toy-fruit-mobile" }),
    item("moth-lantern", { title: "Moth Lantern", category: "prop", footprint: { width: 0.35, depth: 0.35 }, swatch: ["#2b2b2b", "#ffd9a0"], model: "toy-moth-lantern" }),
    item("swing-perch", { title: "Swing Perch", category: "prop", footprint: { width: 1.1, depth: 0.45 }, swatch: ["#5d3a1f", "#c9a06a"], model: "toy-swing-perch" }),
    item("chew-ring", { title: "Chew Ring", category: "prop", footprint: { width: 0.7, depth: 0.7 }, solid: false, aquatic: true, snapDegrees: 45, swatch: ["#f07a3a", "#f5f0d0"], model: "toy-chew-ring" }),
    item("sunken-chest", { title: "Sunken Chest", category: "prop", footprint: { width: 0.85, depth: 0.55 }, aquatic: true, swatch: ["#7a5534", "#d9b44a"], model: "toy-sunken-chest" }),
    item("kelp-garden", { title: "Kelp Garden", category: "prop", footprint: { width: 1, depth: 1 }, solid: false, aquatic: true, swatch: ["#3f7a3a", "#6f9a3c"], model: "toy-kelp-garden" }),
    item("glow-stone", { title: "Glow Stone", category: "prop", footprint: { width: 0.55, depth: 0.55 }, solid: false, aquatic: true, snapDegrees: 45, swatch: ["#343247", "#67d9d0"], model: "toy-glow-stone" }),
    item("old-anchor", { title: "Old Anchor", category: "prop", footprint: { width: 0.9, depth: 0.5 }, aquatic: true, swatch: ["#5a4a40", "#8a6a50"], model: "toy-old-anchor" }),
    item("bubble-stone", { title: "Bubble Stone", category: "prop", footprint: { width: 0.5, depth: 0.5 }, solid: false, aquatic: true, snapDegrees: 45, swatch: ["#72777a", "#cfefff"], model: "toy-bubble-stone" }),
    item("glass-float", { title: "Glass Float", category: "prop", footprint: { width: 0.4, depth: 0.4 }, solid: false, aquatic: true, snapDegrees: 45, swatch: ["#6fc7b8", "#b8a98c"], model: "toy-glass-float" }),
    item("coral-fan", { title: "Coral Fan", category: "prop", footprint: { width: 0.8, depth: 0.3 }, solid: false, aquatic: true, swatch: ["#d99ac6", "#e86a8a"], model: "toy-coral-fan" }),
    item("current-spinner", { title: "Current Spinner", category: "prop", footprint: { width: 0.5, depth: 0.5 }, solid: false, aquatic: true, snapDegrees: 45, swatch: ["#67b6c7", "#f5f0d0"], model: "toy-current-spinner" }),
    item("pet-tombstone", { title: "Pet Memorial", category: "prop", footprint: { width: 0.72, depth: 0.34 }, swatch: ["#a7a39a", "#5d5952"], model: "pet-tombstone", unlock: PET_OUTCOME, catalogVisible: false }),
    item("wheelbarrow", { title: "Wheelbarrow", category: "prop", footprint: { width: 0.7, depth: 1.5 }, swatch: ["#3f7228", "#8a5a34"], model: "wheelbarrow" }),
    item("wagon", { title: "Hay Wagon", category: "prop", footprint: { width: 1.6, depth: 2.8 }, swatch: ["#8a5a34", "#d8b24a"], model: "wagon" }),
    item("barrel", { title: "Barrel", category: "prop", footprint: { width: 0.7, depth: 0.7 }, indoors: true, swatch: ["#7a4a2a", "#3b3b3b"], model: "barrel" }),
    item("crates", { title: "Crate Stack", category: "prop", footprint: { width: 1.2, depth: 1 }, indoors: true, swatch: ["#c9a06a", "#8a5a34"], model: "crates" }),
    item("log-pile", { title: "Log Pile", category: "prop", footprint: { width: 1.6, depth: 0.9 }, indoors: true, swatch: ["#9a7248", "#5d3a1f"], model: "log-pile" }),
    item("campfire", { title: "Campfire", category: "prop", footprint: { width: 1.2, depth: 1.2 }, swatch: ["#ff8a2b", "#4a3a33"], model: "campfire" }),
    item("birdbath", { title: "Birdbath", category: "prop", footprint: { width: 0.7, depth: 0.7 }, swatch: ["#b9bec4", "#3f7fb8"], model: "birdbath" }),
    item("signpost", { title: "Signpost", category: "prop", footprint: { width: 0.3, depth: 0.3 }, swatch: ["#8a5a34", "#f1e6d2"], model: "signpost" }),
    item("mailbox", { title: "Mailbox", category: "prop", footprint: { width: 0.3, depth: 0.5 }, swatch: ["#2b4a8a", "#8a5a34"], model: "mailbox" }),
    item("water-pump", { title: "Water Pump", category: "prop", footprint: { width: 0.5, depth: 0.8 }, swatch: ["#2b2b2b", "#8e8b82"], model: "water-pump" }),
    item("beehive", { title: "Beehive", category: "prop", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#f1e6d2", "#ffd33d"], model: "beehive" }),
    // Furniture: made at the Workbench and counted, one row per pattern (farm-catalog/carpentry.mts). Happy indoors or out.
    item("crate", { title: "Wooden Crate", category: "furniture", footprint: { width: 0.8, depth: 0.8 }, indoors: true, swatch: ["#b98a55", "#8a6238"], model: "furniture-crate", unlock: CRAFTED }),
    item("planter-box", { title: "Planter Box", category: "furniture", footprint: { width: 1.4, depth: 0.5 }, indoors: true, swatch: ["#b98a55", "#ff6f91"], model: "furniture-planter-box", unlock: CRAFTED }),
    item("stool", { title: "Stool", category: "furniture", footprint: { width: 0.5, depth: 0.5 }, indoors: true, snapDegrees: 45, swatch: ["#b98a55", "#8a6238"], model: "furniture-stool", unlock: CRAFTED }),
    item("chair", { title: "Farmhouse Chair", category: "furniture", footprint: { width: 0.55, depth: 0.55 }, indoors: true, swatch: ["#b98a55", "#6f4a2d"], model: "furniture-chair", unlock: CRAFTED }),
    item("table", { title: "Kitchen Table", category: "furniture", footprint: { width: 1.6, depth: 0.9 }, indoors: true, swatch: ["#b98a55", "#8a6238"], model: "furniture-table", unlock: CRAFTED }),
    item("birdhouse", { title: "Birdhouse", category: "furniture", footprint: { width: 0.4, depth: 0.4 }, snapDegrees: 45, swatch: ["#dcb97c", "#a8312b"], model: "furniture-birdhouse", unlock: CRAFTED }),
    item("bookshelf", { title: "Bookshelf", category: "furniture", footprint: { width: 1.2, depth: 0.4 }, indoors: true, swatch: ["#dcb97c", "#3f6f9a"], model: "furniture-bookshelf", unlock: CRAFTED }),
    item("picnic-table", { title: "Picnic Table", category: "furniture", footprint: { width: 1.8, depth: 1.6 }, indoors: true, swatch: ["#dcb97c", "#b48a4e"], model: "furniture-picnic-table", unlock: CRAFTED }),
    item("storage-chest", { title: "Storage Chest", category: "furniture", footprint: { width: 1.1, depth: 0.6 }, indoors: true, swatch: ["#ead9b2", "#3b3b3b"], model: "furniture-storage-chest", unlock: CRAFTED }),
    item("rocking-chair", { title: "Rocking Chair", category: "furniture", footprint: { width: 0.7, depth: 1 }, indoors: true, swatch: ["#ead9b2", "#c7b287"], model: "furniture-rocking-chair", unlock: CRAFTED }),
    // An arch is walked under: only its feet would stop you, so it does not collide.
    item("garden-arch", { title: "Garden Arch", category: "furniture", footprint: { width: 1.6, depth: 0.6 }, solid: false, swatch: ["#ead9b2", "#d8405a"], model: "furniture-garden-arch", unlock: CRAFTED }),
    item("porch-swing", { title: "Porch Swing", category: "furniture", footprint: { width: 2.2, depth: 1.2 }, swatch: ["#9d6c45", "#b98a55"], model: "furniture-porch-swing", unlock: CRAFTED }),
    item("grandfather-clock", { title: "Grandfather Clock", category: "furniture", footprint: { width: 0.6, depth: 0.4 }, indoors: true, swatch: ["#9d6c45", "#d9b44a"], model: "furniture-grandfather-clock", unlock: CRAFTED }),
]);
export function findFarmDecor(id) {
    return typeof id === "string" ? FARM_DECOR_CATALOG.find((entry) => entry.id === id) : undefined;
}
/** The build-mode tab an item is listed under: its category, except that aquatic homes and toys sit with the ponds they live in. */
export function farmDecorTab(definition) {
    return definition.aquatic ? "water" : definition.category;
}
export function farmDecorByCategory(category) {
    return FARM_DECOR_CATALOG.filter((entry) => farmDecorTab(entry) === category && entry.catalogVisible);
}
export function allFarmDecorIds() {
    return FARM_DECOR_CATALOG.map((entry) => entry.id);
}
export function clampFarmDecorLength(definition, length) {
    if (!definition.length.enabled)
        return 0;
    if (!Number.isFinite(length))
        return definition.length.default;
    return Number(Math.min(definition.length.max, Math.max(definition.length.min, length)).toFixed(4));
}
/** The footprint a placed row actually covers: a fence's is its length. */
export function farmDecorFootprint(definition, row) {
    if (!definition.length.enabled)
        return definition.footprint;
    return { width: clampFarmDecorLength(definition, row.length || definition.length.default), depth: definition.footprint.depth };
}
