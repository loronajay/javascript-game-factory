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
import { createModelThumbnails } from "./space-editor/model-thumbnails.mjs";
/** In the pack a fish's nose points along the model's +z; the walker's yaw 0 faces −z. */
export const FISH_YAW_OFFSET = Math.PI;
export function fishAssetUrl(file) {
    return new URL(`../farm/assets/fishing/${file}`, import.meta.url).toString();
}
/** Materials that are the fish's eyes, teeth or outline keep their colour whatever the fish's colouring. */
function isDetail(material) {
    return /eye|black|teeth|tooth|white_eye|pupil/i.test(String(material?.name ?? ""));
}
/**
 * Colour a fish for its variant. Shiny turns its colours round the wheel and
 * lifts them; Golden plates it in gold. Eyes and teeth stay as they are.
 */
export function paintVariant(THREE, model, variant) {
    if (variant === "normal")
        return;
    model.traverse((node) => {
        if (!node.isMesh)
            return;
        const paint = (material) => {
            if (isDetail(material))
                return material;
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
            }
            else {
                next.color.offsetHSL(0.45, 0.25, 0.08);
                next.emissive = next.color.clone().multiplyScalar(0.18);
            }
            return next;
        };
        node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
    });
}
/** Scale a fish so it is `lengthM` from nose to tail, and centre it on its middle. */
export function fitFish(THREE, model, lengthM) {
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
export function loadFish(THREE, speciesId, lengthM, variant = "normal") {
    const species = findFishSpecies(speciesId);
    if (!species)
        return Promise.reject(new Error(`unknown fish ${speciesId}`));
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(fishAssetUrl(species.file), (gltf) => {
            const inner = gltf.scene;
            inner.traverse((node) => {
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
            const clips = {};
            for (const clip of gltf.animations ?? [])
                clips[clip.name] = clip;
            let current = null;
            const play = (name, fade = 0.25) => {
                const clip = clips[name];
                if (!clip)
                    return;
                const action = mixer.clipAction(clip);
                if (current === action)
                    return;
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
                update: (dt) => mixer.update(dt),
                dispose: () => {
                    mixer.stopAllAction();
                    root.removeFromParent();
                    root.traverse((node) => {
                        node.geometry?.dispose?.();
                        const material = node.material;
                        if (Array.isArray(material))
                            material.forEach((entry) => entry?.dispose?.());
                        else
                            material?.dispose?.();
                    });
                },
            }));
        }, undefined, reject);
    });
}
/** Load one of the pack's still props (a rod, a lure, the worm). */
export function loadFishingProp(file) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(fishAssetUrl(file), (gltf) => {
            gltf.scene.traverse((node) => {
                if (node.isMesh)
                    node.castShadow = true;
            });
            resolve(gltf.scene);
        }, undefined, reject);
    });
}
/**
 * Portraits for creel cards and shop shelves. A fish's portrait is the same
 * for every specimen of its kind and colour, so there is one per species and
 * variant; the size of a specimen is said on the card in words.
 */
export function createFishThumbnails(THREE, onReady) {
    const ready = new Map();
    const pending = new Set();
    const thumbnails = createModelThumbnails(THREE, {
        build: (key) => ready.get(key) ?? null,
        view: (key) => key.startsWith("prop:") ? { azimuth: 0.9, elevation: 0.25 } : { azimuth: -Math.PI / 2 + 0.35, elevation: 0.18 },
        size: { width: 176, height: 128 },
    });
    // The picture per key. The shared renderer caches a null for a model that is
    // not there, so it is only ever asked once the model has landed.
    const urls = new Map();
    function request(key, load) {
        if (urls.has(key))
            return urls.get(key) ?? null;
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
            if (!species)
                return null;
            return request(`fish:${speciesId}:${variant}`, () => loadFish(THREE, speciesId, 1, variant).then((fish) => fish.root));
        },
        prop(file) {
            return request(`prop:${file}`, () => loadFishingProp(file));
        },
        dispose: () => thumbnails.dispose(),
    });
}
