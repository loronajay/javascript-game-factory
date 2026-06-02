import { CONFIG } from './config.js';
import { GameMap } from './map.js';
import { Camera } from './camera.js';
import { UnitManager } from './units.js';
import { FogOfWar } from './fog.js';
import { InputController } from './input.js';
import { Renderer } from './renderer.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const hudLines = document.getElementById('hud-lines');
const map = new GameMap(CONFIG.mapWidth, CONFIG.mapHeight, CONFIG.tileSize);
const camera = new Camera({
  worldWidth: map.worldWidth,
  worldHeight: map.worldHeight,
  viewportWidth: CONFIG.canvasWidth,
  viewportHeight: CONFIG.canvasHeight,
});
const units = new UnitManager(map);
const fog = new FogOfWar(map);
const input = new InputController(canvas, camera, units, map);
const renderer = new Renderer(canvas, map, camera, units, fog, input);
const hud = new Hud(hudLines, map, camera, units, input);

let lastTime = performance.now();
let fogTimer = 0;

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
resize();

const startCenter = units.selectedCenter() ?? { x: 320, y: 320 };
camera.centerOn(startCenter.x + 250, startCenter.y + 200);
fog.recompute(units);

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  input.update(dt);
  units.update(dt);
  input.updateCommandMarker(dt);

  fogTimer += dt;
  if (fogTimer >= 1 / CONFIG.fogRecomputeHz) {
    fog.recompute(units);
    fogTimer = 0;
  }

  renderer.render();
  hud.update(dt);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
