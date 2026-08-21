import { CIRCUIT_MODELS } from "../scripts/circuit/assets.js";
import {
  CIRCUIT_MASK_FRAME_COUNT,
  CIRCUIT_MASK_FRAME_HEIGHT,
  CIRCUIT_MASK_FRAME_WIDTH,
  CIRCUIT_MASK_HEADINGS,
  CIRCUIT_MASK_SURFACES,
  addGuidePath,
  cloneCircuitMaskData,
  createCircuitMaskData,
  decodeCircuitMaskProject,
  encodeCircuitMaskProject,
  floodMaskRegion,
  guidePathCount,
  paintMaskStroke,
} from "./circuit-mask-core.js";

const FRAME_PIXELS = CIRCUIT_MASK_FRAME_WIDTH * CIRCUIT_MASK_FRAME_HEIGHT;
const STORAGE_PREFIX = "speed-demon:circuit-surface-mask:v1:";
const ALPHA_THRESHOLD = 8;
const HISTORY_LIMIT = 60;
const DISPLAY_SCALE = 10;
const GUIDE_COLORS = Object.freeze({ stripes: "#23d9ff", bands: "#ff9a3d" });

const elements = {
  modelSelect: document.querySelector("#modelSelect"),
  directionGrid: document.querySelector("#directionGrid"),
  editorTitle: document.querySelector("#editorTitle"),
  editorCanvas: document.querySelector("#editorCanvas"),
  cursorReadout: document.querySelector("#cursorReadout"),
  noseAxis: document.querySelector("#noseAxis"),
  tailAxis: document.querySelector("#tailAxis"),
  guideTargets: document.querySelector("#guideTargets"),
  optionalMasks: document.querySelector("#optionalMasks"),
  primaryTool: document.querySelector("#primaryTool"),
  fillTool: document.querySelector("#fillTool"),
  pickerTool: document.querySelector("#pickerTool"),
  eraserTool: document.querySelector("#eraserTool"),
  brushLabel: document.querySelector("#brushLabel"),
  editorHelp: document.querySelector("#editorHelp"),
  scopeHelp: document.querySelector("#scopeHelp"),
  maskOpacity: document.querySelector("#maskOpacity"),
  opacityValue: document.querySelector("#opacityValue"),
  showGrid: document.querySelector("#showGrid"),
  showGaps: document.querySelector("#showGaps"),
  maskOnly: document.querySelector("#maskOnly"),
  brushSize: document.querySelector("#brushSize"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  overallProgress: document.querySelector("#overallProgress"),
  overallProgressBar: document.querySelector("#overallProgressBar"),
  progressCopy: document.querySelector("#progressCopy"),
  saveState: document.querySelector("#saveState"),
  exportJson: document.querySelector("#exportJson"),
  exportPng: document.querySelector("#exportPng"),
  copyJson: document.querySelector("#copyJson"),
  importJson: document.querySelector("#importJson"),
  clearModel: document.querySelector("#clearModel"),
  toast: document.querySelector("#toast"),
};

const state = {
  model: CIRCUIT_MODELS[0],
  image: null,
  sourceCanvas: document.createElement("canvas"),
  maskCanvas: document.createElement("canvas"),
  paintable: new Uint8Array(CIRCUIT_MASK_FRAME_COUNT * FRAME_PIXELS),
  data: createCircuitMaskData(),
  channel: { type: "guides", guideKind: "stripes" },
  frame: 0,
  surfaceId: 1,
  tool: "pencil",
  pointer: null,
  guideDraft: null,
  history: [],
  future: [],
  loadingToken: 0,
  saveTimer: 0,
};

const surfaceById = new Map(CIRCUIT_MASK_SURFACES.map((surface) => [surface.id, surface]));
const surfaceRgb = new Map(CIRCUIT_MASK_SURFACES.map((surface) => [surface.id, hexToRgb(surface.color)]));
const directionCards = [];
let toastTimer = 0;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function titleCaseDirection(direction) {
  return direction.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function announce(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function storageKey(modelId) {
  return `${STORAGE_PREFIX}${modelId}`;
}

function activeMask() {
  return state.channel.type === "mask" ? state.data.surfaces : null;
}

function activeLabel() {
  if (state.channel.type === "guides") {
    return state.channel.guideKind === "stripes" ? "Stripe Flow" : "Band Flow";
  }
  return surfaceById.get(state.surfaceId).label;
}

function loadSavedData(modelId) {
  const saved = localStorage.getItem(storageKey(modelId));
  if (!saved) return createCircuitMaskData();
  try {
    const decoded = decodeCircuitMaskProject(saved, modelId);
    if (decoded.migrated) {
      const backupKey = `${storageKey(modelId)}:schema-1-backup`;
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, saved);
      announce(`Migrated ${modelId}'s earlier mask into canonical targets.`);
    }
    return decoded.data;
  } catch (error) {
    console.warn("Ignoring invalid saved circuit mask", error);
    announce(`Saved ${modelId} mask was invalid; opened a clean mask.`);
    return createCircuitMaskData();
  }
}

function saveMask() {
  clearTimeout(state.saveTimer);
  localStorage.setItem(storageKey(state.model.modelId), JSON.stringify(
    encodeCircuitMaskProject(state.model.modelId, state.data),
  ));
  elements.saveState.textContent = "Saved locally";
  elements.saveState.classList.add("saved");
}

function queueSave() {
  clearTimeout(state.saveTimer);
  elements.saveState.textContent = "Saving…";
  elements.saveState.classList.remove("saved");
  state.saveTimer = window.setTimeout(saveMask, 120);
}

function createDirectionCards() {
  for (let frame = 0; frame < CIRCUIT_MASK_HEADINGS.length; frame += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "direction-card";
    button.dataset.frame = String(frame);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const copy = document.createElement("span");
    copy.className = "direction-copy";
    const name = document.createElement("span");
    name.className = "direction-name";
    name.textContent = titleCaseDirection(CIRCUIT_MASK_HEADINGS[frame]);
    const count = document.createElement("span");
    count.className = "direction-count";
    const dot = document.createElement("span");
    dot.className = "direction-dot";
    copy.append(name, count, dot);
    button.append(canvas, copy);
    button.addEventListener("click", () => selectFrame(frame));
    elements.directionGrid.append(button);
    directionCards.push({ button, canvas, count });
  }
}

function createTargetControls() {
  for (const button of elements.guideTargets.querySelectorAll("[data-guide]")) {
    button.addEventListener("click", () => {
      state.channel = { type: "guides", guideKind: button.dataset.guide };
      setTool("pencil");
      renderAll();
    });
  }
  for (const button of elements.optionalMasks.querySelectorAll("[data-surface]")) {
    button.addEventListener("click", () => {
      state.channel = { type: "mask" };
      state.surfaceId = Number(button.dataset.surface);
      setTool("pencil");
      renderAll();
    });
  }
}

function updateTargetControls() {
  for (const button of elements.guideTargets.querySelectorAll("[data-guide]")) {
    const active = state.channel.type === "guides" && button.dataset.guide === state.channel.guideKind;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const button of elements.optionalMasks.querySelectorAll("[data-surface]")) {
    const active = state.channel.type === "mask" && Number(button.dataset.surface) === state.surfaceId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  const guiding = state.channel.type === "guides";
  elements.primaryTool.innerHTML = guiding ? "Draw Flow <kbd>D</kbd>" : "Pencil <kbd>B</kbd>";
  elements.primaryTool.title = guiding ? "Draw flow (D)" : "Pencil (B)";
  for (const control of [elements.fillTool, elements.pickerTool, elements.eraserTool, elements.brushSize]) {
    control.disabled = guiding;
  }
  elements.brushLabel.classList.toggle("muted", guiding);
  elements.showGaps.disabled = guiding;
  elements.editorHelp.innerHTML = guiding
    ? "<strong>Draw:</strong> drag from stripe start to stripe end. The arrow preserves your direction and curve."
    : "<strong>Paint:</strong> drag · <strong>Erase:</strong> right-drag · <strong>Fill:</strong> Shift-click · <strong>Pick:</strong> Alt-click";
  elements.scopeHelp.textContent = guiding
    ? "Add more paths where perspective changes across the body."
    : "This optional mask is locked to visible sprite pixels.";
}

function setTool(tool) {
  state.tool = tool;
  for (const button of document.querySelectorAll("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === tool);
  }
  updateTargetControls();
}

function maskImageData(frame, opacity, showGaps) {
  const context = state.maskCanvas.getContext("2d");
  const imageData = context.createImageData(CIRCUIT_MASK_FRAME_WIDTH, CIRCUIT_MASK_FRAME_HEIGHT);
  if (state.channel.type !== "mask") return imageData;
  const start = frame * FRAME_PIXELS;
  const mask = activeMask();
  const rgb = surfaceRgb.get(state.surfaceId);
  for (let local = 0; local < FRAME_PIXELS; local += 1) {
    const value = mask[start + local];
    if (value !== state.surfaceId) continue;
    const output = local * 4;
    imageData.data[output] = rgb[0];
    imageData.data[output + 1] = rgb[1];
    imageData.data[output + 2] = rgb[2];
    imageData.data[output + 3] = Math.round(opacity * 255);
  }
  return imageData;
}

function drawOneGuide(context, path, width, height, color, alpha) {
  if (path.length < 2) return;
  const sx = width / 64;
  const sy = height / 64;
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(2, width / 180);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  context.moveTo((path[0].x + 0.5) * sx, (path[0].y + 0.5) * sy);
  for (let index = 1; index < path.length; index += 1) {
    context.lineTo((path[index].x + 0.5) * sx, (path[index].y + 0.5) * sy);
  }
  context.stroke();

  const end = path.at(-1);
  let before = path.at(-2);
  for (let index = path.length - 2; index >= 0; index -= 1) {
    if (path[index].x !== end.x || path[index].y !== end.y) { before = path[index]; break; }
  }
  const angle = Math.atan2((end.y - before.y) * sy, (end.x - before.x) * sx);
  const x = (end.x + 0.5) * sx;
  const y = (end.y + 0.5) * sy;
  const size = Math.max(5, width / 55);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x - Math.cos(angle - 0.55) * size, y - Math.sin(angle - 0.55) * size);
  context.lineTo(x - Math.cos(angle + 0.55) * size, y - Math.sin(angle + 0.55) * size);
  context.closePath();
  context.fill();
  context.restore();
}

function drawGuides(context, frame, width, height) {
  for (const kind of ["bands", "stripes"]) {
    const active = state.channel.type === "guides" && state.channel.guideKind === kind;
    const alpha = state.channel.type === "guides" ? (active ? 1 : 0.28) : 0.45;
    for (const path of state.data.guides[kind][frame]) {
      drawOneGuide(context, path, width, height, GUIDE_COLORS[kind], alpha);
    }
  }
  if (state.guideDraft && state.guideDraft.frame === frame) {
    drawOneGuide(context, state.guideDraft.points, width, height, GUIDE_COLORS[state.guideDraft.kind], 0.9);
  }
}

function drawFrame(context, frame, width, height, options = {}) {
  const { maskOnly = false, grid = false, opacity = 0.68, showGaps = true } = options;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  if (maskOnly) {
    context.fillStyle = "#101620";
    context.fillRect(0, 0, width, height);
  } else if (state.image) {
    context.drawImage(state.image, frame * 64, 0, 64, 64, 0, 0, width, height);
  }
  state.maskCanvas.width = 64;
  state.maskCanvas.height = 64;
  state.maskCanvas.getContext("2d").putImageData(maskImageData(frame, opacity, showGaps), 0, 0);
  context.drawImage(state.maskCanvas, 0, 0, width, height);

  if (grid) {
    const stepX = width / 64;
    const stepY = height / 64;
    context.beginPath();
    for (let x = 0; x <= 64; x += 1) {
      context.moveTo(Math.round(x * stepX) + 0.5, 0);
      context.lineTo(Math.round(x * stepX) + 0.5, height);
    }
    for (let y = 0; y <= 64; y += 1) {
      context.moveTo(0, Math.round(y * stepY) + 0.5);
      context.lineTo(width, Math.round(y * stepY) + 0.5);
    }
    context.strokeStyle = "rgba(255,255,255,0.075)";
    context.lineWidth = 1;
    context.stroke();
  }
  drawGuides(context, frame, width, height);
}

function renderEditor() {
  drawFrame(elements.editorCanvas.getContext("2d"), state.frame, 640, 640, {
    maskOnly: elements.maskOnly.checked,
    grid: elements.showGrid.checked,
    opacity: Number(elements.maskOpacity.value) / 100,
    showGaps: elements.showGaps.checked,
  });
}

function positionAxisLabels() {
  const angle = ((state.frame + 4) % CIRCUIT_MASK_FRAME_COUNT) * Math.PI / 4;
  const x = Math.sin(angle);
  const y = -Math.cos(angle);
  for (const [element, direction] of [[elements.noseAxis, 1], [elements.tailAxis, -1]]) {
    element.style.left = `${50 + x * direction * 46}%`;
    element.style.top = `${50 + y * direction * 46}%`;
  }
}

function countSurfacePixels(frame) {
  const start = frame * FRAME_PIXELS;
  let count = 0;
  for (let index = start; index < start + FRAME_PIXELS; index += 1) {
    if (state.data.surfaces[index] === state.surfaceId) count += 1;
  }
  return count;
}

function renderContactSheet() {
  for (let frame = 0; frame < directionCards.length; frame += 1) {
    const card = directionCards[frame];
    drawFrame(card.canvas.getContext("2d"), frame, 128, 128, {
      opacity: 0.72,
      showGaps: elements.showGaps.checked,
      maskOnly: elements.maskOnly.checked,
    });
    card.button.classList.toggle("active", frame === state.frame);
    if (state.channel.type === "guides") {
      const count = guidePathCount(state.data, state.channel.guideKind, frame);
      card.button.classList.toggle("complete", count > 0);
      card.count.textContent = `${count} ${count === 1 ? "arrow" : "arrows"}`;
    } else {
      const count = countSurfacePixels(frame);
      card.button.classList.toggle("complete", count > 0);
      card.count.textContent = `${count.toLocaleString()} px`;
    }
  }
}

function renderProgress() {
  if (state.channel.type === "guides") {
    const count = guidePathCount(state.data, state.channel.guideKind);
    elements.overallProgress.textContent = "FLOW";
    elements.overallProgressBar.style.width = "0%";
    elements.progressCopy.textContent = `${count} authored ${state.channel.guideKind === "stripes" ? "stripe" : "band"} ${count === 1 ? "path" : "paths"} across eight views`;
  } else {
    const count = CIRCUIT_MASK_HEADINGS.reduce((sum, _, frame) => sum + countSurfacePixels(frame), 0);
    elements.overallProgress.textContent = "MASK";
    elements.overallProgressBar.style.width = "0%";
    elements.progressCopy.textContent = `${count.toLocaleString()} ${surfaceById.get(state.surfaceId).label.toLowerCase()} pixels`;
  }
  renderContactSheet();
}

function renderAll() {
  elements.editorTitle.textContent = `${titleCaseDirection(CIRCUIT_MASK_HEADINGS[state.frame])} · ${activeLabel()}`;
  elements.opacityValue.textContent = `${elements.maskOpacity.value}%`;
  elements.undoButton.disabled = state.history.length === 0;
  elements.redoButton.disabled = state.future.length === 0;
  positionAxisLabels();
  updateTargetControls();
  renderEditor();
  renderProgress();
}

function selectFrame(frame) {
  state.frame = (frame + CIRCUIT_MASK_FRAME_COUNT) % CIRCUIT_MASK_FRAME_COUNT;
  elements.cursorReadout.textContent = "x — · y —";
  renderAll();
}

function extractPaintable(image) {
  state.sourceCanvas.width = image.naturalWidth;
  state.sourceCanvas.height = image.naturalHeight;
  const context = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
  const paintable = new Uint8Array(CIRCUIT_MASK_FRAME_COUNT * FRAME_PIXELS);
  for (let frame = 0; frame < 8; frame += 1) {
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const alpha = pixels[(y * image.naturalWidth + frame * 64 + x) * 4 + 3];
        paintable[frame * FRAME_PIXELS + y * 64 + x] = alpha > ALPHA_THRESHOLD ? 1 : 0;
      }
    }
  }
  return paintable;
}

async function loadModel(modelId, importedData = null) {
  const model = CIRCUIT_MODELS.find((candidate) => candidate.modelId === modelId);
  if (!model) throw new Error(`No circuit atlas exists for ${modelId}`);
  if (state.image) saveMask();
  const token = ++state.loadingToken;
  state.model = model;
  elements.modelSelect.value = modelId;
  elements.saveState.textContent = "Loading sprites…";
  elements.saveState.classList.remove("saved");
  const image = new Image();
  image.decoding = "async";
  image.src = new URL(`../${model.src}`, import.meta.url).href;
  await image.decode();
  if (token !== state.loadingToken) return;
  state.image = image;
  state.paintable = extractPaintable(image);
  state.data = importedData ?? loadSavedData(modelId);
  state.frame = 0;
  state.history = [];
  state.future = [];
  saveMask();
  renderAll();
}

function canvasPoint(event) {
  const rect = elements.editorCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(63, Math.round(((event.clientX - rect.left) / rect.width * 64 - 0.5) * 100) / 100)),
    y: Math.max(0, Math.min(63, Math.round(((event.clientY - rect.top) / rect.height * 64 - 0.5) * 100) / 100)),
  };
}

