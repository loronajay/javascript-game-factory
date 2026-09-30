// The Cove's fish and tackle as models: load one, fit it to a specimen's real
// length, colour it Shiny or Golden, and take its portrait for a creel card.
//
// The fish are Quaternius's (farm/assets/fishing/, CC0), converted to GLB by
// farm/assets/fishing/tools/convert.py with their six clips: Swimming_Normal,
// Swimming_Fast, Swimming_Impulse, Attack, Death and Out_Of_Water (a landed
// fish flopping). They are skinned, and the vendored three has no
// SkeletonUtils to clone a skinned mesh, so every fish on screen is its own
// load — the browser's cache makes every load after the first free.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { findFishSpecies } from "./farm-catalog/fish.mjs";
import type { FishVariant } from "./farm-fish.mjs";
import { createModelThumbnails } from "./space-editor/model-thumbnails.mjs";

type ThreeNamespace = Record<string, any>;

/** In the pack a fish's nose points along the model's +z; the walker's yaw 0 faces −z. */
export const FISH_YAW_OFFSET = Math.PI;

export function fishAssetUrl(file: string): string {
  return new URL(`../farm/assets/fishing/${file}`, import.meta.url).toString();
}

export type LoadedFish = Readonly<{
  /** The model, scaled to the specimen and centred on its middle, facing the walker's yaw 0. */
  root: any;
  mixer: any;
  clips: Readonly<Record<string, any>>;
  /** Play a clip by the pack's name, cross-fading from the last. */
  play: (name: string, fade?: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}>;

/** Materials that are the fish's eyes, teeth or outline keep their colour whatever the fish's colouring. */
function isDetail(material: any): boolean {
  return /eye|black|teeth|tooth|white_eye|pupil/i.test(String(material?.name ?? ""));
}

/**
 * Colour a fish for its variant. Shiny turns its colours round the wheel and
 * lifts them; Golden plates it in gold. Eyes and teeth stay as they are.
 */
export function paintVariant(THREE: ThreeNamespace, model: any, variant: FishVariant): void {
  if (variant === "normal") return;
  model.traverse((node: any) => {
    if (!node.isMesh) return;
    const paint = (material: any): any => {
      if (isDetail(material)) return material;
      const next = material.clone();
      if (variant === "golden") {
        const hsl = { h: 0, s: 0, l: 0 };
        next.color.getHSL(hsl);
        // Bright and only half metal: with no environment to reflect, full metal reads as mud.
        next.color.setHSL(0.125, 0.95, 0.5 + hsl.l * 0.2);
        next.metalness = 0.35;
        next.roughness = 0.3;
        next.emissive = new THREE.Color("#7a5200");
        next.emissiveIntensity = 0.45;
      } else {
        next.color.offsetHSL(0.45, 0.25, 0.08);
        next.emissive = next.color.clone().multiplyScalar(0.18);
      }
      return next;
    };
    node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
  });
}

/** Scale a fish so it is `lengthM` from nose to tail, and centre it on its middle. */
export function fitFish(THREE: ThreeNamespace, model: any, lengthM: number): number {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const along = Math.max(size.z, 1e-3);
  const scale = lengthM / along;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const centre = fitted.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  return scale;
}

/** Load a fish of `speciesId`, `lengthM` long, coloured for `variant`. */
export function loadFish(THREE: ThreeNamespace, speciesId: string, lengthM: number, variant: FishVariant = "normal"): Promise<LoadedFish> {
  const species = findFishSpecies(speciesId);
  if (!species) return Promise.reject(new Error(`unknown fish ${speciesId}`));
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(fishAssetUrl(species.file), (gltf: any) => {
      const inner = gltf.scene;
      inner.traverse((node: any) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.frustumCulled = false;
        }
      });
      paintVariant(THREE, inner, variant);
      const root = new THREE.Group();
      const turn = new THREE.Group();
      turn.rotation.y = FISH_YAW_OFFSET;
      turn.add(inner);
      root.add(turn);
      fitFish(THREE, inner, lengthM);
      const mixer = new THREE.AnimationMixer(inner);
      const clips: Record<string, any> = {};
      for (const clip of gltf.animations ?? []) clips[clip.name] = clip;
      let current: any = null;
      const play = (name: string, fade = 0.25) => {
        const clip = clips[name];
        if (!clip) return;
        const action = mixer.clipAction(clip);
        if (current === action) return;
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.fadeIn(fade).play();
        current?.fadeOut(fade);
        current = action;
      };
      resolve(Object.freeze({
        root,
        mixer,
        clips: Object.freeze(clips),
        play,
        update: (dt: number) => mixer.update(dt),
        dispose: () => {
          mixer.stopAllAction();
          root.removeFromParent();
          root.traverse((node: any) => {
            node.geometry?.dispose?.();
            const material = node.material;
            if (Array.isArray(material)) material.forEach((entry: any) => entry?.dispose?.());
            else material?.dispose?.();
          });
        },
      }));
    }, undefined, reject);
  });
}

