// The Sawmill, on screen: every timber species the farm holds logs of, each
// row the logs going in and the planks coming out, a count to saw and one
// button. The same panel serves both sawmills — the Market Square's stall,
// which charges its fee per log, and a farm's own, which charges nothing —
// so the page hands it the fee and the `mill` call, and the panel never
// decides what was sawn: it shows the stock the page hands back after the
// server answers.
import { MAX_MILL_LOGS, PLANKS_PER_LOG } from "./farm-catalog/carpentry.mjs";
import { millLines } from "./farm-workshop.mjs";
function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className)
        element.className = className;
    if (text)
        element.textContent = text;
    return element;
}
export function createMillPanel(elements, options) {
    let inventory = null;
    let picked = {};
    let busy = false;
    const isOpen = () => !elements.root.hidden;
    function portrait(itemKey) {
        const frame = node("span", "seed-card__image");
        frame.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        const show = (url) => { image.src = url; frame.replaceChildren(image); };
        const ready = options.thumbnail?.(itemKey, show);
        if (ready)
            show(ready);
        return frame;
    }
    function count(line) {
        const wanted = picked[line.id] ?? Math.min(line.logs, MAX_MILL_LOGS);
        return Math.max(0, Math.min(line.logs, MAX_MILL_LOGS, wanted));
    }
    function row(line) {
        // Its own row, not the market's sale-row: the market's sheet loads later and would impose its grid.
        const item = node("li", "mill-row");
        item.dataset.species = line.id;
        const logs = count(line);
        const words = node("div", "sale-row__label");
        words.append(node("strong", "", `${line.title} logs`), node("small", "", `${line.logs} held · ${line.planks} planks already`));
        const stepper = node("div", "sale-row__stepper");
        const less = node("button", "", "−");
        less.type = "button";
        less.disabled = busy || logs <= 1;
        less.addEventListener("click", () => { picked = { ...picked, [line.id]: logs - 1 }; render(); });
        const amount = node("strong", "mill-row__count", String(logs));
        const more = node("button", "", "+");
        more.type = "button";
        more.disabled = busy || logs >= Math.min(line.logs, MAX_MILL_LOGS);
        more.addEventListener("click", () => { picked = { ...picked, [line.id]: logs + 1 }; render(); });
        stepper.append(less, amount, more);
        const fee = logs * options.feePerLog;
        const saw = node("button", "farm-button farm-button--accent mill-row__saw");
        saw.type = "button";
        saw.disabled = busy || logs < 1;
        saw.textContent = `Saw → ${logs * PLANKS_PER_LOG} planks${options.feePerLog ? ` · ${fee} ticket${fee === 1 ? "" : "s"}` : ""}`;
        saw.addEventListener("click", () => { void mill(line.id, logs); });
        // Top line: the logs going in, what they are, the planks coming out. Bottom line: how many, and the saw.
        const controls = node("div", "mill-row__controls");
        controls.append(stepper, saw);
        item.append(portrait(`log:${line.id}`), words, portrait(`plank:${line.id}`), controls);
        return item;
    }
    function render() {
        if (!inventory)
            return;
        const lines = millLines(inventory).filter((line) => line.logs > 0);
        elements.list.replaceChildren(...(lines.length ? lines.map(row) : [node("li", "sale-empty", options.emptyNote)]));
    }
    async function mill(speciesId, logs) {
        if (busy || logs < 1)
            return;
        busy = true;
        elements.status.textContent = "The blade bites…";
        render();
        try {
            const outcome = await options.mill(speciesId, logs);
            elements.status.textContent = outcome.message;
            if (outcome.inventory) {
                inventory = outcome.inventory;
                const { [speciesId]: _done, ...rest } = picked;
                picked = rest;
            }
        }
        catch {
            elements.status.textContent = "The saw jammed. Nothing was used — try again in a moment.";
        }
        finally {
            busy = false;
            render();
        }
    }
    function open(next, note = "") {
        inventory = next;
        picked = {};
        elements.status.textContent = note;
        elements.root.hidden = false;
        document.exitPointerLock?.();
        render();
        elements.list.querySelector(".mill-row__saw")?.focus();
    }
    function close() {
        if (!isOpen())
            return;
        elements.root.hidden = true;
        options.onClose?.();
    }
    elements.closeButton.addEventListener("click", close);
    elements.root.hidden = true;
    return Object.freeze({ open, close, isOpen });
}
