// Ranked matchmaking + rendezvous controller. Owns the platform side of ranked:
// enqueue, poll until matched, and coordinate the relay rendezvous (seat 1 creates
// the lobby and publishes its code; seat 2 waits for that code, then joins). The
// relay actions themselves stay in onlineFlow — this controller only decides WHAT
// should happen next and calls back. All I/O is injected so the loop is testable.
//
// Emits:
//   onStatus(text)                      queue/connection status for the UI
//   onMatched(match)                    a brokered match arrived { matchId, seat, bansFirst, lobbyCode, opponentPlayerId, ... }
//   onLobbyReady({ role, code?, match}) role 'create' (seat 1) or 'join' with a code (seat 2)
//   onError(text)
//   onMatchSettled({ status, outcome }) the server resolved the match while we were
//                                       still beating — normally a forfeit win after
//                                       the opponent dropped and took our socket too
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { readStoredFactoryAccountSession } from "../platform/factoryAccount.js";
import { getRankedAccountGate } from "./rankedAccountGate.js";
import { createRankedHeartbeat } from "./rankedHeartbeat.js";

export function createRankedFlow({
  apiClient = createPlatformApiClient(),
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
  pollIntervalMs = 2000,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
  account = undefined,
  getAccountSession = readStoredFactoryAccountSession,
  createHeartbeat = createRankedHeartbeat,
  callbacks = {},
} = {}) {
  let state = "idle"; // idle | queuing | awaiting_lobby | ready | in_match | cancelled
  let timer = null;
  let match = null;
  let matchedEmitted = false;

  const cb = {
    onStatus: callbacks.onStatus || (() => {}),
    onMatched: callbacks.onMatched || (() => {}),
    onLobbyReady: callbacks.onLobbyReady || (() => {}),
    onError: callbacks.onError || (() => {}),
    onMatchSettled: callbacks.onMatchSettled || (() => {}),
  };

  // Presence reporting for the live match. See rankedHeartbeat.js for why the client
  // reports only that it is still here and never claims a result.
  const heartbeat = createHeartbeat({
    gameSlug,
    apiClient,
    onFinished: (settled) => cb.onMatchSettled(settled),
  });

  function stopTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }
  function scheduleNext() {
    stopTimer();
    timer = setTimeoutFn(poll, pollIntervalMs);
  }
  function isPolling() {
    return state === "queuing" || state === "awaiting_lobby";
  }
  function currentAccount() {
    return account !== undefined
      ? account
      : (typeof getAccountSession === "function" ? getAccountSession() : {});
  }

  function handlePoll(res) {
    if (!res) {
      cb.onError("Ranked service is unavailable.");
      state = "idle";
      return;
    }
    if (res.status === "matched" && res.match) {
      match = res.match;
      if (!matchedEmitted) {
        matchedEmitted = true;
        cb.onMatched(match);
        if (match.seat === 1) {
          state = "ready";
          stopTimer();
          cb.onLobbyReady({ role: "create", match });
          return;
        }
        if (match.lobbyCode) {
          state = "ready";
          stopTimer();
          cb.onLobbyReady({ role: "join", code: match.lobbyCode, match });
          return;
        }
        state = "awaiting_lobby";
        cb.onStatus("Opponent found. Connecting…");
        scheduleNext();
        return;
      }
      if (state === "awaiting_lobby" && match.lobbyCode) {
        state = "ready";
        stopTimer();
        cb.onLobbyReady({ role: "join", code: match.lobbyCode, match });
        return;
      }
      scheduleNext();
      return;
    }
    if (res.status === "waiting") {
      cb.onStatus(`Searching for a ranked opponent…${res.waitSeconds ? ` (${res.waitSeconds}s)` : ""}`);
      scheduleNext();
      return;
    }
    // idle / anything else — the server does not think we're queued.
    state = "idle";
    cb.onStatus("Left the ranked queue.");
  }

  async function poll() {
    if (!isPolling()) return;
    let res = null;
    try {
      res = await apiClient.pollRankedMatch(gameSlug);
    } catch {
      res = null;
    }
    if (!isPolling()) return; // cancelled while awaiting
    handlePoll(res);
  }

  async function queue() {
    if (state === "queuing" || state === "awaiting_lobby" || state === "ready" || state === "in_match") return;
    const gate = getRankedAccountGate(currentAccount());
    if (!gate.eligible) {
      cb.onError(gate.message);
      state = "idle";
      return;
    }
    state = "queuing";
    matchedEmitted = false;
    match = null;
    cb.onStatus("Joining the ranked queue…");
    let res = null;
    try {
      res = await apiClient.enqueueRankedMatch(gameSlug);
    } catch {
      res = null;
    }
    if (state !== "queuing") return;
    if (!res) {
      cb.onError("Could not join the ranked queue.");
      state = "idle";
      return;
    }
    handlePoll(res); // enqueue can return an immediate match
  }

  // Seat 1 calls this with the relay room code it just created.
  async function publishLobbyCode(code) {
    if (!match || !code) return null;
    try {
      return await apiClient.setRankedLobby(gameSlug, { matchId: match.matchId, lobbyCode: code });
    } catch {
      return null;
    }
  }

  async function cancel({ keepalive = false } = {}) {
    const wasPolling = isPolling();
    const hadMatch = Boolean(match);
    state = "cancelled";
    stopTimer();
    heartbeat.stop();
    if (wasPolling || hadMatch) {
      try {
        await apiClient.cancelRankedMatch(gameSlug, { keepalive });
      } catch {
        // best effort
      }
    }
    match = null;
    matchedEmitted = false;
    state = "idle";
  }

  async function markMatchStarted() {
    if (!match) return null;
    state = "in_match";
    heartbeat.start(match.matchId);
    try {
      return await apiClient.startRankedMatch?.(gameSlug, { matchId: match.matchId });
    } catch {
      return null;
    }
  }

  async function reportResult(outcome, { squad, unitResults, keepalive = false } = {}) {
    if (!match) return null;
    // We have attested; the server owns the outcome from here and no longer needs to
    // watch whether we are present.
    heartbeat.stop();
    try {
      return await apiClient.reportRankedResult(gameSlug, { matchId: match.matchId, outcome, squad, unitResults }, { keepalive });
    } catch {
      return null;
    }
  }

  function reportAbandon({ keepalive = true } = {}) {
    if (!match || state !== "in_match") return null;
    return reportResult("loss", { keepalive });
  }

  return {
    queue,
    cancel,
    markMatchStarted,
    publishLobbyCode,
    reportResult,
    reportAbandon,
    // Our socket died and we did not ask it to. We cannot attest a result, but we can
    // keep proving we are still here, which is what lets the server tell an
    // abandonment apart from a mutual outage.
    keepHeartbeatAfterDisconnect: () => heartbeat.keepAliveAfterDisconnect(),
    stopHeartbeat: () => heartbeat.stop(),
    getMatch: () => match,
    get state() {
      return state;
    },
  };
}
