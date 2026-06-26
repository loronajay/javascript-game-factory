import { HybridAudioEngine } from "./hybrid-audio-engine.js";
import { SAMPLE_SOURCES } from "./sample-manifest.js";
import { MINI_TACTICS_PRESETS, REFERENCE_PRESETS } from "./hybrid-presets.js";
import { RETRO_PRESETS } from "./retro-presets.js";

const engine = new HybridAudioEngine({ sampleSources: SAMPLE_SOURCES });
const clone = (value) => JSON.parse(JSON.stringify(value));

const allSourcePresets = [...MINI_TACTICS_PRESETS, ...REFERENCE_PRESETS, ...RETRO_PRESETS];

const state = {
  presets: allSourcePresets.map(clone),
  originals: new Map(allSourcePresets.map((preset) => [preset.id, clone(preset)])),
  selectedId: localStorage.getItem("soundFactory.selectedId") || "mt_warrior_hit",
  folder: loadSetting("soundFactory.folder", { bank: "Mini-Tactics Hybrid", category: null }),
  viewMode: localStorage.getItem("soundFactory.viewMode") || "grid",
  outputNames: loadSetting("soundFactory.outputNames", {}),
};

const elementIds = [
  "soundboard", "search", "libraryTree", "libraryTotal", "breadcrumbs", "folderDescription",
  "visibleCount", "sortOrder", "viewToggle", "variation", "variationValue", "pitch",
  "pitchValue", "airGain", "airValue", "contactGain", "contactValue", "bodyGain",
  "bodyValue", "resonanceGain", "resonanceValue", "masterVolume", "stopAll",
  "playRandom", "selectedName", "selectedMeta", "patchEditor", "editorStatus",
  "playSelected", "topPlaySelected", "mobilePlaySelected", "applyPatch", "resetPatch",
  "duplicatePatch", "downloadJson", "downloadWav", "topDownloadWav", "mobileDownloadWav",
  "audioState", "preloadState", "topSelectedName", "topSelectedPath", "mobileSelectedName",
  "mobileOutputName", "outputFilename", "renderHint", "resetMixer",
];

const elements = Object.fromEntries(
  elementIds.map((id) => [id, document.querySelector(`#${id}`)]),
);

function loadSetting(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getSelectedPreset() {
  return state.presets.find((preset) => preset.id === state.selectedId) ?? state.presets[0] ?? null;
}

function slugify(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sound";
}

function sanitizeOutputBase(value) {
  return slugify(String(value ?? "").replace(/\.wav$/i, ""));
}

function patchFilename(preset) {
  return `${String(preset.id).replace(/[^a-zA-Z0-9_-]+/g, "_")}.sound.json`;
}

function getOutputBase(preset) {
  return state.outputNames[preset.id] || slugify(preset.name);
}

function getPresetKind(preset) {
  if (preset.bank === "Reference Files") return "reference";
  if (preset.bank === "Retro / Arcade") return "retro";
  return "hybrid";
}

function getPlaybackOptions() {
  return {
    variation: Number(elements.variation.value),
    pitchScale: Number(elements.pitch.value),
    roleGains: {
      air: Number(elements.airGain.value),
      contact: Number(elements.contactGain.value),
      body: Number(elements.bodyGain.value),
      resonance: Number(elements.resonanceGain.value),
    },
  };
}

function setAudioState(value) {
  elements.audioState.textContent = `Audio: ${value}`;
}

function setStatus(message, error = false) {
  elements.editorStatus.textContent = message;
  elements.editorStatus.classList.toggle("error", error);
  elements.patchEditor.classList.toggle("invalid", error);
}

function setRenderBusy(isBusy) {
  for (const button of [elements.downloadWav, elements.topDownloadWav, elements.mobileDownloadWav]) {
    button.disabled = isBusy || !getSelectedPreset();
    button.textContent = isBusy
      ? "Rendering..."
      : button === elements.downloadWav
        ? "Render selected WAV"
        : "Render WAV";
  }
  elements.renderHint.textContent = isBusy
    ? "Rendering the selected patch with current mixer settings."
    : "Current mixer settings are included in the export.";
}

async function playPreset(preset) {
  if (!preset) return;

  try {
    setAudioState("loading");
    const result = await engine.play(preset, getPlaybackOptions());
    setAudioState(`playing · seed ${result.seed}`);
  } catch (error) {
    setAudioState("error");
    setStatus(error.message, true);
  }
}

function folderPath(preset = null) {
  const bank = preset?.bank ?? state.folder.bank;
  const category = preset?.category ?? state.folder.category;

  if (!bank) return ["Sound Library"];
  return ["Sound Library", bank, ...(category ? [category] : [])];
}

function selectPreset(id, { play = false } = {}) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;

  state.selectedId = preset.id;
  localStorage.setItem("soundFactory.selectedId", preset.id);

  elements.selectedName.textContent = preset.name;
  elements.topSelectedName.textContent = preset.name;
  elements.mobileSelectedName.textContent = preset.name;

  const pathText = `${preset.bank} / ${preset.category}`;
  elements.topSelectedPath.textContent = pathText;
  elements.selectedMeta.innerHTML = `
    <span class="meta-chip">${escapeHtml(preset.bank)}</span>
    <span class="meta-chip">${escapeHtml(preset.category)}</span>
    <span class="meta-chip">${escapeHtml(getPresetKind(preset).toUpperCase())}</span>
  `;

  elements.patchEditor.value = JSON.stringify(preset, null, 2);
  elements.outputFilename.value = getOutputBase(preset);
  elements.mobileOutputName.textContent = `${sanitizeOutputBase(elements.outputFilename.value)}.wav`;

  for (const button of elements.soundboard.querySelectorAll(".sound-file")) {
    button.classList.toggle("selected", button.dataset.id === preset.id);
  }

  for (const button of [
    elements.playSelected, elements.topPlaySelected, elements.mobilePlaySelected,
    elements.applyPatch, elements.resetPatch, elements.duplicatePatch, elements.downloadJson,
    elements.downloadWav, elements.topDownloadWav, elements.mobileDownloadWav,
  ]) {
    button.disabled = false;
  }

  setStatus("");

  if (play) {
    playPreset(preset);
  }
}

