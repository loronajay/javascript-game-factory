// The Mini-Tactics match result the platform settles tickets from.
// Pure: no DOM, no network, no clock.
//
// This is the cabinet's half of the ticket contract. The cabinet reports the
// facts of a finished match; the server's normalizer checks them and its
// formula decides the payout (platform-api/src/services/mini-tactics-ticket-rewards.mts).
// Nothing here names an amount.
//
// Returns null — and nothing is filed — for everything the economy does not
// pay: hot seat and the tutorial, a match ended by desync or disconnect, a
// match decided by a concede (nothing completed), a seat that conceded and
// watched the rest play out, and a CPU match with custom squads (the player
// picks the CPU's squad too, so it could be handed four medics).

import { VICTORY_REASON } from "../core/events.js";

export const TICKET_GAME_SLUG = "mini-tactics";
export const TICKET_RESULT_PREFIX = "mt";

const MODES = { single: "cpu", online: "online" };
const DIFFICULTIES = ["easy", "normal", "hard"];

// summary: GameController.buildMatchSummary(). myTeam: the team the local
// player sits on. iConceded: this seat resigned at some point in the match.
export function buildTicketResult({ summary, myTeam, iConceded = false, resultId }) {
  const mode = MODES[summary?.mode];
  if (!mode || !resultId || myTeam == null || iConceded) return null;
  if (summary.terminated || summary.winner == null) return null;
  if (summary.victoryReason !== VICTORY_REASON.SQUAD_ELIMINATED) return null;
  if (mode === "cpu" && (summary.compositions || !DIFFICULTIES.includes(summary.difficulty))) return null;
  return {
    resultId,
    mode,
    ...(mode === "cpu" ? { difficulty: summary.difficulty } : {}),
    outcome: summary.winner === myTeam ? "win" : "loss",
    playerCount: summary.playerCount,
    format: summary.format,
    boardSize: summary.size,
    turns: summary.turns,
    durationMs: Math.max(0, Math.floor(Number(summary.durationMs) || 0)),
  };
}
