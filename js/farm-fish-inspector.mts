import * as THREE_VENDOR from "./vendor/three.module.js";
import { loadFish, type LoadedFish } from "./farm-fish-models.mjs";
import { formatLength, formatWeight, specimenTitle, type SizeClass } from "./farm-fish.mjs";
import type { AnglerFish } from "./farm-angler.mjs";

const THREE: Record<string, any> = THREE_VENDOR;

/** A metre in this scene is a metre of the saved specimen, with a fixed initial camera. */
export function inspectFish(fish: AnglerFish): void {
  const dialog = document.createElement("dialog");
  dialog.style.cssText = "width:min(900px,92vw);max-height:90vh;background:#14251f;color:#f7f2dd;border:1px solid #73856b;border-radius:18px;padding:20px";
  const title = document.createElement("h2");
  title.textContent = specimenTitle(fish.speciesId, fish.variant, fish.sizeClass as SizeClass);
  const info = document.createElement("p");
  info.textContent = `${formatLength(fish.lengthMm)} · ${formatWeight(fish.weightG)} · Drag to rotate · Scroll or pinch to zoom`;
  const stage = document.createElement("div");
  stage.style.cssText = "height:min(52vh,480px);position:relative;touch-action:none";
  const status = document.createElement("p");
  status.textContent = "Loading your catch…";
  status.setAttribute("role", "status");
  const close = document.createElement("button");
  close.className = "farm-button";
  close.textContent = "Done";
  const reset = document.createElement("button");
  reset.className = "farm-button";
  reset.textContent = "Reset scale";
  const zoom = document.createElement("input");
  zoom.type = "range"; zoom.min = "0.15"; zoom.max = "25"; zoom.step = "0.05"; zoom.value = "5";
  zoom.setAttribute("aria-label", "Viewing distance in metres");
  dialog.append(title, info, stage, status, reset, zoom, close);
  document.body.append(dialog);
  dialog.addEventListener("keydown", event => event.stopPropagation());
  dialog.showModal();
  let renderer: any;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch { status.textContent = "The 3D viewer needs WebGL. Close and try again when graphics are available."; close.onclick = () => dialog.close(); dialog.onclose = () => dialog.remove(); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.append(renderer.domElement);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
  renderer.domElement.setAttribute("aria-label", "3D catch. Drag to rotate; use the viewing distance slider to zoom.");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100);
  scene.add(new THREE.HemisphereLight(0xd9faff, 0x52634a, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 4, 5); scene.add(light);
  const pivot = new THREE.Group(); pivot.rotation.y = Math.PI / 2; scene.add(pivot);
  const grid = new THREE.GridHelper(20, 200, 0x8da892, 0x34594b); grid.position.y = -0.65; scene.add(grid);
  const metres = new THREE.GridHelper(20, 20, 0x8da892, 0x668575); metres.position.y = -0.649; scene.add(metres);
  const scale = document.createElement("small");
  scale.textContent = "True specimen scale · grid squares = 10 cm · bold lines = 1 m. Default view is shared by all catches.";
  dialog.insertBefore(scale, reset);
  let model: LoadedFish | null = null, disposed = false, frame = 0, previous = performance.now();
  let distance = 5;
  const pointers = new Map<number, { x: number; y: number }>();
  stage.onpointerdown = e => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.setPointerCapture(e.pointerId); };
  stage.onpointermove = e => {
    const old = pointers.get(e.pointerId); if (!old) return;
    if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(old.x - other.x, old.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (after > 0) distance = Math.min(25, Math.max(0.15, distance * before / after));
      zoom.value = String(distance);
    } else {
      pivot.rotation.y += (e.clientX - old.x) * 0.01;
      pivot.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pivot.rotation.x + (e.clientY - old.y) * 0.01));
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  stage.onpointerup = stage.onpointercancel = e => { pointers.delete(e.pointerId); };
  stage.addEventListener("wheel", e => { e.preventDefault(); distance = Math.min(25, Math.max(0.15, distance * Math.exp(e.deltaY * 0.001))); zoom.value = String(distance); }, { passive: false });
  zoom.oninput = () => { distance = Number(zoom.value); };
  reset.onclick = () => { distance = 5; zoom.value = "5"; pivot.rotation.set(0, Math.PI / 2, 0); };
  close.onclick = () => dialog.close();
  dialog.onclose = () => {
    disposed = true; cancelAnimationFrame(frame); model?.dispose();
    grid.geometry.dispose(); grid.material.dispose(); metres.geometry.dispose(); metres.material.dispose(); renderer.dispose(); dialog.remove();
  };
  void loadFish(THREE, fish.speciesId, fish.lengthMm / 1000, fish.variant).then(loaded => {
    if (disposed) { loaded.dispose(); return; }
    model = loaded; pivot.add(loaded.root); loaded.play("Swimming_Normal"); status.textContent = "";
  }).catch(() => { if (!disposed) status.textContent = "Couldn't load this catch. Close and try again."; });
  function draw(now: number): void {
    if (disposed) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    camera.position.set(0, 0.15 * distance, distance); camera.lookAt(0, 0, 0);
    model?.update(Math.min(0.05, (now - previous) / 1000)); previous = now;
    renderer.render(scene, camera); frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
}
