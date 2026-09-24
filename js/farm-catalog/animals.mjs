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
const petPalettes = (uncommonId, uncommonTitle, uncommonTint, rareId, rareTitle, rareTint) => Object.freeze([
    Object.freeze({ id: "standard", title: "Classic", weight: 70, tint: "#ffffff" }),
    Object.freeze({ id: uncommonId, title: uncommonTitle, weight: 24, tint: uncommonTint }),
    Object.freeze({ id: rareId, title: rareTitle, weight: 6, tint: rareTint }),
]);
export const ANIMAL_CATALOG = Object.freeze([
    animal("corgi", { title: "Corgi", file: "corgi.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.5, turnRate: 3.2, palettes: petPalettes("sable", "Sable", "#d8a16b", "midnight", "Midnight", "#65708e") }),
    animal("duck", { title: "Duck", file: "duck.glb", habitat: "ground", height: 0.5, radius: 0.35, walkSpeed: 0.9, turnRate: 3.4, palettes: petPalettes("mallard", "Mallard", "#6f9b79", "lavender", "Lavender", "#b89fd7") }),
    animal("red-panda", { title: "Red Panda", file: "red-panda.glb", habitat: "ground", height: 0.6, radius: 0.45, walkSpeed: 1.1, palettes: petPalettes("golden", "Golden", "#e0b45f", "silver", "Silver", "#aab6c8") }),
    animal("platypus", { title: "Platypus", file: "platypus.glb", habitat: "ground", height: 0.45, radius: 0.4, walkSpeed: 0.8, palettes: petPalettes("copper", "Copper", "#c58c64", "moonstone", "Moonstone", "#a9c7c8") }),
    animal("hippo", { title: "Hippo", file: "hippo.glb", habitat: "ground", height: 1.3, radius: 0.85, walkSpeed: 0.7, turnRate: 1.4, palettes: petPalettes("rosy", "Rosy", "#d6a5ab", "slate", "Slate", "#77889f") }),
    animal("rhino", { title: "Rhino", file: "rhino.glb", habitat: "ground", height: 1.5, radius: 0.9, walkSpeed: 0.9, turnRate: 1.3, palettes: petPalettes("ochre", "Ochre", "#c7a066", "frost", "Frost", "#aec7d6") }),
    animal("bat", { title: "Bat", file: "bat.glb", habitat: "air", height: 0.5, radius: 0.35, walkSpeed: 1.8, turnRate: 4, hoverHeight: 1.6, palettes: petPalettes("ember", "Ember", "#c67a5e", "ghost", "Ghost", "#ccd4e6") }),
    animal("shark", { title: "Shark", file: "shark.glb", habitat: "water", height: 1.2, radius: 0.8, walkSpeed: 1.4, turnRate: 1.8, hoverHeight: -0.45, palettes: petPalettes("tiger", "Tiger", "#c5ad63", "albino", "Albino", "#e7b8b8") }),
    animal("anglerfish", { title: "Anglerfish", file: "anglerfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.7, hoverHeight: -0.3, palettes: petPalettes("ember", "Ember", "#d07049", "abyss", "Abyss", "#665a9c") }),
    animal("jellyfish", { title: "Jellyfish", file: "jellyfish.glb", habitat: "water", height: 0.6, radius: 0.4, walkSpeed: 0.4, turnRate: 1.5, hoverHeight: -0.2, palettes: petPalettes("sunset", "Sunset", "#e5a0bd", "aurora", "Aurora", "#77c4b9") }),
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
