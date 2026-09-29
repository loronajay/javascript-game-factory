// One race, from a rider's (or a watcher's) side (planning-docs/FARM_RIDING_PLAN.md).
// DOM-free: the socket, the clock and the timers are injected.
//
// The race runs on the network server's race room, which the API has told
// who rides and on what (the signed RACE TICKET); a rider proves their seat
// with the SEAT the API signed for them alone. A rider sends one packed input
// byte a tick, sequenced; the room applies one a tick and acknowledges the last
// it took in each snapshot. The rider's own horse is PREDICTED here on exactly
// the room's sim (`stepRaceRider`) from the room's last word plus every input
// it has not acknowledged yet — the horses never touch, so the prediction is
// exact and the reins feel immediate at any ping. When the room finishes the
// race it signs the result, and the session hands it on to be settled.

import { COUNTDOWN_TICKS, createRace, stepRaceRider, type RaceEntrant, type RaceRider } from "./downs-race.mjs";
import { findDownsCourse, type DownsCourseId } from "./downs-course.mjs";
import { packRideInput, unpackRideInput, type RideInput, type RideProfile, type RideState } from "./farm-ride.mjs";

export type RaceTicket = Readonly<{ payload: Readonly<{ raceId: string; courseId: DownsCourseId; startsAt: number; deadlineAt: number; entries: readonly RaceEntrant[] }>; signature: string }>;
export type SignedRaceResult = Readonly<{ result: Readonly<{ raceId: string; order: readonly string[]; finishTicks: Readonly<Record<string, number>>; dnf: readonly string[] }>; signature: string }>;

export type RaceSocket = Readonly<{
  send: (text: string) => void;
  close: () => void;
  addEventListener: (type: "open" | "message" | "close" | "error", listener: (event: any) => void) => void;
}>;

export type RaceSessionOptions = Readonly<{
  ticket: RaceTicket;
  /** The rider's seat signature; absent for a watcher. */
  seat?: string;
  selfPlayerId: string;
  url: string;
  socketFactory?: (url: string) => RaceSocket;
  now?: () => number;
  onResult?: (result: SignedRaceResult) => void;
  onError?: (code: string) => void;
}>;

export type RaceSession = Readonly<{
  raceId: () => string;
  role: () => "rider" | "watcher";
  /** Race ticks by the local clock (negative before the countdown). */
  tick: () => number;
  /** Step the rider's own horse one tick on the reins held now; its predicted state. */
  step: (input: RideInput) => RideState | null;
  predicted: () => RaceRider | null;
  finished: () => boolean;
  result: () => SignedRaceResult | null;
  close: () => void;
}>;

const MAX_PENDING = 600;

export function createRaceSession(options: RaceSessionOptions): RaceSession {
  const now = options.now ?? (() => Date.now());
  const payload = options.ticket.payload;
  const course = findDownsCourse(payload.courseId)!;
  const rider = Boolean(options.seat);
  const mine = payload.entries.find((entry) => entry.playerId === options.selfPlayerId) ?? null;
  const profile: RideProfile | null = mine ? (mine.profile as RideProfile) : null;
  const initial = createRace(payload.courseId, payload.entries);
  let authoritative: RaceRider | null = initial.riders.find((entry) => entry.playerId === options.selfPlayerId) ?? null;
  let authoritativeTick = 0;
  let acked = 0;
  let seq = 0;
  const pending: { seq: number; input: number }[] = [];
  let unsent: { seq: number; input: number }[] = [];
  let predicted: RaceRider | null = authoritative;
  let predictedTick = 0;
  let serverOffset = 0;
  let open = false;
  let closed = false;
  let signed: SignedRaceResult | null = null;
  let socket: RaceSocket | null = null;

  function send(message: Record<string, unknown>): void {
    if (!socket || !open) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // The next tick tries again.
    }
  }

  function connect(): void {
    if (closed) return;
    try {
      socket = (options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as RaceSocket))(options.url);
    } catch {
      options.onError?.("OFFLINE");
      return;
    }
    socket.addEventListener("open", () => {
      open = true;
      send({ type: "downs_race_join", raceId: payload.raceId, ticket: options.ticket, playerId: options.selfPlayerId, ...(rider ? { seat: options.seat } : {}) });
    });
    socket.addEventListener("message", (event) => {
      let data: any;
      try { data = JSON.parse(String(event.data)); } catch { return; }
      if (data?.raceId && data.raceId !== payload.raceId) return;
      if (data?.event === "downs_race_joined") {
        if (Number.isFinite(data.now)) serverOffset = Number(data.now) - now();
      } else if (data?.event === "downs_race_state") {
        const me = Array.isArray(data.riders) ? data.riders.find((entry: any) => entry?.playerId === options.selfPlayerId) : null;
        if (me && rider && me.ride) {
          authoritative = me as RaceRider;
          authoritativeTick = Number(data.tick) || 0;
          acked = Number(data.acked) || acked;
          reconcile();
        }
      } else if (data?.event === "downs_race_result" && data.result && typeof data.signature === "string") {
        signed = { result: data.result, signature: data.signature };
        options.onResult?.(signed);
      } else if (data?.event === "error") {
        options.onError?.(String(data.code ?? "ERROR"));
      }
    });
    socket.addEventListener("close", () => {
      open = false;
      socket = null;
      if (!closed && !signed) setTimeout(connect, 1500);
    });
    socket.addEventListener("error", () => undefined);
  }

  /** The room's last word, with every input it has not acknowledged played on top. */
  function reconcile(): void {
    if (!authoritative || !profile) return;
    while (pending.length && pending[0]!.seq <= acked) pending.shift();
    let state = authoritative;
    let tick = authoritativeTick;
    for (const entry of pending) {
      state = stepRaceRider(state, unpackRideInput(entry.input), profile, course, tick);
      tick += 1;
    }
    predicted = state;
    predictedTick = tick;
  }

  const localTick = (): number => Math.floor(((now() + serverOffset) - payload.startsAt) / (1000 / 60));

  connect();

  return Object.freeze({
    raceId: () => payload.raceId,
    role: () => (rider ? "rider" : "watcher"),
    tick: localTick,
    step(input) {
      if (!rider || !profile || !predicted) return null;
      if (localTick() < 0) return predicted.ride;
      seq += 1;
      const byte = packRideInput(input);
      pending.push({ seq, input: byte });
      unsent.push({ seq, input: byte });
      if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
      predicted = stepRaceRider(predicted, input, profile, course, predictedTick);
      predictedTick += 1;
      // Inputs go out in small batches (a few ticks' worth), the last dozen at most.
      if (unsent.length >= 3) {
        send({ type: "downs_race_input", raceId: payload.raceId, inputs: unsent.slice(-12) });
        unsent = [];
      }
      return predicted.ride;
    },
    predicted: () => predicted,
    finished: () => Boolean(signed) || Boolean(predicted && (predicted.finishTick >= 0 || predicted.dnf)),
    result: () => signed,
    close() {
      closed = true;
      try { socket?.close(); } catch { /* gone */ }
    },
  });
}

export const RACE_COUNTDOWN_TICKS = COUNTDOWN_TICKS;
