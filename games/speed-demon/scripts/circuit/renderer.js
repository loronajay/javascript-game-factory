import { drawUnderglow } from "../render/livery.js";
import { circuitFrameScale, circuitLiveryAtlas } from "./livery-atlas.js";
import { CIRCUIT_FRAME_SIZE } from "./assets.js";
import { circuitDrawBox, circuitFrameIndex } from "./sprite-geometry.js";
import { getSpeed } from "./vehicle.js";
import { createCamera, updateCamera } from "./camera.js";
import { VEHICLE_FOOTPRINT } from "./config.js";

export function createCircuitView(state) {
  const local = state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  return { camera: createCamera({ x: local.vehicle.x, y: local.vehicle.y }), impact: 0 };
}

export function stepCircuitView(view, state, dt, viewport) {
  const local = state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  return {
    ...view,
    camera: updateCamera(view.camera, local.vehicle, dt, viewport),
    impact: Math.max(0, view.impact - dt),
  };
}

function drawCar(ctx, participant, image, cache, debug) {
  const atlas = circuitLiveryAtlas(cache, {
    image,
    modelId: participant.modelId,
    livery: participant.livery,
  });
  const frame = circuitFrameIndex(participant.vehicle.angle);
  const size = CIRCUIT_FRAME_SIZE;
  const box = circuitDrawBox(
    participant.vehicle.x,
    participant.vehicle.y,
    size,
    circuitFrameScale(cache, participant.modelId, frame),
  );
  drawUnderglow(ctx, {
    x: participant.vehicle.x,
    top: box.y,
    width: box.width,
    height: box.height,
  }, participant.livery);
  if (atlas) {
    ctx.drawImage(
      atlas,
      frame * size,
      0,
      size,
      size,
      box.x,
      box.y,
      box.width,
      box.height,
    );
  }
  if (debug) debugDrawCircuit(ctx, participant.vehicle);
}

export function debugDrawCircuit(ctx, vehicle) {
  ctx.save();
  ctx.translate(vehicle.x, vehicle.y);
  ctx.rotate(vehicle.angle);
  ctx.strokeStyle = "#ff3b3b";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    -VEHICLE_FOOTPRINT.halfWidth,
    -VEHICLE_FOOTPRINT.halfLength,
    VEHICLE_FOOTPRINT.halfWidth * 2,
    VEHICLE_FOOTPRINT.halfLength * 2,
  );
  ctx.restore();
}

function hud(ctx, state, local) {
  ctx.save();
  ctx.fillStyle = "rgba(5,8,14,0.78)";
  ctx.fillRect(20, 18, 330, 88);
  ctx.fillStyle = "#f0f3f8";
  ctx.font = '700 24px "Segoe UI", sans-serif';
  ctx.fillText(`LAP ${Math.min(state.rules.laps, local.lap + 1)} / ${state.rules.laps}`, 36, 50);
  ctx.font = '600 15px "Segoe UI", sans-serif';
  ctx.fillStyle = "#ff7a42";
  ctx.fillText(`CHECKPOINT ${local.nextCheckpoint + 1} / ${state.trackCheckpointCount}`, 36, 78);
  ctx.fillStyle = "#c9ced8";
  ctx.fillText(`${state.elapsed.toFixed(2)}s  ·  ${Math.round(getSpeed(local.vehicle) * 0.7)} km/h`, 180, 78);
  if (state.status === "countdown") {
    ctx.font = '900 86px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(String(Math.max(1, Math.ceil(state.countdown))), 640, 250);
  } else if (state.status === "finished") {
    ctx.font = '900 48px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(local.place === 1 ? "WINNER" : `FINISHED P${local.place ?? "—"}`, 640, 180);
  }
  ctx.restore();
}

export function renderCircuit(ctx, state, view, {
  track,
  trackImage,
  carImages,
  liveryCache,
  viewportWidth = 1280,
  viewportHeight = 720,
  debug = false,
}) {
  const camera = view.camera;
  ctx.save();
  ctx.translate(viewportWidth / 2, viewportHeight / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  ctx.imageSmoothingEnabled = false;
  if (trackImage?.complete && trackImage.naturalWidth > 0) {
    ctx.drawImage(trackImage, 0, 0, track.world.width, track.world.height);
  } else {
    ctx.fillStyle = "#111820";
    ctx.fillRect(0, 0, track.world.width, track.world.height);
  }
  const ordered = [...state.participants].sort((a, b) => (a.control === "local") - (b.control === "local"));
  for (const participant of ordered) {
    drawCar(ctx, participant, carImages.get(participant.modelId), liveryCache, debug);
  }
  ctx.restore();
  const local = state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  hud(ctx, { ...state, trackCheckpointCount: track.checkpoints.length }, local);
}