function paintValue(event) {
  if (event.button === 2 || state.tool === "eraser") return 0;
  return state.surfaceId;
}

function pushHistory() {
  state.history.push(cloneCircuitMaskData(state.data));
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.future = [];
}

function finishEdit() {
  if (state.guideDraft) {
    if (state.guideDraft.points.length >= 2) {
      addGuidePath(state.data, state.guideDraft.kind, state.guideDraft.frame, state.guideDraft.points);
    } else {
      state.history.pop();
    }
    state.guideDraft = null;
  }
  state.pointer = null;
  queueSave();
  renderAll();
}

function pickAt(point) {
  const value = activeMask()[state.frame * FRAME_PIXELS + Math.round(point.y) * 64 + Math.round(point.x)];
  setTool(value === state.surfaceId ? "pencil" : "eraser");
  announce(value === state.surfaceId ? `Inside ${activeLabel()}` : `Outside ${activeLabel()}`);
}

function pointerDown(event) {
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  const point = canvasPoint(event);
  if (state.channel.type === "guides") {
    if (event.button !== 0) return;
    pushHistory();
    state.guideDraft = { kind: state.channel.guideKind, frame: state.frame, points: [point] };
    state.pointer = { id: event.pointerId, point };
    elements.editorCanvas.setPointerCapture(event.pointerId);
    renderEditor();
    return;
  }
  if (event.altKey || state.tool === "picker") { pickAt(point); return; }
  pushHistory();
  const value = paintValue(event);
  if (event.shiftKey || state.tool === "fill") {
    floodMaskRegion(activeMask(), state.frame, point.x, point.y, value, state.paintable);
    finishEdit();
    return;
  }
  state.pointer = { id: event.pointerId, point, value };
  elements.editorCanvas.setPointerCapture(event.pointerId);
  paintMaskStroke(activeMask(), state.frame, point, point, value, Number(elements.brushSize.value), state.paintable);
  renderEditor();
}

