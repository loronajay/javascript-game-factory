import { deriveControllerScreen, deriveDisplayScreen, makeServerUrl } from "./jaybox-client-model.mjs";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const role = params.get("mode") === "controller" ? "controller" : "display";
const STORAGE_KEY = `jaybox:${role}:session`;
const state = { role, lobby: null, match: null, me: null, connected: false, reconnecting: false, message: "" };
let socket = null;
let pendingSession = null;
let reconnectAttempted = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
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
    state.message = "Trying to reconnect to Jaybox…";
    render();
    return;
  }
  socket.send(JSON.stringify({ type, ...payload }));
}

function playerCards(players = [], showGold = false) {
  return players.map((player) => `
    <article class="player ${player.status === "jury" ? "jury" : ""} ${player.connected === false ? "disconnected" : ""}">
      <strong>${escapeHtml(state.lobby?.players?.find((entry) => entry.id === player.id)?.name || player.name)}</strong>
      <div class="role">${player.status === "jury" ? "Jury" : "Vault access"}${player.connected === false ? " · reconnecting" : ""}</div>
      ${showGold && Number.isFinite(player.gold) ? `<div class="gold">${player.gold} gold</div>` : ""}
    </article>`).join("");
}

function displayView() {
  const screen = deriveDisplayScreen(state);
  if (screen === "catalog") {
    return `<section class="hero"><div class="hero-card"><div class="brand">Jay<span>box</span></div><h1>Put greed<br><em>on trial.</em></h1><p class="lede">One screen. Everyone’s phone. Every vault move is secret—until the numbers start talking.</p><div class="catalog-card panel"><div><div class="eyebrow">First cabinet</div><h2>Pot of Greed</h2><p class="hint">4–8 players · 15–25 minutes · social deduction</p></div><button class="button" data-action="create-room">Host a room</button></div><p class="status">${escapeHtml(state.message)}</p></div></section>`;
  }
  const lobby = state.lobby;
  if (screen === "lobby") {
    const joinUrl = `${location.origin}${location.pathname}?mode=controller`;
    return `<div class="shell"><header class="topbar"><div class="brand">Jay<span>box</span> / Pot of Greed</div><span class="pill">Lobby</span></header><section class="hero"><div class="hero-card"><div class="eyebrow">Join on your phone</div><div class="room-code">${escapeHtml(lobby.roomCode)}</div><p class="lede">Open <b>${escapeHtml(joinUrl)}</b>, enter this code, and choose a name.</p><div class="lobby-meta panel"><span><b>${lobby.playerCount}</b> of ${lobby.maxPlayers} players</span><span>${lobby.minPlayers} needed to start</span></div><div class="grid">${playerCards((lobby.members || []).map((id, index) => ({ id, name: `Player ${index + 1}`, status: "active" })))}</div><p class="status">${escapeHtml(state.message)}</p><button class="button" data-action="start-game" ${lobby.playerCount < lobby.minPlayers ? "disabled" : ""}>Start Pot of Greed</button></div></section></div>`;
  }
  const match = state.match;
  const showGold = match.cycleType === "show" || match.phase === "final_results";
  const audit = match.audit;
  const vote = match.lastVoteResult;
  return `<div class="shell"><header class="topbar"><div class="brand">Jay<span>box</span> / Pot of Greed</div><span class="pill">Cycle ${match.cycleNumber} · ${escapeHtml(match.cycleType)}</span></header><section class="screen-title"><div><h2>${escapeHtml(match.phase.replaceAll("_", " "))}</h2><p class="hint">${match.phase.includes("discussion") ? "Talk it out. The vault remembers everything, but it tells no one why." : "Your controllers will tell you when it’s time to act."}</p></div><span class="pill">${match.voteProgress?.submitted || 0}/${match.voteProgress?.eligible || 0} votes</span></section><div class="match-layout"><section class="panel vault"><div class="eyebrow">Shared vault</div><div class="amount">${match.vaultGold}</div><div class="gold">gold</div></section><section class="panel audit"><div class="eyebrow">Latest audit</div>${audit ? `<div><span class="hint">Before</span><b>${audit.vaultBefore}</b></div><div><span class="hint">After</span><b>${audit.vaultAfter}</b></div><div><span class="hint">Net change</span><b class="${audit.netChange < 0 ? "danger" : "gold"}">${audit.netChange > 0 ? "+" : ""}${audit.netChange}</b></div>` : `<p class="hint">The first audit arrives after everyone locks a vault choice.</p>`}</section></div><section class="panel"><div class="phase-row"><h3>Players</h3><span class="pill">${showGold ? "Balances revealed" : "Balances private"}</span></div><div class="grid">${playerCards(match.players, showGold)}</div></section>${vote ? `<section class="panel result-row"><div><div class="eyebrow">Last accusation</div><h3>${escapeHtml(match.players.find((p) => p.id === vote.selectedId)?.name || "Player")} was ${vote.correct ? "caught stealing" : "wrongly accused"}</h3></div><div class="gold">${vote.fine ? `${vote.fine} gold fine` : "Jury lockout"}</div></section>` : ""}</div>`;
}

