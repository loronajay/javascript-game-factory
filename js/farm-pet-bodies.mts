// Pet bodies: the sim's animals as things on the field.
//
// `sync(pets, dt)` is the whole API, the decor-runtime shape: a body for every
// sim pet, gone when the pet is gone, eased toward the sim's pose each frame
// (the same remote-motion easing a visitor gets, so a 60 Hz sim never looks
// steppy at 144 Hz), idle/walk cross-faded off `moving`, a name tag over the
// head, and a heart that floats up when the player strokes it. Nothing here
// decides where a pet goes.
//
// A body loads its own copy of the species GLB (the vendored three has no
// SkeletonUtils to clone a skinned mesh; the browser's cache makes the second
// load free) and cuts the pack's single track into named clips through
// `farm-animal-clips.mts`. Until the model lands a body is a soft blob so a
// freshly adopted pet is never invisible.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { findAnimal, findAnimalPalette, type AnimalDefinition } from "./farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips, type AnimalClips } from "./farm-animal-clips.mjs";
import { materialForAnimalPalette } from "./farm-pet-palettes.mjs";
import type { PetBody as PetPose } from "./farm-pets.mjs";

type ThreeNamespace = Record<string, any>;

export type PetBodyView = Readonly<{ instanceId: string; name: string; radius: number; pose: Readonly<{ x: number; z: number }> }>;

export type PetBodies = Readonly<{
  sync: (pets: readonly PetPose[], dt: number) => void;
  /** The bodies as reach targets for the interaction rules. */
  views: () => readonly PetBodyView[];
  /** Float a heart over a pet. */
  showHeart: (instanceId: string) => void;
  /** Hide or show a pet's name tag (a carried pet's tag would sit in the player's face). */
  setTagVisible: (instanceId: string, visible: boolean) => void;
  dispose: () => void;
}>;

/** The pack's models face +z at rest; the sim's yaw 0 faces −z. */
export const MODEL_YAW_OFFSET = Math.PI;
export const HEART_SECONDS = 1.4;
const TAG_HEIGHT_PADDING = 0.3;
/** How fast a drawn body chases the sim's pose (per second); high enough to hide the 60 Hz steps, low enough not to jitter. */
const EASE_RATE = 14;

type Body = {
  instanceId: string;
  species: AnimalDefinition;
  paletteId: string;
  group: any;
  /** Scaled animal art only; tags and feedback stay legible at every age. */
  visual: any;
  model: any | null;
  placeholder: any;
  tag: any;
  tagText: string;
  heart: any;
  heartUntil: number;
  mixer: any | null;
  clips: AnimalClips;
  current: any | null;
  height: number;
  loadToken: number;
  x: number;
  z: number;
  yaw: number;
  y: number;
  clock: number;
};

