// Registry of cabinets that settle tickets through POST /games/:slug/results.
//
// This is the ticket path for cabinets WITHOUT an achievement run to ride on
// (Lovers Lost settles inside its achievement transaction instead, and is
// deliberately not listed here, so one result can never be paid twice through
// two routes). A game is one entry: a normalizer that turns an untrusted body
// into a bounded result, or refuses it. The payout formula for the same slug
// lives in services/ticket-reward-catalog — a game listed here without an
// evaluator there would settle every result at zero, which a test forbids.
//
// A normalized result must carry `resultId` (the client-minted, retry-stable
// id) and `durationMs` (the play time it claims, which the settlement's
// time-budget fence checks against the wall clock).

import { normalizeBattleshitsResult } from "./battleshits-ticket-rewards.mjs";
import { normalizeBirdDutyResult } from "./bird-duty-ticket-rewards.mjs";
import { normalizeCreatureBattlerResult } from "./creature-battler-ticket-rewards.mjs";
import { normalizeIlluminautsResult } from "./illuminauts-ticket-rewards.mjs";
import { normalizeMiniHoopsResult } from "./mini-hoops-ticket-rewards.mjs";
import { normalizeMiniTacticsResult } from "./mini-tactics-ticket-rewards.mjs";
import { normalizePuckdUpResult } from "./puckd-up-ticket-rewards.mjs";
import { normalizeSharkHallResult } from "./shark-hall-ticket-rewards.mjs";
import { normalizeSumoraiResult } from "./sumorai-ticket-rewards.mjs";
import type { NormalizedResult } from "./game-result-shared.mjs";

export interface GameResultBase {
  resultId: string;
  durationMs: number;
}

const NORMALIZERS: Readonly<Record<string, (raw: unknown) => NormalizedResult<GameResultBase>>> = Object.freeze({
  battleshits: normalizeBattleshitsResult,
  sumorai: normalizeSumoraiResult,
  "mini-tactics": normalizeMiniTacticsResult,
  illuminauts: normalizeIlluminautsResult,
  "bird-duty": normalizeBirdDutyResult,
  "creature-battler": normalizeCreatureBattlerResult,
  "mini-hoops": normalizeMiniHoopsResult,
  "puckd-up": normalizePuckdUpResult,
  "shark-hall": normalizeSharkHallResult,
});

function cleanSlug(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isGameResultSlug(value: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(NORMALIZERS, cleanSlug(value));
}

export function listGameResultSlugs(): string[] {
  return Object.keys(NORMALIZERS);
}

export function normalizeGameResult(gameSlug: unknown, raw: unknown): NormalizedResult<GameResultBase> {
  const normalize = NORMALIZERS[cleanSlug(gameSlug)];
  return normalize ? normalize(raw) : { error: "unknown_result_game" };
}
