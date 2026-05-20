import { canvasToScratchPoint } from "./coordinates.js";
import { pointInScratchButton } from "./menu-input.js";

export const TWO_PLAYER_ACTIONS = Object.freeze({
  LOCAL: "two-player-local",
  ONLINE: "two-player-online",
  BACK: "two-player-back",
});

export const TWO_PLAYER_BUTTONS = Object.freeze([
  {
    action: TWO_PLAYER_ACTIONS.LOCAL,
    label: "LOCAL",
    asset: "assets/scratch/local-button.svg",
    x: 0,
    y: -20,
    width: 128.4,
    height: 56.4,
  },
  {
    action: TWO_PLAYER_ACTIONS.ONLINE,
    label: "ONLINE",
    asset: "assets/scratch/online-button.svg",
    x: 0,
    y: -90,
    width: 128.4,
    height: 56.4,
  },
  {
    action: TWO_PLAYER_ACTIONS.BACK,
    label: "BACK",
    asset: "assets/scratch/back-button.svg",
    x: 0,
    y: -147,
    width: 88,
    height: 39,
    size: 100,
  },
]);

export function resolveTwoPlayerActionAtScratchPoint(point, buttons = TWO_PLAYER_BUTTONS) {
  const hit = buttons.find((button) => pointInScratchButton(point, button));
  return hit?.action || null;
}

export function resolveTwoPlayerActionAtCanvasPoint(x, y, buttons = TWO_PLAYER_BUTTONS) {
  return resolveTwoPlayerActionAtScratchPoint(canvasToScratchPoint(x, y), buttons);
}

export function getTwoPlayerButtonByAction(action, buttons = TWO_PLAYER_BUTTONS) {
  return buttons.find((button) => button.action === action) || null;
}
