// The nap bank: how much farm time a player may sleep through. Pure.
//
// Naps fast-forward the whole farm, crops included, so unlimited naps would let
// a crop be slept ripe in under a minute — and once a harvest is worth tickets,
// the server could not tell that from a forged clock. The bank makes naps a
// resource: it refills with real time (18 farm hours per real day), holds at
// most 24, and every nap draws on it. The API verifies every clock jump against
// real time plus this same bank (platform-api/src/services/farm-time-policy.mts),
// so the numbers here and there must agree (a test holds them together).

export const NAP_BANK_CAPACITY_MINUTES = 24 * 60;
export const NAP_BANK_REFILL_MINUTES_PER_REAL_DAY = 18 * 60;
const REAL_DAY_MS = 24 * 60 * 60 * 1000;

/** The bank at real time `nowMs`, given it held `bank` at `sinceMs`. A missing or corrupt bank reads as full. */
export function napBankAt(bank: number, sinceMs: number, nowMs: number): number {
  const start = Number.isFinite(bank) ? Math.max(0, bank) : NAP_BANK_CAPACITY_MINUTES;
  const elapsed = Number.isFinite(sinceMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - sinceMs) : 0;
  return Math.min(NAP_BANK_CAPACITY_MINUTES, start + (elapsed / REAL_DAY_MS) * NAP_BANK_REFILL_MINUTES_PER_REAL_DAY);
}

export function canNap(bank: number, minutes: number): boolean {
  return Number.isFinite(minutes) && minutes > 0 && minutes <= bank + 1e-6;
}

/** Real time until the bank holds `minutes`, in ms (0 if it already does). */
export function napBankReadyIn(bank: number, minutes: number): number {
  const short = Math.max(0, minutes - bank);
  return (short / NAP_BANK_REFILL_MINUTES_PER_REAL_DAY) * REAL_DAY_MS;
}

export function formatNapMinutes(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}
