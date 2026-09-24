// The Creature Battler result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished battle; the server's normalizer checks them and its
// formula decides the payout
// (platform-api/src/services/creature-battler-ticket-rewards.mts). Nothing
// here names an amount.
//
// A battle won because the opponent disconnected is never reported — the
// cabinet shows it as a win, but nothing completed — and a battle that ended
// on a sync failure never reaches the end overlay at all.
//
// An ES module in a classic-script cabinet on purpose: only the platform
// wiring in ../../index.html imports it, and node tests it directly.

export const TICKET_GAME_SLUG = 'creature-battler';
export const TICKET_RESULT_PREFIX = 'cb';

const OUTCOMES = { player: 'win', opponent: 'loss', draw: 'draw' };

/**
 * @param {object} input
 * @param {'player'|'opponent'|'draw'} input.winner  renderBattleEndOverlay's winner
 * @param {string} [input.reason]  'disconnect' when the opponent left
 * @param {boolean} input.isOnline  state.isOnlineMatch
 * @param {number} input.rounds  state.battleState.round
 */
export function buildTicketResult({ winner, reason, isOnline, rounds, resultId, durationMs }) {
  const outcome = OUTCOMES[winner];
  if (!resultId || !outcome || reason === 'disconnect') return null;
  return {
    resultId,
    mode: isOnline ? 'online' : 'training',
    outcome,
    rounds: Math.max(1, Math.floor(Number(rounds) || 1)),
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };
}
