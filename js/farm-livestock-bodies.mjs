// How livestock are drawn: the pets' bodies (`farm-pet-bodies.mts`) with the
// herd's options. The Quaternius pack names its clips (Idle, WalkSlow, Jump,
// Death) and colours its animals with a few flat materials named for what they
// are (a cow's "White" and "Black"), so a coat is a repaint of those materials
// by name and every other material keeps the pack's colour.
import { findLivestockCoat, findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { createPetBodies } from "./farm-pet-bodies.mjs";
export function livestockAssetUrl(species) {
    return new URL(`../farm/assets/yield-animals/${species.file}`, import.meta.url).toString();
}
/** The GLB's clips by state, by the names the species row gives them. A missing clip is null, never a throw. */
export function livestockClips(gltf, species) {
    const named = (name) => gltf.animations?.find((clip) => clip?.name === name) ?? null;
    return Object.freeze({
        idle: named(species.clips.idle),
        walk: named(species.clips.walk),
        attack: named(species.clips.attack),
        dead: named(species.clips.dead),
    });
}
/** A material repainted for a coat: the coat's colour for a material it names, the pack's own otherwise. */
export function paintLivestockMaterial(THREE, material, species, coatId) {
    const copy = material.clone();
    const color = findLivestockCoat(species.id, coatId)?.colors[String(material.name ?? "")];
    if (color)
        copy.color = new THREE.Color(color);
    copy.roughness = Math.max(copy.roughness ?? 0.8, 0.75);
    copy.metalness = 0;
    copy.needsUpdate = true;
    return copy;
}
export const LIVESTOCK_BODY_OPTIONS = Object.freeze({
    name: "livestock",
    lookup: (speciesId) => findLivestockSpecies(speciesId),
    assetUrl: livestockAssetUrl,
    clips: (_THREE, gltf, species) => livestockClips(gltf, species),
    paint: paintLivestockMaterial,
});
export function createLivestockBodies(THREE, scene) {
    return createPetBodies(THREE, scene, LIVESTOCK_BODY_OPTIONS);
}
