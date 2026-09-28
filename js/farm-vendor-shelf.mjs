// A Market NPC's buy shelf. The page supplies server-backed purchase actions;
// this module only renders stock and reflects the canonical farm it is handed.
export function createVendorShelf(elements, options) {
    let busy = "";
    function portrait(itemKey) {
        const frame = document.createElement("span");
        frame.className = "seed-card__image";
        frame.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        const show = (url) => { image.src = url; frame.replaceChildren(image); };
        const ready = options.thumbnail?.(itemKey, show);
        if (ready)
            show(ready);
        return frame;
    }
    async function buy(line, quantity) {
        if (busy)
            return;
        busy = line.itemId;
        render();
        const outcome = await options.buy(line, quantity).catch(() => ({ ok: false, message: "The purchase did not go through. Nothing was bought." }));
        elements.status.textContent = outcome.message;
        busy = "";
        render();
    }
    function row(line) {
        const item = document.createElement("li");
        item.className = "sale-row vendor-shelf__row";
        const label = document.createElement("div");
        label.className = "sale-row__label";
        const title = document.createElement("strong");
        title.textContent = line.title;
        const held = options.held(line);
        const meta = document.createElement("small");
        meta.textContent = "recipeId" in line
            ? held ? "Learned · permanent cookbook recipe" : `${line.price} tickets · permanent cookbook recipe`
            : `${line.price} tickets each · ${held} in your basket`;
        label.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "sale-footer__actions vendor-shelf__actions";
        const quantities = "recipeId" in line ? [1] : [1, 5];
        for (const quantity of quantities) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "farm-button";
            button.textContent = busy === line.itemId ? "Buying…" : `Buy${quantity > 1 ? ` ${quantity}` : ""} · ${line.price * quantity}`;
            button.disabled = Boolean(busy) || ("recipeId" in line && held > 0) || (!("recipeId" in line) && held + quantity > 99);
            button.addEventListener("click", () => void buy(line, quantity));
            actions.append(button);
        }
        item.append(portrait(line.itemKey), label, actions);
        return item;
    }
    function render() {
        elements.list.replaceChildren(...options.stock.map(row));
    }
    return Object.freeze({ render });
}
