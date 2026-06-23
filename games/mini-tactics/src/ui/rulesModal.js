// The reference ("How to Play") overlay is a single global element reachable from
// the title screen, main menu, and the in-match toolbar. Centralizing it here keeps
// any one screen from owning shared chrome — callers just get open()/close().
//
// Content is three tabs (Basics / Units / Advanced) authored as static markup in
// index.html; this class only toggles which tab panel is visible. Opening always
// resets to the first tab so the overlay reads as onboarding-first every time.

export class RulesModal {
  constructor(modalEl, closeBtnEl) {
    this.modal = modalEl;
    this.tabs = Array.from(modalEl.querySelectorAll(".ref-tab"));
    this.panels = Array.from(modalEl.querySelectorAll(".ref-panel"));
    this.defaultTab = this.tabs[0]?.dataset.tab ?? null;

    this.tabs.forEach((tab) => {
      tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
    });

    closeBtnEl.addEventListener("click", () => this.close());
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) {
        this.close();
      }
    });
  }

  showTab(name) {
    this.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
    this.panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === name);
    });
  }

  open() {
    if (this.defaultTab) {
      this.showTab(this.defaultTab);
    }
    this.modal.classList.add("open");
  }

  close() {
    this.modal.classList.remove("open");
  }
}
