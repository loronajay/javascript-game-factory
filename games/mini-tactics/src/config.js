export const BOARD_SIZES = Object.freeze([10, 13]);
export const DEFAULT_BOARD_SIZE = 10;
export const MAX_HP = 10;

// The user has not separately specified heal range.
// Keeping it explicit here prevents it from becoming hidden engine behavior.
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

export const PLAYER_COLORS = Object.freeze({
  1: "#67c7ff",
  2: "#ff6c7c"
});

export const ACTION_MODES = Object.freeze({
  MOVE: "move",
  ATTACK: "attack",
  HEAL: "heal"
});
