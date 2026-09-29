// The trading table and the invitation toast, on screen. It draws a session
// snapshot (farm-trade-session.mts) and turns clicks into session calls; it
// holds no trade state of its own and decides nothing — every count it shows
// on the other side is the server's, and every one on this side is the
// player's draft, clamped to the basket by the pure `farm-trade.mts`.
//
// The table is two columns. On the left, everything this player holds that can
// be traded, each with a stepper for how many go on the table (a row with
// something offered is lit). On the right, what the other player has put up.
// Under both, one line says where the table stands, and two buttons move it:
// Lock (or Unlock) and Confirm.

import {
  canConfirm,
  offerCount,
  offerIsEmpty,
  offerLines,
  stockEntries,
  tradeStage,
  tradeStatusLine,
  endedWords,
  isLive,
  MAX_TRADE_QUANTITY,
  type OfferLine,
  type StockEntry,
  type TradeAnimal,
  type TradeFish,
  type TradeView,
} from "./farm-trade.mjs";
import type { TradeSession, TradeSnapshot } from "./farm-trade-session.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

type Thumbnail = (key: string, onReady: (url: string) => void) => string | null;

export type TradePanelElements = Readonly<{
  invite: HTMLElement;
  inviteText: HTMLElement;
  acceptButton: HTMLButtonElement;
  declineButton: HTMLButtonElement;
  root: HTMLElement;
  title: HTMLElement;
  closeButton: HTMLButtonElement;
  yourState: HTMLElement;
  theirState: HTMLElement;
  yourTitle: HTMLElement;
  theirTitle: HTMLElement;
  stock: HTMLElement;
  theirs: HTMLElement;
  status: HTMLElement;
  lockButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
}>;

export type TradePanelOptions = Readonly<{
  session: TradeSession;
  farm: () => FarmLayout;
  thumbnail?: Thumbnail;
  /** The player's creel, and any fish (theirs or the partner's) by id, to name fish on the table. */
  creel?: () => readonly TradeFish[];
  fishDetail?: (fishId: string) => TradeFish | null;
  /** The player's herd as cards, and any animal (theirs or the partner's) by id, to name animals on the table. */
  herd?: () => readonly TradeAnimal[];
  animalDetail?: (animalId: string) => TradeAnimal | null;
  /** The table went away (put down or walked away from): the page takes the keyboard back. */
  onClose: () => void;
}>;

export type TradePanel = Readonly<{
  render: () => void;
  isOpen: () => boolean;
  /** Esc: walk away from a live table, or put an ended one down. */
  escape: () => void;
  /** Y / N on a waiting invitation. Returns whether there was one. */
  answer: (yes: boolean) => boolean;
}>;

