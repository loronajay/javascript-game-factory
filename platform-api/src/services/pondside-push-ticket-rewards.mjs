// Pondside Push results: the normalizer and the pure payout formula.
//
//   - cpu:    a match against CPU rivals at a level;
//   - online: a match against other people on factory-network-server — these
//             count toward the public PvP record (db/pet-game-career).
//
// Evidence standing: a plausibility gate, not proof (see barnyard-dash's). A
// match is held to the rounds it claims (a winner has three wins; every round
// is at least a countdown and a splash) and the time-budget fence bounds the rest.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
import { PET_CPU_LEVELS, PONDSIDE_MAX_PETS, PONDSIDE_MIN_ROUND_MS, PONDSIDE_WINS_TO_MATCH } from "./pet-games-prize-catalog.mjs";
const MODES = ["cpu", "online"];
export const PONDSIDE_TICKET_MAX_PER_RESULT = 80;
// Completion is earned slowly so the placing — and the level it was won at — is
// what a payout says, all under the one-ticket-per-7-s ceiling a CPU result needs.
const COMPLETION_MS_PER_TICKET = 20_000;
const MS_PER_TICKET_CEILING = 7_000;
const COMPLETION_CAP = 10;
const CPU_WIN_BONUS = { rookie: 4, pro: 7, champion: 11 };
const ONLINE_PODIUM = [9, 4, 2];
const MAX_ROUNDS = 40;
export function normalizePondsidePushResult(raw) {
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
    const level = mode === "cpu" ? readChoice(source.level, PET_CPU_LEVELS) : null;
    if (mode === "cpu" && !level)
        return refuse("invalid_level");
    const fieldSize = readInt(source.fieldSize, 2, PONDSIDE_MAX_PETS);
    const finalPlace = readInt(source.finalPlace, 1, PONDSIDE_MAX_PETS);
    const roundsWon = readInt(source.roundsWon, 0, PONDSIDE_WINS_TO_MATCH);
    const roundsPlayed = readInt(source.roundsPlayed, 1, MAX_ROUNDS);
    const humans = mode === "online" ? readInt(source.humans, 2, PONDSIDE_MAX_PETS) : 1;
    const durationMs = readDurationMs(source.durationMs);
    if (fieldSize === null || finalPlace === null || roundsWon === null || roundsPlayed === null || humans === null || durationMs === null)
        return refuse("invalid_counts");
    if (finalPlace > fieldSize || humans > fieldSize || roundsWon > roundsPlayed)
        return refuse("invalid_counts");
    // The winner is the pet that reached three; a pet that reached three won.
    if ((finalPlace === 1) !== (roundsWon === PONDSIDE_WINS_TO_MATCH) && mode === "cpu")
        return refuse("invalid_counts");
    if (roundsPlayed < PONDSIDE_WINS_TO_MATCH && mode === "cpu")
        return refuse("invalid_counts");
    if (durationMs < roundsPlayed * PONDSIDE_MIN_ROUND_MS)
        return refuse("implausible_duration");
    return { result: { resultId, mode, level, fieldSize, humans, finalPlace, roundsWon, roundsPlayed, durationMs } };
}
export function calculatePondsidePushTicketReward({ result }) {
    const completion = Math.min(COMPLETION_CAP, Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
    let placing = 0;
    if (result.mode === "cpu") {
        if (result.finalPlace === 1)
            placing = CPU_WIN_BONUS[result.level ?? "rookie"] + (result.fieldSize - 2) * 2;
    }
    else {
        placing = (ONLINE_PODIUM[result.finalPlace - 1] ?? 0) + (result.finalPlace === 1 ? (result.humans - 2) * 2 : 0);
    }
    const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
    const total = Math.max(0, Math.min(PONDSIDE_TICKET_MAX_PER_RESULT, ceiling, completion + placing));
    return { repeatable: { completion, placing, total }, achievements: [], achievementTotal: 0, total };
}
