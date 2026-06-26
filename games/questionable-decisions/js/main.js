import { createGameController } from "./core/game-controller.js";

export function bootstrapPrototypeGame({ app = globalThis.document?.getElementById("app"), windowRef = globalThis.window } = {}) {
  return createGameController({ app, windowRef }).mount();
}

if (globalThis.document) {
  bootstrapPrototypeGame();
}
