// The Gobkit pack ships ONE 120-frame track per animal, not named clips. This
// seam cuts that track into `{ idle, attack, dead, walk }` by the species row's
// frame table, so everything downstream — bodies, thumbnails — plays clips by
// name the way the room's avatars do and never learns about frame numbers.
//
// THREE is injected (only `AnimationUtils.subclip` is used), so the cut is
// testable under node with a stub.
import { ANIMAL_CLIP_FPS } from "./farm-catalog/animals.mjs";
export const ANIMAL_CLIP_NAMES = Object.freeze(["idle", "attack", "dead", "walk"]);
/** Cut the pack's single track into the four named clips. A missing track gives four nulls, not a throw. */
export function splitAnimalClips(THREE, track, table, fps = ANIMAL_CLIP_FPS) {
    if (!track)
        return { idle: null, attack: null, dead: null, walk: null };
    const cut = (name) => THREE.AnimationUtils.subclip(track, name, table[name].from, table[name].to, fps);
    return Object.freeze({ idle: cut("idle"), attack: cut("attack"), dead: cut("dead"), walk: cut("walk") });
}
/** The clip a loaded GLB's animation list should be cut from: the first (and only) track. */
export function animalTrack(gltf) {
    return gltf.animations?.[0] ?? null;
}
