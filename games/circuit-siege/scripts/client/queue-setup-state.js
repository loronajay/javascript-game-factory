function isSupportedPublicSide(side) {
  return side === "blue" || side === "red";
}

function formatSideLabel(side) {
  return side === "red" ? "Red" : "Blue";
}

export function createQueueSetupState() {
  return {
    publicSide: null
  };
}

export function selectPublicQueueSide(state, side) {
  if (!isSupportedPublicSide(side)) {
    return state;
  }

  return {
    ...state,
    publicSide: side
  };
}

export function buildQueueSetupViewModel({ setupState = createQueueSetupState() } = {}) {
  const publicSide = isSupportedPublicSide(setupState.publicSide) ? setupState.publicSide : null;

  return {
    publicSide,
    publicSelectionText: publicSide
      ? `${formatSideLabel(publicSide)} chair selected. Lock it in to enter public queue.`
      : "Choose Blue or Red, then lock that chair before public queue starts.",
    publicConfirmDisabled: !publicSide,
    publicConfirmText: publicSide
      ? `Lock ${formatSideLabel(publicSide)} Chair & Enter Queue`
      : "Choose A Chair To Queue"
  };
}
