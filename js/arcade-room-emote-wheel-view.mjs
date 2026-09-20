// The emote wheel on screen, and the sender's own emote in the HUD.
//
// `arcade-room-emotes.mts` decides what is lit and what went out; this puts
// it in the DOM. The wheel is built once from the catalog and patched — the
// lit slot gets `aria-selected`, the root gets `hidden` — and a send pops the
// picture in the lower middle of the screen for the sender, who is standing
// behind their own eyes and would otherwise never see it go. When the mouse
// is not captured the slots are real targets: hovering one lights it and
// clicking one sends it; under pointer lock the room feeds `steer` and
// `choose` from the captured deltas and the click instead.
import { EMOTE_CATALOG, EMOTE_DISPLAY_MS } from "./arcade-room-emotes.mjs";
export function createEmoteWheelView(options) {
    const { wheel, root, selfRoot } = options;
    const now = options.now ?? (() => performance.now());
    const slots = new Map();
    let selfShownAt = -Infinity;
    let selfShownId = null;
    for (const emote of EMOTE_CATALOG) {
        const slot = document.createElement("div");
        slot.className = "emote-wheel__slot";
        slot.setAttribute("role", "menuitem");
        slot.dataset.emote = emote.id;
        slot.style.setProperty("--dx", String(emote.dx));
        slot.style.setProperty("--dy", String(emote.dy));
        const image = document.createElement("img");
        image.src = emote.image;
        image.alt = "";
        image.draggable = false;
        const label = document.createElement("small");
        label.textContent = emote.label;
        slot.append(image, label);
        slot.addEventListener("pointerenter", () => wheel.highlight(emote.id));
        slot.addEventListener("click", (event) => {
            event.stopPropagation();
            wheel.highlight(emote.id);
            wheel.choose();
        });
        root.append(slot);
        slots.set(emote.id, slot);
    }
    function render() {
        const open = wheel.isOpen();
        root.hidden = !open;
        if (open) {
            const lit = wheel.highlighted();
            for (const [id, slot] of slots)
                slot.setAttribute("aria-selected", lit?.id === id ? "true" : "false");
            root.dataset.cooling = wheel.isCooling() ? "true" : "false";
        }
        const last = wheel.lastSent();
        if (last && last.at !== selfShownAt) {
            selfShownAt = last.at;
            selfShownId = last.id;
            const emote = EMOTE_CATALOG.find((entry) => entry.id === last.id);
            selfRoot.replaceChildren();
            if (emote) {
                const image = document.createElement("img");
                image.src = emote.image;
                image.alt = emote.label;
                selfRoot.append(image);
            }
            selfRoot.hidden = false;
        }
    }
    function tick() {
        if (selfShownId && now() - selfShownAt >= EMOTE_DISPLAY_MS) {
            selfShownId = null;
            selfRoot.hidden = true;
            selfRoot.replaceChildren();
        }
    }
    wheel.onChange(render);
    render();
    return Object.freeze({ tick });
}
