import { drawUnderglow } from "../render/livery.js";
import { circuitFrameGeometry, circuitLiveryAtlas } from "./livery-atlas.js";
import { CIRCUIT_FRAME_SIZE } from "./assets.js";
import { circuitDrawBox, circuitFrameIndex } from "./sprite-geometry.js";
import { createCamera, updateCamera } from "./camera.js";
import { CAMERA_TUNING, VEHICLE_FOOTPRINT } from "./config.js";
import { circuitHudView } from "../ui/circuit-hud.js";
import { gaugeTicks, needleAngle, TACH_SWEEP } from "../ui/gauges.js";

function cameraTuningFor(track) {
  return { ...CAMERA_TUNING, ...track?.presentation?.camera };
}

export function createCircuitView(state, track = null) {
  const local = state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  const tuning = cameraTuningFor(track);
  return {
    camera: createCamera({ x: local.vehicle.x, y: local.vehicle.y, zoom: tuning.maxZoom }),
    impact: 0,
  };
}

export function stepCircuitView(view, state, dt, viewport, track = null) {
  const local = state.participants.find((participant) => participant.control === "local")
    ?? state.participants[0];
  return {
    ...view,
    camera: updateCamera(view.camera, local.vehicle, dt, viewport, cameraTuningFor(track)),
    impact: Math.max(0, view.impact - dt),
  };
}

function drawCar(ctx, participant, image, cache, debug, presentationScale) {
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
    circuitFrameGeometry(cache, participant.modelId, frame),
    presentationScale,
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

export function circuitDepthOrder(participants) {
  return [...participants].sort((a, b) => (
    a.vehicle.y - b.vehicle.y
    || a.vehicle.x - b.vehicle.x
    || String(a.playerId).localeCompare(String(b.playerId))
  ));
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

const HUD_TEXT = "#f2f5fa";
const HUD_DIM = "#8d9aaa";
const HUD_ACCENT = "#ff5a2e";
const HUD_GREEN = "#4ade8a";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--.--";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function panel(ctx, x, y, width, height, accent = HUD_ACCENT) {
  const fill = ctx.createLinearGradient(0, y, 0, y + height);
  fill.addColorStop(0, "rgba(13,18,26,0.92)");
  fill.addColorStop(1, "rgba(5,8,13,0.84)");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 9);
  ctx.fill();
  ctx.strokeStyle = "rgba(174,190,210,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x + 12, y, Math.min(90, width - 24), 3);
}

