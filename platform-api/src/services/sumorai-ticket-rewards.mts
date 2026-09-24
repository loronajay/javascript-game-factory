// Sumorai ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. CPU matches run in the
// browser and online matches are peer-to-peer rollback, so the server refuses
// the impossible (a winner short of the target, both sides at it, more rounds
// than a match can hold, a match faster than its own round banners) and the
// settlement's time-budget fence (db/game-results) bounds the rest.
//
// Local 2P has no mode here — shared-screen play earns no repeatable tickets,
// so the cabinet never files it and the normalizer refuses it. An online
// forfeit is never filed either: the partner left, nothing completed.

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

const MODES = ["cpu", "online"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const OUTCOMES = ["win", "loss"] as const;
// CPU matches are best of three (target 2) or five (target 3); online is
// always best of five. Mirrors setup-events.js / online-match-start.js.
const CPU_TARGETS = [2, 3];
const ONLINE_TARGET = 3;
// Draws replay the round, so rounds can exceed wins — but not without limit.
const MAX_ROUNDS = 30;
// A round is at least its READY/FIGHT banners (150 ticks) plus the round-end
// hold (180 ticks) at 60 hz, 5.5 s; five seconds is a deliberately loose floor.
const MIN_MS_PER_ROUND = 5000;

export interface SumoraiResult {
  resultId: string;
  mode: (typeof MODES)[number];
  difficulty: (typeof DIFFICULTIES)[number] | null;
  ranked: boolean;
  outcome: (typeof OUTCOMES)[number];
  roundTarget: number;
  myWins: number;
  opponentWins: number;
  rounds: number;
  durationMs: number;
}

export const SUMORAI_TICKET_MAX_PER_RESULT = 25;

// Completion is EARNED BY TIME, one ticket per 15 s up to the cap: a player
// who stands still loses a best of three to the Hard CPU in ~13 s, and a flat
// completion payout made throwing matches worth ~900 tickets an hour.
const COMPLETION_MS_PER_TICKET = 15_000;
const CPU_COMPLETION: Readonly<Record<number, number>> = { 2: 4, 3: 6 };
// Win bonuses are not time-gated (beating the CPU is the skill) and are tuned
// so a fast flawless Hard run lands near the guide's strong-play band.
const CPU_WIN_BONUS: Readonly<Record<number, Record<(typeof DIFFICULTIES)[number], number>>> = {
  2: { easy: 1, medium: 3, hard: 5 },
  3: { easy: 2, medium: 5, hard: 8 },
};
const CPU_FLAWLESS_BONUS = 2;
const ONLINE_COMPLETION = 10;
const ONLINE_WIN_BONUS = 10;
const RANKED_WIN_BONUS = 5;

export function normalizeSumoraiResult(raw: unknown): NormalizedResult<SumoraiResult> {
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
  if (!outcome) return refuse("invalid_outcome");

  const roundTarget = readInt(source.roundTarget, 1, 5);
  if (roundTarget === null) return refuse("invalid_round_target");
  if (mode === "cpu" ? !CPU_TARGETS.includes(roundTarget) : roundTarget !== ONLINE_TARGET) {
    return refuse("invalid_round_target");
  }

  const myWins = readInt(source.myWins, 0, roundTarget);
  const opponentWins = readInt(source.opponentWins, 0, roundTarget);
  const rounds = readInt(source.rounds, 1, MAX_ROUNDS);
  const durationMs = readDurationMs(source.durationMs);
  if (myWins === null || opponentWins === null || rounds === null || durationMs === null) return refuse("invalid_counts");
  if (myWins === roundTarget && opponentWins === roundTarget) return refuse("invalid_counts");
  if (outcome === "win" && myWins !== roundTarget) return refuse("invalid_counts");
  if (outcome === "loss" && opponentWins !== roundTarget) return refuse("invalid_counts");
  if (rounds < myWins + opponentWins) return refuse("invalid_counts");
  if (durationMs < rounds * MIN_MS_PER_ROUND) return refuse("implausible_duration");

  return {
    result: {
      resultId,
      mode,
      difficulty,
      // Ranked is a queue, and the CPU has no queue.
      ranked: mode === "online" && source.ranked === true,
      outcome,
      roundTarget,
      myWins,
      opponentWins,
      rounds,
      durationMs,
    },
  };
}

export function calculateSumoraiTicketReward({ result }: { result: SumoraiResult }): TicketRewardBreakdown {
  const won = result.outcome === "win";
  const earnedByTime = Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET);
  let completion: number;
  let win = 0;
  let flawless = 0;
  let ranked = 0;
  if (result.mode === "cpu") {
    completion = Math.min(CPU_COMPLETION[result.roundTarget] ?? 0, earnedByTime);
    if (won) {
      win = CPU_WIN_BONUS[result.roundTarget]?.[result.difficulty ?? "easy"] ?? 0;
      flawless = result.opponentWins === 0 ? CPU_FLAWLESS_BONUS : 0;
    }
  } else {
    completion = Math.min(ONLINE_COMPLETION, earnedByTime);
    if (won) {
      win = ONLINE_WIN_BONUS;
      ranked = result.ranked ? RANKED_WIN_BONUS : 0;
    }
  }
  const total = Math.min(SUMORAI_TICKET_MAX_PER_RESULT, completion + win + flawless + ranked);
  return { repeatable: { completion, win, flawless, ranked, total }, achievements: [], achievementTotal: 0, total };
}
