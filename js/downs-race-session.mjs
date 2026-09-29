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
import { COUNTDOWN_TICKS, createRace, stepRaceRider } from "./downs-race.mjs";
import { findDownsCourse } from "./downs-course.mjs";
import { packRideInput, unpackRideInput } from "./farm-ride.mjs";
const MAX_PENDING = 600;
export function createRaceSession(options) {
    const now = options.now ?? (() => Date.now());
    const payload = options.ticket.payload;
    const course = findDownsCourse(payload.courseId);
    const rider = Boolean(options.seat);
    const mine = payload.entries.find((entry) => entry.playerId === options.selfPlayerId) ?? null;
    const profile = mine ? mine.profile : null;
    const initial = createRace(payload.courseId, payload.entries);
    let authoritative = initial.riders.find((entry) => entry.playerId === options.selfPlayerId) ?? null;
    let authoritativeTick = 0;
    let acked = 0;
    let seq = 0;
    const pending = [];
    let unsent = [];
    let predicted = authoritative;
    let predictedTick = 0;
    let serverOffset = 0;
    let open = false;
    let closed = false;
    let signed = null;
    let socket = null;
    function send(message) {
        if (!socket || !open)
            return;
        try {
            socket.send(JSON.stringify(message));
        }
        catch {
            // The next tick tries again.
        }
    }
    function connect() {
        if (closed)
            return;
        try {
            socket = (options.socketFactory ?? ((url) => new WebSocket(url)))(options.url);
        }
        catch {
            options.onError?.("OFFLINE");
            return;
        }
        socket.addEventListener("open", () => {
            open = true;
            send({ type: "downs_race_join", raceId: payload.raceId, ticket: options.ticket, playerId: options.selfPlayerId, ...(rider ? { seat: options.seat } : {}) });
        });
        socket.addEventListener("message", (event) => {
            let data;
            try {
                data = JSON.parse(String(event.data));
            }
            catch {
                return;
            }
            if (data?.raceId && data.raceId !== payload.raceId)
                return;
            if (data?.event === "downs_race_joined") {
                if (Number.isFinite(data.now))
                    serverOffset = Number(data.now) - now();
            }
            else if (data?.event === "downs_race_state") {
                const me = Array.isArray(data.riders) ? data.riders.find((entry) => entry?.playerId === options.selfPlayerId) : null;
                if (me && rider && me.ride) {
                    authoritative = me;
                    authoritativeTick = Number(data.tick) || 0;
                    acked = Number(data.acked) || acked;
                    reconcile();
                }
            }
            else if (data?.event === "downs_race_result" && data.result && typeof data.signature === "string") {
                signed = { result: data.result, signature: data.signature };
                options.onResult?.(signed);
            }
            else if (data?.event === "error") {
                options.onError?.(String(data.code ?? "ERROR"));
            }
        });
        socket.addEventListener("close", () => {
            open = false;
            socket = null;
            if (!closed && !signed)
                setTimeout(connect, 1500);
        });
        socket.addEventListener("error", () => undefined);
    }
    /** The room's last word, with every input it has not acknowledged played on top. */
    function reconcile() {
        if (!authoritative || !profile)
            return;
        while (pending.length && pending[0].seq <= acked)
            pending.shift();
        let state = authoritative;
        let tick = authoritativeTick;
        for (const entry of pending) {
            state = stepRaceRider(state, unpackRideInput(entry.input), profile, course, tick);
            tick += 1;
        }
        predicted = state;
        predictedTick = tick;
    }
    const localTick = () => Math.floor(((now() + serverOffset) - payload.startsAt) / (1000 / 60));
    connect();
    return Object.freeze({
        raceId: () => payload.raceId,
        role: () => (rider ? "rider" : "watcher"),
        tick: localTick,
        step(input) {
            if (!rider || !profile || !predicted)
                return null;
            if (localTick() < 0)
                return predicted.ride;
            seq += 1;
            const byte = packRideInput(input);
            pending.push({ seq, input: byte });
            unsent.push({ seq, input: byte });
            if (pending.length > MAX_PENDING)
                pending.splice(0, pending.length - MAX_PENDING);
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
            try {
                socket?.close();
            }
            catch { /* gone */ }
        },
    });
}
export const RACE_COUNTDOWN_TICKS = COUNTDOWN_TICKS;
