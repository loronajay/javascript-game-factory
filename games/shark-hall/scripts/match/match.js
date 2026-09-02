// The match: two seats, a rack, and whose turn it is.
//
// This is the cabinet's state machine and its only mutable centre. It owns the
// world, applies the rules to each finished shot, and announces what changed.
// It touches no DOM and imports no THREE, so the whole turn flow — break, foul,
// ball in hand, group assignment, the 8 — can be driven to completion under
// node in a loop.
//
// EVERYTHING ELSE SUBSCRIBES. `ui/` renders the state, `render/` mirrors the
// balls, `audio/` reacts to the events. None of them write to it except through
// the named actions below, which is what stopped the demo's `endShot()` from
// growing back: there is nowhere for a render concern to be added.
//
// THE TIMERS ARE INJECTED. The CPU thinks for a beat and the turn card holds the
// screen for a moment, and both are real product behaviour rather than an
// accident, so they live here — but the clock comes in through the constructor
// and a test passes a fake one.

import { CUE, EIGHT, cueBall, groupOf, remaining } from "../sim/balls.js";
import { DEFAULT_DIFFICULTY, difficultyById, planShot, strokeFor } from "../sim/cpu.js";
import { ZONE_ANYWHERE, ZONE_KITCHEN, ZONE_NONE, defaultSpotFor, findLegalCuePosition, isLegalCuePosition } from "../sim/placement.js";
import { resolveShot } from "../sim/rules.js";
import { clampContact } from "../sim/shot.js";
import { createWorld } from "../sim/world.js";

export const MODE_CPU = "cpu";
export const MODE_HOTSEAT = "hotseat";

/** Phases the match can be in. The UI enables controls off exactly this. */
export const PHASE_IDLE = "idle";
export const PHASE_PLACING = "placing";
export const PHASE_AIMING = "aiming";
export const PHASE_SHOOTING = "shooting";
export const PHASE_TURN_CARD = "turn-card";
export const PHASE_OVER = "over";

/** How long the turn card holds the screen before play resumes. */
const TURN_CARD_MS = 1240;

