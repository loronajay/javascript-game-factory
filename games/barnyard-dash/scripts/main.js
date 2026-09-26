import * as THREE from "../../../js/vendor/three.module.js";
import { GLTFLoader } from "../../../js/vendor/loaders/GLTFLoader.js";
import { findAnimal, findAnimalPalette } from "../../../js/farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips } from "../../../js/farm-animal-clips.mjs";
import { materialForAnimalPalette } from "../../../js/farm-pet-palettes.mjs";
import { createFenceRun, createHayBale, createTree } from "../../../js/farm-props.mjs";
import { farmMaterial } from "../../../js/farm-materials.mjs";
import { loadFarmPets } from "./farm-source.js?v=20260925-track-fix-2";
import { cpuFieldFor, speciesStyle } from "./pets.js?v=20260925-track-fix-2";
import { createRace, raceOrder, stepRace } from "./race.js?v=20260926-course-walls";
import { DEFAULT_TRACK, roadEdgeSegments, startLineTiles } from "./track.js?v=20260926-course-walls";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;
const TICK_SECONDS = 1 / 60;
const WORLD_SCALE = 0.08;
const MODEL_YAW_OFFSET = Math.PI;

const canvas = document.querySelector("#raceCanvas");
const stage = document.querySelector("#gameStage");
const setupPanel = document.querySelector("#setupPanel");
const petChoices = document.querySelector("#petChoices");
const fieldSizeSelect = document.querySelector("#fieldSize");
const startButton = document.querySelector("#startRace");
const loadNote = document.querySelector("#loadNote");
const hud = document.querySelector("#raceHud");
const progressLabel = document.querySelector("#raceProgress");
const lapLabel = document.querySelector("#raceLap");
const placeLabel = document.querySelector("#playerPlace");
const timeLabel = document.querySelector("#raceTime");
const countdownLabel = document.querySelector("#countdown");
const resultPanel = document.querySelector("#raceResult");
const resultKicker = document.querySelector("#resultKicker");
const resultTitle = document.querySelector("#resultTitle");
const resultCopy = document.querySelector("#resultCopy");
const playerResultTime = document.querySelector("#playerResultTime");
const fieldResult = document.querySelector("#fieldResult");
const resultStandings = document.querySelector("#resultStandings");
const touchControls = document.querySelector("#touchControls");

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
scene.fog = new THREE.Fog(0xb8d9c2, 42, 92);
const camera = new THREE.PerspectiveCamera(55, GAME_WIDTH / GAME_HEIGHT, 0.1, 180);
camera.position.set(-30, 8, 20);
const cameraLook = new THREE.Vector3();
scene.add(new THREE.HemisphereLight(0xdff5ff, 0x42552e, 2.25));
const sun = new THREE.DirectionalLight(0xfff0c7, 3.2);
sun.position.set(-24, 38, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

const courseRoot = new THREE.Group();
const racerRoot = new THREE.Group();
scene.add(courseRoot, racerRoot);
const obstacleViews = new Map();
const racerViews = new Map();
const loader = new GLTFLoader();

let pets = [];
let selectedPet = null;
let race = null;
let screen = "setup";
let previousTime = null;
let accumulator = 0;
let resultShown = false;
const held = new Set();

const worldPoint = (point) => new THREE.Vector3((point.x - GAME_WIDTH / 2) * WORLD_SCALE, 0, (point.y - GAME_HEIGHT / 2) * WORLD_SCALE);

function addGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), farmMaterial(THREE, "foliage", { colors: ["#78aa55", "#527e3c", "#a0c86d"], metresPerTile: 4 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  courseRoot.add(ground);
}

function addRoadSurface() {
  const points = DEFAULT_TRACK.road.slice(0, -1);
  const halfWidth = DEFAULT_TRACK.roadWidth * WORLD_SCALE / 2;
  const vertices = [];
  const indices = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = worldPoint(points[(index - 1 + points.length) % points.length]);
    const current = worldPoint(points[index]);
    const next = worldPoint(points[(index + 1) % points.length]);
    const incoming = new THREE.Vector2(current.x - previous.x, current.z - previous.z).normalize();
    const outgoing = new THREE.Vector2(next.x - current.x, next.z - current.z).normalize();
    const incomingNormal = new THREE.Vector2(-incoming.y, incoming.x);
    const outgoingNormal = new THREE.Vector2(-outgoing.y, outgoing.x);
    const miter = incomingNormal.clone().add(outgoingNormal).normalize();
    const denominator = Math.max(0.5, Math.abs(miter.dot(outgoingNormal)));
    const offset = Math.min(halfWidth * 1.55, halfWidth / denominator);
    vertices.push(
      current.x + miter.x * offset, 0.08, current.z + miter.y * offset,
      current.x - miter.x * offset, 0.08, current.z - miter.y * offset,
    );
  }

  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const left = index * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;
    indices.push(left, right, nextLeft, right, nextRight, nextLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb99862, roughness: 1, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  courseRoot.add(road);
}

function addRacingLine() {
  const material = new THREE.MeshStandardMaterial({ color: 0xf0ddb3, roughness: 0.95 });
  for (let index = 1; index < DEFAULT_TRACK.road.length; index += 1) {
    const from = worldPoint(DEFAULT_TRACK.road[index - 1]);
    const to = worldPoint(DEFAULT_TRACK.road[index]);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const count = Math.max(1, Math.floor(length / 5.5));
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

function addFarmScenery() {
  const treeSpots = [[-42, -28], [-35, 28], [36, -30], [43, 22], [-5, 34], [18, 35]];
  treeSpots.forEach(([x, z], index) => {
    const tree = createTree(THREE, index + 11);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(1.15 + (index % 3) * 0.12);
    courseRoot.add(tree);
  });
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
  barn.position.set(-8, 0, 1);
  courseRoot.add(barn);
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

function addStartFinish() {
  const light = new THREE.MeshStandardMaterial({ color: 0xf8f1d3, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17261f, roughness: 0.9 });
  for (const tileData of startLineTiles(DEFAULT_TRACK)) {
    const point = worldPoint(tileData);
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(tileData.width * WORLD_SCALE, 0.055, tileData.depth * WORLD_SCALE),
      tileData.dark ? dark : light,
    );
    tile.position.set(point.x, 0.18, point.z);
    tile.rotation.y = Math.PI / 2 - tileData.angle;
    tile.receiveShadow = true;
    courseRoot.add(tile);
  }

  const finish = DEFAULT_TRACK.finish ?? DEFAULT_TRACK.start;
  const point = worldPoint(finish);
  const acrossX = -Math.sin(finish.angle);
  const acrossZ = Math.cos(finish.angle);
  const arch = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xe6b84a, roughness: 0.7 });
  const signMaterial = new THREE.MeshStandardMaterial({ color: 0x173c30, roughness: 0.75 });
  const span = (DEFAULT_TRACK.roadWidth + 6) * WORLD_SCALE;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 0.28), postMaterial);
    post.position.set(acrossX * span * side / 2, 1.65, acrossZ * span * side / 2);
    post.castShadow = true;
    arch.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.55, 0.72, 0.32), signMaterial);
  beam.position.y = 3.1;
  beam.rotation.y = finish.angle + Math.PI / 2;
  beam.castShadow = true;
  arch.add(beam);
  for (let index = -5; index <= 5; index += 1) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.38), index % 2 ? light : dark);
    marker.position.set(acrossX * index * 0.52, 3.1, acrossZ * index * 0.52);
    marker.rotation.y = finish.angle + Math.PI / 2;
    marker.castShadow = true;
    arch.add(marker);
  }
  arch.position.set(point.x, 0.12, point.z);
  courseRoot.add(arch);
}

