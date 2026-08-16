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

// Strikes bowled in one match. A roll of 10 can only happen off a full rack —
// a spare's second ball has at most nine pins to take — so counting rolls equal
// to ten counts strikes exactly, including the tenth frame's bonus balls.
function countStrikes(player) {
  return (player?.frames || []).reduce(
    (total, frame) => total + frame.filter((roll) => roll === 10).length,
    0,
  );
}

// A disconnect forfeit is the server's ruling, carried on the snapshot. The
// player who walked earns nothing; the one left standing gets their own reward,
// which is not an ordinary win.
function forfeitRoleFor(snapshotResult, clientId) {
  if (snapshotResult?.reason !== "disconnect") return null;
  return snapshotResult.loserClientId === clientId ? "leaver" : "remaining";
}

export function createProgressionReporter({ progressionCore, store, platformApi }) {
  let lastSnapshot = null;
  let lastGrant = null;

  // Builds the report block and queues the grant. Queuing deliberately does not
  // move a balance — only the server's snapshot does that.
  function prepare({ match, clientId, sessionId, snapshotResult }) {
    const me = match?.players?.find((player) => player.id === clientId);
    if (!me || !sessionId) return null;

    const grant = progressionCore.computeMatchGrant({
      grantId: sessionId,
      playType: match.playType,
      modeId: match.modeId,
      characterSlug: me.characterSlug,
      terminal: match.status === "complete",
      outcome: match.winnerIds.length > 1 ? "draw"
        : match.winnerIds.includes(me.id) ? "win" : "loss",
      strikes: countStrikes(me),
      forfeitRole: forfeitRoleFor(snapshotResult, clientId),
    });

    lastGrant = grant;
    if (!grant.eligible) return { grant, block: null };
    store.recordPending(grant);

    return {
      grant,
      block: {
        trackId: me.characterSlug,
        modeId: match.modeId,
        // The countable stat the capped bonus rides on. Named for what it is
        // rather than for what it pays, because the payout is the server's.
        performance: countStrikes(me),
        forfeitRole: grant.breakdown.forfeit > 0 ? "remaining" : null,
        stats: { strikes: countStrikes(me), highGame: me.score?.total || 0 },
      },
    };
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
    applyProgressionDocument({ progressionCore, store, document });
    lastSnapshot = document;
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

  return { prepare, settle, sync, describe };
}
