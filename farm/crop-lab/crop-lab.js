// Crop Lab: a dev viewer for the farm's crop GLBs. It shows the live catalog
// (js/farm-crops.mjs) plus any generated candidates (candidates.json) that have
// not been promoted into the catalog yet, fitted exactly the way the farm plot
// fits them (farm-crops-view.mts: fittedModel), so what you judge here is what
// a player sees in a soil cell.

import * as THREE from "../../js/vendor/three.module.js";
import { GLTFLoader } from "../../js/vendor/loaders/GLTFLoader.js";
import { CROP_CATALOG } from "../../js/farm-crops.mjs";

const ASSET_ROOT = new URL("../assets/crops/", import.meta.url);
const STAGE_NAMES = ["Sprout", "Young", "Budding", "Ripe"];
const SPACING = 1.15;

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc7e0);
scene.fog = new THREE.Fog(0x9fc7e0, 14, 30);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x5d6b3a, 1.6));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
scene.add(sun);

const grass = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x6f9a46, roughness: 1 }));
grass.rotation.x = -Math.PI / 2;
grass.receiveShadow = true;
scene.add(grass);

const stage = new THREE.Group();
scene.add(stage);

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
const orbit = { yaw: 0.35, pitch: 0.42, distance: 5.2, target: new THREE.Vector3(0, 0.35, 0) };

// ---------------------------------------------------------------- data

const catalogIds = new Set(CROP_CATALOG.map((crop) => crop.id));
let candidates = [];
try {
  const response = await fetch(new URL("./candidates.json", import.meta.url), { cache: "no-store" });
  if (response.ok) candidates = (await response.json()).crops ?? [];
} catch { /* no candidates generated yet */ }
const candidateIds = new Set(candidates.map((crop) => crop.id));
const crops = [
  ...CROP_CATALOG.map((crop) => ({ id: crop.id, title: crop.title, models: [...crop.models], generated: candidateIds.has(crop.id) })),
  ...candidates.filter((crop) => !catalogIds.has(crop.id)).map((crop) => ({ ...crop, generated: true, candidate: true })),
];

const state = { cropId: crops.find((crop) => crop.candidate)?.id ?? crops[0]?.id, mode: "stages", fit: true, wire: false, spin: false };
const params = new URLSearchParams(location.search);
if (params.get("crop") && crops.some((crop) => crop.id === params.get("crop"))) state.cropId = params.get("crop");
if (params.get("mode") === "all") state.mode = "all";

// ---------------------------------------------------------------- loading

const loader = new GLTFLoader();
const cache = new Map();
function loadModel(file) {
  if (!cache.has(file)) {
    const url = new URL(file, ASSET_ROOT);
    url.searchParams.set("v", String(Date.now()));
    cache.set(file, Promise.all([
      loader.loadAsync(url.toString()),
      fetch(url).then((r) => r.blob()).then((b) => b.size).catch(() => 0),
    ]).then(([gltf, bytes]) => ({ scene: gltf.scene, bytes })));
  }
  return cache.get(file).then(({ scene: source, bytes }) => ({ model: source.clone(true), bytes }));
}

function measure(model) {
  let triangles = 0;
  let vertices = 0;
  model.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry;
    vertices += geometry.attributes.position.count;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return { triangles: Math.round(triangles), vertices };
}

/** Mirror of farm-crops-view.mts fittedModel for an outdoor soil cell. */
function place(model, stageIndex) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (state.fit) {
    const target = { width: 0.68, depth: 0.62, height: 0.48 + stageIndex * 0.2 };
    const scale = Math.min(target.width / size.x, target.depth / size.z, target.height / size.y);
    model.scale.setScalar(Number.isFinite(scale) ? scale : 1);
  } else {
    model.scale.setScalar(2);
  }
  const fitted = new THREE.Box3().setFromObject(model);
  const centre = fitted.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -fitted.min.y, -centre.z);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material.wireframe = state.wire;
  });
  return model;
}

