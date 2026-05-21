import { MENU_ACTIONS } from "./menu-input.js";
import { getOnlineActionSettings, ONLINE_ACTIONS } from "./online-menu.js";
import { TWO_PLAYER_ACTIONS } from "./two-player-menu.js";

export const SCREEN = Object.freeze({
  MENU: "menu",
  PLAY: "play",
  TWO_PLAYER_MENU: "two-player-menu",
  ONLINE_MENU: "online-menu",
  ONLINE_JOIN: "online-join",
  ONLINE_LOBBY: "online-lobby",
  ONLINE_PLAY: "online-play",
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
      screen: SCREEN.ONLINE_MENU,
      mode: "online-menu",
      lastAction: action,
    };
  }

  if (action === ONLINE_ACTIONS.BACK) {
    return {
      ...state,
      screen: SCREEN.TWO_PLAYER_MENU,
      mode: "two-player",
      lastAction: action,
    };
  }

  if (action === ONLINE_ACTIONS.JOIN) {
    return {
      ...state,
      screen: SCREEN.ONLINE_JOIN,
      mode: "online-join",
      lastAction: action,
    };
  }

  if (action === ONLINE_ACTIONS.JOIN_BACK) {
    return {
      ...state,
      screen: SCREEN.ONLINE_MENU,
      mode: "online-menu",
      lastAction: action,
    };
  }

  const onlineSettings = getOnlineActionSettings(action);
  if (onlineSettings) {
    return {
      ...state,
      screen: SCREEN.ONLINE_LOBBY,
      mode: "online",
      onlineSettings,
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
