import {
  buildLobbyActionHint,
  buildLobbyStartActionState,
  getLobbyStatusText,
  getQueueStatusText
} from "./lobby-view-state.js";
import { buildBoardViewModel } from "./board-view-model.js";
import {
  buildRotateIntentFromSelection,
  buildIntentFromCell,
  createBoardInputState,
  selectBoardSlot,
  selectTool
} from "./board-input-controller.js";
import {
  buildQueueSetupViewModel,
  createQueueSetupState,
  selectPublicQueueSide
} from "./queue-setup-state.js";

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
  let queueSetupState = createQueueSetupState();

  function buildViewModel() {
    return {
      screen: deriveScreen(runtime),
      menuNotice: runtime.lastNotice || "",
      queueSetup: buildQueueSetupViewModel({
        setupState: queueSetupState
      }),
      queueStatusText: getQueueStatusText({
        matchmakingMode: runtime.matchmakingMode,
        selectedSide: runtime.selectedSide,
        queueCounts: runtime.queueCounts
      }),
      lobbyStatusText: getLobbyStatusText({
        lobby: runtime.lobby,
        matchReady: runtime.matchReady
      }),
      lobbyActionHint: buildLobbyActionHint({
        lobby: runtime.lobby,
        isHost: runtime.isHost,
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
        selectedSide: runtime.selectedSide || "blue",
        selectedSlotId: inputState.selectedSlotId
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
    queueSetupState = selectPublicQueueSide(queueSetupState, "blue");
    return confirmPublicQueue();
  }

  async function startPublicRed() {
    queueSetupState = selectPublicQueueSide(queueSetupState, "red");
    return confirmPublicQueue();
  }

  function selectPublicSide(side) {
    queueSetupState = selectPublicQueueSide(queueSetupState, side);
    rerender();
  }

  async function confirmPublicQueue() {
    const side = queueSetupState.publicSide;
    if (!side) {
      rerender();
      return false;
    }

    runtime.matchmakingMode = "public";
    runtime.selectedSide = side;
    await sessionController.startPublicMatch({ side });
    rerender();
    return true;
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
      selectedSide: runtime.selectedSide || "blue",
      selectedSlotId: inputState.selectedSlotId
    });
    const cell = boardViewModel.cells.find((entry) => entry.slotId === slotId) || null;
    inputState = selectBoardSlot(inputState, cell?.slotId || null);
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

  function rotateSelectedSlot() {
    const selectedSlotId = inputState.selectedSlotId;
    if (!selectedSlotId) {
      return false;
    }

    const boardViewModel = buildBoardViewModel({
      board,
      snapshot: runtime.snapshot,
      selectedSide: runtime.selectedSide || "blue",
      selectedSlotId
    });
    const cell = boardViewModel.cells.find((entry) => entry.slotId === selectedSlotId) || null;
    const built = buildRotateIntentFromSelection({ cell });

    if (!built.ok) {
      rerender();
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
    selectPublicSide,
    confirmPublicQueue,
    startPrivateHost,
    joinPrivateRoom,
    requestReady,
    requestStartNow,
    leaveMatchmaking,
    selectTool: selectActiveTool,
    handleBoardSlot,
    rotateSelectedSlot,
    handleRuntimeChanged
  };
}
