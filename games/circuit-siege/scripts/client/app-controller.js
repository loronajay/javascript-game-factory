import {
  buildLobbyActionHint,
  buildLobbyStartActionState,
  getLobbyStatusText,
  getQueueStatusText
} from "./lobby-view-state.js";
import { buildBoardViewModel } from "./board-view-model.js";
import {
  buildHeldPlacementIntent,
  createBoardInputState,
  liftHeldMaskFromCell,
  rotateHeldMask,
  selectBoardSlot,
  selectTool,
  toggleHeldPieceFamily
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
  let pointerState = {
    x: 0,
    y: 0,
    active: false
  };

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
      heldMask: inputState.heldMask,
      heldCursor: {
        visible: !!inputState.heldMask && pointerState.active,
        x: pointerState.x,
        y: pointerState.y,
        mask: inputState.heldMask,
        side: runtime.selectedSide || "blue"
      },
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

    if (!cell?.editableByLocalPlayer || cell.locked) {
      rerender();
      return false;
    }

    inputState = selectBoardSlot(inputState, cell.slotId);

    if (!inputState.heldMask && cell.placedMask) {
      const lifted = liftHeldMaskFromCell({
        inputState,
        cell
      });
      if (lifted.ok) {
        inputState = lifted.inputState;
        rerender();
        return true;
      }
    }

    const built = buildHeldPlacementIntent({
      cell,
      inputState
    });

    if (!built.ok) {
      rerender();
      return true;
    }

    const handled = sessionController.submitIntent?.(built.intent) || false;
    rerender();
    return handled;
  }

  function rotateHeldPiece() {
    if (!inputState.heldMask) {
      return false;
    }

    inputState = rotateHeldMask(inputState);
    rerender();
    return true;
  }

  function switchHeldPieceFamily() {
    if (!inputState.heldMask) {
      return false;
    }

    inputState = toggleHeldPieceFamily(inputState);
    rerender();
    return true;
  }

  function updatePointer(x, y) {
    pointerState = {
      x: Number(x) || 0,
      y: Number(y) || 0,
      active: true
    };
    rerender();
  }

  function clearPointer() {
    pointerState = {
      ...pointerState,
      active: false
    };
    rerender();
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
    rotateHeldPiece,
    switchHeldPieceFamily,
    updatePointer,
    clearPointer,
    rotateSelectedSlot: rotateHeldPiece,
    handleRuntimeChanged
  };
}
