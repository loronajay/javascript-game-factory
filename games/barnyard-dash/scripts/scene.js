// Barnyard Dash's 3D world: the course, the racers, the camera. It draws a
// race it is handed and never advances one — the sim (local or the server's)
// is the only thing that moves a pet.
//
// A course is built from its catalog row (sim/courses.js): the road, its fence,
// mud, hurdles, bales and gates from the track; trees, the barn, a pond and
// loose bales from its scenery. Racers are the farm's own GLB animals in their
// own coats, sized by their species' metre height and the pet's size.

import * as THREE from "../../../js/vendor/three.module.js";
import { GLTFLoader } from "../../../js/vendor/loaders/GLTFLoader.js";
import { findAnimal, findAnimalPalette } from "../../../js/farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips } from "../../../js/farm-animal-clips.mjs";
import { materialForAnimalPalette } from "../../../js/farm-pet-palettes.mjs";
import { createFenceRun, createHayBale, createTree } from "../../../js/farm-props.mjs";
import { farmMaterial } from "../../../js/farm-materials.mjs";
import { createSurfaceMaterial } from "../../../js/arcade-room-surfaces.mjs";
import { DEFAULT_GROUND_ID, findGround } from "../../../js/farm-catalog/ground.mjs";
import { speciesStyle } from "../../pet-games/shared/pets.js";
import { roadEdgeSegments, startLineTiles } from "./sim/track.js?v=20260928-pet-online";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
const WORLD_SCALE = 0.08;
const MODEL_YAW_OFFSET = Math.PI;

const worldPoint = (point) => new THREE.Vector3((point.x - GAME_WIDTH / 2) * WORLD_SCALE, 0, (point.y - GAME_HEIGHT / 2) * WORLD_SCALE);