/** Load one of the pack's still props (a rod, a lure, the worm). */
export function loadFishingProp(file: string): Promise<any> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(fishAssetUrl(file), (gltf: any) => {
      gltf.scene.traverse((node: any) => {
        if (node.isMesh) node.castShadow = true;
      });
      resolve(gltf.scene);
    }, undefined, reject);
  });
}

export type FishThumbnails = Readonly<{
  /** A portrait of the species in this colouring, or null while it is still loading (`onReady` fires when it lands). */
  get: (speciesId: string, variant?: FishVariant) => string | null;
  /** A portrait of a tackle model (a rod or a lure) by file. */
  prop: (file: string) => string | null;
  dispose: () => void;
}>;

/**
 * Portraits for creel cards and shop shelves. A fish's portrait is the same
 * for every specimen of its kind and colour, so there is one per species and
 * variant; the size of a specimen is said on the card in words.
 */
export function createFishThumbnails(THREE: ThreeNamespace, onReady: () => void): FishThumbnails {
  const ready = new Map<string, any>();
  const pending = new Set<string>();
  const thumbnails = createModelThumbnails<string>(THREE, {
    build: (key) => ready.get(key) ?? null,
    view: (key) => key.startsWith("prop:") ? { azimuth: 0.9, elevation: 0.25 } : { azimuth: -Math.PI / 2 + 0.35, elevation: 0.18 },
    size: { width: 176, height: 128 },
  });

  // The picture per key. The shared renderer caches a null for a model that is
  // not there, so it is only ever asked once the model has landed.
  const urls = new Map<string, string | null>();

  function request(key: string, load: () => Promise<any>): string | null {
    if (urls.has(key)) return urls.get(key) ?? null;
    if (ready.has(key)) {
      const url = thumbnails.get(key);
      ready.delete(key);
      urls.set(key, url);
      return url;
    }
    if (!pending.has(key)) {
      pending.add(key);
      load().then((model) => {
        ready.set(key, model);
        onReady();
      }).catch(() => urls.set(key, null));
    }
    return null;
  }

  return Object.freeze({
    get(speciesId, variant = "normal") {
      const species = findFishSpecies(speciesId);
      if (!species) return null;
      return request(`fish:${speciesId}:${variant}`, () => loadFish(THREE, speciesId, 1, variant).then((fish) => fish.root));
    },
    prop(file) {
      return request(`prop:${file}`, () => loadFishingProp(file).then((model) => {
        if (!file.startsWith("fishing-rod")) return model;
        // A rod stands upright and is a sliver in a wide card: lay it across the card, butt low, tip high.
        const tilted = new THREE.Group();
        model.rotation.z = -1.05;
        tilted.add(model);
        return tilted;
      }));
    },
    dispose: () => thumbnails.dispose(),
  });
}
