// An online match, shaped exactly like a local one.
//
// This is the whole trick of the cabinet's online mode: it exposes the same
// surface `match/match.js` does — the same events, the same snapshot, the same
// `tick(dt)` — so `init-game.js` wires it up with the line it already had, and
// the HUD, the renderer, the audio and the controls do not learn that a second
// kind of match exists. There is one `live` match at a time and it may be either.
//
// WHAT IS DIFFERENT IS WHERE THE ANSWER COMES FROM. Locally, `match.js` runs the
// world and then asks `sim/rules.js` what the shot meant. Here the world is run
// only to DRAW it: the shot was already played, in full, on the server, and the
// state that arrives with it is the truth. Nothing in this file resolves a rule.
//
// THE SEQUENCE IS: server plays it → this replays the identical stroke from the
// identical table to animate it → the animation settles → the authoritative
// state is applied. Both players see the same balls roll because the simulation
// is deterministic and both are handed the same table to start from. If a client
// had drifted, the `ballsBefore` it is given corrects it before the stroke,
// which is why the correction is invisible rather than a snap.
//
// No THREE, no DOM. The world it drives is the cabinet's own pure one.

import { cloneBalls, remaining } from "../sim/balls.js";
import { ZONE_NONE, isLegalCuePosition } from "../sim/placement.js";
import { clampContact } from "../sim/shot.js";
import { createWorld } from "../sim/world.js";
import {
  PHASE_AIMING,
  PHASE_OVER,
  PHASE_PLACING,
  PHASE_SHOOTING,
  PHASE_TURN_CARD,
} from "../match/match.js";

export const MODE_ONLINE = "online";

/** How long the turn card holds the screen. The same beat the local match uses. */
const TURN_CARD_MS = 1240;

