// The other car.
//
// PURE. Given the inputs the opponent has sent so far, this runs *the same sim*
// the driver's own car runs and produces a race state to draw. No interpolation,
// no snapshots, no position corrections — the opponent's car is not being
// approximated, it is being simulated, from the same deterministic reducer on
// the same inputs. Two machines running identical code on identical inputs
// arrive at identical state, which is what "completely synced" actually means
// here.
//
// ## Why this works, and why it would not in most games
//
// The two cars are in two lanes and never touch. Nothing either driver does
// changes the other's car, so each side can run the other's simulation
// independently and neither has to wait for the other. That is what buys the
// zero input delay the shift timing depends on — a lockstep model would make
// every one of *your* inputs wait for a packet, which in a game decided in
// hundredths is the whole game.
//
// ## The gap, and why extrapolation is nearly always right
//
// Inputs arrive late by however long the network takes, so the opponent's log
// always trails the local tick. Rather than drawing them lagging behind, the
// reconstruction is advanced to the current tick with the **last known throttle
// held** — which is the correct guess almost all of the time, because a drag car
// is at full throttle for all but the few ticks either side of a shift. When the
// real inputs land, the run is rebuilt from the start of the round: it is a few
// hundred ticks of a pure function, and it is exact, where a positional
// correction would visibly snap.

import { TICK_SECONDS } from "../sim/constants.js";
import { createRace, stepRace, FINISHED } from "../sim/race.js";
import { createInputLog, mergeEvents, replayRun, throttleAt } from "../sim/input-log.js";

export function createOpponent(options) {
  return {
    options,
    log: createInputLog(),
    // The reconstruction, and the tick it has been advanced to. Rebuilt whenever
    // new inputs arrive, because a replay is cheap and exact.
    race: createRace(options),
    tick: 0,
    // The last tick an input was actually received for. Everything past it is
    // the held-throttle guess described above.
    confirmedTick: 0,
  };
}

/**
 * Folds in inputs that have arrived, and rebuilds the reconstruction from the
 * start of the round.
 *
 * Rebuilding rather than patching is deliberate. A late gate move changes what
 * every subsequent tick should have been, so there is no correct way to apply it
 * to a state that has already run past it — and the alternative, drawing the
 * opponent several ticks behind so inputs are always in hand, puts a car length
 * of error into the one thing a drag race is about.
 */
export function receiveInputs(opponent, events) {
  const log = mergeEvents(opponent.log, events);
  if (log === opponent.log) {
    return opponent;
  }
  const confirmedTick = log.events.reduce((last, event) => Math.max(last, event.t), 0);
  return advanceTo({ ...opponent, log, confirmedTick, race: null, tick: 0 }, opponent.tick);
}

/**
 * Runs the reconstruction forward to `tick`, holding the last known throttle
 * past the end of the log.
 *
 * `race: null` on the way in means "rebuild from scratch", which is what
 * `receiveInputs` asks for.
 */
export function advanceTo(opponent, tick) {
  const target = Math.max(0, Math.trunc(tick));

  // Everything the log actually covers, replayed exactly.
  const replayed = replayRun(opponent.options, opponent.log, { maxTicks: target });
  let race = replayed.race;
  let reached = Math.min(target, replayed.ticks - 1);

  // Then the guess: past the last input, the throttle is assumed to be where it
  // was left. Nothing else is assumed — no gate moves, no clutch — because those
  // are events and inventing one would put the other car in a gear it is not in.
  const held = throttleAt(opponent.log, opponent.confirmedTick);
  while (reached < target && race.phase !== FINISHED) {
    race = stepRace(race, { throttle: held }, TICK_SECONDS);
    reached += 1;
  }

  return { ...opponent, race, tick: target };
}

/**
 * How far ahead of the confirmed inputs the drawing currently is, in seconds.
 * Worth surfacing while tuning: a persistently large figure means the stream is
 * not keeping up, and the car on screen is mostly guesswork.
 */
export function extrapolatedSeconds(opponent) {
  return Math.max(0, opponent.tick - opponent.confirmedTick) * TICK_SECONDS;
}

/** Where to draw the other car, relative to this one, in metres. */
export function gapMetres(opponent, myRace) {
  return opponent.race.vehicle.distance - myRace.vehicle.distance;
}
