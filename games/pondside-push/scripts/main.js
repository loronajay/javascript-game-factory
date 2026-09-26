import * as THREE from "../../../js/vendor/three.module.js";
import { GLTFLoader } from "../../../js/vendor/loaders/GLTFLoader.js";
import { findAnimal, findAnimalPalette } from "../../../js/farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips } from "../../../js/farm-animal-clips.mjs";
import { materialForAnimalPalette } from "../../../js/farm-pet-palettes.mjs";
import { createSurfaceMaterial } from "../../../js/arcade-room-surfaces.mjs";
import { DEFAULT_GROUND_ID, findGround } from "../../../js/farm-catalog/ground.mjs";
import { farmMaterial } from "../../../js/farm-materials.mjs";
import { loadFarmPets } from "../../pet-games/shared/farm-source.js";
import { cpuFieldFor, speciesStyle } from "../../pet-games/shared/pets.js";
import { cpuControls } from "./cpu.js";
import { ARENA_RADIUS, createMatch, resetRound, stepMatch, WINS_TO_MATCH } from "./match.js";
import { yawForFacing } from "./presentation.js";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;
const TICK_SECONDS = 1 / 60;
const WORLD_SCALE = 0.035;
const MODEL_YAW_OFFSET = Math.PI;

const canvas = document.querySelector("#arenaCanvas");
const stage = document.querySelector("#gameStage");
const setupPanel = document.querySelector("#setupPanel");
const petChoices = document.querySelector("#petChoices");
const startButton = document.querySelector("#startMatch");
const loadNote = document.querySelector("#loadNote");
const scoreboard = document.querySelector("#scoreboard");
const resultPanel = document.querySelector("#roundResult");
const resultKicker = document.querySelector("#resultKicker");
const resultTitle = document.querySelector("#resultTitle");
const resultCopy = document.querySelector("#resultCopy");
const nextRoundButton = document.querySelector("#nextRound");
const changePetButton = document.querySelector("#changePet");
const roundBanner = document.querySelector("#roundBanner");

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
const camera = new THREE.PerspectiveCamera(46, GAME_WIDTH / GAME_HEIGHT, 0.1, 130);
camera.position.set(0, 18, 20);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xe7fbff, 0x385239, 2.5));
const sun = new THREE.DirectionalLight(0xffe9bc, 3.4);
sun.position.set(-15, 28, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);

const arenaRoot = new THREE.Group();
const petRoot = new THREE.Group();
const debugRoot = new THREE.Group();
debugRoot.visible = false;
scene.add(arenaRoot, petRoot, debugRoot);
const loader = new GLTFLoader();
const views = new Map();
const held = new Set();
let pets = [];
let selectedPet = null;
let match = null;
let screen = "setup";
let previousTime = null;
let accumulator = 0;
let lastResolvedRound = 0;
let bannerUntil = 0;
let resultDelay = -1;

function buildArena() {
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

  const stone = new THREE.Mesh(new THREE.CylinderGeometry(islandRadius + 0.32, islandRadius + 0.5, 0.75, 64), new THREE.MeshStandardMaterial({ color: 0x8b8063, roughness: 1 }));
  stone.position.y = -0.34;
  stone.receiveShadow = true;
  arenaRoot.add(stone);
  const farmGrass = findGround(DEFAULT_GROUND_ID).style;
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(islandRadius, 64),
    createSurfaceMaterial(THREE, farmGrass, { u: islandRadius * 2, v: islandRadius * 2 }),
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

}
buildArena();

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
    button.innerHTML = `<strong><i class="pet-dot" style="color:${style.color};background:${style.color}"></i>${escapeHtml(pet.name)}</strong><small>${style.title} · SPD ${Math.round(pet.stats.speed)} · STR ${Math.round(pet.stats.strength)}</small>`;
    button.addEventListener("click", () => selectPet(pet));
    petChoices.append(button);
  }
  selectPet(pets[0]);
}

