// Pondside Push's 3D world: the island, the pond, the pets and the camera. It
// draws a match it is handed and never advances one.

import * as THREE from "../../../js/vendor/three.module.js";
import { GLTFLoader } from "../../../js/vendor/loaders/GLTFLoader.js";
import { findAnimal, findAnimalPalette } from "../../../js/farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips } from "../../../js/farm-animal-clips.mjs";
import { materialForAnimalPalette } from "../../../js/farm-pet-palettes.mjs";
import { createSurfaceMaterial } from "../../../js/arcade-room-surfaces.mjs";
import { DEFAULT_GROUND_ID, findGround } from "../../../js/farm-catalog/ground.mjs";
import { farmMaterial } from "../../../js/farm-materials.mjs";
import { speciesStyle } from "../../pet-games/shared/pets.js";
import { ARENA_RADIUS } from "./sim/match.js?v=20260928-pet-online";
import { yawForFacing } from "./presentation.js";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
const BASE_FOV = 46;

/** Keep at least the 3:2 view's width: past it a wider screen just shows more round the edges. */
function fovForAspect(fov, aspect) {
  const designAspect = GAME_WIDTH / GAME_HEIGHT;
  if (aspect >= designAspect) return fov;
  const halfWidth = Math.tan((fov * Math.PI) / 360) * designAspect;
  return Math.min(100, (Math.atan(halfWidth / aspect) * 360) / Math.PI);
}
const WORLD_SCALE = 0.035;
const MODEL_YAW_OFFSET = Math.PI;

