import {
  buildLobbyActionHint,
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
  openOnlineMenu,
  returnToRootMenu,
  returnToSideSelect,
  selectPublicQueueSide,
  setLobbyPhase,
  updateJoinRoomCode
} from "./queue-setup-state.js";

function deriveScreen(runtime) {
  if (runtime.snapshot || runtime.matchReady) {
    return "match";
  }

  return "menu";
}

function deriveScreenFromUi(runtime, queueSetupState) {
  if (runtime.snapshot || runtime.matchReady) {
    return "match";
  }

  if (queueSetupState.menuPhase === "hidden") {
    return "matchmaking";
  }

  return "menu";
}

function getOpponentSide(side) {
  return side === "red" ? "blue" : "red";
}

function getProfileForSide(runtime, side) {
  const snapshotPlayer = runtime.snapshot?.players?.[side];
  if (snapshotPlayer?.displayName || snapshotPlayer?.playerId) {
    return {
      displayName: snapshotPlayer.displayName || "",
      playerId: snapshotPlayer.playerId || "",
      side
    };
  }

  if (runtime.identity && side === runtime.selectedSide) {
    return {
      displayName: runtime.identity.displayName || "",
      playerId: runtime.identity.playerId || "",
      side
    };
  }

  const profiles = Object.values(runtime.profiles || {});
  const matchingProfile = profiles.find((profile) => profile?.side === side);
  if (matchingProfile) {
    return matchingProfile;
  }

  return null;
}

function formatPlayerLabel(prefix, profile, fallbackText) {
  if (!profile) {
    return `${prefix}: ${fallbackText}`;
  }

  const displayName = String(profile.displayName || "").trim();
  const playerId = String(profile.playerId || "").trim();
  return `${prefix}: ${displayName || playerId || fallbackText}`;
}

