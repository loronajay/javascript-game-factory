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
// A POND IS A HABITAT. `habitat: "water"` marks its footprint as the region
// the three swimmers live in, and the layout's `farmHabitats` reads it. The
// visual is an ellipse inscribed in the footprint, and the sim keeps swimmers
// inside that ellipse rather than the box.

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
  /** A building the player walks into: its walls and door, or null for everything that is not a building. */
  shell: BuildingShell | null;
  /** A gate: a fence panel that swings. Solid while shut, worked with E within `reach`. */
  gate: Readonly<{ reach: number }> | null;
  /** The item has a door the player works with E: a shell's door or a gate. */
  doors: boolean;
  /** Rotation step for Q/R, in degrees. */
  snapDegrees: number;
  /** Two colours for the catalog card's chip when no render is available. */
  swatch: readonly [string, string];
  /** The builder in `farm-props.mts` that draws it. */
  model: string;
  unlock: Readonly<{ type: "starter" | "achievement" | "purchase"; source: string }>;
}>;

const STARTER = Object.freeze({ type: "starter", source: "The Farm" } as const);
const NO_LENGTH: FarmDecorLength = Object.freeze({ enabled: false, min: 0, max: 0, default: 0 });

type Spec = Readonly<{
  title: string;
  category: FarmDecorCategory;
  footprint: Readonly<{ width: number; depth: number }>;
  length?: Readonly<{ min: number; max: number; default: number }>;
  solid?: boolean;
  keepOut?: boolean;
  habitat?: "water";
  shell?: BuildingShell;
  gate?: Readonly<{ reach: number }>;
  snapDegrees?: number;
  swatch: readonly [string, string];
  model: string;
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
    shell: spec.shell ? Object.freeze({ ...spec.shell, door: spec.shell.door ? Object.freeze({ ...spec.shell.door }) : null }) : null,
    gate: spec.gate ? Object.freeze({ ...spec.gate }) : null,
    doors: Boolean(spec.shell?.door) || Boolean(spec.gate),
    snapDegrees: spec.snapDegrees ?? 15,
    swatch: Object.freeze([spec.swatch[0], spec.swatch[1]] as const),
    model: spec.model,
    unlock: STARTER,
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
  item("post-rail", { title: "Post & Rail", category: "fence", footprint: { width: 4, depth: 0.14 }, length: FENCE_LENGTH, swatch: ["#8a5a34", "#5d3a1f"], model: "fence-post-rail" }),
  item("picket", { title: "Picket Fence", category: "fence", footprint: { width: 4, depth: 0.12 }, length: FENCE_LENGTH, swatch: ["#f1e6d2", "#c9b99c"], model: "fence-picket" }),
  item("stone-wall", { title: "Stone Wall", category: "fence", footprint: { width: 4, depth: 0.5 }, length: FENCE_LENGTH, swatch: ["#8e8b82", "#5f5c55"], model: "fence-stone-wall" }),
  item("split-rail", { title: "Split Rail", category: "fence", footprint: { width: 4, depth: 0.18 }, length: FENCE_LENGTH, swatch: ["#9a7248", "#5d3a1f"], model: "fence-split-rail" }),
  item("wire", { title: "Wire Fence", category: "fence", footprint: { width: 4, depth: 0.12 }, length: FENCE_LENGTH, swatch: ["#8a5a34", "#b9bec4"], model: "fence-wire" }),
  item("hedge", { title: "Hedgerow", category: "fence", footprint: { width: 4, depth: 0.7 }, length: FENCE_LENGTH, swatch: ["#3f8a46", "#2b6331"], model: "fence-hedge" }),
  item("gate", { title: "Gate", category: "fence", footprint: { width: 2.4, depth: 0.14 }, gate: { reach: 1.8 }, swatch: ["#8a5a34", "#f1e6d2"], model: "fence-gate" }),
  // Buildings: every one is a shell the player walks into. The footprint is the outer wall line.
  item("barn", { title: "Barn", category: "building", footprint: { width: 7, depth: 5.5 }, keepOut: true, shell: walls(3.4, DOUBLE_DOOR), swatch: ["#a8312b", "#4a3a33"], model: "barn" }),
  item("stable", { title: "Stable", category: "building", footprint: { width: 8, depth: 4.2 }, keepOut: true, shell: walls(2.9, STABLE_DOOR), swatch: ["#8a5a34", "#4a3a33"], model: "stable" }),
  item("cottage", { title: "Farmhouse", category: "building", footprint: { width: 6, depth: 5 }, keepOut: true, shell: walls(3, SINGLE_DOOR, 0.24), swatch: ["#f1e6d2", "#7a4a3a"], model: "cottage" }),
  item("greenhouse", { title: "Greenhouse", category: "building", footprint: { width: 5, depth: 3.6 }, keepOut: true, shell: walls(2.4, GLASS_DOOR, 0.12), swatch: ["#bfe6ee", "#f1e6d2"], model: "greenhouse" }),
  item("shed", { title: "Tool Shed", category: "building", footprint: { width: 3, depth: 2.4 }, keepOut: true, shell: walls(2.3, SINGLE_DOOR, 0.12), swatch: ["#6f7d86", "#3b444a"], model: "shed" }),
  item("coop", { title: "Chicken Coop", category: "building", footprint: { width: 2.8, depth: 2.4 }, keepOut: true, shell: walls(2.2, SMALL_DOOR, 0.12), swatch: ["#c98a4b", "#5d3a1f"], model: "coop" }),
  item("silo", { title: "Grain Silo", category: "building", footprint: { width: 3.4, depth: 3.4 }, keepOut: true, shell: round(6.5, SMALL_DOOR, 8, 0.16), snapDegrees: 45, swatch: ["#b9bec4", "#7e8790"], model: "silo" }),
  item("windmill", { title: "Windmill", category: "building", footprint: { width: 4, depth: 4 }, keepOut: true, shell: round(5.2, SINGLE_DOOR, 8, 0.24), snapDegrees: 45, swatch: ["#d9cdb5", "#5d3a1f"], model: "windmill" }),
  item("gazebo", { title: "Gazebo", category: "building", footprint: { width: 4, depth: 4 }, keepOut: true, shell: open(2.6, 0.18), swatch: ["#f1e6d2", "#4a3a33"], model: "gazebo" }),
  // Plants: a tree's footprint is its trunk (you walk under the canopy); beds are not solid.
  item("oak", { title: "Oak Tree", category: "plant", footprint: { width: 0.7, depth: 0.7 }, swatch: ["#3f7f34", "#5d3a1f"], model: "tree-oak" }),
  item("pine", { title: "Pine Tree", category: "plant", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#2f6b3a", "#4a3220"], model: "tree-pine" }),
  item("birch", { title: "Birch Tree", category: "plant", footprint: { width: 0.5, depth: 0.5 }, swatch: ["#e8e4d8", "#7fb35a"], model: "tree-birch" }),
  item("apple", { title: "Apple Tree", category: "plant", footprint: { width: 0.6, depth: 0.6 }, swatch: ["#4f9a3a", "#d43a3a"], model: "tree-apple" }),
  item("willow", { title: "Willow", category: "plant", footprint: { width: 0.8, depth: 0.8 }, swatch: ["#7fb35a", "#5d3a1f"], model: "tree-willow" }),
  item("bush", { title: "Hedge Bush", category: "plant", footprint: { width: 1.2, depth: 1 }, swatch: ["#4f9a3a", "#2f6b2a"], model: "bush" }),
  item("flower-bed", { title: "Flower Bed", category: "plant", footprint: { width: 2, depth: 1 }, solid: false, swatch: ["#ff6f91", "#5f9a3c"], model: "flower-bed" }),
  item("sunflowers", { title: "Sunflowers", category: "plant", footprint: { width: 2, depth: 0.8 }, solid: false, swatch: ["#ffd33d", "#4f9a3a"], model: "sunflowers" }),
  item("pumpkin-patch", { title: "Pumpkin Patch", category: "plant", footprint: { width: 2.4, depth: 1.6 }, solid: false, swatch: ["#e8792b", "#4f9a3a"], model: "pumpkin-patch" }),
  item("wheat", { title: "Wheat Patch", category: "plant", footprint: { width: 3, depth: 2 }, solid: false, swatch: ["#d8b24a", "#c9a03a"], model: "wheat" }),
  item("veg-rows", { title: "Vegetable Rows", category: "plant", footprint: { width: 3, depth: 2 }, solid: false, swatch: ["#5a3d24", "#4f9a3a"], model: "veg-rows" }),
  item("lavender", { title: "Lavender", category: "plant", footprint: { width: 2, depth: 0.8 }, solid: false, swatch: ["#9a7fd6", "#6f8f5a"], model: "lavender" }),
  item("stump", { title: "Tree Stump", category: "plant", footprint: { width: 0.8, depth: 0.8 }, swatch: ["#9a7248", "#5d3a1f"], model: "stump" }),
  // Water: the swimmers' home. Solid to the walker and ground animals so nobody wades in.
  item("pond-round", { title: "Round Pond", category: "water", footprint: { width: 5, depth: 5 }, keepOut: true, habitat: "water", swatch: ["#3f7fb8", "#7a5a34"], model: "pond" }),
  item("pond-long", { title: "Long Pond", category: "water", footprint: { width: 8, depth: 4.5 }, keepOut: true, habitat: "water", swatch: ["#3f7fb8", "#5f9a3c"], model: "pond" }),
  item("pond-lily", { title: "Lily Pond", category: "water", footprint: { width: 6, depth: 6 }, keepOut: true, habitat: "water", swatch: ["#3f7fb8", "#ff6f91"], model: "pond-lily" }),
  // Props.
  item("hay-bale", { title: "Hay Bale", category: "prop", footprint: { width: 1.4, depth: 1 }, swatch: ["#d8b24a", "#b08b2f"], model: "hay-bale" }),
  item("trough", { title: "Water Trough", category: "prop", footprint: { width: 1.8, depth: 0.7 }, swatch: ["#7e8790", "#3f7fb8"], model: "trough" }),
  item("scarecrow", { title: "Scarecrow", category: "prop", footprint: { width: 0.5, depth: 0.5 }, swatch: ["#d8b24a", "#8a5a34"], model: "scarecrow" }),
  item("well", { title: "Stone Well", category: "prop", footprint: { width: 1.6, depth: 1.6 }, swatch: ["#8e8b82", "#4a3a33"], model: "well" }),
  item("bench", { title: "Garden Bench", category: "prop", footprint: { width: 1.6, depth: 0.6 }, swatch: ["#8a5a34", "#5d3a1f"], model: "bench" }),
  item("lamp-post", { title: "Lamp Post", category: "prop", footprint: { width: 0.3, depth: 0.3 }, swatch: ["#2b2b2b", "#ffd9a0"], model: "lamp-post" }),
  item("doghouse", { title: "Doghouse", category: "prop", footprint: { width: 1.2, depth: 1.4 }, swatch: ["#a8312b", "#4a3a33"], model: "doghouse" }),
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

export function farmDecorByCategory(category: FarmDecorCategory): readonly FarmDecorDefinition[] {
  return FARM_DECOR_CATALOG.filter((entry) => entry.category === category);
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