function createPetView(player) {
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
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: player.player ? 0xffdf63 : 0xe96551, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
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
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar((species.height * player.pet.stats.size) / Math.max(size.y, 0.001));
    const fitted = new THREE.Box3().setFromObject(model);
    const centre = fitted.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -fitted.min.y, -centre.z);
    model.rotation.y = MODEL_YAW_OFFSET;
    model.traverse((node) => {
      if (!node.isMesh) return;
      const palette = findAnimalPalette(species.id, player.pet.paletteId) ?? species.palettes[0];
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

function clearViews() {
  for (const view of views.values()) {
    petRoot.remove(view.group);
    petRoot.remove(view.splash);
    debugRoot.remove(view.hitbox);
  }
  views.clear();
}

function renderScoreboard() {
  if (!match) return;
  scoreboard.innerHTML = match.players.map((player) => `<div class="score-chip${player.player ? " player" : ""}"><small>${escapeHtml(player.pet.name)}</small><strong>${"●".repeat(player.wins)}${"○".repeat(WINS_TO_MATCH - player.wins)}</strong></div>`).join("");
}

function startMatch() {
  const field = [selectedPet, ...cpuFieldFor(selectedPet, 3)];
  match = createMatch(field);
  clearViews();
  match.players.forEach(createPetView);
  lastResolvedRound = 0;
  resultDelay = -1;
  screen = "match";
  setupPanel.hidden = true;
  resultPanel.hidden = true;
  scoreboard.hidden = false;
  roundBanner.textContent = "ROUND 1";
  bannerUntil = performance.now() + 1200;
  renderScoreboard();
  canvas.focus();
}

function playerControls() {
  return {
    x: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
    y: (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0),
    bump: held.has("bump"),
  };
}

function simulationTick() {
  if (!match) return;
  if (match.phase === "playing") {
    const controls = { [match.players[0].id]: playerControls() };
    for (const rival of match.players.slice(1)) controls[rival.id] = cpuControls(rival, match.players, match.tick);
    stepMatch(match, controls, TICK_SECONDS);
    if (match.phase !== "playing" && lastResolvedRound !== match.round) {
      lastResolvedRound = match.round;
      resultDelay = 1.25;
    }
  } else {
    stepMatch(match, {}, TICK_SECONDS);
    if (resultDelay > 0) {
      resultDelay -= TICK_SECONDS;
      if (resultDelay <= 0) showRoundResult();
    }
  }
}

function showRoundResult() {
  renderScoreboard();
  const winner = match.players.find((player) => player.id === match.roundWinnerId);
  const playerWon = winner?.player;
  const matchOver = match.phase === "match-over";
  resultKicker.textContent = matchOver ? "Match complete" : `Round ${match.round}`;
  resultTitle.textContent = matchOver ? (playerWon ? "Island champion!" : `${winner.pet.name} takes it!`) : (playerWon ? "You held the hill!" : `${winner.pet.name} stayed dry!`);
  resultCopy.textContent = matchOver ? `${winner.pet.name} reached three wins first.` : `${winner.pet.name} was the last pet standing. The score carries into the next round.`;
  nextRoundButton.textContent = matchOver ? "Rematch" : "Next round";
  changePetButton.hidden = !matchOver;
  resultPanel.hidden = false;
}

function nextRound() {
  if (match.phase === "match-over") startMatch();
  else {
    resetRound(match);
    resultDelay = -1;
    resultPanel.hidden = true;
    roundBanner.textContent = `ROUND ${match.round}`;
    bannerUntil = performance.now() + 1000;
    renderScoreboard();
    canvas.focus();
  }
}

function backToSetup() {
  screen = "setup";
  match = null;
  clearViews();
  scoreboard.hidden = true;
  resultPanel.hidden = true;
  setupPanel.hidden = false;
}

function syncViews(dt) {
  if (!match) return;
  for (const player of match.players) {
    const view = views.get(player.id);
    if (!view) continue;
    const targetY = 0.12 - player.fallHeight * WORLD_SCALE;
    view.group.position.set(player.x * WORLD_SCALE, targetY, player.y * WORLD_SCALE);
    view.group.rotation.y = yawForFacing(player.facingX, player.facingY);
    view.visual.rotation.x = player.eliminated ? Math.min(Math.PI * 0.46, player.fallHeight * 0.018) : 0;
    view.hitbox.position.set(player.x * WORLD_SCALE, 0, player.y * WORLD_SCALE);
    view.group.visible = view.group.position.y > -3.2;
    view.marker.visible = !player.eliminated;
    view.splash.position.x = player.x * WORLD_SCALE;
    view.splash.position.z = player.y * WORLD_SCALE;
    view.splash.visible = player.splashAge >= 0 && player.splashAge < 0.9;
    if (view.splash.visible) {
      const splashScale = 1 + player.splashAge * 3.6;
      view.splash.scale.setScalar(splashScale);
      view.splash.material.opacity = Math.max(0, 0.9 - player.splashAge);
    }
    view.bumpWave.visible = player.bumpTimer > 0;
    if (view.bumpWave.visible) {
      const scale = 1 + (0.16 - player.bumpTimer) * 6;
      view.bumpWave.scale.setScalar(scale);
    }
    if (!player.eliminated) {
      const squash = player.impact;
      view.visual.scale.set(1 + squash * 0.24, 1 - squash * 0.28, 1 + squash * 0.24);
    }
    if (view.mixer) {
      const speed = Math.hypot(player.vx, player.vy);
      view.walk.timeScale = Math.max(0.25, speed / 90);
      view.mixer.update(dt);
    }
  }
}

/** Toggle measured collision rings: red bodies and the green elimination boundary. */
function debugDraw(enabled = !debugRoot.visible) {
  if (!debugRoot.userData.boundary) {
    const radius = ARENA_RADIUS * WORLD_SCALE;
    const boundary = new THREE.Mesh(new THREE.RingGeometry(radius - 0.035, radius + 0.035, 64), new THREE.MeshBasicMaterial({ color: 0x35ff72, side: THREE.DoubleSide }));
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.14;
    debugRoot.add(boundary);
    debugRoot.userData.boundary = boundary;
  }
  debugRoot.visible = enabled;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const scale = Math.min(rect.width / GAME_WIDTH, rect.height / GAME_HEIGHT);
  const width = Math.max(1, Math.floor(GAME_WIDTH * scale));
  const height = Math.max(1, Math.floor(GAME_HEIGHT * scale));
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function loop(timestamp) {
  if (previousTime === null) previousTime = timestamp;
  accumulator += Math.min((timestamp - previousTime) / 1000, 0.1);
  previousTime = timestamp;
  while (accumulator >= TICK_SECONDS) {
    accumulator -= TICK_SECONDS;
    simulationTick();
  }
  syncViews(Math.min(0.05, TICK_SECONDS + accumulator));
  const impact = match ? Math.max(0, ...match.players.map((player) => player.impact)) : 0;
  camera.position.set(Math.sin(timestamp * 0.12) * impact * 0.14, 18 + Math.cos(timestamp * 0.15) * impact * 0.08, 20);
  camera.lookAt(0, 0, 0);
  if (timestamp > bannerUntil) roundBanner.textContent = "";
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

const keyMap = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "bump" };
window.addEventListener("keydown", (event) => {
  if (keyMap[event.code]) { held.add(keyMap[event.code]); event.preventDefault(); }
  if (event.code === "KeyH") debugDraw();
});
window.addEventListener("keyup", (event) => { if (keyMap[event.code]) held.delete(keyMap[event.code]); });
window.addEventListener("blur", () => held.clear());
for (const button of document.querySelectorAll("[data-control]")) {
  const control = button.dataset.control;
  const press = (event) => { event.preventDefault(); held.add(control); };
  const release = (event) => { event.preventDefault(); held.delete(control); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}
startButton.addEventListener("click", startMatch);
nextRoundButton.addEventListener("click", nextRound);
changePetButton.addEventListener("click", backToSetup);
document.querySelector("#fullscreen").addEventListener("click", () => stage.requestFullscreen?.());
window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);

const loaded = await loadFarmPets();
pets = loaded.pets;
renderPetChoices();
startButton.disabled = false;
startButton.textContent = "Enter the arena";
loadNote.textContent = loaded.source === "fallback" ? "Your farm was unavailable, so Borrowed Biscuit is ready." : "Your farm pets are ready.";
resize();
requestAnimationFrame(loop);