export function createOnlineMatch({
  client,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
} = {}) {
  const world = createWorld();
  const listeners = new Map();
  const unsubscribe = [];

  /** The authoritative table, as last applied. Never written to except by `apply`. */
  let state = null;
  /** The state a shot produced, held back until its animation reaches the same place. */
  let pending = null;
  let started = false;
  let card = null;
  let cardTimer = null;
  let awaiting = false;
  let placement = null;
  let angle = 0;
  let spinX = 0;
  let spinY = 0;
  let message = "Waiting for the table…";
  let connection = { status: "idle", roomCode: "", error: null };

  // -----------------------------------------------------------------------
  // Events — the same names the local match emits
  // -----------------------------------------------------------------------

  function on(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  }

  function emit(type, payload) {
    for (const listener of listeners.get(type) || []) listener(payload);
    if (type !== "change") for (const listener of listeners.get("change") || []) listener({ type, payload });
  }

  function say(text) {
    message = text;
    emit("message", text);
  }

  // -----------------------------------------------------------------------
  // Who am I
  // -----------------------------------------------------------------------

  const mySeat = () => {
    const id = client?.getSnapshot?.().clientId;
    const index = state?.seats?.findIndex((seat) => seat.clientId === id);
    return index === undefined || index < 0 ? -1 : index;
  };

  const seatName = (seat) => state?.seats?.[seat]?.name || `Player ${seat + 1}`;
  const isMyTurn = () => state !== null && mySeat() === state.shooter;

  function humanCanAct() {
    if (!started || !state || world.moving || card || awaiting) return false;
    if (state.phase !== "aiming") return false;
    return isMyTurn();
  }

  // -----------------------------------------------------------------------
  // Applying the server's word
  // -----------------------------------------------------------------------

  /**
   * Take an authoritative state.
   *
   * `snapTable` is false only while a shot is being animated: the balls are
   * already arriving at these positions on their own, and overwriting them
   * mid-roll would teleport them. Everything else — the score, whose turn it is,
   * whether the match is over — is applied either way.
   */
  function apply(next, { snapTable = true } = {}) {
    if (!next) return;
    const previous = state;
    state = next;

    if (snapTable) {
      world.load(next.balls);
      placement = null;
      emit("rack", world.balls);
    }

    if (next.phase === "complete" && previous?.phase !== "complete") {
      say(next.message);
      const winner = next.matchWinner;
      emit("win", {
        seat: winner,
        name: next.matchWinnerName || seatName(winner),
        reason: next.message,
      });
      emit("change", { type: "win" });
      return;
    }

    // Compared against what the strip is CURRENTLY saying, not against the
    // previous state's message. Replaying a shot writes its own line ("Bo
    // shoots…"), so a state whose message happens to repeat the one before it —
    // two "No legal ball made" in a row is ordinary — would otherwise be
    // suppressed and leave the strip stuck on the replay line.
    if (next.message && next.message !== message) say(next.message);
    emit("change", { type: "state" });
  }

  /** Hold the screen between turns, exactly as the local match does. */
  function showCard(kicker, reason) {
    if (cardTimer !== null) clearTimer(cardTimer);
    card = { kicker, reason, name: `${seatName(state.shooter)}'s turn`.toUpperCase() };
    emit("turn-card", card);
    emit("change", { type: "turn-card" });
    cardTimer = setTimer(() => {
      cardTimer = null;
      card = null;
      emit("turn-card-done");
      emit("change", { type: "turn-card-done" });
    }, TURN_CARD_MS);
  }

  // -----------------------------------------------------------------------
  // A shot, arriving
  // -----------------------------------------------------------------------

  function replay(played) {
    if (!played?.stroke || !Array.isArray(played.ballsBefore)) return;
    awaiting = false;
    // The table the server struck, not the table this browser thought it had.
    // A client that had drifted is corrected here, before the balls move, so the
    // correction is never visible as a jump.
    world.load(played.ballsBefore);
    emit("rack", world.balls);

    const shot = world.strike(played.stroke);
    pending = { match: played.match, outcome: played.outcome, seat: played.seat };
    angle = played.stroke.angle;
    spinX = played.stroke.spinX;
    spinY = played.stroke.spinY;
    say(played.seat === mySeat() ? "Your shot is away…" : `${seatName(played.seat)} shoots…`);
    emit("shot", shot);
    emit("change", { type: "shot" });
  }

  function settle() {
    const finished = pending;
    pending = null;
    if (!finished) return;

    emit("settled", finished.outcome);
    apply(finished.match, { snapTable: true });

    if (state?.phase === "complete") return;
    if (finished.outcome?.turnChanged) showCard(finished.outcome.kicker, finished.outcome.reason);
    else emit("change", { type: "settled" });
  }

  // -----------------------------------------------------------------------
  // The socket
  // -----------------------------------------------------------------------

  unsubscribe.push(client.onShot((played) => replay(played)));
  unsubscribe.push(
    client.subscribe((snapshot) => {
      connection = {
        status: snapshot.status,
        roomCode: snapshot.lobby?.roomCode || connection.roomCode,
        error: snapshot.error || null,
      };
      // A state that arrives while the balls are rolling is held: the shot that
      // produced it is still being drawn, and `settle` applies it at the moment
      // the drawing catches up. Only states arriving at rest are applied now.
      if (snapshot.matchState && !world.moving && !pending) apply(snapshot.matchState);
      emit("change", { type: "connection" });
    }),
  );

  // -----------------------------------------------------------------------
  // The interface `init-game.js` already knows
  // -----------------------------------------------------------------------

  function setAngle(next) {
    angle = next;
    emit("aim", next);
  }

  function setContact(x, y) {
    const contact = clampContact(x, y);
    spinX = contact.spinX;
    spinY = contact.spinY;
    emit("contact", contact);
  }

  function shoot(power) {
    if (!humanCanAct()) return null;
    awaiting = true;
    client.submitShot({
      seq: state.shotSeq,
      angle,
      power,
      spinX,
      spinY,
      ...(placement ? { place: placement } : {}),
    });
    say("Shot sent · waiting for the table…");
    emit("change", { type: "shot-sent" });
    // Deliberately null: nothing has happened yet. The stroke comes back from
    // the server as a played shot, and that is the only thing that moves a ball.
    return null;
  }

  return {
    world,
    on,
    seatName,
    humanCanAct,

    start() {
      started = true;
      const current = client.getSnapshot().matchState;
      if (current) apply(current);
      emit("start", { mode: MODE_ONLINE });
    },

    /** Online has no pause: the opponent is a person and the table is theirs too. */
    pause() {
      emit("change", { type: "pause" });
    },
    resume() {
      emit("change", { type: "resume" });
    },

    quit() {
      started = false;
      if (cardTimer !== null) clearTimer(cardTimer);
      cardTimer = null;
      card = null;
      for (const off of unsubscribe) off();
      unsubscribe.length = 0;
      client.leave();
      emit("quit");
      emit("change", { type: "quit" });
    },

    /** The "run it back" path. There is no restarting a rack somebody else is in. */
    rack() {
      client.requestRematch();
      say("Rematch offered · waiting for your opponent.");
      emit("change", { type: "rematch" });
    },

    setAngle,
    nudgeAngle: (delta) => setAngle(angle + delta),

    aimAt(x, z) {
      const cue = world.cue();
      if (!cue) return false;
      const dx = x - cue.x;
      const dz = z - cue.z;
      if (Math.hypot(dx, dz) < 0.06) return false;
      setAngle(Math.atan2(dz, dx));
      return true;
    },

    setContact,

    tryPlaceCue(x, z) {
      if (!state || state.ballInHand === ZONE_NONE || !isMyTurn()) return false;
      if (!isLegalCuePosition(world.balls, x, z, state.ballInHand)) return false;
      world.placeCue(x, z);
      emit("place", { x, z });
      return true;
    },

    /**
     * Confirm a placement.
     *
     * It is remembered rather than sent. Until the ball is struck nothing has
     * happened that an opponent needs to see, and sending it separately would
     * open a window where the two halves of one turn could arrive apart.
     */
    confirmPlacement() {
      if (!state || state.ballInHand === ZONE_NONE || !isMyTurn()) return false;
      const cue = world.cue();
      if (!cue) return false;
      placement = { x: cue.x, z: cue.z };
      say("Cue ball placed · now aim the shot.");
      emit("change", { type: "placed" });
      return true;
    },

    shoot,

    tick(dt) {
      const { settled, events } = world.step(dt);
      for (const event of events) emit("physics", event);
      if (settled) settle();
      return events;
    },

    /** Nothing to set: the opponent is a person. Kept so the interfaces match. */
    setDifficulty() {},

    snapshot() {
      const cue = world.cue();
      const seat = mySeat();
      const phase = !state
        ? PHASE_AIMING
        : world.moving
          ? PHASE_SHOOTING
          : card
            ? PHASE_TURN_CARD
            : state.phase === "complete"
              ? PHASE_OVER
              : state.ballInHand !== ZONE_NONE && isMyTurn()
                ? PHASE_PLACING
                : PHASE_AIMING;

      return {
        phase,
        shooter: state?.shooter ?? 0,
        groups: state?.groups || [null, null],
        winner: state?.matchWinner ?? null,
        isBreak: Boolean(state?.isBreak),
        // Only the player holding the ball is placing one. The opponent sees a
        // table, not a banner telling them to drag something they cannot touch.
        ballInHand: state && isMyTurn() ? state.ballInHand : ZONE_NONE,
        angle,
        spinX,
        spinY,
        message,
        card,
        mode: MODE_ONLINE,
        difficulty: null,
        started,
        paused: false,
        moving: world.moving,
        humanCanAct: humanCanAct(),
        cuePocketed: Boolean(cue && cue.pocketed),
        raceTo: state?.raceTo ?? 1,
        rackNumber: state?.rackNumber ?? 1,
        mySeat: seat,
        online: connection,
        seats: [0, 1].map((index) => {
          const entry = state?.seats?.[index];
          const group = state?.groups?.[index] ?? null;
          return {
            seat: index,
            name: entry?.name || `Player ${index + 1}`,
            isCpu: false,
            you: index === seat,
            connected: entry ? entry.connected !== false : true,
            wins: entry?.wins ?? 0,
            group,
            remaining: entry?.remaining ?? remaining(world.balls, group),
            onTheEight: Boolean(group) && (entry?.remaining ?? remaining(world.balls, group)) === 0,
            active: state?.shooter === index,
          };
        }),
        winnerName: state?.matchWinner === null || state?.matchWinner === undefined
          ? null
          : state.matchWinnerName || seatName(state.matchWinner),
      };
    },

    /** The authoritative table, for anything that wants to read it without the world. */
    get authoritativeBalls() {
      return state ? cloneBalls(state.balls) : [];
    },
    get mode() {
      return MODE_ONLINE;
    },
    get paused() {
      return false;
    },
    get started() {
      return started;
    },
  };
}
