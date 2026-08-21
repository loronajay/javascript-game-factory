import {
  CIRCUIT_FRAME_HEADINGS,
  CIRCUIT_FRAME_SIZE,
  CIRCUIT_MODELS,
} from "../scripts/circuit/assets.js";
import {
  circuitLiveryAtlas,
  createCircuitLiveryCache,
} from "../scripts/circuit/livery-atlas.js";
import { circuitStripePanelGuides } from "../scripts/circuit/stripe-projection.js";
import {
  addLayer,
  createLivery,
  updateLayer,
} from "../scripts/garage/livery.js";

const PREVIEW_SCALE = 4;
const cache = createCircuitLiveryCache();
const requestedModelId = new URLSearchParams(window.location.search).get("model");
const initialModel = CIRCUIT_MODELS.find((model) => model.modelId === requestedModelId)
  ?? CIRCUIT_MODELS[0];
const state = {
  model: initialModel,
  image: null,
  loadingToken: 0,
};

const elements = {
  status: document.querySelector("#status"),
  modelSelect: document.querySelector("#modelSelect"),
  directionGrid: document.querySelector("#directionGrid"),
  layout: document.querySelector("#layout"),
  position: document.querySelector("#position"),
  positionValue: document.querySelector("#positionValue"),
  size: document.querySelector("#size"),
  sizeValue: document.querySelector("#sizeValue"),
  curve: document.querySelector("#curve"),
  curveValue: document.querySelector("#curveValue"),
  bodyHue: document.querySelector("#bodyHue"),
  bodyHueValue: document.querySelector("#bodyHueValue"),
  stripeHue: document.querySelector("#stripeHue"),
  stripeHueValue: document.querySelector("#stripeHueValue"),
  reset: document.querySelector("#reset"),
};

const cards = CIRCUIT_FRAME_HEADINGS.map((heading, frame) => {
  const card = document.createElement("article");
  card.className = "direction-card";
  const road = document.createElement("div");
  road.className = "road";
  const canvas = document.createElement("canvas");
  canvas.width = CIRCUIT_FRAME_SIZE * PREVIEW_SCALE;
  canvas.height = CIRCUIT_FRAME_SIZE * PREVIEW_SCALE;
  canvas.setAttribute("aria-label", `${heading} corrected circuit stripe preview`);
  road.append(canvas);

  const copy = document.createElement("div");
  copy.className = "card-copy";
  const name = document.createElement("span");
  name.className = "direction-name";
  name.textContent = heading.replace("-", " ");
  const correction = document.createElement("span");
  correction.className = "correction identity";
  correction.textContent = "default";
  copy.append(name, correction);
  card.append(road, copy);
  elements.directionGrid.append(card);
  return { canvas, correction, frame };
});

for (const model of CIRCUIT_MODELS) {
  const option = document.createElement("option");
  option.value = model.modelId;
  option.textContent = `${model.label} · ${model.archetype}`;
  elements.modelSelect.append(option);
}
elements.modelSelect.value = state.model.modelId;

function titleCase(value) {
  return value.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? " " : ""}${letter.toUpperCase()}`);
}

function previewLivery() {
  let livery = createLivery({
    paint: {
      hue: Number(elements.bodyHue.value),
      saturation: 0.82,
      brightness: 0.76,
      finish: "gloss",
    },
  });
  livery = addLayer(livery, "stripes");
  return updateLayer(livery, livery.layers[0].id, {
    position: elements.layout.value === "spine" ? 0.5 : Number(elements.position.value) / 100,
    size: Number(elements.size.value) / 100,
    curve: Number(elements.curve.value) / 100,
    mirrored: elements.layout.value === "twin",
    paint: {
      hue: Number(elements.stripeHue.value),
      saturation: 0,
      brightness: 1.3,
      finish: "gloss",
    },
  });
}

function syncLabels() {
  elements.positionValue.value = `${elements.position.value}%`;
  elements.sizeValue.value = `${elements.size.value}%`;
  const curve = Number(elements.curve.value);
  elements.curveValue.value = `${curve > 0 ? "+" : ""}${curve}%`;
  elements.bodyHueValue.value = `${elements.bodyHue.value}°`;
  elements.stripeHueValue.value = `${elements.stripeHue.value}°`;
  elements.position.disabled = elements.layout.value === "spine";
}

function draw() {
  if (!state.image) return;
  syncLabels();
  const guides = circuitStripePanelGuides(state.model.modelId);
  const guidedPanels = guides.reduce((sum, frame) => sum + frame.length, 0);
  const atlas = circuitLiveryAtlas(cache, {
    image: state.image,
    modelId: state.model.modelId,
    livery: previewLivery(),
  });
  if (!atlas) return;

  for (const { canvas, correction, frame } of cards) {
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      atlas,
      frame * CIRCUIT_FRAME_SIZE,
      0,
      CIRCUIT_FRAME_SIZE,
      CIRCUIT_FRAME_SIZE,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const panelCount = guides[frame].length;
    correction.className = `correction${panelCount ? "" : " identity"}`;
    correction.textContent = panelCount
      ? `${panelCount} guided panels`
      : guidedPanels ? "unchanged" : "default";
    canvas.setAttribute(
      "aria-label",
      `${CIRCUIT_FRAME_HEADINGS[frame]} corrected ${state.model.label} stripe preview`,
    );
  }
  elements.status.textContent = guidedPanels
    ? `${titleCase(state.model.label)} · corrected game bake`
    : `${titleCase(state.model.label)} · default bake · awaiting guides`;
}

async function loadModel(modelId) {
  const model = CIRCUIT_MODELS.find((candidate) => candidate.modelId === modelId);
  if (!model) return;
  const token = ++state.loadingToken;
  state.model = model;
  state.image = null;
  elements.status.textContent = `Loading ${model.label} atlas…`;
  const image = new Image();
  image.src = `../${model.src}`;
  await image.decode();
  if (token !== state.loadingToken) return;
  state.image = image;
  elements.modelSelect.value = model.modelId;
  const url = new URL(window.location.href);
  url.searchParams.set("model", model.modelId);
  window.history.replaceState(null, "", url);
  draw();
}

elements.modelSelect.addEventListener("change", () => {
  loadModel(elements.modelSelect.value).catch((error) => {
    console.error(error);
    elements.status.textContent = "Could not load circuit atlas";
  });
});
for (const input of [
  elements.layout,
  elements.position,
  elements.size,
  elements.curve,
  elements.bodyHue,
  elements.stripeHue,
]) input.addEventListener("input", draw);

elements.reset.addEventListener("click", () => {
  elements.layout.value = "twin";
  elements.position.value = "44";
  elements.size.value = "8";
  elements.curve.value = "0";
  elements.bodyHue.value = "0";
  elements.stripeHue.value = "0";
  draw();
});

await loadModel(state.model.modelId);
