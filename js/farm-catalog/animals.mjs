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
export const ANIMAL_HABITATS = Object.freeze(["ground", "water", "air"]);
export const ANIMAL_CLIP_FPS = 24;
/** The pack's shared frame table: every file uses the same four ranges. */
export const GOBKIT_CLIPS = Object.freeze({
    idle: Object.freeze({ from: 0, to: 29 }),
    attack: Object.freeze({ from: 30, to: 59 }),
    dead: Object.freeze({ from: 60, to: 89 }),
    walk: Object.freeze({ from: 90, to: 119 }),
});
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
    });
}
const petPalettes = (uncommonId, uncommonTitle, uncommonColors, rareId, rareTitle, rareColors, superRareId, superRareTitle, superRareColors) => Object.freeze([
    Object.freeze({ id: "standard", title: "Classic", tier: "classic", weight: 69, statBoost: 0, tint: "#ffffff" }),
    Object.freeze({ id: uncommonId, title: uncommonTitle, tier: "uncommon", weight: 24, statBoost: 0, tint: uncommonColors[0], colors: Object.freeze([...uncommonColors]) }),
    Object.freeze({ id: rareId, title: rareTitle, tier: "rare", weight: 6, statBoost: 0.08, tint: rareColors[0], colors: Object.freeze([...rareColors]) }),
    Object.freeze({ id: superRareId, title: superRareTitle, tier: "super-rare", weight: 1, statBoost: 0.15, tint: superRareColors[0], colors: Object.freeze([...superRareColors]), finish: "pearl" }),
]);
export const ANIMAL_CATALOG = Object.freeze([
    animal("corgi", { title: "Corgi", file: "corgi.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.5, turnRate: 3.2, palettes: petPalettes("sable", "Sable", ["#b96f32", "#7b4c32", "#dca45f"], "midnight", "Midnight", ["#24345f", "#4e63a6", "#d08a4f"], "cosmic", "Cosmic", ["#8a2be2", "#22d3ee", "#f6c453"]) }),
    animal("duck", { title: "Duck", file: "duck.glb", habitat: "ground", height: 0.5, radius: 0.35, walkSpeed: 0.9, turnRate: 3.4, palettes: petPalettes("mallard", "Mallard", ["#37694e", "#4c8172", "#d6a94f"], "lavender", "Lavender", ["#9367cf", "#b18ae3", "#f2a55f"], "prism", "Prism", ["#e553ff", "#5ee7f2", "#ffdd57"]) }),
    animal("red-panda", { title: "Red Panda", file: "red-panda.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.1, palettes: petPalettes("golden", "Golden", ["#bd7d2c", "#d3a24f", "#76513c"], "silver", "Silver", ["#7e8b9d", "#aebdce", "#dce6ef"], "celestial", "Celestial", ["#3348c8", "#49d7e8", "#f5ca55"]) }),
    animal("platypus", { title: "Platypus", file: "platypus.glb", habitat: "ground", height: 0.45, radius: 0.4, walkSpeed: 0.8, palettes: petPalettes("copper", "Copper", ["#a65e3e", "#ca825b", "#dfad75"], "moonstone", "Moonstone", ["#548c9a", "#82bdc1", "#c58bbd"], "opaline", "Opaline", ["#f08cc8", "#69d9d0", "#ffd07a"]) }),
    animal("hippo", { title: "Hippo", file: "hippo.glb", habitat: "ground", height: 1.3, radius: 0.85, walkSpeed: 0.7, turnRate: 1.4, palettes: petPalettes("rosy", "Rosy", ["#a66f78", "#c8919a", "#e0b3b1"], "slate", "Slate", ["#465c76", "#7189a0", "#b47f9e"], "nebula", "Nebula", ["#8d45d8", "#3a7bd5", "#ef66c8"]) }),
    animal("rhino", { title: "Rhino", file: "rhino.glb", habitat: "ground", height: 1.5, radius: 0.9, walkSpeed: 0.9, turnRate: 1.3, palettes: petPalettes("ochre", "Ochre", ["#92703b", "#b89455", "#d0af70"], "frost", "Frost", ["#76aac2", "#a9d4e2", "#d9edf1"], "crystal", "Crystal", ["#74e0ef", "#9c8cff", "#f2fbff"]) }),
    animal("bat", { title: "Bat", file: "bat.glb", habitat: "air", height: 0.5, radius: 0.35, walkSpeed: 1.8, turnRate: 4, hoverHeight: 1.6, palettes: petPalettes("ember", "Ember", ["#8f3f34", "#c36347", "#e79a58"], "ghost", "Ghost", ["#9faed1", "#d5ddef", "#b99bd7"], "eclipse", "Eclipse", ["#3d2b8f", "#19d3d1", "#ef5bd7"]) }),
    animal("shark", { title: "Shark", file: "shark.glb", habitat: "water", height: 1.2, radius: 0.8, walkSpeed: 1.4, turnRate: 1.8, hoverHeight: -0.45, palettes: petPalettes("tiger", "Tiger", ["#9f7b31", "#c8a950", "#5b4c32"], "albino", "Albino", ["#d894a2", "#f0c5cd", "#fff0e8"], "voidfin", "Voidfin", ["#172d6b", "#18c6d9", "#9b5de5"]) }),
    animal("anglerfish", { title: "Anglerfish", file: "anglerfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.7, hoverHeight: -0.3, palettes: petPalettes("ember", "Ember", ["#a7432f", "#d5693f", "#efac55"], "abyss", "Abyss", ["#302052", "#594083", "#2ac5b5"], "biolume", "Biolume", ["#0f7c78", "#28e66f", "#e8ff63"]) }),
    animal("jellyfish", { title: "Jellyfish", file: "jellyfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.4, turnRate: 1.5, hoverHeight: -0.2, palettes: petPalettes("sunset", "Sunset", ["#cb668f", "#ea95ad", "#f0b272"], "aurora", "Aurora", ["#2ebda9", "#527cdb", "#ce62d7"], "starborn", "Starborn", ["#5336d6", "#26e0d0", "#ff59c7"]) }),
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
/** The species the picker offers given what the farm has. Ground and air always; water once there is a pond. */
export function adoptableAnimals(habitats) {
    return ANIMAL_CATALOG.filter((entry) => entry.habitat !== "water" || habitats.water);
}
