// Tickets for a finished match: an id is minted when a match starts and spent
// when it ends. The server decides the payout; this is fire-and-forget and
// never blocks the results screen (signed out or offline resolves to null).
// What gets filed at all is decided by the pure builder in ticketResult.js.

import { createGameResultId, createGameResultReporter } from "../../../../js/platform/api/game-results-api.mjs";
import { buildTicketResult, TICKET_GAME_SLUG, TICKET_RESULT_PREFIX } from "./ticketResult.js";

export function createMatchTickets({ reporter = createGameResultReporter() } = {}) {
  let resultId = null;
  return {
    begin() {
      resultId = createGameResultId(TICKET_RESULT_PREFIX);
    },
    finish(summary, { myTeam, iConceded }) {
      const payload = buildTicketResult({ summary, myTeam, iConceded, resultId });
      // One report per match: the id is spent even if the request fails.
      resultId = null;
      if (payload) reporter.report(TICKET_GAME_SLUG, payload);
    },
  };
}
