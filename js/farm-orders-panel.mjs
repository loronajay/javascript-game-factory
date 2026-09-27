// The Order Board, on screen: today's notices, what each still needs from the
// player's basket, what it pays, and one Fill button apiece. The maths is the
// pure `farm-orders.mts`; reading the board and filling an order are whatever
// `load` and `fill` the page injects (the server calls). The panel never
// decides an order was filled — it shows what the page hands back after the
// server answers.
import { boardTurnoverLabel, orderTierLabel, orderView } from "./farm-orders.mjs";
export function createOrderBoardPanel(elements, options) {
    const now = options.now ?? (() => Date.now());
    let board = null;
    let busyId = "";
    let opened = 0;
    const isOpen = () => !elements.root.hidden;
    function close() {
        if (!isOpen())
            return;
        elements.root.hidden = true;
        options.onClose?.();
    }
    function buttonText(view) {
        if (busyId === view.order.id)
            return "Delivering…";
        if (view.state === "filled")
            return "Filled ✓";
        if (view.state === "locked")
            return `Needs Farming ${view.order.minLevel}`;
        if (view.state === "short") {
            const missing = view.lines.filter((line) => line.short > 0);
            return missing.length === 1 ? `Need ${missing[0].short} more ${missing[0].title}` : "Missing produce";
        }
        return `Deliver for ${view.order.tickets.toLocaleString()} tickets`;
    }
    function card(view) {
        const item = document.createElement("li");
        item.className = "order-card";
        item.dataset.orderId = view.order.id;
        item.dataset.state = view.state;
        const head = document.createElement("header");
        head.className = "order-card__head";
        const tier = document.createElement("span");
        tier.className = "order-card__tier";
        tier.textContent = orderTierLabel(view.order.tier) + (view.order.minLevel > 1 ? ` · Farming ${view.order.minLevel}+` : "");
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
            const show = (url) => { image.src = url; portrait.replaceChildren(image); };
            const ready = options.thumbnail?.(line.cropId, show);
            if (ready)
                show(ready);
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
        xp.textContent = `+${view.order.xp.toLocaleString()} Farming XP`;
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
    function render() {
        if (!board) {
            elements.level.textContent = "";
            elements.turnover.textContent = "";
            return;
        }
        elements.level.textContent = `Farming ${board.level}`;
        elements.turnover.textContent = boardTurnoverLabel(board.endsAt, now());
        const views = board.orders.map((order) => orderView(order, board.produce, board.level));
        if (!views.length) {
            const empty = document.createElement("li");
            empty.className = "sale-empty";
            empty.textContent = "The board is bare today. Check back after the turnover.";
            elements.list.replaceChildren(empty);
            return;
        }
        elements.list.replaceChildren(...views.map(card));
    }
    async function fill(orderId) {
        if (busyId || !board)
            return;
        busyId = orderId;
        render();
        const outcome = await options.fill(orderId).catch(() => ({ ok: false, message: "The board could not be reached. Nothing was delivered." }));
        busyId = "";
        if (board) {
            board = Object.freeze({
                ...board,
                produce: outcome.produce ?? board.produce,
                level: outcome.level ?? board.level,
                orders: board.orders.map((order) => (order.id === orderId && outcome.filled ? Object.freeze({ ...order, filled: true }) : order)),
            });
        }
        elements.status.textContent = outcome.message;
        render();
    }
    function open() {
        const ticket = ++opened;
        board = null;
        elements.list.replaceChildren();
        elements.status.textContent = "Reading the board…";
        elements.root.hidden = false;
        document.exitPointerLock?.();
        render();
        elements.closeButton.focus();
        void options.load().then((loaded) => {
            if (ticket !== opened || !isOpen())
                return;
            board = loaded;
            elements.status.textContent = loaded ? "" : "The board could not be read right now. Try again in a moment.";
            render();
        }).catch(() => {
            if (ticket === opened)
                elements.status.textContent = "The board could not be read right now. Try again in a moment.";
        });
    }
    elements.closeButton.addEventListener("click", close);
    elements.root.hidden = true;
    return Object.freeze({ open, close, isOpen });
}
