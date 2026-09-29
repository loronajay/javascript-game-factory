// The Livestock panel (L): the herd, each animal's grade and stats, and which
// home it lives in.
//
// DOM only — no THREE, no storage, no fetching. It is handed the herd, the
// homes and the farm clock to draw, and the actions (move, rename, breed,
// feed, buy feed) that go to the server through the controller; it redraws
// from what it is handed back. Breeding (Phase 5) is asked from a grown female's row: the males
// of her kind are listed, and one the shared rule refuses is shown with why.
// Buying animals is not here: young stock come from the Livestock Dealer in the
// Market Square, which is where the note at the foot of the panel sends the
// player. Their FEED is here, at the head of the list (the Feed bin): what the
// herd eats, how much is held, a Buy, and one button that feeds everyone with
// room for a serving — so hunger always has an answer in the panel that shows it.

import { livestockGrade, livestockSummary, gradeStars, type LivestockAnimal } from "./farm-livestock.mjs";
import { BREEDING_MIN_LEVEL, BREEDING_REFUSAL_WORDS, breedingRefusal, freePlacesForYoung, pregnancyView } from "./farm-livestock-breeding.mjs";
import { LIVESTOCK_FEEDS, LIVESTOCK_STATS, findLivestockSpecies, type LivestockStats } from "./farm-catalog/livestock.mjs";
import { homeOccupancy, homeTakes, totalLivestockSlots, type LivestockHome } from "./farm-livestock-housing.mjs";
import { LIVESTOCK_NAME_MAX } from "./farm-catalog/livestock.mjs";
import { FULL, SERVING, goodsState, livestockNeed, wantsFood } from "./farm-livestock-care.mjs";
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
  /** One serving for this animal, from its feed or a crop it likes. */
  feed: (animalId: string) => Promise<string>;
  /** One serving for every animal with room for a whole one. */
  feedHerd: () => Promise<string>;
  /** Tickets for feed, into the farm's supplies. */
  buyFeed: (itemId: string, quantity: number) => Promise<string>;
}>;

/** The Feed bin buys in these amounts (the supply route takes up to 20 at once). */
export const FEED_BUY_QUANTITIES = Object.freeze([5, 10] as const);
/** A stack holds this many. */
const STACK_MAX = 99;

/** Room for a whole serving: the Feed-the-herd button tops up only these, so no serving is wasted. */
export function wantsServing(hunger: number): boolean {
  return hunger <= FULL - SERVING;
}

