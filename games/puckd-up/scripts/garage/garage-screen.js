// The Garage: the editor screen, wired to the account.
//
// THE PREVIEW IS THE GAME. There is no preview scene and no preview mallet —
// the panel sits over the cabinet's own canvas and every edit is pushed
// straight into the live view through `equipPlayer`, which is the same call the
// match makes. Match View is literally the match camera. That is why a design
// cannot look different once play starts: there is nothing else to look at.
//
// EDITS ARE IN MEMORY UNTIL SAVE & EQUIP. The store holds the working copy and
// the account holds the truth; this screen only ever reports what the store
// says, so SAVED means the API accepted it and SAVE FAILED means it did not.
//
// ONE SLOT AT A TIME. A player keeps several designs, and the one being EDITED
// is always the one EQUIPPED — picking a slot equips it. That is why there is no
// "apply to slot" step to get wrong and no way for the panel to be editing a
// design that is not the one on the table behind it.
//
// MY HALF ONLY. There is no side selector here and no hidden one: the table tab
// edits `tableHalf`, the renderer is handed `'player'`, and the opponent's half
// is drawn from the rival's kit or their own public loadout. The absence is the
// feature.

import {
  MALLET_GROUPS, TABLE_GROUPS, COLOR_SWATCHES, readPath, writePath,
} from "./garage-fields.js";
import { DECALS, DECAL_GROUPS } from "../cosmetics/decal-catalog.js";
import { TABLE_SURFACE_BY_ID, TABLE_RAIL_BY_ID, TABLE_GOAL_BY_ID } from "../cosmetics/catalog.js";
import {
  applyShapePreset, applyMaterialPreset, applySurfacePreset, applyRailPreset, applyGoalPreset,
  matchingShapePresetId, matchingMaterialPresetId,
  equippedLoadout, replaceLoadout, selectLoadout, addLoadout, removeLoadout, renameLoadout,
  MAX_LOADOUTS,
} from "../cosmetics/loadout.js";
import {
  STATUS_SIGNED_OUT, STATUS_LOADING, STATUS_SAVED, STATUS_UNSAVED, STATUS_SAVING, STATUS_ERROR,
} from "./garage-store.js";

const PRESET_APPLIERS = {
  shape: applyShapePreset,
  material: applyMaterialPreset,
  surface: applySurfacePreset,
  rails: applyRailPreset,
  goal: applyGoalPreset,
};

/** Where an inspect camera sits, in the player's half. */
const CAMERA_MODES = [
  { id: "match", name: "Match view" },
  { id: "mallet", name: "Mallet", target: [0, 0.35, 5.8], distance: 3.4 },
  { id: "table", name: "Table", target: [0, 0.1, 4.6], distance: 10.5 },
];

const STATUS_COPY = {
  [STATUS_SIGNED_OUT]: { label: "Sign in to save", tone: "muted" },
  [STATUS_LOADING]: { label: "Loading…", tone: "muted" },
  [STATUS_SAVED]: { label: "Saved to your account", tone: "ok" },
  [STATUS_UNSAVED]: { label: "Unsaved changes", tone: "warn" },
  [STATUS_SAVING]: { label: "Saving…", tone: "muted" },
  [STATUS_ERROR]: { label: "Save failed", tone: "bad" },
};

