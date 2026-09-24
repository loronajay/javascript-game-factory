// The Bird Duty result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished run or match; the server's normalizer checks them and
// its formula decides the payout
// (platform-api/src/services/bird-duty-ticket-rewards.mts). Nothing here
// names an amount.
//
// Hot seat is never reported: shared-screen play earns no repeatable tickets.
// Deliberately outside `scripts/sim/` — this is the client's reading of a
// match, not a rule, and it must not ride the mirror to the server.

export const TICKET_GAME_SLUG = "bird-duty";
export const TICKET_RESULT_PREFIX = "bd";

function wholeMs(durationMs) {
  return Math.max(0, Math.floor(Number(durationMs) || 0));
}

// playSession: the solo run at game-over (sim/play-session.js).
export function buildSoloTicketResult({ playSession, resultId, durationMs }) {
  if (!resultId || playSession?.phase !== "game-over") return null;
  const score = Math.max(0, Math.floor(Number(playSession.finalScore ?? playSession.score) || 0));
  return { resultId, mode: "solo", score, durationMs: wholeMs(durationMs) };
}

// match: the server's final snapshot of the match (`snapshot.match`).
// clientId: this client's id on the lobby socket.
export function buildOnlineTicketResult({ match, clientId, resultId, durationMs }) {
  const scores = match?.scores;
  if (!resultId || !clientId || !scores || !Object.prototype.hasOwnProperty.call(scores, clientId)) return null;
  const entries = Object.entries(scores);
  if (entries.length < 2) return null;
  const myScore = Number(scores[clientId]) || 0;
  const bestOpponentScore = Math.max(...entries.filter(([id]) => id !== clientId).map(([, score]) => Number(score) || 0));
  return {
    resultId,
    mode: "online",
    playerCount: entries.length,
    outcome: myScore > bestOpponentScore ? "win" : myScore < bestOpponentScore ? "loss" : "tie",
    myScore,
    bestOpponentScore,
    durationMs: wholeMs(durationMs),
  };
}
