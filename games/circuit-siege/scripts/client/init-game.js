import { loadBoardDefinition } from "../shared/circuit-board.js";
import { createRemoteMatchAdapter } from "../adapters/remote-match-adapter.js";
import { createSessionRuntimeState } from "./session-runtime-state.js";
import { createCircuitSiegeSessionController } from "./session-controller.js";
import { createCircuitSiegeAppController } from "./app-controller.js";
import { createAppRenderer } from "./app-renderer.js";
import { loadCircuitSiegeIdentity } from "./identity.js";

export function findSlotIdFromEventTarget(target) {
  let current = target || null;

  while (current) {
    if (typeof current.dataset?.slotId === "string" && current.dataset.slotId.length > 0) {
      return current.dataset.slotId;
    }

    if (typeof current.getAttribute === "function") {
      const slotId = current.getAttribute("data-slot-id");
      if (typeof slotId === "string" && slotId.length > 0) {
        return slotId;
      }
    }

    current = current.parentElement || current.parentNode || null;
  }

  return null;
}

function bindButtons(app, root = document) {
  root.querySelectorAll("[data-public-side]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectPublicSide(button.dataset.publicSide || "blue");
    });
  });
  root.querySelector("#btn-confirm-public")?.addEventListener("click", () => {
    app.confirmPublicQueue();
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
    const slotId = findSlotIdFromEventTarget(event.target);
    if (!slotId) return;
    app.handleBoardSlot(slotId);
  });
  root.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const tagName = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
    if (tagName === "INPUT" || tagName === "TEXTAREA") return;
    if (String(event.key || "").toLowerCase() !== "r") return;
    if (app.rotateSelectedSlot()) {
      event.preventDefault();
    }
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
