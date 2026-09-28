// A Market counter, on screen: the goods the player holds that this stall buys
// (the Produce Merchant's crops and fruit, the Kitchen's dishes), each shown as
// its model, a count to sell for each, the total, and one Sell button. The
// maths is the pure `farm-market-prices.mts`; the sale itself is whatever
// `sell` the page injects (the server call). The panel never decides what was
// sold — it shows the stock the page hands back after the server answers.

import { MAX_SALE_QUANTITY, SELLABLE_PRODUCE, saleItems, saleLines, saleTotal, type SaleLine, type Sellable } from "./farm-market-prices.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
  total: HTMLElement;
  sellButton: HTMLButtonElement;
  pickAllButton: HTMLButtonElement;
  status: HTMLElement;
}>;

export type SaleOutcome = Readonly<{ ok: boolean; message: string; produce?: Readonly<Record<string, number>> }>;

type Options = Readonly<{
  sell: (items: Record<string, number>) => Promise<SaleOutcome>;
  /** A line's portrait, by its item key (farm-item-thumbnails.mts). */
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  /** What this counter buys; the Produce Merchant's list by default. */
  sellable?: readonly Sellable[];
  /** What the counter says when the player holds nothing it buys. */
  emptyNote?: string;
  /** Today's price for a line, when this counter pays by the day (the Produce Merchant). */
  priceOf?: (id: string) => number;
  /** A word beside a line's price (today's move). */
  lineNote?: (id: string) => string;
  /** Called after every draw (the page keeps the day's turnover beside it). */
  onRender?: () => void;
  onClose?: () => void;
}>;

export type MarketSalePanel = Readonly<{
  open: (produce: Readonly<Record<string, number>>, note?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  /** Draw the counter again (the day's prices arrived or turned over), keeping what was picked. */
  repaint: () => void;
}>;

export function createMarketSalePanel(elements: Elements, options: Options): MarketSalePanel {
  const sellable = options.sellable ?? SELLABLE_PRODUCE;
  let produce: Readonly<Record<string, number>> = {};
  let picked: Record<string, number> = {};
  let busy = false;

  const isOpen = (): boolean => !elements.root.hidden;

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  function pick(cropId: string, quantity: number): void {
    picked = { ...picked, [cropId]: Math.max(0, Math.min(MAX_SALE_QUANTITY, Math.floor(quantity) || 0)) };
    render();
  }

  function row(line: SaleLine): HTMLElement {
    const item = document.createElement("li");
    item.className = "sale-row";
    item.dataset.cropId = line.cropId;
    const portrait = document.createElement("span");
    portrait.className = "seed-card__image";
    portrait.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; portrait.replaceChildren(image); };
    const ready = options.thumbnail?.(line.itemKey, show);
    if (ready) show(ready);
    const label = document.createElement("div");
    label.className = "sale-row__label";
    const title = document.createElement("strong");
    title.textContent = line.title;
    const held = document.createElement("small");
    const move = options.lineNote?.(line.cropId) ?? "";
    held.textContent = `You have ${line.held} · ${line.price} tickets each${move ? ` · ${move}` : ""}`;
    label.replaceChildren(title, held);
    const stepper = document.createElement("div");
    stepper.className = "sale-row__stepper";
    const less = document.createElement("button");
    less.type = "button";
    less.textContent = "−";
    less.setAttribute("aria-label", `One fewer ${line.title}`);
    less.disabled = busy || line.quantity <= 0;
    less.addEventListener("click", () => pick(line.cropId, line.quantity - 1));
    const count = document.createElement("input");
    count.type = "number";
    count.min = "0";
    count.max = String(Math.min(line.held, MAX_SALE_QUANTITY));
    count.value = String(line.quantity);
    count.disabled = busy;
    count.setAttribute("aria-label", `${line.title} to sell`);
    count.addEventListener("change", () => pick(line.cropId, Number(count.value)));
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "+";
    more.setAttribute("aria-label", `One more ${line.title}`);
    more.disabled = busy || line.quantity >= Math.min(line.held, MAX_SALE_QUANTITY);
    more.addEventListener("click", () => pick(line.cropId, line.quantity + 1));
    const all = document.createElement("button");
    all.type = "button";
    all.className = "sale-row__all";
    all.textContent = "All";
    all.disabled = busy || line.quantity >= Math.min(line.held, MAX_SALE_QUANTITY);
    all.addEventListener("click", () => pick(line.cropId, line.held));
    stepper.replaceChildren(less, count, more, all);
    const subtotal = document.createElement("strong");
    subtotal.className = "sale-row__subtotal";
    subtotal.textContent = line.quantity ? `${line.quantity * line.price}` : "—";
    item.replaceChildren(portrait, label, stepper, subtotal);
    return item;
  }

  function render(): void {
    const lines = saleLines(produce, picked, sellable, options.priceOf);
    if (!lines.length) {
      const empty = document.createElement("li");
      empty.className = "sale-empty";
      empty.textContent = options.emptyNote ?? "Your harvest basket is empty. Grow something on the farm and bring it back.";
      elements.list.replaceChildren(empty);
    } else {
      elements.list.replaceChildren(...lines.map(row));
    }
    const total = saleTotal(lines);
    elements.total.textContent = total.toLocaleString();
    elements.sellButton.disabled = busy || total <= 0;
    elements.sellButton.textContent = busy ? "Selling…" : total > 0 ? `Sell for ${total.toLocaleString()} tickets` : "Pick something to sell";
    elements.pickAllButton.disabled = busy || !lines.length;
    options.onRender?.();
  }

  async function sell(): Promise<void> {
    const items = saleItems(saleLines(produce, picked, sellable, options.priceOf));
    if (busy || !Object.keys(items).length) return;
    busy = true;
    render();
    const outcome = await options.sell(items).catch((): SaleOutcome => ({ ok: false, message: "The merchant could not be reached. Nothing was sold." }));
    busy = false;
    if (outcome.produce) produce = outcome.produce;
    if (outcome.ok) picked = {};
    elements.status.textContent = outcome.message;
    render();
  }

  function open(next: Readonly<{ [cropId: string]: number }>, note = ""): void {
    produce = next;
    picked = {};
    elements.status.textContent = note;
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render();
    elements.sellButton.focus();
  }

  elements.closeButton.addEventListener("click", close);
  elements.sellButton.addEventListener("click", () => void sell());
  elements.pickAllButton.addEventListener("click", () => {
    picked = Object.fromEntries(saleLines(produce, {}, sellable, options.priceOf).map((line) => [line.cropId, line.held]));
    render();
  });
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen, repaint: () => { if (isOpen()) render(); } });
}
