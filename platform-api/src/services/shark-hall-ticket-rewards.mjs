// Shark Hall ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. A CPU rack is played in
// the browser, and although online is server-authoritative the network server
// does not attest the result to the platform yet, so this is still the
// client's claim. The server refuses the impossible (a winner short of the
// race, a rack won in fewer strokes than the rules allow, strokes faster than
// balls can settle) and the settlement's time-budget fence bounds the rest.
//
// Hotseat is shared-screen and never filed. An online match the other seat
// walked out of never reaches the result and is never filed either.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
const MODES = ["cpu", "online"];
// Mirrors DIFFICULTIES in games/shark-hall/scripts/sim/cpu.js and
// RACE_LENGTHS in scripts/multiplayer/match-config.js; a test compares them.
export const SHARK_HALL_DIFFICULTIES = Object.freeze(["casual", "club", "sharp"]);
export const SHARK_HALL_RACE_LENGTHS = Object.freeze([1, 3, 5]);
const OUTCOMES = ["win", "loss"];
// A rack cannot be won on the break (the 8 on the break reracks), so every
// rack decided takes at least two strokes.
const MIN_STROKES_PER_RACK = 2;
const MAX_STROKES = 600;
// A stroke is at least the balls rolling to a stop. One second is loose.
const MIN_MS_PER_STROKE = 1000;
export const SHARK_HALL_TICKET_MAX_PER_RESULT = 165;
// Completion is EARNED BY TIME, one ticket per 10 s, capped per race length
// (an 8-ball rack is thrown in seconds by shooting the 8 early). The online
// caps are sized to a race's real length: a race to 3 runs ~12–15 minutes.
const COMPLETION_MS_PER_TICKET = 10_000;
const CPU_COMPLETION_CAP = 25;
const ONLINE_COMPLETION_CAP = { 1: 25, 3: 75, 5: 125 };
const CPU_WIN_BONUS = { casual: 5, club: 10, sharp: 15 };
const ONLINE_WIN_BONUS = { 1: 10, 3: 25, 5: 40 };
// The whole payout is also held to one ticket per 7 s of the claimed
// duration: a forged win has to cost real time under the fence. (Online is
// not attested by the network server yet, so it is held to the same line.)
const MS_PER_TICKET_CEILING = 7_000;
export function normalizeSharkHallResult(raw) {
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
    const difficulty = mode === "cpu" ? readChoice(source.difficulty, SHARK_HALL_DIFFICULTIES) : null;
    if (mode === "cpu" && !difficulty)
        return refuse("invalid_difficulty");
    const outcome = readChoice(source.outcome, OUTCOMES);
    if (!outcome)
        return refuse("invalid_outcome");
    const raceTo = readInt(source.raceTo, 1, 5);
    if (raceTo === null || !SHARK_HALL_RACE_LENGTHS.includes(raceTo))
        return refuse("invalid_race");
    // The CPU plays a single rack.
    if (mode === "cpu" && raceTo !== 1)
        return refuse("invalid_race");
    const myRacks = readInt(source.myRacks, 0, raceTo);
    const opponentRacks = readInt(source.opponentRacks, 0, raceTo);
    const strokes = readInt(source.strokes, 1, MAX_STROKES);
    const durationMs = readDurationMs(source.durationMs);
    if (myRacks === null || opponentRacks === null || strokes === null || durationMs === null)
        return refuse("invalid_counts");
    if (myRacks === raceTo && opponentRacks === raceTo)
        return refuse("invalid_counts");
    if (outcome === "win" && myRacks !== raceTo)
        return refuse("invalid_counts");
    if (outcome === "loss" && opponentRacks !== raceTo)
        return refuse("invalid_counts");
    if (strokes < (myRacks + opponentRacks) * MIN_STROKES_PER_RACK)
        return refuse("invalid_counts");
    if (durationMs < strokes * MIN_MS_PER_STROKE)
        return refuse("implausible_duration");
    return { result: { resultId, mode, difficulty, raceTo, outcome, myRacks, opponentRacks, strokes, durationMs } };
}
export function calculateSharkHallTicketReward({ result }) {
    const won = result.outcome === "win";
    const earnedByTime = Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET);
    let completion;
    let win = 0;
    if (result.mode === "cpu") {
        completion = Math.min(CPU_COMPLETION_CAP, earnedByTime);
        if (won)
            win = CPU_WIN_BONUS[result.difficulty ?? "casual"];
    }
    else {
        completion = Math.min(ONLINE_COMPLETION_CAP[result.raceTo] ?? 0, earnedByTime);
        if (won)
            win = ONLINE_WIN_BONUS[result.raceTo] ?? 0;
    }
    const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
    const total = Math.min(SHARK_HALL_TICKET_MAX_PER_RESULT, ceiling, completion + win);
    return { repeatable: { completion, win, total }, achievements: [], achievementTotal: 0, total };
}
