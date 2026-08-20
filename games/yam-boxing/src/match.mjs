import { MatchInput } from "./controllers/match-input.mjs";
import { actionForGuard, guardBlendForElapsed, updateGuardState } from "./core/guard-state.mjs";
import { directionForViewer, movePlayer, normalizeDegrees, yawToward } from "./core/match-state.mjs";
import { loadMaddieMatchSet } from "./data/maddie-assets.mjs";
import { renderMatch } from "./render/ring-renderer.mjs";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const loading = document.querySelector("#loading");
const angleLabel = document.querySelector("#angleLabel");
const positionLabel = document.querySelector("#positionLabel");
const opponentName = document.querySelector("#opponentName");
const guardToggle = document.querySelector("#guardToggle");
const guardLabel = document.querySelector("#guardLabel");
const input = new MatchInput(canvas, document);

const RING = { halfSize: 4.5, margin: 0.35, moveSpeed: 2.45, turnSpeed: 115 };
const FIGHTER = { x: 0, z: 0, yaw: 0 };
const START = { x: 0, z: 3.65, yaw: 180, height: 1.65 };
let player = { ...START };
let lastTime = performance.now();
let assetSet;
let guardOn = false;
let previousGuardOn = false;
let guardChangedAt = -Infinity;
let view = { width: 1280, height: 720, horizon: 286, focal: 560 };

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const density = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(density, 0, 0, density, 0, 0);
  view = {
    width,
    height,
    horizon: height * 0.39,
    focal: Math.min(width * 0.72, height * 0.95),
  };
}

function keepDistanceFromMaddie(candidate) {
  const dx = candidate.x - FIGHTER.x;
  const dz = candidate.z - FIGHTER.z;
  const distance = Math.hypot(dx, dz);
  const minimum = 0.82;
  if (distance >= minimum) return candidate;
  const angle = distance > 0.001 ? Math.atan2(dx, dz) : candidate.yaw * Math.PI / 180 + Math.PI;
  return {
    ...candidate,
    x: FIGHTER.x + Math.sin(angle) * minimum,
    z: FIGHTER.z + Math.cos(angle) * minimum,
  };
}

function updateGuardUi() {
  guardToggle.setAttribute("aria-pressed", String(guardOn));
  guardToggle.classList.toggle("active", guardOn);
  guardLabel.textContent = guardOn ? "Guard On" : "Guard Off";
}

function update(time) {
  const delta = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  const controls = input.sample();
  const nextGuardOn = updateGuardState(guardOn, controls.guardToggleRequested);
  if (nextGuardOn !== guardOn) {
    previousGuardOn = guardOn;
    guardOn = nextGuardOn;
    guardChangedAt = time;
  }
  updateGuardUi();
  if (controls.resetRequested) player = { ...START };
  player.yaw = normalizeDegrees(player.yaw + controls.lookDegrees);
  if (controls.faceRequested) player.yaw = yawToward(player, FIGHTER);
  player = keepDistanceFromMaddie(movePlayer(player, controls, delta, RING));

  const direction = directionForViewer(player, FIGHTER);
  const action = actionForGuard(guardOn);
  const previousAction = actionForGuard(previousGuardOn);
  const imageBlend = guardBlendForElapsed(time - guardChangedAt);
  renderMatch(context, {
    camera: player,
    fighter: FIGHTER,
    image: assetSet.actions[action][direction],
    previousImage: imageBlend < 1 ? assetSet.actions[previousAction][direction] : null,
    imageBlend,
    player,
    ring: RING,
    view,
  });
  angleLabel.textContent = direction.replaceAll("-", " ");
  positionLabel.textContent = `x ${player.x.toFixed(1)} · z ${player.z.toFixed(1)} · ${Math.round(player.yaw)}°`;
  requestAnimationFrame(update);
}

async function start() {
  resize();
  window.addEventListener("resize", resize);
  try {
    assetSet = await loadMaddieMatchSet();
    opponentName.textContent = assetSet.displayName;
    updateGuardUi();
    loading.hidden = true;
    requestAnimationFrame(update);
  } catch (error) {
    loading.textContent = error.message;
    loading.classList.add("error");
  }
}

start();
