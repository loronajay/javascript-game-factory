import {
  buildLobbyStartActionState,
  getLobbyStatusText,
  getQueueStatusText
} from "./lobby-view-state.js";
import { buildBoardViewModel } from "./board-view-model.js";
import {
  buildIntentFromCell,
  createBoardInputState,
  selectTool
} from "./board-input-controller.js";

function deriveScreen(runtime) {
  if (runtime.snapshot || runtime.matchReady) {
    return "match";
  }

  if (runtime.lobby || runtime.searching || runtime.matchmakingMode) {
    return "matchmaking";
  }

  return "menu";
}

export function createCircuitSiegeAppController({
  board,
  runtime,
  sessionController,
  renderApp
} = {}) {
  let inputState = createBoardInputState();

  function buildViewModel() {
    return {
      screen: deriveScreen(runtime),
      menuNotice: runtime.lastNotice || "",
      queueStatusText: getQueueStatusText({
        matchmakingMode: runtime.matchmakingMode,
        selectedSide: runtime.selectedSide,
        queueCounts: runtime.queueCounts
      }),
      lobbyStatusText: getLobbyStatusText({
        lobby: runtime.lobby,
        matchReady: runtime.matchReady
      }),
      lobbyStartAction: buildLobbyStartActionState({
        isHost: runtime.isHost,
        lobby: runtime.lobby,
        startRequested: !!runtime.matchReady
      }),
      roomCode: runtime.lobby?.roomCode || "-----",
      selectedSide: runtime.selectedSide || "blue",
      selectedTool: inputState.selectedTool,
      board: buildBoardViewModel({
        board,
        snapshot: runtime.snapshot,
        selectedSide: runtime.selectedSide || "blue"
      })
    };
  }

  function rerender() {
    renderApp(buildViewModel());
  }

  async function boot() {
    rerender();
  }

  async function startPublicBlue() {
    runtime.matchmakingMode = "public";
    runtime.selectedSide = "blue";
    await sessionController.startPublicMatch({ side: "blue" });
    rerender();
  }

  async function startPublicRed() {
    runtime.matchmakingMode = "public";
    runtime.selectedSide = "red";
    await sessionController.startPublicMatch({ side: "red" });
    rerender();
  }

  async function startPrivateHost() {
    runtime.matchmakingMode = "private_create";
    runtime.selectedSide = "blue";
    await sessionController.startPrivateCreate({ side: "blue" });
    rerender();
  }

  async function joinPrivateRoom(roomCode) {
    runtime.matchmakingMode = "private_join";
    runtime.selectedSide = "red";
    await sessionController.startPrivateJoin({ side: "red", roomCode });
    rerender();
  }

  function requestReady(ready = true) {
    const handled = sessionController.requestReady(ready);
    rerender();
    return handled;
  }

  function requestStartNow() {
    const handled = sessionController.requestStartNow();
    rerender();
    return handled;
  }

  function leaveMatchmaking() {
    sessionController.disconnect();
    runtime.matchmakingMode = null;
    rerender();
  }

  function selectActiveTool(toolId) {
    inputState = selectTool(inputState, toolId);
    rerender();
  }

  function handleBoardSlot(slotId) {
    const boardViewModel = buildBoardViewModel({
      board,
      snapshot: runtime.snapshot,
      selectedSide: runtime.selectedSide || "blue"
    });
    const cell = boardViewModel.cells.find((entry) => entry.slotId === slotId) || null;
    const built = buildIntentFromCell({
      cell,
      inputState
    });

    if (!built.ok) {
      return false;
    }

    const handled = sessionController.submitIntent?.(built.intent) || false;
    rerender();
    return handled;
  }

  function handleRuntimeChanged() {
    rerender();
  }

  return {
    boot,
    startPublicBlue,
    startPublicRed,
    startPrivateHost,
    joinPrivateRoom,
    requestReady,
    requestStartNow,
    leaveMatchmaking,
    selectTool: selectActiveTool,
    handleBoardSlot,
    handleRuntimeChanged
  };
}
