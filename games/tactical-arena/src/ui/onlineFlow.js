// Online Versus lobby (1v1 — a 2-player lobby). Owns the relay client for the whole
// lobby phase: connects on entry, runs quick-match / private-room pairing, and once
// the lobby owner starts AND both players' squads have been exchanged, builds the
// onlineSession and hands off to the match (onStartMatch). The match then owns the
// live socket — so onExit only tears the client down when we leave WITHOUT starting.
//
// Authority model (see onlineClient.js / onlineSession.js): deterministic lockstep
// over the generic v2 lobby. `lobby_started` hands every client an identical ordered
// `members` array + a shared `seed`; seat = index in members + 1. The lobby OWNER
// owns the match framing (board size), broadcast in-band via a `config` lobby_message
// so every client builds it identically. Squads are a BLIND pick: each player builds
// its own (the same roster pop-up as hot-seat) and broadcasts a `setup` message on
// start; the match builds only once every seat's squad is in. A future draft-pick
// mode (back-and-forth with bans) will replace the blind exchange, not this transport.
import { createSquadPicker, DEFAULT_SQUAD } from "./squadPicker.js";
import { createOnlineClient, normalizeRoomCode } from "../online/onlineClient.js";
import { createOnlineSession } from "../online/onlineSession.js";

const RULESET_VERSION = 1; // bump when a wire/rules change makes mixed clients unsafe
const BOARD_SIZES = [13, 15];
const PLAYER_COLOR = { 1: "#5288c6", 2: "#c4463f", 3: "#d8a33f", 4: "#48a86f" };
const TEAM_COLOR = { 1: "#5288c6", 2: "#c4463f" };

