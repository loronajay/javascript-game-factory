// What the results screen says about a rematch, decided from the server's own
// snapshot rather than from what this device last pressed.
//
// The server has no "decline" — a rematch starts when both bowlers have asked
// for one, and the only way an opponent says no is to leave the room. Before
// this, that answer never reached the screen: the client ignored the server's
// `lobby_player_left`, so "Rematch requested. Waiting for your opponent…" hung
// there forever over a lane the other bowler had already walked away from.

export const REMATCH_COPY = Object.freeze({
  opponentLeft: "Your opponent left the lane, so there's no rematch. Change match to find another bowler.",
  opponentWants: "Your opponent wants a rematch! Press Rematch to bowl again.",
  waiting: "Rematch requested. Waiting for your opponent…",
});

/**
 * @param {object} input
 * @param {object|null} input.snapshot  the online client snapshot
 * @param {boolean} input.matchComplete whether the local match is on its results
 * @returns {{ kind: "hidden"|"opponent-left"|"opponent-wants"|"waiting", text: string, rematchEnabled: boolean }}
 */
export function resolveRematchStatus({ snapshot, matchComplete }) {
  if (!matchComplete || !snapshot) return { kind: "hidden", text: "", rematchEnabled: true };

  const clientId = String(snapshot.clientId || "");
  const opponentLeft = Boolean(snapshot.opponentLeftClientId)
    // A lobby refresh that shows the second chair empty says the same thing.
    || (snapshot.lobby && Number(snapshot.lobby.playerCount) < 2);
  if (opponentLeft) return { kind: "opponent-left", text: REMATCH_COPY.opponentLeft, rematchEnabled: false };

  const requested = Array.isArray(snapshot.matchState?.rematchRequestedBy)
    ? snapshot.matchState.rematchRequestedBy.map(String)
    : [];
  const mine = requested.includes(clientId);
  const theirs = requested.some((id) => id && id !== clientId);
  if (theirs && !mine) return { kind: "opponent-wants", text: REMATCH_COPY.opponentWants, rematchEnabled: true };
  if (mine) return { kind: "waiting", text: REMATCH_COPY.waiting, rematchEnabled: false };
  return { kind: "hidden", text: "", rematchEnabled: true };
}
