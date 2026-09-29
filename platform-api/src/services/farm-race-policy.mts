// Races at Windrush Downs, as rules (planning-docs/FARM_RIDING_PLAN.md). Pure
// apart from the HMAC — no database, no clock of its own.
//
// A race is posted at the race board with a course, a field size and a stake
// (0 = friendly). Riders enter while it is open, each putting up the stake;
// spectators back a rider at the betting booth while betting is open. When the
// poster starts it (or the field fills) the GATE closes `GATE_SECONDS` later —
// betting and entering stop there — and the race starts `COUNTDOWN_LEAD_SECONDS`
// after that, on the network server, which runs the mirrored sim on the riders'
// reins and signs the finish order.
//
// TRUST. The API decides who is in the race and with what horse (their stats,
// as the API computes them); it signs that as the RACE TICKET, and signs each
// entrant a SEAT only they are handed, so the race room knows who may send
// reins for whom. The race room signs the RESULT with the same shared secret
// (`FARM_RACE_SECRET`), any rider hands it back here, and only a result that
// verifies moves tickets. A race nobody settles by its deadline is refunded.
//
// MONEY. The winner takes the pot less a tenth, burned; every bet goes in one
// pool, and the pool less a tenth, burned, is shared by everyone who backed the
// winner in proportion to what they put in. The fee, the stake and bet caps,
// and a daily cap on what races may take from and pay to one player (the
// Exchange Board's 10,000) are the laundering fence: a thrown race cannot be
// proved, so it is simply made expensive and slow.

import { createHmac, timingSafeEqual } from "node:crypto";

export const RACE_COURSES: readonly string[] = Object.freeze(["gallop", "oval-1", "oval-2", "xc"]);
export const RACE_MIN_RIDERS = 2;
export const RACE_MAX_RIDERS = 6;
export const RACE_STAKE_MAX = 500;
export const RACE_BET_MIN = 1;
export const RACE_BET_MAX = 1000;
export const RACE_BETS_PER_PLAYER = 5;
export const RACE_FEE_RATE = 0.1;
export const RACE_DAILY_SPEND_LIMIT = 10_000;
export const RACE_DAILY_EARN_LIMIT = 10_000;
/** How long after the poster starts (or the field fills) betting and entries close. */
export const GATE_SECONDS = 20;
/** From the gate closing to the countdown: time for every rider to reach the start. */
export const COUNTDOWN_LEAD_SECONDS = 8;
/** An open race nobody starts is taken down (and refunded) after this long. */
export const OPEN_RACE_MINUTES = 30;
/** A race not settled this long after it started is refunded. */
export const RACE_DEADLINE_MINUTES = 8;
export const MAX_OPEN_RACES = 12;

export type RaceStatus = "open" | "closing" | "running" | "settled" | "cancelled";

export type RaceEntry = {
  playerId: string;
  name: string;
  horseId: string;
  horseName: string;
  paletteId: string;
  size: number;
  profile: Record<string, unknown>;
  stake: number;
  at: number;
};

export type RaceBet = { playerId: string; name: string; riderId: string; amount: number; at: number };

export type RacePayout = { playerId: string; kind: "win" | "bet" | "refund"; amount: number };

export function isRaceCourse(value: unknown): value is string {
  return typeof value === "string" && RACE_COURSES.includes(value);
}

export function raceFee(total: number): number {
  return Math.ceil(Math.max(0, total) * RACE_FEE_RATE);
}

/**
 * Who is paid what when a race is run. `order` is the finish order (player
 * ids), from a verified result. A race nobody finished pays everything back.
 */
