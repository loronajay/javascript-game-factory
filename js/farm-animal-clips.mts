// The Gobkit pack ships ONE 120-frame track per animal, not named clips. This
// seam cuts that track into `{ idle, attack, dead, walk }` by the species row's
// frame table, so everything downstream — bodies, thumbnails — plays clips by
// name the way the room's avatars do and never learns about frame numbers.
//
// THREE is injected (only `AnimationUtils.subclip` is used), so the cut is
// testable under node with a stub.

import { ANIMAL_CLIP_FPS, type AnimalClipTable } from "./farm-catalog/animals.mjs";

type ThreeNamespace = Record<string, any>;

/** The four clips every animal has, plus the riding gaits a named-clip model (the horse) adds. */
export type AnimalClips = Readonly<{ idle: any; attack: any; dead: any; walk: any; trot?: any; run?: any; jump?: any }>;

/** A named-clip model's clips by state (the horse: its walk, trot, gallop and jump). A missing clip is null. */
export function namedAnimalClips(gltf: Readonly<{ animations?: readonly any[] }>, names: Readonly<Record<string, string>>): AnimalClips {
  const named = (name: string | undefined): any => (name ? gltf.animations?.find((clip: any) => clip?.name === name) ?? null : null);
  return Object.freeze({
    idle: named(names.idle), walk: named(names.walk), attack: named(names.attack), dead: named(names.dead),
    trot: named(names.trot), run: named(names.run), jump: named(names.jump),
  });
}

export const ANIMAL_CLIP_NAMES = Object.freeze(["idle", "attack", "dead", "walk"] as const);

/** Cut the pack's single track into the four named clips. A missing track gives four nulls, not a throw. */
export function splitAnimalClips(THREE: ThreeNamespace, track: any, table: AnimalClipTable, fps = ANIMAL_CLIP_FPS): AnimalClips {
  if (!track) return { idle: null, attack: null, dead: null, walk: null };
  const cut = (name: keyof AnimalClipTable) => THREE.AnimationUtils.subclip(track, name, table[name].from, table[name].to, fps);
  return Object.freeze({ idle: cut("idle"), attack: cut("attack"), dead: cut("dead"), walk: cut("walk") });
}

/** The clip a loaded GLB's animation list should be cut from: the first (and only) track. */
export function animalTrack(gltf: Readonly<{ animations?: readonly any[] }>): any {
  return gltf.animations?.[0] ?? null;
}
