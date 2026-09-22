import { loadFactoryProfile } from "../../../js/platform/identity/factory-profile.mjs";
import { Game } from "./game.js";
import { createInputManager } from "./input/input-manager.js";
import { createNetClient } from "./network/net-client.js";
import { normalizeSnapshot } from "./network/protocol.js";
import { createRenderer } from "./render/renderer.js";

const canvas = document.querySelector("#gameCanvas");
const renderer = createRenderer(canvas);
const input = createInputManager();
const profile = loadFactoryProfile();
const factoryName = profile?.displayName || profile?.name || "Player 1";
let difficulty = "normal";
let currentMode = "local";
let announcementTimer = null;
let onlineLobby = null;
let localReady = false;

const hud = {
  p1Name: document.querySelector('[data-hud="p1-name"]'),
  p2Name: document.querySelector('[data-hud="p2-name"]'),
  p1Score: document.querySelector('[data-hud="p1-score"]'),
  p2Score: document.querySelector('[data-hud="p2-score"]'),
  mode: document.querySelector('[data-hud="mode"]'),
  status: document.querySelector('[data-hud="status"]'),
  announcement: document.querySelector('[data-hud="announcement"]'),
};

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  });
}

function announce(text, duration = 800) {
  clearTimeout(announcementTimer);
  hud.announcement.textContent = text;
  hud.announcement.classList.toggle("is-visible", !!text);
  if (text && duration > 0) {
    announcementTimer = setTimeout(() => hud.announcement.classList.remove("is-visible"), duration);
  }
}

function phaseLabel(match) {
  if (match.phase === "SERVE_PREVIEW") return "TRACK THE SERVE";
  if (match.phase === "PLAYING") {
    if (!match.ball.lastTouchPlayerId) return "NEUTRAL BALL";
    const receiver = match.players.find((player) => player.id !== match.ball.lastTouchPlayerId);
    return `${receiver?.displayName || "Opponent"} return`;
  }
  if (match.phase === "POINT_SCORED") return "POINT";
  if (match.phase === "ROUND_RESET") return "RESETTING";
  if (match.phase === "MATCH_OVER") return "MATCH OVER";
  return match.phase.replaceAll("_", " ");
}

function updateHud(match, events) {
  hud.p1Name.textContent = match.players[0].displayName;
  hud.p2Name.textContent = match.players[1].displayName;
  hud.p1Score.textContent = match.players[0].score;
  hud.p2Score.textContent = match.players[1].score;
  hud.mode.textContent = currentMode.toUpperCase();
  hud.status.textContent = phaseLabel(match);
  for (const event of events) {
    if (event.type === "POINT_SCORED") {
      const scorer = match.players.find((player) => player.id === event.playerId);
      announce(`${scorer?.displayName || "Player"} scores`, 900);
    } else if (event.type === "DOUBLE_TOUCH_FAULT") {
      const offender = match.players.find((player) => player.id === event.playerId);
      announce(`Double touch — ${offender?.displayName || "Player"} fault`, 1100);
    } else if (event.type === "MATCH_ENDED") {
      const winner = match.players.find((player) => player.id === event.winnerId);
      announce(`${winner?.displayName || "Player"} wins`, 0);
    }
  }
}

const game = new Game({ renderer, input, onUpdate: updateHud });

function startOffline(mode) {
  currentMode = mode;
  showScreen("game");
  const players = mode === "cpu"
    ? [{ displayName: factoryName }, { displayName: `${difficulty[0].toUpperCase()}${difficulty.slice(1)} CPU` }]
    : [{ displayName: factoryName }, { displayName: "Player 2" }];
  game.start({ mode, difficulty, players });
}

document.querySelector('[data-action="single-player"]').addEventListener("click", () => startOffline("cpu"));
document.querySelector('[data-action="local-multiplayer"]').addEventListener("click", () => startOffline("local"));
document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    difficulty = button.dataset.difficulty;
    document.querySelectorAll("[data-difficulty]").forEach((item) => item.classList.toggle("is-selected", item === button));
  });
});

document.querySelector('[data-action="quit-match"]').addEventListener("click", () => {
  game.stop();
  if (currentMode === "online") net.leaveRoom();
  announce("");
  showScreen("menu");
});

document.querySelector('[data-action="toggle-debug"]').addEventListener("click", () => renderer.toggleDebug());
window.addEventListener("keydown", (event) => {
  if (event.code === "F3") {
    event.preventDefault();
    renderer.toggleDebug();
  }
});

