// The build-mode panel's DOM: tabs, the cabinet list, surface swatches, the
// decor catalog and the inspector for whatever is selected.
//
// Pure rendering. It is handed a snapshot of editor state and draws it; every
// click is reported back through `actions` and the editor decides what it
// means. Nothing here touches THREE or the layout rules, so the editor file
// stays about input and state rather than markup. Catalog pictures come in
// through `thumbnail`, a function the editor supplies, so the renderer that
// makes them stays out of here too.
//
// THE INSPECTOR IS BUILT ONCE PER SELECTION AND PATCHED. Rebuilding it on
// every change destroyed the colour picker under the player's pointer and the
// size field mid-keystroke; now the same nodes live for as long as the same
// item is selected, and a re-render only updates their values.
//
// SIZE IS SET IN THE ROOM, NOT HERE. The handles on the selected item (end
// arrows, corner grips — `arcade-room-decor-resize.mts`) are how a player
// resizes; the inspector shows the exact number and takes a typed one.
//
// THE INSPECTOR IS ITS OWN CARD, NOT A ROW OF THE CATALOG. It floats on the
// far side of the room from the catalog drawer, so picking a colour never
// scrolls the catalog away and a long catalog never pushes the controls out
// of sight. A selected cabinet gets one too (where it stands, hide, copy,
// remove); the rotate tools stay on the bottom bar because they act on
// whichever kind is selected.
//
// WORDS AND PICTURES ARE SET HERE. A custom sign gets a text field (every
// keystroke previews, leaving the field commits) and a custom poster gets a
// file chooser; the upload itself is the editor's business, the panel only
// hands the file over and shows the state it is told.
import { createColorPicker } from "./arcade-room-color-picker.mjs";
import { DECOR_CATEGORIES, DECOR_CATEGORY_TITLES, NEON_TINTS, decorByCategory, decorCardImage, decorExtent, decorSignText, findDecor, } from "./arcade-room-catalog/decor.mjs";
import { SURFACE_CATALOG, SURFACE_KINDS, findSurface, resolveSurfaceStyle, surfaceGroups } from "./arcade-room-catalog/surfaces.mjs";
import { ARCADE_AVATAR_CATALOG } from "./arcade-room-avatar-catalog.mjs";
export const EDITOR_TABS = Object.freeze(["cabinets", "surfaces", "decor", "avatar"]);
const SURFACE_TITLES = Object.freeze({
    floor: "Floor",
    wall: "Walls",
    ceiling: "Ceiling",
    trim: "Trim",
});
const MOUNT_TITLES = Object.freeze({ floor: "Floor", wall: "Wall", ceiling: "Ceiling" });
const AVATAR_FAMILY_TITLES = Object.freeze({ hero: "Hero", ogre: "Ogre", skeleton: "Skeleton", villager: "Villager" });
function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
function placementLabel(placement) {
    const degrees = Math.round(placement.rotationY * 180 / Math.PI);
    return `X ${placement.x.toFixed(1)} · Z ${placement.z.toFixed(1)} · ${degrees}°`;
}
/** The nearest whole degree of a wall item's spin, on one turn. */
function spinDegrees(item) {
    return Math.round(item.spin * 180 / Math.PI) % 360;
}
function decorLabel(item) {
    if (item.mount === "wall") {
        const spin = spinDegrees(item);
        return `${item.wall} wall · ${item.y.toFixed(1)} m up${spin ? ` · ${spin}°` : ""}`;
    }
    const degrees = Math.round(item.rotationY * 180 / Math.PI);
    return `${MOUNT_TITLES[item.mount]} · X ${item.x.toFixed(1)} · Z ${item.z.toFixed(1)} · ${degrees}°`;
}
/** The item's picture for its catalog card: a render of the model when one is available, else a tinted chip. */
function decorIcon(definition, thumbnail) {
    const icon = element("span", "decor-card__icon");
    icon.dataset.kind = definition.model.kind;
    const tint = definition.tint.enabled ? definition.tint.default : "#8fa3b8";
    icon.style.setProperty("--decor-tint", tint);
    const picture = decorCardImage(definition) ?? thumbnail?.(definition) ?? null;
    if (picture) {
        const image = element("img");
        image.src = picture;
        image.alt = "";
        image.decoding = "async";
        icon.dataset.picture = "true";
        icon.append(image);
    }
    else if (definition.model.kind === "text-sign") {
        icon.textContent = definition.model.text.slice(0, 4);
    }
    else {
        icon.textContent = definition.title.slice(0, 1);
    }
    return icon;
}
/** "0.6 × 0.8 m" for the inspector's size readouts. */
function extentLabel(definition, item) {
    const extent = decorExtent(definition, item);
    return `${extent.width.toFixed(1)} × ${extent.height.toFixed(1)} m`;
}
export function createEditorPanel(elements, actions, options = {}) {
    let lastCatalogCategory = null;
    let surfacesBuilt = false;
    // Which finish the surfaces tab is showing. Panel-local: it is a way of looking at the
    // catalog, not a fact about the room, so the editor never hears about it.
    let surfaceKind = "floor";
    let paint = null;
    const paintSlot = { floor: 0, wall: 0, ceiling: 0, trim: 0 };
    let avatarsBuilt = false;
    let inspector = null;
    // The cabinet inspector has no live controls, so it is simply rebuilt when this key changes.
    let cabinetInspectorKey = "";
    function renderTabs(state) {
        for (const button of elements.tabs.querySelectorAll("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
        }
        for (const panel of elements.tabPanels.querySelectorAll("[data-tab-panel]")) {
            panel.hidden = panel.dataset.tabPanel !== state.tab;
        }
    }
    function renderCabinetList(state) {
        const catalogTitle = element("span", "surface-section__group", "ADD A CABINET");
        const catalog = element("div", "cabinet-catalog");
        for (const definition of state.cabinets) {
            const add = element("button", "decor-card");
            add.type = "button";
            add.dataset.addCabinet = definition.id;
            add.title = `Add another ${definition.title}`;
            const image = element("img");
            image.src = `../grid-previews/${definition.gameSlug}.png`;
            image.alt = "";
            add.append(image, element("span", "decor-card__title", definition.title), element("small", "decor-card__meta", "Add to floor"));
            catalog.append(add);
        }
        const placedTitle = element("span", "surface-section__group", `PLACED · ${state.layout.items.length}`);
        const rows = state.layout.items.map((placement, index) => {
            const entry = state.cabinets.find((cabinet) => cabinet.id === placement.cabinetId);
            const selected = state.selection?.kind === "cabinet" && state.selection.instanceId === placement.instanceId;
            const row = element("div", "cabinet-list__row");
            row.dataset.hidden = String(placement.hidden);
            const button = element("button", "cabinet-list__item");
            button.type = "button";
            button.dataset.instanceId = placement.instanceId;
            button.setAttribute("aria-pressed", String(selected));
            button.title = `Select ${entry?.title ?? "cabinet"} (${index + 1})`;
            const image = element("img");
            image.src = `../grid-previews/${entry?.gameSlug ?? "bird-duty"}.png`;
            image.alt = "";
            const text = element("div");
            text.append(element("span", "", `CABINET ${index + 1}`), element("strong", "", entry?.title ?? placement.cabinetId), element("small", "", placement.hidden ? "Hidden · off the floor" : placementLabel(placement)));
            button.append(image, text);
            // The toggle sits beside the select button rather than inside it: a button
            // cannot contain a button, and the two are different decisions anyway.
            const toggle = element("button", "cabinet-list__toggle", placement.hidden ? "Show" : "Hide");
            toggle.type = "button";
            toggle.dataset.toggleInstanceId = placement.instanceId;
            toggle.setAttribute("aria-pressed", String(!placement.hidden));
            toggle.title = placement.hidden ? "Put this cabinet back on the floor (H)" : "Take this cabinet off the floor (H)";
            // Duplicate and Remove live on the inspector; the row only carries the one thing
            // worth seeing at a glance across the whole list, whether the cabinet is on the floor.
            row.append(button, toggle);
            return row;
        });
        elements.cabinetList.replaceChildren(catalogTitle, catalog, placedTitle, ...rows);
    }
    function buildAvatarPicker() {
        const cards = ARCADE_AVATAR_CATALOG.map((avatar) => {
            const card = element("button", "avatar-card");
            card.type = "button";
            card.dataset.avatarId = avatar.id;
            card.dataset.family = avatar.family;
            card.title = `Wear ${avatar.title}`;
            const figure = element("span", "avatar-card__figure");
            // The portrait arrives when its model has loaded; until then the family's initial
            // holds the space so the grid never jumps.
            figure.textContent = avatar.title.slice(0, 1);
            const paint = (url) => {
                const image = element("img");
                image.src = url;
                image.alt = "";
                image.decoding = "async";
                figure.replaceChildren(image);
                figure.dataset.picture = "true";
            };
            const picture = options.avatarThumbnail?.(avatar.id, paint) ?? null;
            if (picture)
                paint(picture);
            const label = element("span", "avatar-card__name", avatar.title);
            const meta = element("small", "avatar-card__meta", AVATAR_FAMILY_TITLES[avatar.family] ?? avatar.family);
            card.append(figure, label, meta);
            return card;
        });
        elements.avatarPicker.replaceChildren(...cards);
        avatarsBuilt = true;
    }
    function renderAvatarPicker(state) {
        if (!avatarsBuilt)
            buildAvatarPicker();
        for (const card of elements.avatarPicker.querySelectorAll("[data-avatar-id]")) {
            card.setAttribute("aria-pressed", String(card.dataset.avatarId === state.layout.avatarId));
        }
        if (elements.avatarCaption) {
            const chosen = ARCADE_AVATAR_CATALOG.find((avatar) => avatar.id === state.layout.avatarId);
            elements.avatarCaption.textContent = chosen ? chosen.title : "";
        }
    }
    function buildSurfacePicker(state) {
        // One finish at a time: Floor / Walls / Ceiling / Trim as chips, the way the decor
        // catalog is split by category, instead of 148 swatches in one scroll.
        const chips = element("div", "category-chips");
        for (const kind of SURFACE_KINDS) {
            const chip = element("button", "category-chip", SURFACE_TITLES[kind]);
            chip.type = "button";
            chip.dataset.surfaceChip = kind;
            chips.append(chip);
        }
        elements.surfacePicker.replaceChildren(chips, ...SURFACE_KINDS.map((kind) => {
            const section = element("section", "surface-section");
            section.dataset.surfaceKind = kind;
            // The paint block leads the section: the finish in use and its colours, before the shelf of alternatives.
            const paintBlock = element("div", "surface-paint");
            paintBlock.dataset.surfacePaint = kind;
            section.append(paintBlock);
            for (const group of surfaceGroups(kind)) {
                section.append(element("span", "surface-section__group", group));
                const grid = element("div", "swatch-grid");
                for (const entry of SURFACE_CATALOG[kind].filter((candidate) => candidate.group === group)) {
                    const swatch = element("button", "swatch");
                    swatch.type = "button";
                    swatch.dataset.surfaceKind = kind;
                    swatch.dataset.surfaceId = entry.id;
                    swatch.title = entry.title;
                    swatch.disabled = !state.inventory.owns(entry.id);
                    swatch.style.setProperty("--swatch-a", entry.swatch[0]);
                    swatch.style.setProperty("--swatch-b", entry.swatch[1]);
                    swatch.dataset.pattern = entry.style.pattern;
                    swatch.append(element("span", "swatch__chip"), element("span", "swatch__label", entry.title));
                    grid.append(swatch);
                }
                section.append(grid);
            }
            return section;
        }));
        surfacesBuilt = true;
    }
    const SLOT_NAMES = ["Base", "Accent", "Third", "Fourth"];
    /**
     * The paint block for one kind: a chip per colour slot of the chosen finish, the
     * picker for the chip that is pressed, and a way back to the catalog colours.
     */
    function renderSurfacePaint(state, kind) {
        const block = elements.surfacePicker.querySelector(`[data-surface-paint="${kind}"]`);
        const definition = findSurface(kind, state.layout.surfaces[kind]);
        if (!block || !definition)
            return;
        const slots = definition.style.colors.length;
        const key = `${kind}|${definition.id}|${slots}`;
        if (paintSlot[kind] >= slots)
            paintSlot[kind] = 0;
        if (!paint || paint.key !== key || !block.contains(paint.picker.element)) {
            if (paint?.picker.isActive())
                return;
            const title = element("span", "surface-section__group", `COLOURS · ${definition.title.toUpperCase()}`);
            const chips = element("div", "surface-paint__slots");
            const slotButtons = [];
            for (let index = 0; index < slots; index += 1) {
                const chip = element("button", "surface-paint__slot");
                chip.type = "button";
                chip.dataset.paintSlot = String(index);
                chip.dataset.paintKind = kind;
                chip.append(element("span", "surface-paint__chip"), element("span", "surface-paint__name", SLOT_NAMES[index] ?? `Colour ${index + 1}`));
                chips.append(chip);
                slotButtons.push(chip);
            }
            const picker = createColorPicker({
                presets: NEON_TINTS,
                onPreview: (hex) => actions.setSurfaceColor(kind, paintSlot[kind], hex, "preview"),
                onCommit: (hex) => actions.setSurfaceColor(kind, paintSlot[kind], hex, "commit"),
            });
            const reset = element("button", "inspector__tool surface-paint__reset", "Catalog colours");
            reset.type = "button";
            reset.dataset.paintReset = kind;
            reset.title = "Put this finish back in the colours it came with";
            const hint = element("small", "inspector__hint", slots > 1 ? "Pick a slot, then a colour. Every finish is painted from its own colours, so any pattern can be any colour." : "One colour makes this finish. Pick any colour for it.");
            block.replaceChildren(title, chips, picker.element, reset, hint);
            paint = { key, kind, slots: slotButtons, picker, reset };
        }
        const resolved = resolveSurfaceStyle(definition, state.layout.surfaceColors[kind]).colors;
        for (const [index, chip] of paint.slots.entries()) {
            chip.style.setProperty("--swatch", resolved[index] ?? "#888888");
            chip.setAttribute("aria-pressed", String(index === paintSlot[kind]));
            chip.title = `${SLOT_NAMES[index] ?? `Colour ${index + 1}`} · ${resolved[index]}`;
        }
        paint.picker.setValue(resolved[paintSlot[kind]] ?? "#888888");
        paint.reset.hidden = state.layout.surfaceColors[kind].length === 0;
    }
    function showSurfaceKind() {
        for (const chip of elements.surfacePicker.querySelectorAll("[data-surface-chip]")) {
            chip.setAttribute("aria-pressed", String(chip.dataset.surfaceChip === surfaceKind));
        }
        for (const section of elements.surfacePicker.querySelectorAll("section[data-surface-kind]")) {
            section.hidden = section.dataset.surfaceKind !== surfaceKind;
        }
    }
    function renderSurfaces(state) {
        if (!surfacesBuilt)
            buildSurfacePicker(state);
        showSurfaceKind();
        for (const swatch of elements.surfacePicker.querySelectorAll("[data-surface-id]")) {
            const kind = swatch.dataset.surfaceKind;
            swatch.setAttribute("aria-pressed", String(state.layout.surfaces[kind] === swatch.dataset.surfaceId));
        }
        renderSurfacePaint(state, surfaceKind);
    }
    function renderDecorCategories(state) {
        elements.decorCategories.replaceChildren(...DECOR_CATEGORIES.map((category) => {
            const chip = element("button", "category-chip", DECOR_CATEGORY_TITLES[category]);
            chip.type = "button";
            chip.dataset.category = category;
            chip.setAttribute("aria-pressed", String(category === state.decorCategory));
            return chip;
        }));
    }
    function renderDecorCatalog(state) {
        if (lastCatalogCategory === state.decorCategory)
            return;
        lastCatalogCategory = state.decorCategory;
        elements.decorCatalog.replaceChildren(...decorByCategory(state.decorCategory).map((definition) => {
            const card = element("button", "decor-card");
            card.type = "button";
            card.dataset.addDecor = definition.id;
            card.title = `Add ${definition.title}`;
            card.disabled = !state.inventory.owns(definition.id);
            card.append(decorIcon(definition, options.thumbnail), element("span", "decor-card__title", definition.title));
            const meta = definition.mounts.map((mount) => MOUNT_TITLES[mount]).join(" · ");
            card.append(element("small", "decor-card__meta", meta));
            // Something you can walk up to and use, not just look at: badge it so it stands out.
            if (definition.interaction) {
                card.classList.add("is-interactive");
                card.append(element("span", "decor-card__badge", "PRESS E"));
            }
            return card;
        }));
    }
    /**
     * A size row: the handles on the item in the room are the way to resize it;
     * this is the exact number for a player who wants 2.40 m and not 2.38.
     */
    function numberRow(label, min, max, step, value, dataKey, unit, hint) {
        const row = element("div", "inspector__row");
        const text = element("span", "inspector__label", label);
        const field = element("label", "inspector__number");
        const input = element("input", "inspector__number-input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.dataset[dataKey] = "true";
        input.setAttribute("aria-label", label);
        field.append(input, element("span", "inspector__unit", unit));
        row.append(text, field, element("small", "inspector__hint", hint));
        return { row, label: text, input };
    }
    function buildDecorInspector(selected, definition) {
        const heading = element("div", "inspector__heading");
        const where = element("small", "", decorLabel(selected));
        const close = element("button", "inspector__close", "×");
        close.type = "button";
        close.dataset.clearSelection = "true";
        close.title = "Deselect (Esc)";
        close.setAttribute("aria-label", "Deselect");
        heading.append(element("span", "eyebrow", "SELECTED"), element("strong", "", definition.title), where, close);
        const nodes = [heading];
        const mounts = [];
        const spins = [];
        let spinHint = null;
        let picker = null;
        let lengthLabel = null;
        let lengthInput = null;
        let scaleLabel = null;
        let scaleInput = null;
        let textInput = null;
        let pictureButton = null;
        let pictureClear = null;
        let pictureHint = null;
        if (definition.text.enabled) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Words"));
            textInput = element("input", "inspector__text");
            textInput.type = "text";
            textInput.maxLength = definition.text.maxLength;
            textInput.placeholder = decorSignText(definition, {});
            textInput.value = selected.text;
            textInput.autocomplete = "off";
            textInput.spellcheck = false;
            textInput.dataset.text = "true";
            textInput.setAttribute("aria-label", "Words on the sign");
            row.append(textInput, element("small", "inspector__hint", `One line, up to ${definition.text.maxLength} characters. The sign grows to fit.`));
            nodes.push(row);
        }
        if (definition.image.enabled) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Picture"));
            const tools = element("div", "inspector__tools");
            pictureButton = element("button", "inspector__tool", "Choose picture…");
            pictureButton.type = "button";
            pictureButton.dataset.choosePicture = selected.instanceId;
            pictureClear = element("button", "inspector__tool", "Remove picture");
            pictureClear.type = "button";
            pictureClear.dataset.clearPicture = selected.instanceId;
            tools.append(pictureButton, pictureClear);
            pictureHint = element("small", "inspector__hint");
            row.append(tools, pictureHint);
            nodes.push(row);
        }
        if (definition.mounts.length > 1) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Mount"));
            const group = element("div", "inspector__choices");
            for (const mount of definition.mounts) {
                const button = element("button", "inspector__choice", MOUNT_TITLES[mount]);
                button.type = "button";
                button.dataset.mount = mount;
                group.append(button);
                mounts.push(button);
            }
            row.append(group);
            nodes.push(row);
        }
        if (definition.spin.enabled) {
            // Horizontal or vertical is the choice most players want; Q/R steps through the
            // slants in between, and the readout under the heading names the exact angle.
            const row = element("div", "inspector__row");
            row.dataset.spinRow = "true";
            row.append(element("span", "inspector__label", "Direction"));
            const group = element("div", "inspector__choices");
            for (const [degrees, title] of [[0, "Horizontal"], [90, "Vertical"]]) {
                const button = element("button", "inspector__choice", title);
                button.type = "button";
                button.dataset.spin = String(degrees);
                group.append(button);
                spins.push(button);
            }
            spinHint = element("small", "inspector__hint");
            row.append(group, spinHint);
            nodes.push(row);
        }
        if (definition.tint.enabled) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Colour"));
            picker = createColorPicker({
                presets: NEON_TINTS,
                onPreview: (hex) => actions.setDecorColor(selected.instanceId, hex, "preview"),
                onCommit: (hex) => actions.setDecorColor(selected.instanceId, hex, "commit"),
            });
            picker.setValue(selected.color || definition.tint.default);
            row.append(picker.element);
            nodes.push(row);
        }
        if (definition.length.enabled) {
            const built = numberRow("Length", definition.length.min, definition.length.max, 0.1, selected.length || definition.length.default, "length", "m", "Drag the arrows on either end in the room, or type a length.");
            built.input.title = "Stretch ([ / ])";
            lengthLabel = built.label;
            lengthInput = built.input;
            nodes.push(built.row);
        }
        if (definition.scale.enabled) {
            const built = numberRow("Size", definition.scale.min, definition.scale.max, 0.05, selected.scale, "scale", "×", "Drag a corner grip in the room, or type a size.");
            built.input.title = "Resize (- / +)";
            scaleLabel = built.label;
            scaleInput = built.input;
            nodes.push(built.row);
        }
        const tools = element("div", "inspector__tools");
        const duplicate = element("button", "inspector__tool", "Duplicate");
        duplicate.type = "button";
        duplicate.dataset.duplicateDecor = selected.instanceId;
        duplicate.title = "Duplicate (Ctrl+D)";
        const remove = element("button", "inspector__tool inspector__tool--danger", "Remove");
        remove.type = "button";
        remove.dataset.removeDecor = selected.instanceId;
        remove.title = "Remove (Delete)";
        tools.append(duplicate, remove);
        nodes.push(tools);
        elements.decorInspector.replaceChildren(...nodes);
        return { key: `${selected.instanceId}|${selected.itemId}`, where, mounts, spins, spinHint, picker, lengthLabel, lengthInput, scaleLabel, scaleInput, textInput, pictureButton, pictureClear, pictureHint };
    }
    /** Bring the live inspector up to date with the item without touching its nodes. */
    function updateDecorInspector(refs, selected, definition, state) {
        refs.where.textContent = decorLabel(selected);
        if (refs.textInput && document.activeElement !== refs.textInput)
            refs.textInput.value = selected.text;
        if (refs.pictureButton && refs.pictureClear && refs.pictureHint) {
            const uploading = state.uploadingInstanceId === selected.instanceId;
            refs.pictureButton.disabled = !state.canUpload || uploading;
            refs.pictureButton.textContent = uploading ? "Uploading…" : selected.image ? "Change picture…" : "Choose picture…";
            refs.pictureClear.hidden = !selected.image;
            refs.pictureClear.disabled = uploading;
            refs.pictureHint.textContent = !state.canUpload
                ? "Sign in to upload a picture for this frame."
                : uploading
                    ? "Sending your picture to the platform…"
                    : selected.image
                        ? `JPEG, PNG or WebP up to 10 MB. Shape ${selected.aspect >= 1 ? `${selected.aspect.toFixed(2)} : 1` : `1 : ${(1 / selected.aspect).toFixed(2)}`}.`
                        : "JPEG, PNG or WebP up to 10 MB. The frame takes the picture's shape.";
        }
        for (const button of refs.mounts)
            button.setAttribute("aria-pressed", String(button.dataset.mount === selected.mount));
        if (refs.spins.length) {
            const onWall = selected.mount === "wall";
            const degrees = spinDegrees(selected);
            for (const button of refs.spins) {
                button.setAttribute("aria-pressed", String(onWall && Number(button.dataset.spin) === degrees));
                button.disabled = !onWall;
            }
            refs.spinHint.textContent = !onWall
                ? "On the floor or ceiling, Q / R turn it round instead."
                : degrees === 0 || degrees === 90
                    ? "Q / R turn it 15° at a time for a slant."
                    : `Slanted ${degrees}° · Q / R turn it 15° at a time.`;
        }
        refs.picker?.setValue(selected.color || definition.tint.default);
        if (refs.lengthLabel && refs.lengthInput) {
            const length = selected.length || definition.length.default;
            refs.lengthLabel.textContent = `Length · ${length.toFixed(2)} m`;
            if (document.activeElement !== refs.lengthInput)
                refs.lengthInput.value = length.toFixed(2);
        }
        if (refs.scaleLabel && refs.scaleInput) {
            refs.scaleLabel.textContent = `Size · ×${selected.scale.toFixed(2)} · ${extentLabel(definition, selected)}`;
            if (document.activeElement !== refs.scaleInput)
                refs.scaleInput.value = selected.scale.toFixed(2);
        }
    }
    /** A selected cabinet's card: what it is, where it stands, and the three things to do with it. */
    function renderCabinetInspector(placement, state) {
        const entry = state.cabinets.find((cabinet) => cabinet.id === placement.cabinetId);
        const index = state.layout.items.findIndex((item) => item.instanceId === placement.instanceId);
        const key = `cabinet|${placement.instanceId}|${placement.hidden}|${placementLabel(placement)}`;
        if (cabinetInspectorKey === key)
            return;
        cabinetInspectorKey = key;
        const heading = element("div", "inspector__heading");
        const close = element("button", "inspector__close", "×");
        close.type = "button";
        close.dataset.clearSelection = "true";
        close.title = "Deselect (Esc)";
        close.setAttribute("aria-label", "Deselect");
        heading.append(element("span", "eyebrow", `CABINET ${index + 1}`), element("strong", "", entry?.title ?? placement.cabinetId), element("small", "", placement.hidden ? "Hidden · off the floor" : placementLabel(placement)), close);
        const figure = element("div", "inspector__figure");
        const image = element("img");
        image.src = `../grid-previews/${entry?.gameSlug ?? "bird-duty"}.png`;
        image.alt = "";
        figure.append(image);
        const tools = element("div", "inspector__tools inspector__tools--three");
        const toggle = element("button", "inspector__tool", placement.hidden ? "Show" : "Hide");
        toggle.type = "button";
        toggle.dataset.toggleInstanceId = placement.instanceId;
        toggle.title = placement.hidden ? "Put this cabinet back on the floor (H)" : "Take this cabinet off the floor (H)";
        const duplicate = element("button", "inspector__tool", "Duplicate");
        duplicate.type = "button";
        duplicate.dataset.duplicateCabinet = placement.instanceId;
        duplicate.title = "Duplicate this cabinet (Ctrl+D)";
        const remove = element("button", "inspector__tool inspector__tool--danger", "Remove");
        remove.type = "button";
        remove.dataset.removeCabinet = placement.instanceId;
        remove.title = "Remove this cabinet (Delete)";
        tools.append(toggle, duplicate, remove);
        const hint = element("small", "inspector__hint", "Drag it in the room · arrows nudge · Q / R rotate.");
        elements.decorInspector.replaceChildren(heading, figure, tools, hint);
    }
    function renderInspector(state) {
        const cabinet = state.selection?.kind === "cabinet"
            ? state.layout.items.find((item) => item.instanceId === state.selection.instanceId)
            : undefined;
        if (cabinet) {
            inspector = null;
            elements.decorInspector.hidden = false;
            elements.decorInspector.dataset.kind = "cabinet";
            renderCabinetInspector(cabinet, state);
            return;
        }
        cabinetInspectorKey = "";
        const selected = state.selection?.kind === "decor"
            ? state.layout.decor.find((item) => item.instanceId === state.selection.instanceId)
            : undefined;
        const definition = selected ? findDecor(selected.itemId) : undefined;
        if (!selected || !definition) {
            inspector = null;
            elements.decorInspector.hidden = true;
            delete elements.decorInspector.dataset.kind;
            elements.decorInspector.replaceChildren();
            return;
        }
        elements.decorInspector.hidden = false;
        elements.decorInspector.dataset.kind = "decor";
        const key = `${selected.instanceId}|${selected.itemId}`;
        if (!inspector || inspector.key !== key) {
            inspector = buildDecorInspector(selected, definition);
        }
        updateDecorInspector(inspector, selected, definition, state);
    }
    function renderDecorPlaced(state) {
        const rows = state.layout.decor.map((item) => {
            const definition = findDecor(item.itemId);
            const selected = state.selection?.kind === "decor" && state.selection.instanceId === item.instanceId;
            const row = element("div", "placed-list__row");
            const button = element("button", "placed-list__item");
            button.type = "button";
            button.dataset.decorInstanceId = item.instanceId;
            button.setAttribute("aria-pressed", String(selected));
            const dot = element("span", "placed-list__dot");
            dot.style.setProperty("--tint", item.color || definition?.tint.default || "#8fa3b8");
            const text = element("div");
            const name = definition?.text.enabled && item.text ? `${definition.title} · “${item.text}”` : definition?.title ?? item.itemId;
            text.append(element("strong", "", name), element("small", "", decorLabel(item)));
            button.append(dot, text);
            const remove = element("button", "placed-list__remove", "×");
            remove.type = "button";
            remove.dataset.removeDecor = item.instanceId;
            remove.title = "Remove";
            row.append(button, remove);
            return row;
        });
        const title = element("span", "surface-section__group", rows.length ? `PLACED · ${rows.length}` : "NOTHING PLACED YET");
        const starterIds = new Set(["neon-strip-1", "neon-strip-2", "neon-strip-3"]);
        const starterCount = state.layout.decor.filter((item) => starterIds.has(item.instanceId)).length;
        const clearStarter = element("button", "placed-list__clear", "Remove starter neon");
        clearStarter.type = "button";
        clearStarter.dataset.removeStarterNeon = "true";
        clearStarter.hidden = starterCount === 0;
        clearStarter.title = `Remove ${starterCount} starter neon ${starterCount === 1 ? "bar" : "bars"}`;
        elements.decorPlaced.replaceChildren(title, clearStarter, ...rows);
    }
    let lastState = null;
    function render(state) {
        lastState = state;
        renderTabs(state);
        renderCabinetList(state);
        renderSurfaces(state);
        renderDecorCategories(state);
        renderDecorCatalog(state);
        renderInspector(state);
        renderDecorPlaced(state);
        renderAvatarPicker(state);
    }
    elements.tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        const tab = button?.dataset.tab;
        if (!button || !tab || !EDITOR_TABS.includes(tab))
            return;
        // The active tab's button is the drawer's handle: press it to tuck the catalog away and
        // see the whole room, press it again to bring the catalog back. Any other tab reopens it.
        const drawer = elements.drawer;
        if (drawer && button.getAttribute("aria-selected") === "true") {
            drawer.hidden = !drawer.hidden;
            elements.tabs.dataset.collapsed = String(drawer.hidden);
            return;
        }
        if (drawer) {
            drawer.hidden = false;
            elements.tabs.dataset.collapsed = "false";
        }
        actions.selectTab(tab);
    });
    elements.cabinetList.addEventListener("click", (event) => {
        const target = event.target;
        const add = target.closest("[data-add-cabinet]");
        if (add?.dataset.addCabinet) {
            actions.addCabinet(add.dataset.addCabinet);
            return;
        }
        const remove = target.closest("[data-remove-cabinet]");
        if (remove?.dataset.removeCabinet) {
            actions.removeCabinet(remove.dataset.removeCabinet);
            return;
        }
        const duplicate = target.closest("[data-duplicate-cabinet]");
        if (duplicate?.dataset.duplicateCabinet) {
            actions.duplicateCabinet(duplicate.dataset.duplicateCabinet);
            return;
        }
        const toggle = target.closest("[data-toggle-instance-id]");
        if (toggle?.dataset.toggleInstanceId) {
            actions.toggleCabinetHidden(toggle.dataset.toggleInstanceId);
            return;
        }
        const button = target.closest("[data-instance-id]");
        if (button?.dataset.instanceId)
            actions.selectCabinet(button.dataset.instanceId);
    });
    elements.surfacePicker.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-surface-chip]");
        if (chip?.dataset.surfaceChip) {
            surfaceKind = chip.dataset.surfaceChip;
            showSurfaceKind();
            if (lastState)
                renderSurfacePaint(lastState, surfaceKind);
            return;
        }
        const swatch = event.target.closest("[data-surface-id]");
        if (swatch && !swatch.disabled) {
            actions.setSurface(swatch.dataset.surfaceKind, swatch.dataset.surfaceId);
            return;
        }
        const slot = event.target.closest("[data-paint-slot]");
        if (slot) {
            const kind = slot.dataset.paintKind;
            paintSlot[kind] = Number(slot.dataset.paintSlot);
            if (lastState)
                renderSurfacePaint(lastState, kind);
            return;
        }
        const reset = event.target.closest("[data-paint-reset]");
        if (reset)
            actions.resetSurfaceColors(reset.dataset.paintReset);
    });
    elements.avatarPicker.addEventListener("click", (event) => {
        const card = event.target.closest("[data-avatar-id]");
        if (card?.dataset.avatarId)
            actions.setAvatar(card.dataset.avatarId);
    });
    elements.decorCategories.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-category]");
        if (chip?.dataset.category)
            actions.setDecorCategory(chip.dataset.category);
    });
    elements.decorCatalog.addEventListener("click", (event) => {
        const card = event.target.closest("[data-add-decor]");
        if (card && !card.disabled)
            actions.addDecor(card.dataset.addDecor);
    });
    const inspectorClick = (event) => {
        const target = event.target;
        if (target.closest("[data-remove-starter-neon]")) {
            actions.removeStarterNeon();
            return;
        }
        if (target.closest("[data-clear-selection]")) {
            actions.clearSelection();
            return;
        }
        const cabinetToggle = target.closest("[data-toggle-instance-id]");
        if (cabinetToggle?.dataset.toggleInstanceId) {
            actions.toggleCabinetHidden(cabinetToggle.dataset.toggleInstanceId);
            return;
        }
        const cabinetDuplicate = target.closest("[data-duplicate-cabinet]");
        if (cabinetDuplicate?.dataset.duplicateCabinet) {
            actions.duplicateCabinet(cabinetDuplicate.dataset.duplicateCabinet);
            return;
        }
        const cabinetRemove = target.closest("[data-remove-cabinet]");
        if (cabinetRemove?.dataset.removeCabinet) {
            actions.removeCabinet(cabinetRemove.dataset.removeCabinet);
            return;
        }
        const remove = target.closest("[data-remove-decor]");
        if (remove?.dataset.removeDecor) {
            actions.removeDecor(remove.dataset.removeDecor);
            return;
        }
        const duplicate = target.closest("[data-duplicate-decor]");
        if (duplicate?.dataset.duplicateDecor) {
            actions.duplicateDecor(duplicate.dataset.duplicateDecor);
            return;
        }
        const select = target.closest("[data-decor-instance-id]");
        if (select?.dataset.decorInstanceId) {
            actions.selectDecor(select.dataset.decorInstanceId);
            return;
        }
        const choose = target.closest("[data-choose-picture]");
        if (choose?.dataset.choosePicture && !choose.disabled) {
            pickPicture(choose.dataset.choosePicture);
            return;
        }
        const clear = target.closest("[data-clear-picture]");
        if (clear?.dataset.clearPicture) {
            actions.clearDecorImage(clear.dataset.clearPicture);
            return;
        }
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId)
            return;
        const mount = target.closest("[data-mount]");
        if (mount?.dataset.mount)
            actions.setDecorMount(selectedId, mount.dataset.mount);
        const spin = target.closest("[data-spin]");
        if (spin?.dataset.spin !== undefined && !spin.disabled)
            actions.setDecorSpin(selectedId, Number(spin.dataset.spin));
    };
    // One hidden file input for the whole panel, living outside the inspector so a rebuild
    // never drops it mid-pick; the browser's own picker is the UI.
    const fileInput = element("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.hidden = true;
    let pickingFor = "";
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        const instanceId = pickingFor;
        pickingFor = "";
        fileInput.value = "";
        if (file && instanceId)
            actions.uploadDecorImage(instanceId, file);
    });
    elements.tabPanels.append(fileInput);
    function pickPicture(instanceId) {
        pickingFor = instanceId;
        fileInput.click();
    }
    elements.decorInspector.addEventListener("click", inspectorClick);
    elements.decorPlaced.addEventListener("click", inspectorClick);
    // A number field fires `input` on every keystroke or spinner step and `change` when it is left.
    const numberEdit = (event, phase) => {
        const target = event.target;
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId || !(target instanceof HTMLInputElement) || target.type !== "number")
            return;
        const value = Number(target.value);
        if (!Number.isFinite(value) || value <= 0)
            return;
        if (target.dataset.length)
            actions.setDecorLength(selectedId, value, phase);
        if (target.dataset.scale)
            actions.setDecorScale(selectedId, value, phase);
    };
    const textEdit = (event, phase) => {
        const target = event.target;
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId || !(target instanceof HTMLInputElement) || !target.dataset.text)
            return;
        actions.setDecorText(selectedId, target.value, phase);
    };
    elements.decorInspector.addEventListener("input", (event) => { numberEdit(event, "preview"); textEdit(event, "preview"); });
    elements.decorInspector.addEventListener("change", (event) => { numberEdit(event, "commit"); textEdit(event, "commit"); });
    return Object.freeze({ render });
}
