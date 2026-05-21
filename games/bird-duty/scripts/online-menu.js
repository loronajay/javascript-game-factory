import { canvasToScratchPoint } from "./coordinates.js";
import { pointInScratchButton } from "./menu-input.js";

export const ONLINE_ACTIONS = Object.freeze({
  PUBLIC_2: "online-public-2",
  PUBLIC_3: "online-public-3",
  PUBLIC_4: "online-public-4",
  PRIVATE: "online-private",
  JOIN: "online-join",
  BACK: "online-back",
  JOIN_SUBMIT: "online-join-submit",
  JOIN_BACK: "online-join-back",
  LOBBY_START: "online-lobby-start",
  LOBBY_BACK: "online-lobby-back",
});

export const ONLINE_MENU_BUTTONS = Object.freeze([
  {
    action: ONLINE_ACTIONS.PUBLIC_2,
    label: "1V1",
    x: -105,
    y: 10,
    width: 86,
    height: 48,
  },
  {
    action: ONLINE_ACTIONS.PUBLIC_3,
    label: "3 PLAYER",
    x: 0,
    y: 10,
    width: 96,
    height: 48,
  },
  {
    action: ONLINE_ACTIONS.PUBLIC_4,
    label: "4 PLAYER",
    x: 105,
    y: 10,
    width: 96,
    height: 48,
  },
  {
    action: ONLINE_ACTIONS.PRIVATE,
    label: "PRIVATE",
    x: -70,
    y: -70,
    width: 112,
    height: 48,
  },
  {
    action: ONLINE_ACTIONS.JOIN,
    label: "JOIN CODE",
    x: 70,
    y: -70,
    width: 112,
    height: 48,
  },
  {
    action: ONLINE_ACTIONS.BACK,
    label: "BACK",
    x: 0,
    y: -140,
    width: 88,
    height: 38,
  },
]);

export const ONLINE_LOBBY_BUTTONS = Object.freeze([
  {
    action: ONLINE_ACTIONS.LOBBY_START,
    label: "START",
    x: -65,
    y: -140,
    width: 106,
    height: 38,
  },
  {
    action: ONLINE_ACTIONS.LOBBY_BACK,
    label: "BACK",
    x: 65,
    y: -140,
    width: 88,
    height: 38,
  },
]);

export const ONLINE_JOIN_BUTTONS = Object.freeze([
  {
    action: ONLINE_ACTIONS.JOIN_SUBMIT,
    label: "JOIN",
    x: -65,
    y: -140,
    width: 106,
    height: 38,
  },
  {
    action: ONLINE_ACTIONS.JOIN_BACK,
    label: "BACK",
    x: 65,
    y: -140,
    width: 88,
    height: 38,
  },
]);

export function isPublicOnlineAction(action) {
  return action === ONLINE_ACTIONS.PUBLIC_2
    || action === ONLINE_ACTIONS.PUBLIC_3
    || action === ONLINE_ACTIONS.PUBLIC_4;
}

export function getOnlineActionSettings(action) {
  if (action === ONLINE_ACTIONS.PUBLIC_2) {
    return { mode: "public", minPlayers: 2, maxPlayers: 2, private: false };
  }
  if (action === ONLINE_ACTIONS.PUBLIC_3) {
    return { mode: "public", minPlayers: 3, maxPlayers: 3, private: false };
  }
  if (action === ONLINE_ACTIONS.PUBLIC_4) {
    return { mode: "public", minPlayers: 4, maxPlayers: 4, private: false };
  }
  if (action === ONLINE_ACTIONS.PRIVATE) {
    return { mode: "private", minPlayers: 2, maxPlayers: 4, private: true };
  }
  return null;
}

export function normalizeJoinCodeInput(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function resolveOnlineActionAtScratchPoint(point, buttons = ONLINE_MENU_BUTTONS) {
  const hit = buttons.find((button) => pointInScratchButton(point, button));
  return hit?.action || null;
}

export function resolveOnlineActionAtCanvasPoint(x, y, buttons = ONLINE_MENU_BUTTONS) {
  return resolveOnlineActionAtScratchPoint(canvasToScratchPoint(x, y), buttons);
}

export function getOnlineButtonByAction(action, buttons = ONLINE_MENU_BUTTONS) {
  return buttons.find((button) => button.action === action) || null;
}
