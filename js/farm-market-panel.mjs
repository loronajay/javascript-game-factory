// The Produce Merchant's counter, on screen: the crops the player holds, a
// count to sell for each, the total, and one Sell button. The maths is the pure
// `farm-market-prices.mts`; the sale itself is whatever `sell` the page injects
// (the server call). The panel never decides what was sold — it shows the
// produce the page hands back after the server answers.
import { MAX_SALE_QUANTITY, saleItems, saleLines, saleTotal } from "./farm-market-prices.mjs";
export function createMarketSalePanel(elements, options) {
    let produce = {};
    let picked = {};
    let busy = false;
    const isOpen = () => !elements.root.hidden;
    function close() {
        if (!isOpen())
            return;
        elements.root.hidden = true;
        options.onClose?.();
    }
    function pick(cropId, quantity) {
        picked = { ...picked, [cropId]: Math.max(0, Math.min(MAX_SALE_QUANTITY, Math.floor(quantity) || 0)) };
        render();
    }
    function row(line) {
        const item = document.createElement("li");
        item.className = "sale-row";
        item.dataset.cropId = line.cropId;
        const portrait = document.createElement("span");
        portrait.className = "seed-card__image";
        portrait.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        const show = (url) => { image.src = url; portrait.replaceChildren(image); };
        const ready = options.thumbnail?.(line.cropId, show);
        if (ready)
            show(ready);
        const label = document.createElement("div");
        label.className = "sale-row__label";
        const title = document.createElement("strong");
        title.textContent = line.title;
        const held = document.createElement("small");
        held.textContent = `You have ${line.held} · ${line.price} tickets each`;
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
    function render() {
        const lines = saleLines(produce, picked);
        if (!lines.length) {
            const empty = document.createElement("li");
            empty.className = "sale-empty";
            empty.textContent = "Your harvest basket is empty. Grow something on the farm and bring it back.";
            elements.list.replaceChildren(empty);
        }
        else {
            elements.list.replaceChildren(...lines.map(row));
        }
        const total = saleTotal(lines);
        elements.total.textContent = total.toLocaleString();
        elements.sellButton.disabled = busy || total <= 0;
        elements.sellButton.textContent = busy ? "Selling…" : total > 0 ? `Sell for ${total.toLocaleString()} tickets` : "Pick something to sell";
        elements.pickAllButton.disabled = busy || !lines.length;
    }
    async function sell() {
        const items = saleItems(saleLines(produce, picked));
        if (busy || !Object.keys(items).length)
            return;
        busy = true;
        render();
        const outcome = await options.sell(items).catch(() => ({ ok: false, message: "The merchant could not be reached. Nothing was sold." }));
        busy = false;
        if (outcome.produce)
            produce = outcome.produce;
        if (outcome.ok)
            picked = {};
        elements.status.textContent = outcome.message;
        render();
    }
    function open(next, note = "") {
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
        picked = Object.fromEntries(saleLines(produce, {}).map((line) => [line.cropId, line.held]));
        render();
    });
    elements.root.hidden = true;
    return Object.freeze({ open, close, isOpen });
}
