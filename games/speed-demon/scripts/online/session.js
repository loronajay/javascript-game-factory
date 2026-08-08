// The online session: what state an online match is in, as a pure reducer.
//
// PURE. No socket, no canvas, no clock read — every function takes the session
// and something that happened and returns a new session. `online/net.js` owns
// the WebSocket and does nothing but turn frames into calls on this, which is
// what lets the whole lifecycle be tested without a network. Same split as
// `radio/playlist.js` against `radio/stereo.js`, and for the same reason.
//
// ## The one clock rule
//
// A drag race is decided in hundredths, so the two trees have to go green at the
// same instant. The server sends `serverNow` alongside `startAt`; the difference
// between `serverNow` and the local clock at the moment the frame arrives is the
// offset, and every later deadline is expressed through it. **Never compare
// `startAt` against `Date.now()` directly** — two machines whose clocks differ by
// a second would then run trees a second apart, and every reaction time in the
// match would be meaningless.
//
// ## What this deliberately does not own
//
// The race itself. `init-game.js` holds two `race` objects — the driver's and a
// reconstruction of the opponent's — and this module only says when to build
// them and when they matter. Keeping the sim out of here is what stops the
// online path becoming a second, subtly different copy of the driving.

export const STATUS_IDLE = "idle";
export const STATUS_CONNECTING = "connecting";
export const STATUS_SEARCHING = "searching";
export const STATUS_LOBBY = "lobby";
export const STATUS_COUNTDOWN = "countdown";
export const STATUS_RACING = "racing";
export const STATUS_ROUND_RESULT = "round-result";
export const STATUS_MATCH_RESULT = "match-result";
export const STATUS_ERROR = "error";

/** Statuses in which a race is on screen, whether or not it is moving yet. */
const ON_TRACK = new Set([STATUS_COUNTDOWN, STATUS_RACING, STATUS_ROUND_RESULT, STATUS_MATCH_RESULT]);

export function showsTheStrip(session) {
  return ON_TRACK.has(session.status);
}

export function createSession() {
  return {
    status: STATUS_IDLE,
    // Room
    roomCode: null,
    isPrivate: false,
    isHost: false,
    youPlayerId: null,
    players: [],
    config: null,
    // Match
    score: null,
    round: 0,
    attempt: 0,
    // The green, in *local* time, derived through the server offset below.
    startAtLocal: null,
    clockOffset: 0,
    // Results
    roundResult: null,
    matchResult: null,
    rematch: { requested: [], asked: false },
    error: null,
    // Set while a round is live so the driver's inputs are streamed under the
    // right round number; a late packet for a finished round is discarded by the
    // server rather than misapplied.
    liveRound: null,
  };
}

// ---------------------------------------------------------------------------
// Connection and search
// ---------------------------------------------------------------------------

export function connecting(session) {
  return { ...session, status: STATUS_CONNECTING, error: null };
}

export function searching(session) {
  return { ...session, status: STATUS_SEARCHING, error: null, roomCode: null };
}

export function searchCancelled(session) {
  return { ...session, status: STATUS_IDLE };
}

export function failed(session, message) {
  return { ...session, status: STATUS_ERROR, error: message ?? "Something went wrong" };
}

/** Back to the start, keeping nothing. A left match must not haunt the next one. */
export function leftSession(session) {
  return { ...createSession(), clockOffset: session.clockOffset };
}

// ---------------------------------------------------------------------------
// The lobby
// ---------------------------------------------------------------------------

/**
 * The room as the server sees it. This is the only place `players`, `config` and
 * the host flag are set, so there is one description of the room rather than
 * several that can disagree.
 */
export function applyLobby(session, message) {
  const players = Array.isArray(message?.players) ? message.players : [];
  const fresh = message?.score === null;
  return {
    ...session,
    status: lobbyStatus(session.status, fresh),
    roomCode: message?.roomCode ?? session.roomCode,
    isPrivate: !!message?.private,
    isHost: !!message?.youAreHost,
    youPlayerId: message?.yourPlayerId ?? session.youPlayerId,
    players,
    config: message?.config ?? session.config,
    score: message?.score ?? null,
    roundResult: message?.score === null ? null : session.roundResult,
    matchResult: message?.score === null ? null : session.matchResult,
    rematch: message?.score === null ? { requested: [], asked: false } : session.rematch,
    error: null,
  };
}

/**
 * Where a lobby frame leaves the screen.
 *
 * A lobby frame arrives at three different moments and only two of them move the
 * screen. Getting into a room does; a rematch clearing the board does (the
 * server sends a null score, which is what `fresh` means); but a frame arriving
 * *mid-round* — because the opponent changed their paint, say — must leave the
 * driver exactly where they are rather than yanking them out of a live tree.
 */
const ARRIVING = new Set([STATUS_IDLE, STATUS_SEARCHING, STATUS_CONNECTING]);

function lobbyStatus(status, fresh) {
  if (ARRIVING.has(status)) return STATUS_LOBBY;
  if (fresh && status === STATUS_MATCH_RESULT) return STATUS_LOBBY;
  return status;
}

/** True once there are two cars in the room and a race can actually be started. */
export function lobbyIsFull(session) {
  return session.players.length === 2;
}

