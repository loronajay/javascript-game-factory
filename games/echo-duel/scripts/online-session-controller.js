import { PHASES } from "./config.js";

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createOnlineSessionController({
  online,
  windowLike = window,
  createOnlineClient,
  loadArcadeIdentity,
  renderOnlineLobby,
  renderMatch,
  showScreen,
  createMatchState,
  hydrateNetworkState,
  applyAuthoritativeMatchMessage,
  getAuthoritativeSyncSeq = () => null,
  isAuthoritativeMatchMessageType,
  mergeLobbySnapshot,
  applyPlayerLeftToLobby,
  buildPlayersFromLobby,
  resetOnlineRuntimeState,
  shouldTickLobbyCountdown,
  shouldResetStartRequest,
  shouldPreserveResultsScreen,
  shouldCloseMatchToMenuOnPlayerLeft,
  getState,
  setState,
  setRawState,
  startLoop,
  isLoopRunning,
  goMenuWithNotice,
  continueAfterDisconnectedPlayer,
  applyAuthoritativeInput,
  mirrorVisibleOwnerInput,
  onlineUsesServerAuthority,
  onMatchStarting = null,
  playerIdForClientId,
  queryElementById = () => null,
  logWarn = console.warn,
  gameId = "echo-duel",
} = {}) {
  function stopLobbyCountdownTicker() {
    if (online.lobbyCountdownTimer !== null) {
      windowLike.clearInterval(online.lobbyCountdownTimer);
      online.lobbyCountdownTimer = null;
    }
  }

  function stopPendingMatchStart() {
    if (online.pendingMatchStartTimer !== null) {
      windowLike.clearTimeout?.(online.pendingMatchStartTimer);
      online.pendingMatchStartTimer = null;
    }
  }

  function stopPublicSearchTicker() {
    if (online.publicSearchTimer !== null) {
      windowLike.clearInterval?.(online.publicSearchTimer);
      online.publicSearchTimer = null;
    }
  }

  function updateLobbyView(status = "") {
    if (!online.lobby) return;
    renderOnlineLobby({
      lobby: online.lobby,
      profiles: online.profiles,
      myClientId: online.net?.clientId,
      status,
      startRequested: online.startRequested,
    });
  }

  function publicSearchPlaceholder() {
    return {
      roomCode: "-----",
      ownerId: null,
      playerCount: 0,
      minPlayers: 2,
      maxPlayers: 6,
      members: [],
      settings: { penaltyWord: "STATIC" },
      status: "searching",
    };
  }

  function renderPublicSearch(status = "Searching for open public lobbies...") {
    renderOnlineLobby({
      lobby: publicSearchPlaceholder(),
      profiles: online.profiles,
      myClientId: online.net?.clientId,
      status,
      startRequested: false,
    });
  }

  function startLobbyCountdownTicker() {
    stopLobbyCountdownTicker();
    if (!shouldTickLobbyCountdown(online.lobby)) return;

    online.lobbyCountdownTimer = windowLike.setInterval(() => {
      if (!shouldTickLobbyCountdown(online.lobby)) {
        stopLobbyCountdownTicker();
        return;
      }
      updateLobbyView();
    }, 250);
  }

  function cacheMyProfile() {
    if (!online.net?.clientId || !online.identity) return;
    online.profiles[online.net.clientId] = { ...online.identity };
  }

  function broadcastProfileSoon() {
    windowLike.setTimeout(() => online.net?.sendProfile(), 50);
    windowLike.setTimeout(() => online.net?.sendProfile(), 450);
  }

  function applyServerAuthoritativeState(messageType, value) {
    const syncSeq = getAuthoritativeSyncSeq(value);
    if (Number.isFinite(syncSeq) && syncSeq > 0 && syncSeq <= online.inboundStateSeq) {
      return false;
    }

    const next = applyAuthoritativeMatchMessage(getState(), messageType, value, {
      myClientId: online.net?.clientId || null,
      lobbyOwnerId: online.lobby?.ownerId || null,
      hostId: online.lobby?.ownerId || null,
    });

    if (!next) return false;

    stopLobbyCountdownTicker();
    stopPendingMatchStart();
    online.authorityMode = "server";
    online.started = true;
    if (Number.isFinite(syncSeq) && syncSeq > 0) {
      online.inboundStateSeq = syncSeq;
    }
    if (shouldResetStartRequest({
      lobbyStatus: online.lobby?.status || "",
      lobbyStartAt: online.lobby?.startAt || null,
      state: next,
    })) {
      online.startRequested = false;
    }
    if (online.lobby && next.phase === PHASES.MATCH_OVER) {
      online.lobby = {
        ...online.lobby,
        status: "ended",
        startAt: null,
      };
    }
    onMatchStarting?.();
    setRawState(next);
    showScreen("match");
    renderMatch(next);
    if (!isLoopRunning()) startLoop();
    return true;
  }

  function wireOnlineCallbacks(net) {
    net.cb.onConnected = () => {
      cacheMyProfile();
      if (online.pendingAction) {
        online.pendingAction();
        online.pendingAction = null;
      }
    };

    net.cb.onLobbyJoined = (payload) => {
      if (online.findingPublic && payload.created) {
        net.leaveLobby?.();
        online.lobby = null;
        online.isHost = false;
        online.startRequested = false;
        renderPublicSearch("Searching for open public lobbies...");
        return;
      }
      stopPublicSearchTicker();
      online.findingPublic = false;
      online.lobby = payload;
      online.isHost = payload.ownerId === net.clientId;
      cacheMyProfile();
      updateLobbyView(payload.created ? "Lobby created." : "Joined lobby.");
      broadcastProfileSoon();
    };

    net.cb.onLobbyUpdated = (payload) => {
      online.lobby = mergeLobbySnapshot(online.lobby, payload);
      online.isHost = payload.ownerId === net.clientId;
      if (shouldResetStartRequest({
        lobbyStatus: online.lobby?.status || "",
        lobbyStartAt: online.lobby?.startAt || null,
        state: getState(),
      })) {
        online.startRequested = false;
      }
      if (online.lobby?.status === "open") {
        online.started = false;
        stopPendingMatchStart();
      }
      if (shouldTickLobbyCountdown(online.lobby)) startLobbyCountdownTicker();
      else stopLobbyCountdownTicker();
      if (shouldPreserveResultsScreen({ authorityMode: online.authorityMode, state: getState() })) return;
      updateLobbyView();
      broadcastProfileSoon();
    };

    net.cb.onLobbyCountdownStarted = (payload) => {
      online.lobby = mergeLobbySnapshot(online.lobby, payload);
      online.isHost = payload.ownerId === net.clientId;
      online.startRequested = true;
      startLobbyCountdownTicker();
      updateLobbyView();
    };

    net.cb.onPlayerJoined = () => {
      broadcastProfileSoon();
    };

    net.cb.onPlayerLeft = (payload) => {
      const state = getState();
      const leavingHost = state?.network?.hostId && payload.clientId === state.network.hostId;

      if (state?.mode === "online" && online.started && state.phase !== PHASES.MATCH_OVER) {
        if (onlineUsesServerAuthority()) {
          if (shouldCloseMatchToMenuOnPlayerLeft({
            authorityMode: online.authorityMode,
            onlineStarted: online.started,
            payload,
            state,
          })) {
            goMenuWithNotice("Your partner disconnected. The match was closed.");
            return;
          }

          if (online.lobby) {
            online.lobby = applyPlayerLeftToLobby(online.lobby, payload);
            online.isHost = payload.ownerId === net.clientId;
          }
          updateLobbyView("A player left.");
          return;
        }

        if (leavingHost && !online.isHost) {
          goMenuWithNotice("The lobby host disconnected. The online match was closed.");
          return;
        }

        if (online.isHost) {
          continueAfterDisconnectedPlayer(payload.clientId, leavingHost ? "host-left" : "disconnect");
          return;
        }
      }

      if (online.lobby) {
        online.lobby = applyPlayerLeftToLobby(online.lobby, payload);
        online.isHost = payload.ownerId === net.clientId;
      }

      if (!online.started && Number(payload.playerCount) < 2) {
        stopPendingMatchStart();
        goMenuWithNotice("Your partner disconnected. The lobby was closed.");
        return;
      }

      if (shouldPreserveResultsScreen({ authorityMode: online.authorityMode, state })) return;
      updateLobbyView("A player left.");
    };

    net.cb.onLobbyStarted = (payload) => {
      online.lobby = mergeLobbySnapshot(online.lobby, { ...payload, status: "started" });
      online.isHost = payload.ownerId === net.clientId;
      online.started = true;
      online.startRequested = true;
      const members = payload.members || online.lobby.members || [];
      startLobbyCountdownTicker();
      updateLobbyView("Match starting...");
      online.lobby.members = members;

      const start = () => {
        online.pendingMatchStartTimer = null;
        if (online.lobby?.roomCode !== payload.roomCode || online.lobby?.status !== "started") {
          return;
        }
        stopLobbyCountdownTicker();
        onMatchStarting?.();
        if (payload.authorityMode === "server" || payload.matchState || payload.snapshot) {
          online.authorityMode = "server";
          if (payload.matchState) {
            applyServerAuthoritativeState("match_state", JSON.stringify(payload.matchState));
          } else if (payload.snapshot) {
            applyServerAuthoritativeState("match_state", JSON.stringify(payload.snapshot));
          } else {
            showScreen("match");
          }
          return;
        }

        online.authorityMode = "host-client";
        if (online.isHost) {
          const players = buildPlayersFromLobby({
            lobby: online.lobby,
            profiles: online.profiles,
            localClientId: online.net?.clientId,
            identity: online.identity,
          }).map((player) => ({
            ...player,
            id: playerIdForClientId(player.clientId),
          }));
          const matchState = createMatchState({
            mode: "online",
            seed: payload.seed,
            playerCount: players.length,
            players,
            penaltyWord: payload.settings?.penaltyWord || online.lobby.settings?.penaltyWord || "ECHO",
            network: {
              roomCode: payload.roomCode,
              hostId: payload.ownerId,
              lobbyOwnerId: payload.ownerId,
              myClientId: net.clientId,
            },
          });
          setState(matchState, { broadcast: true });
          startLoop();
        } else {
          showScreen("match");
        }
      };

      const delay = Math.max(0, Number(payload.startAt || 0) - Date.now());
      stopPendingMatchStart();
      online.pendingMatchStartTimer = windowLike.setTimeout(start, delay);
    };

    net.cb.onLobbyMessage = ({ messageType, value, senderId }) => {
      if (messageType === "profile") {
        const profile = safeParse(value);
        if (profile?.displayName) {
          online.profiles[senderId] = {
            playerId: profile.playerId || "",
            displayName: String(profile.displayName).slice(0, 18),
          };
          if (online.lobby && online.lobby.status !== "started") updateLobbyView();
        }
        return;
      }

      if (isAuthoritativeMatchMessageType(messageType)) {
        applyServerAuthoritativeState(messageType, value);
        return;
      }

      if (messageType === "input") {
        const msg = safeParse(value);
        const input = String(msg?.input || "").toUpperCase();
        if (!input) return;

        mirrorVisibleOwnerInput(senderId, input);

        if (online.isHost && !onlineUsesServerAuthority()) {
          applyAuthoritativeInput(senderId, input, { phaseId: msg?.phaseId, turnId: msg?.turnId });
        }
        return;
      }

      if (messageType === "state_sync") {
        if (onlineUsesServerAuthority()) return;
        if (online.isHost) return;
        const snapshot = safeParse(value);
        const syncSeq = Number(snapshot?.network?.syncSeq || 0);
        if (Number.isFinite(syncSeq) && syncSeq > 0 && syncSeq <= online.inboundStateSeq) return;
        const hydrated = hydrateNetworkState(snapshot);
        if (hydrated) {
          if (Number.isFinite(syncSeq) && syncSeq > 0) online.inboundStateSeq = syncSeq;
          hydrated.network = {
            ...(hydrated.network || {}),
            hostId: hydrated.network?.hostId || online.lobby?.ownerId || null,
            lobbyOwnerId: hydrated.network?.lobbyOwnerId || online.lobby?.ownerId || null,
            myClientId: online.net?.clientId || net.clientId,
          };
          setRawState(hydrated);
          renderMatch(hydrated);
          if (!isLoopRunning()) startLoop();
        }
      }
    };

    net.cb.onError = (code, message) => {
      logWarn("Echo Duel network error:", code, message);
      const err = queryElementById("join-room-error") || queryElementById("online-error");
      online.startRequested = false;
      if (online.lobby && online.lobby.status !== "started") updateLobbyView("Unable to start match. Try again.");
      if (err) {
        err.textContent = message || code || "Network error";
        err.classList.remove("hidden");
      }
    };

    net.cb.onClosed = () => {
      const state = getState();
      if (state?.mode === "online" && state.phase !== PHASES.MATCH_OVER) {
        goMenuWithNotice("Connection lost. You were returned to the menu.");
      }
    };
  }

  async function ensureOnlineClient() {
    if (online.net) return online.net;
    online.identity = await loadArcadeIdentity();
    const net = createOnlineClient(gameId);
    net.setIdentity(online.identity);
    online.profiles = {};
    wireOnlineCallbacks(net);
    online.net = net;
    net.connect();
    return net;
  }

  function disconnectOnline() {
    stopLobbyCountdownTicker();
    stopPendingMatchStart();
    stopPublicSearchTicker();
    online.net?.leaveLobby?.();
    online.net?.disconnect?.();
    resetOnlineRuntimeState(online);
  }

  async function startCreatePublic(settings) {
    const net = await ensureOnlineClient();
    online.findingPublic = false;
    stopPublicSearchTicker();
    online.pendingAction = () => net.createLobby({ ...settings, isPrivate: false });
    if (net.clientId) online.pendingAction();
    showScreen("onlineLobby");
  }

  async function findPublic() {
    const net = await ensureOnlineClient();
    const defaults = { minPlayers: 2, maxPlayers: 6, penaltyWord: "STATIC" };
    online.findingPublic = true;
    const search = () => {
      if (!online.findingPublic || !online.net?.clientId) return;
      net.findLobby(defaults);
    };
    online.pendingAction = search;
    if (net.clientId) online.pendingAction();
    stopPublicSearchTicker();
    online.publicSearchTimer = windowLike.setInterval(search, 2500);
    showScreen("onlineLobby");
    renderPublicSearch();
  }

  async function startPrivate(settings) {
    const net = await ensureOnlineClient();
    online.findingPublic = false;
    stopPublicSearchTicker();
    online.pendingAction = () => net.createLobby({ ...settings, isPrivate: true });
    if (net.clientId) online.pendingAction();
    showScreen("onlineLobby");
  }

  async function joinPrivate(code) {
    const net = await ensureOnlineClient();
    online.findingPublic = false;
    stopPublicSearchTicker();
    online.pendingAction = () => net.joinLobby(code);
    if (net.clientId) online.pendingAction();
    showScreen("onlineLobby");
  }

  function requestStartNow() {
    if (online.startRequested || online.started) return false;
    if (!online.net || !online.lobby) return false;
    if (online.lobby.ownerId !== online.net.clientId) return false;
    const ready = Number(online.lobby.playerCount || 0) >= Number(online.lobby.minPlayers || 2);
    if (!ready) return false;

    online.startRequested = true;
    updateLobbyView("Requesting match start...");
    online.net.startLobby();
    return true;
  }

  return {
    disconnectOnline,
    ensureOnlineClient,
    startCreatePublic,
    findPublic,
    startPrivate,
    joinPrivate,
    requestStartNow,
    updateLobbyView,
    stopLobbyCountdownTicker,
  };
}
