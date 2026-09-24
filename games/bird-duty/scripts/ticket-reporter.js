// Tickets for a finished run or match: an id is minted when play starts and
// spent when it ends. The server decides the payout; this is fire-and-forget
// and never blocks the cabinet (signed out, offline, or served standalone
// without the factory all resolve to nothing).
//
// The platform client is imported lazily, as identity.js does, so the cabinet
// still boots when it is served on its own. What gets filed at all is decided
// by the pure builders in ticket-result.js.

import { TICKET_GAME_SLUG, TICKET_RESULT_PREFIX } from "./ticket-result.js";

export function createTicketReporter({
  load = () => import("../../../js/platform/api/game-results-api.mjs"),
  now = () => performance.now(),
} = {}) {
  let platform = null;
  let reporter = null;
  let resultId = null;
  let startedAt = 0;

  function loadPlatform() {
    platform ??= load()
      .then((module) => {
        reporter = module.createGameResultReporter();
        return module;
      })
      .catch(() => null);
    return platform;
  }

  return {
    begin() {
      const run = {};
      resultId = run;
      startedAt = now();
      loadPlatform().then((module) => {
        // A later begin() replaced this run before the module arrived.
        if (module && resultId === run) resultId = module.createGameResultId(TICKET_RESULT_PREFIX);
      });
    },
    /** Spend the id: `build(resultId, durationMs)` returns the payload or null. */
    finish(build) {
      const id = typeof resultId === "string" ? resultId : null;
      const durationMs = now() - startedAt;
      resultId = null;
      const payload = id ? build(id, durationMs) : null;
      if (payload && reporter) reporter.report(TICKET_GAME_SLUG, payload);
    },
  };
}