export function raceSettlement(entries: readonly RaceEntry[], bets: readonly RaceBet[], order: readonly string[]): { payouts: RacePayout[]; burned: number } {
  const payouts: RacePayout[] = [];
  let burned = 0;
  const winner = order[0] ?? null;
  const pot = entries.reduce((sum, entry) => sum + entry.stake, 0);
  if (pot > 0) {
    if (winner && entries.some((entry) => entry.playerId === winner)) {
      const fee = raceFee(pot);
      burned += fee;
      payouts.push({ playerId: winner, kind: "win", amount: pot - fee });
    } else {
      for (const entry of entries) if (entry.stake > 0) payouts.push({ playerId: entry.playerId, kind: "refund", amount: entry.stake });
    }
  }
  const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
  if (pool > 0) {
    const fee = raceFee(pool);
    burned += fee;
    const share = pool - fee;
    const backers = winner ? bets.filter((bet) => bet.riderId === winner) : [];
    const backed = backers.reduce((sum, bet) => sum + bet.amount, 0);
    if (backed > 0) {
      let paid = 0;
      for (const bet of backers) {
        const amount = Math.floor((bet.amount / backed) * share);
        paid += amount;
        if (amount > 0) payouts.push({ playerId: bet.playerId, kind: "bet", amount });
      }
      burned += share - paid;
    } else {
      // Nobody backed the winner (or nobody finished): every bet back, less the fee.
      let paid = 0;
      for (const bet of bets) {
        const amount = Math.floor(bet.amount * (1 - RACE_FEE_RATE));
        paid += amount;
        if (amount > 0) payouts.push({ playerId: bet.playerId, kind: "refund", amount });
      }
      burned += share - paid;
    }
  }
  return { payouts: mergePayouts(payouts), burned };
}

function mergePayouts(payouts: readonly RacePayout[]): RacePayout[] {
  const merged = new Map<string, RacePayout>();
  for (const payout of payouts) {
    const key = `${payout.playerId}:${payout.kind}`;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, amount: existing.amount + payout.amount } : { ...payout });
  }
  return [...merged.values()];
}

/** Everything paid back, as it was put in (a race taken down, or never settled). */
export function raceRefunds(entries: readonly RaceEntry[], bets: readonly RaceBet[]): RacePayout[] {
  return mergePayouts([
    ...entries.filter((entry) => entry.stake > 0).map((entry) => ({ playerId: entry.playerId, kind: "refund" as const, amount: entry.stake })),
    ...bets.map((bet) => ({ playerId: bet.playerId, kind: "refund" as const, amount: bet.amount })),
  ]);
}

/** The implied odds on each rider while betting is open: the pool less the fee over what is on them. */
export function impliedOdds(entries: readonly RaceEntry[], bets: readonly RaceBet[]): Record<string, number | null> {
  const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
  const share = pool - raceFee(pool);
  const odds: Record<string, number | null> = {};
  for (const entry of entries) {
    const on = bets.filter((bet) => bet.riderId === entry.playerId).reduce((sum, bet) => sum + bet.amount, 0);
    odds[entry.playerId] = on > 0 ? Number((share / on).toFixed(2)) : null;
  }
  return odds;
}

// ---------------------------------------------------------------- signatures

/** A stable string for signing: keys sorted all the way down. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function signRacePayload(secret: string, kind: "ticket" | "seat" | "result", payload: unknown): string {
  return createHmac("sha256", secret).update(`${kind}:${canonicalJson(payload)}`).digest("hex");
}

export function verifyRacePayload(secret: string, kind: "ticket" | "seat" | "result", payload: unknown, signature: unknown): boolean {
  if (!secret || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signRacePayload(secret, kind, payload), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** What the race room is told a race is: who rides, on what, over which course, from when. */
export function raceTicketPayload(race: { id: string; courseId: string; startsAt: number; deadlineAt: number; entries: readonly RaceEntry[] }) {
  return {
    raceId: race.id,
    courseId: race.courseId,
    startsAt: race.startsAt,
    deadlineAt: race.deadlineAt,
    entries: race.entries.map((entry) => ({ playerId: entry.playerId, name: entry.name, horseName: entry.horseName, paletteId: entry.paletteId, size: entry.size, profile: entry.profile })),
  };
}

/** One entrant's seat: proof, for the race room, that reins from this socket are theirs. */
export function raceSeatPayload(raceId: string, playerId: string) {
  return { raceId, playerId };
}

/** A race room's result, as signed. */
export type RaceResultPayload = { raceId: string; order: string[]; finishTicks: Record<string, number>; dnf: string[] };

export function normalizeRaceResult(value: any): RaceResultPayload | null {
  if (!value || typeof value !== "object" || typeof value.raceId !== "string") return null;
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128).slice(0, RACE_MAX_RIDERS) : []);
  const finishTicks: Record<string, number> = {};
  for (const [id, ticks] of Object.entries(value.finishTicks && typeof value.finishTicks === "object" ? value.finishTicks : {})) {
    const n = Number(ticks);
    if (Number.isSafeInteger(n) && n >= 0) finishTicks[id] = n;
  }
  return { raceId: value.raceId, order: ids(value.order), finishTicks, dnf: ids(value.dnf) };
}
