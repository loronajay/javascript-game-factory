const ROTATE_MASK = {
  EW: "NS",
  NS: "EW",
  NE: "ES",
  ES: "SW",
  SW: "NW",
  NW: "NE"
};

const PLACEMENT_BY_MASK = {
  EW: { pieceType: "straight", rotation: 0 },
  NS: { pieceType: "straight", rotation: 90 },
  NE: { pieceType: "corner", rotation: 0 },
  ES: { pieceType: "corner", rotation: 90 },
  SW: { pieceType: "corner", rotation: 180 },
  NW: { pieceType: "corner", rotation: 270 }
};

function isKnownMask(mask) {
  return typeof mask === "string" && Object.prototype.hasOwnProperty.call(PLACEMENT_BY_MASK, mask);
}

function isStraightMask(mask) {
  return mask === "EW" || mask === "NS";
}

export function getNextRotationMask(mask) {
  return ROTATE_MASK[mask] || null;
}

export function createBoardInputState() {
  return {
    heldMask: null,
    selectedSlotId: null,
    liftedFromSlotId: null
  };
}

export function selectTool(inputState, selectedMask) {
  if (!isKnownMask(selectedMask)) {
    return inputState;
  }

  return {
    ...inputState,
    heldMask: selectedMask,
    liftedFromSlotId: null
  };
}

export function selectBoardSlot(inputState, selectedSlotId) {
  return {
    ...inputState,
    selectedSlotId: selectedSlotId || null
  };
}

export function rotateHeldMask(inputState) {
  if (!isKnownMask(inputState?.heldMask)) {
    return inputState;
  }

  return {
    ...inputState,
    heldMask: getNextRotationMask(inputState.heldMask) || inputState.heldMask
  };
}

export function toggleHeldPieceFamily(inputState) {
  if (!isKnownMask(inputState?.heldMask)) {
    return inputState;
  }

  return {
    ...inputState,
    heldMask: isStraightMask(inputState.heldMask) ? "NE" : "EW"
  };
}

export function liftHeldMaskFromCell({ inputState, cell } = {}) {
  if (!cell?.slotId || !cell.editableByLocalPlayer) {
    return { ok: false, reason: "not-editable", inputState };
  }

  if (cell.locked) {
    return { ok: false, reason: "locked", inputState };
  }

  if (!isKnownMask(cell.placedMask)) {
    return { ok: false, reason: "no-tile", inputState };
  }

  return {
    ok: true,
    inputState: {
      ...inputState,
      heldMask: cell.placedMask,
      selectedSlotId: cell.slotId,
      liftedFromSlotId: cell.slotId
    }
  };
}

export function buildHeldPlacementIntent({ cell, inputState } = {}) {
  if (!cell?.slotId || !cell.editableByLocalPlayer) {
    return { ok: false, reason: "not-editable" };
  }

  if (cell.locked) {
    return { ok: false, reason: "locked" };
  }

  if (!isKnownMask(inputState?.heldMask)) {
    return { ok: false, reason: "no-held-mask" };
  }

  const placement = PLACEMENT_BY_MASK[inputState.heldMask];

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
