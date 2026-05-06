import { loadBoardDefinition } from "../shared/circuit-board.js";
import { createRemoteMatchAdapter } from "../adapters/remote-match-adapter.js";
import { createSessionRuntimeState } from "./session-runtime-state.js";
import { createCircuitSiegeSessionController } from "./session-controller.js";
import { createCircuitSiegeAppController } from "./app-controller.js";
import { createAppRenderer } from "./app-renderer.js";
import { loadCircuitSiegeIdentity } from "./identity.js";

function bindButtons(app, root = document) {
  root.querySelector("#btn-public-blue")?.addEventListener("click", () => {
    app.startPublicBlue();
  });
  root.querySelector("#btn-public-red")?.addEventListener("click", () => {
    app.startPublicRed();
  });
  root.querySelector("#btn-private-host")?.addEventListener("click", () => {
    app.startPrivateHost();
  });
  root.querySelector("#btn-private-join")?.addEventListener("click", () => {
    const roomCode = root.querySelector("#room-code-input")?.value || "";
    app.joinPrivateRoom(roomCode);
  });
  root.querySelector("#btn-ready")?.addEventListener("click", () => {
    app.requestReady(true);
  });
  root.querySelector("#btn-start-match")?.addEventListener("click", () => {
    app.requestStartNow();
  });
  root.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectTool(button.dataset.tool || "straight-h");
    });
  });
  root.querySelectorAll("[data-leave]").forEach((button) => {
    button.addEventListener("click", () => {
      app.leaveMatchmaking();
    });
  });
  root.querySelector("#board-grid")?.addEventListener("click", (event) => {
    const slotEl = event.target.closest("[data-slot-id]");
    if (!slotEl) return;
    app.handleBoardSlot(slotEl.dataset.slotId);
  });
}

export async function initGame({
  root = document,
  fetchImpl = fetch
} = {}) {
  const response = await fetchImpl("./data/authored-board.v1.json");
  const board = loadBoardDefinition(await response.json());
  const runtime = createSessionRuntimeState();
  const renderApp = createAppRenderer(root);

  let app = null;

  const sessionController = createCircuitSiegeSessionController({
    runtime,
    createRemoteMatchAdapter,
    loadIdentity: loadCircuitSiegeIdentity,
    showScreen: () => {},
    onLobbyStateChanged: () => app?.handleRuntimeChanged(),
    onMatchStateChanged: () => app?.handleRuntimeChanged(),
    onNotice: () => app?.handleRuntimeChanged()
  });

  app = createCircuitSiegeAppController({
    board,
    runtime,
    sessionController,
    renderApp
  });

  bindButtons(app, root);
  await app.boot();
  return app;
}