export function createMatch({
  mode = MODE_CPU,
  difficulty = DEFAULT_DIFFICULTY,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
} = {}) {
  const world = createWorld();
  const listeners = new Map();

  let state = freshState();
  let paused = true;
  let started = false;
  let pendingTimer = null;

  function freshState() {
    return {
      phase: PHASE_IDLE,
      shooter: 0,
      groups: [null, null],
      winner: null,
      isBreak: true,
      ballInHand: ZONE_NONE,
      /** The stroke being composed. Both the player and the CPU write it. */
      angle: 0,
      spinX: 0,
      spinY: 0,
      /** Last thing worth saying, for the event strip. */
      message: "Rack ready.",
      /** Populated while the turn card is up. */
      card: null,
    };
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  function on(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  }

  function emit(type, payload) {
    for (const listener of listeners.get(type) || []) listener(payload);
    // `change` is the catch-all the HUD redraws off, so a new event type never
    // has to remember to also poke the HUD.
    if (type !== "change") for (const listener of listeners.get("change") || []) listener({ type, payload });
  }

  function say(message) {
    state.message = message;
    emit("message", message);
  }

  // -----------------------------------------------------------------------
  // Who is who
  // -----------------------------------------------------------------------

  const isCpuSeat = (seat) => mode === MODE_CPU && seat === 1;
  const seatName = (seat) => (seat === 0 ? "Player 1" : mode === MODE_CPU ? "CPU" : "Player 2");

  /** Can a human act right now? The single source for every disabled button. */
  function humanCanAct() {
    return (
      started &&
      !paused &&
      !state.winner &&
      !world.moving &&
      state.phase !== PHASE_TURN_CARD &&
      !isCpuSeat(state.shooter)
    );
  }

  // -----------------------------------------------------------------------
  // Rack and match lifecycle
  // -----------------------------------------------------------------------

  function rack() {
    cancelPending();
    world.rack();
    const keptPhase = state.phase;
    state = freshState();
    state.phase = keptPhase === PHASE_IDLE ? PHASE_IDLE : PHASE_AIMING;
    emit("rack", world.balls);
    emit("change", { type: "rack" });
  }

  function start() {
    rack();
    started = true;
    paused = false;
    state.phase = PHASE_AIMING;
    showCard({ kicker: "Rack ready", reason: "Break shot" });
    emit("start", { mode, difficulty });
  }

  function pause() {
    if (!started || state.winner || paused) return;
    paused = true;
    cancelPending();
    emit("pause");
    emit("change", { type: "pause" });
  }

  function resume() {
    if (!started || paused === false) return;
    paused = false;
    emit("resume");
    emit("change", { type: "resume" });
    maybeStartCpuTurn();
  }

  function quit() {
    cancelPending();
    started = false;
    paused = true;
    world.rack();
    state = freshState();
    emit("quit");
    emit("change", { type: "quit" });
  }

  // -----------------------------------------------------------------------
  // Composing a stroke
  // -----------------------------------------------------------------------

  function setAngle(angle) {
    state.angle = angle;
    emit("aim", angle);
  }

  function nudgeAngle(delta) {
    setAngle(state.angle + delta);
  }

  /** Point the cue at a table position. Ignores a point on top of the cue ball. */
  function aimAt(x, z) {
    const cue = world.cue();
    if (!cue) return false;
    const dx = x - cue.x;
    const dz = z - cue.z;
    if (Math.hypot(dx, dz) < 0.06) return false;
    setAngle(Math.atan2(dz, dx));
    return true;
  }

  function setContact(spinX, spinY) {
    const contact = clampContact(spinX, spinY);
    state.spinX = contact.spinX;
    state.spinY = contact.spinY;
    emit("contact", contact);
  }

  // -----------------------------------------------------------------------
  // Ball in hand
  // -----------------------------------------------------------------------

  /**
   * Try to set the cue ball down at a point the player is dragging over.
   *
   * Returns whether it took. Placement is deliberately a two-step gesture —
   * drag, then release to confirm — so the same pointer interaction that aims
   * cannot also accidentally spot the ball somewhere the player did not mean.
   */
  function tryPlaceCue(x, z) {
    if (state.ballInHand === ZONE_NONE) return false;
    if (!isLegalCuePosition(world.balls, x, z, state.ballInHand)) return false;
    world.placeCue(x, z);
    emit("place", { x, z });
    return true;
  }

  /** Confirm the placement. This is what leaves ball-in-hand mode. */
  function confirmPlacement() {
    if (state.ballInHand === ZONE_NONE) return false;
    state.ballInHand = ZONE_NONE;
    state.phase = PHASE_AIMING;
    say("Cue ball placed · now aim the shot.");
    emit("change", { type: "placed" });
    return true;
  }

  function grantBallInHand(zone) {
    state.ballInHand = zone;
    state.phase = PHASE_PLACING;
    const spot = defaultSpotFor(zone);
    const legal = findLegalCuePosition(world.balls, spot.x, spot.z, zone);
    world.placeCue(legal.x, legal.z);
  }

  // -----------------------------------------------------------------------
  // Taking the shot
  // -----------------------------------------------------------------------

  function shoot(power) {
    // `started` and `paused` are checked here rather than only in the UI: the
    // CPU also calls this, and a stroke must be impossible on a table nobody is
    // playing at no matter who asked for it.
    if (!started || paused) return null;
    if (world.moving || state.winner || state.phase === PHASE_TURN_CARD) return null;
    if (state.ballInHand !== ZONE_NONE) return null;

    const cue = world.cue();
    if (!cue) return null;
    if (cue.pocketed) {
      const legal = findLegalCuePosition(world.balls, defaultSpotFor(ZONE_ANYWHERE).x, 0, ZONE_ANYWHERE);
      world.placeCue(legal.x, legal.z);
    }

    const shot = world.strike({ angle: state.angle, power, spinX: state.spinX, spinY: state.spinY });
    if (!shot) return null;

    state.phase = PHASE_SHOOTING;
    say("Shot in motion…");
    emit("shot", shot);
    emit("change", { type: "shot" });
    return shot;
  }

  /**
   * Advance the world by a frame.
   *
   * The ONE frame a shot settles on is where the rules run. Everything else this
   * does is hand the physics events out to whoever is listening.
   */
  function tick(dt) {
    if (paused && world.moving) return [];
    const { settled, events } = world.step(dt);
    for (const event of events) emit("physics", event);
    if (settled) settleShot();
    return events;
  }

  function settleShot() {
    const outcome = resolveShot(
      world.balls,
      { shooter: state.shooter, groups: state.groups, isBreak: state.isBreak },
      world.report,
    );

    emit("settled", outcome);

    if (outcome.rerack) {
      rack();
      state.phase = PHASE_AIMING;
      started = true;
      say("8 on the break · rerack.");
      showCard({ kicker: "Rerack", reason: "8-ball on the break" });
      return;
    }

    state.groups = outcome.groups;
    state.isBreak = false;
    state.spinX = 0;
    state.spinY = 0;

    if (outcome.winner !== null) {
      state.winner = outcome.winner;
      state.shooter = outcome.winner;
      state.ballInHand = ZONE_NONE;
      state.phase = PHASE_OVER;
      say(outcome.reason);
      emit("win", { seat: outcome.winner, name: seatName(outcome.winner), reason: outcome.reason });
      emit("change", { type: "win" });
      return;
    }

    state.shooter = outcome.nextShooter;

    // A scratched cue ball comes back on the table before anyone can place it.
    const cue = cueBall(world.balls);
    if (cue && cue.pocketed) cue.pocketed = false;

    if (outcome.foul) grantBallInHand(outcome.ballInHand);
    else {
      state.ballInHand = ZONE_NONE;
      state.phase = PHASE_AIMING;
    }

    say(outcome.reason);

    if (outcome.turnChanged) showCard(outcome);
    else {
      emit("change", { type: "settled" });
      maybeStartCpuTurn();
    }
  }

  // -----------------------------------------------------------------------
  // The turn card
  // -----------------------------------------------------------------------

  /**
   * Hold the screen for a beat between turns.
   *
   * This is a real phase rather than a piece of CSS, because everything must be
   * inert while it is up: a click landing during the handover would be a shot
   * taken by the wrong player.
   */
  function showCard({ kicker, reason }) {
    cancelPending();
    state.phase = PHASE_TURN_CARD;
    state.card = { kicker, reason, name: `${seatName(state.shooter)}'s turn`.toUpperCase() };
    emit("turn-card", state.card);
    emit("change", { type: "turn-card" });

    pendingTimer = setTimer(() => {
      pendingTimer = null;
      state.card = null;
      state.phase = state.ballInHand === ZONE_NONE ? PHASE_AIMING : PHASE_PLACING;
      emit("turn-card-done");
      emit("change", { type: "turn-card-done" });
      maybeStartCpuTurn();
    }, TURN_CARD_MS);
  }

  // -----------------------------------------------------------------------
  // The CPU's turn
  // -----------------------------------------------------------------------

  function maybeStartCpuTurn() {
    if (!started || paused || state.winner || world.moving) return;
    if (!isCpuSeat(state.shooter)) return;
    if (state.phase === PHASE_TURN_CARD) return;

    // The CPU takes its ball in hand at the default legal spot rather than
    // hunting for the best one. Deliberate: an opponent that always found the
    // perfect placement off every foul would make fouling unrecoverable.
    if (state.ballInHand !== ZONE_NONE) {
      const spot = defaultSpotFor(state.ballInHand);
      const legal = findLegalCuePosition(world.balls, spot.x, spot.z, state.ballInHand);
      world.placeCue(legal.x, legal.z);
      state.ballInHand = ZONE_NONE;
    }

    const rung = difficultyById(difficulty);
    say("CPU lining up…");
    emit("change", { type: "cpu-thinking" });

    cancelPending();
    pendingTimer = setTimer(() => {
      pendingTimer = null;
      if (!started || paused || state.winner || world.moving || !isCpuSeat(state.shooter)) return;

      const plan = planShot(world.balls, state.groups[state.shooter], rung);
      const stroke = strokeFor(plan, rung);
      if (!stroke) return;

      setAngle(stroke.angle);
      setContact(stroke.spinX, stroke.spinY);
      emit("cpu-aimed", { plan, stroke });

      pendingTimer = setTimer(() => {
        pendingTimer = null;
        shoot(stroke.power);
      }, rung.thinkMs);
    }, rung.thinkMs);
  }

  function cancelPending() {
    if (pendingTimer !== null) clearTimer(pendingTimer);
    pendingTimer = null;
  }

  // -----------------------------------------------------------------------
  // Read-only views
  // -----------------------------------------------------------------------

  /** Everything the HUD draws, in one snapshot. Never the live state object. */
  function snapshot() {
    const cue = world.cue();
    return {
      ...state,
      mode,
      difficulty,
      started,
      paused,
      moving: world.moving,
      humanCanAct: humanCanAct(),
      cuePocketed: Boolean(cue && cue.pocketed),
      seats: [0, 1].map((seat) => ({
        seat,
        name: seatName(seat),
        isCpu: isCpuSeat(seat),
        group: state.groups[seat],
        remaining: remaining(world.balls, state.groups[seat]),
        onTheEight: Boolean(state.groups[seat]) && remaining(world.balls, state.groups[seat]) === 0,
        active: state.shooter === seat,
      })),
      winnerName: state.winner === null ? null : seatName(state.winner),
    };
  }

  return {
    world,
    on,
    snapshot,
    seatName,
    humanCanAct,

    start,
    pause,
    resume,
    quit,
    rack() {
      rack();
      if (started) {
        paused = false;
        state.phase = PHASE_AIMING;
        showCard({ kicker: "Rack ready", reason: "Break shot" });
      }
    },

    setAngle,
    nudgeAngle,
    aimAt,
    setContact,

    tryPlaceCue,
    confirmPlacement,

    shoot,
    tick,

    setDifficulty(next) {
      difficulty = difficultyById(next).id;
    },

    get mode() {
      return mode;
    },
    get paused() {
      return paused;
    },
    get started() {
      return started;
    },
  };
}

/** Exported for the tests and for the HUD's "on the 8" copy. */
export { CUE, EIGHT, groupOf };