function node(tag: string, className = "", text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createTradePanel(elements: TradePanelElements, options: TradePanelOptions): TradePanel {
  const { session } = options;
  const fishDetail = (fishId: string): TradeFish | null => options.fishDetail?.(fishId) ?? null;
  const animalDetail = (animalId: string): TradeAnimal | null => options.animalDetail?.(animalId) ?? null;
  const isOpen = (): boolean => !elements.root.hidden;
  let shownTable = "";
  // The lists are rebuilt only when what they show changes, not on every poll, so a hover or focus survives.
  let stockKey = "";
  let theirsKey = "";

  function portrait(itemKey: string): HTMLElement {
    const frame = node("span", "seed-card__image");
    frame.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; frame.replaceChildren(image); };
    const ready = options.thumbnail?.(itemKey, show);
    if (ready) show(ready);
    return frame;
  }

  function stateChip(target: HTMLElement, locked: boolean, confirmed: boolean): void {
    target.textContent = confirmed ? "CONFIRMED" : locked ? "LOCKED" : "EDITING";
    target.dataset.state = confirmed ? "confirmed" : locked ? "locked" : "editing";
  }

  function stockRow(entry: StockEntry, snapshot: TradeSnapshot, editable: boolean): HTMLElement {
    const offered = offerCount(snapshot.draft, entry.stack, entry.id);
    const row = node("li", "sale-row trade-row");
    row.dataset.offered = String(offered > 0);
    const label = node("div", "sale-row__label");
    label.append(node("strong", "", entry.title), node("small", "", `You have ${entry.held}`));
    const stepper = node("div", "sale-row__stepper");
    const button = (text: string, aria: string, disabled: boolean, count: number): HTMLButtonElement => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = text;
      element.setAttribute("aria-label", aria);
      element.disabled = !editable || disabled;
      element.addEventListener("click", () => session.setLine(entry.stack, entry.id, count));
      return element;
    };
    const top = Math.min(entry.held, MAX_TRADE_QUANTITY);
    const count = node("strong", "trade-row__count", String(offered));
    stepper.append(
      button("−", `One fewer ${entry.title}`, offered <= 0, offered - 1),
      count,
      button("+", `One more ${entry.title}`, offered >= top, offered + 1),
      button("All", `Offer all your ${entry.title}`, offered >= top, top),
    );
    stepper.lastElementChild!.className = "sale-row__all";
    row.append(portrait(entry.itemKey), label, stepper);
    return row;
  }

  /** A line drawn read-only: the other side's offer, or either side's once the table has ended. */
  function lineRow(line: OfferLine): HTMLElement {
    const row = node("li", "sale-row trade-row trade-row--theirs");
    const label = node("div", "sale-row__label");
    label.append(node("strong", "", line.title));
    row.append(portrait(line.itemKey), label, node("strong", "trade-row__count", `× ${line.count}`));
    return row;
  }

  function renderTable(view: TradeView, snapshot: TradeSnapshot): void {
    const live = isLive(view);
    const open = view.status === "open";
    const stage = open ? tradeStage(view) : "editing";
    const editable = open && !view.you.locked && !snapshot.busy;
    elements.title.textContent = view.status === "invited" ? `Asking ${view.them.name} to trade` : `Trading with ${view.them.name}`;
    const done = view.status === "completed";
    elements.yourTitle.textContent = done ? "You gave" : "You offer";
    elements.theirTitle.textContent = done ? `${view.them.name} gave` : `${view.them.name} offers`;
    stateChip(elements.yourState, view.you.locked, view.you.confirmed);
    stateChip(elements.theirState, view.them.locked, view.them.confirmed);
    elements.root.dataset.status = view.status;

    if (live) {
      const entries = stockEntries(options.farm(), options.creel?.() ?? [], options.herd?.() ?? []);
      const nextStockKey = JSON.stringify([editable, entries.map((entry) => [entry.stack, entry.id, entry.held, offerCount(snapshot.draft, entry.stack, entry.id)])]);
      if (nextStockKey !== stockKey) {
        stockKey = nextStockKey;
        elements.stock.replaceChildren(...(entries.length
          ? entries.map((entry) => stockRow(entry, snapshot, editable))
          : [node("li", "sale-empty", "Nothing to trade yet — produce, dishes, logs, planks, furniture on your shelf, fish from your creel and animals from your herd can all go on the table.")]));
      }
    } else {
      // The table has ended: the basket has moved on, so show what this side put up, not steppers against the new counts.
      const mine = offerLines(view.you.offer, fishDetail, animalDetail);
      const nextStockKey = JSON.stringify([view.status, mine.map((line) => [line.stack, line.id, line.count])]);
      if (nextStockKey !== stockKey) {
        stockKey = nextStockKey;
        elements.stock.replaceChildren(...(mine.length ? mine.map(lineRow) : [node("li", "sale-empty", "Nothing.")]));
      }
    }
    const theirs = offerLines(view.them.offer, fishDetail, animalDetail);
    const nextTheirsKey = JSON.stringify([view.status, theirs.map((line) => [line.stack, line.id, line.count])]);
    if (nextTheirsKey !== theirsKey) {
      theirsKey = nextTheirsKey;
      elements.theirs.replaceChildren(...(theirs.length
        ? theirs.map(lineRow)
        : [node("li", "sale-empty", view.status === "invited" ? "Waiting for them to come to the table…" : "Nothing on their side yet.")]));
    }

    const words = snapshot.message || (live ? tradeStatusLine(view) : endedWords(view));
    elements.status.textContent = snapshot.sending && open && !snapshot.message ? "Sending your offer…" : words;

    elements.lockButton.hidden = !open;
    elements.lockButton.disabled = snapshot.busy || stage === "confirmed";
    elements.lockButton.textContent = view.you.locked ? "Unlock to change" : offerIsEmpty(snapshot.draft) ? "Lock (nothing offered)" : "Lock my offer";
    elements.lockButton.setAttribute("aria-pressed", String(view.you.locked));
    elements.confirmButton.hidden = !open;
    elements.confirmButton.disabled = snapshot.busy || !canConfirm(view);
    elements.confirmButton.textContent = view.you.confirmed ? "Confirmed ✓" : "Confirm trade";
    elements.closeButton.firstChild!.textContent = live ? "Walk away " : "Done ";
  }

  function render(): void {
    const snapshot = session.snapshot();
    const invitation = snapshot.invitation;
    elements.invite.hidden = !invitation;
    if (invitation) {
      elements.inviteText.textContent = `${invitation.them.name} wants to trade with you.`;
      elements.acceptButton.disabled = snapshot.busy;
      elements.declineButton.disabled = snapshot.busy;
    }
    const view = snapshot.view;
    const wasOpen = isOpen();
    elements.root.hidden = !view;
    if (!view) {
      shownTable = "";
      stockKey = "";
      theirsKey = "";
      if (wasOpen) options.onClose();
      return;
    }
    if (shownTable !== view.id) {
      shownTable = view.id;
      document.exitPointerLock?.();
    }
    renderTable(view, snapshot);
  }

  function escape(): void {
    const view = session.snapshot().view;
    if (!view) return;
    if (isLive(view)) void session.cancel();
    else session.dismiss();
  }

  elements.closeButton.addEventListener("click", escape);
  elements.lockButton.addEventListener("click", () => {
    const view = session.snapshot().view;
    void (view?.you.locked ? session.unlock() : session.lock());
  });
  elements.confirmButton.addEventListener("click", () => void session.confirm());
  elements.acceptButton.addEventListener("click", () => void session.accept());
  elements.declineButton.addEventListener("click", () => void session.decline());
  elements.root.hidden = true;
  elements.invite.hidden = true;

  return Object.freeze({
    render,
    isOpen,
    escape,
    answer(yes: boolean): boolean {
      if (!session.snapshot().invitation) return false;
      void (yes ? session.accept() : session.decline());
      return true;
    },
  });
}
