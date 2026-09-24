// Shared field rules for the per-game result normalizers behind
// POST /games/:slug/results (see services/game-result-catalog).
//
// Every normalizer is a trust boundary: a result arrives from a browser, so
// each field is attacker-controlled. These helpers are the parts every game
// judges the same way — the result id, integer bounds, and the rule that a
// payload naming its own payout is refused outright rather than stripped, so
// a client that tries it finds out loudly.

export type NormalizedResult<T> = { result: T; error?: undefined } | { result?: undefined; error: string };

const RESULT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/i;
const CLIENT_AMOUNT_FIELDS = ["tickets", "reward", "rewards", "amount", "price", "payout"];

/** Hard ceiling on any one claimed duration: an idle tab is not play time. */
export const MAX_RESULT_DURATION_MS = 4 * 60 * 60 * 1000;

export function refuse<T>(error: string): NormalizedResult<T> {
  return { error };
}

export function readResultSource(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function namesClientAmount(source: Record<string, unknown>): boolean {
  return CLIENT_AMOUNT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(source, field));
}

export function readResultId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  return RESULT_ID_PATTERN.test(id) ? id : "";
}

/** An integer within [min, max], or null. Non-integers are refused, not rounded. */
export function readInt(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(number) || number < min || number > max) return null;
  return number;
}

/** Duration in ms, clamped to the ceiling; null when missing or negative. */
export function readDurationMs(value: unknown): number | null {
  const number = Number(value);
  if (typeof value !== "number" || !Number.isFinite(number) || number < 0) return null;
  return Math.min(MAX_RESULT_DURATION_MS, Math.floor(number));
}

export function readChoice<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T) : null;
}
