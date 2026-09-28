// An online Barnyard Dash race, as this browser sees it.
//
// The server runs the race (factory-network-server, the mirrored sim). This
// module builds the same race locally from the seats the server announced —
// the same course, pets and seed — so it can draw it, and then:
//   - lays each snapshot over that copy (`applyRaceSnapshot`);
//   - predicts THIS person's pet by replaying the inputs the server has not
//     taken yet over its last word (`predictRacer`), so the pet answers the
//     keys at once; a correction is smoothed away, never shown as a jump;
//   - draws every other pet a tenth of a second in the past, between two
//     snapshots, so they move smoothly and never on a guess.
// It holds no rules: nothing here decides a checkpoint, a finish or a place.

import { courseOrDefault } from "./sim/courses.js?v=20260928-pet-online";
import { applyRaceSnapshot, predictRacer } from "./sim/net.js?v=20260928-pet-online";
import { advanceRacer, createRace, readRaceInput } from "./sim/race.js?v=20260928-pet-online";
import { createInputStream } from "../../pet-games/shared/online/input-stream.js";
import { createErrorSmoother, createSnapshotBuffer, lerp, lerpAngle } from "../../pet-games/shared/online/smoothing.js";

export const BARNYARD_ONLINE = Object.freeze({
  gameId: "barnyard-dash",
  limits: Object.freeze({ minPlayers: 2, maxPlayers: 8 }),
  storageKey: "barnyard-dash.online-session.v1",
  inputMessage: "barnyard_input",
  snapshotMessage: "barnyard_snapshot",
  endedMessage: "barnyard_match_ended",
});

/** Build the local copy of the race the server announced. */
export function raceFromMatch(match) {
  const course = courseOrDefault(match.courseId);
  const entrants = [
    ...match.seats.map((seat) => ({ id: seat.seatId, pet: seat.pet })),
    ...match.cpus.map((seat) => ({ id: seat.seatId, pet: seat.pet, cpu: seat.level })),
  ];
  return { course, race: createRace({ track: course.track, entrants, countdownSeconds: 3, totalLaps: match.totalLaps ?? course.laps, seed: match.seed }) };
}

export function createOnlineRace({ match, clientId, now = () => performance.now() }) {
  const { course, race: initial } = raceFromMatch(match);
  let race = applyRaceSnapshot(initial, match.race);
  const mySeat = match.seats.find((seat) => seat.clientId === clientId) ?? null;
  const myId = mySeat?.seatId ?? null;
  const stream = createInputStream({ read: readRaceInput });
  const buffer = createSnapshotBuffer({ delayMs: 100 });
  const smoother = createErrorSmoother();
  let predicted = myId ? race.racers.find((racer) => racer.id === myId) : null;
  let latest = match;
  buffer.push(match.race, now());

  function reconcile() {
    if (!myId) return;
    const before = predicted;
    predicted = predictRacer(race, myId, stream.pendingInputs());
    if (before && predicted) smoother.correct(before, predicted, now());
  }

  return {
    course,
    myId,
    names: new Map(match.seats.map((seat) => [seat.seatId, seat.name])),
    get race() { return race; },
    get match() { return latest; },

    /** A snapshot from the server: the truth, then this pet's unacknowledged inputs on top. */
    applySnapshot(next) {
      if (!next?.race || next.race.tick < race.tick) return;
      latest = next;
      race = applyRaceSnapshot(race, next.race);
      buffer.push(next.race, now());
      stream.acknowledge(next.acks?.[clientId] ?? 0);
      reconcile();
    },

    /** One fixed tick of this person's keys: played locally now, sent in the next batch. */
    tick(controls, dt = 1 / 60) {
      if (!myId) return null;
      stream.record(controls);
      if (race.status === "racing" && predicted && predicted.finishedAt === null && !predicted.dnf) {
        predicted = advanceRacer(predicted, readRaceInput(controls), dt, race.track, race.brokenObstacles, race.totalLaps).racer;
      }
      return stream.takeBatch();
    },

    /** Where to draw each pet right now. */
    poses() {
      const poses = new Map();
      const sample = buffer.sample(now());
      if (sample) {
        const from = new Map(sample.from.racers.map((row) => [row[0], row]));
        for (const row of sample.to.racers) {
          const start = from.get(row[0]) ?? row;
          poses.set(row[0], {
            x: lerp(start[1], row[1], sample.amount),
            y: lerp(start[2], row[2], sample.amount),
            angle: lerpAngle(start[3], row[3], sample.amount),
            speed: lerp(start[4], row[4], sample.amount),
            jumpHeight: lerp(start[5], row[5], sample.amount),
          });
        }
      }
      if (predicted) {
        const offset = smoother.offset(now());
        poses.set(myId, { ...predicted, x: predicted.x + offset.x, y: predicted.y + offset.y });
      }
      return poses;
    },

    /** This person's pet as prediction has it (for the HUD and the camera). */
    get me() { return predicted; },
  };
}
