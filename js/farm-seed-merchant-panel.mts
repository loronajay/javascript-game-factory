// The Seed Merchant's counter, on screen: every crop's seed with today's price,
// the day's specials first and marked down, what the player already holds,
// and a Buy 1 / Buy 5 on each. The shelf is the pure `seedShelf`
// (farm-market-day.mts); the purchase is whatever `buy` the page injects (the
// server call, which charges the day's price and refuses a day that has
// turned over). The panel never decides a price or a count — it redraws from
// what the page hands back after the server answers.

import { seedShelf, turnoverNote, type MarketDay, type SeedShelfLine } from "./farm-market-day.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
  turnover: HTMLElement;
  status: HTMLElement;
}>;

export type SeedPurchaseOutcome = Readonly<{ ok: boolean; message: string; seeds?: Readonly<Record<string, number>> }>;

type Options = Readonly<{
  buy: (cropId: string, quantity: number) => Promise<SeedPurchaseOutcome>;
  market: () => MarketDay | null;
  price?: (basePrice: number) => number;
  /** A crop's portrait (farm-crop-thumbnails.mts): the plant it grows into. */
  thumbnail?: (cropId: string, onReady: (url: string) => void) => string | null;
  onClose?: () => void;
}>;

export type SeedMerchantPanel = Readonly<{
  open: (seeds: Readonly<Record<string, number>>) => void;
  close: () => void;
  isOpen: () => boolean;
  repaint: () => void;
}>;

/** A stack of seeds caps at 99, like every stack. */
const MAX_HELD = 99;

export function createSeedMerchantPanel(elements: Elements, options: Options): SeedMerchantPanel {
  let seeds: Readonly<Record<string, number>> = {};
  let busy = false;

  const isOpen = (): boolean => !elements.root.hidden;

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  async function buy(cropId: string, quantity: number): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    const outcome = await options.buy(cropId, quantity).catch((): SeedPurchaseOutcome => ({ ok: false, message: "The Seed Merchant could not be reached. Nothing was bought." }));
    busy = false;
    if (outcome.seeds) seeds = outcome.seeds;
    elements.status.textContent = outcome.message;
    render();
  }

  function buyButton(line: SeedShelfLine, quantity: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = quantity > 1 ? "farm-button farm-button--accent" : "farm-button";
    const price = options.price?.(line.price * quantity) ?? line.price * quantity;
    button.textContent = `Buy ${quantity} · ${price}`;
    button.disabled = busy || line.held + quantity > MAX_HELD;
    button.setAttribute("aria-label", `Buy ${quantity} ${line.title} seed${quantity === 1 ? "" : "s"} for ${price} tickets`);
    button.addEventListener("click", () => void buy(line.cropId, quantity));
    return button;
  }

  function row(line: SeedShelfLine): HTMLElement {
    const item = document.createElement("li");
    item.className = "sale-row seed-row";
    item.dataset.cropId = line.cropId;
    item.classList.toggle("is-special", line.special);
    const portrait = document.createElement("span");
    portrait.className = "seed-card__image";
    portrait.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; portrait.replaceChildren(image); };
    const ready = options.thumbnail?.(line.cropId, show);
    if (ready) show(ready);
    const label = document.createElement("div");
    label.className = "sale-row__label";
    const title = document.createElement("strong");
    title.textContent = `${line.title} seeds`;
    if (line.special) {
      const tag = document.createElement("em");
      tag.className = "seed-row__special";
      tag.textContent = "Special";
      title.append(" ", tag);
    }
    const detail = document.createElement("small");
    const price = options.price?.(line.price) ?? line.price;
    const standing = options.price?.(line.standing) ?? line.standing;
    detail.textContent = line.special
      ? `You have ${line.held} · ${price} tickets each (usually ${standing})`
      : `You have ${line.held} · ${price} tickets each`;
    label.replaceChildren(title, detail);
    const actions = document.createElement("div");
    actions.className = "seed-row__actions";
    actions.replaceChildren(buyButton(line, 1), buyButton(line, 5));
    item.replaceChildren(portrait, label, actions);
    return item;
  }

  function render(): void {
    const market = options.market();
    elements.list.replaceChildren(...seedShelf(market, seeds).map(row));
    elements.turnover.textContent = market ? `${turnoverNote(market, Date.now())} · specials change with them` : "Reading today's specials…";
  }

  function open(next: Readonly<Record<string, number>>): void {
    seeds = next;
    elements.status.textContent = "";
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render();
    elements.closeButton.focus();
  }

  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen, repaint: () => { if (isOpen()) render(); } });
}
