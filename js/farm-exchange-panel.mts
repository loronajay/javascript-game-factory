// The Exchange Board, on screen: two tabs. BUY lists what everyone else has up
// — the goods as their models, who is selling, how many are left, the price
// each and a quantity to take. SELL is the player's own side: a form to put
// something from their farm up (what, how many, at what price — with the band
// the board accepts and what they would take home after the Market's tenth)
// and every listing of theirs still holding goods, each with Take down.
//
// Every number shown is from the pure `farm-listings.mts`; every move is an
// injected call to the server, which holds the goods in escrow and decides.
// After each answer the panel reads the board again rather than guessing.

import {
  LISTING_FEE_RATE,
  MAX_LISTING_QUANTITY,
  listingPriceBand,
  listingProceeds,
  listingTimeLeft,
  type ListingBoard,
  type ListingView,
} from "./farm-listings.mjs";
import type { StockEntry } from "./farm-trade.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  buyTab: HTMLButtonElement;
  sellTab: HTMLButtonElement;
  buyView: HTMLElement;
  sellView: HTMLElement;
  limits: HTMLElement;
  status: HTMLElement;
}>;

export type ExchangeOutcome = Readonly<{ ok: boolean; message: string }>;
export type ListingDraft = Readonly<{ stack: StockEntry["stack"]; itemId: string; quantity: number; unitPrice: number }>;

type Options = Readonly<{
  load: () => Promise<ListingBoard | null>;
  buy: (listing: ListingView, quantity: number) => Promise<ExchangeOutcome>;
  list: (draft: ListingDraft) => Promise<ExchangeOutcome>;
  withdraw: (listing: ListingView) => Promise<ExchangeOutcome>;
  /** What this farm could put up right now (farm-trade.mts `stockEntries`). */
  stock: () => readonly StockEntry[];
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  onClose?: () => void;
}>;

export type ExchangePanel = Readonly<{ open: () => void; close: () => void; isOpen: () => boolean }>;

