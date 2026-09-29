// The Livestock panel (L): the herd, each animal's grade and stats, and which
// home it lives in.
//
// DOM only — no THREE, no storage, no fetching. It is handed the herd, the
// homes and the farm clock to draw, and two actions (move, rename) that go to
// the server through the controller; it redraws from what it is handed back.
// Buying is not here: young stock come from the Livestock Dealer in the Market
// Square, which is where the note at the foot of the panel sends the player.

import { livestockSummary, type LivestockAnimal } from "./farm-livestock.mjs";
import { homeOccupancy, totalLivestockSlots, type LivestockHome } from "./farm-livestock-housing.mjs";
import { LIVESTOCK_NAME_MAX } from "./farm-catalog/livestock.mjs";
import { goodsState, livestockNeed } from "./farm-livestock-care.mjs";
import { QUALITY_TITLES } from "./farm-quality.mjs";

export type LivestockPanelElements = Readonly<{
  root: HTMLElement;
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
  count: HTMLElement;
  status: HTMLElement;
}>;

export type LivestockPanelActions = Readonly<{
  move: (animalId: string, homeId: string | null) => Promise<string>;
  rename: (animalId: string, name: string) => Promise<string>;
}>;

export type LivestockPanelView = Readonly<{
  herd: readonly LivestockAnimal[];
  homes: readonly LivestockHome[];
  clockMinutes: number;
  /** False for a visitor or a signed-out farm: the rows are read-only. */
  canManage: boolean;
  /** Why there is no herd to manage, when there cannot be one (signed out). */
  note: string;
}>;

export type LivestockPanel = Readonly<{
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  render: (view: LivestockPanelView) => void;
  setStatus: (text: string) => void;
}>;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const FIELD = "";

