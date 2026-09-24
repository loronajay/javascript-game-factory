// Mini Hoops ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. A solo run is played in
// the browser, and although the online duel is server-authoritative the
// server does not attest the result to the platform yet, so this is still the
// client's claim. The server refuses the impossible (more baskets than shots,
// more shots than the clock can hold, a round shorter than its own clock) and
// the settlement's time-budget fence (db/game-results) bounds the rest.
//
// Only the timed round is paid. Hotseat is shared-screen and never filed, and
// HORSE, floor tic-tac-toe, the Trick Shot Lab and the How-to-Play court are
// not modes here. An online duel that ended in a forfeit is never filed.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
const MODES = ["solo", "online"];
const ONLINE_OUTCOMES = ["win", "loss", "draw"];
// Mirrors HOOP_MODES in games/mini-hoops/scripts/sim/hoop.js and
// ROUND_DURATIONS in its sim/constants.js; a test compares them.
export const MINI_HOOPS_HOOP_MODES = Object.freeze([
    "still", "horizontal", "vertical", "circle", "pendulum", "figure8", "cross", "wander",
]);
export const MINI_HOOPS_ROUND_SECONDS = Object.freeze([30, 60]);
// One ball is in play at a time and a shot takes at least SHOT_SETTLE_SECONDS
// (0.48 s) to resolve, so two a second plus the buzzer beater is a loose ceiling.
const MAX_SHOTS_PER_SECOND = 2;
export const MINI_HOOPS_TICKET_MAX_PER_RESULT = 16;
// The round length IS the time played, so completion is simply one ticket per
// 15 s of clock. Baskets pay one per three made. The two together are capped
// at one ticket per 5 s of the claimed duration, which is what bounds a forged
// perfect round: the time-budget fence makes that duration cost wall clock.
const COMPLETION_SECONDS_PER_TICKET = 15;
const MADE_PER_TICKET = 3;
const MS_PER_TICKET_CEILING = 5_000;
// Online: beating a person is the skill bonus, paid on top of the ceiling.
const ONLINE_WIN_BONUS = { 30: 2, 60: 4 };
export function normalizeMiniHoopsResult(raw) {
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
    const hoopMode = readChoice(source.hoopMode, MINI_HOOPS_HOOP_MODES);
    if (!hoopMode)
        return refuse("invalid_hoop_mode");
    const roundSeconds = readInt(source.roundSeconds, 1, 600);
    if (roundSeconds === null || !MINI_HOOPS_ROUND_SECONDS.includes(roundSeconds))
        return refuse("invalid_round");
    let outcome = null;
    if (mode === "online") {
        outcome = readChoice(source.outcome, ONLINE_OUTCOMES);
        if (!outcome)
            return refuse("invalid_outcome");
    }
    else if (source.outcome !== undefined) {
        return refuse("invalid_outcome");
    }
    const shots = readInt(source.shots, 0, roundSeconds * MAX_SHOTS_PER_SECOND + 1);
    const made = readInt(source.made, 0, roundSeconds * MAX_SHOTS_PER_SECOND + 1);
    const durationMs = readDurationMs(source.durationMs);
    if (shots === null || made === null || durationMs === null || made > shots)
        return refuse("invalid_counts");
    // The clock only runs forward and the buzzer ends the round, so a result
    // shorter than its own round is not one.
    if (durationMs < roundSeconds * 1000)
        return refuse("implausible_duration");
    return { result: { resultId, mode, hoopMode, roundSeconds, shots, made, outcome, durationMs } };
}
export function calculateMiniHoopsTicketReward({ result }) {
    const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
    const completion = Math.min(ceiling, Math.floor(result.roundSeconds / COMPLETION_SECONDS_PER_TICKET));
    const baskets = Math.min(ceiling - completion, Math.floor(result.made / MADE_PER_TICKET));
    const win = result.outcome === "win" ? ONLINE_WIN_BONUS[result.roundSeconds] ?? 0 : 0;
    const total = Math.min(MINI_HOOPS_TICKET_MAX_PER_RESULT, completion + baskets + win);
    return { repeatable: { completion, baskets, win, total }, achievements: [], achievementTotal: 0, total };
}
