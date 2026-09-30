// The farm HUD layer: the one place the Farm, the Market Square and the Cove
// agree on how their screens behave around the 3D world.
//
// A page registers each of its sheets (the Inventory, a stall's counter, the
// Herd…) with `sheet(id, spec)`. From then on the layer, not the page, owns:
//  - the mouse: a sheet that becomes visible — however it was opened — always
//    releases pointer lock, so a menu is never shown without a cursor (the old
//    bug: several panels forgot to, and in fullscreen Escape leaves fullscreen
//    instead of freeing the mouse). Going back to the world captures the mouse
//    again if it was captured when the sheet opened;
//  - exclusivity: one sheet at a time, the newest wins;
//  - leaving a sheet: Escape, its hotkey again, or a click on the world;
//  - fullscreen, with Escape kept for the page (hold Escape to leave), so
//    Escape closes a menu in fullscreen exactly as it does in a window.
// It also carries the pieces of chrome every page shares: the feedback toast,
// the key-cap prompt, the collapsible controls card and sheet tabs.
//
// Visibility is read from each sheet root's `hidden` attribute, which every
// panel module already sets, so no panel had to learn about this file.
import { createSheetStack, promptParts } from "./farm-hud-model.mjs";
const CONTROLS_STORAGE_KEY = "farm-hud:controls";
// Pointer lock can already be gone when the sheet's own open() released it first: "just now" still counts.
const RECENT_UNLOCK_MS = 400;
function typingIn(target) {
    if (!(target instanceof HTMLElement))
        return false;
    return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
function readStored(key) {
    try {
        return globalThis.localStorage?.getItem(key) ?? "";
    }
    catch {
        return "";
    }
}
function writeStored(key, value) {
    try {
        globalThis.localStorage?.setItem(key, value);
    }
    catch { /* private window: the card just forgets */ }
}
/** Write a prompt as key caps and words; unchanged text is left alone (this runs every tick). */
export function renderPrompt(element, text) {
    if (element.dataset.prompt === text)
        return;
    element.dataset.prompt = text;
    const nodes = promptParts(text).map((part) => {
        if (part.kind === "key") {
            const key = document.createElement("kbd");
            key.textContent = part.text;
            return key;
        }
        if (part.kind === "gap") {
            const gap = document.createElement("span");
            gap.className = "hud-prompt__gap";
            gap.setAttribute("aria-hidden", "true");
            return gap;
        }
        return document.createTextNode(part.text);
    });
    element.replaceChildren(...nodes);
    element.classList.toggle("is-visible", Boolean(text));
}
/**
 * Tabs inside a sheet: `[data-sheet-tab="x"]` buttons show the `[data-sheet-pane="x"]`
 * elements and hide the others (a footer that only belongs to one tab carries its pane
 * name too). Panes are hidden with a class, never `hidden`, which the panel modules own.
 */
export function wireSheetTabs(root, onSelect) {
    const tabs = [...root.querySelectorAll("[data-sheet-tab]")];
    const panes = [...root.querySelectorAll("[data-sheet-pane]")];
    const select = (name) => {
        for (const tab of tabs)
            tab.setAttribute("aria-selected", String(tab.dataset.sheetTab === name));
        for (const pane of panes)
            pane.classList.toggle("is-pane-hidden", !(pane.dataset.sheetPane ?? "").split(" ").includes(name));
        onSelect?.(name);
    };
    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => select(tab.dataset.sheetTab ?? ""));
        tab.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                return;
            event.preventDefault();
            const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
            next.focus();
            select(next.dataset.sheetTab ?? "");
        });
    });
    const first = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    if (first)
        select(first.dataset.sheetTab ?? "");
    return select;
}
export function createFarmHud(options) {
    const { canvas } = options;
    const shell = canvas.closest(".farm-shell") ?? document.body;
    const stack = createSheetStack();
    const sheets = new Map();
    let relock = false;
    let unlockedAt = -Infinity;
    document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement !== canvas)
            unlockedAt = performance.now();
    });
    // The world behind an open sheet: dimmed a little, and a click on it goes back to walking.
    const scrim = document.createElement("div");
    scrim.className = "hud-scrim";
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", () => {
        const top = sheets.get(stack.top());
        if (top && top.dismissable !== false)
            top.close();
    });
    shell.append(scrim);
    // What just happened, said where the player is looking: above the prompt, for a few seconds.
    const toastElement = document.createElement("div");
    toastElement.className = "hud-toast";
    toastElement.setAttribute("role", "status");
    toastElement.setAttribute("aria-live", "polite");
    shell.append(toastElement);
    let toastTimer = 0;
    function lockedNow() {
        return document.pointerLockElement === canvas || performance.now() - unlockedAt < RECENT_UNLOCK_MS;
    }
    function reconcile() {
        const wasOpen = stack.anyOpen();
        // Closings first, so a page that closes one sheet and opens another in the same breath never looks empty.
        for (const [id, spec] of sheets)
            if (spec.root.hidden && stack.isOpen(id))
                stack.closed(id);
        for (const [id, spec] of sheets) {
            if (spec.root.hidden || stack.isOpen(id))
                continue;
            if (!stack.anyOpen())
                relock = lockedNow();
            for (const other of stack.opened(id))
                sheets.get(other)?.close();
        }
        const open = stack.anyOpen();
        document.body.classList.toggle("has-sheet", open);
        if (open) {
            document.body.dataset.sheet = stack.top();
            if (document.pointerLockElement)
                document.exitPointerLock?.();
            return;
        }
        delete document.body.dataset.sheet;
        if (!wasOpen)
            return;
        canvas.focus({ preventScroll: true });
        if (relock && (options.canRelock?.() ?? true)) {
            const request = canvas.requestPointerLock?.();
            request?.catch?.(() => undefined);
        }
        relock = false;
    }
    const observer = new MutationObserver(reconcile);
    // ------------------------------------------------------------ fullscreen
    const keyboard = navigator.keyboard;
    const fullscreenButtons = [];
    const isOn = () => Boolean(document.fullscreenElement);
    function syncFullscreen() {
        const on = isOn();
        for (const button of fullscreenButtons) {
            button.setAttribute("aria-pressed", String(on));
            const label = button.querySelector("[data-label]");
            if (label)
                label.textContent = on ? "Exit fullscreen" : "Fullscreen";
            button.setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen");
        }
        // Escape stays the page's in fullscreen (the browser asks for a long press to leave instead).
        if (on)
            keyboard?.lock?.(["Escape"])?.catch?.(() => undefined);
        else
            keyboard?.unlock?.();
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    const fullscreen = Object.freeze({
        supported: Boolean(document.fullscreenEnabled),
        isOn,
        toggle() {
            if (!document.fullscreenEnabled)
                return;
            if (isOn())
                document.exitFullscreen?.().catch(() => undefined);
            else
                document.documentElement.requestFullscreen?.().catch(() => undefined);
        },
        bind(button) {
            if (!button)
                return;
            button.hidden = !document.fullscreenEnabled;
            fullscreenButtons.push(button);
            button.addEventListener("click", () => {
                fullscreen.toggle();
                canvas.focus({ preventScroll: true });
            });
            syncFullscreen();
        },
    });
    // ------------------------------------------------------------ controls card
    const controls = options.controls ?? null;
    const controlsToggle = controls?.querySelector(".control-hint__toggle") ?? null;
    function setControls(expanded, remember) {
        if (!controls)
            return;
        controls.dataset.expanded = String(expanded);
        controlsToggle?.setAttribute("aria-expanded", String(expanded));
        if (remember)
            writeStored(CONTROLS_STORAGE_KEY, expanded ? "open" : "closed");
    }
    // First visit: open, so the keys are learned; after that, as the player left it.
    setControls(readStored(CONTROLS_STORAGE_KEY) !== "closed", false);
    controlsToggle?.addEventListener("click", () => {
        setControls(controls?.dataset.expanded !== "true", true);
        canvas.focus({ preventScroll: true });
    });
    // ------------------------------------------------------------ the HUD's keys
    function handleKey(event) {
        if (event.code === "Escape") {
            const top = sheets.get(stack.top());
            if (top) {
                event.preventDefault();
                (top.escape ?? top.close)();
                return true;
            }
            // With Escape kept in fullscreen, the page does what the browser would have: free the mouse.
            // (Escape in a text box — the chat — is the box's own.)
            if (document.pointerLockElement === canvas && !typingIn(event.target)) {
                document.exitPointerLock?.();
                return true;
            }
            return false;
        }
        if (event.repeat || typingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey)
            return false;
        if (event.code === "Slash" && controls) {
            event.preventDefault();
            setControls(controls.dataset.expanded !== "true", true);
            return true;
        }
        for (const [id, spec] of sheets) {
            if (!spec.key || spec.key !== event.code)
                continue;
            if (stack.isOpen(id)) {
                event.preventDefault();
                spec.close();
                return true;
            }
            if (!spec.open || !(spec.enabled?.() ?? true))
                return false;
            event.preventDefault();
            spec.open();
            return true;
        }
        return false;
    }
    return Object.freeze({
        sheet(id, spec) {
            sheets.set(id, spec);
            observer.observe(spec.root, { attributes: true, attributeFilter: ["hidden"] });
            reconcile();
        },
        anyOpen: () => stack.anyOpen(),
        isOpen: (id) => stack.isOpen(id),
        closeAll() {
            for (const [id, spec] of sheets)
                if (stack.isOpen(id))
                    spec.close();
        },
        handleKey,
        toast(text, seconds = 4) {
            clearTimeout(toastTimer);
            toastElement.textContent = text;
            toastElement.classList.toggle("is-visible", Boolean(text));
            if (text)
                toastTimer = window.setTimeout(() => toastElement.classList.remove("is-visible"), seconds * 1000);
        },
        setPrompt: renderPrompt,
        fullscreen,
    });
}
