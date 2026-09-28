// The Cove's panels: the Creel and the Fishdex (C), the Fishmonger's counter,
// Bait & Tackle's shelves and the Cove Records board. DOM only: every list is
// drawn from an `Angler` the server answered with (farm-angler.mts), and every
// button hands the page a request; the page talks to the server and repaints
// with what it says. Nothing here decides a price, a count or a level.

import {
  FISH_CATALOG,
  FISHING_LURES,
  FISHING_RODS,
  RARITY_COLORS,
  RARITY_TITLES,
  WORM_ID,
  WORM_TUB,
  ZONE_TITLES,
  MAX_LURES_EACH,
  findFishSpecies,
  type FishRarity,
} from "./farm-catalog/fish.mjs";
import { GRADE_TITLES, SIZE_TITLES, formatLength, formatWeight, specimenTitle, type SizeClass } from "./farm-fish.mjs";
import { dexProgress, type Angler, type AnglerFish } from "./farm-angler.mjs";
import type { FishThumbnails } from "./farm-fish-models.mjs";

export type PanelOutcome = Readonly<{ ok: boolean; message: string }>;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function portrait(thumbs: FishThumbnails, fish: Pick<AnglerFish, "speciesId" | "variant">, hidden = false): HTMLElement {
  const frame = element("span", `fish-portrait${hidden ? " fish-portrait--unknown" : ""}`);
  const url = thumbs.get(fish.speciesId, fish.variant);
  if (url) {
    const image = element("img");
    image.src = url;
    image.alt = "";
    frame.append(image);
  }
  const rarity = findFishSpecies(fish.speciesId)?.rarity ?? "common";
  frame.style.setProperty("--rarity", RARITY_COLORS[rarity]);
  return frame;
}

function fishLine(fish: AnglerFish): string {
  return `${formatWeight(fish.weightG)} · ${formatLength(fish.lengthMm)} · ${GRADE_TITLES[fish.grade]} · ${fish.value.toLocaleString()} tickets`;
}

type Panel = Readonly<{ open: () => void; close: () => void; isOpen: () => boolean; repaint: () => void }>;

function panelShell(root: HTMLElement, onClose: () => void, draw: () => void): Panel {
  let open = false;
  root.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => {
    root.hidden = true;
    open = false;
    onClose();
  });
  return Object.freeze({
    open() {
      open = true;
      root.hidden = false;
      draw();
    },
    close() {
      if (!open) return;
      open = false;
      root.hidden = true;
      onClose();
    },
    isOpen: () => open,
    repaint() {
      if (open) draw();
    },
  });
}

// ---------------------------------------------------------------- the creel and the Fishdex

