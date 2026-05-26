import { MENU_ACTIONS } from "./menu-input.js";

const MENU_TARGET_NAMES = Object.freeze([
  "BirdDUTYmenutext",
  "SINGLE PLAYER",
  "MULTIPLAYER",
  "reset pb",
  "Back to Arcade",
]);

const MENU_TARGET_ACTIONS = Object.freeze({
  "SINGLE PLAYER": MENU_ACTIONS.SINGLE_PLAYER,
  MULTIPLAYER: MENU_ACTIONS.TWO_PLAYERS,
  "reset pb": MENU_ACTIONS.RESET_SCORE,
  "Back to Arcade": MENU_ACTIONS.BACK_ARCADE,
});

const MENU_TARGET_OVERRIDES = Object.freeze({
  "Back to Arcade": { x: -255, y: -155 },
});

const JAYARCADE_SHELL_TARGETS = Object.freeze([
  "CRT OVERLAY",
  "POWER ON/OFF",
  "Controls",
  "Selected Button",
  "Watchdog Timer",
]);

export function getBirdDutyMenuTargetNames() {
  return [...MENU_TARGET_NAMES];
}

export function getJayArcadeShellTargetNames() {
  return [...JAYARCADE_SHELL_TARGETS];
}

export function buildMenuSprites(manifest) {
  return MENU_TARGET_NAMES
    .map((name) => manifest.targets.find((target) => target.name === name))
    .filter(Boolean)
    .map((target) => {
      const override = MENU_TARGET_OVERRIDES[target.name] || {};
      return {
      targetName: target.name,
      x: override.x ?? target.x ?? 0,
      y: override.y ?? target.y ?? 0,
      size: target.size || 100,
      costumeName: target.costumes[target.currentCostume || 0]?.name || "",
      action: MENU_TARGET_ACTIONS[target.name] || null,
      };
    });
}
