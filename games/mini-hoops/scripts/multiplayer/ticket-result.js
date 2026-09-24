// The Mini Hoops result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished timed round; the server's normalizer checks them and its
// formula decides the payout
// (platform-api/src/services/mini-hoops-ticket-rewards.mts). Nothing here
// names an amount.
//
// Only the timed round is reported: a solo run, or an online duel that played
// to the buzzer. Hotseat is shared-screen and earns no repeatable tickets, a
// forfeited duel completed nothing, and HORSE, floor tic-tac-toe, the Trick
// Shot Lab and the How-to-Play court never reach this builder at all.

export const TICKET_GAME_SLUG = "mini-hoops";
export const TICKET_RESULT_PREFIX = "hoops";

const OUTCOMES = ["win", "loss", "draw"];

/**
 * @param {object} input
 * @param {"solo"|"online"|"hotseat"} input.playMode
 * @param {{ modeId: string, duration: number, shots: number, made: number }} input.summary  runSummary(run)
 * @param {"win"|"loss"|"draw"} [input.outcome]  online only
 * @param {boolean} [input.forfeit]  online only: the duel ended because a seat left
 */
export function buildTicketResult({ playMode, summary, outcome, forfeit = false, resultId, durationMs }) {
  if (!resultId || !summary) return null;
  const base = {
    resultId,
    hoopMode: summary.modeId,
    roundSeconds: summary.duration,
    shots: summary.shots,
    made: summary.made,
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };
  if (playMode === "solo") return { ...base, mode: "solo" };
  if (playMode === "online" && !forfeit && OUTCOMES.includes(outcome)) return { ...base, mode: "online", outcome };
  return null;
}
