// Stable hash of authoritative match state for online desync detection and replay
// verification. In deterministic lockstep (see src/online/onlineSession.js) clients
// never send rendered state — each applies its own accepted command and broadcasts
// the COMMAND; every peer replays it through the same seeded reducer. The lobby
// owner broadcasts THIS hash keyed by `revision` so non-owners can confirm their
// mirrored state matches after every command.
//
// The hash covers every field that affects future legal actions, INCLUDING the RNG
// state (so a divergent dice stream is caught immediately) and the board tile
// objects (Build Cover walls / Throw Cigar fire). It deliberately EXCLUDES
// `revision` (the transport sequence key, identical across synced clients but not a
// gameplay field) and any transient `pendingRolloverEvents` (already stripped by the
// reducer's accept() before a state is returned). Board/ruleset compatibility is
// checked once at match setup, not hashed here.

// Deterministic JSON for the open-ended per-unit objects (statModifiers) and per-
// status entries: keys are emitted in sorted order so two structurally-equal objects
// always stringify identically regardless of insertion order.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function canonicalStatuses(statuses = []) {
  // Status order is itself deterministic (both clients run the identical reducer),
  // so we preserve array order and only normalize each entry's key order.
  return statuses.map(stableStringify).join("/");
}

function canonicalUnits(units) {
  return [...units]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map(
      (unit) =>
        `${unit.id}=${unit.player},${unit.type},` +
        `${unit.position.x},${unit.position.y},${unit.hp},${unit.mp},` +
        `${unit.defending ? 1 : 0},${unit.spent ? 1 : 0},${unit.mageChargeCount ?? 0},` +
        `${stableStringify(unit.statModifiers ?? {})},` +
        `[${canonicalStatuses(unit.statuses)}]`
    )
    .join("|");
}

function canonicalActivation(activation) {
  if (!activation) return "-";
  return (
    `${activation.unitId},${activation.origin.x},${activation.origin.y},` +
    `${activation.moved ? 1 : 0},${activation.primaryUsed ? 1 : 0},` +
    `${activation.spellUsed ? 1 : 0},` +
    `[${(activation.bonusActionGroups ?? []).map(stableStringify).join(",")}]`
  );
}

// Board-level placeables (walls/fire) and authored tile affinities are keyed maps;
// emit their entries in sorted-key order so the string is insertion-order-independent.
function canonicalKeyedMap(map = {}) {
  return Object.keys(map)
    .sort()
    .map((key) => `${key}:${stableStringify(map[key])}`)
    .join(",");
}

export function canonicalString(state) {
  return [
    state.size,
    state.phase,
    state.turnNumber,
    state.currentPlayer,
    state.winner ?? "-",
    state.rngState,
    canonicalActivation(state.activation),
    canonicalKeyedMap(state.tileObjects),
    canonicalKeyedMap(state.tileAffinities),
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