function label(ctx, value, x, y, { size = 13, colour = HUD_DIM, weight = 700, align = "left", mono = false } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${mono ? '"Consolas", "SF Mono", monospace' : '"Segoe UI", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function drawInstrument(ctx, { cx, cy, radius, value, max, majorStep, caption, valueLabel, accent = HUD_ACCENT }) {
  ctx.save();
  ctx.fillStyle = "rgba(4,7,12,0.9)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(163,178,198,0.38)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const dial = { ...TACH_SWEEP, min: 0, max };
  for (const tick of gaugeTicks({ ...dial, majorStep, minorStep: majorStep / 2 })) {
    const outer = radius - 10;
    const inner = outer - (tick.major ? 11 : 6);
    const cos = Math.cos(tick.angle);
    const sin = Math.sin(tick.angle);
    ctx.strokeStyle = tick.major ? HUD_TEXT : "#596575";
    ctx.lineWidth = tick.major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + cos * inner, cy + sin * inner);
    ctx.lineTo(cx + cos * outer, cy + sin * outer);
    ctx.stroke();
    if (tick.major) {
      label(ctx, String(tick.value >= 1000 ? tick.value / 1000 : tick.value),
        cx + cos * (inner - 12), cy + sin * (inner - 12) + 4,
        { size: 10, colour: HUD_DIM, weight: 700, align: "center" });
    }
  }

  const angle = needleAngle(value, dial);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(radius * 0.72, 0);
  ctx.lineTo(-5, -3.5);
  ctx.lineTo(-radius * 0.12, 0);
  ctx.lineTo(-5, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#171d26";
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();

  label(ctx, caption, cx, cy - 18, { size: 10, colour: HUD_DIM, weight: 800, align: "center" });
  label(ctx, valueLabel, cx, cy + 28, { size: 22, colour: HUD_TEXT, weight: 800, align: "center", mono: true });
  ctx.restore();
}

function drawStartLights(ctx, state, announcement) {
  if (!announcement || (state.status !== "countdown" && announcement !== "GO")) return;
  const x = 520;
  const y = 148;
  panel(ctx, x, y, 240, 92, state.status === "countdown" ? "#ff3b2d" : HUD_GREEN);
  for (let index = 0; index < 3; index += 1) {
    const remaining = Math.ceil(state.countdown);
    const lit = state.status === "countdown" ? index >= remaining - 1 : true;
    ctx.fillStyle = lit ? (state.status === "countdown" ? "#ff3b2d" : HUD_GREEN) : "#202732";
    ctx.beginPath();
    ctx.arc(x + 62 + index * 58, y + 31, 15, 0, Math.PI * 2);
    ctx.fill();
  }
  label(ctx, announcement, x + 120, y + 78, {
    size: 24, colour: state.status === "countdown" ? HUD_TEXT : HUD_GREEN, weight: 900, align: "center",
  });
}

function hud(ctx, state, track) {
  const view = circuitHudView(state, track);
  ctx.save();
  panel(ctx, 22, 18, 390, 112);
  label(ctx, `P${view.position.current}`, 42, 72, { size: 46, colour: HUD_ACCENT, weight: 900, mono: true });
  label(ctx, `OF ${view.position.total}`, 47, 94, { size: 12, weight: 800 });
  label(ctx, "LAP", 132, 44, { size: 11, weight: 800 });
  label(ctx, `${view.lap.current} / ${view.lap.total}`, 132, 76, { size: 29, colour: HUD_TEXT, weight: 800, mono: true });
  label(ctx, "RACE TIME", 246, 44, { size: 11, weight: 800 });
  label(ctx, formatTime(view.timing.total), 246, 76, { size: 25, colour: HUD_TEXT, weight: 800, mono: true });
  label(ctx, `LAST  ${formatTime(view.timing.lastLap)}   BEST  ${formatTime(view.timing.bestLap)}`,
    132, 106, { size: 11, colour: HUD_DIM, weight: 700, mono: true });

  panel(ctx, 438, 18, 404, 64);
  label(ctx, `${track.label.toUpperCase()}  //  CIRCUIT RACE`, 640, 43,
    { size: 12, colour: HUD_TEXT, weight: 800, align: "center" });
  const checkpointWidth = 296 / Math.max(1, view.checkpoint.total);
  for (let index = 0; index < view.checkpoint.total; index += 1) {
    ctx.fillStyle = index === view.checkpoint.current - 1 ? HUD_ACCENT : "#394454";
    ctx.fillRect(484 + index * checkpointWidth, 57, Math.max(5, checkpointWidth - 5), 7);
  }

  panel(ctx, 868, 18, 390, 52 + view.runners.length * 30);
  label(ctx, "LIVE ORDER", 888, 43, { size: 11, weight: 800 });
  view.runners.forEach((runner, index) => {
    const y = 72 + index * 30;
    label(ctx, String(runner.position), 892, y, { size: 17, colour: runner.local ? HUD_ACCENT : HUD_DIM, weight: 900, mono: true });
    label(ctx, runner.name.toUpperCase(), 924, y, { size: 15, colour: runner.local ? HUD_TEXT : "#c3cad4", weight: runner.local ? 800 : 650 });
    label(ctx, runner.finished ? "FIN" : `LAP ${runner.lap}`, 1235, y,
      { size: 12, colour: runner.finished ? HUD_GREEN : HUD_DIM, weight: 800, align: "right", mono: true });
  });

  drawInstrument(ctx, {
    cx: 104, cy: 610, radius: 86, value: view.instruments.rpm, max: 8000, majorStep: 1000,
    caption: "RPM x1000", valueLabel: String(view.instruments.gear), accent: "#ffb020",
  });
  label(ctx, "GEAR", 104, 674, { size: 10, weight: 800, align: "center" });
  drawInstrument(ctx, {
    cx: 1176, cy: 610, radius: 86, value: view.instruments.speedKph, max: 280, majorStep: 40,
    caption: "KM/H", valueLabel: String(view.instruments.speedKph), accent: HUD_ACCENT,
  });

  panel(ctx, 462, 654, 356, 44);
  label(ctx, `CHECKPOINT  ${view.checkpoint.current} / ${view.checkpoint.total}`, 640, 681,
    { size: 14, colour: HUD_TEXT, weight: 800, align: "center", mono: true });
  drawStartLights(ctx, state, view.announcement);
  if (view.announcement && !["1", "2", "3", "GO"].includes(view.announcement)) {
    label(ctx, view.announcement, 640, 178, {
      size: 48,
      colour: view.announcement === "DEFEAT" ? "#ff6b6b" : HUD_GREEN,
      weight: 900,
      align: "center",
    });
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
  const ordered = circuitDepthOrder(state.participants);
  const presentationScale = track.presentation?.carScale ?? 1;
  for (const participant of ordered) {
    drawCar(ctx, participant, carImages.get(participant.modelId), liveryCache, debug, presentationScale);
  }
  ctx.restore();
  hud(ctx, state, track);
}
