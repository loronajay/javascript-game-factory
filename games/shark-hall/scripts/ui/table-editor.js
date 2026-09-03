// The table editor's interface: a bar, a drag surface, and a tray.
//
// It owns DOM and pointers and nothing else. Every decision about what an item
// is, whether it may be equipped, and what "dirty" means lives in
// `cosmetics/` — this file renders that and sends clicks back. The rule it
// exists to keep is that a cosmetic editor is a VIEW of a loadout, not a second
// place where loadout rules are written.
//
// THE LAYOUT IS NOT THE DESKTOP ONE STACKED. On a wide screen the tray is a
// docked strip under a large table with the categories along its top; on a
// phone it is a bottom sheet with bigger chips and a horizontally scrolling tab
// rail, and the save affordance stays on screen rather than at the top of a
// bar the player has scrolled away from. Both of those are CSS — see
// `styles/editor.css` — because the two layouts show the same tray, and forking
// the markup would be forking the behaviour.
//
// THE MIDDLE OF THE SCREEN IS A CAMERA CONTROL. One pointer orbits, the wheel
// and a two-finger pinch zoom. It is a bare div over the canvas rather than the
// canvas itself, so the editor's gestures cannot be confused with the aiming
// controls that are also bound to that canvas.

import { findItem, itemsForSlot, presetsOfType } from "../cosmetics/catalog.js";
import { HALL_SLOTS, TABLE_SLOTS } from "../cosmetics/types.js";

/** Drag sensitivity, in radians per CSS pixel. */
const ORBIT_SPEED = 0.008;
/** Wheel and pinch sensitivity, in metres of camera distance. */
const ZOOM_SPEED = 0.0016;

/** The tab rail: presets first, then the table, then the room. */
const CATEGORIES = [
  { key: "presets", domain: "table", label: "Presets", presets: "table-preset" },
  ...TABLE_SLOTS.map((slot) => ({ key: `table.${slot.key}`, domain: "table", slot, label: slot.name })),
  { key: "room-presets", domain: "hall", label: "Room presets", presets: "hall-room-preset", group: "room" },
  ...HALL_SLOTS.map((slot) => ({ key: `hall.${slot.key}`, domain: "hall", slot, label: slot.name, group: "room" })),
];

/**
 * A CSS background that stands for an item, built from its render payload.
 *
 * The chips have to show the DIFFERENCE between five timbers, and five brown
 * squares would not — so a wood swatch is its own three-stop grain gradient with
 * its ink colour striped over it, a ball set is a row of its actual solids, and
 * a metal is a lit bevel. It is the same data the 3D material is built from, so
 * a chip cannot show one thing and the table another.
 */
export function swatchStyle(item) {
  const p = item?.presentation;
  if (!p) return "linear-gradient(135deg,#2b3440,#171c23)";

  if (p.grain) {
    const [top, mid, base] = p.grain;
    const [light] = p.ink;
    const grain = p.grainStyle === "lacquer"
      ? `linear-gradient(115deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 42%)`
      : `repeating-linear-gradient(${p.grainStyle === "brushed" ? "90deg" : "3deg"}, ${light}22 0 2px, transparent 2px ${p.grainStyle === "straight" ? "5px" : "9px"})`;
    return `${grain}, linear-gradient(160deg, ${top}, ${mid} 48%, ${base})`;
  }
  if (p.solids) {
    const stops = [p.cue, ...p.solids, p.eight];
    const step = 100 / stops.length;
    return `linear-gradient(90deg, ${stops.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(",")})`;
  }
  if (p.colors) return `linear-gradient(135deg, ${p.colors[1]}, ${p.colors[0]} 55%, ${p.colors[2]})`;
  if (p.art) return `linear-gradient(90deg, ${p.art.join(",")})`;
  if (p.cues) return `linear-gradient(135deg, ${p.wood}, ${p.metal})`;
  if (p.metal) return `linear-gradient(150deg, ${p.metal}, ${p.accent ?? p.plate ?? "#111"})`;
  if (p.warm) return `radial-gradient(circle at 50% 30%, ${p.bulb}, ${p.shade} 62%, ${p.bar})`;
  if (p.glass) return `linear-gradient(160deg, ${p.glass}, ${p.frame})`;
  if (p.liner) return `linear-gradient(150deg, ${p.liner}, ${p.mouth})`;
  if (p.border) return `linear-gradient(150deg, ${p.color}, ${p.border} 78%)`;
  if (p.backing) return `linear-gradient(150deg, ${p.color}44, ${p.backing})`;
  if (p.upholstery) return `linear-gradient(150deg, ${p.upholstery}, ${p.wood})`;
  if (p.color && p.noise !== undefined) {
    // Cloth: the colour with a dusting, so a napped burgundy does not read as a
    // flat rectangle of the same burgundy a lacquer would give.
    return `repeating-linear-gradient(45deg, #ffffff0d 0 1px, transparent 1px 3px), linear-gradient(160deg, ${p.color}, ${p.color})`;
  }
  if (p.color) return `linear-gradient(150deg, ${p.color}, ${p.color})`;
  if (p.sideColor) return `linear-gradient(150deg, ${p.color}, ${p.sideColor})`;
  return "linear-gradient(135deg,#2b3440,#171c23)";
}

