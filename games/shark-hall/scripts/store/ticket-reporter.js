// Tickets for a decided match: an id is minted when a rack starts and spent
// when the match is decided, so a retried submission replays the server's
// verdict instead of paying twice. The server decides the payout; this is
// fire-and-forget and never blocks the cabinet (signed out or offline both
// resolve to nothing).
//
// What gets filed at all is decided by the pure builder in
// match/ticket-result.js. This file only carries the id, the clock and the
// stroke count between the two moments.

import { createGameResultId, createGameResultReporter } from "../../../../js/platform/api/game-results-api.mjs";
import { TICKET_GAME_SLUG, TICKET_RESULT_PREFIX } from "../match/ticket-result.js";

export function createTicketReporter({
  reporter = createGameResultReporter(),
  mintId = createGameResultId,
  now = () => performance.now(),
} = {}) {
  let run = null;

  return {
    /** Start a new match's ticket. A match already under way is abandoned unfiled. */
    begin() {
      run = { resultId: mintId(TICKET_RESULT_PREFIX), startedAt: now(), strokes: 0 };
    },
    get active() {
      return run !== null;
    },
    stroke() {
      if (run) run.strokes += 1;
    },
    /** Spend the id: `build({ resultId, durationMs, strokes })` returns the payload or null. */
    finish(build) {
      const spent = run;
      run = null;
      if (!spent) return;
      const payload = build({ resultId: spent.resultId, durationMs: now() - spent.startedAt, strokes: spent.strokes });
      if (payload) void reporter.report(TICKET_GAME_SLUG, payload);
    },
  };
}
