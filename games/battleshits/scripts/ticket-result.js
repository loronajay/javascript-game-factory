// ticket-result.js — the Battleshits result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished battle; the server's normalizer checks them and its
// formula decides the payout (platform-api/src/services/battleshits-ticket-rewards.mts).
// Nothing here names an amount.
//
// A forfeit win is not reported: the opponent left, nothing completed, and the
// economy pays nothing for it — sending it would only cost a request.

export const TICKET_GAME_SLUG = 'battleshits';
export const TICKET_RESULT_PREFIX = 'bs';

const OUTCOMES = ['win', 'loss'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// stats: { shots, hits, shipsSunk, shipsLost } from match-flow's buildMatchStats.
export function buildTicketResult({ result, isSoloMode, botDifficulty, stats, resultId, durationMs }) {
  if (!OUTCOMES.includes(result) || !resultId || !stats) return null;
  const mode = isSoloMode ? 'cpu' : 'online';
  if (mode === 'cpu' && !DIFFICULTIES.includes(botDifficulty)) return null;
  return {
    resultId,
    mode,
    ...(mode === 'cpu' ? { difficulty: botDifficulty } : {}),
    outcome: result,
    shots: stats.shots,
    hits: stats.hits,
    shipsSunk: stats.shipsSunk,
    shipsLost: stats.shipsLost,
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };
}
