import * as THREE from '../vendor/three.module.js';
import { createMapScene } from './scene-3d.js';
import { gridToWorld, WORLD_3D } from './map-3d.js';
import { drawHud, drawMessage } from './renderer-hud.js';
import { resizeCanvasToDisplaySize } from './renderer-primitives.js';
import { getSuitLighting } from './lighting.js';

let view = null;

export function initializeGameView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 180);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x819caa, 0x111922, 0.22));
  scene.add(new THREE.AmbientLight(0x78939c, 0.05));
  const fill = new THREE.DirectionalLight(0x9bafba, 0.08);
  fill.position.set(-0.35, 1, 0.25); scene.add(fill);
  const flashlight = new THREE.SpotLight(0xd9fbff, 19, 26, Math.PI / 4.2, 0.48, 1.2);
  flashlight.position.set(0, -0.02, 0.04); flashlight.target.position.set(0, -0.05, -1);
  camera.add(flashlight, flashlight.target);
  const suit = new THREE.PointLight(0x66e8ff, 2.6, 7.5, 1.45);
  suit.position.set(0, -0.35, 0.15); camera.add(suit);
  view = { renderer, scene, camera, flashlight, suit, map: null, world: null, width: 0, height: 0, dpr: 0 };
}

export function setGameViewActive(active) {
  if (!view) return;
  view.renderer.domElement.hidden = !active;
  if (!active && view.world) {
    view.scene.remove(view.world.root); view.world.dispose(); view.world = null; view.map = null;
  }
}

export function renderGameView(canvas, state, now) {
  if (!view) return;
  const { renderer, scene, camera, flashlight, suit } = view;
  if (view.map !== state.map) {
    if (view.world) { scene.remove(view.world.root); view.world.dispose(); }
    view.world = createMapScene(state.map, state.world3d, state.hazards); view.map = state.map;
    scene.add(view.world.root);
    scene.background = new THREE.Color(0x020609);
    scene.fog = new THREE.FogExp2(0x020609, 0.075);
  }
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const width = Math.max(1, Math.floor(rect.width)), height = Math.max(1, Math.floor(rect.height));
  if (width !== view.width || height !== view.height || dpr !== view.dpr) {
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    Object.assign(view, { width, height, dpr });
  }
  const p = gridToWorld(state.map, state.player.px, state.player.py);
  camera.position.set(p.x, WORLD_3D.eyeHeight, p.z);
  camera.rotation.set(state.player.pitch, state.player.yaw, 0, 'YXZ');
  const lighting = getSuitLighting(state.player, now);
  flashlight.intensity = lighting.beamIntensity; flashlight.distance = lighting.beamDistance;
  suit.intensity = lighting.suitIntensity; suit.distance = lighting.suitDistance;
  scene.fog.density = lighting.fogDensity;
  view.world.sync(state, now);
  renderer.render(scene, camera);

  // Existing cabinet HUD stays on a transparent 2D overlay above the world canvas.
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (now < state.player.invulnerableUntil) {
    ctx.fillStyle = 'rgba(255,45,75,0.10)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,75,95,0.55)'; ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }
  drawHud(ctx, state, now, canvas.width, canvas.height);
  drawMessage(ctx, state, canvas.width, canvas.height);
  const x = canvas.width / 2, y = canvas.height / 2;
  ctx.fillStyle = 'rgba(208,251,255,0.65)';
  ctx.fillRect(x - 2, y - 2, 4, 4);
}
