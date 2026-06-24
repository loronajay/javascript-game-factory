// The Settings overlay — a single global element reachable from the title, main
// menu, and the in-match toolbar (so audio/animation-speed changes apply live
// during a game). Like RulesModal, this only drives shared chrome; callers get
// open()/close().
//
// Every control writes straight through: change the in-memory settings, apply
// them live (audio buses, animation-speed lever, theme/motion/colorblind root
// attributes via applySettings), and persist (saveSettings). There is no "Save"
// button — what you hear/see is already saved.

import { applySettings, saveSettings, normalizeSettings, DEFAULT_SETTINGS } from "./settings.js";

// Which `data-field` segmented groups carry a boolean (On/Off) vs a string value.
const BOOLEAN_FIELDS = new Set(["reduceMotion", "colorblind"]);

export class SettingsModal {
  constructor(modalEl, { settings, audio, documentRef = document } = {}) {
    this.modal = modalEl;
    this.audio = audio ?? null;
    this.documentRef = documentRef;
    // The live, normalized settings object this modal mutates and persists.
    this.settings = normalizeSettings(settings);

    this.sliders = Array.from(
      modalEl.querySelectorAll('input[type="range"][data-setting]'),
    );
    this.sliders.forEach((input) => {
      input.addEventListener("input", () => {
        this.settings[input.dataset.setting] = Number(input.value) / 100;
        this.updateSliderReadout(input);
        this.commit();
      });
    });

    this.segGroups = Array.from(modalEl.querySelectorAll("[data-field]"));
    this.segGroups.forEach((group) => {
      const field = group.dataset.field;
      group.querySelectorAll(".seg").forEach((seg) => {
        seg.addEventListener("click", () => {
          this.settings[field] = coerce(field, seg.dataset.value);
          selectSeg(group, seg);
          this.commit();
        });
      });
    });

    modalEl
      .querySelector('[data-action="closeSettings"]')
      ?.addEventListener("click", () => this.close());
    modalEl
      .querySelector('[data-action="resetSettings"]')
      ?.addEventListener("click", () => this.reset());

    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) {
        this.close();
      }
    });
  }

  // Apply + persist the current settings. Called on every control change.
  commit() {
    this.settings = applySettings(this.settings, {
      audio: this.audio,
      documentRef: this.documentRef,
    });
    saveSettings(this.settings);
  }

  reset() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.commit();
    this.syncControls();
  }

  // Reflect the current settings into every control (sliders + segmented groups).
  syncControls() {
    this.sliders.forEach((input) => {
      const value = this.settings[input.dataset.setting];
      input.value = String(Math.round((value ?? 0) * 100));
      this.updateSliderReadout(input);
    });

    this.segGroups.forEach((group) => {
      const current = this.settings[group.dataset.field];
      group.querySelectorAll(".seg").forEach((seg) => {
        const matches = coerce(group.dataset.field, seg.dataset.value) === current;
        seg.classList.toggle("is-selected", matches);
      });
    });
  }

  updateSliderReadout(input) {
    const readout = input
      .closest(".setting-row")
      ?.querySelector("[data-readout]");
    if (readout) {
      readout.textContent = `${Math.round(Number(input.value))}%`;
    }
  }

  open() {
    this.syncControls();
    this.modal.classList.add("open");
  }

  close() {
    this.modal.classList.remove("open");
  }
}

// Booleans live in the markup as "on"/"off"; everything else is a string key.
function coerce(field, rawValue) {
  if (BOOLEAN_FIELDS.has(field)) {
    return rawValue === "on";
  }
  return rawValue;
}

function selectSeg(group, chosen) {
  group.querySelectorAll(".seg").forEach((seg) => {
    seg.classList.toggle("is-selected", seg === chosen);
  });
}
