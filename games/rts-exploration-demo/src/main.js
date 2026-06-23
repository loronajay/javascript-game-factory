import { CONFIG } from './config.js';
import { buildGameMap } from './map.js';
import { level01 } from './maps/level-01.js';
import { Camera } from './camera.js';
import { UnitManager } from './units.js';
import { WorldEntityManager } from './entities.js';
import { FogOfWar } from './fog.js';
import { InputController } from './input.js';
import { Renderer } from './renderer.js';
import { Hud } from './hud.js';
import { CommandSystem } from './commands.js';
import { createDebugSnapshot } from './snapshot.js';
import { AiController } from './ai-controller.js';

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const debugLines = document.getElementById('debug-lines');

const map = buildGameMap(level01);
const camera = new Camera({
  worldWidth: map.worldWidth,
  worldHeight: map.worldHeight,
  viewportWidth: CONFIG.canvasWidth,
  viewportHeight: CONFIG.canvasHeight,
});

const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const units = new UnitManager(map, entities);
units.spawnFromDef(level01.spawns);

const fog = new FogOfWar(map);
let simTick = 0;
const simStep = 1 / CONFIG.simHz;
const commands = new CommandSystem({ units, map, getTick: () => simTick });
const ai = new AiController({ team: 2, units, map, commands });
const input = new InputController(canvas, camera, units, map, commands, ai, entities);
const renderer = new Renderer(canvas, map, camera, units, fog, input, entities);
const hud = new Hud(hudRoot, debugLines, map, camera, units, input, { commands, ai, getTick: () => simTick, entities });

let lastTime = performance.now();
let accumulator = 0;
let fogTickCounter = 0;

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
units.updateDiscovery(fog);
entities.updateDiscovery(fog);
map.updateResourceDiscovery(fog);

function loop(now) {
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  input.update(frameDt);
  input.updateCommandMarker(frameDt);

  accumulator += frameDt;
  while (accumulator >= simStep) {
    simTick += 1;
    ai.update(simTick);
    units.update(simStep, simTick * simStep);
    fogTickCounter += 1;
    if (fogTickCounter >= Math.max(1, Math.round(CONFIG.simHz / CONFIG.fogRecomputeHz))) {
      fog.recompute(units);
      units.updateDiscovery(fog);
      entities.updateDiscovery(fog);
      map.updateResourceDiscovery(fog);
      fogTickCounter = 0;
    }
    accumulator -= simStep;
  }

  renderer.render();
  hud.update(frameDt);
  requestAnimationFrame(loop);
}

window.__rtsDebugSnapshot = () => createDebugSnapshot({ tick: simTick, units, map, commands, ai, entities });
window.__rtsCommands = commands;
window.__rtsAi = ai;

requestAnimationFrame(loop);
