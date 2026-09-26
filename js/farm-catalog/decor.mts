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
// AN AQUATIC DWELLING LIVES IN A POND. `aquatic: true` says the item may only
// stand wholly inside a pond's shore line, on the bed; it is the one thing
// that may overlap a pond's box, and it travels with the pond when the pond
// is moved. The Water tab lists them beside the ponds (`farmDecorTab`).

export const FARM_DECOR_CATEGORIES = Object.freeze(["fence", "building", "plant", "water", "prop"] as const);
export type FarmDecorCategory = typeof FARM_DECOR_CATEGORIES[number];

export const FARM_DECOR_CATEGORY_TITLES: Readonly<Record<FarmDecorCategory, string>> = Object.freeze({
  fence: "Fences",
  building: "Buildings",
  plant: "Plants",
  water: "Water",
  prop: "Props",
});

export type FarmDecorLength = Readonly<{ enabled: boolean; min: number; max: number; default: number }>;
export type FarmDwelling = Readonly<{
  speciesId: string;
  /** The visible opening in metres; kept in data so art changes cannot silently stop fitting the resident. */
  entrance: Readonly<{ width: number; height: number }>;
}>;

/** A building's door: cut in the +z face at local x = 0, one or two leaves, swinging outward. */
export type BuildingDoor = Readonly<{
  width: number;
  height: number;
  leaves: 1 | 2;
  /** Metres the player must stand within of the door's centre to work it. */
  reach: number;
}>;

/**
 * How a building stands on its footprint. `walls` is four box walls; `round`
 * is `sides` flat faces on the footprint's inscribed circle (a silo, a tower);
 * `open` is a post at each corner and nothing else (a gazebo). The door, when
 * there is one, is always in the +z face.
 */
export type BuildingShell = Readonly<{
  kind: "walls" | "round" | "open";
  wallThickness: number;
  wallHeight: number;
  /** Faces of a round shell; ignored otherwise. */
  sides: number;
  door: BuildingDoor | null;
}>;

export type FarmDecorDefinition = Readonly<{
  id: string;
  title: string;
  category: FarmDecorCategory;
  /** The space it takes on the ground, in its own frame; a stretchable item's width is its `length`. */
  footprint: Readonly<{ width: number; depth: number }>;
  length: FarmDecorLength;
  /** Turns the walking player and the ground animals away. A flower bed is not solid; a wall is. */
  solid: boolean;
  /** Ground animals pick no destination inside it even when it is not solid (a pond's box, a building's box). */
  keepOut: boolean;
  /** A region animals of this habitat live in; only ponds today. */
  habitat: "water" | null;
  /** A pond: how deep its bed goes below the field, in metres. Null for everything that is not dug. */
  pond: Readonly<{ depth: number }> | null;
  /** Stands on a pond's bed, wholly under water; may not be placed on dry ground. */
  aquatic: boolean;
  /** A building the player walks into: its walls and door, or null for everything that is not a building. */
  shell: BuildingShell | null;
  /** A gate: a fence panel that swings. Solid while shut, worked with E within `reach`. */
  gate: Readonly<{ reach: number }> | null;
  /** The item has a door the player works with E: a shell's door or a gate. */
  doors: boolean;
  /** Must be placed wholly inside a building shell; walls and built-in fixtures still block it. */
  interior: boolean;
  /** Pet-home identity and the opening its procedural model draws, or null for ordinary decor. */
  dwelling: FarmDwelling | null;
  /** Rotation step for Q/R, in degrees. */
  snapDegrees: number;
  /** Two colours for the catalog card's chip when no render is available. */
  swatch: readonly [string, string];
  /** The builder in `farm-props.mts` that draws it. */
  model: string;
  unlock: Readonly<{ type: "starter" | "achievement" | "purchase"; source: string }>;
  /** Outcome-created props remain valid placed rows but do not appear in the add catalog. */
  catalogVisible: boolean;
}>;

const STARTER = Object.freeze({ type: "starter", source: "The Farm" } as const);
const PURCHASE = Object.freeze({ type: "purchase", source: "Farm Shop" } as const);
const PET_OUTCOME = Object.freeze({ type: "achievement", source: "Pet outcome" } as const);
const NO_LENGTH: FarmDecorLength = Object.freeze({ enabled: false, min: 0, max: 0, default: 0 });

type Spec = Readonly<{
  title: string;
  category: FarmDecorCategory;
  footprint: Readonly<{ width: number; depth: number }>;
  length?: Readonly<{ min: number; max: number; default: number }>;
  solid?: boolean;
  keepOut?: boolean;
  habitat?: "water";
  pond?: Readonly<{ depth: number }>;
  aquatic?: boolean;
  shell?: BuildingShell;
  gate?: Readonly<{ reach: number }>;
  interior?: boolean;
  dwelling?: FarmDwelling;
  snapDegrees?: number;
  swatch: readonly [string, string];
  model: string;
  unlock?: FarmDecorDefinition["unlock"];
  catalogVisible?: boolean;
}>;

function item(variant: string, spec: Spec): FarmDecorDefinition {
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
    dwelling: spec.dwelling ? Object.freeze({ speciesId: spec.dwelling.speciesId, entrance: Object.freeze({ ...spec.dwelling.entrance }) }) : null,
    snapDegrees: spec.snapDegrees ?? 15,
    swatch: Object.freeze([spec.swatch[0], spec.swatch[1]] as const),
    model: spec.model,
    unlock: spec.unlock ?? PURCHASE,
    catalogVisible: spec.catalogVisible ?? true,
  });
}

/** How long a fence run may be: a single panel up to the whole side of the field. */
const FENCE_LENGTH = Object.freeze({ min: 1, max: 28, default: 4 });

