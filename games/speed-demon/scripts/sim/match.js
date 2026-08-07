// Head-to-head match rules — pure.
//
// Currently owns one rule: what a red light costs in a side-by-side race.
//
//   Offline, a false start is a bog and the run still produces a time.
//   Online, it decides matches — but not on the first offence.
//
// Each player carries one grace fault. The first red light restarts the match
// and costs nothing else; the second from that same player loses it outright.
// The grace is per player, not per match, so one driver's mistake never spends
// the other driver's allowance.
//
// Online multiplayer itself is Milestone 4. This module exists ahead of it
// because the rule is decided and pure: encoding it here means it is proven by
// tests before any networking is written, and the eventual server can consume it
// as a reducer rather than reimplementing the policy in request handlers.

export const MATCH_LIVE = "live";
export const MATCH_RESTART = "restart";
export const MATCH_DECIDED = "decided";

export function createMatch({ playerIds, graceFaults = 1 }) {
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new Error("A head-to-head match needs exactly two players");
  }
  if (playerIds[0] === playerIds[1]) {
    throw new Error("A match needs two distinct players");
  }

  return {
    playerIds: [...playerIds],
    graceFaults,
    faults: { [playerIds[0]]: 0, [playerIds[1]]: 0 },
    status: MATCH_LIVE,
    winnerId: null,
    loserId: null,
    draw: false,
    restarts: 0,
  };
}

export function faultsFor(match, playerId) {
  return match.faults[playerId] ?? 0;
}

export function isDecided(match) {
  return match.status === MATCH_DECIDED;
}

/**
 * Records the outcome of one attempted start.
 *
 * `offenders` is every player who jumped the light on this start, each as
 * `{ playerId, jumpedBeforeGreen }` — seconds ahead of green, so a larger value
 * means they left earlier.
 *
 * Returns a new match. An empty offender list is a clean start and changes
 * nothing, so a caller can pipe every start through here unconditionally.
 */
export function recordFalseStarts(match, offenders) {
  if (isDecided(match) || !offenders || offenders.length === 0) {
    return { ...match };
  }

  for (const offender of offenders) {
    if (!match.playerIds.includes(offender.playerId)) {
      throw new Error(`"${offender.playerId}" is not in this match`);
    }
  }

  const faults = { ...match.faults };
  for (const offender of offenders) {
    faults[offender.playerId] += 1;
  }

  // A player is out once their fault count exceeds the grace allowance.
  const eliminated = offenders.filter((offender) => faults[offender.playerId] > match.graceFaults);

  if (eliminated.length === 0) {
    return { ...match, faults, status: MATCH_RESTART, restarts: match.restarts + 1 };
  }

  if (eliminated.length === 1) {
    const loserId = eliminated[0].playerId;
    return {
      ...match,
      faults,
      status: MATCH_DECIDED,
      loserId,
      winnerId: match.playerIds.find((id) => id !== loserId) ?? null,
      draw: false,
    };
  }

  // Both out on the same start: the car that left first takes the red light,
  // which is the drag-strip convention.
  const earliest = Math.max(...eliminated.map((offender) => offender.jumpedBeforeGreen));
  const first = eliminated.filter((offender) => offender.jumpedBeforeGreen === earliest);

  if (first.length > 1) {
    return { ...match, faults, status: MATCH_DECIDED, loserId: null, winnerId: null, draw: true };
  }

  const loserId = first[0].playerId;
  return {
    ...match,
    faults,
    status: MATCH_DECIDED,
    loserId,
    winnerId: match.playerIds.find((id) => id !== loserId) ?? null,
    draw: false,
  };
}
