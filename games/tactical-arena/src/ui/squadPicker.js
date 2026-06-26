// Squad builder: a small front/back unit picker shared by the setup screen. It
// mirrors the real four-unit corner spawn block. Each cell click cycles the unit
// type. Presentation only: it produces a normalized squad array the setup screen
// threads into the match config; it never touches the engine.
import { UNIT_TYPES } from "../core/unitCatalog.js";

export const UNIT_TYPE_KEYS = Object.keys(UNIT_TYPES);
export const DEFAULT_SQUAD = ["swordsman", "archer", "mystic", "magician"];

// Force any input into a valid 4-slot squad of known unit types.
export function normalizeSquad(squad) {
  const out = [];
  for (let i = 0; i < DEFAULT_SQUAD.length; i += 1) {
    const type = squad?.[i];
    out.push(UNIT_TYPE_KEYS.includes(type) ? type : DEFAULT_SQUAD[i]);
  }
  return out;
}

const SLOT_LAYOUT = [
  { index: 0, row: "front" },
  { index: 1, row: "front" },
  { index: 2, row: "back" },
  { index: 3, row: "back" }
];

export function createSquadPicker({ title = "Squad", initial = null, accent = null } = {}) {
  const squad = normalizeSquad(initial);

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
      squad[slot.index] = nextType(squad[slot.index]);
      paintCell(cell, squad[slot.index]);
    });
    paintCell(cell, squad[slot.index]);
    grid.appendChild(cell);
  }

  return {
    el,
    getSquad: () => [...squad]
  };
}

function nextType(type) {
  const at = UNIT_TYPE_KEYS.indexOf(type);
  return UNIT_TYPE_KEYS[(at + 1) % UNIT_TYPE_KEYS.length];
}

function paintCell(cell, type) {
  const def = UNIT_TYPES[type];
  cell.dataset.type = type;
  cell.innerHTML = `<span class="squad-cell-icon">${def.glyph}</span><span class="squad-cell-name">${def.name}</span>`;
}