function presetsByBank() {
  const result = new Map();

  for (const preset of state.presets) {
    if (!result.has(preset.bank)) result.set(preset.bank, new Map());
    const categories = result.get(preset.bank);
    if (!categories.has(preset.category)) categories.set(preset.category, []);
    categories.get(preset.category).push(preset);
  }

  return result;
}

function folderIsActive(bank, category = null) {
  return state.folder.bank === bank && state.folder.category === category;
}

function renderLibraryTree() {
  const hierarchy = presetsByBank();
  elements.libraryTotal.textContent = String(state.presets.length);

  const preferredOrder = ["Mini-Tactics Hybrid", "Reference Files", "Retro / Arcade", "Custom"];
  const banks = [...hierarchy.keys()].sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) {
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    }
    return a.localeCompare(b);
  });

  const rootButton = `
    <button class="tree-root ${folderIsActive(null) ? "active" : ""}" type="button" data-bank="" data-category="">
      <span class="tree-icon">◫</span>
      <span class="tree-name">All Sounds</span>
      <span class="tree-count">${state.presets.length}</span>
    </button>
  `;

  const groups = banks.map((bank) => {
    const categories = hierarchy.get(bank);
    const bankCount = [...categories.values()].reduce((sum, items) => sum + items.length, 0);
    const children = [...categories.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, presets]) => `
        <button class="tree-child ${folderIsActive(bank, category) ? "active" : ""}" type="button" data-bank="${escapeHtml(bank)}" data-category="${escapeHtml(category)}">
          <span class="tree-icon">⌞</span>
          <span class="tree-name">${escapeHtml(category)}</span>
          <span class="tree-count">${presets.length}</span>
        </button>
      `)
      .join("");

    return `
      <div class="tree-group">
        <button class="tree-folder ${folderIsActive(bank) ? "active" : ""}" type="button" data-bank="${escapeHtml(bank)}" data-category="">
          <span class="tree-icon">▾</span>
          <span class="tree-name">${escapeHtml(bank)}</span>
          <span class="tree-count">${bankCount}</span>
        </button>
        <div class="tree-children">${children}</div>
      </div>
    `;
  }).join("");

  elements.libraryTree.innerHTML = rootButton + groups;
}

function filteredPresets() {
  const query = elements.search.value.trim().toLowerCase();

  return state.presets.filter((preset) => {
    const matchesBank = !state.folder.bank || preset.bank === state.folder.bank;
    const matchesCategory = !state.folder.category || preset.category === state.folder.category;
    const searchable = [
      preset.name, preset.id, preset.bank, preset.category, preset.description,
      patchFilename(preset), getOutputBase(preset),
    ].join(" ").toLowerCase();

    return matchesBank && matchesCategory && (!query || searchable.includes(query));
  });
}

