// The species catalog: every animal that can live on the farm, as DATA.
//
// One row per Gobkit file (`farm/assets/animals/`, CC0). A test asserts each
// row's GLB exists on disk, the way the jukebox catalog checks its records.
//
// HABITAT IS ON THE ROW FROM DAY ONE. The pack ships three swimmers, and the
// farm has no water yet; `adoptableAnimals({ water: false })` is how the
// picker leaves them out, and the pond slice turns them on by passing true —
// no catalog change, no new field.
//
// THE PACK SHIPS ONE 120-FRAME TRACK, NOT NAMED CLIPS. `clips` is the frame
// table `farm-animal-clips.mts` subclips it by, so the rest of the code can say
// "walk" the way the room's avatars do.
//
// THE HORSE IS THE ONE PET FROM ANOTHER PACK (planning-docs/FARM_RIDING_PLAN.md).
// It is the Quaternius horse in `farm/assets/yield-animals/`, so its row says
// so in `model`: the folder, the pack's clip NAMES (walk, trot, gallop, jump —
// riding plays all four) and, on each palette, which of the model's two flat
// materials is painted which colour. It is sold by Hollis the Livestock Dealer
// (`soldBy: "dealer"`), never adopted from the Pets panel, and it can be ridden.
export const ANIMAL_HABITATS = Object.freeze(["ground", "water", "air"]);
export const ANIMAL_CLIP_FPS = 24;
/** The pack's shared frame table: every file uses the same four ranges. */
export const GOBKIT_CLIPS = Object.freeze({
    idle: Object.freeze({ from: 0, to: 29 }),
    attack: Object.freeze({ from: 30, to: 59 }),
    dead: Object.freeze({ from: 60, to: 89 }),
    walk: Object.freeze({ from: 90, to: 119 }),
});
const GOBKIT_MODEL = Object.freeze({ kind: "gobkit" });
function animal(id, spec) {
    return Object.freeze({
        id: `pet.${id}`,
        title: spec.title,
        file: spec.file,
        habitat: spec.habitat,
        height: spec.height,
        radius: spec.radius,
        walkSpeed: spec.walkSpeed,
        turnRate: spec.turnRate ?? 2.4,
        hoverHeight: spec.hoverHeight ?? 0,
        palettes: Object.freeze(spec.palettes.map((palette) => Object.freeze({ ...palette }))),
        clips: GOBKIT_CLIPS,
        needs: spec.habitat === "water" ? "Needs a pond" : "",
        model: spec.model ?? GOBKIT_MODEL,
        soldBy: spec.soldBy ?? "adoption",
        ridable: spec.ridable ?? false,
        petGames: !spec.ridable,
    });
}
const palette = (spec, tier, weight, statBoost, finish) => {
    const [id, title, colors] = spec;
    return Object.freeze({ id, title, tier, weight, statBoost, tint: colors[0], colors: Object.freeze([...colors]), ...(finish ? { finish } : {}) });
};
const petPalettes = (uncommon, rare, superRare) => Object.freeze([
    Object.freeze({ id: "standard", title: "Classic", tier: "classic", weight: 51, statBoost: 0, tint: "#ffffff" }),
    ...uncommon.map((spec) => palette(spec, "uncommon", 14, 0)),
    palette(rare, "rare", 6, 0.08),
    palette(superRare, "super-rare", 1, 0.15, "pearl"),
]);
/** The Quaternius horse's two flat materials: the coat, and the mane, tail and hooves. */
export const HORSE_COAT_MATERIAL = "Material.003";
export const HORSE_MANE_MATERIAL = "Material.006";
const coat = ([id, title, body, mane], tier, weight, statBoost, finish) => Object.freeze({ id, title, tier, weight, statBoost, tint: body, materials: Object.freeze({ [HORSE_COAT_MATERIAL]: body, [HORSE_MANE_MATERIAL]: mane }), ...(finish ? { finish } : {}) });
/** Bay is the model as shipped; the rest repaint its coat and mane. Out of 100, like every pet's table. */
export const HORSE_PALETTES = Object.freeze([
    Object.freeze({ id: "standard", title: "Bay", tier: "classic", weight: 51, statBoost: 0, tint: "#ffffff" }),
    coat(["chestnut", "Chestnut", "#8a4521", "#5e2c14"], "uncommon", 14, 0),
    coat(["grey", "Grey", "#9c9a96", "#e2e0dc"], "uncommon", 14, 0),
    coat(["black", "Black", "#1e1c1b", "#0c0b0b"], "uncommon", 14, 0),
    coat(["palomino", "Palomino", "#d3a458", "#f4ead0"], "rare", 6, 0.08),
    coat(["starlight", "Starlight", "#e9e6ff", "#8ea6ff"], "super-rare", 1, 0.15, "pearl"),
]);
/** The pack's clip names; the horse's walk is the slow one and its trot the brisk one. */
export const HORSE_CLIPS = Object.freeze({ idle: "Idle", walk: "WalkSlow", attack: "Jump", dead: "Death", trot: "Walk", run: "Run", jump: "Jump" });
export const ANIMAL_CATALOG = Object.freeze([
    animal("corgi", { title: "Corgi", file: "corgi.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.5, turnRate: 3.2, palettes: petPalettes([["sable", "Sable", ["#b96f32", "#7b4c32", "#dca45f"]], ["cream", "Cream", ["#d8b47a", "#f0d9ad", "#a96f43"]], ["tricolor", "Tricolor", ["#352a25", "#eadbc4", "#b76536"]]], ["midnight", "Midnight", ["#24345f", "#4e63a6", "#d08a4f"]], ["cosmic", "Cosmic", ["#8a2be2", "#22d3ee", "#f6c453"]]) }),
    animal("duck", { title: "Duck", file: "duck.glb", habitat: "ground", height: 0.5, radius: 0.35, walkSpeed: 0.9, turnRate: 3.4, palettes: petPalettes([["mallard", "Mallard", ["#37694e", "#4c8172", "#d6a94f"]], ["pekin", "Pekin", ["#e7d9aa", "#fff1c4", "#e49a39"]], ["bluewing", "Bluewing", ["#52788d", "#7fa6b8", "#d3a24b"]]], ["lavender", "Lavender", ["#9367cf", "#b18ae3", "#f2a55f"]], ["prism", "Prism", ["#e553ff", "#5ee7f2", "#ffdd57"]]) }),
    animal("red-panda", { title: "Red Panda", file: "red-panda.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.1, palettes: petPalettes([["golden", "Golden", ["#bd7d2c", "#d3a24f", "#76513c"]], ["cinnamon", "Cinnamon", ["#934b35", "#c46f4c", "#e0ad79"]], ["snowcap", "Snowcap", ["#6f5a51", "#d8d0c5", "#a87b61"]]], ["silver", "Silver", ["#7e8b9d", "#aebdce", "#dce6ef"]], ["celestial", "Celestial", ["#3348c8", "#49d7e8", "#f5ca55"]]) }),
    animal("platypus", { title: "Platypus", file: "platypus.glb", habitat: "ground", height: 0.45, radius: 0.4, walkSpeed: 0.8, palettes: petPalettes([["copper", "Copper", ["#a65e3e", "#ca825b", "#dfad75"]], ["riverstone", "Riverstone", ["#596b70", "#87999b", "#b28a62"]], ["moss", "Moss", ["#596744", "#82905d", "#b99661"]]], ["moonstone", "Moonstone", ["#548c9a", "#82bdc1", "#c58bbd"]], ["opaline", "Opaline", ["#f08cc8", "#69d9d0", "#ffd07a"]]) }),
    animal("hippo", { title: "Hippo", file: "hippo.glb", habitat: "ground", height: 1.3, radius: 0.85, walkSpeed: 0.7, turnRate: 1.4, palettes: petPalettes([["rosy", "Rosy", ["#a66f78", "#c8919a", "#e0b3b1"]], ["mauve", "Mauve", ["#745a72", "#9c7995", "#c59bad"]], ["river", "River", ["#526c70", "#789396", "#afaaa0"]]], ["slate", "Slate", ["#465c76", "#7189a0", "#b47f9e"]], ["nebula", "Nebula", ["#8d45d8", "#3a7bd5", "#ef66c8"]]) }),
    animal("rhino", { title: "Rhino", file: "rhino.glb", habitat: "ground", height: 1.5, radius: 0.9, walkSpeed: 0.9, turnRate: 1.3, palettes: petPalettes([["ochre", "Ochre", ["#92703b", "#b89455", "#d0af70"]], ["sand", "Sand", ["#9d8c6b", "#c0ae89", "#dfcfaa"]], ["mossback", "Mossback", ["#586149", "#7f8964", "#aaa47d"]]], ["frost", "Frost", ["#76aac2", "#a9d4e2", "#d9edf1"]], ["crystal", "Crystal", ["#74e0ef", "#9c8cff", "#f2fbff"]]) }),
    animal("bat", { title: "Bat", file: "bat.glb", habitat: "air", height: 0.5, radius: 0.35, walkSpeed: 1.8, turnRate: 4, hoverHeight: 1.6, palettes: petPalettes([["ember", "Ember", ["#8f3f34", "#c36347", "#e79a58"]], ["cocoa", "Cocoa", ["#5a3b32", "#80594a", "#bd8062"]], ["dusky", "Dusky", ["#4f4a69", "#756d91", "#b08ca1"]]], ["ghost", "Ghost", ["#9faed1", "#d5ddef", "#b99bd7"]], ["eclipse", "Eclipse", ["#3d2b8f", "#19d3d1", "#ef5bd7"]]) }),
    animal("shark", { title: "Shark", file: "shark.glb", habitat: "water", height: 1.2, radius: 0.8, walkSpeed: 1.4, turnRate: 1.8, hoverHeight: -0.45, palettes: petPalettes([["tiger", "Tiger", ["#9f7b31", "#c8a950", "#5b4c32"]], ["blue", "Blue", ["#365e78", "#5d89a1", "#a9bec8"]], ["reef", "Reef", ["#39766f", "#63a096", "#d0b06a"]]], ["albino", "Albino", ["#d894a2", "#f0c5cd", "#fff0e8"]], ["voidfin", "Voidfin", ["#172d6b", "#18c6d9", "#9b5de5"]]) }),
    animal("anglerfish", { title: "Anglerfish", file: "anglerfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.7, hoverHeight: -0.3, palettes: petPalettes([["ember", "Ember", ["#a7432f", "#d5693f", "#efac55"]], ["scarlet", "Scarlet", ["#792d39", "#b7464c", "#e58a65"]], ["deepsea", "Deep Sea", ["#254b5a", "#397486", "#79a699"]]], ["abyss", "Abyss", ["#302052", "#594083", "#2ac5b5"]], ["biolume", "Biolume", ["#0f7c78", "#28e66f", "#e8ff63"]]) }),
    animal("jellyfish", { title: "Jellyfish", file: "jellyfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.4, turnRate: 1.5, hoverHeight: -0.2, palettes: petPalettes([["sunset", "Sunset", ["#cb668f", "#ea95ad", "#f0b272"]], ["lagoon", "Lagoon", ["#3a9299", "#68bdba", "#aad8c3"]], ["peach", "Peach", ["#d98979", "#efa99a", "#f6cfaa"]]], ["aurora", "Aurora", ["#2ebda9", "#527cdb", "#ce62d7"]], ["starborn", "Starborn", ["#5336d6", "#26e0d0", "#ff59c7"]]) }),
    animal("horse", { title: "Horse", file: "horse.glb", habitat: "ground", height: 1.65, radius: 0.95, walkSpeed: 1.2, turnRate: 1.6, palettes: HORSE_PALETTES,
        model: Object.freeze({ kind: "named", folder: "yield-animals", clips: HORSE_CLIPS, modelYaw: 0 }), soldBy: "dealer", ridable: true }),
]);
export function findAnimal(id) {
    return typeof id === "string" ? ANIMAL_CATALOG.find((entry) => entry.id === id) : undefined;
}
export function findAnimalPalette(speciesId, paletteId) {
    return typeof paletteId === "string" ? findAnimal(speciesId)?.palettes.find((palette) => palette.id === paletteId) : undefined;
}
export function pickAnimalPalette(speciesId, random) {
    const species = findAnimal(speciesId);
    if (!species)
        return undefined;
    const sample = random();
    const roll = Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0)) * species.palettes.reduce((sum, palette) => sum + palette.weight, 0);
    let cursor = 0;
    return species.palettes.find((palette) => (cursor += palette.weight) > roll) ?? species.palettes.at(-1);
}
export function allAnimalIds() {
    return ANIMAL_CATALOG.map((entry) => entry.id);
}
/** The species the Pets panel offers given what the farm has. Ground and air always; water once there is a pond. Never the Dealer's horse. */
export function adoptableAnimals(habitats) {
    return ANIMAL_CATALOG.filter((entry) => entry.soldBy === "adoption" && (entry.habitat !== "water" || habitats.water));
}
/** True for a species that can be mounted and ridden. */
export function isRidable(speciesId) {
    return findAnimal(speciesId)?.ridable === true;
}
