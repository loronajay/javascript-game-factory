import { createSessionRuntimeState } from "./session-runtime-state.js";

function defaultNoticeHandler() {}
function defaultShowScreen() {}
function defaultStateHandler() {}
function getOtherSide(side) {
  return side === "red" ? "blue" : "red";
}

export function createCircuitSiegeSessionController({
  runtime = createSessionRuntimeState(),
  createRemoteMatchAdapter,
  loadIdentity,
  ensureBoardLoaded = async () => true,
  showScreen = defaultShowScreen,
  onLobbyStateChanged = defaultStateHandler,
  onMatchStateChanged = defaultStateHandler,
  onNotice = defaultNoticeHandler
} = {}) {
  function emitLobbyState() {
    onLobbyStateChanged(runtime);
  }

  function emitMatchState() {
    onMatchStateChanged(runtime);
  }

  function clearRoomState() {
    runtime.lobby = null;
    runtime.isHost = false;
    runtime.matchReady = null;
    runtime.snapshot = null;
    runtime.searching = false;
    runtime.pendingAction = null;
    runtime.profiles = {};
    runtime.matchEvents = [];
  }

  function announce(message) {
    runtime.lastNotice = message;
    onNotice(message);
  }

  function wireAdapterCallbacks(net) {
    net.cb.onConnected = ({ clientId } = {}) => {
      runtime.connected = true;
      runtime.clientId = clientId || null;
      net.requestQueueStatus?.();

      if (typeof runtime.pendingAction === "function") {
        const pendingAction = runtime.pendingAction;
        runtime.pendingAction = null;
        pendingAction();
      }

      emitLobbyState();
    };

    net.cb.onQueueCounts = (queueCounts) => {
      runtime.queueCounts = { ...queueCounts };
      emitLobbyState();
    };

    net.cb.onSearching = () => {
      runtime.searching = true;
      emitLobbyState();
    };

    net.cb.onRoomJoined = ({ roomCode, created = false } = {}) => {
      runtime.searching = false;
      runtime.lobby = {
        roomCode: roomCode || null,
        playerCount: created ? 1 : Number(runtime.lobby?.playerCount || 2)
      };
      runtime.isHost = !!created;
      net.sendProfile?.(runtime.selectedSide);
      emitLobbyState();
    };

    net.cb.onRoomPresenceChanged = ({ roomCode, playerCount } = {}) => {
      runtime.lobby = {
        roomCode: roomCode || runtime.lobby?.roomCode || null,
        playerCount: Number.isFinite(Number(playerCount))
          ? Number(playerCount)
          : Number(runtime.lobby?.playerCount || 0)
      };

      if (!runtime.snapshot && Number(runtime.lobby.playerCount || 0) < 2) {
        runtime.matchReady = null;
      }

      emitLobbyState();
    };

    net.cb.onRemoteProfile = (profile) => {
      if (!profile?.displayName) return;
      runtime.profiles[profile.playerId || profile.displayName] = { ...profile };
      emitLobbyState();
    };

    net.cb.onMatchReady = (payload) => {
      return Promise.resolve()
        .then(async () => {
          if (payload?.mapId) {
            await ensureBoardLoaded(payload.mapId);
          }
          runtime.matchReady = { ...payload };
          showScreen("match");
          emitLobbyState();
        })
        .catch(() => {
          announce("Failed to load the selected match map.");
          emitLobbyState();
        });
    };

    net.cb.onSnapshot = (snapshot) => {
      return Promise.resolve()
        .then(async () => {
          if (snapshot?.boardId) {
            await ensureBoardLoaded(snapshot.boardId);
          }
          runtime.snapshot = snapshot;
          showScreen("match");
          emitMatchState();
        })
        .catch(() => {
          announce("Failed to load the selected match map.");
          emitLobbyState();
        });
    };

    net.cb.onMatchEvent = (event) => {
      runtime.matchEvents = runtime.matchEvents.concat([event]);
      emitMatchState();
    };

    net.cb.onError = (_code, message) => {
      if (typeof message === "string" && message.trim().length > 0) {
        announce(message);
        emitLobbyState();
      }
    };

    net.cb.onPartnerLeft = () => {
      if (runtime.snapshot) {
        runtime.snapshot = {
          ...runtime.snapshot,
          phase: "ended",
          result: {
            type: "disconnect",
            winnerSide: runtime.selectedSide || getOtherSide(runtime.selectedSide),
            loserSide: getOtherSide(runtime.selectedSide)
          }
        };
        runtime.matchReady = null;
        announce("Opponent disconnected. You win.");
        showScreen("match");
        emitMatchState();
        return;
      }

      clearRoomState();
      announce("Opponent disconnected.");
      showScreen("matchmaking");
      emitLobbyState();
    };

    net.cb.onClosed = () => {
      const hadMatchState = !!runtime.snapshot || !!runtime.matchReady;
      const hadSessionState = hadMatchState || !!runtime.lobby || !!runtime.searching;
      runtime.connected = false;
      runtime.clientId = null;
      runtime.net = null;
      runtime.pendingAction = null;
      clearRoomState();
      if (hadSessionState) {
        announce("Connection lost.");
      }
      if (hadMatchState) {
        emitMatchState();
      }
      emitLobbyState();
    };
  }

  async function ensureClient() {
    if (runtime.net) {
      if (!runtime.connected) {
        runtime.net.connect?.();
      }
      return runtime.net;
    }

    const identity = await loadIdentity();
    const net = createRemoteMatchAdapter();

    runtime.identity = identity;
    runtime.net = net;
    net.setIdentity(identity);
    wireAdapterCallbacks(net);
    net.connect();

    return net;
  }

  function runOrQueueAction(net, action) {
    if (runtime.connected) {
      runtime.pendingAction = null;
      action();
      return;
    }

    runtime.pendingAction = action;
  }

  async function startPublicMatch({ side }) {
    const net = await ensureClient();
    runtime.matchmakingMode = "public";
    runtime.selectedSide = side;
    runtime.searching = true;
    runOrQueueAction(net, () => net.findMatch(side));
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  async function startPrivateCreate({ side = "blue" } = {}) {
    const net = await ensureClient();
    runtime.matchmakingMode = "private_create";
    runtime.selectedSide = side;
    runOrQueueAction(net, () => net.createRoom(side));
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  async function startPrivateJoin({ side = "red", roomCode } = {}) {
    const net = await ensureClient();
    runtime.matchmakingMode = "private_join";
    runtime.selectedSide = side;
    runOrQueueAction(net, () => net.joinRoom(side, roomCode));
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  function submitIntent(intent) {
    if (!runtime.net || !intent) {
      return false;
    }

    runtime.net.sendIntent?.(intent);
    emitMatchState();
    return true;
  }

  function disconnect() {
    runtime.net?.disconnect?.();
    runtime.net?.reset?.();
    runtime.net = null;
    runtime.clientId = null;
    clearRoomState();
    runtime.connected = false;
    emitLobbyState();
  }

  function cancelSearch() {
    if (!runtime.net || !runtime.searching) {
      return false;
    }

    runtime.net.cancelSearch?.();
    runtime.searching = false;
    emitLobbyState();
    return true;
  }

  function leaveLobby() {
    if (!runtime.net || !runtime.lobby) {
      return false;
    }

    runtime.net.leaveRoom?.();
    clearRoomState();
    emitLobbyState();
    return true;
  }

  return {
    ensureClient,
    startPublicMatch,
    startPrivateCreate,
    startPrivateJoin,
    submitIntent,
    cancelSearch,
    leaveLobby,
    disconnect
  };
}
