import {
  bindCommonControls,
  bindSegmented,
  buildSwatchRow,
  paintSwatchRow,
  screenRoot,
  selectSeg,
} from "./common.js";
import { BOARD_SIZES, PLAYER_COLORS } from "../../config.js";
import { createOnlineClient } from "../../online/onlineClient.js";
import { createOnlineSession } from "../../online/onlineSession.js";
import { createSquadPicker } from "./squadBuilder.js";
import { DEFAULT_COMPOSITION } from "../../core/composition.js";

// Online Versus lobby (2-4 players, FFA + 2v2 teams). Owns the relay client for the
// whole lobby phase: connects on entry, runs quick-match / private-room pairing, and
// once the lobby owner starts AND every player's squad has been exchanged, builds the
// onlineSession and hands off to the match screen. The match then owns the live socket
// — so onExit only tears the client down when we leave WITHOUT starting a match.
//
// Authority model (see onlineClient.js / onlineSession.js): deterministic lockstep over
// the generic v2 lobby. `lobby_started` hands every client an identical ordered
// `members` array + a shared `seed`; seat = index in members + 1. The lobby OWNER owns
// the match framing (board size, format, team colors/names), broadcast in-band via a
// `config` lobby_message so every client renders and builds it identically. Squads are a
// blind pick: each player builds its own and broadcasts a `setup` message on start, and
// the match builds only once every seat's squad is in.

const HUES = [PLAYER_COLORS[1], PLAYER_COLORS[2], PLAYER_COLORS[3], PLAYER_COLORS[4]];

