// The Livestock panel (L): the herd, each animal's grade and stats, and which
// home it lives in.
//
// DOM only — no THREE, no storage, no fetching. It is handed the herd, the
// homes and the farm clock to draw, and three actions (move, rename, breed)
// that go to the server through the controller; it redraws from what it is
// handed back. Breeding (Phase 5) is asked from a grown female's row: the males
// of her kind are listed, and one the shared rule refuses is shown with why.
// Buying is not here: young stock come from the Livestock Dealer in the Market
// Square, which is where the note at the foot of the panel sends the player.

import { livestockGrade, livestockSummary, gradeStars, type LivestockAnimal } from "./farm-livestock.mjs";
import { BREEDING_MIN_LEVEL, BREEDING_REFUSAL_WORDS, breedingRefusal, freePlacesForYoung, pregnancyView } from "./farm-livestock-breeding.mjs";
import { LIVESTOCK_STATS, findLivestockSpecies, type LivestockStats } from "./farm-catalog/livestock.mjs";
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
  breed: (motherId: string, sireId: string) => Promise<string>;
}>;

export type LivestockPanelView = Readonly<{
  herd: readonly LivestockAnimal[];
  homes: readonly LivestockHome[];
  clockMinutes: number;
  /** The owner's Husbandry level: breeding opens at BREEDING_MIN_LEVEL. */
  husbandryLevel: number;
  /** True where care reaches the server (the owner's account farm): breeding is care. */
  canBreed: boolean;
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

  /** The young one's grade if it came out at the parents' average: a guide, not a promise. */
  function expectedStars(mother: LivestockAnimal, sire: LivestockAnimal): string {
    const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, Math.round((mother.stats[key] + sire.stats[key]) / 2)])) as LivestockStats;
    return gradeStars(livestockGrade(stats));
  }

  /** A grown female's breeding line: expecting, resting, or whom she could be paired with. */
  function breeding(animal: LivestockAnimal, current: LivestockPanelView, stage: string): HTMLElement | null {
    const carrying = pregnancyView(animal, current.clockMinutes);
    const species = findLivestockSpecies(animal.speciesId);
    if (carrying?.stage === "expecting") {
      return element("p", "livestock-breed livestock-breed--expecting", `Expecting by ${carrying.sireName || "?"} · ${carrying.percent}% · only well-fed days count`);
    }
    if (carrying?.stage === "due") {
      return element("p", "livestock-breed livestock-breed--due", `Due by ${carrying.sireName || "?"} — the ${species?.youngTitle.toLowerCase() ?? "young one"} waits for a free place`);
    }
    if (carrying?.stage === "resting") return element("p", "livestock-breed", `Resting after her birth · ${carrying.hours} h`);
    if (animal.gender !== "female" || stage !== "adult" || !current.canBreed) return null;
    if (current.husbandryLevel < BREEDING_MIN_LEVEL) return element("p", "livestock-breed", BREEDING_REFUSAL_WORDS.level_too_low);
    const context = { clock: current.clockMinutes, level: current.husbandryLevel, freePlaces: freePlacesForYoung(current.homes, current.herd) };
    const males = current.herd.filter((other) => other.speciesId === animal.speciesId && other.gender === "male");
    if (!males.length) return element("p", "livestock-breed", `No ${species?.title.toLowerCase() ?? "male"} ♂ of her kind on the farm to pair her with.`);
    const block = element("div", "livestock-breed livestock-breed--pick");
    const select = element("select", "livestock-breed__mate");
    select.setAttribute("aria-label", `Pair ${animal.name} with`);
    let firstOpen = "";
    let firstReason = "";
    for (const male of males) {
      const refusal = breedingRefusal(animal, male, context);
      const option = element("option", "", `${male.name} ${gradeStars(livestockGrade(male.stats))} · young ≈ ${expectedStars(animal, male)}${refusal ? ` — ${BREEDING_REFUSAL_WORDS[refusal]}` : ""}`);
      option.value = male.id;
      option.disabled = Boolean(refusal);
      if (!refusal && !firstOpen) firstOpen = male.id;
      if (refusal && !firstReason) firstReason = BREEDING_REFUSAL_WORDS[refusal];
      select.append(option);
    }
    select.value = firstOpen;
    const button = element("button", "livestock-breed__go", "Breed");
    button.type = "button";
    button.disabled = !firstOpen;
    button.title = firstOpen ? "Pair them: she carries the young one" : firstReason;
    button.addEventListener("click", () => {
      if (select.value) void run(() => actions.breed(animal.id, select.value));
    });
    block.append(element("span", "livestock-breed__label", "Pair with"), select, button);
    return block;
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
    const lineage = animal.parents ? element("p", "livestock-row__lineage", `Born here · out of ${animal.parents.motherName} by ${animal.parents.sireName}`) : null;
    const pairing = breeding(animal, current, summary.stage);
    card.append(head, line, ...(lineage ? [lineage] : []), care, ...(pairing ? [pairing] : []), stats, homeSelect(animal, current.homes, occupancy, current.canManage));
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