export function createExchangePanel(elements: Elements, options: Options): ExchangePanel {
  let board: ListingBoard | null = null;
  let tab: "buy" | "sell" = "buy";
  let busy = false;
  let loading = false;
  /** Quantities picked on the BUY side, by listing id. */
  let picked: Record<string, number> = {};
  /** The SELL form. */
  let draft = { key: "", quantity: 1, unitPrice: 0 };

  const isOpen = (): boolean => !elements.root.hidden;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  function portrait(itemKey: string): HTMLElement {
    const frame = node("span", "seed-card__image");
    frame.setAttribute("aria-hidden", "true");
    const image = node("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; frame.replaceChildren(image); };
    const ready = options.thumbnail?.(itemKey, show);
    if (ready) show(ready);
    return frame;
  }

  async function run(work: () => Promise<ExchangeOutcome>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    const outcome = await work().catch((): ExchangeOutcome => ({ ok: false, message: "The board could not be reached. Nothing moved." }));
    elements.status.textContent = outcome.message;
    if (outcome.ok) picked = {};
    busy = false;
    await reload();
  }

  async function reload(): Promise<void> {
    loading = true;
    render();
    board = await options.load().catch(() => null) ?? board;
    loading = false;
    render();
  }

  // ---------------------------------------------------------------- BUY

  function buyRow(listing: ListingView): HTMLElement {
    const item = node("li", "sale-row exchange-row");
    item.dataset.listingId = listing.id;
    const label = node("div", "sale-row__label");
    label.append(node("strong", "", listing.title), node("small", "", `${listing.sellerName} · ${listing.quantity} left · ${listing.unitPrice} tickets each · ${listingTimeLeft(listing, Date.now())}`));
    const quantity = Math.max(1, Math.min(listing.quantity, picked[listing.id] ?? 1));
    const stepper = node("div", "sale-row__stepper");
    const less = node("button", "", "−");
    less.type = "button";
    less.disabled = busy || quantity <= 1;
    less.addEventListener("click", () => { picked[listing.id] = quantity - 1; render(); });
    const count = node("input");
    count.type = "number";
    count.min = "1";
    count.max = String(listing.quantity);
    count.value = String(quantity);
    count.disabled = busy;
    count.setAttribute("aria-label", `${listing.title} to buy`);
    count.addEventListener("change", () => { picked[listing.id] = Math.max(1, Math.min(listing.quantity, Math.floor(Number(count.value)) || 1)); render(); });
    const more = node("button", "", "+");
    more.type = "button";
    more.disabled = busy || quantity >= listing.quantity;
    more.addEventListener("click", () => { picked[listing.id] = quantity + 1; render(); });
    stepper.append(less, count, more);
    const buy = node("button", "farm-button farm-button--accent", `Buy · ${(quantity * listing.unitPrice).toLocaleString()}`);
    buy.type = "button";
    buy.disabled = busy;
    buy.addEventListener("click", () => void run(() => options.buy(listing, quantity)));
    item.append(portrait(listing.itemKey), label, stepper, buy);
    return item;
  }

  function renderBuy(): void {
    const listings = board?.listings ?? [];
    if (!board) {
      elements.buyView.replaceChildren(node("li", "sale-empty", loading ? "Reading the board…" : "The board could not be read. Try again in a moment."));
      return;
    }
    if (!listings.length) {
      elements.buyView.replaceChildren(node("li", "sale-empty", "Nothing is up for sale right now. Be the first — put something up from the Sell tab."));
      return;
    }
    elements.buyView.replaceChildren(...listings.map(buyRow));
  }

  // ---------------------------------------------------------------- SELL

  function renderSell(): void {
    const stock = options.stock();
    const form = node("div", "exchange-form");
    form.append(node("h3", "pets-section__title", "Put something up"));
    if (!stock.length) {
      form.append(node("p", "sale-empty", "Your farm has nothing the board takes yet: produce, cooking, logs, planks or furniture off the shelf."));
    } else {
      const keyOf = (entry: StockEntry) => `${entry.stack}:${entry.id}`;
      const chosen = stock.find((entry) => keyOf(entry) === draft.key) ?? stock[0]!;
      const band = listingPriceBand(chosen.stack, chosen.id)!;
      if (keyOf(chosen) !== draft.key) draft = { key: keyOf(chosen), quantity: 1, unitPrice: Math.min(band.max, Math.max(band.min, Math.round(band.value))) };
      draft.quantity = Math.max(1, Math.min(draft.quantity, chosen.held, MAX_LISTING_QUANTITY));
      draft.unitPrice = Math.max(band.min, Math.min(band.max, draft.unitPrice));

      const what = node("select", "exchange-form__good");
      what.setAttribute("aria-label", "What to list");
      for (const entry of stock) {
        const option = node("option", "", `${entry.title} (you have ${entry.held})`);
        option.value = keyOf(entry);
        option.selected = keyOf(entry) === draft.key;
        what.append(option);
      }
      what.disabled = busy;
      what.addEventListener("change", () => { draft = { ...draft, key: what.value }; render(); });

      const field = (labelText: string, value: number, min: number, max: number, onChange: (next: number) => void): HTMLElement => {
        const wrap = node("label", "exchange-form__field");
        const input = node("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.value = String(value);
        input.disabled = busy;
        input.addEventListener("change", () => { onChange(Math.floor(Number(input.value)) || min); render(); });
        wrap.append(node("span", "", labelText), input);
        return wrap;
      };
      const row = node("div", "exchange-form__row");
      row.append(
        field("How many", draft.quantity, 1, Math.min(chosen.held, MAX_LISTING_QUANTITY), (next) => { draft.quantity = next; }),
        field("Tickets each", draft.unitPrice, band.min, band.max, (next) => { draft.unitPrice = next; }),
      );
      const total = draft.quantity * draft.unitPrice;
      const note = node("p", "sale-note exchange-form__note",
        `The board takes ${band.min}–${band.max} tickets each for these (the Market pays about ${Math.round(band.value)}). `
        + `Sold out, that is ${total.toLocaleString()}; the Market keeps a tenth, so you would take home ${listingProceeds(draft.unitPrice, draft.quantity).toLocaleString()}. `
        + "The goods leave your farm while they are up; take the listing down to bring back what is left. Listings run for three days.");
      const list = node("button", "farm-button farm-button--accent", busy ? "Listing…" : `List ${draft.quantity} for ${draft.unitPrice} each`);
      list.type = "button";
      list.disabled = busy || (board !== null && board.limits.listingsLeftToday <= 0);
      list.addEventListener("click", () => void run(() => options.list({ stack: chosen.stack, itemId: chosen.id, quantity: draft.quantity, unitPrice: draft.unitPrice })));
      form.append(what, row, note, list);
    }

    const mine = node("div", "exchange-mine");
    mine.append(node("h3", "pets-section__title", "Your listings"));
    const rows = board?.mine ?? [];
    if (!rows.length) mine.append(node("p", "item-empty", "Nothing of yours is up."));
    const listEl = node("ol", "sale-list");
    for (const listing of rows) {
      const item = node("li", "sale-row exchange-row exchange-row--mine");
      item.dataset.listingId = listing.id;
      const label = node("div", "sale-row__label");
      label.append(
        node("strong", "", listing.title),
        node("small", "", `${listing.quantity} of ${listing.listedQuantity} left · ${listing.unitPrice} tickets each · ${listingTimeLeft(listing, Date.now())}`),
      );
      const down = node("button", "farm-button", listing.status === "expired" ? "Take home" : "Take down");
      down.type = "button";
      down.disabled = busy;
      down.addEventListener("click", () => void run(() => options.withdraw(listing)));
      item.append(portrait(listing.itemKey), label, down);
      listEl.append(item);
    }
    if (rows.length) mine.append(listEl);
    elements.sellView.replaceChildren(form, mine);
  }

  function render(): void {
    elements.buyTab.setAttribute("aria-selected", String(tab === "buy"));
    elements.sellTab.setAttribute("aria-selected", String(tab === "sell"));
    elements.buyView.hidden = tab !== "buy";
    elements.sellView.hidden = tab !== "sell";
    if (tab === "buy") renderBuy();
    else renderSell();
    const limits = board?.limits;
    elements.limits.textContent = limits
      ? `Today: ${limits.purchasesLeftToday} purchases and ${limits.spendLeftToday.toLocaleString()} tickets of buying left · ${limits.listingsLeftToday} new listings and ${limits.earnLeftToday.toLocaleString()} tickets of selling left · the Market keeps ${Math.round(LISTING_FEE_RATE * 100)}% of every sale`
      : "";
  }

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  function open(): void {
    elements.status.textContent = "";
    elements.root.hidden = false;
    document.exitPointerLock?.();
    picked = {};
    render();
    elements.closeButton.focus();
    void reload();
  }

  elements.buyTab.addEventListener("click", () => { tab = "buy"; render(); });
  elements.sellTab.addEventListener("click", () => { tab = "sell"; render(); });
  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen });
}