export function createGarageScreen({ doc, match, view, store }) {
  const abort = new AbortController(), options = { signal: abort.signal };
  const el = Object.fromEntries(
    ["garageScreen", "garageEditor", "garageTabs", "garageCamera", "garageSave", "garageStatus",
     "garageStatusNote", "garageRevert", "garageBack", "garageCollision",
     "garageSlotRow", "garageSlotName", "garageSlotNew", "garageSlotCopy", "garageSlotDelete"]
      .map((id) => {
        const node = doc.getElementById(id);
        if (!node) throw new Error(`Missing garage element: ${id}`);
        return [id, node];
      }),
  );

  let tab = "mallet";
  let cameraMode = "match";
  // Every rendered control, so a document change refreshes values without
  // rebuilding the panel and losing focus mid-drag.
  const controls = [];

  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /** The design under the cursor: the equipped slot of the working copy. */
  const editing = () => equippedLoadout(store.garage);

  function commit(next) {
    store.update(next);
    view.equipPlayer(store.editing);
    refreshValues();
    refreshSlots();
    refreshStatus();
  }

  /** Every control edits the EQUIPPED loadout, addressed by id rather than index. */
  function setPath(path, value) {
    commit(replaceLoadout(store.garage, writePath(editing(), path, value)));
  }

  /**
   * Which preset a section still IS, or null for CUSTOM.
   *
   * Derived by comparing the live numbers to the preset, never by trusting the
   * stored id — so the editor cannot claim a preset the player has edited away
   * from, and moving a slider back reports the preset again.
   */
  function activePresetId(field) {
    const loadout = editing();
    if (field.apply === "shape") return matchingShapePresetId(loadout.mallet.geometry);
    if (field.apply === "material") return matchingMaterialPresetId(loadout.mallet.material);
    const [lookup, section, key] = {
      surface: [TABLE_SURFACE_BY_ID, loadout.tableHalf.surface, "surface"],
      rails: [TABLE_RAIL_BY_ID, loadout.tableHalf.rails, "rails"],
      goal: [TABLE_GOAL_BY_ID, loadout.tableHalf.goal, "goal"],
    }[field.apply] ?? [];
    if (!lookup) return readPath(loadout, field.path);
    const preset = lookup.get(section.preset);
    if (!preset) return null;
    return Object.entries(preset[key]).every(([name, value]) => section[name] === value) ? preset.id : null;
  }

  // ---------------------------------------------------------------------------
  // CONTROLS
  // ---------------------------------------------------------------------------

  function buildChips(field) {
    const row = make("div", "garageField garageFieldWide");
    const head = make("div", "garageFieldHead");
    head.append(make("span", "garageFieldLabel", field.label));
    const state = make("span", "garageFieldValue");
    head.append(state);
    row.append(head);
    const grid = make("div", "garageChips");
    const buttons = field.options.map((option) => {
      const button = make("button", "garageChip");
      button.type = "button";
      button.append(make("b", null, option.name));
      if (option.blurb) button.append(make("small", null, option.blurb));
      button.addEventListener("click", () => {
        const applier = PRESET_APPLIERS[field.apply];
        commit(applier
          ? applier(store.garage, option.id)
          : replaceLoadout(store.garage, writePath(editing(), field.path, option.id)));
      }, options);
      grid.append(button);
      return { id: option.id, button };
    });
    row.append(grid);
    controls.push({
      node: row,
      sync() {
        const active = activePresetId(field);
        state.textContent = active ? "" : "CUSTOM";
        state.classList.toggle("isCustom", !active);
        for (const entry of buttons) {
          const selected = entry.id === active;
          entry.button.classList.toggle("selected", selected);
          entry.button.setAttribute("aria-pressed", String(selected));
        }
      },
    });
    return row;
  }

  function buildSlider(field) {
    const row = make("div", "garageField");
    const head = make("div", "garageFieldHead");
    head.append(make("span", "garageFieldLabel", field.label));
    const value = make("span", "garageFieldValue");
    head.append(value);
    const input = doc.createElement("input");
    input.type = "range";
    input.min = String(field.bounds.min);
    input.max = String(field.bounds.max);
    input.step = String(field.bounds.step);
    input.setAttribute("aria-label", field.label);
    input.addEventListener("input", () => setPath(field.path, Number(input.value)), options);
    row.append(head, input);
    controls.push({
      node: row,
      sync() {
        const current = readPath(editing(), field.path);
        if (doc.activeElement !== input) input.value = String(current);
        value.textContent = field.bounds.step >= 1 ? String(Math.round(current)) : current.toFixed(2);
      },
    });
    return row;
  }

  function buildColor(field) {
    const row = make("div", "garageField garageFieldWide");
    row.append(make("span", "garageFieldLabel", field.label));
    const picker = doc.createElement("input");
    picker.type = "color";
    picker.className = "garageColorInput";
    picker.setAttribute("aria-label", field.label);
    picker.addEventListener("input", () => setPath(field.path, picker.value), options);
    const swatches = make("div", "garageSwatches");
    for (const hex of COLOR_SWATCHES) {
      const button = make("button", "garageSwatch");
      button.type = "button";
      button.style.setProperty("--swatch", hex);
      button.setAttribute("aria-label", `${field.label} ${hex}`);
      button.addEventListener("click", () => setPath(field.path, hex), options);
      swatches.append(button);
    }
    const line = make("div", "garageColorRow");
    line.append(picker, swatches);
    row.append(line);
    controls.push({
      node: row,
      sync() {
        const current = readPath(editing(), field.path);
        if (doc.activeElement !== picker) picker.value = current;
      },
    });
    return row;
  }

  function buildToggle(field) {
    const row = make("div", "garageField");
    const button = make("button", "garageToggle");
    button.type = "button";
    button.append(make("span", null, field.label));
    const state = make("b", null, "Off");
    button.append(state);
    button.addEventListener("click", () => setPath(field.path, !readPath(editing(), field.path)), options);
    row.append(button);
    controls.push({
      node: row,
      sync() {
        const on = Boolean(readPath(editing(), field.path));
        state.textContent = on ? "On" : "Off";
        button.classList.toggle("selected", on);
        button.setAttribute("aria-pressed", String(on));
      },
    });
    return row;
  }

  /** Thumbnails of the approved art, never a dropdown of names. */
  function buildDecalPicker(field) {
    const row = make("div", "garageField garageFieldWide");
    row.append(make("span", "garageFieldLabel", field.label));

    const clear = make("button", "garageChip garageDecalClear");
    clear.type = "button";
    clear.append(make("b", null, "None"));
    clear.addEventListener("click", () => commit(replaceLoadout(store.garage, writePath(editing(), `${field.path}.type`, "none"))), options);
    row.append(clear);

    const tiles = [];
    for (const group of DECAL_GROUPS) {
      row.append(make("div", "garageDecalGroup", group));
      const grid = make("div", "garageDecalGrid");
      for (const decal of DECALS.filter((entry) => entry.group === group)) {
        const button = make("button", "garageDecal");
        button.type = "button";
        button.title = decal.name;
        button.setAttribute("aria-label", decal.name);
        const image = doc.createElement("img");
        image.src = decal.asset;
        image.alt = "";
        image.loading = "lazy";
        button.append(image);
        button.addEventListener("click", () => {
          const next = writePath(editing(), `${field.path}.type`, "builtin");
          commit(replaceLoadout(store.garage, writePath(next, `${field.path}.id`, decal.id)));
        }, options);
        grid.append(button);
        tiles.push({ id: decal.id, button });
      }
      row.append(grid);
    }

    controls.push({
      node: row,
      sync() {
        const decal = readPath(editing(), field.path);
        clear.classList.toggle("selected", decal.type === "none");
        for (const tile of tiles) {
          const selected = decal.type === "builtin" && decal.id === tile.id;
          tile.button.classList.toggle("selected", selected);
          tile.button.setAttribute("aria-pressed", String(selected));
        }
      },
    });
    return row;
  }

  const BUILDERS = { chips: buildChips, slider: buildSlider, color: buildColor, toggle: buildToggle, "decal-picker": buildDecalPicker };

  function buildGroups(groups) {
    const fragment = doc.createDocumentFragment();
    for (const [index, group] of groups.entries()) {
      const section = doc.createElement("details");
      section.className = "garageGroup";
      section.open = index < 2;
      const summary = doc.createElement("summary");
      summary.append(make("span", null, group.name));
      section.append(summary);
      if (group.hint) section.append(make("p", "garageHint", group.hint));
      for (const field of group.fields) {
        const builder = BUILDERS[field.kind];
        if (builder) section.append(builder(field));
      }
      fragment.append(section);
    }
    return fragment;
  }

  const panes = {
    mallet: make("div", "garagePane"),
    table: make("div", "garagePane"),
  };
  panes.mallet.append(buildGroups(MALLET_GROUPS));
  panes.table.append(buildGroups(TABLE_GROUPS));
  el.garageEditor.append(panes.mallet, panes.table);

  // ---------------------------------------------------------------------------
  // SLOTS
  // ---------------------------------------------------------------------------
  //
  // The bar is rebuilt when the LIST changes and only refreshed when it has
  // not, so renaming a design while typing does not tear the input out from
  // under the cursor.

  let slotChips = [];
  let slotSignature = "";
  /** Which slot the name field is currently showing, so a switch always rewrites it. */
  let namedSlot = "";

  /** Two dabs of a design's own paint, so a slot is recognisable before it is read. */
  function slotChip(loadout) {
    const button = make("button", "garageSlot");
    button.type = "button";
    const paint = make("span", "garageSlotPaint");
    paint.style.setProperty("--primary", loadout.mallet.colors.primary);
    paint.style.setProperty("--accent", loadout.tableHalf.surface.baseColor);
    button.append(paint, make("b", null, loadout.name));
    button.addEventListener("click", () => {
      if (store.garage.equippedId === loadout.id) return;
      commit(selectLoadout(store.garage, loadout.id));
    }, options);
    return button;
  }

  function refreshSlots() {
    const garage = store.garage;
    const signature = garage.loadouts.map((loadout) => loadout.id).join(",");
    if (signature !== slotSignature) {
      slotSignature = signature;
      el.garageSlotRow.replaceChildren();
      slotChips = garage.loadouts.map((loadout) => {
        const button = slotChip(loadout);
        el.garageSlotRow.append(button);
        return { id: loadout.id, button };
      });
    }

    for (const chip of slotChips) {
      const loadout = garage.loadouts.find((entry) => entry.id === chip.id);
      if (!loadout) continue;
      const selected = loadout.id === garage.equippedId;
      chip.button.classList.toggle("selected", selected);
      chip.button.setAttribute("aria-pressed", String(selected));
      chip.button.querySelector("b").textContent = loadout.name;
      const paint = chip.button.querySelector(".garageSlotPaint");
      paint.style.setProperty("--primary", loadout.mallet.colors.primary);
      paint.style.setProperty("--accent", loadout.tableHalf.surface.baseColor);
    }

    // Typing a name must not fight the field it is being typed into — but
    // moving to a DIFFERENT slot always rewrites it, focused or not, or the
    // field sits there showing a name that belongs to another design.
    if (namedSlot !== garage.equippedId || doc.activeElement !== el.garageSlotName) {
      el.garageSlotName.value = editing().name;
      namedSlot = garage.equippedId;
    }
    el.garageSlotNew.disabled = garage.loadouts.length >= MAX_LOADOUTS;
    el.garageSlotCopy.disabled = garage.loadouts.length >= MAX_LOADOUTS;
    // The last design cannot go: a player with no loadout has no mallet.
    el.garageSlotDelete.disabled = garage.loadouts.length <= 1;
  }

  el.garageSlotName.addEventListener("input", () => {
    commit(renameLoadout(store.garage, store.garage.equippedId, el.garageSlotName.value));
  }, options);
  // A name that normalizes to something else (blank, over-long, padded) settles
  // into the field on blur rather than rewriting it mid-keystroke.
  el.garageSlotName.addEventListener("blur", () => {
    el.garageSlotName.value = editing().name;
  }, options);

  /** A new slot arrives named, equipped and ready to be renamed. */
  function addSlot(from) {
    commit(addLoadout(store.garage, from ? { from } : {}));
    el.garageSlotName.focus();
    el.garageSlotName.select();
  }

  el.garageSlotNew.addEventListener("click", () => addSlot(null), options);
  el.garageSlotCopy.addEventListener("click", () => addSlot(store.garage.equippedId), options);

  el.garageSlotDelete.addEventListener("click", () => {
    commit(removeLoadout(store.garage, store.garage.equippedId));
  }, options);

  // ---------------------------------------------------------------------------
  // CHROME
  // ---------------------------------------------------------------------------

  const tabButtons = [["mallet", "Mallet"], ["table", "My Table"]].map(([id, name]) => {
    const button = make("button", "garageTab", name);
    button.type = "button";
    button.addEventListener("click", () => {
      tab = id;
      refreshChrome();
    }, options);
    el.garageTabs.append(button);
    return { id, button };
  });

  function selectCamera(id) {
    const entry = CAMERA_MODES.find((mode) => mode.id === id) ?? CAMERA_MODES[0];
    cameraMode = entry.id;
    view.setCameraMode(entry.id === "match" ? "match" : "inspect", { target: entry.target, distance: entry.distance });
    refreshChrome();
  }

  const cameraButtons = CAMERA_MODES.map((entry) => {
    const button = make("button", "garageCameraBtn", entry.name);
    button.type = "button";
    button.addEventListener("click", () => selectCamera(entry.id), options);
    el.garageCamera.append(button);
    return { id: entry.id, button };
  });

  /**
   * The editor is a bottom drawer at phone size, and it covers the near end of
   * the table — which is the player's own half, the only one they can edit. So
   * the drawer opens on the half-table camera rather than Match View, and the
   * player can still switch to Match View to check how the design reads.
   */
  const isDrawerLayout = () => Boolean(doc.defaultView?.matchMedia?.("(max-width:820px),(max-height:620px)").matches);

  /** Matches the drawer's `max-height` in the stylesheet, leaving a small margin. */
  const DRAWER_BAND = 0.36;

  el.garageCollision.addEventListener("click", () => {
    const on = el.garageCollision.getAttribute("aria-pressed") !== "true";
    el.garageCollision.setAttribute("aria-pressed", String(on));
    el.garageCollision.classList.toggle("selected", on);
    view.showCollisionOverlay(on);
  }, options);

  el.garageSave.addEventListener("click", async () => {
    if (!store.available) {
      refreshStatus();
      return;
    }
    refreshStatus();
    await store.save();
    view.equipPlayer(store.editing);
    refreshValues();
    refreshSlots();
    refreshStatus();
  }, options);

  el.garageRevert.addEventListener("click", () => {
    store.revert();
    view.equipPlayer(store.editing);
    refreshValues();
    refreshSlots();
    refreshStatus();
  }, options);

  el.garageBack.addEventListener("click", () => {
    // Leaving does not save. The equipped half goes back to the account's copy
    // so the menu never shows a design the player has not kept.
    store.revert();
    view.equipPlayer(store.editing);
    view.setViewportBand(1);
    view.setCameraMode("match");
    view.showCollisionOverlay(false);
    match.exitGarage();
  }, options);

  // Orbit and zoom, but only in an inspect mode and only from the canvas behind
  // the panel — the editor's own controls keep their pointer events.
  const canvas = doc.getElementById("game");
  let dragging = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (match.state.screen !== "garage" || cameraMode === "match") return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  }, options);
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragging.id) return;
    view.orbitBy((dragging.x - event.clientX) * 0.008, (event.clientY - dragging.y) * 0.006);
    dragging.x = event.clientX;
    dragging.y = event.clientY;
  }, options);
  const endDrag = (event) => {
    if (dragging && event.pointerId === dragging.id) dragging = null;
  };
  canvas.addEventListener("pointerup", endDrag, options);
  canvas.addEventListener("pointercancel", endDrag, options);
  canvas.addEventListener("wheel", (event) => {
    if (match.state.screen !== "garage" || cameraMode === "match") return;
    event.preventDefault();
    view.zoomBy(event.deltaY > 0 ? 1.08 : 0.93);
  }, { ...options, passive: false });

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  function refreshValues() {
    for (const control of controls) control.sync();
  }

  function refreshStatus() {
    const copy = STATUS_COPY[store.status] ?? STATUS_COPY[STATUS_SAVED];
    el.garageStatus.textContent = copy.label;
    el.garageStatus.dataset.tone = copy.tone;
    el.garageStatusNote.textContent = store.available
      ? store.lastError || (store.dirty ? "Save & Equip writes this to your Player Factory account." : "")
      : "Your design previews here, but saving needs a Player Factory account.";
    el.garageSave.disabled = !store.available || store.status === STATUS_SAVING || (!store.dirty && store.status !== STATUS_ERROR);
    el.garageRevert.disabled = !store.dirty;
    el.garageSave.textContent = store.status === STATUS_SAVING ? "Saving…" : "Save & Equip";
  }

  function refreshChrome() {
    for (const entry of tabButtons) {
      const selected = entry.id === tab;
      entry.button.classList.toggle("selected", selected);
      entry.button.setAttribute("aria-pressed", String(selected));
    }
    for (const [id, pane] of Object.entries(panes)) pane.hidden = id !== tab;
    for (const entry of cameraButtons) {
      const selected = entry.id === cameraMode;
      entry.button.classList.toggle("selected", selected);
      entry.button.setAttribute("aria-pressed", String(selected));
    }
  }

  const unsubscribe = store.subscribe(() => {
    refreshSlots();
    refreshStatus();
  });

  /**
   * Entering the Garage. The account's garage was already fetched at cabinet
   * boot — the equipped half has to be right on the menu and in a match, not
   * only in here — so this just brings the panel up to date with it.
   */
  function open() {
    view.equipPlayer(store.editing);
    view.setViewportBand(isDrawerLayout() ? DRAWER_BAND : 1);
    selectCamera(isDrawerLayout() ? "table" : "match");
    refreshValues();
    refreshSlots();
    refreshStatus();
  }

  refreshChrome();
  refreshValues();
  refreshSlots();
  refreshStatus();

  return {
    handle(event) {
      if (event.type === "screen" && event.screen === "garage") open();
    },
    dispose() {
      unsubscribe();
      abort.abort();
    },
  };
}
