import { MENU_ACTIONS } from "./menu-input.js";
import { TWO_PLAYER_ACTIONS } from "./two-player-menu.js";

export const SCREEN = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  TWO_PLAYER_MENU: "two-player-menu",
  HOTSEAT_PLAY: "hotseat-play",
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
      screen: SCREEN.TWO_PLAYER_MENU,
      mode: "two-player",
      lastAction: action,
    };
  }

  if (action === TWO_PLAYER_ACTIONS.LOCAL) {
    return {
      ...state,
      screen: SCREEN.HOTSEAT_PLAY,
      mode: "hotseat",
      lastAction: action,
    };
  }

  if (action === TWO_PLAYER_ACTIONS.ONLINE) {
    return {
      ...state,
      screen: SCREEN.TWO_PLAYER_MENU,
      mode: "online-pending",
      lastAction: action,
    };
  }

  if (action === TWO_PLAYER_ACTIONS.BACK) {
    return {
      ...state,
      screen: SCREEN.MENU,
      mode: null,
      lastAction: action,
    };
  }

  return {
    ...state,
    lastAction: action,
  };
}
