// Puzzle Campaign result validation and ticket payout for Lovers Lost.
// The cabinet reports only bounded clear facts. This server module owns both
// the trust boundary and the amount, keeping currency out of client code.

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

const MODES = ["solo", "local"] as const;
const AUTHORED_STAGES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "first-steps": Object.freeze(["the-handoff"]),
});

const MIN_CLEAR_DURATION_MS = 8_000;
const MAX_CLEAR_DURATION_MS = 30 * 60 * 1_000;
const PAR_DURATION_MS = 75_000;
const MS_PER_TICKET_CEILING = 7_000;

export interface LoversLostCampaignResult {
  resultId: string;
  packId: string;
  stageId: string;
  mode: (typeof MODES)[number];
  completed: true;
  resets: number;
  durationMs: number;
}

export function normalizeLoversLostCampaignResult(raw: unknown): NormalizedResult<LoversLostCampaignResult> {
  const source = readResultSource(raw);
  if (!source) return refuse("invalid_result");
  if (namesClientAmount(source)) return refuse("client_amount_refused");

  const resultId = readResultId(source.resultId);
  if (!resultId) return refuse("invalid_result_id");
  const packId = typeof source.packId === "string" ? source.packId : "";
  const stageId = typeof source.stageId === "string" ? source.stageId : "";
  if (!AUTHORED_STAGES[packId]?.includes(stageId)) return refuse("invalid_stage");
  const mode = readChoice(source.mode, MODES);
  if (!mode) return refuse("invalid_mode");
  if (source.completed !== true) return refuse("incomplete_stage");
  const resets = readInt(source.resets, 0, 99);
  const durationMs = readDurationMs(source.durationMs);
  if (resets === null || durationMs === null || durationMs > MAX_CLEAR_DURATION_MS) return refuse("invalid_counts");
  if (durationMs < MIN_CLEAR_DURATION_MS) return refuse("implausible_duration");

  return {
    result: {
      resultId,
      packId,
      stageId,
      mode,
      completed: true,
      resets,
      durationMs,
    },
  };
}

export function calculateLoversLostCampaignTicketReward({ result }: {
  result: LoversLostCampaignResult;
}): TicketRewardBreakdown {
  const completion = result.completed ? 1 : 0;
  const par = result.durationMs <= PAR_DURATION_MS ? 2 : 0;
  const clean = result.resets === 0 ? 1 : 0;
  const ceiling = Math.floor(result.durationMs / MS_PER_TICKET_CEILING);
  const total = Math.max(0, Math.min(4, ceiling, completion + par + clean));
  return {
    repeatable: { completion, par, clean, total },
    achievements: [],
    achievementTotal: 0,
    total,
  };
}
