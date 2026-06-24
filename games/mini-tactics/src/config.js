export const BOARD_SIZES = Object.freeze([10, 13]);
export const DEFAULT_BOARD_SIZE = 10;
export const MAX_HP = 10;

// Medic heal range is 3 (canonical). Kept explicit here so it never becomes
// hidden engine behavior.
export const MEDIC_HEAL_RANGE = 3;

export const UNIT_TYPES = Object.freeze({
  warrior: Object.freeze({
    name: "Warrior",
    icon: "⚔",
    moveRange: 3,
    attackRange: 1
  }),
  tank: Object.freeze({
    name: "Tank",
    icon: "⬢",
    moveRange: 2,
    attackRange: 1
  }),
  ranger: Object.freeze({
    name: "Ranger",
    icon: "➶",
    moveRange: 2,
    attackRange: 4
  }),
  medic: Object.freeze({
    name: "Medic",
    icon: "+",
    moveRange: 2,
    attackRange: 3
  })
});

// One hue per player slot. Slots 1/2 anchor the classic duel; 3/4 (green,
// orange) come online for 3-4 player free-for-all and team play. These are
// defaults only — the authoritative per-match color lives on each roster entry
// (core/roster.js) so a lobby can reassign hues without touching slot identity.
// Heraldic banner hues — azure / gules / vert / or — mirroring the --p1..--p4
// tokens in styles/tokens.css.
export const PLAYER_COLORS = Object.freeze({
  1: "#5288c6",
  2: "#c4463f",
  3: "#62a04e",
  4: "#d68d37"
});

export const ACTION_MODES = Object.freeze({
  MOVE: "move",
  ATTACK: "attack",
  HEAL: "heal"
});