export function assetUrlFor(species: AnimalDefinition): string {
  return new URL(`../farm/assets/animals/${species.file}`, import.meta.url).toString();
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function createPetBodies(THREE: ThreeNamespace, scene: any): PetBodies {
  const root = new THREE.Group();
  root.name = "pets";
  scene.add(root);
  const loader = new GLTFLoader();
  const bodies = new Map<string, Body>();
  const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 0.8, transparent: true, opacity: 0.6 });
  const heartTexture = drawHeart();

  function drawHeart(): any {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ff4d7a";
    context.beginPath();
    context.moveTo(64, 112);
    context.bezierCurveTo(10, 70, 6, 24, 40, 20);
    context.bezierCurveTo(54, 18, 62, 30, 64, 38);
    context.bezierCurveTo(66, 30, 74, 18, 88, 20);
    context.bezierCurveTo(122, 24, 118, 70, 64, 112);
    context.fill();
    context.fillStyle = "rgba(255,255,255,.55)";
    context.beginPath();
    context.ellipse(44, 40, 9, 6, -0.6, 0, Math.PI * 2);
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function paintTag(body: Body, name: string): void {
    if (name === body.tagText) return;
    body.tagText = name;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "rgba(24, 38, 22, 0.82)";
    context.beginPath();
    context.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 22);
    context.fill();
    context.strokeStyle = "rgba(158, 226, 122, 0.75)";
    context.lineWidth = 4;
    context.stroke();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = "700 54px system-ui, sans-serif";
    context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 60);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const previous = body.tag.material.map;
    body.tag.material.map = texture;
    body.tag.material.needsUpdate = true;
    body.tag.scale.set(0.9, 0.9 * (canvas.height / canvas.width), 1);
    previous?.dispose?.();
  }

  function play(body: Body, clip: any): void {
    if (!body.mixer || !clip || body.current === clip) return;
    const action = body.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(0.2).play();
    if (body.current) body.mixer.clipAction(body.current).fadeOut(0.2);
    body.current = clip;
  }

  /** Scale to the species' height (the pack is hundreds of units tall) and stand the model on its footprint centre. */
  function fitModel(body: Body, model: any): void {
    const initial = new THREE.Box3().setFromObject(model);
    const size = initial.getSize(new THREE.Vector3());
    model.scale.setScalar(size.y > 0 ? body.species.height / size.y : 1);
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
    body.height = fitted.max.y - fitted.min.y;
    model.rotation.y = MODEL_YAW_OFFSET;
  }

  function loadModel(body: Body): void {
    const token = ++body.loadToken;
    loader.load(assetUrlFor(body.species), (gltf: any) => {
      if (token !== body.loadToken || !bodies.has(body.instanceId)) return;
      body.model = gltf.scene;
      fitModel(body, body.model);
      body.model.traverse((node: any) => {
        if (node.isMesh) {
          const palette = findAnimalPalette(body.species.id, body.paletteId) ?? body.species.palettes[0];
          const paint = (material: any): any => materialForAnimalPalette(THREE, material, palette);
          node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
          node.castShadow = true;
          node.frustumCulled = false;
        }
      });
      body.visual.add(body.model);
      body.placeholder.visible = false;
      body.clips = splitAnimalClips(THREE, animalTrack(gltf), body.species.clips);
      body.mixer = body.clips.idle ? new THREE.AnimationMixer(body.model) : null;
      body.current = null;
      play(body, body.clips.idle);
      body.tag.position.y = body.height + TAG_HEIGHT_PADDING;
    }, undefined, () => {
      // The blob stays; a pet whose model will not load is still on the farm.
    });
  }

  function createBody(pet: PetPose, species: AnimalDefinition): Body {
    const group = new THREE.Group();
    group.position.set(pet.x, pet.hover, pet.z);
    group.rotation.y = pet.yaw;
    const visual = new THREE.Group();
    visual.scale.setScalar(pet.sizeMultiplier);
    group.add(visual);
    const size = species.radius;
    const placeholder = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), placeholderMaterial);
    placeholder.position.y = size;
    placeholder.castShadow = true;
    visual.add(placeholder);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    tag.position.y = size * 2 + TAG_HEIGHT_PADDING;
    tag.renderOrder = 10;
    group.add(tag);
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture, transparent: true, depthTest: false, toneMapped: false }));
    heart.renderOrder = 12;
    heart.visible = false;
    heart.scale.set(0.45, 0.45, 1);
    group.add(heart);
    root.add(group);
    const body: Body = {
      instanceId: pet.instanceId,
      species,
      paletteId: pet.paletteId,
      group,
      visual,
      model: null,
      placeholder,
      tag,
      tagText: "",
      heart,
      heartUntil: 0,
      mixer: null,
      clips: { idle: null, attack: null, dead: null, walk: null },
      current: null,
      height: size * 2,
      loadToken: 0,
      x: pet.x,
      z: pet.z,
      yaw: pet.yaw,
      y: pet.hover,
      clock: 0,
    };
    paintTag(body, pet.name);
    loadModel(body);
    return body;
  }

  function removeBody(body: Body): void {
    body.loadToken += 1;
    root.remove(body.group);
    body.tag.material.map?.dispose?.();
    body.tag.material.dispose?.();
    body.heart.material.dispose?.();
  }

  function ease(body: Body, pet: PetPose, dt: number): void {
    // A carried pet is glued to the player's hand: any easing would trail it behind a walking player.
    const blend = pet.state === "carried" ? 1 : 1 - Math.exp(-EASE_RATE * dt);
    body.x += (pet.x - body.x) * blend;
    body.z += (pet.z - body.z) * blend;
    body.y += (pet.hover - body.y) * blend;
    body.yaw += wrapAngle(pet.yaw - body.yaw) * blend;
    body.group.position.set(body.x, body.y, body.z);
    body.group.rotation.y = body.yaw;
  }

  return Object.freeze({
    sync(pets, dt) {
      const seen = new Set<string>();
      for (const pet of pets) {
        seen.add(pet.instanceId);
        let body = bodies.get(pet.instanceId);
        if (body && (body.species.id !== pet.speciesId || body.paletteId !== pet.paletteId)) {
          removeBody(body);
          bodies.delete(pet.instanceId);
          body = undefined;
        }
        if (!body) {
          const species = findAnimal(pet.speciesId);
          if (!species) continue;
          body = createBody(pet, species);
          bodies.set(pet.instanceId, body);
        }
        paintTag(body, pet.name);
        body.visual.scale.setScalar(pet.sizeMultiplier);
        body.tag.position.y = body.height * pet.sizeMultiplier + TAG_HEIGHT_PADDING;
        ease(body, pet, dt);
        play(body, pet.moving ? body.clips.walk : body.clips.idle);
        body.mixer?.update(dt);
        body.clock += dt;
        if (body.heart.visible) {
          const left = body.heartUntil - body.clock;
          if (left <= 0) {
            body.heart.visible = false;
          } else {
            const progress = 1 - left / HEART_SECONDS;
            body.heart.position.y = body.height * pet.sizeMultiplier + 0.7 + progress * 0.9;
            body.heart.material.opacity = progress < 0.7 ? 1 : (1 - progress) / 0.3;
          }
        }
      }
      for (const [instanceId, body] of bodies) {
        if (seen.has(instanceId)) continue;
        removeBody(body);
        bodies.delete(instanceId);
      }
    },
    views: () => [...bodies.values()].map((body) => ({ instanceId: body.instanceId, name: body.tagText, radius: body.species.radius * body.visual.scale.x, pose: { x: body.x, z: body.z } })),
    setTagVisible(instanceId, visible) {
      const body = bodies.get(instanceId);
      if (body) body.tag.visible = visible;
    },
    showHeart(instanceId) {
      const body = bodies.get(instanceId);
      if (!body) return;
      body.heart.visible = true;
      body.heartUntil = body.clock + HEART_SECONDS;
      body.heart.position.y = body.tag.position.y + 0.4;
      body.heart.material.opacity = 1;
    },
    dispose() {
      for (const body of bodies.values()) removeBody(body);
      bodies.clear();
      scene.remove(root);
      heartTexture?.dispose?.();
    },
  });
}
