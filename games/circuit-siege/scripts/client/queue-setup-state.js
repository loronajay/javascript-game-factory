function isSupportedPublicSide(side) {
  return side === "blue" || side === "red";
}

function formatSideLabel(side) {
  return side === "red" ? "Red" : "Blue";
}

function sanitizeRoomCode(code = "") {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function createQueueSetupState() {
  return {
    menuPhase: "root",
    lobbyPhase: "main",
    publicSide: null,
    joinRoomCode: ""
  };
}

export function openOnlineMenu(state) {
  return {
    ...state,
    menuPhase: "side_select",
    lobbyPhase: "main"
  };
}

export function returnToRootMenu(state) {
  return {
    ...state,
    menuPhase: "root",
    lobbyPhase: "main",
    joinRoomCode: ""
  };
}

export function returnToSideSelect(state) {
  return {
    ...state,
    menuPhase: "side_select",
    lobbyPhase: "main",
    joinRoomCode: ""
  };
}

export function selectPublicQueueSide(state, side) {
  if (!isSupportedPublicSide(side)) {
    return state;
  }

  return {
    ...state,
    publicSide: side,
    menuPhase: "hidden",
    lobbyPhase: "main"
  };
}

export function setLobbyPhase(state, lobbyPhase) {
  return {
    ...state,
    menuPhase: "hidden",
    lobbyPhase
  };
}

export function updateJoinRoomCode(state, code) {
  return {
    ...state,
    joinRoomCode: sanitizeRoomCode(code)
  };
}

export function buildQueueSetupViewModel({ setupState = createQueueSetupState() } = {}) {
  const publicSide = isSupportedPublicSide(setupState.publicSide) ? setupState.publicSide : null;
  const sideLabel = publicSide ? formatSideLabel(publicSide) : "Choose Side";

  return {
    menuPhase: setupState.menuPhase,
    lobbyPhase: setupState.lobbyPhase,
    publicSide,
    joinRoomCode: sanitizeRoomCode(setupState.joinRoomCode),
    publicSelectionText: publicSide
      ? `${sideLabel} side locked.`
      : "Choose Blue or Red to continue.",
    sideSelectionText: publicSide
      ? `${sideLabel} side locked.`
      : "Choose Blue or Red to continue.",
    sideHeadingText: publicSide
      ? `${sideLabel} Chair Locked`
      : "Choose Your Side",
    joinDisabled: sanitizeRoomCode(setupState.joinRoomCode).length < 4
  };
}
