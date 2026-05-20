import { canvasToScratchPoint } from "./coordinates.js";

export const MENU_ACTIONS = Object.freeze({
  SINGLE_PLAYER: "single-player",
  TWO_PLAYERS: "two-players",
  BACK_HOME: "back-home",
  BACK_ARCADE: "back-arcade",
  RESET_SCORE: "reset-score",
});

export const MENU_BUTTONS = Object.freeze([
  {
    action: MENU_ACTIONS.SINGLE_PLAYER,
    x: 0,
    y: -15,
    width: 128.4,
    height: 56.4,
  },
  {
    action: MENU_ACTIONS.TWO_PLAYERS,
    x: 0,
    y: -85,
    width: 128.4,
    height: 56.4,
  },
  {
    action: MENU_ACTIONS.BACK_HOME,
    x: -255,
    y: -155,
    width: 85.6,
    height: 37.6,
  },
  {
    action: MENU_ACTIONS.BACK_ARCADE,
    x: -165,
    y: -155,
    width: 85.6,
    height: 37.6,
  },
  {
    action: MENU_ACTIONS.RESET_SCORE,
    x: 255,
    y: -155,
    width: 85.6,
    height: 37.6,
  },
]);

export function pointInScratchButton(point, button) {
  return (
    point.x >= button.x - button.width / 2 &&
    point.x <= button.x + button.width / 2 &&
    point.y >= button.y - button.height / 2 &&
    point.y <= button.y + button.height / 2
  );
}

export function resolveMenuActionAtScratchPoint(point, buttons = MENU_BUTTONS) {
  const hit = buttons.find((button) => pointInScratchButton(point, button));
  return hit?.action || null;
}

export function getMenuButtonByAction(action, buttons = MENU_BUTTONS) {
  return buttons.find((button) => button.action === action) || null;
}

export function resolveMenuActionAtCanvasPoint(x, y, buttons = MENU_BUTTONS) {
  return resolveMenuActionAtScratchPoint(canvasToScratchPoint(x, y), buttons);
}

export function createMenuInteractionState(state = {}, action = null) {
  if (!action) return { ...state, selectedAction: null };
  return {
    ...state,
    selectedAction: action,
    lastAction: action,
  };
}
