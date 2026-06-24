// Squad builder: a reusable 2x2 unit picker that mirrors the spawn block, shared
// by the hot-seat, single-player, and online setup screens. Presentation only —
// it produces a normalized 4-type composition array (core/composition.js) that
// the setup screen threads into the match config; it never touches the engine.
//
// The grid mirrors the real spawn 2x2: the top row is the FRONT line (the inner
// edge facing board center — composition indices 0 and 1), the bottom row is the
// BACK line (the corner — indices 2 and 3). Each cell click cycles unit type.

import { UNIT_TYPES } from "../../config.js";
import {
  UNIT_TYPE_KEYS,
  normalizeComposition,
} from "../../core/composition.js";

// Slot index -> grid placement. Front line first so the layout reads top-down as
// "closest to the enemy" down to "tucked in the corner".
const SLOT_LAYOUT = [
  { index: 0, row: "front" },
  { index: 1, row: "front" },
  { index: 2, row: "back" },
  { index: 3, row: "back" },
];

export function createSquadPicker({ title = "Squad", initial = null, accent = null } = {}) {
  // Own a normalized copy so the picker is always a valid 4-type squad.
  const composition = normalizeComposition(initial);

  const el = document.createElement("div");
  el.className = "squad-picker";
  if (accent) el.style.setProperty("--team", accent);

  const heading = document.createElement("div");
  heading.className = "squad-picker-title";
  heading.textContent = title;
  el.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "squad-picker-grid";
  el.appendChild(grid);

  for (const slot of SLOT_LAYOUT) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `squad-cell row-${slot.row}`;
    cell.addEventListener("click", () => {
      composition[slot.index] = nextType(composition[slot.index]);
      paintCell(cell, composition[slot.index]);
    });
    paintCell(cell, composition[slot.index]);
    grid.appendChild(cell);
  }

  return {
    el,
    // A fresh copy so callers can't mutate the picker's internal state.
    getComposition: () => [...composition],
    setTitle: (text) => {
      heading.textContent = text;
    },
    setAccent: (hue) => {
      if (hue) el.style.setProperty("--team", hue);
    },
  };
}

function nextType(type) {
  const at = UNIT_TYPE_KEYS.indexOf(type);
  return UNIT_TYPE_KEYS[(at + 1) % UNIT_TYPE_KEYS.length];
}

function paintCell(cell, type) {
  const def = UNIT_TYPES[type];
  cell.dataset.type = type;
  cell.innerHTML =
    `<span class="squad-cell-icon">${def.icon}</span>` +
    `<span class="squad-cell-name">${def.name}</span>`;
}
