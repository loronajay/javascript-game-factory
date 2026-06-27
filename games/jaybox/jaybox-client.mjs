// Jaybox host shell — game-agnostic. Owns the WebSocket session, lobby lifecycle,
// catalog/lobby/join framing, and reconnect. Everything game-specific (match
// rendering, controller screens, message handling, input wiring) is delegated to
// the active cabinet resolved from the registry by the lobby's gameId. See
// cabinets/registry.mjs and the cabinet interface in cabinets/pot-of-greed.mjs.
import {
  AVATARS,
  decoratePlayer,
  deriveControllerScreen,
  deriveDisplayScreen,
  escapeHtml,
  avatarToken,
  makeServerUrl
} from "./jaybox-client-model.mjs";
import { getCabinet, getCatalog } from "./cabinets/registry.mjs";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const role = params.get("mode") === "controller" ? "controller" : "display";
const STORAGE_KEY = `jaybox:${role}:session`;
const state = { role, lobby: null, match: null, me: null, connected: false, reconnecting: false, message: "", pendingGameId: null };
let socket = null;
let pendingSession = null;
let reconnectAttempted = false;

// The cabinet currently in play: known from the lobby's gameId (controller and
// display once joined) or the game the host just chose to create (display, pre-lobby).
function activeCabinet() {
  return getCabinet(state.lobby?.gameId || state.match?.gameId || state.pendingGameId);
}

function lobbyPlayers() {
  const players = Array.isArray(state.lobby?.players) ? state.lobby.players : [];
  if (players.length) return players.map((player, index) => decoratePlayer(player, `Player ${index + 1}`));
  return (state.lobby?.members || []).map((id, index) => decoratePlayer({ id, name: `Player ${index + 1}` }, `Player ${index + 1}`));
}

function avatarPicker() {
  return `<div class="avatar-picker" role="radiogroup" aria-label="Choose an avatar">${AVATARS.map((avatar, index) => `
    <label class="avatar-choice ${avatar.className}">
      <input type="radio" name="avatarId" value="${escapeHtml(avatar.id)}" ${index === 0 ? "checked" : ""}>
      ${avatarToken(avatar)}
      <span>${escapeHtml(avatar.name)}</span>
    </label>`).join("")}</div>`;
}

function savedSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function saveSession(session) {
  if (!session?.clientId || !session?.sessionToken) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function send(type, payload = {}) {
  if (socket?.readyState !== WebSocket.OPEN) {
    state.message = "Trying to reconnect to Jaybox...";
    render();
    return;
  }
  socket.send(JSON.stringify({ type, ...payload }));
}

function playerCards(players = []) {
  return players.map((rawPlayer, index) => {
    const player = decoratePlayer(rawPlayer, `Player ${index + 1}`);
    return `
    <article class="player ${player.connected === false ? "disconnected" : ""}">
      ${avatarToken(player.avatar)}
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <div class="role">Seated${player.connected === false ? " - reconnecting" : ""}</div>
      </div>
    </article>`;
  }).join("");
}

function catalogScreen() {
  const cards = getCatalog().map((cabinet) => `
    <div class="cabinet">
      ${cabinet.renderCatalogArt?.() || ""}
      <div class="cabinet-copy">
        <div class="eyebrow">${escapeHtml(cabinet.catalogEyebrow || "Cabinet")}</div>
        <h1>${escapeHtml(cabinet.title)}</h1>
        <p class="lede">${escapeHtml(cabinet.tagline || "")}</p>
        <button class="button big" data-action="create-room" data-game-id="${escapeHtml(cabinet.gameId)}">Host a room</button>
      </div>
    </div>`).join("");
  return `<section class="attract-screen">
    <div class="stage-glow"></div>
    <div class="brand marquee">Jay<span>box</span></div>
    <div class="cabinet-shelf">${cards}</div>
    <p class="status">${escapeHtml(state.message)}</p>
  </section>`;
}

function lobbyScreen() {
  const lobby = state.lobby;
  const cabinet = activeCabinet();
  const title = cabinet?.title || "Jaybox";
  const joinUrl = `${location.origin}${location.pathname}?mode=controller`;
  return `<div class="shell stage-shell">
    <header class="topbar"><div class="brand">Jay<span>box</span> / ${escapeHtml(title)}</div><span class="pill">Lobby</span></header>
    <section class="lobby-stage">
      <div class="room-sign">
        <div class="eyebrow">Join on your phone</div>
        <div class="room-code">${escapeHtml(lobby.roomCode)}</div>
        <p class="lede">Open <b>${escapeHtml(joinUrl)}</b>, enter this code, then pick your table identity.</p>
        <div class="lobby-meter"><span style="width:${Math.min(100, Math.round((lobby.playerCount / lobby.maxPlayers) * 100))}%"></span></div>
        <div class="lobby-meta"><b>${lobby.playerCount}</b> of ${lobby.maxPlayers} players / ${lobby.minPlayers} needed to start</div>
        <button class="button big" data-action="start-game" ${lobby.playerCount < lobby.minPlayers ? "disabled" : ""}>Start ${escapeHtml(title)}</button>
        <p class="status">${escapeHtml(state.message)}</p>
      </div>
      <div class="roster-board">
        <div class="phase-row"><h2>Seats</h2><span class="pill">Pick a face</span></div>
        <div class="grid">${playerCards(lobbyPlayers())}</div>
      </div>
    </section>
  </div>`;
}

function displayView() {
  const screen = deriveDisplayScreen(state);
  if (screen === "catalog") return catalogScreen();
  if (screen === "lobby") return lobbyScreen();
  const cabinet = activeCabinet();
  return cabinet?.renderDisplayMatch?.(state) || lobbyScreen();
}

function controllerView() {
  const screen = deriveControllerScreen(state);
  const me = decoratePlayer(state.me || {}, "You");
  const top = `<header class="topbar controller-bar"><div class="brand">Jay<span>box</span></div><span class="pill">${state.connected ? "online" : "connecting"}</span></header>`;

  if (screen === "join") {
    return `<main class="shell controller">${top}
      <section class="controller-panel join-panel">
        <div class="eyebrow">Jaybox</div>
        <h2>Choose your seat.</h2>
        <form class="form" data-form="join">
          <label>Room code<input name="roomCode" autocomplete="off" maxlength="5" placeholder="ABCDE" required></label>
          <label>Your name<input name="displayName" maxlength="18" placeholder="Your name" required></label>
          <div class="field-label">Avatar</div>
          ${avatarPicker()}
          <button class="button big">Join room</button>
        </form>
        <p class="status">${escapeHtml(state.message)}</p>
      </section>
    </main>`;
  }

  if (screen === "reconnect") {
    return `<main class="shell controller">${top}<section class="controller-panel"><h2>Finding your seat...</h2><p class="hint">Jaybox is restoring your session and any move you already locked.</p></section></main>`;
  }

  if (screen === "lobby") {
    return `<main class="shell controller">${top}<section class="controller-panel seat-card"><div class="seat-id">${avatarToken(me.avatar, "large")}</div><div class="eyebrow">Room ${escapeHtml(state.lobby.roomCode)}</div><h2>You are in.</h2><p class="hint">The display host starts once ${state.lobby.minPlayers} players have joined. Your avatar and name are your table identity.</p><div class="notice">${state.lobby.playerCount} players connected</div></section></main>`;
  }

  // In match: the active cabinet derives its own sub-screen and renders it.
  const cabinet = activeCabinet();
  if (cabinet?.renderControllerMatch) {
    const matchScreen = cabinet.deriveMatchScreen?.(state) || "waiting";
    return cabinet.renderControllerMatch(state, matchScreen);
  }
  return `<main class="shell controller">${top}<section class="controller-panel"><h2>Waiting...</h2></section></main>`;
}

function render() {
  app.innerHTML = state.role === "display" ? displayView() : controllerView();
  app.querySelectorAll("[data-action='create-room']").forEach((button) => button.addEventListener("click", () => {
    const gameId = button.dataset.gameId;
    state.pendingGameId = gameId;
    send("create_lobby", { gameId, role: "display", private: true });
  }));
  app.querySelector("[data-action='start-game']")?.addEventListener("click", () => send("start_lobby"));
  app.querySelector("[data-form='join']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send("join_lobby", {
      roomCode: String(form.get("roomCode")).toUpperCase(),
      identity: {
        displayName: form.get("displayName"),
        avatarId: form.get("avatarId") || AVATARS[0].id
      }
    });
  });
  activeCabinet()?.wire?.(app, { send, state });
}

function onPayload(payload) {
  if (payload.event === "connected") {
    pendingSession = { clientId: payload.clientId, sessionToken: payload.sessionToken };
    const previous = savedSession();
    if (previous && !reconnectAttempted) {
      reconnectAttempted = true;
      state.reconnecting = true;
      send("resume_lobby", previous);
    } else saveSession(pendingSession);
  } else if (payload.event === "session_resumed") {
    saveSession({ clientId: payload.clientId, sessionToken: payload.sessionToken });
    state.reconnecting = false;
  } else if (payload.event === "error") {
    if (payload.code === "RESUME_REJECTED") {
      localStorage.removeItem(STORAGE_KEY);
      if (pendingSession) saveSession(pendingSession);
      state.reconnecting = false;
    }
    state.message = payload.message || payload.code;
  } else if (payload.event === "lobby_joined" || payload.event === "lobby_updated") {
    state.lobby = payload;
    state.message = "";
  } else if (payload.event === "lobby_started") {
    state.lobby = { ...(state.lobby || {}), ...payload, status: "started" };
    state.match = payload.matchState || state.match;
  } else if (payload.event === "lobby_closed") {
    state.lobby = null;
    state.match = null;
    state.me = null;
    state.pendingGameId = null;
    state.message = "The display host closed this room.";
  } else if (payload.event === "message") {
    try {
      const value = JSON.parse(payload.value);
      activeCabinet()?.applyMessage?.(state, payload.messageType, value);
    } catch { /* Ignore malformed wire messages. */ }
  }
  render();
}

function connect() {
  state.message = "Connecting to Jaybox...";
  render();
  socket = new WebSocket(makeServerUrl(location));
  socket.addEventListener("open", () => { state.connected = true; render(); });
  socket.addEventListener("message", (event) => {
    try { onPayload(JSON.parse(event.data)); } catch { state.message = "Jaybox sent an unreadable message."; render(); }
  });
  socket.addEventListener("close", () => {
    state.connected = false;
    state.message = "Connection lost. Retrying...";
    render();
    setTimeout(connect, 1500);
  });
  socket.addEventListener("error", () => { state.message = "Unable to reach the Jaybox server."; render(); });
}

connect();