/** Shells. A door's reach is how close the player must be to work it; wide doors are worked from further off. */
function walls(wallHeight: number, door: BuildingDoor, wallThickness = 0.2): BuildingShell {
  return { kind: "walls", wallThickness, wallHeight, sides: 4, door };
}
function round(wallHeight: number, door: BuildingDoor, sides = 8, wallThickness = 0.2): BuildingShell {
  return { kind: "round", wallThickness, wallHeight, sides, door };
}
function open(wallHeight: number, wallThickness = 0.2): BuildingShell {
  return { kind: "open", wallThickness, wallHeight, sides: 4, door: null };
}
const DOUBLE_DOOR: BuildingDoor = Object.freeze({ width: 3, height: 2.7, leaves: 2, reach: 2.6 });
const STABLE_DOOR: BuildingDoor = Object.freeze({ width: 2.4, height: 2.5, leaves: 2, reach: 2.4 });
const GLASS_DOOR: BuildingDoor = Object.freeze({ width: 1.8, height: 2.2, leaves: 2, reach: 2.2 });
const SINGLE_DOOR: BuildingDoor = Object.freeze({ width: 1, height: 2.1, leaves: 1, reach: 1.9 });
const SMALL_DOOR: BuildingDoor = Object.freeze({ width: 0.9, height: 1.9, leaves: 1, reach: 1.8 });

export const FARM_DECOR_CATALOG: readonly FarmDecorDefinition[] = Object.freeze([
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
  item("cottage", { title: "Farmhouse", category: "building", footprint: { width: 6, depth: 5 }, keepOut: true, shell: walls(3, SINGLE_DOOR, 0.24), swatch: ["#f1e6d2", "#7a4a3a"], model: "cottage" }),
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
  item("bench", { title: "Garden Bench", category: "prop", footprint: { width: 1.6, depth: 0.6 }, swatch: ["#8a5a34", "#5d3a1f"], model: "bench" }),
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
  item("pet-tombstone", { title: "Pet Memorial", category: "prop", footprint: { width: 0.72, depth: 0.34 }, swatch: ["#a7a39a", "#5d5952"], model: "pet-tombstone", unlock: PET_OUTCOME, catalogVisible: false }),
  item("wheelbarrow", { title: "Wheelbarrow", category: "prop", footprint: { width: 0.7, depth: 1.5 }, swatch: ["#3f7228", "#8a5a34"], model: "wheelbarrow" }),
  item("wagon", { title: "Hay Wagon", category: "prop", footprint: { width: 1.6, depth: 2.8 }, swatch: ["#8a5a34", "#d8b24a"], model: "wagon" }),
  item("barrel", { title: "Barrel", category: "prop", footprint: { width: 0.7, depth: 0.7 }, swatch: ["#7a4a2a", "#3b3b3b"], model: "barrel" }),
  item("crates", { title: "Crate Stack", category: "prop", footprint: { width: 1.2, depth: 1 }, swatch: ["#c9a06a", "#8a5a34"], model: "crates" }),
  item("log-pile", { title: "Log Pile", category: "prop", footprint: { width: 1.6, depth: 0.9 }, swatch: ["#9a7248", "#5d3a1f"], model: "log-pile" }),
  item("campfire", { title: "Campfire", category: "prop", footprint: { width: 1.2, depth: 1.2 }, swatch: ["#ff8a2b", "#4a3a33"], model: "campfire" }),
  item("birdbath", { title: "Birdbath", category: "prop", footprint: { width: 0.7, depth: 0.7 }, swatch: ["#b9bec4", "#3f7fb8"], model: "birdbath" }),
  item("signpost", { title: "Signpost", category: "prop", footprint: { width: 0.3, depth: 0.3 }, swatch: ["#8a5a34", "#f1e6d2"], model: "signpost" }),
  item("mailbox", { title: "Mailbox", category: "prop", footprint: { width: 0.3, depth: 0.5 }, swatch: ["#2b4a8a", "#8a5a34"], model: "mailbox" }),
  item("water-pump", { title: "Water Pump", category: "prop", footprint: { width: 0.5, depth: 0.8 }, swatch: ["#2b2b2b", "#8e8b82"], model: "water-pump" }),
  item("beehive", { title: "Beehive", category: "prop", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#f1e6d2", "#ffd33d"], model: "beehive" }),
]);

export function findFarmDecor(id: unknown): FarmDecorDefinition | undefined {
  return typeof id === "string" ? FARM_DECOR_CATALOG.find((entry) => entry.id === id) : undefined;
}

/** The build-mode tab an item is listed under: its category, except that aquatic dwellings sit with the ponds they live in. */
export function farmDecorTab(definition: FarmDecorDefinition): FarmDecorCategory {
  return definition.aquatic ? "water" : definition.category;
}

export function farmDecorByCategory(category: FarmDecorCategory): readonly FarmDecorDefinition[] {
  return FARM_DECOR_CATALOG.filter((entry) => farmDecorTab(entry) === category && entry.catalogVisible);
}

export function allFarmDecorIds(): string[] {
  return FARM_DECOR_CATALOG.map((entry) => entry.id);
}

export function clampFarmDecorLength(definition: FarmDecorDefinition, length: number): number {
  if (!definition.length.enabled) return 0;
  if (!Number.isFinite(length)) return definition.length.default;
  return Number(Math.min(definition.length.max, Math.max(definition.length.min, length)).toFixed(4));
}

/** The footprint a placed row actually covers: a fence's is its length. */
export function farmDecorFootprint(definition: FarmDecorDefinition, row: Readonly<{ length: number }>): Readonly<{ width: number; depth: number }> {
  if (!definition.length.enabled) return definition.footprint;
  return { width: clampFarmDecorLength(definition, row.length || definition.length.default), depth: definition.footprint.depth };
}
