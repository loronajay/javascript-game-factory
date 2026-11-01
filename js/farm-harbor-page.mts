import * as THREE_VENDOR from "./vendor/three.module.js";
import { BOAT_HANDLING, HARBOR_DOCKS, HARBOR_ISLANDS, dockedBoat, nearbyBoatDock, stepBoat, toggleBoatAnchor, useBoatDock } from "./farm-boating.mjs";
import { createHarborWorld } from "./farm-harbor-world.mjs";
import { horseTravelQuery } from "./farm-riding-travel.mjs";

const THREE: Record<string, any> = THREE_VENDOR;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const canvas = element<HTMLCanvasElement>("harborCanvas");
const board = element<HTMLButtonElement>("useDock"), anchor = element<HTMLButtonElement>("toggleAnchor"), recovery = element<HTMLButtonElement>("returnHarbor");
const status = element<HTMLElement>("harborStatus"), prompt = element<HTMLElement>("boatPrompt");
const query = new URLSearchParams(location.search);
element<HTMLAnchorElement>("backToCove").href = `../cove/index.html?from=harbor&${horseTravelQuery(query.get("farm") ?? "", query.get("horse") ?? "")}`;
const chartLand = document.getElementById("chartLand")!, chartBoat = document.getElementById("chartBoat")!;
function chartShape(name: string, attrs: Record<string, string | number>) {
  const shape = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, String(value));
  chartLand.append(shape);
}
chartShape("rect", { x: -75, y: 22, width: 150, height: 13, fill: "#91ab7b" });
for (const island of HARBOR_ISLANDS) chartShape("circle", { cx: island.x, cy: island.z, r: island.radius + 1.8, fill: "#91ab7b", stroke: "#c4c49d", "stroke-width": 2 });
for (const dock of HARBOR_DOCKS) {
  chartShape("rect", { x: dock.minX, y: dock.minZ, width: dock.maxX - dock.minX, height: dock.maxZ - dock.minZ, fill: "#9a805a" });
  chartShape("circle", { cx: dock.x, cy: dock.z, r: 2, fill: "#f7efd6", stroke: "#6e8776", "stroke-width": 0.6 });
}

let state = dockedBoat(), orbit = 0, dragX: number | null = null, frameId = 0;
let noticeUntil = 0;
function notice(message: string, duration = 5000) { status.textContent = message; noticeUntil = performance.now() + duration; }
const keys = new Set<string>();
const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function refresh() {
  const dock = nearbyBoatDock(state), slow = Math.abs(state.speed) <= BOAT_HANDLING.dockingSpeed;
  element<HTMLElement>("boatMode").textContent = state.mode === "docked" ? HARBOR_DOCKS.find((entry) => entry.id === state.dockId)!.title : state.mode === "anchored" ? "At anchor" : "Under way";
  element<HTMLElement>("boatSpeed").textContent = Math.abs(state.speed).toFixed(1);
  element<HTMLElement>("boatHeading").textContent = directions[((Math.round(-state.yaw / (Math.PI / 4)) % 8) + 8) % 8]!;
  board.textContent = state.mode === "docked" ? "Board boat · E" : dock ? `Moor at ${dock.title} · E` : "Approach a dock · E";
  board.disabled = state.mode !== "docked" && (!dock || !slow);
  anchor.disabled = state.mode === "docked";
  anchor.textContent = state.mode === "anchored" ? "Raise anchor · R" : "Drop anchor · R";
  prompt.textContent = state.mode === "docked" ? "Your boat is moored. Board when you’re ready to head out."
    : state.mode === "anchored" ? "The anchor holds you steady. Raise it to start rowing again."
    : dock ? slow ? "Alongside the landing. Moor here to step ashore." : "Easy does it. Hold Space to slow down before mooring."
    : "Explore the islands. The pale rings mark safe moorings; orange buoys mark the trial waters.";
  chartBoat.setAttribute("transform", `translate(${state.x} ${state.z}) rotate(${-state.yaw * 180 / Math.PI})`);
}
function interact() { state = useBoatDock(state); keys.clear(); refresh(); }
function changeAnchor() { state = toggleBoatAnchor(state); keys.clear(); refresh(); }
board.addEventListener("click", interact); anchor.addEventListener("click", changeAnchor);
recovery.addEventListener("click", () => { state = dockedBoat(); orbit = 0; keys.clear(); notice("Back safely at Mainland Harbor."); refresh(); });
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space"].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
  if (event.repeat) return;
  if (event.code === "KeyE") interact();
  if (event.code === "KeyR") changeAnchor();
  if (event.code === "Escape") { keys.clear(); state = toggleBoatAnchor({ ...state, mode: state.mode === "docked" ? "docked" : "sailing" }); refresh(); }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => keys.clear());
canvas.addEventListener("pointerdown", (event) => { dragX = event.clientX; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => { if (dragX !== null) { orbit -= (event.clientX - dragX) * 0.007; dragX = event.clientX; } });
canvas.addEventListener("pointerup", () => { dragX = null; }); canvas.addEventListener("pointercancel", () => { dragX = null; });
for (const control of document.querySelectorAll<HTMLButtonElement>("[data-control]")) {
  control.addEventListener("pointerdown", (event) => { event.preventDefault(); control.setPointerCapture(event.pointerId); keys.add(control.dataset.control!); });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) control.addEventListener(name, () => keys.delete(control.dataset.control!));
}
refresh();
try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  const world = createHarborWorld(THREE, scene, (ok) => { if (!ok) notice("The boat model couldn’t load. You can still try the controls with the practice hull.", 30000); });
  const target = new THREE.Vector3(); camera.position.set(17, 11, 24);
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", resize); resize();
  let previous = performance.now(), lastDisplay = 0, lastWarning = 0;
  function frame(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
    if (!document.hidden) {
      const input = { throttle: Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")), turn: Number(keys.has("KeyA") || keys.has("ArrowLeft")) - Number(keys.has("KeyD") || keys.has("ArrowRight")), brake: keys.has("Space") };
      const next = stepBoat(state, input, dt); state = next.state;
      if (next.blocked && now - lastWarning > 2000) { notice("Shallows or a harbor boundary ahead. Reverse gently and turn back toward open water."); lastWarning = now; }
      if (noticeUntil && now > noticeUntil) { status.textContent = ""; noticeUntil = 0; }
      world.update(state, now / 1000);
      const angle = state.yaw + orbit;
      target.set(state.x + Math.sin(angle) * 12, 5.5, state.z + Math.cos(angle) * 12);
      camera.position.lerp(target, 1 - Math.exp(-dt * 4)); camera.lookAt(state.x - Math.sin(state.yaw) * 6, 0.5, state.z - Math.cos(state.yaw) * 6);
      renderer.render(scene, camera);
      if (now - lastDisplay > 100) { refresh(); lastDisplay = now; }
    }
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  window.addEventListener("pagehide", () => { cancelAnimationFrame(frameId); world.dispose(); renderer.dispose(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
} catch {
  status.textContent = "The harbor needs WebGL to draw the water and boat. Try a browser with hardware acceleration enabled.";
  board.disabled = true; anchor.disabled = true; recovery.disabled = true;
}
