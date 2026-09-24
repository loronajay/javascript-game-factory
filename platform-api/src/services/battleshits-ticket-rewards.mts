// Battleshits ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof — the same standing as
// Lovers Lost. Solo battles run entirely in the browser and online matches
// are peer-relayed, so the server can refuse the impossible (a win without
// all 17 fleet cells hit, more shots than cells, a match faster than its own
// shot animations) but cannot prove a battle happened. The settlement's
// time-budget fence (db/game-results) bounds what a forger can mint to what
// real elapsed time allows.
//
// Local play has no mode here: the cabinet has no shared-screen mode, and
// a mode the normalizer does not know is refused.

import type { TicketRewardBreakdown } from "./ticket-reward-catalog.mjs";
import {
  type NormalizedResult,
  namesClientAmount,
  readChoice,
  readDurationMs,
  readInt,
  readResultId,
  readResultSource,
  refuse,
} from "./game-result-shared.mjs";

const BOARD_CELLS = 100;
// Fleet lengths, smallest first. Mirrors FLEET_DEFS in games/battleshits/scripts/board.js.
const FLEET_LENGTHS = [2, 3, 3, 4, 5];
const FLEET_CELLS = FLEET_LENGTHS.reduce((sum, length) => sum + length, 0);
// Each of the player's shots plays a 1.2 s animation before the turn moves
// on; one second per shot is a deliberately loose floor.
const MIN_MS_PER_SHOT = 1000;

const MODES = ["cpu", "online"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const OUTCOMES = ["win", "loss", "forfeit_win"] as const;

export interface BattleshitsResult {
  resultId: string;
  mode: (typeof MODES)[number];
  difficulty: (typeof DIFFICULTIES)[number] | null;
  outcome: (typeof OUTCOMES)[number];
  shots: number;
  hits: number;
  shipsSunk: number;
  shipsLost: number;
  durationMs: number;
}

export const BATTLESHITS_TICKET_MAX_PER_RESULT = 50;

// Completion is EARNED BY TIME, one ticket per 9 s up to the cap, so a battle
// thrown to the Hard bot in two minutes cannot out-earn playing one out.
const COMPLETION_MS_PER_TICKET = 9_000;
const COMPLETION = { cpu: 20, online: 25 } as const;
const CPU_WIN_BONUS = { easy: 5, medium: 15, hard: 25 } as const;
const ONLINE_WIN_BONUS = 20;
const ACCURACY_BONUS = 5;
const ACCURACY_LINE = 0.5;

function minCellsForSunk(count: number): number {
  return FLEET_LENGTHS.slice(0, count).reduce((sum, length) => sum + length, 0);
}

export function normalizeBattleshitsResult(raw: unknown): NormalizedResult<BattleshitsResult> {
  const source = readResultSource(raw);
  if (!source) return refuse("invalid_result");
  if (namesClientAmount(source)) return refuse("client_amount_refused");

  const resultId = readResultId(source.resultId);
  if (!resultId) return refuse("invalid_result_id");
  const mode = readChoice(source.mode, MODES);
  if (!mode) return refuse("invalid_mode");
  const difficulty = mode === "cpu" ? readChoice(source.difficulty, DIFFICULTIES) : null;
  if (mode === "cpu" && !difficulty) return refuse("invalid_difficulty");
  const outcome = readChoice(source.outcome, OUTCOMES);
  if (!outcome || (outcome === "forfeit_win" && mode !== "online")) return refuse("invalid_outcome");

  const shots = readInt(source.shots, 0, BOARD_CELLS);
  const hits = readInt(source.hits, 0, FLEET_CELLS);
  const shipsSunk = readInt(source.shipsSunk, 0, FLEET_LENGTHS.length);
  const shipsLost = readInt(source.shipsLost, 0, FLEET_LENGTHS.length);
  const durationMs = readDurationMs(source.durationMs);
  if (shots === null || hits === null || shipsSunk === null || shipsLost === null || durationMs === null) {
    return refuse("invalid_counts");
  }
  if (hits > shots) return refuse("invalid_counts");
  // All 17 cells hit is exactly the whole fleet sunk, and a sunk ship needs
  // its cells hit.
  if ((hits === FLEET_CELLS) !== (shipsSunk === FLEET_LENGTHS.length)) return refuse("invalid_counts");
  if (hits < minCellsForSunk(shipsSunk)) return refuse("invalid_counts");

  const allSunk = shipsSunk === FLEET_LENGTHS.length;
  const allLost = shipsLost === FLEET_LENGTHS.length;
  if (allSunk && allLost) return refuse("invalid_outcome");
  if (outcome === "win" && !allSunk) return refuse("invalid_outcome");
  if (outcome === "loss" && !allLost) return refuse("invalid_outcome");
  if (outcome === "forfeit_win" && (allSunk || allLost)) return refuse("invalid_outcome");

  if (durationMs < shots * MIN_MS_PER_SHOT) return refuse("implausible_duration");

  return { result: { resultId, mode, difficulty, outcome, shots, hits, shipsSunk, shipsLost, durationMs } };
}

export function calculateBattleshitsTicketReward({ result }: { result: BattleshitsResult }): TicketRewardBreakdown {
  // A forfeit win is an opponent leaving: no completed match and no server
  // evidence of one, so it pays nothing (the economy's early-quit rule).
  if (result.outcome === "forfeit_win") {
    return { repeatable: { completion: 0, win: 0, accuracy: 0, total: 0 }, achievements: [], achievementTotal: 0, total: 0 };
  }
  const won = result.outcome === "win";
  const completion = Math.min(COMPLETION[result.mode], Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
  const win = !won ? 0 : result.mode === "cpu" ? CPU_WIN_BONUS[result.difficulty ?? "easy"] : ONLINE_WIN_BONUS;
  const accuracy = won && result.shots > 0 && result.hits / result.shots >= ACCURACY_LINE ? ACCURACY_BONUS : 0;
  const total = Math.min(BATTLESHITS_TICKET_MAX_PER_RESULT, completion + win + accuracy);
  return { repeatable: { completion, win, accuracy, total }, achievements: [], achievementTotal: 0, total };
}
