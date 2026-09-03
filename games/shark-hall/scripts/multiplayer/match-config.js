// What a host chooses before the break, and the only thing matchmaking pairs on.
//
// Pure — no socket, no DOM — because both the lobby view and the client have to
// agree about what a configuration IS, and the server sanitizes the same fields
// again on arrival. Nothing here is trusted; this exists so the two halves of
// the browser cannot disagree before the server even sees it.
//
// KEEP IT SMALL ON PURPOSE. The generic lobby compares settings field by field
// when it looks for an opponent, so every value added here splits the pool in
// two. A race length genuinely must match — nobody wants to discover mid-match
// that one of them was playing a single rack — and a table felt would not.

/** Bumped with the wire shape. The server refuses to start a lobby unless both seats agree. */
export const PROTOCOL_VERSION = 1;

export const RACE_LENGTHS = Object.freeze([
  Object.freeze({ raceTo: 1, label: "Single rack", note: "One rack decides it." }),
  Object.freeze({ raceTo: 3, label: "Race to 3", note: "First to three racks. The break alternates." }),
  Object.freeze({ raceTo: 5, label: "Race to 5", note: "A long set. The break alternates." }),
]);

export const DEFAULT_RACE_TO = 3;

export function normalizeMatchConfig(config = {}) {
  const raceTo = Math.floor(Number(config?.raceTo));
  return {
    raceTo: RACE_LENGTHS.some((entry) => entry.raceTo === raceTo) ? raceTo : DEFAULT_RACE_TO,
  };
}

/** The config as the lobby carries it. The protocol version rides along as a setting. */
export function matchConfigSettings(config = {}) {
  return { ...normalizeMatchConfig(config), protocolVersion: PROTOCOL_VERSION };
}

export function describeRace(raceTo) {
  const entry = RACE_LENGTHS.find((item) => item.raceTo === normalizeMatchConfig({ raceTo }).raceTo);
  return entry || RACE_LENGTHS[1];
}
