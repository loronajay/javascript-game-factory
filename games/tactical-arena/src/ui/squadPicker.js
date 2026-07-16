// Squad strip — the inline per-player summary shown on the setup screen. It shows
// the four chosen pieces and an Edit button; the actual choosing happens in the
// roster pop-up (rosterPicker.js), which carries the unit details that teach new
// players the engine. Presentation only: it produces a normalized squad array the
// setup screen threads into the match config; it never touches the engine.
//
// The squad model (keys, defaults, normalization, duplicate rules) lives in
// squadModel.js and is re-exported here so existing import paths keep working.
import { UNIT_TYPES } from "../core/unitCatalog.js";
import {
  UNIT_TYPE_KEYS,
  DEFAULT_SQUAD,
  DEFAULT_FORMATION_ORDER,
  SQUAD_SIZE,
  SLOT_LAYOUT,
  applyFormationOrder,
  normalizeFormationOrder,
  normalizeSquad,
  normalizeSquadLoadout,
  availableTypesForSlot,
  UNIT_CLASS_GROUPS,
  groupedUnitTypes
} from "./squadModel.js";
import { openRosterPicker } from "./rosterPicker.js";
import { openDraftFormationPicker } from "./draftFormationPicker.js";
import { createPortrait } from "./portraits.js";
import { getNicknamePref } from "./nicknameModel.js";

export { UNIT_TYPE_KEYS, DEFAULT_SQUAD, DEFAULT_FORMATION_ORDER, normalizeSquad, normalizeSquadLoadout, availableTypesForSlot, UNIT_CLASS_GROUPS, groupedUnitTypes };

export function createSquadPicker({ title = "Squad", initial = null, accent = null, allowDuplicates = true, player = 1 } = {}) {
  let loadout = normalizeSquadLoadout(initial);
  let formationOrder = normalizeInitialFormation(initial);
  let locked = false;
  let formationPlayer = player;
  let pickerTitle = title;
  let pickerAccent = accent;

  const el = document.createElement("div");
  el.className = "squad-picker";
  if (pickerAccent) el.style.setProperty("--team", pickerAccent);

  const heading = document.createElement("div");
  heading.className = "squad-picker-title";
  heading.textContent = pickerTitle;
  el.appendChild(heading);

  const chips = document.createElement("div");
  chips.className = "squad-chip-row";
  el.appendChild(chips);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "squad-edit-btn";
  editBtn.textContent = "Edit Squad";

  const formationBtn = document.createElement("button");
  formationBtn.type = "button";
  formationBtn.className = "squad-edit-btn squad-formation-btn";
  formationBtn.textContent = "Formation";

  const actions = document.createElement("div");
  actions.className = "squad-actions";
  actions.append(editBtn, formationBtn);
  el.appendChild(actions);

  // Open the roster pop-up on the slot the player tapped (or slot 0 from Edit).
  async function edit(startSlot = 0) {
    if (locked) return;
    const result = await openRosterPicker({ title: pickerTitle, accent: pickerAccent, initial: loadout, allowDuplicates, startSlot });
    if (result) { loadout = normalizeSquadLoadout(result); paintChips(); }
  }

  async function editFormation() {
    if (locked) return;
    const result = await openDraftFormationPicker({
      title: `${pickerTitle} Formation`,
      composition: loadout.composition,
      skins: loadout.skins,
      nicknames: loadout.composition.map((type) => getNicknamePref(type)),
      order: formationOrder,
      accent: pickerAccent,
      player: formationPlayer
    });
    if (result?.order) {
      formationOrder = normalizeFormationOrder(result.order, loadout.composition.length, formationOrder);
      paintChips();
    }
  }

  function paintChips() {
    el.classList.toggle("is-locked", locked);
    editBtn.disabled = locked;
    formationBtn.disabled = locked;
    editBtn.textContent = locked ? "Squad Locked" : "Edit Squad";
    formationBtn.textContent = locked ? "Locked" : "Formation";
    chips.replaceChildren();
    for (const slot of SLOT_LAYOUT) {
      const type = loadout.composition[slot.index];
      const def = UNIT_TYPES[type];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "squad-chip";
      chip.disabled = locked;
      chip.append(createPortrait(type, { variant: "is-chip", eager: true, skin: loadout.skins[slot.index] }));
      const name = document.createElement("span");
      name.className = "squad-chip-name";
      name.textContent = getNicknamePref(type) || def.name;
      chip.append(name);
      chip.addEventListener("click", () => edit(slot.index));
      chips.appendChild(chip);
    }
  }

  editBtn.addEventListener("click", () => edit(0));
  formationBtn.addEventListener("click", editFormation);
  paintChips();

  return {
    el,
    setLocked(value) {
      locked = !!value;
      paintChips();
    },
    isLocked: () => locked,
    getSquad: () => applyFormationOrder(loadout.composition, formationOrder),
    getSkins: () => applyFormationOrder(loadout.skins, formationOrder),
    getNicknames: () => applyFormationOrder(loadout.composition.map((type) => getNicknamePref(type)), formationOrder),
    getLoadout: () => ({ composition: [...loadout.composition], skins: [...loadout.skins], formation: [...formationOrder] }),
    setLoadout(nextLoadout) {
      loadout = normalizeSquadLoadout(nextLoadout);
      formationOrder = normalizeInitialFormation(nextLoadout);
      paintChips();
    },
    setPlayer(nextPlayer) {
      formationPlayer = nextPlayer;
    },
    setTitle(nextTitle) {
      pickerTitle = String(nextTitle || "Squad");
      heading.textContent = pickerTitle;
    },
    setAccent(nextAccent) {
      pickerAccent = nextAccent;
      if (pickerAccent) el.style.setProperty("--team", pickerAccent);
      else el.style.removeProperty("--team");
    }
  };
}

function normalizeInitialFormation(loadout) {
  const explicit = Array.isArray(loadout)
    ? null
    : (loadout?.formation ?? loadout?.formationOrder ?? loadout?.order);
  return normalizeFormationOrder(explicit, SQUAD_SIZE, DEFAULT_FORMATION_ORDER);
}
