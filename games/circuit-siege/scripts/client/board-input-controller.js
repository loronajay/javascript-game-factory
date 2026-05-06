function toolToPiecePlacement(toolId) {
  if (toolId === "straight") {
    return { pieceType: "straight", rotation: 0 };
  }

  if (toolId === "straight-h") {
    return { pieceType: "straight", rotation: 0 };
  }

  if (toolId === "straight-v") {
    return { pieceType: "straight", rotation: 90 };
  }

  if (toolId === "corner") {
    return { pieceType: "corner", rotation: 0 };
  }

  return null;
}

export function createBoardInputState() {
  return {
    selectedTool: "straight",
    selectedSlotId: null
  };
}

export function selectTool(inputState, selectedTool) {
  return {
    ...inputState,
    selectedTool
  };
}

export function selectBoardSlot(inputState, selectedSlotId) {
  return {
    ...inputState,
    selectedSlotId: selectedSlotId || null
  };
}

export function buildIntentFromCell({
  cell,
  inputState
} = {}) {
  if (!cell?.slotId || !cell.editableByLocalPlayer) {
    return { ok: false, reason: "not-editable" };
  }

  if (cell.locked) {
    return { ok: false, reason: "locked" };
  }

  if (inputState?.selectedTool === "rotate") {
    if (!cell.placedMask) {
      return { ok: false, reason: "no-tile" };
    }

    return {
      ok: true,
      intent: {
        intentType: "ROTATE_TILE",
        slotId: cell.slotId
      }
    };
  }

  const placement = toolToPiecePlacement(inputState?.selectedTool);
  if (!placement) {
    return { ok: false, reason: "unknown-tool" };
  }

  if (cell.placedMask) {
    const currentFamily = cell.placedMask === "EW" || cell.placedMask === "NS" ? "straight" : "corner";
    if (placement.pieceType === currentFamily) {
      return { ok: false, reason: "selection-only" };
    }
  }

  return {
    ok: true,
    intent: {
      intentType: cell.slotType === "hole" ? "PLACE_TILE" : "REPLACE_TILE",
      slotId: cell.slotId,
      pieceType: placement.pieceType,
      rotation: placement.rotation
    }
  };
}

export function buildRotateIntentFromSelection({ cell } = {}) {
  if (!cell?.slotId || !cell.editableByLocalPlayer) {
    return { ok: false, reason: "not-editable" };
  }

  if (cell.locked) {
    return { ok: false, reason: "locked" };
  }

  if (!cell.placedMask) {
    return { ok: false, reason: "no-tile" };
  }

  return {
    ok: true,
    intent: {
      intentType: "ROTATE_TILE",
      slotId: cell.slotId
    }
  };
}
