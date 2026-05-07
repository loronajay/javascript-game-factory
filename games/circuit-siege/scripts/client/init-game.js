import { loadBoardDefinition } from "../shared/circuit-board.js";
import { createRemoteMatchAdapter } from "../adapters/remote-match-adapter.js";
import { createSessionRuntimeState } from "./session-runtime-state.js";
import { createCircuitSiegeSessionController } from "./session-controller.js";
import { createCircuitSiegeAppController } from "./app-controller.js";
import { createAppRenderer } from "./app-renderer.js";
import { loadCircuitSiegeIdentity } from "./identity.js";

const PRESENTATION_TICK_MS = 1000 / 30;

export function resolvePresentationNow(timestamp, performanceLike = globalThis.performance, nowFn = () => Date.now()) {
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) {
    return Number(nowFn()) || Date.now();
  }

  if (numericTimestamp >= 1_000_000_000_000) {
    return numericTimestamp;
  }

  const timeOrigin = Number(performanceLike?.timeOrigin);
  if (Number.isFinite(timeOrigin) && timeOrigin > 0) {
    return Math.floor(timeOrigin + numericTimestamp);
  }

  return Number(nowFn()) || Date.now();
}

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
  root.querySelector("#btn-play-online")?.addEventListener("click", () => {
    app.openSideSelect?.();
  });
  root.querySelector("#btn-back-to-root")?.addEventListener("click", () => {
    app.goBack?.();
  });
  root.querySelectorAll("[data-public-side]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectSide(button.dataset.publicSide || "blue");
    });
  });
  root.querySelector("#btn-find-match")?.addEventListener("click", () => {
    app.findMatch?.();
  });
  root.querySelector("#btn-cancel-search")?.addEventListener("click", () => {
    app.leaveMatchmaking?.();
  });
  root.querySelector("#btn-play-friend")?.addEventListener("click", () => {
    app.openFriendOptions?.();
  });
  root.querySelector("#btn-change-side")?.addEventListener("click", () => {
    app.goBack?.();
  });
  root.querySelector("#btn-friend-back")?.addEventListener("click", () => {
    app.goBack?.();
  });
  root.querySelector("#btn-open-join")?.addEventListener("click", () => {
    app.openJoinRoomEntry?.();
  });
  root.querySelector("#btn-private-host")?.addEventListener("click", () => {
    app.startPrivateHost();
  });
  root.querySelector("#room-code-input")?.addEventListener("input", (event) => {
    app.updateJoinRoomCode?.(event.target?.value || "");
  });
  root.querySelector("#btn-private-join")?.addEventListener("click", () => {
    app.submitJoinRoom?.();
  });
  root.querySelector("#btn-join-back")?.addEventListener("click", () => {
    app.goBack?.();
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
  root.addEventListener("mousemove", (event) => {
    app.updatePointer?.(event.clientX, event.clientY);
  });
  root.addEventListener("mouseleave", () => {
    app.clearPointer?.();
  });
  root.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const tagName = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
    if (tagName === "INPUT" || tagName === "TEXTAREA") return;
    const key = String(event.key || "").toLowerCase();
    if (key === "r" && app.rotateSelectedSlot()) {
      event.preventDefault();
      return;
    }
    if (key === "f" && app.switchHeldPieceFamily?.()) {
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

  if (typeof globalThis.requestAnimationFrame === "function") {
    let lastTime = null;
    let accumulator = 0;

    function loop(timestamp) {
      const now = resolvePresentationNow(timestamp);
      if (lastTime === null) {
        lastTime = now;
      }

      accumulator += Math.min(now - lastTime, 100);
      lastTime = now;

      while (accumulator >= PRESENTATION_TICK_MS) {
        accumulator -= PRESENTATION_TICK_MS;
        app.tickPresentation?.(now);
      }

      globalThis.requestAnimationFrame(loop);
    }

    globalThis.requestAnimationFrame(loop);
  }

  return app;
}
