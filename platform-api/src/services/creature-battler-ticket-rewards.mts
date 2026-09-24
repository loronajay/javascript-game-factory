// Creature Battler ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. Training battles run in
// the browser against the AI and online battles are peer lockstep, so the
// server refuses the impossible (a battle faster than its own round
// animations, an unbounded round count) and the settlement's time-budget
// fence (db/game-results) bounds the rest.
//
// An online battle won because the opponent disconnected is never filed, and
// neither is one that ended on a sync failure: nothing completed.

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

const MODES = ["training", "online"] as const;
const OUTCOMES = ["win", "loss", "draw"] as const;
const MAX_ROUNDS = 200;
// Every round plays its moves out as animations and a result hold; two
// seconds a round is a deliberately loose floor.
const MIN_MS_PER_ROUND = 2000;

export interface CreatureBattlerResult {
  resultId: string;
  mode: (typeof MODES)[number];
  outcome: (typeof OUTCOMES)[number];
  rounds: number;
  durationMs: number;
}

export const CREATURE_BATTLER_TICKET_MAX_PER_RESULT = 45;

// Completion is EARNED BY TIME, one ticket per 10 s: commands can be mashed
// through a losing battle in well under a minute. The whole payout is held
// to one ticket per 7 s so a forged win has to cost real time under the fence.
const COMPLETION_MS_PER_TICKET = 10_000;
const COMPLETION_CAP = { training: 25, online: 30 } as const;
const WIN_BONUS = { training: 10, online: 15 } as const;
const MS_PER_TICKET_CEILING = 7_000;

export function normalizeCreatureBattlerResult(raw: unknown): NormalizedResult<CreatureBattlerResult> {
  const source = readResultSource(raw);
  if (!source) return refuse("invalid_result");
  if (namesClientAmount(source)) return refuse("client_amount_refused");

  const resultId = readResultId(source.resultId);
  if (!resultId) return refuse("invalid_result_id");
  const mode = readChoice(source.mode, MODES);
  if (!mode) return refuse("invalid_mode");
  const outcome = readChoice(source.outcome, OUTCOMES);
  if (!outcome) return refuse("invalid_outcome");
  const rounds = readInt(source.rounds, 1, MAX_ROUNDS);
  const durationMs = readDurationMs(source.durationMs);
  if (rounds === null || durationMs === null) return refuse("invalid_counts");
  if (durationMs < rounds * MIN_MS_PER_ROUND) return refuse("implausible_duration");

  return { result: { resultId, mode, outcome, rounds, durationMs } };
}

export function calculateCreatureBattlerTicketReward({ result }: { result: CreatureBattlerResult }): TicketRewardBreakdown {
  const completion = Math.min(COMPLETION_CAP[result.mode], Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
  const win = result.outcome === "win" ? WIN_BONUS[result.mode] : 0;
  const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
  const total = Math.min(CREATURE_BATTLER_TICKET_MAX_PER_RESULT, ceiling, completion + win);
  return { repeatable: { completion, win, total }, achievements: [], achievementTotal: 0, total };
}