export function createOnlineFlow({ onStartMatch }) {
  const el = document.querySelector('[data-screen="onlineSetup"]');
  const $ = (sel) => el.querySelector(sel);

  const statusEl = $('[data-online="status"]');
  const idlePanel = $('[data-online-panel="idle"]');
  const lobbyPanel = $('[data-online-panel="lobby"]');
  const codeInput = $('[data-online="codeInput"]');
  const roomCodeEl = $('[data-online="roomCode"]');
  const rosterEl = $('[data-online="roster"]');
  const hostHintEl = $('[data-online="hostHint"]');
  const lobbyHintEl = $('[data-online="lobbyHint"]');
  const startBtn = $('[data-online="startBtn"]');
  const squadHost = $('[data-online="squadHost"]');
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];

  let client = null;
  let handedOff = false;

  let lobby = null; // latest normalized lobby snapshot
  let myClientId = null;
  let isOwner = false;

  // Owner-authored framing, mirrored to every client via `config`.
  const config = {
    rulesetVersion: RULESET_VERSION,
    size: 13,
    format: "ffa",
    teamColors: { ...TEAM_COLOR },
    teamNames: { 1: "", 2: "" },
  };
  let receivedConfig = null; // what a non-owner adopts from the owner

  // Local blind squad pick — same roster pop-up as hot-seat.
  const squadPicker = createSquadPicker({ title: "Your squad", initial: DEFAULT_SQUAD, accent: PLAYER_COLOR[1], allowDuplicates: true });
  squadHost.replaceChildren(squadPicker.el);

  // Match-start staging — filled from lobby_started (+ setup messages), consumed once.
  let seed = null;
  let mySeat = null;
  let membersAtStart = null;
  const compositionsBySeat = {};

  // ── view helpers ───────────────────────────────────────────────────────────
  function setPanel(name) {
    idlePanel.hidden = name !== "idle";
    lobbyPanel.hidden = name !== "lobby";
  }
  function setStatus(text) {
    statusEl.textContent = text;
  }
  function activeConfig() {
    return isOwner ? config : receivedConfig;
  }
  function playerCount() {
    return lobby?.players?.length ?? 0;
  }

  function formatForCount(count = playerCount()) {
    return count === 4 ? "teams" : "ffa";
  }

  function identity() {
    try {
      return {
        playerId: window.FactoryIdentity?.getPlayerId?.() ?? "",
        displayName: window.FactoryIdentity?.getProfileName?.() ?? "Commander",
      };
    } catch {
      return { playerId: "", displayName: "Commander" };
    }
  }

  function pushConfig() {
    config.format = formatForCount();
    client?.sendConfig({
      rulesetVersion: RULESET_VERSION,
      size: config.size,
      format: config.format,
      teamColors: { ...config.teamColors },
      teamNames: { ...config.teamNames },
    });
  }

  function renderRoster() {
    rosterEl.replaceChildren();
    const count = playerCount();
    const teams = formatForCount(count) === "teams";
    for (const p of lobby?.players ?? []) {
      const li = document.createElement("li");
      li.className = "lobby-roster-item";
      const tags = [];
      if (p.id === lobby?.ownerId) tags.push('<span class="lobby-tag host">Host</span>');
      if (p.id === myClientId) tags.push('<span class="lobby-tag you">You</span>');
      if (teams) {
        const team = p.seat % 2 === 1 ? 1 : 2;
        li.style.setProperty("--team", TEAM_COLOR[team] ?? PLAYER_COLOR[1]);
        tags.push(`<span class="lobby-tag team">Team ${team}</span>`);
      } else {
        li.style.setProperty("--team", PLAYER_COLOR[p.seat] ?? PLAYER_COLOR[1]);
      }
      li.innerHTML =
        `<span class="lobby-seat">${p.seat}</span>` +
        `<span class="lobby-name">${escapeHtml(p.name)}</span>` +
        `<span class="lobby-tags">${tags.join("")}</span>`;
      rosterEl.appendChild(li);
    }
  }

  function syncUI() {
    const cfg = activeConfig() ?? config;
    cfg.format = formatForCount();
    selectSeg(cfg.size);
    for (const seg of sizeSegs) seg.disabled = !isOwner;
    hostHintEl.textContent = isOwner ? "(you set it)" : "(set by host)";
    renderRoster();
    syncStart();
  }

  function selectSeg(size) {
    for (const seg of sizeSegs) seg.classList.toggle("is-selected", Number(seg.dataset.size) === size);
  }

  function syncStart() {
    const count = playerCount();
    const ready = count === 2 || count === 4;
    startBtn.hidden = !isOwner;
    startBtn.disabled = !(isOwner && ready);
    if (isOwner) {
      lobbyHintEl.hidden = ready;
      lobbyHintEl.textContent = count < 2
        ? "Waiting for an opponent to join..."
        : "Need either 2 players for a duel or 4 players for 2v2.";
    } else {
      lobbyHintEl.hidden = false;
      lobbyHintEl.textContent = "Waiting for the host to start…";
    }
  }

  function describeRelay(url) {
    return String(url || "").includes("localhost") || String(url || "").includes("127.0.0.1")
      ? "local relay"
      : "online relay";
  }

  // ── client wiring ────────────────────────────────────────────────────────
  function wireLobby() {
    const cb = client.cb;

    cb.onConnected = () => {
      setStatus(`Connected to ${describeRelay(client.getWebSocketUrl())}. Choose how to play.`);
      setPanel("idle");
    };

    cb.onLobbyJoined = (snapshot) => {
      lobby = snapshot;
      myClientId = client.getClientId();
      isOwner = lobby.ownerId === myClientId;
      setPanel("lobby");
      setStatus(isOwner ? "Your room — invite an opponent, then start." : "Joined the room.");
      roomCodeEl.hidden = false;
      roomCodeEl.textContent = `Room code: ${lobby.roomCode}`;
      syncUI();
      if (isOwner) pushConfig(); // seed every (future) joiner with the framing
    };

    cb.onLobbyUpdated = (snapshot) => {
      lobby = snapshot;
      const wasOwner = isOwner;
      isOwner = lobby.ownerId === myClientId;
      // Promoted to owner (previous host left): adopt the last shared config.
      if (isOwner && !wasOwner && receivedConfig) Object.assign(config, receivedConfig);
      syncUI();
    };

    cb.onRemoteConfig = (cfg) => {
      if (isOwner) return;
      if (cfg.rulesetVersion !== RULESET_VERSION) {
        setStatus("Rules version mismatch. Refresh before starting this match.");
        return;
      }
      receivedConfig = { ...receivedConfig, ...cfg, format: formatForCount() };
      syncUI();
      tryStart();
    };

    cb.onLobbyStarted = ({ seed: matchSeed, members, myClientId: id }) => {
      myClientId = id ?? myClientId;
      membersAtStart = Array.isArray(members) ? members.slice() : [];
      mySeat = membersAtStart.indexOf(myClientId) + 1;
      isOwner = lobby?.ownerId === myClientId;
      seed = matchSeed;
      setStatus("Match starting…");

      const composition = squadPicker.getSquad();
      compositionsBySeat[mySeat] = composition;
      client.sendSetup({ seat: mySeat, composition });
      if (isOwner) pushConfig(); // ensure the final framing is out
      tryStart();
    };

    cb.onRemoteSetup = ({ seat, composition }) => {
      if (!seat) return;
      compositionsBySeat[seat] = Array.isArray(composition) ? composition : [...DEFAULT_SQUAD];
      tryStart();
    };

    cb.onError = (_code, message) => {
      setStatus(message || "Connection problem. Try again.");
    };

    cb.onClosed = () => {
      if (handedOff) return;
      setPanel("idle");
      setStatus("Disconnected. Try again.");
      resetLobbyState();
    };
  }

  // Build the session and hand off — only once the shared seed, the owner's config,
  // the ordered roster, and BOTH seats' squads are known.
  function tryStart() {
    if (handedOff || seed == null || !mySeat || mySeat < 1 || !membersAtStart) return;
    const cfg = activeConfig();
    if (!cfg) return;
    if (cfg.rulesetVersion !== RULESET_VERSION) {
      setStatus("Rules version mismatch. Refresh before starting this match.");
      return;
    }
    const count = membersAtStart.length;
    for (let seat = 1; seat <= count; seat += 1) {
      if (!compositionsBySeat[seat]) return; // a squad is still missing
    }

    const session = createOnlineSession({
      client,
      mySeat,
      isOwner,
      members: membersAtStart,
      seed,
      size: cfg.size,
    });
    handedOff = true; // onExit must NOT disconnect — the match owns the client now

    const squads = {};
    for (let seat = 1; seat <= count; seat += 1) squads[seat] = compositionsBySeat[seat];

    const format = formatForCount(count);
    onStartMatch({
      mode: "online",
      net: session,
      seed,
      size: cfg.size,
      mySeat,
      squads,
      playerCount: count,
      format,
      teamColors: format === "teams" ? { ...cfg.teamColors } : null,
      teamNames: format === "teams" ? { ...cfg.teamNames } : null,
    });
  }

  function resetLobbyState() {
    lobby = null;
    isOwner = false;
    receivedConfig = null;
    seed = null;
    mySeat = null;
    membersAtStart = null;
    for (const key of Object.keys(compositionsBySeat)) delete compositionsBySeat[key];
    roomCodeEl.hidden = true;
  }

  // ── one-time control wiring (the section persists across enter/exit) ─────────
  $('[data-action="quickMatch"]').addEventListener("click", () => client?.findLobby());
  $('[data-action="createRoom"]').addEventListener("click", () => client?.createLobby());
  $('[data-action="joinRoom"]').addEventListener("click", () => {
    const code = normalizeRoomCode(codeInput.value);
    codeInput.value = code;
    if (code.length !== 5) { setStatus("Enter the 5-character room code to join."); return; }
    client?.joinLobby(code);
  });
  codeInput.addEventListener("input", () => {
    const normalized = normalizeRoomCode(codeInput.value);
    if (codeInput.value !== normalized) codeInput.value = normalized;
  });
  startBtn.addEventListener("click", () => { if (isOwner) client?.startLobby(); });
  $('[data-action="leaveLobby"]').addEventListener("click", () => {
    client?.leaveLobby();
    resetLobbyState();
    setPanel("idle");
    setStatus(`Connected to ${describeRelay(client?.getWebSocketUrl())}. Choose how to play.`);
  });
  for (const seg of sizeSegs) {
    seg.addEventListener("click", () => {
      if (!isOwner || seg.disabled) return;
      const chosen = Number(seg.dataset.size);
      if (!BOARD_SIZES.includes(chosen)) return;
      config.size = chosen;
      selectSeg(chosen);
      pushConfig();
    });
  }

  // ── screen lifecycle (ScreenManager onEnter/onExit) ──────────────────────────
  function onEnter() {
    handedOff = false;
    myClientId = null;
    resetLobbyState();
    setPanel("none");
    setStatus("Connecting to the network…");
    client = createOnlineClient();
    client.setIdentity(identity());
    wireLobby();
    client.connect();
  }

  function onExit() {
    // Leaving without starting a match: drop the connection. After a successful
    // handoff the match owns the socket, so leave it alone.
    if (client && !handedOff) client.disconnect();
    client = null;
  }

  return { el, onEnter, onExit };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
