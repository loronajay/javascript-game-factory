// Stable hash of authoritative match state for desync detection and replay
// verification. Online accepted-command responses can carry this so the joining
// client can confirm its mirrored state matches the host after every command.
//
// The hash covers every field that affects future legal actions, including the
// RNG state (so a divergent dice stream is caught immediately). It excludes
// matchId/mode/schemaVersion because those never change mid-match.

function canonicalUnits(units) {
  return [...units]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map(
      (unit) =>
        `${unit.id}=${unit.x},${unit.y},${unit.hp},` +
        `${unit.spent ? 1 : 0},${unit.defending ? 1 : 0}`,
    )
    .join("|");
}

function canonicalActivation(activation) {
  if (!activation) {
    return "-";
  }

  return (
    `${activation.unitId},${activation.origin.x},${activation.origin.y},` +
    `${activation.moved ? 1 : 0},${activation.primaryUsed ? 1 : 0}`
  );
}

export function canonicalString(state) {
  return [
    state.size,
    state.phase,
    state.turnNumber,
    state.currentPlayer,
    state.winner ?? "-",
    state.victoryReason ?? "-",
    state.rngState,
    canonicalActivation(state.activation),
    canonicalUnits(state.units),
  ].join(";");
}

// FNV-1a 32-bit, rendered as 8 hex chars. Small and dependency-free; this is a
// consistency check, not a security primitive.
export function hashState(state) {
  const text = canonicalString(state);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
