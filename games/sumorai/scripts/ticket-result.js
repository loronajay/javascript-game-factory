// The Sumorai match result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished match; the server's normalizer checks them and its
// formula decides the payout (platform-api/src/services/sumorai-ticket-rewards.mts).
// Nothing here names an amount.
//
// Local 2P is never reported: shared-screen play earns no repeatable tickets.
// An online forfeit never reaches match_end, so it is never reported either.

export const TICKET_GAME_SLUG = 'sumorai';
export const TICKET_RESULT_PREFIX = 'sumorai';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function ticketSideFor({ isOnline, botConfig, onlineSide }) {
  if (isOnline) return onlineSide === 'p2' ? 'p2' : 'p1';
  if (botConfig?.enabled) return botConfig.side === 'p1' ? 'p2' : 'p1';
  return null;
}

export function buildTicketResult({ isOnline, botConfig, onlineSide, onlineIsRanked, gameState, winner, resultId, durationMs }) {
  const mySide = ticketSideFor({ isOnline, botConfig, onlineSide });
  if (!mySide || !resultId || (winner !== 'p1' && winner !== 'p2')) return null;
  const mode = isOnline ? 'online' : 'cpu';
  if (mode === 'cpu' && !DIFFICULTIES.includes(botConfig.difficulty)) return null;
  const opponentSide = mySide === 'p1' ? 'p2' : 'p1';
  return {
    resultId,
    mode,
    ...(mode === 'cpu' ? { difficulty: botConfig.difficulty } : { ranked: onlineIsRanked === true }),
    outcome: winner === mySide ? 'win' : 'loss',
    roundTarget: gameState.roundTarget,
    myWins: gameState[mySide].wins,
    opponentWins: gameState[opponentSide].wins,
    rounds: gameState.roundNum,
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };
}
