import { mountCodex } from "./codex.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";

// Global "Field Manual" overlay — tabbed reference reachable from the title,
// main menu, and in-match topbar. Three tabs: Basics (rules), Codex (unit data),
// Advanced (strategy). Opening from a live match passes only the unit types
// present in that battle so the Codex tab stays focused; opening from menus
// passes null and builds the full roster.
export class RulesModal {
  constructor(modalEl, closeBtnEl) {
    this.modal = modalEl;
    this.tabs = Array.from(modalEl.querySelectorAll(".ref-tab"));
    this.panels = Array.from(modalEl.querySelectorAll(".ref-panel"));
    this.codexBody = modalEl.querySelector("#refBody");

    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
    });

    closeBtnEl.addEventListener("click", () => this.close());
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.modal.hidden;
  }

  showTab(name) {
    this.tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
    this.panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === name));
  }

  // unitDefs: array of unit type definition objects, or null for all known units.
  open(tab = "basics", unitDefs = null) {
    const defs = unitDefs ?? Object.values(UNIT_TYPES);
    if (this.codexBody) mountCodex(this.codexBody, defs);
    this.showTab(tab);
    this.modal.hidden = false;
  }

  close() {
    this.modal.hidden = true;
  }
}