export function createOnlineSetupScreen(ctx) {
  const el = screenRoot("onlineSetup");
  bindCommonControls(el, ctx);

  const statusEl = el.querySelector('[data-online="status"]');
  const idlePanel = el.querySelector('[data-online-panel="idle"]');
  const lobbyPanel = el.querySelector('[data-online-panel="lobby"]');
  const codeInput = el.querySelector('[data-online="codeInput"]');
  const roomCodeEl = el.querySelector('[data-online="roomCode"]');
  const rosterEl = el.querySelector('[data-online="roster"]');
  const rosterCountEl = el.querySelector('[data-online="rosterCount"]');
  const hostHintEl = el.querySelector('[data-online="hostHint"]');
  const lobbyHintEl = el.querySelector('[data-online="lobbyHint"]');
  const startBtn = el.querySelector('[data-online="startBtn"]');

  const groups = {
    format: el.querySelector('[data-group="format"]'),
    teamNames: el.querySelector('[data-group="teamNames"]'),
    teamColors: el.querySelector('[data-group="teamColors"]'),
  };
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];

  let client = null;
  let handedOff = false;

  // Lobby snapshot + identity.
  let lobby = null; // latest normalized lobby payload
  let myClientId = null;
  let isOwner = false;

  // Owner-authored match framing (mirrored live to every client via `config`).
  const config = {
    size: 10,
    format: "ffa",
    teamColors: { 1: PLAYER_COLORS[1], 2: PLAYER_COLORS[4] },
    teamNames: { 1: "", 2: "" },
  };
  // The config a non-owner adopts from the owner's `config` message.
  let receivedConfig = null;

  // Local squad pick (Standard keeps the classic one-of-each squad).
  let customSquads = false;
  const squadHost = el.querySelector("[data-squad-pickers]");
  const squadHint = el.querySelector("[data-squad-hint]");
  const squadPicker = createSquadPicker({ title: "Your squad", accent: PLAYER_COLORS[1] });

  // Match-start staging — filled from lobby_started (+ setup messages), consumed once.
  let seed = null;
  let mySeat = null;
  let membersAtStart = null;
  const compositionsBySeat = {};

  // ── owner config controls ──────────────────────────────────────────────────
  bindSegmented(el, "boardSize", (seg) => {
    if (!isOwner) return;
    const chosen = Number(seg.dataset.size);
    if (BOARD_SIZES.includes(chosen) && !seg.disabled) {
      config.size = chosen;
      pushConfig();
    }
  });

  bindSegmented(el, "format", (seg) => {
    if (!isOwner) return;
    config.format = seg.dataset.format;
    syncConfigUI();
    pushConfig();
  });

  for (const team of [1, 2]) {
    buildSwatchRow(el, team, HUES, (hue) => {
      if (!isOwner) return;
      const other = team === 1 ? 2 : 1;
      if (hue === config.teamColors[other]) return;
      config.teamColors[team] = hue;
      renderSwatches();
      pushConfig();
    });
  }

  el.querySelectorAll(".team-name-input").forEach((input) => {
    input.addEventListener("input", () => {
      if (!isOwner) return;
      const team = input.dataset.teamName;
      config.teamNames[team] = input.value;
      syncTeamColorLabel(team);
      pushConfig();
    });
  });

  bindSegmented(el, "squadMode", (seg) => {
    customSquads = seg.dataset.squad === "custom";
    syncSquads();
  });

  // ── pairing actions ──────────────────────────────────────────────────────
  el.querySelector('[data-action="quickMatch"]').addEventListener("click", () => client?.findLobby());
  el.querySelector('[data-action="createRoom"]').addEventListener("click", () => client?.createLobby());
  el.querySelector('[data-action="joinRoom"]').addEventListener("click", () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      setStatus("Enter the room code to join.");
      return;
    }
    client?.joinLobby(code);
  });
  el.querySelector('[data-action="startMatch"]').addEventListener("click", () => {
    if (isOwner) client?.startLobby();
  });
  el.querySelector('[data-action="leaveLobby"]').addEventListener("click", () => {
    client?.leaveLobby();
    resetLobbyState();
    setPanel("idle");
    setStatus("Connected. Choose how to play.");
  });

  // ── view helpers ───────────────────────────────────────────────────────────
  function setPanel(name) {
    idlePanel.hidden = name !== "idle";
    lobbyPanel.hidden = name !== "lobby";
  }
  function setStatus(text) {
    statusEl.textContent = text;
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

  function activeConfig() {
    return isOwner ? config : receivedConfig;
  }

  function playerCount() {
    return lobby?.players?.length ?? 0;
  }

  // Broadcast the owner's framing so every client renders + builds it identically.
  function pushConfig() {
    client?.sendConfig({
      size: config.size,
      format: config.format,
      teamColors: { ...config.teamColors },
      teamNames: { ...config.teamNames },
    });
  }

  function renderRoster() {
    rosterEl.replaceChildren();
    const players = lobby?.players ?? [];
    const teams = activeConfig()?.format === "teams" && players.length === 4;
    for (const p of players) {
      const li = document.createElement("li");
      li.className = "lobby-roster-item";
      const tags = [];
      if (p.id === lobby?.ownerId) tags.push('<span class="lobby-tag host">Host</span>');
      if (p.id === myClientId) tags.push('<span class="lobby-tag you">You</span>');
      if (teams) {
        const teamId = p.seat % 2 === 1 ? 1 : 2;
        li.style.setProperty("--team", config.teamColors[teamId] ?? HUES[0]);
        tags.push(`<span class="lobby-tag team">Team ${teamId}</span>`);
      } else {
        li.style.setProperty("--team", PLAYER_COLORS[p.seat] ?? HUES[0]);
      }
      li.innerHTML =
        `<span class="lobby-seat">${p.seat}</span>` +
        `<span class="lobby-name">${escapeHtml(p.name)}</span>` +
        `<span class="lobby-tags">${tags.join("")}</span>`;
      rosterEl.appendChild(li);
    }
    rosterCountEl.textContent = `${players.length}/4`;
  }

  // Board size follows the locked rule (3-4 players force 13×13); format "teams"
  // needs exactly 4 players. Owner edits live; non-owners see it read-only.
  function syncConfigUI() {
    const cfg = activeConfig() ?? config;
    const count = playerCount();
    const multi = count > 2;
    if (multi) cfg.size = 13;

    selectSeg(el, "boardSize", (seg) => Number(seg.dataset.size) === cfg.size);
    for (const seg of sizeSegs) {
      const value = Number(seg.dataset.size);
      seg.disabled = !isOwner || (multi && value === 10);
    }

    // Format is offered only at exactly 4 players; otherwise force FFA.
    const teamsAllowed = count === 4;
    if (!teamsAllowed && cfg.format === "teams") cfg.format = "ffa";
    groups.format.hidden = !teamsAllowed;
    selectSeg(el, "format", (seg) => seg.dataset.format === cfg.format);
    for (const seg of groups.format.querySelectorAll(".seg")) seg.disabled = !isOwner;

    const teams = cfg.format === "teams" && teamsAllowed;
    groups.teamNames.hidden = !teams;
    groups.teamColors.hidden = !teams;
    el.querySelectorAll(".team-name-input").forEach((input) => {
      input.disabled = !isOwner;
      const team = input.dataset.teamName;
      if (!isOwner) input.value = cfg.teamNames?.[team] ?? "";
      syncTeamColorLabel(team);
    });
    renderSwatches();

    hostHintEl.textContent = isOwner ? "(you set it)" : "(set by host)";
    renderRoster();
    syncStart();
  }

  function renderSwatches() {
    const cfg = activeConfig() ?? config;
    for (const team of [1, 2]) {
      const other = team === 1 ? 2 : 1;
      paintSwatchRow(el, team, {
        selected: cfg.teamColors?.[team],
        taken: cfg.teamColors?.[other],
        locked: !isOwner,
      });
    }
  }

  function syncTeamColorLabel(team) {
    const cfg = activeConfig() ?? config;
    const label = el.querySelector(`[data-team-color-name="${team}"]`);
    if (label) label.textContent = (cfg.teamNames?.[team] || "").trim() || `Team ${team}`;
  }

  function syncSquads() {
    squadHost.hidden = !customSquads;
    squadHint.hidden = !customSquads;
    if (customSquads) squadHost.replaceChildren(squadPicker.el);
  }

  // The owner starts; everyone else waits. Teams needs the full 4 players.
  function syncStart() {
    const count = playerCount();
    const cfg = activeConfig() ?? config;
    const teamsReady = cfg.format !== "teams" || count === 4;
    startBtn.hidden = !isOwner;
    startBtn.disabled = !(isOwner && count >= 2 && teamsReady);
    if (isOwner) {
      lobbyHintEl.hidden = count >= 2 && teamsReady;
      lobbyHintEl.textContent =
        count < 2 ? "Waiting for another player to join…" : "Need 4 players for 2v2 teams.";
    } else {
      lobbyHintEl.hidden = false;
      lobbyHintEl.textContent = "Waiting for the host to start…";
    }
  }

  // ── client wiring ────────────────────────────────────────────────────────
  function wireLobby() {
    const cb = client.cb;

    cb.onConnected = () => {
      setStatus("Connected. Choose how to play.");
      setPanel("idle");
    };

    cb.onLobbyJoined = (snapshot, { created }) => {
      lobby = snapshot;
      myClientId = client.getClientId();
      isOwner = lobby.ownerId === myClientId;
      setPanel("lobby");
      setStatus(isOwner ? "Your lobby — invite players, then start." : "Joined the lobby.");
      roomCodeEl.hidden = false;
      roomCodeEl.textContent = `Room code: ${lobby.roomCode}`;
      syncConfigUI();
      syncSquads();
      if (isOwner) pushConfig(); // seed every (future) joiner with the framing
      void created;
    };

    cb.onLobbyUpdated = (snapshot) => {
      lobby = snapshot;
      const wasOwner = isOwner;
      isOwner = lobby.ownerId === myClientId;
      // Promoted to owner (previous host left): adopt the last shared config so our
      // edits continue from what everyone already sees.
      if (isOwner && !wasOwner && receivedConfig) Object.assign(config, receivedConfig);
      syncConfigUI();
    };

    cb.onRemoteConfig = (cfg) => {
      if (isOwner) return;
      receivedConfig = { ...receivedConfig, ...cfg };
      syncConfigUI();
      tryStart();
    };

    cb.onLobbyStarted = ({ seed: matchSeed, members, myClientId: id }) => {
      myClientId = id ?? myClientId;
      membersAtStart = Array.isArray(members) ? members.slice() : [];
      mySeat = membersAtStart.indexOf(myClientId) + 1;
      isOwner = lobby?.ownerId === myClientId;
      seed = matchSeed;
      setStatus("Match starting…");

      const composition = customSquads ? squadPicker.getComposition() : [...DEFAULT_COMPOSITION];
      compositionsBySeat[mySeat] = composition;
      client.sendSetup({ seat: mySeat, composition });
      if (isOwner) pushConfig(); // ensure late joiners hold the final framing
      tryStart();
    };

    cb.onRemoteSetup = ({ seat, composition }) => {
      if (!seat) return;
      compositionsBySeat[seat] = Array.isArray(composition) ? composition : [...DEFAULT_COMPOSITION];
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
  // the ordered roster, and EVERY seat's squad are known.
  function tryStart() {
    if (handedOff || seed == null || mySeat < 1 || !membersAtStart) return;
    const cfg = activeConfig();
    if (!cfg) return;
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

    const compositions = {};
    for (let seat = 1; seat <= count; seat += 1) compositions[seat] = compositionsBySeat[seat];

    ctx.nav("match", {
      mode: "online",
      net: session,
      seed,
      size: cfg.size,
      playerCount: count,
      format: cfg.format,
      teamColors: cfg.format === "teams" ? { ...cfg.teamColors } : null,
      teamNames: cfg.format === "teams" ? { ...cfg.teamNames } : null,
      compositions,
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

  function onEnter() {
    handedOff = false;
    myClientId = null;
    customSquads = false;
    resetLobbyState();
    selectSeg(el, "squadMode", (seg) => seg.dataset.squad === "standard");
    syncSquads();
    setPanel("none");
    setStatus("Connecting to the network…");
    client = createOnlineClient();
    client.setIdentity(identity());
    wireLobby();
    client.connect();
  }

  function onExit() {
    // Leaving without starting a match: drop the connection. After a successful
    // handoff the match screen owns the socket, so leave it alone.
    if (client && !handedOff) client.disconnect();
    client = null;
  }

  return { el, onEnter, onExit };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
