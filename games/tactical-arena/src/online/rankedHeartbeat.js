// Ranked liveness heartbeat — the client half of the abandonment fix.
//
// The relay tears the room down when a peer drops, so one player's machine dying
// takes their opponent's socket with it. Neither client can attest a result, and the
// match used to sit unresolved on the server until its TTL voided it: no rating, no
// W/L, and nothing in match history for a game that plainly had a winner. The
// survivor can't just claim the win, because a player who is losing would unplug and
// claim the same thing.
//
// So this reports presence, never a verdict. It beats while we are in a live ranked
// match and — the part that actually matters — KEEPS beating after our socket dies,
// because the server can only tell who abandoned by seeing who is still there. The
// side that quit stops beating no matter what it would like to claim.
//
// All I/O and timing are injected so this is testable headless.

export const HEARTBEAT_INTERVAL_MS = 15000;
// How long we keep beating with no socket before giving up. Comfortably past the
// server's stale window, so a genuine abandonment resolves while we are still here,
// but short enough that a dead match doesn't poll forever in a background tab.
export const ORPHAN_TIMEOUT_MS = 180000;

export function createRankedHeartbeat({
  gameSlug,
  apiClient,
  clock = globalThis,
  now = () => Date.now(),
  intervalMs = HEARTBEAT_INTERVAL_MS,
  orphanTimeoutMs = ORPHAN_TIMEOUT_MS,
  onFinished = () => {},
} = {}) {
  let matchId = null;
  let timer = null;
  let inFlight = false;
  // Set when our connection died and we are beating purely to prove we are the side
  // that stayed. null while the match is running normally.
  let orphanedAt = null;

  function stop() {
    if (timer != null) clock.clearInterval?.(timer);
    timer = null;
    matchId = null;
    orphanedAt = null;
    inFlight = false;
  }

  async function beat() {
    if (!matchId || inFlight) return;
    if (orphanedAt != null && now() - orphanedAt > orphanTimeoutMs) {
      // Nobody is going to resolve this from our side. Stop asking.
      stop();
      return;
    }
    inFlight = true;
    let result = null;
    try {
      result = await apiClient?.sendRankedHeartbeat?.(gameSlug, { matchId });
    } catch {
      // A missed beat is expected on a flaky link; the server's stale window is
      // several beats wide precisely so one failure decides nothing.
    }
    inFlight = false;
    if (!result?.finished) return;
    // The server settled the match — commonly this very beat resolved it in our
    // favour because the opponent went silent.
    const finished = { status: result.status ?? null, outcome: result.match?.outcome ?? null };
    stop();
    try {
      onFinished(finished);
    } catch {
      // Presentation must never break the teardown.
    }
  }

  return {
    // Begin reporting presence for a live ranked match.
    start(id) {
      if (!id || !apiClient?.sendRankedHeartbeat) return;
      stop();
      matchId = id;
      void beat();
      timer = clock.setInterval?.(() => void beat(), intervalMs);
    },
    // Our socket died from something we did not ask for. Keep beating: this is the
    // only evidence the server has that we are the side that did not abandon.
    keepAliveAfterDisconnect() {
      if (!matchId || orphanedAt != null) return;
      orphanedAt = now();
      void beat();
    },
    stop,
    get isRunning() {
      return timer != null;
    },
    get isOrphaned() {
      return orphanedAt != null;
    },
  };
}
