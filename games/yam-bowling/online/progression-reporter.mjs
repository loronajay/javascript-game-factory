// The progression half of a finished online match.
//
// It rides the rating report rather than owning a call of its own: one request,
// one session id, one thing for a dropped connection to lose. So this module
// does not talk to the network at all. It builds the block the report carries,
// keeps the local cache honest around it, and describes the result in words —
// `online-session.mjs` owns the single call site.
//
// The rule it exists to protect: THE CLIENT NEVER NAMES AN XP AMOUNT. The block
// says what was played (mode, bowler, strikes); the server's catalog decides
// what that is worth. `progression-core` computes a grant locally only so the
// queue can describe what is pending — that number is never sent and never
// banked.

import { applyProgressionDocument } from "../state/progression-snapshot.mjs";

const GAME_SLUG = "yam-bowling";

function safePins(value) {
  const pins = Math.floor(Number(value));
  return Number.isFinite(pins) ? Math.max(0, Math.min(10, pins)) : null;
}

// Produces the additive counters a server needs to calculate averages and
// conversion rates without ever averaging an average. Quick and Classic keep
// separate game/score denominators because a three-frame 87 and a ten-frame 87
// are not comparable games. The final frame is walked explicitly: bonus balls
// may begin on a fresh rack, while a 0-then-10 spare must never masquerade as a
// strike merely because one roll knocked down ten pins.
export function summarizeBowlingStats(player, modeId) {
  const frames = Array.isArray(player?.frames) ? player.frames : [];
  let strikeOpportunities = 0;
  let strikes = 0;
  let spareOpportunities = 0;
  let spares = 0;

  frames.forEach((rawFrame, frameIndex) => {
    const frame = Array.isArray(rawFrame) ? rawFrame.map(safePins) : [];
    const first = frame[0];
    if (first === null || first === undefined) return;
    const final = frameIndex === frames.length - 1;

    strikeOpportunities += 1;
    if (first === 10) strikes += 1;

    if (!final) {
      if (first < 10) {
        spareOpportunities += 1;
        if (frame[1] !== null && frame[1] !== undefined && first + frame[1] === 10) spares += 1;
      }
      return;
    }

    const second = frame[1];
    const third = frame[2];
    if (first < 10) {
      spareOpportunities += 1;
      if (second !== null && second !== undefined && first + second === 10) {
        spares += 1;
        if (third !== null && third !== undefined) {
          strikeOpportunities += 1;
          if (third === 10) strikes += 1;
        }
      }
      return;
    }

    if (second === null || second === undefined) return;
    strikeOpportunities += 1;
    if (second === 10) {
      strikes += 1;
      if (third !== null && third !== undefined) {
        strikeOpportunities += 1;
        if (third === 10) strikes += 1;
      }
    } else {
      spareOpportunities += 1;
      if (third !== null && third !== undefined && second + third === 10) spares += 1;
    }
  });

  const score = Math.max(0, Math.floor(Number(player?.score?.total)) || 0);
  const stats = { strikes, highGame: score };
  if (modeId !== "quick" && modeId !== "classic") return stats;
  return {
    ...stats,
    [`${modeId}Games`]: 1,
    [`${modeId}TotalScore`]: score,
    [`${modeId}HighGame`]: score,
    [`${modeId}StrikeOpportunities`]: strikeOpportunities,
    [`${modeId}Strikes`]: strikes,
    [`${modeId}SpareOpportunities`]: spareOpportunities,
    [`${modeId}Spares`]: spares,
  };
}

// A disconnect forfeit is the server's ruling, carried on the snapshot. The
// player who walked earns nothing; the one left standing gets their own reward,
// which is not an ordinary win.
function forfeitRoleFor(snapshotResult, clientId) {
  if (snapshotResult?.reason !== "disconnect") return null;
  return snapshotResult.loserClientId === clientId ? "leaver" : "remaining";
}