function sortedPresets(presets) {
  const order = elements.sortOrder.value;

  return [...presets].sort((a, b) => {
    if (order === "category") {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    }
    if (order === "bank") {
      return a.bank.localeCompare(b.bank) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
}

function renderBrowserHeading(visible) {
  const path = folderPath();
  elements.breadcrumbs.innerHTML = path
    .map((part, index) => `
      ${index ? '<span class="breadcrumb-separator">/</span>' : ""}
      <span>${escapeHtml(part)}</span>
    `)
    .join("");

  elements.visibleCount.textContent = `${visible.length} ${visible.length === 1 ? "file" : "files"}`;

  if (!state.folder.bank) {
    elements.folderDescription.textContent = "All sound banks, reference assets, and custom patches.";
  } else if (!state.folder.category) {
    elements.folderDescription.textContent = `All folders and sound patches in ${state.folder.bank}.`;
  } else {
    elements.folderDescription.textContent = `${state.folder.category} sound patches in ${state.folder.bank}.`;
  }
}

function renderSoundboard() {
  const presets = sortedPresets(filteredPresets());
  renderBrowserHeading(presets);

  elements.soundboard.classList.toggle("list-view", state.viewMode === "list");
  elements.viewToggle.textContent = state.viewMode === "list" ? "Grid view" : "List view";

  if (!presets.length) {
    elements.soundboard.innerHTML = `<div class="empty">No sound files match this folder and search.</div>`;
    return;
  }

  elements.soundboard.innerHTML = presets.map((preset) => {
    const kind = getPresetKind(preset);
    const typeLabel = kind === "reference" ? "REFERENCE WAV" : kind === "retro" ? "RETRO PATCH" : "HYBRID PATCH";
    const iconLabel = kind === "reference" ? "WAV" : "SFX";

    return `
      <button class="sound-file ${kind} ${preset.id === state.selectedId ? "selected" : ""}" data-id="${escapeHtml(preset.id)}" type="button">
        <span class="file-type">
          <span class="file-icon">${iconLabel}</span>
          <span>${typeLabel}</span>
        </span>
        <strong>${escapeHtml(preset.name)}</strong>
        <span class="patch-filename">${escapeHtml(patchFilename(preset))}</span>
        <small>${escapeHtml(preset.description ?? "")}</small>
        <span class="file-path">${escapeHtml(preset.bank)} / ${escapeHtml(preset.category)}</span>
      </button>
    `;
  }).join("");
}

function navigateToFolder(bank, category) {
  state.folder = {
    bank: bank || null,
    category: category || null,
  };
  saveSetting("soundFactory.folder", state.folder);
  renderLibraryTree();
  renderSoundboard();
}

function parseEditorPatch() {
  const parsed = JSON.parse(elements.patchEditor.value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Patch must be a JSON object.");
  }

  if (!parsed.id || !parsed.name || !parsed.bank || !parsed.category) {
    throw new Error("Patch requires id, name, bank, and category.");
  }

  if (!Array.isArray(parsed.layers) && !Array.isArray(parsed.voices) && !Array.isArray(parsed.noise)) {
    throw new Error("Patch requires layers, voices, or noise.");
  }

  return parsed;
}

function applyEditorPatch() {
  try {
    const parsed = parseEditorPatch();
    const index = state.presets.findIndex((preset) => preset.id === state.selectedId);
    const conflict = state.presets.find((preset, presetIndex) => preset.id === parsed.id && presetIndex !== index);

    if (conflict) {
      throw new Error(`Another preset already uses id "${parsed.id}".`);
    }

    const previousId = state.selectedId;
    state.presets[index] = parsed;
    state.selectedId = parsed.id;

    if (state.outputNames[previousId] && previousId !== parsed.id) {
      state.outputNames[parsed.id] = state.outputNames[previousId];
      delete state.outputNames[previousId];
      saveSetting("soundFactory.outputNames", state.outputNames);
    }

    renderLibraryTree();
    renderSoundboard();
    selectPreset(parsed.id);
    setStatus("Patch applied.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function resetEditorPatch() {
  const current = getSelectedPreset();
  if (!current) return;

  const original = state.originals.get(current.id);

  if (!original) {
    setStatus("Custom duplicates do not have a source version to restore.", true);
    return;
  }

  const index = state.presets.findIndex((preset) => preset.id === current.id);
  state.presets[index] = clone(original);
  renderLibraryTree();
  renderSoundboard();
  selectPreset(original.id);
  setStatus("Patch reset.");
}

function duplicateEditorPatch() {
  const current = getSelectedPreset();
  if (!current) return;

  const baseId = `${current.id}_copy`;
  let id = baseId;
  let suffix = 2;

  while (state.presets.some((preset) => preset.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const copy = clone(current);
  copy.id = id;
  copy.name = `${current.name} Copy`;
  copy.bank = "Custom";
  state.presets.push(copy);

  navigateToFolder("Custom", copy.category);
  selectPreset(copy.id);
  setStatus("Patch duplicated into Custom.");
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  const href = link.href;
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function downloadSelectedJson() {
  const preset = getSelectedPreset();
  if (!preset) return;

  downloadBlob(
    new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }),
    patchFilename(preset),
  );
}

async function downloadSelectedWav() {
  let patch;

  try {
    patch = parseEditorPatch();
  } catch (error) {
    setStatus(`Cannot render: ${error.message}`, true);
    return;
  }

  const outputBase = sanitizeOutputBase(elements.outputFilename.value);
  elements.outputFilename.value = outputBase;
  elements.mobileOutputName.textContent = `${outputBase}.wav`;

  state.outputNames[patch.id] = outputBase;
  saveSetting("soundFactory.outputNames", state.outputNames);

  setRenderBusy(true);
  setStatus("");

  try {
    const blob = await engine.renderWav(patch, getPlaybackOptions());
    downloadBlob(blob, `${outputBase}.wav`);
    setStatus(`Rendered ${outputBase}.wav`);
    setAudioState("render complete");
  } catch (error) {
    setStatus(error.message, true);
    setAudioState("render error");
  } finally {
    setRenderBusy(false);
  }
}

function resetMixerControls() {
  const defaults = {
    variation: "0.05",
    pitch: "1",
    airGain: "1",
    contactGain: "1",
    bodyGain: "1",
    resonanceGain: "1",
  };

  for (const [id, value] of Object.entries(defaults)) {
    elements[id].value = value;
    elements[id].dispatchEvent(new Event("input"));
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.libraryTree.addEventListener("click", (event) => {
  const button = event.target.closest("[data-bank]");

  if (!button) return;

  navigateToFolder(
    button.dataset.bank || null,
    button.dataset.category || null,
  );
});

elements.soundboard.addEventListener("click", (event) => {
  const button = event.target.closest(".sound-file");
  if (!button) return;
  selectPreset(button.dataset.id, { play: true });
});

for (const button of [elements.playSelected, elements.topPlaySelected, elements.mobilePlaySelected]) {
  button.addEventListener("click", async () => {
    try {
      await playPreset(parseEditorPatch());
      setStatus("Played current editor patch.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

for (const button of [elements.downloadWav, elements.topDownloadWav, elements.mobileDownloadWav]) {
  button.addEventListener("click", downloadSelectedWav);
}

elements.applyPatch.addEventListener("click", applyEditorPatch);
elements.resetPatch.addEventListener("click", resetEditorPatch);
elements.duplicatePatch.addEventListener("click", duplicateEditorPatch);
elements.downloadJson.addEventListener("click", downloadSelectedJson);
elements.resetMixer.addEventListener("click", resetMixerControls);

elements.stopAll.addEventListener("click", () => {
  engine.stopAll();
  setAudioState("stopped");
});

elements.playRandom.addEventListener("click", () => {
  const presets = filteredPresets();
  if (!presets.length) return;
  const preset = presets[Math.floor(Math.random() * presets.length)];
  selectPreset(preset.id, { play: true });
});

elements.search.addEventListener("input", renderSoundboard);
elements.sortOrder.addEventListener("change", renderSoundboard);

elements.viewToggle.addEventListener("click", () => {
  state.viewMode = state.viewMode === "grid" ? "list" : "grid";
  localStorage.setItem("soundFactory.viewMode", state.viewMode);
  renderSoundboard();
});

elements.outputFilename.addEventListener("input", () => {
  const preset = getSelectedPreset();
  if (!preset) return;

  const preview = sanitizeOutputBase(elements.outputFilename.value);
  elements.mobileOutputName.textContent = `${preview}.wav`;
  state.outputNames[preset.id] = elements.outputFilename.value;
  saveSetting("soundFactory.outputNames", state.outputNames);
});

const sliderOutputs = [
  ["variation", "variationValue", (value) => `${Math.round(value * 100)}%`],
  ["pitch", "pitchValue", (value) => `${value.toFixed(2)}×`],
  ["airGain", "airValue", (value) => `${value.toFixed(2)}×`],
  ["contactGain", "contactValue", (value) => `${value.toFixed(2)}×`],
  ["bodyGain", "bodyValue", (value) => `${value.toFixed(2)}×`],
  ["resonanceGain", "resonanceValue", (value) => `${value.toFixed(2)}×`],
];

for (const [inputId, outputId, format] of sliderOutputs) {
  elements[inputId].addEventListener("input", () => {
    elements[outputId].textContent = format(Number(elements[inputId].value));
  });
}

elements.masterVolume.addEventListener("input", () => {
  engine.setMasterVolume(elements.masterVolume.value);
});

elements.patchEditor.addEventListener("input", () => {
  try {
    parseEditorPatch();
    setStatus("Valid JSON. Apply to store the change.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    downloadSelectedWav();
  }

  if (
    event.code === "Space"
    && !event.target.matches("input, textarea, select, button")
  ) {
    event.preventDefault();
    playPreset(getSelectedPreset());
  }
});

if (!state.presets.some((preset) => preset.id === state.selectedId)) {
  state.selectedId = "mt_warrior_hit";
}

renderLibraryTree();
renderSoundboard();
selectPreset(state.selectedId);
