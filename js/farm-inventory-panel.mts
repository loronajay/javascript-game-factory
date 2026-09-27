import { CROP_CATALOG, type FarmAgriculture } from "./farm-crops.mjs";
import { PET_CARE } from "./farm-pet-care.mjs";
import { FRUIT_TREES, TIMBER_TREES, TREE_CATALOG, findTreeSpecies, type TreeSpecies } from "./farm-catalog/trees.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  seedGrid: HTMLElement;
  produceGrid: HTMLElement;
  suppliesGrid: HTMLElement;
  saplingGrid: HTMLElement;
  logsGrid: HTMLElement;
  selected: HTMLElement;
}>;

/** The skill levels that decide which saplings are for sale. */
export type InventoryLevels = Readonly<{ farming: number; woodcutting: number }>;

type Options = Readonly<{
  thumbnail?: (cropId: string, onReady: (url: string) => void) => string | null;
  purchaseSupply?: ((itemId: string, quantity: number) => Promise<string>) | null;
}>;

export type FarmInventoryPanel = Readonly<{
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  render: (agriculture: FarmAgriculture, levels?: InventoryLevels) => void;
  selectedCropId: () => string;
  selectedSaplingId: () => string;
}>;

export function createFarmInventoryPanel(elements: Elements, options: Options = {}): FarmInventoryPanel {
  let agriculture: FarmAgriculture;
  let selectedCropId = CROP_CATALOG[0]!.id;
  let selectedSaplingId = TREE_CATALOG[0]!.id;
  let levels: InventoryLevels = { farming: 1, woodcutting: 1 };

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

  /** A buy button for a supply-shaped item: it says what it costs, and why it cannot be bought when it cannot. */
  function buyButton(itemId: string, price: number, held: number, locked = ""): HTMLButtonElement {
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "farm-button";
    const label = locked || `Buy · ${price} tickets`;
    buy.textContent = label;
    buy.disabled = Boolean(locked) || !options.purchaseSupply || held >= 99;
    buy.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!options.purchaseSupply) return;
      buy.disabled = true;
      buy.textContent = "Buying…";
      const message = await options.purchaseSupply(itemId, 1);
      elements.selected.textContent = message;
      if (buy.isConnected) { buy.disabled = false; buy.textContent = label; }
    });
    return buy;
  }

  function saplingCard(species: TreeSpecies): HTMLElement {
    const held = agriculture.inventory.saplings[species.id] ?? 0;
    const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
    const level = species.kind === "fruit" ? levels.farming : levels.woodcutting;
    const card = document.createElement("div");
    card.className = "sapling-card";
    card.dataset.speciesId = species.id;
    card.setAttribute("aria-pressed", String(species.id === selectedSaplingId));
    card.style.setProperty("--fruit", species.kind === "fruit" ? species.fruitColor : "#8a5a34");
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "sapling-card__pick";
    pick.disabled = held <= 0;
    const title = document.createElement("strong");
    title.textContent = species.title;
    const detail = document.createElement("small");
    detail.textContent = `${held} sapling${held === 1 ? "" : "s"} · ${species.kind === "fruit" ? `${species.yield} ${species.fruitPlural.toLowerCase()} a crop` : `${species.yield} logs a felling`}`;
    pick.replaceChildren(title, detail);
    pick.addEventListener("click", () => {
      selectedSaplingId = species.id;
      render(agriculture, levels);
    });
    card.replaceChildren(pick, buyButton(`sapling.${species.id}`, species.saplingPrice, held, level < species.minLevel ? `Needs ${skill} ${species.minLevel}` : ""));
    return card;
  }

  function countRow(title: string, count: number): HTMLElement {
    const item = document.createElement("div");
    item.className = "produce-row";
    const name = document.createElement("span");
    name.textContent = title;
    const total = document.createElement("strong");
    total.textContent = String(count);
    item.replaceChildren(name, total);
    return item;
  }

  function render(next: FarmAgriculture, nextLevels: InventoryLevels = levels): void {
    agriculture = next;
    levels = nextLevels;
    if ((agriculture.inventory.saplings[selectedSaplingId] ?? 0) <= 0) {
      selectedSaplingId = TREE_CATALOG.find((entry) => (agriculture.inventory.saplings[entry.id] ?? 0) > 0)?.id ?? selectedSaplingId;
    }
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
    elements.produceGrid.replaceChildren(
      ...CROP_CATALOG.map((crop) => countRow(crop.title, agriculture.inventory.produce[crop.id] ?? 0)),
      ...FRUIT_TREES.map((species) => countRow(species.fruitPlural, agriculture.inventory.produce[species.fruitId] ?? 0)),
    );
    elements.saplingGrid.replaceChildren(...TREE_CATALOG.map(saplingCard));
    elements.logsGrid.replaceChildren(...TIMBER_TREES.map((species) => countRow(`${species.title} logs`, agriculture.inventory.logs[species.id] ?? 0)));
    elements.suppliesGrid.replaceChildren(...PET_CARE.map((care) => {
      const food = document.createElement("div");
      food.className = "produce-row";
      const title = document.createElement("span");
      title.textContent = care.food.title;
      const count = document.createElement("strong");
      count.textContent = String(agriculture.inventory.supplies[care.food.itemId] ?? 0);
      food.replaceChildren(title, count, buyButton(care.food.itemId, care.food.price, agriculture.inventory.supplies[care.food.itemId] ?? 0));
      return food;
    }));
    const selected = CROP_CATALOG.find((entry) => entry.id === selectedCropId)!;
    if (!elements.selected.textContent?.includes("Purchased")) elements.selected.textContent = `${selected.title} seeds × ${agriculture.inventory.seeds[selected.id] ?? 0}`;
  }

  elements.openButton.addEventListener("click", () => isOpen() ? close() : open());
  elements.closeButton.addEventListener("click", close);
  close();
  return Object.freeze({
    open, close, toggle: () => isOpen() ? close() : open(), isOpen, render,
    selectedCropId: () => selectedCropId,
    selectedSaplingId: () => findTreeSpecies(selectedSaplingId)?.id ?? TREE_CATALOG[0]!.id,
  });
}
