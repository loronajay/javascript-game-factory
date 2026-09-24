// The Shark Hall result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a decided match; the server's normalizer checks them and its
// formula decides the payout
// (platform-api/src/services/shark-hall-ticket-rewards.mts). Nothing here
// names an amount.
//
// Hotseat is shared-screen and earns no repeatable tickets, so it is never
// reported. Online, the server decides a match for whoever is left when the
// other seat walks — and the cabinet hears that as an ordinary win — so a
// table with a disconnected seat is never reported either: nothing completed.

export const TICKET_GAME_SLUG = "shark-hall";
export const TICKET_RESULT_PREFIX = "shark";

const DIFFICULTIES = ["casual", "club", "sharp"];

/**
 * @param {object} input
 * @param {object} input.snapshot   the live match's snapshot() at the win
 * @param {number} input.winnerSeat the `win` event's seat
 * @param {number} input.strokes    strokes played this match, both seats
 */
export function buildTicketResult({ snapshot, winnerSeat, resultId, durationMs, strokes }) {
  if (!resultId || !snapshot || (winnerSeat !== 0 && winnerSeat !== 1)) return null;
  const base = {
    resultId,
    strokes: Math.max(0, Math.floor(Number(strokes) || 0)),
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };

  if (snapshot.mode === "cpu") {
    // The player is always seat 0 against the CPU, and a CPU match is one rack.
    if (!DIFFICULTIES.includes(snapshot.difficulty)) return null;
    const won = winnerSeat === 0;
    return {
      ...base,
      mode: "cpu",
      difficulty: snapshot.difficulty,
      raceTo: 1,
      outcome: won ? "win" : "loss",
      myRacks: won ? 1 : 0,
      opponentRacks: won ? 0 : 1,
    };
  }

  if (snapshot.mode === "online") {
    const mine = snapshot.mySeat;
    const seats = snapshot.seats || [];
    if ((mine !== 0 && mine !== 1) || seats.length !== 2) return null;
    if (seats.some((seat) => seat.connected === false)) return null;
    return {
      ...base,
      mode: "online",
      raceTo: snapshot.raceTo,
      outcome: winnerSeat === mine ? "win" : "loss",
      myRacks: seats[mine].wins,
      opponentRacks: seats[1 - mine].wins,
    };
  }

  return null;
}