export function createArena(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8bcad9);
  scene.fog = new THREE.Fog(0x8bcad9, 35, 82);
  const camera = new THREE.PerspectiveCamera(BASE_FOV, GAME_WIDTH / GAME_HEIGHT, 0.1, 130);
  camera.position.set(0, 18, 20);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xe7fbff, 0x385239, 2.5));
  const sun = new THREE.DirectionalLight(0xffe9bc, 3.4);
  sun.position.set(-15, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
  scene.add(sun);

  const arenaRoot = new THREE.Group();
  const petRoot = new THREE.Group();
  const debugRoot = new THREE.Group();
  debugRoot.visible = false;
  scene.add(arenaRoot, petRoot, debugRoot);
  const loader = new GLTFLoader();
  const views = new Map();
  let grass = null;
  let stone = null;

  (function buildArena() {
    const islandRadius = ARENA_RADIUS * WORLD_SCALE;
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(48, 96),
      new THREE.MeshPhysicalMaterial({ color: 0x2b91a8, roughness: 0.2, metalness: 0.04, transparent: true, opacity: 0.9, clearcoat: 0.55, clearcoatRoughness: 0.2 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.62;
    water.receiveShadow = true;
    arenaRoot.add(water);

    const shallows = new THREE.Mesh(
      new THREE.RingGeometry(islandRadius + 0.45, islandRadius + 2.6, 96),
      new THREE.MeshBasicMaterial({ color: 0x69c3c4, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    shallows.rotation.x = -Math.PI / 2;
    shallows.position.y = -0.57;
    arenaRoot.add(shallows);

    stone = new THREE.Mesh(new THREE.CylinderGeometry(islandRadius + 0.32, islandRadius + 0.5, 0.75, 64), new THREE.MeshStandardMaterial({ color: 0x8b8063, roughness: 1 }));
    stone.position.y = -0.34;
    stone.receiveShadow = true;
    arenaRoot.add(stone);
    grass = new THREE.Mesh(
      new THREE.CircleGeometry(islandRadius, 64),
      createSurfaceMaterial(THREE, findGround(DEFAULT_GROUND_ID).style, { u: islandRadius * 2, v: islandRadius * 2 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.05;
    grass.receiveShadow = true;
    arenaRoot.add(grass);

    const centre = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.52, 48), new THREE.MeshBasicMaterial({ color: 0xeed271, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    centre.rotation.x = -Math.PI / 2;
    centre.position.y = 0.075;
    arenaRoot.add(centre);

    const rockMaterial = farmMaterial(THREE, "fieldstone", { colors: ["#847b65", "#625d50", "#aaa083", "#4c493f"], metresPerTile: 1.4 });
    for (let index = 0; index < 18; index += 1) {
      const angle = index * Math.PI * 2 / 18 + (index % 3) * 0.07;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + (index % 4) * 0.055, 0), rockMaterial);
      rock.position.set(Math.cos(angle) * (islandRadius + 0.32), -0.08 + (index % 2) * 0.06, Math.sin(angle) * (islandRadius + 0.32));
      rock.scale.y = 0.62;
      rock.rotation.set(index * 0.31, index * 0.57, index * 0.19);
      rock.castShadow = rock.receiveShadow = true;
      arenaRoot.add(rock);
    }

    const padMaterial = new THREE.MeshStandardMaterial({ color: 0x4c923f, roughness: 0.92, side: THREE.DoubleSide });
    for (const [angle, distance, scale] of [[0.35, 13.5, 0.8], [2.1, 14.2, 1], [3.85, 12.8, 0.7], [5.2, 15.1, 0.9]]) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(scale, 18, 0.25, Math.PI * 1.78), padMaterial);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = angle;
      pad.position.set(Math.cos(angle) * distance, -0.54, Math.sin(angle) * distance);
      arenaRoot.add(pad);
    }
  })();

  function createPetView(player, local) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    group.add(visual);
    const species = findAnimal(player.pet.speciesId) ?? findAnimal("pet.corgi");
    const style = speciesStyle(species.id);
    const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.85 }));
    placeholder.scale.set(1.35, 0.82, 0.95);
    placeholder.position.y = 0.48;
    placeholder.castShadow = true;
    visual.add(placeholder);
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: local ? 0xffdf63 : player.cpu ? 0xe96551 : 0x6ec8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.07;
    group.add(marker);
    const bumpWave = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    bumpWave.rotation.x = -Math.PI / 2;
    bumpWave.position.y = 0.12;
    bumpWave.visible = false;
    group.add(bumpWave);
    const splash = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 32), new THREE.MeshBasicMaterial({ color: 0xd8fbff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    splash.rotation.x = -Math.PI / 2;
    splash.position.y = -0.54;
    splash.visible = false;
    petRoot.add(splash);
    petRoot.add(group);

    const hitbox = new THREE.Mesh(new THREE.RingGeometry(player.radius * WORLD_SCALE * 0.96, player.radius * WORLD_SCALE, 32), new THREE.MeshBasicMaterial({ color: 0xff3030, side: THREE.DoubleSide }));
    hitbox.rotation.x = -Math.PI / 2;
    hitbox.position.y = 0.13;
    debugRoot.add(hitbox);
    const view = { group, visual, placeholder, marker, bumpWave, splash, hitbox, mixer: null, walk: null };
    views.set(player.id, view);

    const assetUrl = new URL(`../../../farm/assets/animals/${species.file}`, import.meta.url).toString();
    loader.load(assetUrl, (gltf) => {
      if (views.get(player.id) !== view) return;
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      model.scale.setScalar((species.height * player.pet.stats.size) / Math.max(size.y, 0.001));
      const fitted = new THREE.Box3().setFromObject(model);
      const centre = fitted.getCenter(new THREE.Vector3());
      model.position.set(-centre.x, -fitted.min.y, -centre.z);
      model.rotation.y = MODEL_YAW_OFFSET;
      const palette = findAnimalPalette(species.id, player.pet.paletteId) ?? species.palettes[0];
      model.traverse((node) => {
        if (!node.isMesh) return;
        const paint = (material) => materialForAnimalPalette(THREE, material, palette);
        node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = false;
      });
      visual.add(model);
      placeholder.visible = false;
      const clips = splitAnimalClips(THREE, animalTrack(gltf), species.clips);
      if (clips.walk) {
        view.mixer = new THREE.AnimationMixer(model);
        view.walk = view.mixer.clipAction(clips.walk).play();
      }
    });
  }

  return {
    clear() {
      for (const view of views.values()) {
        petRoot.remove(view.group);
        petRoot.remove(view.splash);
        debugRoot.remove(view.hitbox);
      }
      views.clear();
    },
    /** Draw the match; `positions` may override where a pet's body is drawn (predicted or interpolated). */
    sync(match, dt, { localId = null, positions = null } = {}) {
      const island = match.islandRadius / ARENA_RADIUS;
      grass.scale.setScalar(Math.max(0.001, island));
      stone.scale.set(Math.max(0.001, island), 1, Math.max(0.001, island));
      stone.visible = grass.visible = island > 0.01;
      for (const player of match.players) {
        if (!views.has(player.id)) createPetView(player, player.id === localId);
        const view = views.get(player.id);
        const at = positions?.get(player.id) ?? player;
        const facingX = at.facingX ?? player.facingX;
        const facingY = at.facingY ?? player.facingY;
        view.group.position.set(at.x * WORLD_SCALE, 0.12 - player.fallHeight * WORLD_SCALE, at.y * WORLD_SCALE);
        view.group.rotation.y = yawForFacing(facingX, facingY);
        view.visual.rotation.x = player.eliminated ? Math.min(Math.PI * 0.46, player.fallHeight * 0.018) : 0;
        view.hitbox.position.set(at.x * WORLD_SCALE, 0, at.y * WORLD_SCALE);
        view.group.visible = view.group.position.y > -3.2;
        view.marker.visible = !player.eliminated;
        view.splash.position.x = at.x * WORLD_SCALE;
        view.splash.position.z = at.y * WORLD_SCALE;
        view.splash.visible = player.splashAge >= 0 && player.splashAge < 0.9;
        if (view.splash.visible) {
          view.splash.scale.setScalar(1 + player.splashAge * 3.6);
          view.splash.material.opacity = Math.max(0, 0.9 - player.splashAge);
        }
        view.bumpWave.visible = player.bumpTimer > 0;
        if (view.bumpWave.visible) view.bumpWave.scale.setScalar(1 + (0.16 - player.bumpTimer) * 6);
        if (!player.eliminated) {
          const squash = player.impact;
          view.visual.scale.set(1 + squash * 0.24, 1 - squash * 0.28, 1 + squash * 0.24);
        }
        if (view.mixer) {
          view.walk.timeScale = Math.max(0.25, Math.hypot(player.vx, player.vy) / 90);
          view.mixer.update(dt);
        }
      }
    },
    /** Toggle measured collision rings: red bodies and the green elimination boundary. */
    toggleDebug() {
      if (!debugRoot.userData.boundary) {
        const radius = ARENA_RADIUS * WORLD_SCALE;
        const boundary = new THREE.Mesh(new THREE.RingGeometry(radius - 0.035, radius + 0.035, 64), new THREE.MeshBasicMaterial({ color: 0x35ff72, side: THREE.DoubleSide }));
        boundary.rotation.x = -Math.PI / 2;
        boundary.position.y = 0.14;
        debugRoot.add(boundary);
        debugRoot.userData.boundary = boundary;
      }
      debugRoot.visible = !debugRoot.visible;
    },
    render(timestamp, impact = 0) {
      camera.position.set(Math.sin(timestamp * 0.12) * impact * 0.14, 18 + Math.cos(timestamp * 0.15) * impact * 0.08, 20);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    },
    /** Render at the stage's real size; a narrow screen widens the lens so the whole pond stays in view. */
    resize(width, height) {
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      camera.aspect = width / height;
      camera.fov = fovForAspect(BASE_FOV, camera.aspect);
      camera.updateProjectionMatrix();
    },
  };
}
