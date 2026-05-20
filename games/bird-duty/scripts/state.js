import { MENU_ACTIONS } from "./menu-input.js";

export const SCREEN = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  TWO_PLAYER_PENDING: "two-player-pending",
});

export function createInitialState() {
  return {
    screen: SCREEN.MENU,
    mode: null,
    lastAction: null,
  };
}

export function applyMenuAction(state, action) {
  if (!action) return { ...state, lastAction: null };

  if (action === MENU_ACTIONS.SINGLE_PLAYER) {
    return {
      ...state,
      screen: SCREEN.PLAY,
      mode: "single",
      lastAction: action,
    };
  }

  if (action === MENU_ACTIONS.TWO_PLAYERS) {
    return {
      ...state,
      screen: SCREEN.TWO_PLAYER_PENDING,
      mode: "two-player",
      lastAction: action,
    };
  }

  return {
    ...state,
    lastAction: action,
  };
}