// Online UI and transport remain outside the simulation. The server sends only
// authoritative snapshots; this browser sends only normalized orbit commands.
const onlineStatus = document.querySelector('[data-online="status"]');
const onlineCode = document.querySelector('[data-online="room-code"]');
const onlineCodeInput = document.querySelector('[data-online="room-code-input"]');
const onlineRoster = document.querySelector('[data-online="roster"]');
const onlineNote = document.querySelector('[data-online="lobby-note"]');
const readyButton = document.querySelector('[data-action="ready"]');
const net = createNetClient();
net.setIdentity({ playerId: profile?.playerId || "", displayName: factoryName });

function showOnlinePanel(name) {
  document.querySelectorAll("[data-online-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.onlinePanel !== name;
  });
}

function renderLobby(lobby) {
  onlineLobby = lobby;
  showOnlinePanel("lobby");
  onlineStatus.textContent = lobby.private ? "Private room" : "Public match found";
  onlineCode.textContent = lobby.private ? `ROOM ${lobby.roomCode}` : "PUBLIC MATCH";
  const players = Array.isArray(lobby.players) ? lobby.players : [];
  onlineRoster.innerHTML = players.map((player, index) => `
    <div class="roster-player ${player.ready ? "is-ready" : ""}">
      <b>${escapeHtml(player.displayName || `Player ${index + 1}`)}</b>
      <span>${player.ready ? "READY" : "NOT READY"}</span>
    </div>
  `).join("") + (players.length < 2 ? '<div class="roster-player"><b>Waiting…</b><span>SHARE THE CODE</span></div>' : "");
  const me = players[lobby.yourPlayerIndex ?? -1];
  localReady = !!me?.ready;
  readyButton.textContent = localReady ? "Cancel Ready" : "Ready";
  onlineNote.textContent = players.length < 2 ? "Waiting for a second player." : "Match starts when both players are ready.";
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}

net.on({
  open() {
    onlineStatus.textContent = "Choose how to play.";
    showOnlinePanel("entry");
  },
  close() {
    if (document.querySelector('[data-screen="online"]').classList.contains("is-active")) {
      onlineStatus.textContent = "Disconnected. Reopen Online Multiplayer to retry.";
    }
  },
  error(error) {
    onlineStatus.textContent = error.message || "Online play is unavailable.";
  },
  searching() {
    onlineStatus.textContent = "Public matchmaking";
    showOnlinePanel("searching");
  },
  searchCancelled() {
    onlineStatus.textContent = "Search cancelled.";
    showOnlinePanel("entry");
  },
  lobby: renderLobby,
  matchStarted(payload) {
    currentMode = "online";
    const players = Array.isArray(payload.players) ? payload.players : onlineLobby?.players;
    showScreen("game");
    game.start({
      mode: "online",
      seed: payload.seed,
      players,
      network: net,
      localPlayerIndex: payload.yourPlayerIndex ?? onlineLobby?.yourPlayerIndex ?? 0,
    });
    const snapshot = normalizeSnapshot(payload.snapshot);
    if (snapshot) game.applyAuthoritativeSnapshot(snapshot);
  },
  snapshot(payload) {
    const snapshot = normalizeSnapshot(payload.snapshot || payload);
    if (snapshot) game.applyAuthoritativeSnapshot(snapshot);
  },
  matchEnded(payload) {
    const snapshot = normalizeSnapshot(payload.snapshot);
    if (snapshot) game.applyAuthoritativeSnapshot({ ...snapshot, winnerId: payload.winnerId });
    const winnerName = game.match.players.find((player) => player.id === payload.winnerId)?.displayName;
    announce(`${winnerName || "Player"} wins`, 0);
  },
  playerLeft() {
    if (currentMode === "online") announce("Opponent disconnected", 0);
  },
});

document.querySelector('[data-action="online-multiplayer"]').addEventListener("click", () => {
  showScreen("online");
  showOnlinePanel("entry");
  onlineStatus.textContent = net.isOpen() ? "Choose how to play." : "Connecting to match server…";
  net.connect();
});
document.querySelector('[data-action="find-match"]').addEventListener("click", () => net.findMatch());
document.querySelector('[data-action="cancel-search"]').addEventListener("click", () => net.cancelSearch());
document.querySelector('[data-action="create-room"]').addEventListener("click", () => net.createRoom());
document.querySelector('[data-action="join-room"]').addEventListener("click", () => net.joinRoom(onlineCodeInput.value));
onlineCodeInput.addEventListener("input", () => { onlineCodeInput.value = onlineCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
onlineCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") net.joinRoom(onlineCodeInput.value); });
readyButton.addEventListener("click", () => net.setReady(!localReady));
document.querySelector('[data-action="online-back"]').addEventListener("click", () => {
  net.leaveRoom();
  showScreen("menu");
});
