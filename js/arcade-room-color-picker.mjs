// The editor's colour picker: a saturation/value pad, a hue strip, a hex
// field and the neon presets, all inline in the panel.
//
// It exists because the browser's `<input type="color">` popup is torn down
// the moment the panel re-renders, which it does on every colour change — so
// the popup closed on the first click. This widget is built ONCE per selection
// and updated in place, and it separates PREVIEW (every pointer move while
// dragging) from COMMIT (pointer up, a preset, a typed hex) so the editor can
// redraw the room live and still record one undo step per gesture.
import { hexToHsv, hsvToHex, normalizeHex } from "./arcade-room-color.mjs";
function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
export function createColorPicker(options) {
    const root = element("div", "color-picker");
    const pad = element("div", "color-picker__pad");
    pad.tabIndex = 0;
    pad.setAttribute("role", "slider");
    pad.setAttribute("aria-label", "Saturation and brightness");
    const padThumb = element("span", "color-picker__thumb");
    pad.append(padThumb);
    const hue = element("div", "color-picker__hue");
    hue.tabIndex = 0;
    hue.setAttribute("role", "slider");
    hue.setAttribute("aria-label", "Hue");
    hue.setAttribute("aria-valuemin", "0");
    hue.setAttribute("aria-valuemax", "360");
    const hueThumb = element("span", "color-picker__thumb");
    hue.append(hueThumb);
    // One row: the current colour, the hue strip, the hex — the pad above, the presets below.
    const row = element("div", "color-picker__row");
    const swatch = element("span", "color-picker__swatch");
    const hex = element("input", "color-picker__hex");
    hex.type = "text";
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.autocomplete = "off";
    hex.setAttribute("aria-label", "Hex colour");
    row.append(swatch, hue, hex);
    const presets = element("div", "tint-grid");
    for (const preset of options.presets) {
        const button = element("button", "tint");
        button.type = "button";
        button.dataset.presetColor = preset.hex;
        button.title = preset.title;
        button.style.setProperty("--tint", preset.hex);
        presets.append(button);
    }
    root.append(pad, row, presets);
    let hsv = { h: 0, s: 1, v: 1 };
    let value = "#ff0000";
    let active = null;
    function paint() {
        root.style.setProperty("--picker-hue", `${hsv.h}`);
        root.style.setProperty("--picker-color", value);
        padThumb.style.left = `${hsv.s * 100}%`;
        padThumb.style.top = `${(1 - hsv.v) * 100}%`;
        hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
        hue.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
        pad.setAttribute("aria-valuetext", `${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`);
        if (document.activeElement !== hex)
            hex.value = value;
        for (const button of presets.querySelectorAll("[data-preset-color]")) {
            button.setAttribute("aria-pressed", String(button.dataset.presetColor === value));
        }
    }
    function apply(next, phase) {
        hsv = next;
        value = hsvToHex(hsv);
        paint();
        if (phase === "preview")
            options.onPreview(value);
        else
            options.onCommit(value);
    }
    function fromPad(event) {
        const bounds = pad.getBoundingClientRect();
        return {
            h: hsv.h,
            s: clamp01((event.clientX - bounds.left) / bounds.width),
            v: 1 - clamp01((event.clientY - bounds.top) / bounds.height),
        };
    }
    function fromHue(event) {
        const bounds = hue.getBoundingClientRect();
        return { ...hsv, h: clamp01((event.clientX - bounds.left) / bounds.width) * 359.99 };
    }
    function track(surface, name, read) {
        surface.addEventListener("pointerdown", (event) => {
            if (event.button !== 0)
                return;
            event.preventDefault();
            surface.setPointerCapture?.(event.pointerId);
            surface.focus({ preventScroll: true });
            active = name;
            apply(read(event), "preview");
        });
        surface.addEventListener("pointermove", (event) => {
            if (active !== name)
                return;
            apply(read(event), "preview");
        });
        const finish = (event) => {
            if (active !== name)
                return;
            active = null;
            surface.releasePointerCapture?.(event.pointerId);
            apply(read(event), "commit");
        };
        surface.addEventListener("pointerup", finish);
        surface.addEventListener("pointercancel", finish);
        surface.addEventListener("lostpointercapture", () => {
            // The capture can be lost without a pointerup (tab switch, a dialog): close the gesture with what we have.
            if (active !== name)
                return;
            active = null;
            apply(hsv, "commit");
        });
    }
    track(pad, "pad", fromPad);
    track(hue, "hue", fromHue);
    // Arrow keys move the thumbs a step at a time, so the picker is usable without a mouse.
    pad.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 0.1 : 0.02;
        const moves = {
            ArrowLeft: { ...hsv, s: clamp01(hsv.s - step) },
            ArrowRight: { ...hsv, s: clamp01(hsv.s + step) },
            ArrowUp: { ...hsv, v: clamp01(hsv.v + step) },
            ArrowDown: { ...hsv, v: clamp01(hsv.v - step) },
        };
        const next = moves[event.key];
        if (!next)
            return;
        event.preventDefault();
        apply(next, "commit");
    });
    hue.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 15 : 3;
        const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
        if (!direction)
            return;
        event.preventDefault();
        apply({ ...hsv, h: (hsv.h + direction * step + 360) % 360 }, "commit");
    });
    hex.addEventListener("input", () => {
        const parsed = normalizeHex(hex.value);
        hex.setAttribute("aria-invalid", String(!parsed));
    });
    const commitHex = () => {
        const parsed = normalizeHex(hex.value);
        if (!parsed) {
            hex.value = value;
            hex.removeAttribute("aria-invalid");
            return;
        }
        hex.removeAttribute("aria-invalid");
        if (parsed === value) {
            hex.value = value;
            return;
        }
        apply(hexToHsv(parsed), "commit");
    };
    hex.addEventListener("change", commitHex);
    hex.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commitHex();
            hex.blur();
        }
    });
    presets.addEventListener("click", (event) => {
        const button = event.target.closest("[data-preset-color]");
        const preset = button?.dataset.presetColor;
        if (preset)
            apply(hexToHsv(preset), "commit");
    });
    function setValue(next) {
        const parsed = normalizeHex(next);
        if (!parsed || active || parsed === value)
            return;
        const parsedHsv = hexToHsv(parsed);
        // A grey or black has no hue of its own; keep the strip where the player left it.
        hsv = parsedHsv.s === 0 || parsedHsv.v === 0 ? { ...parsedHsv, h: hsv.h } : parsedHsv;
        value = parsed;
        paint();
    }
    paint();
    return Object.freeze({
        element: root,
        setValue,
        getValue: () => value,
        isActive: () => active !== null,
    });
}
