// The Illuminauts result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished run or race; the server's normalizer checks them and its
// formula decides the payout
// (platform-api/src/services/illuminauts-ticket-rewards.mts). Nothing here
// names an amount.
//
// Only a run that reached the Beacon Core is reported: a solo Sprint/Sweep
// clear, or an online race either runner finished. Editor playtests are
// neither solo nor online and are never reported, and a race the partner
// left never reaches the win screen.

import { MAPS } from './maps.js';

export const TICKET_GAME_SLUG = 'illuminauts';
export const TICKET_RESULT_PREFIX = 'illum';

const SOLO_MODES = ['sprint', 'sweep'];
const CATALOG_IDS = new Set(MAPS.map((map) => map.id));

// state: the game state at the win. localWon: this runner reached the core.
export function buildTicketResult({ state, localWon, resultId, durationMs }) {
  if (!resultId || !CATALOG_IDS.has(state?.mapId)) return null;
  const ms = Math.max(0, Math.floor(Number(durationMs) || 0));
  if (state.solo?.enabled) {
    if (!localWon || !SOLO_MODES.includes(state.solo.mode)) return null;
    return { resultId, mode: state.solo.mode, mapId: state.mapId, durationMs: ms };
  }
  if (state.online?.enabled) {
    return { resultId, mode: 'online', mapId: state.mapId, outcome: localWon ? 'win' : 'loss', durationMs: ms };
  }
  return null;
}
