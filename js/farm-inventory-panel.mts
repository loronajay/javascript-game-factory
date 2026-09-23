import { CROP_CATALOG, type FarmAgriculture } from "./farm-crops.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  seedGrid: HTMLElement;
  produceGrid: HTMLElement;
  selected: HTMLElement;
}>;

export type FarmInventoryPanel = Readonly<{
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  render: (agriculture: FarmAgriculture) => void;
  selectedCropId: () => string;
}>;

export function createFarmInventoryPanel(elements: Elements): FarmInventoryPanel {
  let agriculture: FarmAgriculture;
  let selectedCropId = CROP_CATALOG[0]!.id;

  function isOpen(): boolean { return !elements.root.hidden; }
  function close(): void {
    elements.root.hidden = true;
    elements.openButton.setAttribute("aria-pressed", "false");
  }
  function open(): void {
    elements.root.hidden = false;
    elements.openButton.setAttribute("aria-pressed", "true");
    document.exitPointerLock?.();
  }

  function render(next: FarmAgriculture): void {
    agriculture = next;
    if ((agriculture.inventory.seeds[selectedCropId] ?? 0) <= 0) {
      selectedCropId = CROP_CATALOG.find((entry) => (agriculture.inventory.seeds[entry.id] ?? 0) > 0)?.id ?? selectedCropId;
    }
    elements.seedGrid.replaceChildren(...CROP_CATALOG.map((crop) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "seed-card";
      button.dataset.cropId = crop.id;
      button.setAttribute("aria-pressed", String(crop.id === selectedCropId));
      button.disabled = (agriculture.inventory.seeds[crop.id] ?? 0) <= 0;
      button.innerHTML = `<span class="seed-card__icon" aria-hidden="true">${crop.title.slice(0, 2).toUpperCase()}</span><strong>${crop.title}</strong><small>${agriculture.inventory.seeds[crop.id]} seeds</small>`;
      button.addEventListener("click", () => {
        selectedCropId = crop.id;
        render(agriculture);
      });
      return button;
    }));
    elements.produceGrid.replaceChildren(...CROP_CATALOG.map((crop) => {
      const item = document.createElement("div");
      item.className = "produce-row";
      item.innerHTML = `<span>${crop.title}</span><strong>${agriculture.inventory.produce[crop.id] ?? 0}</strong>`;
      return item;
    }));
    const selected = CROP_CATALOG.find((entry) => entry.id === selectedCropId)!;
    elements.selected.textContent = `${selected.title} seeds × ${agriculture.inventory.seeds[selected.id] ?? 0}`;
  }

  elements.openButton.addEventListener("click", () => isOpen() ? close() : open());
  elements.closeButton.addEventListener("click", close);
  close();
  return Object.freeze({ open, close, toggle: () => isOpen() ? close() : open(), isOpen, render, selectedCropId: () => selectedCropId });
}
