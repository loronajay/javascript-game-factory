// The Butcher's counter, on screen: one card per animal in the player's herd,
// with what Otto would make of it — how many cuts, at what grade, roughly what
// they fetch and the Husbandry it pays — and a Send that asks twice, because an
// animal that goes to the Butcher does not come back.
//
// DOM only. The page hands in the herd, the farm's stored clock and a
// `butcher` that is the server call; the numbers on a card are the page's copy
// of the rule (farm-livestock-butcher.mts), and the SERVER decides the real
// cut (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 4). A young one's card says
// when it will be grown and cannot be sent.

import { findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { adultAgeDays } from "./farm-livestock-care.mjs";
import { butcherQuote } from "./farm-livestock-butcher.mjs";
import { gradedTitle } from "./farm-quality.mjs";
import { livestockSummary, type LivestockAnimal } from "./farm-livestock.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  room: HTMLElement;
  list: HTMLElement;
  status: HTMLElement;
}>;

export type ButcherOutcome = Readonly<{ ok: boolean; message: string }>;

type Options = Readonly<{
  butcher: (animalId: string) => Promise<ButcherOutcome>;
  herd: () => readonly LivestockAnimal[];
  /** The farm's stored clock: the Market Square has no running one. */
  clock: () => number;
  thumbnail?: (speciesId: string, onReady: (url: string) => void) => string | null;
  onClose?: () => void;
}>;

export type ButcherPanel = Readonly<{
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  repaint: () => void;
}>;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const days = (minutes: number): string => {
  const value = Math.max(0.1, Math.round((minutes / DAY_MINUTES) * 10) / 10);
  return `${value} farm ${value === 1 ? "day" : "days"}`;
};

/** A card's lines, worked out from the rule: what it would give, or when it can go. */
export function butcherCardLines(animal: LivestockAnimal, clock: number): Readonly<{ ready: boolean; offer: string; note: string }> {
  const quote = butcherQuote(animal, clock);
  const species = findLivestockSpecies(animal.speciesId);
  if (!quote || !species) return { ready: false, offer: "", note: "" };
  if (!quote.grown) {
    const grownAt = animal.bornAt + adultAgeDays(species, animal.stats) * DAY_MINUTES;
    return { ready: false, offer: `Still young — Otto won't take it yet.`, note: `Grown in about ${days(grownAt - clock)} on the farm.` };
  }
  const offer = `${quote.cuts} × ${gradedTitle(quote.meat.title, quote.quality)} · worth about ${quote.value.toLocaleString()} tickets · +${quote.xp} Husbandry XP`;
  const note = quote.prime >= 1
    ? "At its prime: the most cuts it will ever give."
    : `${Math.round(quote.prime * 100)}% of the way to its prime — more cuts if you keep it a little longer.`;
  return { ready: true, offer, note };
}

export function createButcherPanel(elements: Elements, options: Options): ButcherPanel {
  let busy = false;
  /** The card asked once: the next press on it sends. */
  let confirming = "";
  const isOpen = (): boolean => !elements.root.hidden;

  function close(): void {
    if (!isOpen()) return;
    confirming = "";
    elements.root.hidden = true;
    options.onClose?.();
  }

  async function send(animalId: string): Promise<void> {
    if (busy) return;
    if (confirming !== animalId) {
      confirming = animalId;
      render();
      return;
    }
    busy = true;
    confirming = "";
    render();
    const outcome = await options.butcher(animalId).catch((): ButcherOutcome => ({ ok: false, message: "Otto could not be reached. Nothing was sent." }));
    busy = false;
    elements.status.textContent = outcome.message;
    render();
  }

  function picture(animal: LivestockAnimal): HTMLElement {
    const frame = element("span", "dealer-card__picture");
    frame.setAttribute("aria-hidden", "true");
    frame.append(element("span", "dealer-card__letter", animal.name[0] ?? ""));
    const show = (url: string): void => {
      const image = element("img", "");
      image.src = url;
      image.alt = "";
      frame.replaceChildren(image);
    };
    const ready = options.thumbnail?.(animal.speciesId, show);
    if (ready) show(ready);
    return frame;
  }

  function render(): void {
    const herd = options.herd();
    const clock = options.clock();
    elements.room.textContent = herd.length
      ? `${herd.length} head on your farm · ${herd.filter((animal) => butcherQuote(animal, clock)?.grown).length} grown`
      : "You have no livestock. Hollis the Livestock Dealer sells young stock across the square.";
    elements.list.replaceChildren();
    for (const animal of herd) {
      const summary = livestockSummary(animal, clock);
      const lines = butcherCardLines(animal, clock);
      const card = element("li", "dealer-card butcher-card");
      card.dataset.animalId = animal.id;
      card.classList.toggle("is-locked", !lines.ready);
      const words = element("div", "dealer-card__words");
      words.append(
        element("strong", "", `${summary.title} · ${summary.kind} ${summary.gender} ${summary.stars}`),
        element("small", "", lines.offer),
        element("small", "dealer-card__grow", lines.note),
      );
      const asking = confirming === animal.id;
      const button = element("button", `farm-button ${asking ? "farm-button--danger" : "farm-button--accent"} dealer-card__buy`, asking ? "Confirm · for good" : "Send to Otto");
      button.type = "button";
      button.disabled = busy || !lines.ready;
      button.setAttribute("aria-label", asking ? `Confirm: send ${animal.name} to the Butcher. This cannot be undone.` : `Send ${animal.name} to the Butcher`);
      button.title = lines.ready ? (asking ? `${animal.name} will leave your farm for good.` : `Send ${animal.name} to the Butcher`) : "Too young for the Butcher";
      button.addEventListener("click", () => void send(animal.id));
      card.append(picture(animal), words, button);
      elements.list.append(card);
    }
  }

  elements.closeButton.addEventListener("click", close);

  return Object.freeze({
    open() {
      confirming = "";
      elements.status.textContent = "";
      elements.root.hidden = false;
      render();
    },
    close,
    isOpen,
    repaint: () => { if (isOpen()) render(); },
  });
}