export function createLivestockPanel(elements: LivestockPanelElements, actions: LivestockPanelActions, options: Readonly<{ beforeOpen?: () => void; onClose?: () => void }> = {}): LivestockPanel {
  let open = false;
  let view: LivestockPanelView | null = null;
  let busy = false;

  function setStatus(text: string): void {
    elements.status.textContent = text;
  }

  async function run(work: () => Promise<string>): Promise<void> {
    if (busy) return;
    busy = true;
    elements.root.classList.add("is-busy");
    try {
      setStatus(await work());
    } finally {
      busy = false;
      elements.root.classList.remove("is-busy");
      // The answer is drawn now, whatever had focus when it was asked.
      if (elements.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur?.();
      draw();
    }
  }

  function homeSelect(animal: LivestockAnimal, current: readonly LivestockHome[], occupancy: Map<string, number>, canManage: boolean): HTMLSelectElement {
    const select = element("select", "livestock-row__home");
    select.setAttribute("aria-label", `Where ${animal.name} lives`);
    select.disabled = !canManage;
    const known = current.some((entry) => entry.id === animal.homeId);
    for (const entry of current) {
      const taken = occupancy.get(entry.id) ?? 0;
      const mine = entry.id === animal.homeId;
      const option = element("option", "", `${entry.title} · ${taken}/${entry.slots}`);
      option.value = entry.id;
      option.disabled = !mine && taken >= entry.slots;
      option.selected = mine;
      select.append(option);
    }
    const field = element("option", "", known ? "Out on the field" : "Out on the field · needs a home");
    field.value = FIELD;
    field.selected = !known;
    select.append(field);
    select.addEventListener("change", () => {
      const homeId = select.value || null;
      void run(() => actions.move(animal.id, homeId));
    });
    return select;
  }

  function row(animal: LivestockAnimal, current: LivestockPanelView, occupancy: Map<string, number>): HTMLElement {
    const summary = livestockSummary(animal, current.clockMinutes);
    const card = element("article", `livestock-row livestock-row--${summary.stage}`);
    card.dataset.animalId = animal.id;
    const head = element("header", "livestock-row__head");
    const name = element("input", "livestock-row__name");
    name.value = animal.name;
    name.maxLength = LIVESTOCK_NAME_MAX;
    name.disabled = !current.canManage;
    name.setAttribute("aria-label", "Name");
    name.addEventListener("change", () => {
      const next = name.value.trim();
      if (next && next !== animal.name) void run(() => actions.rename(animal.id, next));
    });
    // Letters typed into the name are the name's, never the farm's movement keys.
    name.addEventListener("keydown", (event) => event.stopPropagation());
    const grade = element("span", "livestock-row__grade", summary.stars);
    grade.title = `Grade ${summary.grade} of 5, from its four stats`;
    head.append(name, grade);
    const line = element("p", "livestock-row__line",
      `${summary.kind} ${summary.gender} · ${summary.coat}${summary.stage === "young" ? ` · ${summary.grownPercent}% grown` : ""}`);
    // Care: how hungry, and each good it is working up to (only once grown).
    const need = livestockNeed(animal, animal.care, current.clockMinutes);
    const care = element("div", `livestock-care livestock-care--${need.stage}`);
    const hunger = element("span", "livestock-care__bar");
    const hungerFill = element("i", "livestock-care__fill");
    hungerFill.style.width = `${Math.round(animal.care.hunger)}%`;
    hunger.append(hungerFill);
    care.append(element("span", "livestock-care__label", `${need.label} · ${Math.round(animal.care.hunger)}%`), hunger);
    for (const good of goodsState(animal, animal.care)) {
      const words = summary.stage === "young"
        ? `${good.product.title} · once grown`
        : good.ready ? `${good.product.title} ready · ${QUALITY_TITLES[good.quality]} · E to collect` : `${good.product.title} · ${Math.floor(good.fraction * 100)}%`;
      care.append(element("span", `livestock-good${good.ready ? " is-ready" : ""}`, words));
    }
    const stats = element("dl", "livestock-row__stats");
    for (const stat of summary.stats) {
      const cell = element("div", "livestock-stat");
      const bar = element("span", "livestock-stat__bar");
      const fill = element("i", "livestock-stat__fill");
      fill.style.width = `${stat.value}%`;
      bar.append(fill);
      cell.append(element("dt", "", stat.title), element("dd", "", String(stat.value)), bar);
      stats.append(cell);
    }
    card.append(head, line, care, stats, homeSelect(animal, current.homes, occupancy, current.canManage));
    return card;
  }

  function draw(): void {
    if (!view) return;
    const occupancy = homeOccupancy(view.homes, view.herd);
    const places = totalLivestockSlots(view.homes);
    elements.count.textContent = `${view.herd.length} head · ${places} ${places === 1 ? "place" : "places"}`;
    elements.list.replaceChildren();
    if (view.note) {
      elements.list.append(element("p", "livestock-empty", view.note));
      return;
    }
    if (!view.herd.length) {
      elements.list.append(element("p", "livestock-empty", places
        ? "No livestock yet. Buy a lamb, a piglet, a calf or a cria from the Livestock Dealer in the Market Square."
        : "No livestock yet, and nowhere to keep them. Build a pen (or use the barn floor or a stable's stalls) first, then visit the Livestock Dealer in the Market Square."));
      return;
    }
    for (const animal of view.herd) elements.list.append(row(animal, view, occupancy));
  }

  function setOpen(next: boolean): void {
    if (next === open) return;
    if (next) options.beforeOpen?.();
    open = next;
    elements.root.hidden = !open;
    elements.openButton.setAttribute("aria-pressed", String(open));
    if (open) draw();
    else options.onClose?.();
  }

  elements.openButton.addEventListener("click", () => setOpen(!open));
  elements.closeButton.addEventListener("click", () => setOpen(false));

  return Object.freeze({
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    render(next) {
      view = next;
      // A select mid-choice is not rebuilt under the player's hand.
      if (open && !elements.root.contains(document.activeElement)) draw();
    },
    setStatus,
  });
}
