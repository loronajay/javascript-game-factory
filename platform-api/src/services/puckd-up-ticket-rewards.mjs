// Puck'd Up ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. A CPU or Arcade Circuit
// match is played in the browser, and although online is server-authoritative
// the network server does not attest the result to the platform yet, so this
// is still the client's claim. The server refuses the impossible (a winner
// short of the target, goals faster than a faceoff allows) and the
// settlement's time-budget fence bounds the rest.
//
// An online match the other seat forfeited is never filed: nothing completed.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
const MODES = ["cpu", "circuit", "online"];
const OUTCOMES = ["win", "loss"];
// Mirrors RIVALS in games/puckd-up/scripts/physics/rivals.js, weakest first —
// the order the Arcade Circuit climbs. A test compares the two, so a new
// rival fails CI until it is priced here.
export const PUCKD_UP_RIVAL_IDS = Object.freeze([
    "rookie", "banks", "brick", "viper", "gambler", "cannon",
    "mirror", "switch", "anchor", "ghost", "orbit", "ace",
]);
// DEFAULT_SETTINGS.targetScore in scripts/config.js; online plays to the same.
export const PUCKD_UP_TARGET_SCORE = 7;
// A goal is at least its faceoff (0.65 s), the puck crossing the table and the
// goal hold (1.05 s). Two seconds is a deliberately loose floor.
const MIN_MS_PER_GOAL = 2000;
export const PUCKD_UP_TICKET_MAX_PER_RESULT = 35;
// Completion is EARNED BY TIME, one ticket per 10 s: standing still against a
// strong rival loses 7–0 in well under a minute. A CPU win pays by rival, the
// rookie 4 up to the Ace 15, and the whole payout is held to one ticket per
// 7 s so a forged win has to cost real time under the fence.
const COMPLETION_MS_PER_TICKET = 10_000;
const COMPLETION_CAP = 20;
const RIVAL_WIN_BASE = 4;
const ONLINE_WIN_BONUS = 12;
const MS_PER_TICKET_CEILING = 7_000;
export function normalizePuckdUpResult(raw) {
    const source = readResultSource(raw);
    if (!source)
        return refuse("invalid_result");
    if (namesClientAmount(source))
        return refuse("client_amount_refused");
    const resultId = readResultId(source.resultId);
    if (!resultId)
        return refuse("invalid_result_id");
    const mode = readChoice(source.mode, MODES);
    if (!mode)
        return refuse("invalid_mode");
    let rivalId = null;
    if (mode !== "online") {
        rivalId = readChoice(source.rivalId, PUCKD_UP_RIVAL_IDS);
        if (!rivalId)
            return refuse("invalid_rival");
    }
    const outcome = readChoice(source.outcome, OUTCOMES);
    if (!outcome)
        return refuse("invalid_outcome");
    const target = PUCKD_UP_TARGET_SCORE;
    const myGoals = readInt(source.myGoals, 0, target);
    const opponentGoals = readInt(source.opponentGoals, 0, target);
    const durationMs = readDurationMs(source.durationMs);
    if (myGoals === null || opponentGoals === null || durationMs === null)
        return refuse("invalid_counts");
    if (outcome === "win" ? myGoals !== target || opponentGoals >= target : opponentGoals !== target || myGoals >= target) {
        return refuse("invalid_counts");
    }
    if (durationMs < (myGoals + opponentGoals) * MIN_MS_PER_GOAL)
        return refuse("implausible_duration");
    return { result: { resultId, mode, rivalId, outcome, myGoals, opponentGoals, durationMs } };
}
export function calculatePuckdUpTicketReward({ result }) {
    const completion = Math.min(COMPLETION_CAP, Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
    let win = 0;
    if (result.outcome === "win") {
        win = result.mode === "online"
            ? ONLINE_WIN_BONUS
            : RIVAL_WIN_BASE + Math.max(0, PUCKD_UP_RIVAL_IDS.indexOf(result.rivalId ?? ""));
    }
    const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
    const total = Math.min(PUCKD_UP_TICKET_MAX_PER_RESULT, ceiling, completion + win);
    return { repeatable: { completion, win, total }, achievements: [], achievementTotal: 0, total };
}