export function createProgressionReporter({ progressionCore, store, platformApi, onSnapshotApplied = () => {} }) {
  let lastSnapshot = null;
  let lastGrant = null;

  // Builds the report block and queues the grant. Queuing deliberately does not
  // move a balance — only the server's snapshot does that.
  //
  // `opponentPlayerId` and `outcome` belong to the rating half of the same
  // request. They are taken here so the whole request can be queued beside the
  // grant: a request that never reached the server is otherwise known to be
  // outstanding but impossible to file again.
  // `ranked` belongs to the rating half too, and is stored with the rest of the
  // request for the same reason: a replay months later must file the match at the
  // stakes it was bowled at, and the snapshot that knew them is long gone.
  function prepare({ match, clientId, sessionId, snapshotResult, opponentPlayerId = null, outcome = null, ranked = false }) {
    const me = match?.players?.find((player) => player.id === clientId);
    if (!me || !sessionId) return null;
    const stats = summarizeBowlingStats(me, match.modeId);

    const grant = progressionCore.computeMatchGrant({
      grantId: sessionId,
      playType: match.playType,
      modeId: match.modeId,
      characterSlug: me.characterSlug,
      terminal: match.status === "complete",
      outcome: match.winnerIds.length > 1 ? "draw"
        : match.winnerIds.includes(me.id) ? "win" : "loss",
      strikes: stats.strikes,
      forfeitRole: forfeitRoleFor(snapshotResult, clientId),
    });

    lastGrant = grant;
    if (!grant.eligible) return { grant, block: null, request: null };

    const block = {
      trackId: me.characterSlug,
      modeId: match.modeId,
      // The countable stat the capped bonus rides on. Named for what it is
      // rather than for what it pays, because the payout is the server's.
      performance: stats.strikes,
      forfeitRole: grant.breakdown.forfeit > 0 ? "remaining" : null,
      stats,
    };
    // Only a complete request is worth queuing. Half of one would have to be
    // guessed at on replay, and a guessed rating report is a wrong record.
    const request = opponentPlayerId && outcome
      ? { opponentPlayerId, outcome, sessionId, ranked: ranked === true, progression: block }
      : null;
    store.recordPending(grant, request);

    return { grant, block, request };
  }

  // The results a request never reached the server with. They stay queued and
  // invisible until something asks; `online-session.mjs` asks on the next boot
  // and after the next match, and sends them through the one call site it owns.
  // Replaying is safe rather than double-paying because the server dedups on the
  // same session id the grant is keyed by — which is also why a stored request
  // is handed back verbatim rather than rebuilt from a match that is long gone.
  function listUnsentRequests() {
    return store.listPending()
      .filter((entry) => entry.report)
      .map((entry) => ({ grantId: entry.grantId, request: entry.report }));
  }

  // A replayed request the server accepted. Same ruling as `settle`, reached
  // without a grant object, because the match it came from ended sessions ago.
  function settleSent(grantId) {
    return store.resolvePending(grantId);
  }

  // Accepted or refused, a grant the server RULED on leaves the queue. A network
  // failure is not a ruling, so it stays pending and is settled by the next
  // successful sync instead of being retried into a loop.
  function settle({ grant, accepted }) {
    if (!grant?.eligible || !accepted) return;
    store.resolvePending(grant.grantId);
  }

  // The authoritative balance. This is the only thing that moves a number.
  async function sync(playerId) {
    if (!playerId) return null;
    const document = await platformApi.getGameProgression(GAME_SLUG, playerId).catch(() => null);
    if (!document) return null;
    if (!applyProgressionDocument({ progressionCore, store, document })) return null;
    lastSnapshot = document;
    onSnapshotApplied(document);
    return document;
  }

  // One line for the results screen. It reports a level only from a synced
  // balance and says so plainly when a grant has not landed — the alternative is
  // showing a total the server has not agreed to.
  function describe() {
    if (!lastGrant?.eligible) return "";
    const pending = store.getSyncState().pendingCount > 0;
    if (pending) return "XP earned — not synced yet. It will file when you reconnect.";
    if (!lastSnapshot) return "XP earned.";

    const bowler = store.getBowler(lastGrant.characterSlug);
    const player = store.getPlayer();
    const bowlerLine = bowler.isMaxLevel
      ? `${bowler.slug} mastered`
      : `${bowler.xpIntoLevel}/${bowler.xpForNextLevel} to level ${bowler.level + 1}`;
    return `Level ${player.level} · Bowler level ${bowler.level} (${bowlerLine})`;
  }

  return { prepare, settle, settleSent, sync, describe, listUnsentRequests };
}
