// Mini-Tactics ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. CPU matches run in the
// browser and online matches are client lockstep over a relay, so the server
// refuses the impossible (a CPU match that is not a duel, teams that are not
// two against two, more squad turns than the time allows) and the
// settlement's time-budget fence (db/game-results) bounds the rest.
//
// Modes the economy does not pay are not modes here: hot seat is
// shared-screen play and the tutorial is practice, so the cabinet never files
// them and the normalizer refuses them. A match decided by a concede (the
// player's own resignation, or an opponent leaving) is never filed either —
// nothing completed. A CPU match with custom squads is not filed, because
// the player picks the CPU's squad too.
import { namesClientAmount, readChoice, readDurationMs, readInt, readResultId, readResultSource, refuse, } from "./game-result-shared.mjs";
const MODES = ["cpu", "online"];
const DIFFICULTIES = ["easy", "normal", "hard"];
const OUTCOMES = ["win", "loss"];
const FORMATS = ["ffa", "teams"];
// Mirrors BOARD_SIZES in games/mini-tactics/src/config.js.
const BOARD_SIZES = [10, 13];
const MAX_TURNS = 1000;
// A squad turn is at least one activation and its animations, or an End Turn
// click; the Instant animation setting makes CPU turns nearly free, so a
// quarter second per turn is a deliberately loose floor.
const MIN_MS_PER_TURN = 250;
export const MINI_TACTICS_TICKET_MAX_PER_RESULT = 150;
// Completion is EARNED BY TIME, one ticket per 10 s up to the cap: a player
// who ends every turn untouched loses to the Hard CPU in about a minute, and
// that must not out-earn playing a match out. The cap is where a normal match
// ends; a bigger board and a bigger online table take longer, so hold more.
const COMPLETION_MS_PER_TICKET = 10_000;
const CPU_COMPLETION_CAP = { 10: 60, 13: 90 };
const ONLINE_COMPLETION_CAP = 120;
// The win bonus is time-gated too, one ticket per 12 s up to the bonus. An
// elimination takes minutes (four squads of 10 HP against 1-4 damage a hit),
// so an honest win of five minutes or more gets all of it; a flat bonus let a
// forged four-second "win" pay 25 tickets, and the time fence alone would not
// stop that.
const WIN_MS_PER_TICKET = 12_000;
const CPU_WIN_BONUS = { easy: 5, normal: 15, hard: 25 };
const ONLINE_WIN_BONUS = 30;
export function normalizeMiniTacticsResult(raw) {
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
    const difficulty = mode === "cpu" ? readChoice(source.difficulty, DIFFICULTIES) : null;
    if (mode === "cpu" && !difficulty)
        return refuse("invalid_difficulty");
    const outcome = readChoice(source.outcome, OUTCOMES);
    if (!outcome)
        return refuse("invalid_outcome");
    const playerCount = readInt(source.playerCount, 2, 4);
    const format = readChoice(source.format, FORMATS);
    if (playerCount === null || !format)
        return refuse("invalid_table");
    // The CPU plays the classic duel; teams is always two against two.
    if (mode === "cpu" && (playerCount !== 2 || format !== "ffa"))
        return refuse("invalid_table");
    if (format === "teams" && playerCount !== 4)
        return refuse("invalid_table");
    const boardSize = readInt(source.boardSize, 10, 13);
    if (boardSize === null || !BOARD_SIZES.includes(boardSize))
        return refuse("invalid_board");
    const turns = readInt(source.turns, 1, MAX_TURNS);
    const durationMs = readDurationMs(source.durationMs);
    if (turns === null || durationMs === null)
        return refuse("invalid_counts");
    if (durationMs < turns * MIN_MS_PER_TURN)
        return refuse("implausible_duration");
    return { result: { resultId, mode, difficulty, outcome, playerCount, format, boardSize, turns, durationMs } };
}
export function calculateMiniTacticsTicketReward({ result }) {
    const cap = result.mode === "cpu" ? CPU_COMPLETION_CAP[result.boardSize] ?? 0 : ONLINE_COMPLETION_CAP;
    const completion = Math.min(cap, Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
    const won = result.outcome === "win";
    const winBonus = !won ? 0 : result.mode === "cpu" ? CPU_WIN_BONUS[result.difficulty ?? "easy"] : ONLINE_WIN_BONUS;
    const win = Math.min(winBonus, Math.floor(result.durationMs / WIN_MS_PER_TICKET));
    const total = Math.min(MINI_TACTICS_TICKET_MAX_PER_RESULT, completion + win);
    return { repeatable: { completion, win, total }, achievements: [], achievementTotal: 0, total };
}