function controllerView() {
  const screen = deriveControllerScreen(state);
  const top = `<header class="topbar"><div class="brand">Jay<span>box</span></div><span class="pill">${state.connected ? "online" : "connecting"}</span></header>`;
  if (screen === "join") return `<main class="shell controller">${top}<section class="panel"><div class="eyebrow">Pot of Greed</div><h2>Join the table</h2><form class="form" data-form="join"><label>Room code<input name="roomCode" autocomplete="off" maxlength="5" placeholder="ABCDE" required></label><label>Your name<input name="displayName" maxlength="18" placeholder="Your name" required></label><button class="button">Join room</button></form><p class="status">${escapeHtml(state.message)}</p></section></main>`;
  if (screen === "reconnect") return `<main class="shell controller">${top}<section class="panel"><h2>Finding your seat…</h2><p class="hint">Jaybox is restoring your gold, jury status, and any action you already locked.</p></section></main>`;
  const match = state.match;
  if (screen === "lobby") return `<main class="shell controller">${top}<section class="panel"><div class="eyebrow">Room ${escapeHtml(state.lobby.roomCode)}</div><h2>You’re in.</h2><p class="hint">The display host starts once ${state.lobby.minPlayers} players have joined. Your name and seat lock when the game begins.</p><div class="notice">${state.lobby.playerCount} players connected</div></section></main>`;
  const me = state.me || {};
  if (screen === "vault_action") return `<main class="shell controller">${top}<section class="panel"><div class="eyebrow">Cycle ${match.cycleNumber} · your private balance</div><h2><span class="gold">${me.gold}</span> gold</h2><p class="hint">Choose one vault action. Your choice locks immediately and stays secret.</p><div class="actions"><button class="button secondary" data-vault="pass">Pass</button><button class="button" data-vault="steal" data-amount="3">Steal 3</button><button class="button" data-vault="steal" data-amount="5">Steal 5</button><button class="button" data-vault="steal" data-amount="8">Steal 8</button>${match.cycleType === "hidden" ? `<button class="button secondary" data-vault="invest" data-amount="3">Invest 3<br>→ 6</button><button class="button secondary" data-vault="invest" data-amount="5">Invest 5<br>→ 11</button><button class="button secondary" data-vault="invest" data-amount="8">Invest 8<br>→ 18</button>` : ""}</div><p class="status">${me.submittedAction ? "Locked. No peeking." : ""}</p></section></main>`;
  if (screen === "vote") {
    const active = (match.players || []).filter((player) => player.status === "active" && player.id !== me.id);
    const canVote = match.phase.includes("vote");
    return `<main class="shell controller">${top}<section class="panel"><div class="eyebrow">Your balance · <span class="gold">${me.gold}</span> gold</div><h2>${canVote ? "Cast a secret vote" : "Discussion underway"}</h2><p class="hint">${canVote ? "Only active vault players can be targeted. Your vote remains private until the reveal." : "Listen closely. Voting unlocks when discussion ends."}</p><div class="form">${active.map((player) => `<button class="button secondary" data-vote="${escapeHtml(player.id)}" ${canVote || me.submittedVote ? "" : "disabled"}>${escapeHtml(player.name)}</button>`).join("")}</div><p class="status">${me.submittedVote ? "Vote locked." : ""}</p></section></main>`;
  }
  return `<main class="shell controller">${top}<section class="panel"><div class="eyebrow">Your balance</div><h2><span class="gold">${me.gold ?? "—"}</span> gold</h2><p class="hint">${me.status === "jury" ? "You’re on the jury: no vault access, but your vote and your gold still matter." : "Wait for the display to move into the next phase."}</p></section></main>`;
}

function render() {
  app.innerHTML = state.role === "display" ? displayView() : controllerView();
  app.querySelector("[data-action='create-room']")?.addEventListener("click", () => send("create_lobby", { gameId: "pot-of-greed", role: "display", private: true }));
  app.querySelector("[data-action='start-game']")?.addEventListener("click", () => send("start_lobby"));
  app.querySelector("[data-form='join']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    send("join_lobby", { roomCode: String(form.get("roomCode")).toUpperCase(), identity: { displayName: form.get("displayName") } });
  });
  app.querySelectorAll("[data-vault]").forEach((button) => button.addEventListener("click", () => {
    send("lobby_message", { messageType: "pot_of_greed_vault_action", value: JSON.stringify({ type: button.dataset.vault, amount: Number(button.dataset.amount || 0) }) });
  }));
  app.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => {
    send("lobby_message", { messageType: "pot_of_greed_vote", value: JSON.stringify({ targetId: button.dataset.vote }) });
  }));
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
    state.message = "The display host closed this room.";
  } else if (payload.event === "message") {
    try {
      const value = JSON.parse(payload.value);
      if (payload.messageType === "pot_of_greed_public_state") state.match = value;
      if (payload.messageType === "pot_of_greed_private_state") {
        state.match = value;
        state.me = value.me;
      }
    } catch { /* Ignore malformed wire messages. */ }
  }
  render();
}

function connect() {
  state.message = "Connecting to Jaybox…";
  render();
  socket = new WebSocket(params.get("server") || makeServerUrl(location));
  socket.addEventListener("open", () => { state.connected = true; render(); });
  socket.addEventListener("message", (event) => {
    try { onPayload(JSON.parse(event.data)); } catch { state.message = "Jaybox sent an unreadable message."; render(); }
  });
  socket.addEventListener("close", () => {
    state.connected = false;
    state.message = "Connection lost. Retrying…";
    render();
    setTimeout(connect, 1500);
  });
  socket.addEventListener("error", () => { state.message = "Unable to reach the Jaybox server."; render(); });
}

connect();