export function createRaceScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd6ee);
  scene.fog = new THREE.Fog(0xb8d9c2, 42, 110);
  const camera = new THREE.PerspectiveCamera(55, GAME_WIDTH / GAME_HEIGHT, 0.1, 220);
  camera.position.set(-30, 8, 20);
  const cameraLook = new THREE.Vector3();
  scene.add(new THREE.HemisphereLight(0xdff5ff, 0x42552e, 2.25));
  const sun = new THREE.DirectionalLight(0xfff0c7, 3.2);
  sun.position.set(-24, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75 });
  scene.add(sun);

  const courseRoot = new THREE.Group();
  const racerRoot = new THREE.Group();
  scene.add(courseRoot, racerRoot);
  const obstacleViews = new Map();
  const racerViews = new Map();
  const loader = new GLTFLoader();
  let courseCentre = new THREE.Vector3();
  let orbitRadius = 54;

  function addGround() {
    const farmGrass = findGround(DEFAULT_GROUND_ID).style;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 150), createSurfaceMaterial(THREE, farmGrass, { u: 190, v: 150 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(courseCentre.x, 0, courseCentre.z);
    ground.receiveShadow = true;
    courseRoot.add(ground);
  }

  function addRoadSurface(track) {
    const points = track.road.slice(0, -1);
    const halfWidth = track.roadWidth * WORLD_SCALE / 2;
    const vertices = [];
    const indices = [];
    for (let index = 0; index < points.length; index += 1) {
      const previous = worldPoint(points[(index - 1 + points.length) % points.length]);
      const current = worldPoint(points[index]);
      const next = worldPoint(points[(index + 1) % points.length]);
      const incoming = new THREE.Vector2(current.x - previous.x, current.z - previous.z).normalize();
      const outgoing = new THREE.Vector2(next.x - current.x, next.z - current.z).normalize();
      const miter = new THREE.Vector2(-incoming.y, incoming.x).add(new THREE.Vector2(-outgoing.y, outgoing.x)).normalize();
      const denominator = Math.max(0.5, Math.abs(miter.dot(new THREE.Vector2(-outgoing.y, outgoing.x))));
      const offset = Math.min(halfWidth * 1.55, halfWidth / denominator);
      vertices.push(current.x + miter.x * offset, 0.08, current.z + miter.y * offset, current.x - miter.x * offset, 0.08, current.z - miter.y * offset);
    }
    for (let index = 0; index < points.length; index += 1) {
      const left = index * 2;
      const nextLeft = ((index + 1) % points.length) * 2;
      indices.push(left, left + 1, nextLeft, left + 1, nextLeft + 1, nextLeft);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb99862, roughness: 1, side: THREE.DoubleSide }));
    road.receiveShadow = true;
    courseRoot.add(road);
  }

  function addRacingLine(track) {
    const material = new THREE.MeshStandardMaterial({ color: 0xf0ddb3, roughness: 0.95 });
    for (let index = 1; index < track.road.length; index += 1) {
      const from = worldPoint(track.road[index - 1]);
      const to = worldPoint(track.road[index]);
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const count = Math.max(1, Math.floor(Math.hypot(dx, dz) / 5.5));
      for (let markerIndex = 0; markerIndex < count; markerIndex += 1) {
        const amount = (markerIndex + 0.5) / count;
        const marker = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.035, 0.16), material);
        marker.position.set(from.x + dx * amount, 0.115, from.z + dz * amount);
        marker.rotation.y = -Math.atan2(dz, dx);
        marker.receiveShadow = true;
        courseRoot.add(marker);
      }
    }
  }

  function addCourseFence(edge) {
    const start = worldPoint(edge.start);
    const end = worldPoint(edge.end);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const fence = createFenceRun(THREE, Math.hypot(dx, dz));
    fence.position.set((start.x + end.x) / 2, 0.1, (start.z + end.z) / 2);
    fence.rotation.y = -Math.atan2(dz, dx);
    fence.scale.y = 0.8;
    courseRoot.add(fence);
  }

  function addBarn(spot) {
    const barn = new THREE.Group();
    const red = farmMaterial(THREE, "battens", { colors: ["#a8312b", "#6e201d", "#d4634e"], metresPerTile: 1.5 });
    const roof = farmMaterial(THREE, "shingles", { colors: ["#4a3a33", "#2f2824", "#756157"], metresPerTile: 1.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.6, 6), red);
    body.position.y = 2.3;
    body.castShadow = body.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5.2, 3, 4), roof);
    cap.position.y = 5.2;
    cap.rotation.y = Math.PI / 4;
    cap.scale.z = 0.72;
    cap.castShadow = true;
    barn.add(body, cap);
    const at = worldPoint(spot);
    barn.position.set(at.x, 0, at.z);
    barn.rotation.y = spot.angle ?? 0;
    courseRoot.add(barn);
  }

  function addPond(spot) {
    const at = worldPoint(spot);
    const radius = spot.radius * WORLD_SCALE;
    const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshPhysicalMaterial({ color: 0x2f8ea6, roughness: 0.15, metalness: 0.05, clearcoat: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(at.x, 0.06, at.z);
    const bank = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x7b6a4a, roughness: 1 }));
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(at.x, 0.05, at.z);
    courseRoot.add(water, bank);
  }

  function addScenery(course) {
    course.scenery.trees.forEach((spot, index) => {
      const tree = createTree(THREE, index + 11);
      const at = worldPoint(spot);
      tree.position.set(at.x, 0, at.z);
      tree.scale.setScalar(1.15 + (index % 3) * 0.12);
      courseRoot.add(tree);
    });
    course.scenery.hay.forEach((spot) => {
      const bale = createHayBale(THREE);
      const at = worldPoint(spot);
      bale.position.set(at.x, 0, at.z);
      bale.scale.setScalar(1.2);
      courseRoot.add(bale);
    });
    if (course.scenery.barn) addBarn(course.scenery.barn);
    if (course.scenery.pond) addPond(course.scenery.pond);
  }

  function addMud(zone) {
    const mud = new THREE.Mesh(new THREE.PlaneGeometry(zone.width * WORLD_SCALE, zone.height * WORLD_SCALE), farmMaterial(THREE, "soil", { metresPerTile: 2 }));
    const position = worldPoint(zone);
    mud.position.set(position.x, 0.14, position.z);
    mud.rotation.x = -Math.PI / 2;
    mud.receiveShadow = true;
    courseRoot.add(mud);
  }

  function addObstacle(obstacle) {
    const position = worldPoint(obstacle);
    let view;
    if (obstacle.kind === "hay") {
      view = createHayBale(THREE);
      view.scale.setScalar(1.35);
    } else {
      view = createFenceRun(THREE, obstacle.length * WORLD_SCALE);
      view.scale.y = obstacle.kind === "hurdle" ? 0.72 : 1.1;
      view.rotation.y = -obstacle.angle;
    }
    view.position.set(position.x, 0.16, position.z);
    obstacleViews.set(obstacle.id, view);
    courseRoot.add(view);
  }

  function addStartFinish(track) {
    const light = new THREE.MeshStandardMaterial({ color: 0xf8f1d3, roughness: 0.82 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17261f, roughness: 0.9 });
    for (const tileData of startLineTiles(track)) {
      const point = worldPoint(tileData);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(tileData.width * WORLD_SCALE, 0.055, tileData.depth * WORLD_SCALE), tileData.dark ? dark : light);
      tile.position.set(point.x, 0.18, point.z);
      tile.rotation.y = Math.PI / 2 - tileData.angle;
      tile.receiveShadow = true;
      courseRoot.add(tile);
    }
    const finish = track.finish ?? track.start;
    const point = worldPoint(finish);
    const acrossX = -Math.sin(finish.angle);
    const acrossZ = Math.cos(finish.angle);
    const arch = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xe6b84a, roughness: 0.7 });
    const signMaterial = new THREE.MeshStandardMaterial({ color: 0x173c30, roughness: 0.75 });
    const span = (track.roadWidth + 6) * WORLD_SCALE;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 0.28), postMaterial);
      post.position.set(acrossX * span * side / 2, 1.65, acrossZ * span * side / 2);
      post.castShadow = true;
      arch.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.55, 0.72, 0.32), signMaterial);
    beam.position.y = 3.1;
    beam.rotation.y = -Math.atan2(acrossZ, acrossX);
    beam.castShadow = true;
    arch.add(beam);
    for (let index = -5; index <= 5; index += 1) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.38), index % 2 ? light : dark);
      marker.position.set(acrossX * index * 0.52, 3.1, acrossZ * index * 0.52);
      marker.rotation.y = beam.rotation.y;
      marker.castShadow = true;
      arch.add(marker);
    }
    arch.position.set(point.x, 0.12, point.z);
    courseRoot.add(arch);
  }

  function disposeTree(root) {
    root.traverse((node) => {
      node.geometry?.dispose?.();
    });
    root.clear();
  }

  function createRacerView(racer, local) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    group.add(visual);
    const species = findAnimal(racer.pet.speciesId) ?? findAnimal("pet.corgi");
    const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: speciesStyle(species.id).color, roughness: 0.85 }));
    placeholder.scale.set(1.35, 0.8, 0.9);
    placeholder.position.y = 0.55;
    placeholder.castShadow = true;
    visual.add(placeholder);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.92, 32), new THREE.MeshBasicMaterial({ color: local ? 0xffe36e : racer.human ? 0x6ec8ff : 0xef6b54, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    racerRoot.add(group);
    const view = { group, visual, placeholder, mixer: null, walk: null };
    racerViews.set(racer.id, view);

    const assetUrl = new URL(`../../../farm/assets/animals/${species.file}`, import.meta.url).toString();
    loader.load(assetUrl, (gltf) => {
      if (racerViews.get(racer.id) !== view) return;
      const model = gltf.scene;
      const initial = new THREE.Box3().setFromObject(model);
      const size = initial.getSize(new THREE.Vector3());
      model.scale.setScalar((species.height * racer.profile.size) / Math.max(size.y, 0.001));
      const fitted = new THREE.Box3().setFromObject(model);
      const centre = fitted.getCenter(new THREE.Vector3());
      model.position.set(-centre.x, -fitted.min.y, -centre.z);
      model.rotation.y = MODEL_YAW_OFFSET;
      const palette = findAnimalPalette(species.id, racer.pet.paletteId) ?? species.palettes[0];
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
    return view;
  }

  return {
    buildCourse(course) {
      disposeTree(courseRoot);
      obstacleViews.clear();
      const xs = course.track.road.map((point) => point.x);
      const ys = course.track.road.map((point) => point.y);
      const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      courseCentre = worldPoint(centre);
      orbitRadius = Math.max(44, ((Math.max(...xs) - Math.min(...xs)) * WORLD_SCALE) * 0.72);
      addGround();
      addRoadSurface(course.track);
      addRacingLine(course.track);
      roadEdgeSegments(course.track).forEach(addCourseFence);
      course.track.mud.forEach(addMud);
      course.track.obstacles.forEach(addObstacle);
      addScenery(course);
      addStartFinish(course.track);
    },
    clearRacers() {
      for (const view of racerViews.values()) racerRoot.remove(view.group);
      racerViews.clear();
    },
    /** Draw every racer; `poses` may override where one is drawn (a predicted or interpolated pet). */
    syncRacers(race, dt, { localId = null, poses = null } = {}) {
      for (const racer of race.racers) {
        const view = racerViews.get(racer.id) ?? createRacerView(racer, racer.id === localId);
        const pose = poses?.get(racer.id) ?? racer;
        const position = worldPoint(pose);
        view.group.position.set(position.x, (pose.jumpHeight ?? 0) * 1.15 + 0.18, position.z);
        view.group.rotation.y = -pose.angle - Math.PI / 2;
        view.group.visible = !racer.dnf || racer.finishedAt !== null;
        if (view.mixer) {
          view.walk.timeScale = Math.max(0.35, (pose.speed ?? 0) / 65);
          view.mixer.update(dt);
        }
      }
      for (const [id, view] of obstacleViews) view.visible = !race.brokenObstacles.includes(id);
    },
    /** Chase `racer` (a pose), or slowly orbit the course when there is none. */
    updateCamera(dt, racer) {
      if (!racer) {
        const orbit = performance.now() * 0.00008;
        camera.position.set(courseCentre.x + Math.cos(orbit) * orbitRadius, 31, courseCentre.z + Math.sin(orbit) * orbitRadius);
        camera.lookAt(courseCentre);
        return;
      }
      const at = worldPoint(racer);
      const forward = new THREE.Vector3(Math.cos(racer.angle), 0, Math.sin(racer.angle));
      const desired = at.clone().addScaledVector(forward, -10).add(new THREE.Vector3(0, 6.2, 0));
      const amount = 1 - Math.exp(-5.5 * dt);
      camera.position.lerp(desired, amount);
      cameraLook.lerp(at.clone().addScaledVector(forward, 4).add(new THREE.Vector3(0, 1.1, 0)), amount);
      camera.lookAt(cameraLook);
    },
    snapCamera(racer) {
      const at = worldPoint(racer);
      const forward = new THREE.Vector3(Math.cos(racer.angle), 0, Math.sin(racer.angle));
      camera.position.copy(at.clone().addScaledVector(forward, -10).add(new THREE.Vector3(0, 6.2, 0)));
      cameraLook.copy(at.clone().addScaledVector(forward, 4).add(new THREE.Vector3(0, 1.1, 0)));
      camera.lookAt(cameraLook);
    },
    render() {
      renderer.render(scene, camera);
    },
    resize() {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(GAME_WIDTH, GAME_HEIGHT, false);
      camera.aspect = GAME_WIDTH / GAME_HEIGHT;
      camera.updateProjectionMatrix();
    },
  };
}