function formatTimerText(snapshot, now) {
  let totalMs = 300000;

  if (snapshot?.phase === "live" && Number.isFinite(Number(snapshot.endsAt)) && Number.isFinite(Number(now))) {
    totalMs = Math.max(0, Math.floor(Number(snapshot.endsAt) - Number(now)));
  } else if (snapshot?.timerMsRemaining != null) {
    totalMs = Number(snapshot.timerMsRemaining) || 0;
  }

  const clamped = Math.max(0, Math.floor(totalMs));
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function createCircuitSiegeAppController({
  board,
  runtime,
  sessionController,
  renderApp
} = {}) {
  let inputState = createBoardInputState();
  let queueSetupState = createQueueSetupState();
  let presentationNow = Date.now();
  let lastViewModel = null;
  let lastBoardViewModel = null;
  let lastBoardViewModelDeps = null;
  let pointerState = {
    x: 0,
    y: 0,
    active: false
  };

  function syncFlowFromRuntime() {
    if (runtime.snapshot || runtime.matchReady) {
      return;
    }

    if (runtime.lobby) {
      queueSetupState = setLobbyPhase(queueSetupState, "room");
      return;
    }

    if (runtime.searching) {
      queueSetupState = setLobbyPhase(queueSetupState, "searching");
      return;
    }

    if (queueSetupState.menuPhase === "hidden" && queueSetupState.lobbyPhase === "room") {
      queueSetupState = setLobbyPhase(queueSetupState, "main");
      return;
    }

    if (queueSetupState.menuPhase === "hidden" && queueSetupState.lobbyPhase === "searching") {
      queueSetupState = setLobbyPhase(queueSetupState, "main");
    }
  }

  function buildViewModel() {
    const queueSetupViewModel = buildQueueSetupViewModel({
      setupState: queueSetupState
    });
    const selectedSide = runtime.selectedSide || queueSetupViewModel.publicSide || "blue";
    const opponentSide = getOpponentSide(selectedSide);
    const localProfile = getProfileForSide(runtime, selectedSide);
    const opponentProfile = getProfileForSide(runtime, opponentSide);

    return {
      screen: deriveScreenFromUi(runtime, queueSetupState),
      menuPhase: queueSetupViewModel.menuPhase,
      lobbyPhase: queueSetupViewModel.lobbyPhase,
      menuNotice: runtime.lastNotice || "",
      queueSetup: queueSetupViewModel,
      queueStatusText: getQueueStatusText({
        matchmakingMode: runtime.matchmakingMode,
        selectedSide,
        queueCounts: runtime.queueCounts,
        lobbyPhase: queueSetupViewModel.lobbyPhase
      }),
      lobbyStatusText: getLobbyStatusText({
        lobby: runtime.lobby,
        matchReady: runtime.matchReady,
        lobbyPhase: queueSetupViewModel.lobbyPhase,
        selectedSide
      }),
      lobbyActionHint: buildLobbyActionHint({
        lobby: runtime.lobby,
        matchReady: runtime.matchReady,
        lobbyPhase: queueSetupViewModel.lobbyPhase,
        selectedSide
      }),
      joinRoomCode: queueSetupViewModel.joinRoomCode,
      roomCode: runtime.lobby?.roomCode || "-----",
      playerLabels: {
        you: formatPlayerLabel("YOU", localProfile, "Connecting"),
        opponent: formatPlayerLabel("OPPONENT", opponentProfile, "Connecting")
      },
      selectedSide,
      heldMask: inputState.heldMask,
      heldCursor: {
        visible: !!inputState.heldMask && pointerState.active,
        x: pointerState.x,
        y: pointerState.y,
        mask: inputState.heldMask,
        side: selectedSide
      },
      board: getBoardViewModel(selectedSide)
    };
  }

  function getSelectedSide() {
    const queueSetupViewModel = buildQueueSetupViewModel({
      setupState: queueSetupState
    });
    return runtime.selectedSide || queueSetupViewModel.publicSide || "blue";
  }

  function getBoardViewModel(selectedSide) {
    const deps = {
      snapshot: runtime.snapshot,
      selectedSide,
      selectedSlotId: inputState.selectedSlotId
    };

    if (
      lastBoardViewModel
      && lastBoardViewModelDeps
      && lastBoardViewModelDeps.snapshot === deps.snapshot
      && lastBoardViewModelDeps.selectedSide === deps.selectedSide
      && lastBoardViewModelDeps.selectedSlotId === deps.selectedSlotId
    ) {
      lastBoardViewModel.timerText = formatTimerText(runtime.snapshot, presentationNow);
      return lastBoardViewModel;
    }

    lastBoardViewModel = buildBoardViewModel({
      board,
      snapshot: runtime.snapshot,
      selectedSide,
      selectedSlotId: inputState.selectedSlotId,
      now: presentationNow
    });
    lastBoardViewModelDeps = deps;
    return lastBoardViewModel;
  }

  function rerender() {
    lastViewModel = buildViewModel();
    renderApp(lastViewModel);
  }

  async function boot() {
    rerender();
  }

  async function startPublicBlue() {
    selectSide("blue");
    return findMatch();
  }

  async function startPublicRed() {
    selectSide("red");
    return findMatch();
  }

  function openSideSelect() {
    queueSetupState = openOnlineMenu(queueSetupState);
    rerender();
  }

  function selectSide(side) {
    queueSetupState = selectPublicQueueSide(queueSetupState, side);
    runtime.selectedSide = queueSetupState.publicSide;
    rerender();
  }

  async function findMatch() {
    const side = queueSetupState.publicSide;
    if (!side) {
      rerender();
      return false;
    }

    runtime.matchmakingMode = "public";
    runtime.selectedSide = side;
    queueSetupState = setLobbyPhase(queueSetupState, "searching");
    await sessionController.startPublicMatch({ side });
    rerender();
    return true;
  }

  function openFriendOptions() {
    queueSetupState = setLobbyPhase(queueSetupState, "friend_options");
    rerender();
  }

  function openJoinRoomEntry() {
    queueSetupState = setLobbyPhase(queueSetupState, "join");
    rerender();
  }

  function updateJoinCode(nextCode) {
    queueSetupState = updateJoinRoomCode(queueSetupState, nextCode);
    rerender();
  }

  async function startPrivateHost() {
    const side = queueSetupState.publicSide || runtime.selectedSide || "blue";
    runtime.matchmakingMode = "private_create";
    runtime.selectedSide = side;
    queueSetupState = setLobbyPhase(queueSetupState, "room");
    await sessionController.startPrivateCreate({ side });
    rerender();
  }

  async function joinPrivateRoom(roomCode = queueSetupState.joinRoomCode) {
    const side = queueSetupState.publicSide || runtime.selectedSide || "red";
    runtime.matchmakingMode = "private_join";
    runtime.selectedSide = side;
    await sessionController.startPrivateJoin({ side, roomCode });
    rerender();
  }

  async function submitJoinRoom() {
    if (!queueSetupState.joinRoomCode) {
      rerender();
      return false;
    }

    return joinPrivateRoom(queueSetupState.joinRoomCode);
  }

  function leaveMatchmaking() {
    const screen = deriveScreenFromUi(runtime, queueSetupState);

    if (screen === "match") {
      sessionController.disconnect();
      runtime.matchmakingMode = null;
      queueSetupState = returnToRootMenu(queueSetupState);
      rerender();
      return true;
    }

    if (runtime.lobby) {
      sessionController.leaveLobby?.();
      runtime.matchmakingMode = null;
      queueSetupState = returnToSideSelect(queueSetupState);
      rerender();
      return true;
    }

    if (runtime.searching) {
      sessionController.cancelSearch?.();
      runtime.matchmakingMode = null;
      queueSetupState = setLobbyPhase(queueSetupState, "main");
      rerender();
      return true;
    }

    sessionController.disconnect();
    runtime.matchmakingMode = null;
    queueSetupState = returnToRootMenu(queueSetupState);
    rerender();
    return true;
  }

  function goBack() {
    const screen = deriveScreenFromUi(runtime, queueSetupState);

    if (screen === "menu" && queueSetupState.menuPhase === "side_select") {
      queueSetupState = returnToRootMenu(queueSetupState);
      rerender();
      return true;
    }

    if (screen === "matchmaking") {
      if (runtime.lobby) {
        return leaveMatchmaking();
      }

      if (runtime.searching) {
        sessionController.cancelSearch?.();
        runtime.matchmakingMode = null;
        queueSetupState = setLobbyPhase(queueSetupState, "main");
        rerender();
        return true;
      }

      if (queueSetupState.lobbyPhase === "friend_options") {
        queueSetupState = setLobbyPhase(queueSetupState, "main");
        rerender();
        return true;
      }

      if (queueSetupState.lobbyPhase === "join") {
        queueSetupState = setLobbyPhase(queueSetupState, "friend_options");
        rerender();
        return true;
      }

      queueSetupState = returnToSideSelect(queueSetupState);
      rerender();
      return true;
    }

    return false;
  }

  function selectActiveTool(toolId) {
    inputState = selectTool(inputState, toolId);
    rerender();
  }

  function handleBoardSlot(slotId) {
    const boardViewModel = getBoardViewModel(getSelectedSide());
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
    if (!inputState.heldMask) {
      return false;
    }

    pointerState = {
      x: Number(x) || 0,
      y: Number(y) || 0,
      active: true
    };
    rerender();
    return true;
  }

  function clearPointer() {
    if (!pointerState.active) {
      return false;
    }

    pointerState = {
      ...pointerState,
      active: false
    };
    rerender();
    return true;
  }

  function handleRuntimeChanged() {
    syncFlowFromRuntime();
    rerender();
  }

  function tickPresentation(now = Date.now()) {
    presentationNow = Number(now) || Date.now();
    if (runtime.snapshot?.phase === "live") {
      rerender();
    }
  }

  return {
    boot,
    openSideSelect,
    startPublicBlue,
    startPublicRed,
    selectSide,
    findMatch,
    openFriendOptions,
    openJoinRoomEntry,
    updateJoinRoomCode: updateJoinCode,
    submitJoinRoom,
    startPrivateHost,
    joinPrivateRoom,
    leaveMatchmaking,
    goBack,
    selectTool: selectActiveTool,
    handleBoardSlot,
    rotateHeldPiece,
    switchHeldPieceFamily,
    updatePointer,
    clearPointer,
    rotateSelectedSlot: rotateHeldPiece,
    handleRuntimeChanged,
    tickPresentation
  };
}