function soilTile() {
  const tile = new THREE.Group();
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.025, 0.82), new THREE.MeshStandardMaterial({ color: 0xc39a52, roughness: 1 }));
  border.position.y = 0.07;
  const earth = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.03, 0.74), new THREE.MeshStandardMaterial({ color: 0x34291d, roughness: 1 }));
  earth.position.y = 0.09;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.9), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }));
  bed.position.y = 0.03;
  for (const mesh of [bed, border, earth]) { mesh.receiveShadow = true; tile.add(mesh); }
  return tile;
}

function label(text, sub) {
  const surface = document.createElement("canvas");
  surface.width = 512;
  surface.height = 128;
  const context = surface.getContext("2d");
  context.fillStyle = "rgba(20,17,12,.78)";
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 24);
  context.fill();
  context.textAlign = "center";
  context.fillStyle = "#f1e6cf";
  context.font = "bold 46px system-ui, sans-serif";
  context.fillText(text, 256, sub ? 60 : 80);
  if (sub) {
    context.fillStyle = "#a8997b";
    context.font = "30px system-ui, sans-serif";
    context.fillText(sub, 256, 100);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(0.56, 0.14, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---------------------------------------------------------------- build

let buildToken = 0;
async function build() {
  const token = ++buildToken;
  for (const child of [...stage.children]) stage.remove(child);
  const crop = crops.find((entry) => entry.id === state.cropId);
  document.getElementById("title").textContent = state.mode === "all" ? "All crops — ripe stage" : `${crop.title}${crop.candidate ? "  (candidate)" : ""}`;
  const statsElement = document.getElementById("stats");
  statsElement.replaceChildren();

  const slots = state.mode === "all"
    ? crops.map((entry, index) => ({ file: entry.models[3], stageIndex: 3, name: entry.title, sub: entry.candidate ? "new" : entry.generated ? "generated" : "Grimnir", index }))
    : crop.models.map((file, index) => ({ file, stageIndex: index, name: STAGE_NAMES[index], sub: file.replace(/\.glb$/, ""), index }));
  const columns = state.mode === "all" ? Math.ceil(Math.sqrt(slots.length * 1.6)) : slots.length;
  const rows = Math.ceil(slots.length / columns);

  const results = await Promise.all(slots.map((slot) => loadModel(slot.file).catch(() => null)));
  if (token !== buildToken) return;
  slots.forEach((slot, i) => {
    const column = slot.index % columns;
    const row = Math.floor(slot.index / columns);
    const cell = new THREE.Group();
    cell.position.set((column - (columns - 1) / 2) * SPACING, 0, (row - (rows - 1) / 2) * SPACING * 1.1);
    cell.add(soilTile());
    const loaded = results[i];
    if (loaded) {
      const holder = new THREE.Group();
      holder.position.y = 0.12;
      holder.add(place(loaded.model, slot.stageIndex));
      cell.add(holder);
      const tag = label(slot.name, state.mode === "all" ? slot.sub : null);
      tag.position.set(0, state.fit ? 1.35 : 1.5, 0.35);
      cell.add(tag);
      if (state.mode === "stages") {
        const numbers = measure(loaded.model);
        const box = document.createElement("div");
        box.innerHTML = `<b>${slot.index + 1} · ${slot.name}</b>${slot.sub}<br>${numbers.triangles} tris · ${(loaded.bytes / 1024).toFixed(1)} KB`;
        statsElement.append(box);
      }
    }
    stage.add(cell);
  });
  const span = Math.max(columns * SPACING, rows * SPACING * 1.1);
  orbit.distance = state.mode === "all" ? span * 1.25 + 1 : 5.2;
  orbit.target.set(0, 0.35, 0);
}

function renderList() {
  const list = document.getElementById("list");
  list.replaceChildren();
  const groups = [
    ["In the catalog", crops.filter((crop) => !crop.candidate)],
    ["Candidates (not in catalog yet)", crops.filter((crop) => crop.candidate)],
  ];
  for (const [heading, entries] of groups) {
    if (!entries.length) continue;
    const h = document.createElement("h2");
    h.textContent = heading;
    list.append(h);
    for (const crop of entries) {
      const button = document.createElement("button");
      button.className = crop.generated ? "is-new" : "";
      button.setAttribute("aria-pressed", String(state.mode === "stages" && crop.id === state.cropId));
      button.innerHTML = `<span>${crop.title}</span><small>${crop.generated ? "generated" : "Grimnir"}</small>`;
      button.addEventListener("click", () => { state.cropId = crop.id; state.mode = "stages"; sync(); });
      list.append(button);
    }
  }
}

function sync() {
  document.getElementById("modeStages").setAttribute("aria-pressed", String(state.mode === "stages"));
  document.getElementById("modeAll").setAttribute("aria-pressed", String(state.mode === "all"));
  document.getElementById("fit").setAttribute("aria-pressed", String(state.fit));
  document.getElementById("wire").setAttribute("aria-pressed", String(state.wire));
  document.getElementById("spin").setAttribute("aria-pressed", String(state.spin));
  renderList();
  build();
}

document.getElementById("modeStages").addEventListener("click", () => { state.mode = "stages"; sync(); });
document.getElementById("modeAll").addEventListener("click", () => { state.mode = "all"; sync(); });
document.getElementById("fit").addEventListener("click", () => { state.fit = !state.fit; sync(); });
document.getElementById("wire").addEventListener("click", () => { state.wire = !state.wire; sync(); });
document.getElementById("spin").addEventListener("click", () => { state.spin = !state.spin; sync(); });

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const index = crops.findIndex((crop) => crop.id === state.cropId);
    const next = crops[(index + (event.key === "ArrowDown" ? 1 : -1) + crops.length) % crops.length];
    state.cropId = next.id;
    state.mode = "stages";
    event.preventDefault();
    sync();
  }
  if (state.mode === "stages" && /^[1-4]$/.test(event.key)) {
    orbit.target.set((Number(event.key) - 2.5) * SPACING, 0.4, 0);
    orbit.distance = 1.9;
  }
  if (event.key === "0" || event.key === "Escape") { orbit.target.set(0, 0.35, 0); orbit.distance = state.mode === "all" ? orbit.distance : 5.2; }
});

