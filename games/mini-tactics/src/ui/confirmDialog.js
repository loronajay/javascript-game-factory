// A single global stylized confirm dialog, reachable wherever a destructive
// action needs an in-game "are you sure?" instead of the browser's native
// window.confirm. ask() resolves true (confirmed) or false (cancelled), so a
// caller can `await` it like the native prompt it replaces.
//
// Centralized here for the same reason as RulesModal: shared chrome should not
// be owned by any one screen.

export class ConfirmDialog {
  constructor(modalEl) {
    this.modal = modalEl;
    this.titleEl = modalEl.querySelector('[data-confirm="title"]');
    this.bodyEl = modalEl.querySelector('[data-confirm="body"]');
    this.okBtn = modalEl.querySelector('[data-confirm="ok"]');
    this.cancelBtn = modalEl.querySelector('[data-confirm="cancel"]');

    // Only one prompt is open at a time; this holds the in-flight resolver.
    this.resolver = null;
    this.onKeyDown = (event) => {
      if (event.key === "Escape") this.settle(false);
      if (event.key === "Enter") this.settle(true);
    };

    this.okBtn.addEventListener("click", () => this.settle(true));
    this.cancelBtn.addEventListener("click", () => this.settle(false));
    // A click on the backdrop (outside the card) cancels, matching the rules modal.
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) this.settle(false);
    });
  }

  // Open the prompt with per-call copy and return a Promise<boolean>. If a prompt
  // is somehow already open, it is cancelled first so the new one owns the resolver.
  ask({
    title = "Confirm",
    body = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
  } = {}) {
    this.settle(false);

    this.titleEl.textContent = title;
    this.bodyEl.textContent = body;
    this.okBtn.textContent = confirmLabel;
    this.cancelBtn.textContent = cancelLabel;

    this.modal.classList.add("open");
    this.modal.ownerDocument.addEventListener("keydown", this.onKeyDown);
    this.cancelBtn.focus();

    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  settle(result) {
    if (!this.resolver) return;

    const resolve = this.resolver;
    this.resolver = null;
    this.modal.classList.remove("open");
    this.modal.ownerDocument.removeEventListener("keydown", this.onKeyDown);
    resolve(result);
  }
}
