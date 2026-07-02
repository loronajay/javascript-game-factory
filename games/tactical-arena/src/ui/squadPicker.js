// Squad strip — the inline per-player summary shown on the setup screen. It shows
// the four chosen pieces and an Edit button; the actual choosing happens in the
// roster pop-up (rosterPicker.js), which carries the unit details that teach new
// players the engine. Presentation only: it produces a normalized squad array the
// setup screen threads into the match config; it never touches the engine.
//
// The squad model (keys, defaults, normalization, duplicate rules) lives in
// squadModel.js and is re-exported here so existing import paths keep working.
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { UNIT_TYPE_KEYS, DEFAULT_SQUAD, SLOT_LAYOUT, normalizeSquad, availableTypesForSlot } from "./squadModel.js";
import { openRosterPicker } from "./rosterPicker.js";
import { createPortrait } from "./portraits.js";

export { UNIT_TYPE_KEYS, DEFAULT_SQUAD, normalizeSquad, availableTypesForSlot };

export function createSquadPicker({ title = "Squad", initial = null, accent = null, allowDuplicates = true } = {}) {
  let squad = normalizeSquad(initial);

  const el = document.createElement("div");
  el.className = "squad-picker";
  if (accent) el.style.setProperty("--team", accent);

  const heading = document.createElement("div");
  heading.className = "squad-picker-title";
  heading.textContent = title;
  el.appendChild(heading);

  const chips = document.createElement("div");
  chips.className = "squad-chip-row";
  el.appendChild(chips);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "squad-edit-btn";
  editBtn.textContent = "Edit Squad";
  el.appendChild(editBtn);

  // Open the roster pop-up on the slot the player tapped (or slot 0 from Edit).
  async function edit(startSlot = 0) {
    const result = await openRosterPicker({ title, accent, initial: squad, allowDuplicates, startSlot });
    if (result) { squad = result; paintChips(); }
  }

  function paintChips() {
    chips.replaceChildren();
    for (const slot of SLOT_LAYOUT) {
      const def = UNIT_TYPES[squad[slot.index]];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `squad-chip row-${slot.row}`;
      chip.append(createPortrait(squad[slot.index], { variant: "is-chip", eager: true }));
      const name = document.createElement("span");
      name.className = "squad-chip-name";
      name.textContent = def.name;
      chip.append(name);
      chip.addEventListener("click", () => edit(slot.index));
      chips.appendChild(chip);
    }
  }

  editBtn.addEventListener("click", () => edit(0));
  paintChips();

  return {
    el,
    getSquad: () => [...squad]
  };
}