/** Whether a loadout already wears every slot a preset assigns. */
function matchesPreset(preset, equipped) {
  return Object.entries(preset.slots).every(([key, id]) => (equipped[key] ?? null) === (id ?? null));
}

/**
 * A preset's chip: the table it makes, in three bands.
 *
 * Cloth across the top because that is what the player sees first, the rail
 * timber under it, and a sliver of the hardware. Built from the preset's own
 * items, so a preset cannot advertise a table it does not produce.
 */
function presetSwatch(preset) {
  const colorOf = (id, pick) => {
    const item = findItem(id);
    return item ? pick(item.presentation) : null;
  };
  const cloth = colorOf(preset.slots.cloth ?? preset.slots.walls, (p) => p.color) ?? "#2a4666";
  const wood = colorOf(preset.slots.rail ?? preset.slots.floor, (p) => (p.grain ? p.grain[1] : p.colors?.[1])) ?? "#432616";
  const metal = colorOf(preset.slots.hardware ?? preset.slots.hangingLight, (p) => p.color ?? p.bulb) ?? "#c79a4f";
  return `linear-gradient(180deg, ${cloth} 0 58%, ${wood} 58% 86%, ${metal} 86% 100%)`;
}

export function createEditorView({ elements, editor, scene, audio, inventory, onExit } = {}) {
  let category = CATEGORIES[0];
  let open = false;
  /** What Back should do once the unsaved-changes question is answered. */
  let pendingExit = null;
  /** Live pointers on the drag surface, so a pinch can be told from a drag. */
  const pointers = new Map();
  let lastPinch = 0;

  const click = (element, handler) =>
    element?.addEventListener("click", (event) => {
      audio?.unlock();
      audio?.click();
      handler(event);
    });

  // --- the tab rail -------------------------------------------------------
  function renderTabs() {
    const tabs = elements.editorTabs;
    if (!tabs) return;
    tabs.textContent = "";
    let group = null;
    for (const entry of CATEGORIES) {
      if (entry.group !== group) {
        group = entry.group;
        if (group === "room") {
          const divider = document.createElement("span");
          divider.className = "tab-divider";
          divider.textContent = "Room";
          tabs.appendChild(divider);
        }
      }
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `tray-tab${entry.key === category.key ? " active" : ""}`;
      tab.textContent = entry.label;
      tab.dataset.category = entry.key;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(entry.key === category.key));
      tabs.appendChild(tab);
    }
  }

  // --- the tray -----------------------------------------------------------
  /** One chip. `state` is the whole reason the editor reads as an editor. */
  function chip({ id, name, note, style, state, locked, rarity }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tray-chip${state ? ` ${state}` : ""}${locked ? " locked" : ""}`;
    button.dataset.item = id ?? "";
    button.disabled = Boolean(locked);

    const swatch = document.createElement("span");
    swatch.className = "chip-swatch";
    swatch.style.background = style;
    if (rarity) swatch.dataset.rarity = rarity;
    button.appendChild(swatch);

    const label = document.createElement("span");
    label.className = "chip-name";
    label.textContent = name;
    button.appendChild(label);

    const badge = document.createElement("span");
    badge.className = "chip-state";
    // Equipped means saved; Previewing means it is on the table but not yet in
    // the account. The player has to be able to tell those apart at a glance or
    // "Save table" is a button with no visible meaning.
    badge.textContent = locked ? "Locked" : state === "equipped" ? "Equipped" : state === "previewing" ? "Previewing" : note || "";
    button.appendChild(badge);
    return button;
  }

  function renderGrid() {
    const grid = elements.editorGrid;
    if (!grid) return;
    grid.textContent = "";

    if (category.presets) {
      const working = editor.working[category.domain];
      const saved = editor.saved[category.domain];
      for (const preset of presetsOfType(category.presets)) {
        // A preset chip is BUILT FROM THE PRESET, not from one house gradient:
        // five identical gold rectangles would tell the player nothing about the
        // five tables behind them, which is the same failure as five brown woods.
        grid.appendChild(chip({
          id: preset.id,
          name: preset.name,
          note: "Apply",
          style: presetSwatch(preset),
          rarity: preset.rarity,
          // A preset already applied in full reads back, so re-clicking it is
          // visibly a no-op rather than a mystery — and it distinguishes the
          // same two states every other chip does: on the table, versus on the
          // account. A preset applied but not saved is Previewing, like anything
          // else that has not been committed.
          state: !matchesPreset(preset, working) ? "" : matchesPreset(preset, saved) ? "equipped" : "previewing",
          locked: !inventory.isOwned(preset.id),
        }));
      }
      return;
    }

    const { domain, slot } = category;
    const working = editor.working[domain][slot.key] ?? null;
    const saved = editor.saved[domain][slot.key] ?? null;
    const stateOf = (id) => (working === id ? (saved === id ? "equipped" : "previewing") : "");

    if (!slot.required) {
      grid.appendChild(chip({ id: "", name: "None", note: "Empty", style: "repeating-linear-gradient(45deg,#20262e 0 6px,#171c23 6px 12px)", state: stateOf(null) }));
    }
    for (const entry of itemsForSlot(slot)) {
      grid.appendChild(chip({
        id: entry.id,
        name: entry.name,
        note: entry.entitlement ? "Reward" : "",
        style: swatchStyle(entry),
        rarity: entry.rarity,
        state: stateOf(entry.id),
        locked: !inventory.isOwned(entry.id),
      }));
    }
  }

  // --- the bar ------------------------------------------------------------
  function renderBar() {
    if (elements.editorTableName) elements.editorTableName.textContent = editor.activeName;
    if (elements.editorSave) {
      elements.editorSave.disabled = !editor.dirty;
      elements.editorSave.textContent = editor.dirty ? "Save table" : "Saved";
    }
    if (elements.editorStatus) {
      // The one line in the editor that must never flatter. A guest's table is
      // real and previewable and it is not on their account, and saying so is
      // better than a Save button that quietly does nothing.
      elements.editorStatus.textContent = !editor.canSave
        ? "Sign in to keep this table on your Factory account"
        : editor.dirty
          ? "Unsaved previews"
          : editor.status === "error"
            ? "Saved here — retrying the Factory"
            : "Saved to your Factory account";
      elements.editorStatus.classList.toggle("warn", !editor.canSave || editor.dirty);
    }

    const picker = elements.editorTables;
    if (picker) {
      const entries = editor.entries;
      picker.textContent = "";
      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.name;
        if (entry.active) option.selected = true;
        picker.appendChild(option);
      }
      picker.hidden = entries.length < 2;
    }
  }

  function render() {
    if (!open) return;
    renderTabs();
    renderGrid();
    renderBar();
  }

  // --- events -------------------------------------------------------------
  elements.editorTabs?.addEventListener("click", (event) => {
    const key = event.target.closest("[data-category]")?.dataset.category;
    const next = CATEGORIES.find((entry) => entry.key === key);
    if (!next) return;
    audio?.click();
    category = next;
    render();
  });

  elements.editorGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-item]");
    if (!button) return;
    audio?.unlock();
    audio?.click();
    const id = button.dataset.item || null;
    if (category.presets) editor.applyPreset(id);
    else editor.preview(category.domain, category.slot.key, id);
    render();
  });

  click(elements.editorSave, () => {
    editor.save();
    render();
  });
  click(elements.editorReset, () => {
    editor.reset();
    render();
  });
  click(elements.editorSaveAs, () => {
    // `prompt` is the one browser dialog this cabinet uses, and only here: it is
    // a name for a thing the player just made, it blocks nothing that is
    // animating, and a bespoke naming modal would be a screen to maintain for
    // one string.
    const name = globalThis.prompt?.("Name this table", editor.activeName);
    if (name === null || name === undefined) return;
    if (!editor.saveAs(name)) {
      if (elements.editorStatus) elements.editorStatus.textContent = "That is as many tables as one account keeps";
      return;
    }
    render();
  });

  elements.editorTables?.addEventListener("change", () => {
    const id = elements.editorTables.value;
    // Switching tables throws working previews away, so it asks first — the same
    // question Back asks, routed to the same prompt.
    if (editor.dirty) return askUnsaved(() => editor.select(id));
    editor.select(id);
    render();
  });

  // --- the unsaved-changes question ---------------------------------------
  function askUnsaved(then) {
    pendingExit = then;
    elements.editorPrompt?.classList.add("show");
  }
  function closePrompt() {
    pendingExit = null;
    elements.editorPrompt?.classList.remove("show");
  }
  click(elements.promptSave, () => {
    editor.save();
    const then = pendingExit;
    closePrompt();
    then?.();
    render();
  });
  click(elements.promptDiscard, () => {
    editor.discard();
    const then = pendingExit;
    closePrompt();
    then?.();
    render();
  });
  click(elements.promptCancel, () => {
    closePrompt();
    render();
  });

  function leave() {
    if (editor.dirty) return askUnsaved(() => exit());
    exit();
  }
  function exit() {
    open = false;
    elements.tableEditor?.classList.remove("show");
    document.body.classList.remove("editing");
    closePrompt();
    onExit?.();
  }
  click(elements.editorBack, leave);

  // --- orbit and zoom -----------------------------------------------------
  const stage = elements.editorStage;
  stage?.addEventListener("pointerdown", (event) => {
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastPinch = 0;
  });
  stage?.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      // Two fingers: the distance between them is the zoom, and the drag is
      // ignored. Mixing the two makes a pinch drift the camera sideways.
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) {
        const orbit = scene.getOrbit();
        scene.setOrbit({ distance: orbit.distance - (spread - lastPinch) * ZOOM_SPEED * 4 });
      }
      lastPinch = spread;
      return;
    }

    const orbit = scene.getOrbit();
    scene.setOrbit({
      yaw: orbit.yaw - (event.clientX - previous.x) * ORBIT_SPEED,
      // Dragging DOWN lowers the camera, which is the direction every orbit
      // control in the world moves: the player is pulling the table towards
      // them, not pushing the camera over the top of it.
      pitch: orbit.pitch - (event.clientY - previous.y) * ORBIT_SPEED,
    });
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) lastPinch = 0;
  };
  stage?.addEventListener("pointerup", release);
  stage?.addEventListener("pointercancel", release);
  stage?.addEventListener("wheel", (event) => {
    event.preventDefault();
    scene.setOrbit({ distance: scene.getOrbit().distance + event.deltaY * ZOOM_SPEED });
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    if (elements.editorPrompt?.classList.contains("show")) closePrompt();
    else leave();
  });

  return {
    get isOpen() {
      return open;
    },

    /** Open the editor over the live table. The camera is swung, not cut. */
    async show() {
      open = true;
      elements.tableEditor?.classList.add("show");
      // The playing chrome is still in this document behind the editor — the
      // header, the plaques, the control deck, the arcade link that sits exactly
      // where the editor's Back does. One class puts the cabinet away.
      document.body.classList.add("editing");
      if (!editor.isLoaded) await editor.load();
      render();
    },

    /** Redraw after something outside changed — a store sync landing, say. */
    refresh: render,
    close: exit,
  };
}
