import { createSessionRuntimeState } from "./session-runtime-state.js";

function defaultNoticeHandler() {}
function defaultShowScreen() {}
function defaultStateHandler() {}

export function createCircuitSiegeSessionController({
  runtime = createSessionRuntimeState(),
  createRemoteMatchAdapter,
  loadIdentity,
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
      runtime.matchReady = { ...payload };
      showScreen("match");
      emitLobbyState();
    };

    net.cb.onSnapshot = (snapshot) => {
      runtime.snapshot = snapshot;
      showScreen("match");
      emitMatchState();
    };

    net.cb.onMatchEvent = (event) => {
      runtime.matchEvents = runtime.matchEvents.concat([event]);
      emitMatchState();
    };

    net.cb.onPartnerLeft = () => {
      clearRoomState();
      announce("Opponent disconnected.");
      showScreen("menu");
      emitLobbyState();
    };

    net.cb.onClosed = () => {
      runtime.connected = false;
      emitLobbyState();
    };
  }

  async function ensureClient() {
    if (runtime.net) {
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

  async function startPublicMatch({ side }) {
    const net = await ensureClient();
    runtime.matchmakingMode = "public";
    runtime.selectedSide = side;
    runtime.searching = true;
    runtime.pendingAction = () => net.findMatch(side);
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  async function startPrivateCreate({ side = "blue" } = {}) {
    const net = await ensureClient();
    runtime.matchmakingMode = "private_create";
    runtime.selectedSide = side;
    runtime.pendingAction = () => net.createRoom(side);
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  async function startPrivateJoin({ side = "red", roomCode } = {}) {
    const net = await ensureClient();
    runtime.matchmakingMode = "private_join";
    runtime.selectedSide = side;
    runtime.pendingAction = () => net.joinRoom(side, roomCode);
    showScreen("matchmaking");
    emitLobbyState();
    return true;
  }

  function requestReady(ready = true) {
    if (!runtime.net || !runtime.lobby) {
      return false;
    }

    runtime.net.sendPlayerReady?.(!!ready);
    emitLobbyState();
    return true;
  }

  function requestStartNow() {
    if (!runtime.net || !runtime.isHost || Number(runtime.lobby?.playerCount || 0) < 2) {
      return false;
    }

    runtime.net.requestStart?.();
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
    clearRoomState();
    runtime.connected = false;
    emitLobbyState();
  }

  return {
    ensureClient,
    startPublicMatch,
    startPrivateCreate,
    startPrivateJoin,
    requestReady,
    requestStartNow,
    submitIntent,
    disconnect
  };
}
