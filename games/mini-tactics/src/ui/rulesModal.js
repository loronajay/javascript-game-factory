// The rules ("How to play") overlay is a single global element reachable from the
// title screen, main menu, and the in-match toolbar. Centralizing it here keeps
// any one screen from owning shared chrome — callers just get open()/close().

export class RulesModal {
  constructor(modalEl, closeBtnEl) {
    this.modal = modalEl;

    closeBtnEl.addEventListener("click", () => this.close());
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) {
        this.close();
      }
    });
  }

  open() {
    this.modal.classList.add("open");
  }

  close() {
    this.modal.classList.remove("open");
  }
}
