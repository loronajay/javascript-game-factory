import { CROP_CATALOG, type FarmAgriculture } from "./farm-crops.mjs";
import { PET_CARE } from "./farm-pet-care.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  seedGrid: HTMLElement;
  produceGrid: HTMLElement;
  suppliesGrid: HTMLElement;
  selected: HTMLElement;
}>;

type Options = Readonly<{
  thumbnail?: (cropId: string, onReady: (url: string) => void) => string | null;
  purchaseSupply?: ((itemId: string, quantity: number) => Promise<string>) | null;
}>;

export type FarmInventoryPanel = Readonly<{
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  render: (agriculture: FarmAgriculture) => void;
  selectedCropId: () => string;
}>;

export function createFarmInventoryPanel(elements: Elements, options: Options = {}): FarmInventoryPanel {
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
      const portrait = document.createElement("span");
      portrait.className = "seed-card__image";
      portrait.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.alt = "";
      const show = (url: string): void => { image.src = url; portrait.replaceChildren(image); };
      const ready = options.thumbnail?.(crop.id, show);
      if (ready) show(ready);
      const title = document.createElement("strong");
      title.textContent = crop.title;
      const count = document.createElement("small");
      count.textContent = `${agriculture.inventory.seeds[crop.id]} seeds`;
      button.replaceChildren(portrait, title, count);
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
    elements.suppliesGrid.replaceChildren(...PET_CARE.map((care) => {
      const food = document.createElement("div");
      food.className = "produce-row";
      const title = document.createElement("span");
      title.textContent = care.food.title;
      const count = document.createElement("strong");
      count.textContent = String(agriculture.inventory.supplies[care.food.itemId] ?? 0);
      const buy = document.createElement("button");
      buy.type = "button";
      buy.className = "farm-button";
      buy.textContent = `Buy · ${care.food.price} tickets`;
      buy.disabled = !options.purchaseSupply || (agriculture.inventory.supplies[care.food.itemId] ?? 0) >= 99;
      buy.addEventListener("click", async () => {
        if (!options.purchaseSupply) return;
        buy.disabled = true;
        buy.textContent = "Buying…";
        const message = await options.purchaseSupply(care.food.itemId, 1);
        elements.selected.textContent = message;
        if (buy.isConnected) { buy.disabled = false; buy.textContent = `Buy · ${care.food.price} tickets`; }
      });
      food.replaceChildren(title, count, buy);
      return food;
    }));
    const selected = CROP_CATALOG.find((entry) => entry.id === selectedCropId)!;
    if (!elements.selected.textContent?.includes("Purchased")) elements.selected.textContent = `${selected.title} seeds × ${agriculture.inventory.seeds[selected.id] ?? 0}`;
  }

  elements.openButton.addEventListener("click", () => isOpen() ? close() : open());
  elements.closeButton.addEventListener("click", close);
  close();
  return Object.freeze({ open, close, toggle: () => isOpen() ? close() : open(), isOpen, render, selectedCropId: () => selectedCropId });
}
