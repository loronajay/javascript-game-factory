// An online Pondside Push match, as this browser sees it.
//
// The server runs the brawl (factory-network-server, the mirrored session.js).
// This module builds the same session locally from the seats the server
// announced, lays every snapshot over it, predicts THIS person's pet from the
// inputs the server has not taken yet (movement and bump only — who shoves whom
// is the server's call), and draws the other pets a tenth of a second in the
// past between two snapshots. It holds no rules.

import { applySessionSnapshot, predictPlayer } from "./sim/net.js?v=20260928-pet-online";
import { movePlayer, readPushInput } from "./sim/match.js?v=20260928-pet-online";
import { createSession } from "./sim/session.js?v=20260928-pet-online";
import { createInputStream } from "../../pet-games/shared/online/input-stream.js";
import { createErrorSmoother, createSnapshotBuffer, lerp } from "../../pet-games/shared/online/smoothing.js";

export const PONDSIDE_ONLINE = Object.freeze({
  gameId: "pondside-push",
  limits: Object.freeze({ minPlayers: 2, maxPlayers: 4 }),
  storageKey: "pondside-push.online-session.v1",
  inputMessage: "pondside_input",
  snapshotMessage: "pondside_snapshot",
  endedMessage: "pondside_match_ended",
});

export function sessionFromMatch(match) {
  return createSession({
    entrants: [
      ...match.seats.map((seat) => ({ id: seat.seatId, pet: seat.pet })),
      ...match.cpus.map((seat) => ({ id: seat.seatId, pet: seat.pet, cpu: seat.level })),
    ],
    seed: match.seed,
  });
}

// Player row layout from sim/net.js: [id, x, y, ...].
const X = 1;
const Y = 2;

export function createOnlineBrawl({ match, clientId, now = () => performance.now() }) {
  const session = applySessionSnapshot(sessionFromMatch(match), match.session);
  const mySeat = match.seats.find((seat) => seat.clientId === clientId) ?? null;
  const myId = mySeat?.seatId ?? null;
  const stream = createInputStream({ read: readPushInput });
  const buffer = createSnapshotBuffer({ delayMs: 100 });
  const smoother = createErrorSmoother({ snapDistance: 45 });
  let predicted = myId ? predictPlayer(session, myId, []) : null;
  let latest = match;
  buffer.push(match.session, now());

  return {
    myId,
    session,
    names: new Map(match.seats.map((seat) => [seat.seatId, seat.name])),
    get match() { return latest; },

    applySnapshot(next) {
      if (!next?.session || next.session.tick < session.tick) return;
      latest = next;
      applySessionSnapshot(session, next.session);
      buffer.push(next.session, now());
      stream.acknowledge(next.acks?.[clientId] ?? 0);
      if (!myId) return;
      const before = predicted;
      predicted = predictPlayer(session, myId, stream.pendingInputs());
      if (before && predicted && !predicted.eliminated) smoother.correct(before, predicted, now());
    },

    tick(controls, dt = 1 / 60) {
      if (!myId) return null;
      stream.record(controls);
      if (predicted && session.phase === "playing" && !predicted.eliminated) movePlayer(predicted, readPushInput(controls), dt);
      return stream.takeBatch();
    },

    /** Where to draw each pet's body right now (x/y only; everything else is the snapshot's). */
    positions() {
      const positions = new Map();
      const sample = buffer.sample(now());
      if (sample) {
        const from = new Map(sample.from.match.players.map((row) => [row[0], row]));
        for (const row of sample.to.match.players) {
          const start = from.get(row[0]) ?? row;
          positions.set(row[0], { x: lerp(start[X], row[X], sample.amount), y: lerp(start[Y], row[Y], sample.amount) });
        }
      }
      if (predicted && !predicted.eliminated) {
        const offset = smoother.offset(now());
        positions.set(myId, { x: predicted.x + offset.x, y: predicted.y + offset.y, facingX: predicted.facingX, facingY: predicted.facingY });
      }
      return positions;
    },

    get me() { return predicted; },
  };
}