export function createCreelPanel(root: HTMLElement, deps: Readonly<{
  angler: () => Angler;
  thumbs: FishThumbnails;
  signedIn: () => boolean;
  lock: (fish: AnglerFish, locked: boolean) => Promise<PanelOutcome>;
  release: (fish: AnglerFish) => Promise<PanelOutcome>;
  /** Mount a fish (Old Pike's fee) or take a mounted one down. */
  mount: (fish: AnglerFish, mounted: boolean) => Promise<PanelOutcome>;
  mountFee: number;
  onClose: () => void;
}>): Panel & Readonly<{ showTab: (tab: "creel" | "mounted" | "dex") => void }> {
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const heading = root.querySelector<HTMLElement>("[data-heading]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  let tab: "creel" | "mounted" | "dex" = "creel";
  for (const button of tabs) button.addEventListener("click", () => {
    tab = button.dataset.tab === "dex" ? "dex" : button.dataset.tab === "mounted" ? "mounted" : "creel";
    draw();
  });

  function drawCreel(angler: Angler): void {
    heading.textContent = `Your creel · ${angler.creel.length} / ${angler.capacity}`;
    if (!deps.signedIn()) {
      body.append(element("p", "sale-note", "Signed out, the Cove is practice: every fish goes back. Sign in and what you land is kept here, sold at the Fishmonger or cooked at home."));
      return;
    }
    if (!angler.creel.length) {
      body.append(element("p", "sale-empty", "Nothing in the creel yet. Cast at a shadow on the water — the bigger the shadow, the bigger the fish."));
      return;
    }
    const list = element("ol", "sale-list fish-list");
    for (const fish of angler.creel) {
      const row = element("li", "fish-row");
      const label = element("span", "fish-row__label");
      label.append(element("strong", "", specimenTitle(fish.speciesId, fish.variant, fish.sizeClass as SizeClass)), element("small", "", fishLine(fish)));
      const actions = element("span", "fish-row__actions");
      const lock = element("button", "farm-button", fish.locked ? "Locked" : "Lock");
      lock.type = "button";
      lock.setAttribute("aria-pressed", String(fish.locked));
      lock.title = fish.locked ? "Unlock: it can be sold or let go again" : "Lock: it can't be sold or let go by mistake";
      lock.addEventListener("click", async () => {
        lock.disabled = true;
        const outcome = await deps.lock(fish, !fish.locked);
        status.textContent = outcome.ok ? "" : outcome.message;
      });
      const release = element("button", "farm-button", "Let go");
      release.type = "button";
      release.disabled = fish.locked;
      release.addEventListener("click", async () => {
        release.disabled = true;
        const outcome = await deps.release(fish);
        status.textContent = outcome.message;
      });
      const mount = element("button", "farm-button", "Mount");
      mount.type = "button";
      mount.title = `Old Pike mounts it on a plaque for ${deps.mountFee} tickets. Stand it on your farm from build mode's Furniture tab.`;
      mount.addEventListener("click", async () => {
        mount.disabled = true;
        const outcome = await deps.mount(fish, true);
        status.textContent = outcome.message;
      });
      actions.append(lock, mount, release);
      row.append(portrait(deps.thumbs, fish), label, actions);
      list.append(row);
    }
    body.append(list);
  }

  function drawMounted(angler: Angler): void {
    heading.textContent = `Mounted · ${angler.mounted.length}`;
    body.append(element("p", "sale-note", `Fish Old Pike has mounted on plaques. Stand them on your farm from build mode's Furniture tab — each on its own Trophy Mount. Taking one down puts it back in your creel.`));
    if (!angler.mounted.length) {
      body.append(element("p", "sale-empty", `Nothing mounted yet. Press Mount on a fish in your creel (${deps.mountFee} tickets).`));
      return;
    }
    const list = element("ol", "sale-list fish-list");
    for (const fish of angler.mounted) {
      const row = element("li", "fish-row");
      const label = element("span", "fish-row__label");
      label.append(element("strong", "", specimenTitle(fish.speciesId, fish.variant, fish.sizeClass as SizeClass)), element("small", "", fishLine(fish)));
      const down = element("button", "farm-button", "Take down");
      down.type = "button";
      down.addEventListener("click", async () => {
        down.disabled = true;
        const outcome = await deps.mount(fish, false);
        status.textContent = outcome.message;
      });
      const actions = element("span", "fish-row__actions");
      actions.append(down);
      row.append(portrait(deps.thumbs, fish), label, actions);
      list.append(row);
    }
    body.append(list);
  }

  function drawDex(angler: Angler): void {
    const progress = dexProgress(angler);
    heading.textContent = `Fishdex · ${progress.caught} / ${progress.total}`;
    const grid = element("ol", "dex-grid");
    for (const species of FISH_CATALOG) {
      const entry = angler.dex[species.id];
      const known = Boolean(entry && entry.caught > 0);
      const card = element("li", `dex-card${known ? "" : " dex-card--unknown"}`);
      card.style.setProperty("--rarity", RARITY_COLORS[species.rarity]);
      card.append(portrait(deps.thumbs, { speciesId: species.id, variant: "normal" }, !known));
      card.append(element("strong", "", known ? species.title : "???"));
      const facts = element("small", "", known
        ? `Best ${formatWeight(entry!.bestG)} · ${entry!.caught} landed`
        : `${RARITY_TITLES[species.rarity]} · ${species.zones.map((zone) => ZONE_TITLES[zone]).join(", ")}`);
      card.append(facts);
      if (entry?.shiny || entry?.golden) card.append(element("em", "dex-card__variants", [entry.shiny ? "✦ Shiny" : "", entry.golden ? "★ Golden" : ""].filter(Boolean).join(" · ")));
      grid.append(card);
    }
    body.append(grid);
  }

  function draw(): void {
    body.replaceChildren();
    for (const button of tabs) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    const angler = deps.angler();
    if (tab === "dex") drawDex(angler);
    else if (tab === "mounted") drawMounted(angler);
    else drawCreel(angler);
  }

  const shell = panelShell(root, deps.onClose, draw);
  return Object.freeze({
    ...shell,
    showTab(next: "creel" | "mounted" | "dex") {
      tab = next;
      shell.open();
    },
  });
}

// ---------------------------------------------------------------- the Fishmonger

export function createFishmongerPanel(root: HTMLElement, deps: Readonly<{
  angler: () => Angler;
  thumbs: FishThumbnails;
  sell: (fish: readonly AnglerFish[]) => Promise<PanelOutcome>;
  onClose: () => void;
}>): Panel {
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const total = root.querySelector<HTMLElement>("[data-total]")!;
  const sell = root.querySelector<HTMLButtonElement>("[data-sell]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const picked = new Set<string>();
  root.querySelector<HTMLButtonElement>("[data-pick-all]")?.addEventListener("click", () => {
    for (const fish of deps.angler().creel) if (!fish.locked) picked.add(fish.id);
    draw();
  });
  root.querySelector<HTMLButtonElement>("[data-pick-common]")?.addEventListener("click", () => {
    for (const fish of deps.angler().creel) {
      const rarity = findFishSpecies(fish.speciesId)?.rarity;
      if (!fish.locked && (rarity === "common" || rarity === "uncommon") && fish.variant === "normal" && fish.sizeClass !== "trophy" && fish.sizeClass !== "record") picked.add(fish.id);
    }
    draw();
  });
  sell.addEventListener("click", async () => {
    const chosen = deps.angler().creel.filter((fish) => picked.has(fish.id));
    if (!chosen.length) return;
    sell.disabled = true;
    const outcome = await deps.sell(chosen);
    if (outcome.ok) picked.clear();
    draw();
    status.textContent = outcome.message;
  });

  function draw(): void {
    const angler = deps.angler();
    const held = new Set(angler.creel.map((fish) => fish.id));
    for (const id of [...picked]) if (!held.has(id)) picked.delete(id);
    body.replaceChildren();
    body.append(element("p", "sale-note", "Coral pays for every fish on its own merits: its kind, its weight, how cleanly it was landed, and ten times over for a Golden one. Locked fish stay in the creel."));
    if (!angler.creel.length) {
      body.append(element("p", "sale-empty", "Your creel is empty. Go and catch something!"));
    } else {
      const list = element("ol", "sale-list fish-list");
      for (const fish of angler.creel) {
        const row = element("li", `fish-row${picked.has(fish.id) ? " is-picked" : ""}`);
        const label = element("label", "fish-row__label");
        const box = element("input");
        box.type = "checkbox";
        box.checked = picked.has(fish.id);
        box.disabled = fish.locked;
        box.addEventListener("change", () => {
          if (box.checked) picked.add(fish.id);
          else picked.delete(fish.id);
          draw();
        });
        label.append(box, element("strong", "", specimenTitle(fish.speciesId, fish.variant, fish.sizeClass as SizeClass)), element("small", "", fish.locked ? "Locked — unlock it in the creel to sell" : fishLine(fish)));
        const price = element("b", "fish-row__price", `${fish.value.toLocaleString()}`);
        row.append(portrait(deps.thumbs, fish), label, price);
        list.append(row);
      }
      body.append(list);
    }
    const sum = angler.creel.filter((fish) => picked.has(fish.id)).reduce((acc, fish) => acc + fish.value, 0);
    total.textContent = sum.toLocaleString();
    sell.disabled = picked.size === 0;
    sell.textContent = picked.size ? `Sell ${picked.size} fish` : "Pick fish to sell";
  }

  return panelShell(root, deps.onClose, () => {
    status.textContent = "";
    draw();
  });
}

// ---------------------------------------------------------------- Bait & Tackle

export function createTacklePanel(root: HTMLElement, deps: Readonly<{
  angler: () => Angler;
  thumbs: FishThumbnails;
  buy: (itemId: string, quantity: number) => Promise<PanelOutcome>;
  onClose: () => void;
}>): Panel {
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;

  function shelfRow(file: string, title: string, note: string, action: HTMLElement): HTMLElement {
    const row = element("li", "fish-row tackle-row");
    const frame = element("span", "fish-portrait fish-portrait--prop");
    const url = deps.thumbs.prop(file);
    if (url) {
      const image = element("img");
      image.src = url;
      image.alt = "";
      frame.append(image);
    }
    const label = element("span", "fish-row__label");
    label.append(element("strong", "", title), element("small", "", note));
    row.append(frame, label, action);
    return row;
  }

  function buyButton(text: string, itemId: string, quantity: number, disabled = false): HTMLButtonElement {
    const button = element("button", "farm-button farm-button--accent", text);
    button.type = "button";
    button.disabled = disabled;
    button.addEventListener("click", async () => {
      button.disabled = true;
      const outcome = await deps.buy(itemId, quantity);
      status.textContent = outcome.message;
      draw();
    });
    return button;
  }

  function draw(): void {
    const angler = deps.angler();
    body.replaceChildren();
    body.append(element("h3", "vendor-shelf__title", "Bait"));
    const bait = element("ol", "sale-list");
    bait.append(shelfRow("worm.glb", `A tub of worms (${WORM_TUB.count})`, `You have ${angler.tackle.worms}. One goes on the hook every cast.`, buyButton(`${WORM_TUB.price} tickets`, WORM_ID, 1)));
    body.append(bait);

    body.append(element("h3", "vendor-shelf__title", "Lures"));
    const lures = element("ol", "sale-list");
    for (const lure of FISHING_LURES) {
      const held = angler.tackle.lures[lure.id] ?? 0;
      const locked = angler.level < lure.minLevel;
      const note = locked ? `Fishing level ${lure.minLevel} · ${lure.blurb}` : `${lure.blurb} You have ${held}. Kept between casts; a snapped line loses one.`;
      lures.append(shelfRow(lure.file, lure.title, note, buyButton(locked ? `Level ${lure.minLevel}` : `${lure.price} tickets`, lure.id, 1, locked || held >= MAX_LURES_EACH)));
    }
    body.append(lures);

    body.append(element("h3", "vendor-shelf__title", "Rods"));
    const rods = element("ol", "sale-list");
    for (const rod of FISHING_RODS) {
      const owned = angler.tackle.rods.includes(rod.id);
      const locked = angler.level < rod.minLevel;
      const note = `${rod.blurb} Line ${Math.round(rod.line * 100)} · casts ${rod.castRange} m`;
      const action = owned
        ? element("span", "tackle-row__owned", "Owned")
        : buyButton(locked ? `Level ${rod.minLevel}` : `${rod.price.toLocaleString()} tickets`, rod.id, 1, locked);
      rods.append(shelfRow(rod.file, rod.title, note, action));
    }
    body.append(rods);
  }

  return panelShell(root, deps.onClose, () => {
    status.textContent = "";
    draw();
  });
}

// ---------------------------------------------------------------- the Cove Records

export type RecordRow = Readonly<{ speciesId: string; weightG: number; lengthMm: number; variant: string; name: string; caughtAt: number }>;
export type RecordsBoard = Readonly<{ today: readonly RecordRow[]; allTime: readonly RecordRow[] }>;

export function normalizeRecords(value: unknown): RecordsBoard {
  const source: any = value && typeof value === "object" ? value : {};
  const rows = (list: unknown): RecordRow[] => (Array.isArray(list) ? list : [])
    .filter((row: any) => findFishSpecies(row?.speciesId))
    .map((row: any) => Object.freeze({
      speciesId: row.speciesId,
      weightG: Math.max(0, Number(row.weightG) || 0),
      lengthMm: Math.max(0, Number(row.lengthMm) || 0),
      variant: String(row.variant ?? "normal"),
      name: String(row.name ?? "An angler").slice(0, 40),
      caughtAt: Number(row.caughtAt) || 0,
    }));
  return Object.freeze({ today: rows(source.today), allTime: rows(source.allTime) });
}

export function createRecordsPanel(root: HTMLElement, deps: Readonly<{
  load: () => Promise<RecordsBoard | null>;
  thumbs: FishThumbnails;
  onClose: () => void;
}>): Panel {
  const body = root.querySelector<HTMLElement>("[data-body]")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  let tab: "today" | "allTime" = "today";
  let board: RecordsBoard | null = null;
  for (const button of tabs) button.addEventListener("click", () => {
    tab = button.dataset.tab === "allTime" ? "allTime" : "today";
    draw();
  });

  function draw(): void {
    for (const button of tabs) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    body.replaceChildren();
    if (!board) {
      body.append(element("p", "sale-empty", "Reading the board…"));
      return;
    }
    const rows = new Map((tab === "today" ? board.today : board.allTime).map((row) => [row.speciesId, row]));
    body.append(element("p", "sale-note", tab === "today"
      ? "The heaviest of every fish landed in the Cove since midnight (UTC). The board is wiped at the turn of the day."
      : "The heaviest of every fish ever landed in the Cove, and who landed it."));
    const byRarity = (rarity: FishRarity) => FISH_CATALOG.filter((species) => species.rarity === rarity);
    const list = element("ol", "sale-list fish-list records-list");
    for (const rarity of ["legendary", "epic", "rare", "uncommon", "common"] as const) {
      for (const species of byRarity(rarity)) {
        const row = rows.get(species.id);
        const item = element("li", `fish-row${row ? "" : " records-row--empty"}`);
        const label = element("span", "fish-row__label");
        label.append(element("strong", "", species.title), element("small", "", row ? `${row.name} · ${formatLength(row.lengthMm)}` : "No one yet — it could be you"));
        item.append(portrait(deps.thumbs, { speciesId: species.id, variant: "normal" }, !row), label, element("b", "fish-row__price", row ? formatWeight(row.weightG) : "—"));
        list.append(item);
      }
    }
    body.append(list);
  }

  const shell = panelShell(root, deps.onClose, draw);
  return Object.freeze({
    ...shell,
    open() {
      shell.open();
      void deps.load().then((next) => {
        board = next ?? { today: [], allTime: [] };
        shell.repaint();
      });
    },
  });
}

export { SIZE_TITLES };