// ---------------------------------------------------------------- orbit

let drag = null;
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => { drag = { x: event.clientX, y: event.clientY, pan: event.button !== 0 }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointerup", () => { drag = null; });
canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.pan) {
    const right = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
    const scale = orbit.distance * 0.0016;
    orbit.target.addScaledVector(right, -dx * scale);
    orbit.target.y = Math.max(0, orbit.target.y + dy * scale);
  } else {
    orbit.yaw -= dx * 0.008;
    orbit.pitch = Math.min(1.45, Math.max(0.02, orbit.pitch + dy * 0.006));
  }
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbit.distance = Math.min(40, Math.max(0.6, orbit.distance * Math.exp(event.deltaY * 0.001)));
}, { passive: false });

function resize() {
  const { clientWidth, clientHeight } = canvas;
  if (canvas.width !== Math.floor(clientWidth * renderer.getPixelRatio()) || canvas.height !== Math.floor(clientHeight * renderer.getPixelRatio())) {
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  }
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.spin) orbit.yaw += dt * 0.5;
  resize();
  camera.position.set(
    orbit.target.x + orbit.distance * Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
    orbit.target.y + orbit.distance * Math.sin(orbit.pitch),
    orbit.target.z + orbit.distance * Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
  );
  camera.lookAt(orbit.target);
  renderer.render(scene, camera);
});

window.__cropLab = { state, sync, orbit, ready: () => new Promise((resolve) => setTimeout(resolve, 50)) };
sync();