export type LivestockPanelView = Readonly<{
  herd: readonly LivestockAnimal[];
  homes: readonly LivestockHome[];
  clockMinutes: number;
  /** The owner's Husbandry level: breeding opens at BREEDING_MIN_LEVEL. */
  husbandryLevel: number;
  /** True where care reaches the server (the owner's account farm): breeding and feeding are care. */
  canBreed: boolean;
  /** Feed held, by supply id (`food.hay`…). */
  supplies: Readonly<Record<string, number>>;
  /** What this animal would eat now, in words ("Hay ×4", "Corn"), or "" when nothing on the farm will do. */
  feedWords: (animal: LivestockAnimal) => string;
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
      const mine = entry.id === animal.homeId;
      // The coop takes chickens only: it is not offered to anything else.
      if (!mine && !homeTakes(entry, animal.speciesId)) continue;
      const taken = occupancy.get(entry.id) ?? 0;
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
    const context = { clock: current.clockMinutes, level: current.husbandryLevel, freePlaces: freePlacesForYoung(current.homes, current.herd, animal.speciesId) };
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

  /** The Feed bin: each feed the herd eats, how much is held, and a Buy; then one button that feeds the herd. */
  function feedBin(current: LivestockPanelView): HTMLElement {
    const bin = element("section", "livestock-feed");
    bin.setAttribute("aria-label", "Feed bin");
    const head = element("header", "livestock-feed__head");
    head.append(element("span", "livestock-feed__title", "Feed bin"));
    const hungry = current.herd.filter((animal) => wantsServing(animal.care.hunger));
    if (current.canBreed) {
      const all = element("button", "farm-button farm-button--accent livestock-feed__all", hungry.length ? `Feed the herd · ${hungry.length}` : "Everyone is fed");
      all.type = "button";
      all.disabled = !hungry.length;
      all.title = hungry.length ? `One serving each for the ${hungry.length === 1 ? "animal" : `${hungry.length} animals`} with room for one (${FULL - SERVING}% or less)` : "Nobody has room for a whole serving yet";
      all.addEventListener("click", () => void run(() => actions.feedHerd()));
      head.append(all);
    }
    bin.append(head);
    const list = element("ul", "livestock-feed__list");
    for (const feed of LIVESTOCK_FEEDS) {
      const eaters = [...new Set(current.herd.map((animal) => findLivestockSpecies(animal.speciesId)).filter((species) => species?.feeds.supply === feed.itemId).map((species) => species!.title.toLowerCase()))];
      // A feed nothing on the farm eats stays out of the way, unless some is already held.
      const held = Math.max(0, Math.floor(Number(current.supplies[feed.itemId]) || 0));
      if (!eaters.length && !held) continue;
      const line = element("li", `livestock-feed__row${eaters.length && !held ? " is-empty" : ""}`);
      const words = element("span", "livestock-feed__words");
      words.append(element("strong", "", `${feed.title} ×${held}`), element("small", "", eaters.length ? `for ${eaters.join(", ")}` : "nothing here eats it"));
      line.append(words);
      if (current.canManage) {
        for (const quantity of FEED_BUY_QUANTITIES) {
          const buy = element("button", "farm-button livestock-feed__buy", `Buy ${quantity} · ${(feed.price * quantity).toLocaleString()}`);
          buy.type = "button";
          buy.disabled = held + quantity > STACK_MAX;
          buy.title = buy.disabled ? `A stack holds ${STACK_MAX}` : `${quantity} ${feed.title} for ${(feed.price * quantity).toLocaleString()} tickets (${feed.price} each)`;
          buy.addEventListener("click", () => void run(() => actions.buyFeed(feed.itemId, quantity)));
          line.append(buy);
        }
      }
      list.append(line);
    }
    bin.append(list);
    bin.append(element("p", "livestock-feed__hint", `One serving fills ${SERVING}%. Each eats its own feed first, else a crop it likes from your basket. G at an animal feeds it too.`));
    return bin;
  }

  /** A name the player can see is editable: the field, and a pencil beside it. Enter keeps it, Escape puts it back. */
  function nameField(animal: LivestockAnimal, canManage: boolean): HTMLElement {
    const wrap = element("label", "livestock-row__naming");
    const name = element("input", "livestock-row__name");
    name.value = animal.name;
    name.maxLength = LIVESTOCK_NAME_MAX;
    name.disabled = !canManage;
    name.spellcheck = false;
    name.setAttribute("aria-label", `Name — rename ${animal.name}`);
    name.title = canManage ? "Click to rename · Enter to keep" : animal.name;
    name.addEventListener("change", () => {
      const next = name.value.trim();
      if (next && next !== animal.name) void run(() => actions.rename(animal.id, next));
      else name.value = animal.name;
    });
    // Letters typed into the name are the name's, never the farm's movement keys.
    name.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") name.blur();
      if (event.key === "Escape") {
        name.value = animal.name;
        name.blur();
      }
    });
    wrap.append(name);
    if (canManage) {
      // Inside the label, so a click on the pencil opens the field; the old name is selected to type over.
      wrap.append(element("span", "livestock-row__rename", "✎ Rename"));
      name.addEventListener("focus", () => name.select());
    }
    return wrap;
  }

  /** The row's feed line: what it would eat, and a Feed button while it has room. */
  function feedLine(animal: LivestockAnimal, current: LivestockPanelView): HTMLElement | null {
    if (!current.canBreed) return null;
    const species = findLivestockSpecies(animal.speciesId);
    const feedTitle = LIVESTOCK_FEEDS.find((feed) => feed.itemId === species?.feeds.supply)?.title ?? "feed";
    const food = current.feedWords(animal);
    const line = element("div", "livestock-row__feed");
    line.append(element("span", `livestock-row__eats${food ? "" : " is-empty"}`, food ? `Eats ${food}` : `Out of ${feedTitle} — buy some in the Feed bin above`));
    const button = element("button", "farm-button livestock-row__feed-go", "Feed");
    button.type = "button";
    const room = wantsFood(animal.care);
    button.disabled = !room || !food;
    button.title = !room ? "Full" : !food ? `No ${feedTitle} and no crop it likes` : `One serving of ${food}`;
    button.addEventListener("click", () => void run(() => actions.feed(animal.id)));
    line.append(button);
    return line;
  }

  function row(animal: LivestockAnimal, current: LivestockPanelView, occupancy: Map<string, number>): HTMLElement {
    const summary = livestockSummary(animal, current.clockMinutes);
    const card = element("article", `livestock-row livestock-row--${summary.stage}`);
    card.dataset.animalId = animal.id;
    const head = element("header", "livestock-row__head");
    const name = nameField(animal, current.canManage);
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
    const feeding = feedLine(animal, current);
    card.append(head, line, ...(lineage ? [lineage] : []), care, ...(feeding ? [feeding] : []), ...(pairing ? [pairing] : []), stats, homeSelect(animal, current.homes, occupancy, current.canManage));
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
    elements.list.append(feedBin(view));
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
