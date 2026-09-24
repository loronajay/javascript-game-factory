// Illuminauts ticket payout: the result normalizer and the pure formula.
//
// Evidence standing: a plausibility gate, not proof. Solo runs are played in
// the browser and an online race is peer-relayed, so the server refuses the
// impossible (an unknown sector, a clear faster than a sixth of par) and the
// settlement's time-budget fence (db/game-results) bounds the rest.
//
// Only finished runs are filed: a solo run pays when the Beacon Core is
// reached, an online race when either runner reaches it. A race the partner
// leaves ends on the disconnected screen and is never filed. Editor playtests
// are not a mode here.

import type { TicketRewardBreakdown } from "./ticket-reward-catalog.mjs";
import {
  type NormalizedResult,
  namesClientAmount,
  readChoice,
  readDurationMs,
  readResultId,
  readResultSource,
  refuse,
} from "./game-result-shared.mjs";

const MODES = ["sprint", "sweep", "online"] as const;
const ONLINE_OUTCOMES = ["win", "loss"] as const;

// Mirrors soloConfig in games/illuminauts/scripts/maps.js; a test compares
// the two, so a new sector or a retuned par fails CI until it lands here.
export const ILLUMINAUTS_PAR_MS: Readonly<Record<string, { sprint: number; sweep: number }>> = Object.freeze({
  "map-01": { sprint: 120_000, sweep: 270_000 },
  "map-02": { sprint: 120_000, sweep: 270_000 },
  "map-03": { sprint: 150_000, sweep: 330_000 },
  "map-04": { sprint: 120_000, sweep: 270_000 },
  "map-05": { sprint: 120_000, sweep: 270_000 },
  "map-06": { sprint: 120_000, sweep: 270_000 },
});
// Par is a comfortable time; a sixth of it is a deliberately loose floor.
// An online race is to the Beacon Core, so it shares the sprint floor.
const PAR_FLOOR_DIVISOR = 6;

export interface IlluminautsResult {
  resultId: string;
  mode: (typeof MODES)[number];
  mapId: string;
  outcome: (typeof ONLINE_OUTCOMES)[number] | null;
  durationMs: number;
}

export const ILLUMINAUTS_TICKET_MAX_PER_RESULT = 45;

// Completion is EARNED BY TIME, one ticket per 10 s, up to a cap a little
// past par so a player cannot idle in a maze for pay. Beating par is the
// solo skill bonus; winning the race is the online one.
const COMPLETION_MS_PER_TICKET = 10_000;
const COMPLETION_CAP = { sprint: 15, sweep: 35, online: 20 } as const;
const PAR_BONUS = { sprint: 5, sweep: 10 } as const;
const ONLINE_WIN_BONUS = 10;

export function normalizeIlluminautsResult(raw: unknown): NormalizedResult<IlluminautsResult> {
  const source = readResultSource(raw);
  if (!source) return refuse("invalid_result");
  if (namesClientAmount(source)) return refuse("client_amount_refused");

  const resultId = readResultId(source.resultId);
  if (!resultId) return refuse("invalid_result_id");
  const mode = readChoice(source.mode, MODES);
  if (!mode) return refuse("invalid_mode");
  const mapId = typeof source.mapId === "string" ? source.mapId : "";
  const par = Object.prototype.hasOwnProperty.call(ILLUMINAUTS_PAR_MS, mapId) ? ILLUMINAUTS_PAR_MS[mapId] : null;
  if (!par) return refuse("invalid_map");

  let outcome: IlluminautsResult["outcome"] = null;
  if (mode === "online") {
    outcome = readChoice(source.outcome, ONLINE_OUTCOMES);
    if (!outcome) return refuse("invalid_outcome");
  } else if (source.outcome !== undefined) {
    return refuse("invalid_outcome");
  }

  const durationMs = readDurationMs(source.durationMs);
  if (durationMs === null) return refuse("invalid_counts");
  const floorPar = mode === "sweep" ? par.sweep : par.sprint;
  if (durationMs < floorPar / PAR_FLOOR_DIVISOR) return refuse("implausible_duration");

  return { result: { resultId, mode, mapId, outcome, durationMs } };
}

export function calculateIlluminautsTicketReward({ result }: { result: IlluminautsResult }): TicketRewardBreakdown {
  const completion = Math.min(COMPLETION_CAP[result.mode], Math.floor(result.durationMs / COMPLETION_MS_PER_TICKET));
  let par = 0;
  let win = 0;
  if (result.mode === "online") {
    win = result.outcome === "win" ? ONLINE_WIN_BONUS : 0;
  } else if (result.durationMs <= ILLUMINAUTS_PAR_MS[result.mapId][result.mode]) {
    par = PAR_BONUS[result.mode];
  }
  const total = Math.min(ILLUMINAUTS_TICKET_MAX_PER_RESULT, completion + par + win);
  return { repeatable: { completion, par, win, total }, achievements: [], achievementTotal: 0, total };
}
