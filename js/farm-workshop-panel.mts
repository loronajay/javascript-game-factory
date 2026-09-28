// The pattern book, on screen: opened with E at a Carpenter's Workbench. Every
// pattern is a card showing the piece itself (its model, in the finish of
// three stars) and whether it can be made now; the chosen one opens into the
// planks it takes (each shown as the real planks, what the farm holds against
// what it takes), any tickets a fine piece asks for, its steps, its Carpentry
// XP, what the Sawmill pays for it at one, two and three stars, and how many
// the farm has. Make starts the carpentry games — the panel never makes
// anything itself; it hands the pattern to the `make` the page injects.

import { CRAFT_STEP_TITLES, PATTERN_CATALOG, findPattern } from "./farm-catalog/carpentry.mjs";
import { patternAvailability, patternBook, shelfEntries, type PatternAvailability } from "./farm-workshop.mjs";
import { piecePrice } from "./farm-market-prices.mjs";
import type { FarmInventory } from "./farm-crops.mjs";
import type { FarmDecorRow } from "./farm-layout.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  level: HTMLElement;
  list: HTMLElement;
  detail: HTMLElement;
  status: HTMLElement;
}>;

type Options = Readonly<{
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  /** Start making a pattern; the panel closes as the games begin. */
  make: (itemId: string) => void;
  /** Whether this farm can make furniture at all (account farms; the server makes every piece). */
  canMake: () => boolean;
  onClose?: () => void;
}>;

export type WorkshopState = Readonly<{ inventory: FarmInventory; decor: readonly FarmDecorRow[]; level: number }>;

export type WorkshopPanel = Readonly<{
  open: (state: WorkshopState, note?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  render: (state: WorkshopState) => void;
}>;

function node(tag: string, className = "", text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createWorkshopPanel(elements: Elements, options: Options): WorkshopPanel {
  let state: WorkshopState | null = null;
  let selected = PATTERN_CATALOG[0]!.id;

  const isOpen = (): boolean => !elements.root.hidden;

  function portrait(itemKey: string, className: string): HTMLElement {
    const frame = node("span", className);
    frame.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; frame.replaceChildren(image); };
    const ready = options.thumbnail?.(itemKey, show);
    if (ready) show(ready);
    return frame;
  }

  function owned(itemId: string): Readonly<{ onShelf: number; placed: number }> {
    const entry = shelfEntries(state!.inventory.furniture, state!.decor).find((candidate) => candidate.pattern.id === itemId);
    return { onShelf: entry?.onShelf ?? 0, placed: entry?.placed ?? 0 };
  }

  function stateLine(entry: PatternAvailability): string {
    if (entry.state === "locked") return `Learn at Carpentry ${entry.pattern.minLevel}`;
    if (entry.state === "short") {
      const missing = entry.lines.filter((line) => line.short > 0);
      return missing.length === 1 ? `Need ${missing[0]!.short} more ${missing[0]!.title}` : "Need more planks";
    }
    const have = owned(entry.pattern.id);
    return have.onShelf + have.placed ? `Ready · ${have.onShelf + have.placed} made` : "Ready to make";
  }

  function card(entry: PatternAvailability): HTMLElement {
    const button = node("button", "recipe-card") as HTMLButtonElement;
    button.type = "button";
    button.dataset.patternId = entry.pattern.id;
    button.dataset.state = entry.state;
    button.setAttribute("aria-pressed", String(entry.pattern.id === selected));
    const text = node("span", "recipe-card__text");
    text.append(node("strong", "", entry.pattern.title), node("small", "", stateLine(entry)));
    button.append(portrait(`piece:${entry.pattern.id}@3`, "recipe-card__dish"), text);
    button.addEventListener("click", () => {
      selected = entry.pattern.id;
      render(state!);
    });
    return button;
  }

  function detail(entry: PatternAvailability): HTMLElement {
    const pattern = entry.pattern;
    const pane = node("div", "recipe-detail");
    const head = node("div", "recipe-detail__head");
    const words = node("div", "recipe-detail__words");
    words.append(
      node("span", "eyebrow", pattern.minLevel > 1 ? `CARPENTRY ${pattern.minLevel}` : "FIRST PATTERNS"),
      node("strong", "recipe-detail__title", pattern.title),
      node("p", "recipe-detail__blurb", pattern.blurb),
    );
    head.append(portrait(`piece:${pattern.id}@3`, "recipe-detail__dish"), words);
    const needs = node("ul", "recipe-ingredients");
    for (const line of entry.lines) {
      const item = node("li", line.short > 0 ? "is-short" : "");
      item.append(portrait(`plank:${line.id}`, "seed-card__image"), node("span", "", `${line.need} × ${line.title}`), node("small", "", `you have ${line.held}`));
      needs.append(item);
    }
    if (pattern.tickets) {
      const item = node("li", "");
      item.append(node("span", "seed-card__image recipe-ingredients__tickets", "🎟"), node("span", "", `${pattern.tickets} tickets`), node("small", "", "fittings from the city"));
      needs.append(item);
    }
    const method = node("ol", "recipe-steps");
    pattern.steps.forEach((kind) => method.append(node("li", `recipe-step recipe-step--${kind}`, CRAFT_STEP_TITLES[kind])));
    const facts = node("dl", "recipe-facts");
    const fact = (term: string, value: string) => facts.append(node("dt", "", term), node("dd", "", value));
    const have = owned(pattern.id);
    fact("Carpentry XP", options.canMake() ? `+${pattern.xp}` : "Sign in to earn");
    fact("The Sawmill pays", `★ ${piecePrice(pattern.id, 1)} · ★★ ${piecePrice(pattern.id, 2)} · ★★★ ${piecePrice(pattern.id, 3)}`);
    fact("Yours", have.onShelf + have.placed ? `${have.onShelf} on the shelf · ${have.placed} placed` : "none yet");
    const make = node("button", "farm-button farm-button--accent recipe-detail__cook") as HTMLButtonElement;
    make.type = "button";
    const ready = entry.state === "ready" && options.canMake();
    make.disabled = !ready;
    make.textContent = !options.canMake() ? "Sign in to make furniture" : entry.state === "ready" ? `Make a ${pattern.title}` : stateLine(entry);
    make.addEventListener("click", () => {
      if (!ready) return;
      close();
      options.make(pattern.id);
    });
    pane.append(head, node("h4", "pets-section__title", "Materials"), needs, node("h4", "pets-section__title", "Method"), method, facts, make);
    return pane;
  }

  function render(next: WorkshopState): void {
    state = next;
    elements.level.textContent = `Carpentry ${next.level}`;
    elements.list.replaceChildren(...patternBook(next.inventory.planks, next.level).map(card));
    const pattern = findPattern(selected) ?? PATTERN_CATALOG[0]!;
    elements.detail.replaceChildren(detail(patternAvailability(pattern, next.inventory.planks, next.level)));
  }

  function open(next: WorkshopState, note = ""): void {
    // Open on the first pattern that can be made right now, if the last one cannot.
    const book = patternBook(next.inventory.planks, next.level);
    if (book.find((entry) => entry.pattern.id === selected)?.state !== "ready") selected = book.find((entry) => entry.state === "ready")?.pattern.id ?? selected;
    elements.status.textContent = note;
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render(next);
    elements.detail.querySelector<HTMLButtonElement>(".recipe-detail__cook")?.focus();
  }

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen, render });
}
