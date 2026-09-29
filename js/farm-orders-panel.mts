// The Order Board, on screen: today's notices, what each still needs from the
// player's basket, what it pays, and one Fill button apiece. The maths is the
// pure `farm-orders.mts`; reading the board and filling an order are whatever
// `load` and `fill` the page injects (the server calls). The panel never
// decides an order was filled — it shows what the page hands back after the
// server answers.

import { SKILL_TITLES, boardTurnoverLabel, orderTierLabel, orderView, type FarmOrderBoard, type FarmOrderSkill, type OrderView } from "./farm-orders.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
  level: HTMLElement;
  turnover: HTMLElement;
  status: HTMLElement;
}>;

export type OrderFillOutcome = Readonly<{
  ok: boolean;
  message: string;
  /** The basket, pantry and levels after the server answered, and whether this order is now filled. */
  produce?: Readonly<Record<string, number>>;
  dishes?: Readonly<Record<string, number>>;
  /** The creel after a fish order took its fish. */
  fish?: FarmOrderBoard["fish"];
  levels?: Readonly<Record<FarmOrderSkill, number>>;
  filled?: boolean;
}>;

type Options = Readonly<{
  load: () => Promise<FarmOrderBoard | null>;
  fill: (orderId: string) => Promise<OrderFillOutcome>;
  /** A line's portrait, by its item key (farm-item-thumbnails.mts). */
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  now?: () => number;
  onClose?: () => void;
}>;

export type OrderBoardPanel = Readonly<{
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}>;

export function createOrderBoardPanel(elements: Elements, options: Options): OrderBoardPanel {
  const now = options.now ?? (() => Date.now());
  let board: FarmOrderBoard | null = null;
  let busyId = "";
  let opened = 0;

  const isOpen = (): boolean => !elements.root.hidden;

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  function buttonText(view: OrderView): string {
    if (busyId === view.order.id) return "Delivering…";
    if (view.state === "filled") return "Filled ✓";
    if (view.state === "locked") return `Needs ${SKILL_TITLES[view.order.skill]} ${view.order.minLevel}`;
    if (view.state === "short") {
      const missing = view.lines.filter((line) => line.short > 0);
      return missing.length === 1 ? `Need ${missing[0]!.short} more ${missing[0]!.title}` : view.order.kind === "dish" ? "Missing dishes" : view.order.kind === "goods" ? "Missing goods" : "Missing produce";
    }
    return `Deliver for ${view.order.tickets.toLocaleString()} tickets`;
  }

  function card(view: OrderView): HTMLElement {
    const item = document.createElement("li");
    item.className = "order-card";
    item.dataset.orderId = view.order.id;
    item.dataset.state = view.state;
    item.dataset.kind = view.order.kind;
    const head = document.createElement("header");
    head.className = "order-card__head";
    const tier = document.createElement("span");
    tier.className = "order-card__tier";
    tier.textContent = orderTierLabel(view.order.tier) + (view.order.minLevel > 1 ? ` · ${SKILL_TITLES[view.order.skill]} ${view.order.minLevel}+` : "");
    const customer = document.createElement("strong");
    customer.textContent = view.order.customer;
    head.replaceChildren(tier, customer);
    const note = document.createElement("p");
    note.className = "order-card__note";
    note.textContent = `“${view.order.note}”`;
    const lines = document.createElement("ul");
    lines.className = "order-card__lines";
    for (const line of view.lines) {
      const entry = document.createElement("li");
      entry.classList.toggle("is-short", line.short > 0 && view.state !== "filled");
      const portrait = document.createElement("span");
      portrait.className = "seed-card__image";
      portrait.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.alt = "";
      const show = (url: string): void => { image.src = url; portrait.replaceChildren(image); };
      const ready = options.thumbnail?.(line.itemKey, show);
      if (ready) show(ready);
      const label = document.createElement("span");
      label.textContent = `${line.need} ${line.title}`;
      const have = document.createElement("small");
      have.textContent = view.state === "filled" ? "delivered" : `you have ${line.held}`;
      entry.replaceChildren(portrait, label, have);
      lines.append(entry);
    }
    const foot = document.createElement("footer");
    foot.className = "order-card__foot";
    const reward = document.createElement("span");
    reward.className = "order-card__reward";
    const tickets = document.createElement("strong");
    tickets.textContent = `${view.order.tickets.toLocaleString()} tickets`;
    const xp = document.createElement("small");
    xp.textContent = `+${view.order.xp.toLocaleString()} ${SKILL_TITLES[view.order.skill]} XP`;
    reward.replaceChildren(tickets, xp);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "farm-button order-card__fill" + (view.state === "ready" ? " farm-button--accent" : "");
    button.textContent = buttonText(view);
    button.disabled = Boolean(busyId) || view.state !== "ready";
    button.addEventListener("click", () => void fill(view.order.id));
    foot.replaceChildren(reward, button);
    item.replaceChildren(head, note, lines, foot);
    return item;
  }

  function render(): void {
    if (!board) {
      elements.level.textContent = "";
      elements.turnover.textContent = "";
      return;
    }
    const skills = [`Farming ${board.levels.farming}`];
    if (board.levels.cooking > 1 || board.orders.some((order) => order.kind === "dish")) skills.push(`Cooking ${board.levels.cooking}`);
    if (board.orders.some((order) => order.kind === "fish")) skills.push(`Fishing ${board.levels.fishing}`);
    if (board.orders.some((order) => order.kind === "goods")) skills.push(`Husbandry ${board.levels.husbandry}`);
    elements.level.textContent = skills.join(" · ");
    elements.turnover.textContent = boardTurnoverLabel(board.endsAt, now());
    const views = board.orders.map((order) => orderView(order, board!));
    if (!views.length) {
      const empty = document.createElement("li");
      empty.className = "sale-empty";
      empty.textContent = "The board is bare today. Check back after the turnover.";
      elements.list.replaceChildren(empty);
      return;
    }
    elements.list.replaceChildren(...views.map(card));
  }

  async function fill(orderId: string): Promise<void> {
    if (busyId || !board) return;
    busyId = orderId;
    render();
    const outcome = await options.fill(orderId).catch((): OrderFillOutcome => ({ ok: false, message: "The board could not be reached. Nothing was delivered." }));
    busyId = "";
    if (board) {
      const levels = outcome.levels ?? board.levels;
      board = Object.freeze({
        ...board,
        produce: outcome.produce ?? board.produce,
        dishes: outcome.dishes ?? board.dishes,
        fish: outcome.fish ?? board.fish,
        levels,
        level: levels.farming,
        orders: board.orders.map((order) => (order.id === orderId && outcome.filled ? Object.freeze({ ...order, filled: true }) : order)),
      });
    }
    elements.status.textContent = outcome.message;
    render();
  }

  function open(): void {
    const ticket = ++opened;
    board = null;
    elements.list.replaceChildren();
    elements.status.textContent = "Reading the board…";
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render();
    elements.closeButton.focus();
    void options.load().then((loaded) => {
      if (ticket !== opened || !isOpen()) return;
      board = loaded;
      elements.status.textContent = loaded ? "" : "The board could not be read right now. Try again in a moment.";
      render();
    }).catch(() => {
      if (ticket === opened) elements.status.textContent = "The board could not be read right now. Try again in a moment.";
    });
  }

  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen });
}