function pointerMove(event) {
  const point = canvasPoint(event);
  if (state.channel.type === "guides") {
    elements.cursorReadout.textContent = `x ${point.x.toFixed(1)} · y ${point.y.toFixed(1)} · ${activeLabel()}`;
    if (!state.pointer || state.pointer.id !== event.pointerId || !state.guideDraft) return;
    const previous = state.guideDraft.points.at(-1);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.35) {
      state.guideDraft.points.push(point);
      state.pointer.point = point;
      renderEditor();
    }
    return;
  }
  const value = activeMask()[state.frame * FRAME_PIXELS + Math.round(point.y) * 64 + Math.round(point.x)];
  const name = value === state.surfaceId ? activeLabel() : `Outside ${activeLabel()}`;
  elements.cursorReadout.textContent = `x ${String(point.x).padStart(2, "0")} · y ${String(point.y).padStart(2, "0")} · ${name}`;
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  paintMaskStroke(activeMask(), state.frame, state.pointer.point, point, state.pointer.value, Number(elements.brushSize.value), state.paintable);
  state.pointer.point = point;
  renderEditor();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(cloneCircuitMaskData(state.data));
  state.data = state.history.pop();
  queueSave();
  renderAll();
}

function redo() {
  if (!state.future.length) return;
  state.history.push(cloneCircuitMaskData(state.data));
  state.data = state.future.pop();
  queueSave();
  renderAll();
}

