import { CIRCUIT_TRACKS } from "../scripts/circuit/tracks.js";
import { roadMaskFromImage } from "../scripts/circuit/road-mask.js";
import { createVehicle, getSpeed, stepVehicle } from "../scripts/circuit/vehicle.js";
import { resolveTrackCollision } from "../scripts/circuit/collision.js";
import { CIRCUIT_FRAME_SIZE, circuitModelById } from "../scripts/circuit/assets.js";
import { circuitFrameIndex } from "../scripts/circuit/sprite-geometry.js";

const canvas = document.querySelector("#viewer");
const ctx = canvas.getContext("2d");
const trackSelect = document.querySelector("#track");
const resetButton = document.querySelector("#reset");
const maskToggle = document.querySelector("#mask");
const lineToggle = document.querySelector("#line");
const checkpointsToggle = document.querySelector("#checkpoints");
const status = document.querySelector("#status");

for (const track of CIRCUIT_TRACKS) {
  const option = document.createElement("option");
  option.value = track.id;
  option.textContent = track.label;
  trackSelect.append(option);
}

const keys = new Set();
let track = CIRCUIT_TRACKS[0];
let trackImage = null;
let maskImage = null;
let maskEdgeCanvas = null;
let roadMask = null;
let vehicle = createVehicle(track.spawns[0]);
let loadingToken = 0;
let impactAge = 0;

const car = circuitModelById("kaido-gts");
const carImage = new Image();
carImage.src = `../${car.src}`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `../${src}`;
  });
}

function buildMaskEdge(mask) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = mask.naturalWidth;
  sourceCanvas.height = mask.naturalHeight;
  const source = sourceCanvas.getContext("2d", { willReadFrequently: true });
  source.drawImage(mask, 0, 0);
  const pixels = source.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = sourceCanvas.width;
  edgeCanvas.height = sourceCanvas.height;
  const edge = edgeCanvas.getContext("2d");
  const edgePixels = edge.createImageData(edgeCanvas.width, edgeCanvas.height);
  const isRoad = (x, y) => {
    if (x < 0 || y < 0 || x >= edgeCanvas.width || y >= edgeCanvas.height) return false;
    return pixels.data[(y * edgeCanvas.width + x) * 4] >= 128;
  };

  for (let y = 0; y < edgeCanvas.height; y += 1) {
    for (let x = 0; x < edgeCanvas.width; x += 1) {
      if (!isRoad(x, y)) continue;
      const boundary = !isRoad(x - 1, y) || !isRoad(x + 1, y)
        || !isRoad(x, y - 1) || !isRoad(x, y + 1);
      if (!boundary) continue;
      const offset = (y * edgeCanvas.width + x) * 4;
      edgePixels.data[offset] = 49;
      edgePixels.data[offset + 1] = 255;
      edgePixels.data[offset + 2] = 150;
      edgePixels.data[offset + 3] = 255;
    }
  }
  edge.putImageData(edgePixels, 0, 0);
  return edgeCanvas;
}

function resetVehicle() {
  vehicle = createVehicle(track.spawns[0]);
  impactAge = 0;
}

async function selectTrack(id) {
  const selected = CIRCUIT_TRACKS.find((entry) => entry.id === id) ?? CIRCUIT_TRACKS[0];
  const token = ++loadingToken;
  status.textContent = `Loading ${selected.label}…`;
  const [art, mask] = await Promise.all([loadImage(selected.src), loadImage(selected.roadMask)]);
  if (token !== loadingToken) return;
  track = selected;
  trackImage = art;
  maskImage = mask;
  maskEdgeCanvas = buildMaskEdge(mask);
  roadMask = roadMaskFromImage(mask, selected.world);
  resetVehicle();
}

function controls() {
  const throttle = keys.has("ArrowUp") || keys.has("KeyW") ? 1
    : keys.has("ArrowDown") || keys.has("KeyS") ? -1 : 0;
  const steer = keys.has("ArrowLeft") || keys.has("KeyA") ? -1
    : keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0;
  return { throttle, steer };
}

function step() {
  if (!roadMask) return;
  const candidate = stepVehicle(vehicle, controls(), 1 / 120);
  const resolved = resolveTrackCollision(
    vehicle,
    candidate,
    (pose) => roadMask.containsVehicle(pose),
  );
  vehicle = resolved.vehicle;
  impactAge = resolved.impact ? 0.16 : Math.max(0, impactAge - 1 / 120);
}

function drawMaskBoundary() {
  if (!maskEdgeCanvas || !maskToggle.checked) return;
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.drawImage(maskEdgeCanvas, 0, 0, track.world.width, track.world.height);
  ctx.restore();
}

function drawRacingLine() {
  if (!lineToggle.checked) return;
  ctx.save();
  ctx.strokeStyle = "#31e7ff";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  track.racingLine.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoints() {
  if (!checkpointsToggle.checked) return;
  ctx.save();
  ctx.strokeStyle = "#ffcf4a";
  ctx.fillStyle = "#ffcf4a";
  ctx.font = "700 18px Consolas, monospace";
  track.checkpoints.forEach((checkpoint, index) => {
    ctx.beginPath();
    ctx.arc(checkpoint.x, checkpoint.y, checkpoint.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(String(index + 1), checkpoint.x + 8, checkpoint.y - 8);
  });
  ctx.restore();
}

function drawCar() {
  ctx.save();
  if (carImage.complete && carImage.naturalWidth > 0) {
    const frame = circuitFrameIndex(vehicle.angle);
    const size = CIRCUIT_FRAME_SIZE;
    ctx.drawImage(carImage, frame * size, 0, size, size, vehicle.x - 32, vehicle.y - 32, 64, 64);
  } else {
    ctx.translate(vehicle.x, vehicle.y);
    ctx.rotate(vehicle.angle);
    ctx.fillStyle = "#ff5a32";
    ctx.fillRect(-9, -16, 18, 32);
  }
  if (impactAge > 0) {
    ctx.strokeStyle = "#ff3048";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(vehicle.x, vehicle.y, 34 + impactAge * 40, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#05080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (trackImage) ctx.drawImage(trackImage, 0, 0, track.world.width, track.world.height);
  drawMaskBoundary();
  drawRacingLine();
  drawCheckpoints();
  drawCar();
  const speed = Math.round(getSpeed(vehicle) * 0.96);
  status.textContent = `${track.label.toUpperCase()}  ·  ${speed} KM/H  ·  X ${Math.round(vehicle.x)}  Y ${Math.round(vehicle.y)}`;
}

let previous = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += Math.min(100, now - previous) / 1000;
  previous = now;
  while (accumulator >= 1 / 120) {
    step();
    accumulator -= 1 / 120;
  }
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyR") resetVehicle();
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
trackSelect.addEventListener("change", () => selectTrack(trackSelect.value));
resetButton.addEventListener("click", resetVehicle);

selectTrack(track.id).catch((error) => { status.textContent = error.message; });
requestAnimationFrame(frame);
