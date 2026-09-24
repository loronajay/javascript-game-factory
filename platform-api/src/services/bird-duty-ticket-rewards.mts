// Bird Duty ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. A solo run is played in
// the browser; an online match is decided by factory-network-server, but that
// server does not report to this API yet, so each seat files its own reading
// of the final table. The server refuses the impossible (more points than the
// shots could score, a winner below the best opponent, shots faster than a
// dropping can fall) and the settlement's time-budget fence (db/game-results)
// bounds the rest.
//
// Hot seat has no mode here: shared-screen play earns no repeatable tickets,
// so the cabinet never files it and the normalizer refuses it. A seat that
// leaves an online match never sees it end, so it never files either.

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

const MODES = ["solo", "online"] as const;
const ONLINE_OUTCOMES = ["win", "loss", "tie"] as const;
// Mirrors SHOTS_PER_RUN (sim/play-session.js) and HOTSEAT_ROUNDS x
// HOTSEAT_SHOTS_PER_TURN (sim/hotseat-session.js), which online plays.
const SOLO_SHOTS = 10;
const ONLINE_SHOTS_PER_PLAYER = 3 * 5;
// The best walker is worth 5 and one dropping can land on a crowd; fifteen
// points a shot is far past anything a real run scores.
const MAX_POINTS_PER_SHOT = 15;
// A dropping must fall and splat before the next can leave (about 1.1 s);
// three quarters of a second is a deliberately loose floor.
const MIN_MS_PER_SHOT = 750;

export type BirdDutyResult =
  | { resultId: string; mode: "solo"; score: number; durationMs: number }
  | {
      resultId: string;
      mode: "online";
      playerCount: number;
      outcome: (typeof ONLINE_OUTCOMES)[number];
      myScore: number;
      bestOpponentScore: number;
      durationMs: number;
    };

export const BIRD_DUTY_TICKET_MAX_PER_RESULT = 25;

// A solo run has no clock of its own — it ends when ten shots are spent — so
// the whole payout is EARNED BY TIME: the score decides how much a run is
// worth, but never faster than one ticket per 7 s. Dropping all ten blind,
// one every 1.5 s, scored 35 in a headless run; that spray must stay under
// the hourly target (~420/h here) while a careful run earns ~500/h.
const SOLO_COMPLETION_MS_PER_TICKET = 10_000;
const SOLO_COMPLETION_CAP = 2;
const SOLO_POINTS_PER_TICKET = 8;
const SOLO_SCORE_CAP = 8;
const SOLO_MS_PER_TICKET_CEILING = 7_000;
const SOLO_CAP = SOLO_COMPLETION_CAP + SOLO_SCORE_CAP;
const ONLINE_COMPLETION_MS_PER_TICKET = 10_000;
const ONLINE_COMPLETION_CAP = 15;
const ONLINE_WIN_BONUS = { duel: 5, table: 8 } as const;

export function normalizeBirdDutyResult(raw: unknown): NormalizedResult<BirdDutyResult> {
  const source = readResultSource(raw);
  if (!source) return refuse("invalid_result");
  if (namesClientAmount(source)) return refuse("client_amount_refused");

  const resultId = readResultId(source.resultId);
  if (!resultId) return refuse("invalid_result_id");
  const mode = readChoice(source.mode, MODES);
  if (!mode) return refuse("invalid_mode");
  const durationMs = readDurationMs(source.durationMs);
  if (durationMs === null) return refuse("invalid_counts");

  if (mode === "solo") {
    const score = readInt(source.score, 0, SOLO_SHOTS * MAX_POINTS_PER_SHOT);
    if (score === null) return refuse("invalid_counts");
    if (durationMs < SOLO_SHOTS * MIN_MS_PER_SHOT) return refuse("implausible_duration");
    return { result: { resultId, mode, score, durationMs } };
  }

  const playerCount = readInt(source.playerCount, 2, 4);
  if (playerCount === null) return refuse("invalid_table");
  const outcome = readChoice(source.outcome, ONLINE_OUTCOMES);
  if (!outcome) return refuse("invalid_outcome");
  const maxScore = ONLINE_SHOTS_PER_PLAYER * MAX_POINTS_PER_SHOT;
  const myScore = readInt(source.myScore, 0, maxScore);
  const bestOpponentScore = readInt(source.bestOpponentScore, 0, maxScore);
  if (myScore === null || bestOpponentScore === null) return refuse("invalid_counts");
  const expected = myScore > bestOpponentScore ? "win" : myScore < bestOpponentScore ? "loss" : "tie";
  if (outcome !== expected) return refuse("invalid_outcome");
  if (durationMs < playerCount * ONLINE_SHOTS_PER_PLAYER * MIN_MS_PER_SHOT) return refuse("implausible_duration");
  return { result: { resultId, mode, playerCount, outcome, myScore, bestOpponentScore, durationMs } };
}

export function calculateBirdDutyTicketReward({ result }: { result: BirdDutyResult }): TicketRewardBreakdown {
  if (result.mode === "solo") {
    const completion = Math.min(SOLO_COMPLETION_CAP, Math.floor(result.durationMs / SOLO_COMPLETION_MS_PER_TICKET));
    const score = Math.min(SOLO_SCORE_CAP, Math.floor(result.score / SOLO_POINTS_PER_TICKET));
    const ceiling = Math.floor(result.durationMs / SOLO_MS_PER_TICKET_CEILING);
    const total = Math.min(SOLO_CAP, completion + score, ceiling);
    return { repeatable: { completion, score, total }, achievements: [], achievementTotal: 0, total };
  }
  const completion = Math.min(ONLINE_COMPLETION_CAP, Math.floor(result.durationMs / ONLINE_COMPLETION_MS_PER_TICKET));
  const win = result.outcome !== "win" ? 0 : result.playerCount === 2 ? ONLINE_WIN_BONUS.duel : ONLINE_WIN_BONUS.table;
  const total = Math.min(BIRD_DUTY_TICKET_MAX_PER_RESULT, completion + win);
  return { repeatable: { completion, win, total }, achievements: [], achievementTotal: 0, total };
}
