// The Cursed Swamp board recipe: the spread Ghoul lattice, its unioned fire
// sources, and the campaign-Ghoul factory. Voidwood Forest deliberately reuses
// the same lattice + factory for its own haunted floor. Extracted from
// campaignMatch.js (the layout table consumes these).

import { WITCH_DOCTOR_BOARD_SIZE } from "../../campaignConstants.js";
import { createUnit } from "../../../core/state.js";
import { ORTHOGONAL_DIRECTIONS, positionKey } from "../../../rules/movement.js";

// The swamp lattice: a SPREAD 3×3 Ghoul grid, spacing 2 (x,y each in {2,4,6}) — close enough
// that every gap between Ghouls is covered by either a Ghoul's orthogonal fire or another
// Ghoul's diagonal Bite range (Chebyshev 1), so nothing inside the lattice's own footprint is
// free to walk except a Ghoul's own tile once it's dead. Spacing 2 (not the old spacing-4
// lattice) is what closes the "avenue" loophole those wider gaps used to leave open. The
// lattice's own top-right slot is left empty for the Witch Doctor rather than a ninth Ghoul.
const WITCH_DOCTOR_LATTICE_VALUES = Object.freeze([2, 4, 6]);
export const WITCH_DOCTOR_SLOT = Object.freeze({ x: 6, y: 2 }); // top-right of the lattice
export const WITCH_DOCTOR_SPAWN = Object.freeze({ x: 0, y: WITCH_DOCTOR_BOARD_SIZE - 1 });
export const WITCH_DOCTOR_GHOUL_POSITIONS = Object.freeze(
  WITCH_DOCTOR_LATTICE_VALUES.flatMap((y) => WITCH_DOCTOR_LATTICE_VALUES.map((x) => ({ x, y })))
    .filter((p) => !(p.x === WITCH_DOCTOR_SLOT.x && p.y === WITCH_DOCTOR_SLOT.y))
    .map((p) => Object.freeze(p))
);
const WITCH_DOCTOR_GHOUL_POSITION_KEYS = new Set(WITCH_DOCTOR_GHOUL_POSITIONS.map(positionKey));

// Fire has two unioned sources:
// 1. Each Ghoul's four ORTHOGONAL neighbours, clipped to the board and excluding any tile
//    that's itself a Ghoul position (spacing 2 means that never actually happens here, but
//    the guard stays cheap insurance against a future spacing change). This lattice fire only
//    reaches 1 tile past the outermost Ghouls, so on its own it leaves the true board edge
//    open — a gap the old spacing-4 layout let a player walk clean around.
// 2. A full 1-tile fire border along the true edges of the map itself (all four sides),
//    minus the player's spawn tile. This is what actually stops the edge-creep: the lattice
//    is positioned with exactly 1 tile of clearance from the board edge, so its own outward
//    fire sits immediately adjacent to this border with no safe ring left between them.
function ghoulOrthogonalFireKeys() {
  const keys = new Set();
  for (const ghoul of WITCH_DOCTOR_GHOUL_POSITIONS) {
    for (const dir of ORTHOGONAL_DIRECTIONS) {
      const p = { x: ghoul.x + dir.x, y: ghoul.y + dir.y };
      if (p.x < 0 || p.y < 0 || p.x >= WITCH_DOCTOR_BOARD_SIZE || p.y >= WITCH_DOCTOR_BOARD_SIZE) continue;
      if (WITCH_DOCTOR_GHOUL_POSITION_KEYS.has(positionKey(p))) continue;
      keys.add(positionKey(p));
    }
  }
  return keys;
}

function mapBorderFireKeys() {
  const keys = new Set();
  const max = WITCH_DOCTOR_BOARD_SIZE - 1;
  const spawnKey = positionKey(WITCH_DOCTOR_SPAWN);
  for (let x = 0; x <= max; x += 1) {
    for (const y of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  for (let y = 0; y <= max; y += 1) {
    for (const x of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  return keys;
}

export const WITCH_DOCTOR_FIRE_POSITIONS = Object.freeze(
  [...new Set([...ghoulOrthogonalFireKeys(), ...mapBorderFireKeys()])].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return Object.freeze({ x, y });
  })
);

export function createCampaignGhoul(index, position, idPrefix = "p2-swamp-ghoul", skin = null) {
  return {
    ...createUnit({
      id: `${idPrefix}-${index}`,
      player: 2,
      team: 2,
      type: "ghoul",
      x: position.x,
      y: position.y,
      hp: 5,
      mp: 0,
      skin,
    }),
    spent: true,
    summonerId: null,
  };
}