function buildCourse() {
  addGround();
  addRoadSurface();
  addRacingLine();
  roadEdgeSegments(DEFAULT_TRACK).forEach(addCourseFence);
  DEFAULT_TRACK.mud.forEach(addMud);
  DEFAULT_TRACK.obstacles.forEach(addObstacle);
  addFarmScenery();
  addStartFinish();
}
buildCourse();

function createRacerView(racer) {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.add(visual);
  const species = findAnimal(racer.pet.speciesId) ?? findAnimal("pet.corgi");
  const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: speciesStyle(species.id).color, roughness: 0.85 }));
  placeholder.scale.set(1.35, 0.8, 0.9);
  placeholder.position.y = 0.55;
  placeholder.castShadow = true;
  visual.add(placeholder);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.92, 32), new THREE.MeshBasicMaterial({ color: racer.player ? 0xffe36e : 0xef6b54, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  racerRoot.add(group);
  const view = { group, visual, placeholder, mixer: null, walk: null };
  racerViews.set(racer.id, view);

  const assetUrl = new URL(`../../../farm/assets/animals/${species.file}`, import.meta.url).toString();
  loader.load(assetUrl, (gltf) => {
    const model = gltf.scene;
    const initial = new THREE.Box3().setFromObject(model);
    const size = initial.getSize(new THREE.Vector3());
    model.scale.setScalar((species.height * racer.profile.size) / Math.max(size.y, 0.001));
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
    model.rotation.y = MODEL_YAW_OFFSET;
    model.traverse((node) => {
      if (!node.isMesh) return;
      const palette = findAnimalPalette(species.id, racer.pet.paletteId) ?? species.palettes[0];
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

function clearRacers() {
  for (const view of racerViews.values()) racerRoot.remove(view.group);
  racerViews.clear();
}

function syncRacerView(racer, dt) {
  const view = racerViews.get(racer.id) ?? createRacerView(racer);
  const position = worldPoint(racer);
  view.group.position.set(position.x, racer.jumpHeight * 1.15 + 0.18, position.z);
  view.group.rotation.y = -racer.angle - Math.PI / 2;
  if (view.mixer) {
    view.walk.timeScale = Math.max(0.35, racer.speed / 65);
    view.mixer.update(dt);
  }
}

function updateCamera(dt) {
  if (!race) {
    const orbit = performance.now() * 0.00008;
    camera.position.set(Math.cos(orbit) * 54, 31, Math.sin(orbit) * 54);
    camera.lookAt(0, 0, 0);
    return;
  }
  const playerPosition = worldPoint(race.player);
  const forward = new THREE.Vector3(Math.cos(race.player.angle), 0, Math.sin(race.player.angle));
  const desired = playerPosition.clone().addScaledVector(forward, -10).add(new THREE.Vector3(0, 6.2, 0));
  const amount = 1 - Math.exp(-5.5 * dt);
  camera.position.lerp(desired, amount);
  cameraLook.lerp(playerPosition.clone().addScaledVector(forward, 4).add(new THREE.Vector3(0, 1.1, 0)), amount);
  camera.lookAt(cameraLook);
}

function petRaceData(pet) {
  return { ...pet.stats, name: pet.name, speciesId: pet.speciesId, paletteId: pet.paletteId };
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function selectPet(pet) {
  selectedPet = pet;
  for (const button of petChoices.querySelectorAll("button")) button.setAttribute("aria-checked", String(button.dataset.petId === pet.instanceId));
}

function renderPetChoices() {
  petChoices.replaceChildren();
  for (const pet of pets) {
    const style = speciesStyle(pet.speciesId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pet-card";
    button.dataset.petId = pet.instanceId;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.innerHTML = `<strong><i class="pet-dot" style="color:${style.color};background:${style.color}"></i>${escapeHtml(pet.name)}</strong><small>${style.title} · SPD ${Math.round(pet.stats.speed)} · STR ${Math.round(pet.stats.strength)}</small>`;
    button.addEventListener("click", () => selectPet(pet));
    petChoices.append(button);
  }
  selectPet(pets[0]);
}

function startRace() {
  if (!selectedPet) return;
  const fieldSize = Math.min(8, Math.max(2, Number(fieldSizeSelect.value) || 4));
  const rivals = cpuFieldFor(selectedPet, fieldSize - 1);
  race = createRace({ track: DEFAULT_TRACK, playerPet: petRaceData(selectedPet), cpuPets: rivals.map(petRaceData) });
  clearRacers();
  race.racers.forEach(createRacerView);
  screen = "race";
  resultShown = false;
  setupPanel.hidden = true;
  resultPanel.hidden = true;
  hud.hidden = false;
  touchControls.classList.add("is-racing");
  held.clear();
  canvas.focus();
}

function showSetup() {
  screen = "setup";
  race = null;
  clearRacers();
  resultShown = false;
  setupPanel.hidden = false;
  resultPanel.hidden = true;
  hud.hidden = true;
  countdownLabel.textContent = "";
  touchControls.classList.remove("is-racing");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function ordinal(value) {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

function showResult() {
  if (!race || resultShown) return;
  resultShown = true;
  screen = "result";
  const order = raceOrder(race);
  const place = order.findIndex((racer) => racer.player) + 1;
  resultKicker.textContent = `${ordinal(place)} of ${order.length}`;
  resultTitle.textContent = place === 1 ? `${race.player.pet.name} wins!` : `${race.player.pet.name} finishes ${ordinal(place)}.`;
  resultCopy.textContent = place === 1 ? "Clean racing beats raw numbers." : "Brake before corners and time each jump to climb the field.";
  playerResultTime.textContent = formatTime(race.player.finishedAt);
  fieldResult.textContent = `${order.length} pets`;
  resultStandings.replaceChildren(...order.map((racer, index) => {
    const item = document.createElement("li");
    item.classList.toggle("is-player", racer.player);
    item.textContent = `${racer.pet.name} · ${formatTime(racer.finishedAt)}`;
    item.value = index + 1;
    return item;
  }));
  resultPanel.hidden = false;
  hud.hidden = true;
  touchControls.classList.remove("is-racing");
}

function currentControls() {
  return {
    throttle: held.has("throttle") || held.has("KeyW") || held.has("ArrowUp"),
    brake: held.has("brake") || held.has("KeyS") || held.has("ArrowDown"),
    left: held.has("left") || held.has("KeyA") || held.has("ArrowLeft"),
    right: held.has("right") || held.has("KeyD") || held.has("ArrowRight"),
    jump: held.has("jump") || held.has("Space"),
  };
}

function tick() {
  if (screen !== "race" || !race) return;
  const controls = currentControls();
  race = stepRace(race, controls, TICK_SECONDS);
  if (race.status === "finished") showResult();
}

function render(dt) {
  if (race) {
    race.racers.forEach((racer) => syncRacerView(racer, dt));
    for (const [id, view] of obstacleViews) view.visible = !race.brokenObstacles.includes(id);
    const order = raceOrder(race);
    placeLabel.textContent = ordinal(order.findIndex((racer) => racer.player) + 1);
    lapLabel.textContent = `Lap ${race.player.lap} / ${race.totalLaps}`;
    progressLabel.textContent = `Checkpoint ${Math.min(race.player.checkpoint, DEFAULT_TRACK.checkpoints.length)} / ${DEFAULT_TRACK.checkpoints.length}`;
    timeLabel.textContent = formatTime(race.elapsed);
    countdownLabel.textContent = race.countdown > 0 ? String(Math.ceil(race.countdown)) : race.elapsed < 0.7 ? "GO!" : "";
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

function frame(now) {
  if (previousTime === null) previousTime = now;
  const frameSeconds = Math.min((now - previousTime) / 1000, 0.1);
  accumulator += frameSeconds;
  previousTime = now;
  while (accumulator >= TICK_SECONDS) {
    tick();
    accumulator -= TICK_SECONDS;
  }
  render(frameSeconds);
  requestAnimationFrame(frame);
}

function resize() {
  const scale = Math.min(Math.max(320, window.innerWidth - 20) / GAME_WIDTH, Math.max(260, window.innerHeight - 145) / GAME_HEIGHT);
  stage.style.width = `${Math.round(GAME_WIDTH * scale)}px`;
  stage.style.height = `${Math.round(GAME_HEIGHT * scale)}px`;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT, false);
  camera.aspect = GAME_WIDTH / GAME_HEIGHT;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
    held.add(event.code);
  }
});
window.addEventListener("keyup", (event) => held.delete(event.code));
window.addEventListener("blur", () => held.clear());
for (const button of touchControls.querySelectorAll("button")) {
  const control = button.dataset.control;
  const press = (event) => { event.preventDefault(); held.add(control); button.classList.add("is-held"); };
  const release = (event) => { event.preventDefault(); held.delete(control); button.classList.remove("is-held"); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}
startButton.addEventListener("click", startRace);
document.querySelector("#raceAgain").addEventListener("click", startRace);
document.querySelector("#changePet").addEventListener("click", showSetup);
document.querySelector("#fullscreen").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen?.() : stage.requestFullscreen?.());
document.addEventListener("fullscreenchange", resize);

resize();
requestAnimationFrame(frame);
const loaded = await loadFarmPets();
pets = loaded.pets;
renderPetChoices();
startButton.disabled = false;
startButton.textContent = "Start 3D race";
loadNote.textContent = loaded.source === "fallback" ? "Farm data was unavailable, so a balanced 3D loaner is ready." : pets[0].instanceId === "borrowed-corgi" ? "Adopt and name a farm pet to bring your own racer." : `${pets.length} farm ${pets.length === 1 ? "pet is" : "pets are"} ready.`;
