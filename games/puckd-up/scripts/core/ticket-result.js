// The Puck'd Up result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished match; the server's normalizer checks them and its
// formula decides the payout
// (platform-api/src/services/puckd-up-ticket-rewards.mts). Nothing here names
// an amount.
//
// An online match the other seat forfeited is never reported: the server
// awards it to whoever stayed, but nothing completed.

export const TICKET_GAME_SLUG = 'puckd-up';
export const TICKET_RESULT_PREFIX = 'puckdup';

// The cabinet's match modes, as the platform names them.
const MODES = { cpu: 'cpu', campaign: 'circuit', online: 'online' };

/**
 * @param {object} input
 * @param {'cpu'|'campaign'|'online'} input.mode  match.state.mode
 * @param {string} [input.rivalId]  the CPU rival (not online)
 * @param {boolean} input.won
 * @param {number} input.myGoals
 * @param {number} input.opponentGoals
 * @param {string} [input.reason]  online: 'forfeit' when a seat left
 */
export function buildTicketResult({ mode, rivalId, won, myGoals, opponentGoals, reason = '', resultId, durationMs }) {
    const platformMode = MODES[mode];
    if (!resultId || !platformMode) return null;
    if (platformMode === 'online' && reason === 'forfeit') return null;
    if (platformMode !== 'online' && !rivalId) return null;
    return {
        resultId,
        mode: platformMode,
        ...(platformMode === 'online' ? {} : { rivalId }),
        outcome: won ? 'win' : 'loss',
        myGoals,
        opponentGoals,
        durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
    };
}

/**
 * The cabinet event that ends a match, read into builder input — or null for
 * any other event. A local match ends on `match-end`; an online one on the
 * screen turning to `result`, since the server decided it.
 */
export function finishedMatchFacts(event, state) {
    if (event.type === 'match-end' && event.mode !== 'online') {
        return { mode: event.mode, rivalId: event.rivalId, won: event.winner === 'player', myGoals: state.playerScore, opponentGoals: state.cpuScore };
    }
    if (event.type === 'screen' && event.screen === 'result' && state.mode === 'online') {
        return { mode: 'online', won: state.winner === 0, myGoals: state.playerScore, opponentGoals: state.cpuScore, reason: state.reason };
    }
    return null;
}
