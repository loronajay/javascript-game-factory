// Tickets for a finished match: an id is minted when a match starts and spent
// when it ends, so a retried submission replays the server's verdict instead
// of paying twice. The server decides the payout; this is fire-and-forget and
// never blocks the cabinet (signed out, offline, or served standalone without
// the factory all resolve to nothing).
//
// The platform client is imported lazily, as game.js does for account access,
// so standalone CPU play survives missing shared-platform modules. What gets
// filed at all is decided by the pure builder in core/ticket-result.js.

import { TICKET_GAME_SLUG, TICKET_RESULT_PREFIX, buildTicketResult, finishedMatchFacts } from '../core/ticket-result.js';

export function createTicketReporter({
    load = () => import('../../../../js/platform/api/game-results-api.mjs'),
    now = () => performance.now(),
} = {}) {
    let platform = null;
    let reporter = null;
    let run = null;

    function loadPlatform() {
        platform ??= load()
            .then(module => {
                reporter = module.createGameResultReporter();
                return module;
            })
            .catch(() => null);
        return platform;
    }

    function begin() {
        const current = { resultId: null, startedAt: now() };
        run = current;
        loadPlatform().then(module => {
            // A later match replaced this one before the module arrived.
            if (module && run === current) current.resultId = module.createGameResultId(TICKET_RESULT_PREFIX);
        });
    }

    function finish(facts) {
        const spent = run;
        run = null;
        if (!spent?.resultId) return;
        const payload = buildTicketResult({ ...facts, resultId: spent.resultId, durationMs: now() - spent.startedAt });
        if (payload && reporter) void reporter.report(TICKET_GAME_SLUG, payload);
    }

    /** A cabinet event handler: begins on `match-start`, files on the match's end. */
    function handle(event, state) {
        if (event.type === 'match-start') return begin();
        const facts = finishedMatchFacts(event, state);
        if (facts) finish(facts);
    }

    return { begin, finish, handle };
}