export function you(session) {
  return session.players.find((player) => player.playerId === session.youPlayerId) ?? null;
}

export function opponent(session) {
  return session.players.find((player) => player.playerId !== session.youPlayerId) ?? null;
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/**
 * A round is starting. `localNow` is the caller's clock at the moment the frame
 * arrived; the offset between it and the server's is what every deadline is then
 * measured through.
 *
 * The offset is recomputed on every round rather than once at connect, because a
 * long match gives a drifting clock time to matter and a round start is a free
 * opportunity to re-measure.
 */
export function applyRoundStart(session, message, localNow) {
  const clockOffset = localNow - (message?.serverNow ?? localNow);
  return {
    ...session,
    status: STATUS_COUNTDOWN,
    round: message?.round ?? 0,
    attempt: message?.attempt ?? 1,
    liveRound: { round: message?.round ?? 0, attempt: message?.attempt ?? 1 },
    clockOffset,
    startAtLocal: (message?.startAt ?? localNow) + clockOffset,
    config: message?.config ?? session.config,
    score: message?.score ?? session.score,
    roundResult: null,
    error: null,
  };
}

/** How long until the tree is released, in seconds. Negative once it has been. */
export function secondsUntilGreen(session, localNow) {
  if (session.startAtLocal === null) return Infinity;
  return (session.startAtLocal - localNow) / 1000;
}

/** True the instant the shared start time has arrived on this machine. */
export function readyToLaunch(session, localNow) {
  return session.status === STATUS_COUNTDOWN && secondsUntilGreen(session, localNow) <= 0;
}

export function racing(session) {
  return { ...session, status: STATUS_RACING };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * The server's verdict on a round. Everything in here was computed by replaying
 * both input logs server-side — none of it is anything either client said about
 * itself, which is the whole reason the round is decided there and not here.
 */
export function applyRoundResult(session, message) {
  const decided = !!message?.decided;
  return {
    ...session,
    status: decided ? STATUS_MATCH_RESULT : STATUS_ROUND_RESULT,
    liveRound: null,
    score: message?.score ?? session.score,
    roundResult: {
      round: message?.round ?? session.round,
      attempt: message?.attempt ?? session.attempt,
      outcome: message?.outcome ?? null,
      redLight: !!message?.redLight,
      offenders: message?.offenders ?? [],
      runs: message?.runs ?? [],
    },
    matchResult: decided
      ? {
          winnerId: message?.winnerId ?? null,
          loserId: message?.loserId ?? null,
          history: message?.history ?? [],
          forfeit: false,
        }
      : session.matchResult,
  };
}

/** The opponent left. The match is over and this side is told it won. */
export function applyForfeit(session, message) {
  return {
    ...session,
    status: STATUS_MATCH_RESULT,
    liveRound: null,
    matchResult: {
      winnerId: message?.winnerId ?? null,
      loserId: message?.loserId ?? null,
      history: session.matchResult?.history ?? [],
      forfeit: true,
    },
  };
}

export function applyRematch(session, message) {
  return {
    ...session,
    rematch: {
      requested: message?.requested ?? [],
      asked: (message?.requested ?? []).some(
        (entry) => entry.playerId === session.youPlayerId && entry.requested,
      ),
    },
  };
}

/** Did this side win? `null` while there is nothing to say. */
export function youWon(session) {
  if (!session.matchResult) return null;
  return session.matchResult.winnerId === session.youPlayerId;
}

/**
 * The round result, shaped for the panel: this side first, then the opponent, so
 * a renderer never has to work out which row is whose.
 */
export function roundRows(session) {
  const runs = session.roundResult?.runs ?? [];
  const mine = runs.find((run) => run.playerId === session.youPlayerId) ?? null;
  const theirs = runs.find((run) => run.playerId !== session.youPlayerId) ?? null;
  return [
    { ...mine, you: true, label: "YOU" },
    { ...theirs, you: false, label: theirs?.displayName ?? "OPPONENT" },
  ].filter((row) => row.playerId);
}

/**
 * What the round result screen should say happened, in one line.
 *
 * A red light is called out explicitly rather than being reported as a time,
 * because "you jumped the light" and "you were slower" are different things to
 * have done and the panel should not make the driver work out which.
 */
export function roundHeadline(session) {
  const result = session.roundResult;
  if (!result) return "";
  if (result.redLight) {
    const jumped = result.offenders.some((offender) => offender.playerId === session.youPlayerId);
    const both = result.offenders.length > 1;
    if (both) return "BOTH RED-LIGHTED";
    return jumped ? "RED LIGHT — YOU JUMPED" : "RED LIGHT — OPPONENT JUMPED";
  }
  if (result.outcome?.kind === "round-restart") return "DEAD HEAT — RUN IT BACK";
  const winnerId = result.outcome?.winnerId;
  if (!winnerId) return "";
  return winnerId === session.youPlayerId ? "ROUND WON" : "ROUND LOST";
}

/** The one-line reason a round is being re-run, or null when it is not. */
export function restartNote(session) {
  const result = session.roundResult;
  if (!result || result.outcome?.kind !== "round-restart") return null;
  return result.redLight
    ? "First red light is a fault. Jump it again this round and you forfeit."
    : "Nobody could be separated. The round runs again.";
}