function projectJson() {
  return JSON.stringify(encodeCircuitMaskProject(state.model.modelId, state.data), null, 2);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  downloadBlob(new Blob([projectJson()], { type: "application/json" }), `${state.model.modelId}-stripe-flow.json`);
  announce("Stripe-flow project exported");
}

function exportPng() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (state.channel.type === "guides") {
    for (let frame = 0; frame < 8; frame += 1) {
      context.save();
      context.translate(frame * 64, 0);
      for (const path of state.data.guides[state.channel.guideKind][frame]) {
        drawOneGuide(context, path, 64, 64, GUIDE_COLORS[state.channel.guideKind], 1);
      }
      context.restore();
    }
  } else {
    const imageData = context.createImageData(512, 64);
    const rgb = surfaceRgb.get(state.surfaceId);
    for (let y = 0; y < 64; y += 1) {
      for (let frame = 0; frame < 8; frame += 1) {
        for (let x = 0; x < 64; x += 1) {
          const maskIndex = frame * FRAME_PIXELS + y * 64 + x;
          if (state.data.surfaces[maskIndex] !== state.surfaceId) continue;
          const output = (y * 512 + frame * 64 + x) * 4;
          imageData.data[output] = rgb[0];
          imageData.data[output + 1] = rgb[1];
          imageData.data[output + 2] = rgb[2];
          imageData.data[output + 3] = 255;
        }
      }
    }
    context.putImageData(imageData, 0, 0);
  }
  const suffix = state.channel.type === "guides" ? `${state.channel.guideKind}-flow` : surfaceById.get(state.surfaceId).key;
  canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${state.model.modelId}-${suffix}.png`); }, "image/png");
  announce(`${activeLabel()} PNG exported`);
}

async function importJson(file) {
  const decoded = decodeCircuitMaskProject(await file.text());
  const model = CIRCUIT_MODELS.find((candidate) => candidate.modelId === decoded.modelId);
  if (!model) throw new Error(`${decoded.modelId} has no circuit sprite atlas in this build`);
  await loadModel(decoded.modelId, decoded.data);
  saveMask();
  announce(decoded.migrated ? `Imported and migrated ${decoded.modelId}` : `Imported ${decoded.modelId}`);
}

function handleShortcut(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const key = event.key.toUpperCase();
  if ((event.ctrlKey || event.metaKey) && key === "Z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.ctrlKey || event.metaKey) && key === "Y") { event.preventDefault(); redo(); return; }
  if ((event.ctrlKey || event.metaKey) && key === "S") { event.preventDefault(); exportJson(); return; }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    selectFrame(state.frame + (event.key === "ArrowRight" ? 1 : -1));
    return;
  }
  if (key === "D" || key === "C") {
    state.channel = { type: "guides", guideKind: key === "D" ? "stripes" : "bands" };
    setTool("pencil");
    renderAll();
    return;
  }
  const surface = CIRCUIT_MASK_SURFACES.find((candidate) => (candidate.id === 2 || candidate.id === 3) && candidate.shortcut === key);
  if (surface) {
    state.channel = { type: "mask" };
    state.surfaceId = surface.id;
    setTool(surface.id === 0 ? "eraser" : "pencil");
    renderAll();
    return;
  }
  if (key === "B") setTool("pencil");
  else if (key === "F") setTool("fill");
  else if (key === "I") setTool("picker");
  else if (key === "E") setTool("eraser");
  else if (event.key === "[") elements.brushSize.selectedIndex = Math.max(0, elements.brushSize.selectedIndex - 1);
  else if (event.key === "]") elements.brushSize.selectedIndex = Math.min(elements.brushSize.options.length - 1, elements.brushSize.selectedIndex + 1);
}

function bindEvents() {
  elements.modelSelect.addEventListener("change", () => loadModel(elements.modelSelect.value).catch(showError));
  for (const button of document.querySelectorAll("[data-tool]")) button.addEventListener("click", () => setTool(button.dataset.tool));
  elements.undoButton.addEventListener("click", undo);
  elements.redoButton.addEventListener("click", redo);
  elements.editorCanvas.addEventListener("pointerdown", pointerDown);
  elements.editorCanvas.addEventListener("pointermove", pointerMove);
  elements.editorCanvas.addEventListener("pointerup", () => { if (state.pointer) finishEdit(); });
  elements.editorCanvas.addEventListener("pointercancel", () => { if (state.pointer) finishEdit(); });
  elements.editorCanvas.addEventListener("pointerleave", () => { if (!state.pointer) elements.cursorReadout.textContent = "x — · y —"; });
  elements.editorCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
  for (const input of [elements.maskOpacity, elements.showGrid, elements.showGaps, elements.maskOnly]) input.addEventListener("input", renderAll);
  elements.exportJson.addEventListener("click", exportJson);
  elements.exportPng.addEventListener("click", exportPng);
  elements.copyJson.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(projectJson()); announce("Stripe-flow JSON copied"); }
    catch { announce("Clipboard unavailable—use Export guide JSON"); }
  });
  elements.importJson.addEventListener("change", async () => {
    const [file] = elements.importJson.files;
    if (!file) return;
    try { await importJson(file); } catch (error) { showError(error); }
    elements.importJson.value = "";
  });
  elements.clearModel.addEventListener("click", () => {
    if (!window.confirm(`Clear every stripe/band path and optional pixel mask for ${state.model.label}? This can be undone until the page reloads.`)) return;
    pushHistory();
    state.data = createCircuitMaskData();
    finishEdit();
    announce("Model guides and optional masks cleared");
  });
  window.addEventListener("keydown", handleShortcut);
  window.addEventListener("beforeunload", saveMask);
}

function showError(error) {
  console.error(error);
  elements.saveState.textContent = "Could not load";
  elements.saveState.classList.remove("saved");
  announce(error?.message ?? "Something went wrong");
}

async function boot() {
  state.maskCanvas.width = 64;
  state.maskCanvas.height = 64;
  elements.editorCanvas.width = 640;
  elements.editorCanvas.height = 640;
  for (const model of CIRCUIT_MODELS) {
    const option = document.createElement("option");
    option.value = model.modelId;
    option.textContent = `${model.label} · ${model.archetype}`;
    elements.modelSelect.append(option);
  }
  createDirectionCards();
  createTargetControls();
  bindEvents();
  updateTargetControls();
  await loadModel(CIRCUIT_MODELS[0].modelId);
}

boot().catch(showError);
