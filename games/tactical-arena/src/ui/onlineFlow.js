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
import { ONLINE_RULESET_VERSION } from "../online/ruleset.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { UNIT_TYPE_KEYS, groupedUnitTypes } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import { openSkinPicker } from "./skinPicker.js";
import { DRAFT_PICK_ORDER, applyDraftPick, canDraftType, createDraftState, currentDraftSeat, draftedTypes, isDraftComplete } from "./draftModel.js";

const RULESET_VERSION = ONLINE_RULESET_VERSION;
const BOARD_SIZES = [13, 15];
const PLAYER_COLOR = { 1: "#5288c6", 2: "#c4463f", 3: "#d8a33f", 4: "#48a86f" };
const TEAM_COLOR = { 1: "#5288c6", 2: "#c4463f" };
const MATCH_TYPES = Object.freeze({
  duel: Object.freeze({ minPlayers: 2, maxPlayers: 2, format: "ffa", label: "Classic 1v1" }),
  draft1v1: Object.freeze({ minPlayers: 2, maxPlayers: 2, format: "ffa", label: "Draft 1v1", draft: true }),
  ffa4: Object.freeze({ minPlayers: 4, maxPlayers: 4, format: "ffa", label: "4 Player FFA" }),
  teams4: Object.freeze({ minPlayers: 4, maxPlayers: 4, format: "teams", label: "2v2 Teams" }),
});

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
  const lockBtn = $('[data-online="lockBtn"]');
  const squadHost = $('[data-online="squadHost"]');
  const blindPickField = $('[data-online="blindPickField"]') ?? squadHost.closest(".setup-field");
  const draftField = $('[data-online="draftField"]');
  const draftHint = $('[data-online="draftHint"]');
  const draftTrack = $('[data-online="draftTrack"]');
  const draftSquads = $('[data-online="draftSquads"]');
  const draftRoster = $('[data-online="draftRoster"]');
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];
  const matchTypeSegs = [...el.querySelectorAll('[data-field="onlineMatchType"] .seg')];

  let client = null;
  let handedOff = false;

  let lobby = null; // latest normalized lobby snapshot
  let myClientId = null;
  let isOwner = false;
  let selectedMatchType = "duel";
  let localLocked = false;
  const readyByClientId = new Map();
  let draft = null;
  let draftMembersKey = "";

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
  const skinsBySeat = {};

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
  function lobbyPlayers() {
    return lobby?.players ?? [];
  }
  function allPlayersLocked(players = lobbyPlayers()) {
    return players.length > 0 && players.every((p) => readyByClientId.get(p.id) === true);
  }
  function forgetDepartedReadyStates() {
    const members = new Set(lobby?.members ?? []);
    for (const clientId of readyByClientId.keys()) {
      if (!members.has(clientId)) readyByClientId.delete(clientId);
    }
    if (myClientId) readyByClientId.set(myClientId, localLocked);
  }

  function normalizeMatchType(matchType) {
    return MATCH_TYPES[matchType] ? matchType : "duel";
  }

  function activeMatchType() {
    return normalizeMatchType(lobby?.settings?.matchType ?? selectedMatchType);
  }

  function matchTypeConfig(matchType = activeMatchType()) {
    return MATCH_TYPES[normalizeMatchType(matchType)];
  }

  function isDraftMatch(matchType = activeMatchType()) {
    return !!matchTypeConfig(matchType).draft;
  }

  function selectMatchType(type) {
    selectedMatchType = normalizeMatchType(type);
    for (const seg of matchTypeSegs) {
      seg.classList.toggle("is-selected", normalizeMatchType(seg.dataset.matchType) === selectedMatchType);
    }
  }

  function lobbyOptions() {
    const type = normalizeMatchType(selectedMatchType);
    const cfg = matchTypeConfig(type);
    return {
      minPlayers: cfg.minPlayers,
      maxPlayers: cfg.maxPlayers,
      settings: { matchType: type },
    };
  }

  function syncDraftMembership() {
    const cfg = matchTypeConfig();
    const key = isDraftMatch() && lobby?.members?.length === cfg.maxPlayers
      ? lobby.members.join("|")
      : "";
    if (!key) {
      draft = null;
      draftMembersKey = "";
      return;
    }
    if (key !== draftMembersKey) {
      draft = createDraftState({ seats: [1, 2] });
      draftMembersKey = key;
    }
  }

  function draftPlayer(seat) {
    return lobbyPlayers().find((p) => p.seat === Number(seat));
  }

  function localLobbySeat() {
    return lobbyPlayers().find((p) => p.id === myClientId)?.seat ?? mySeat;
  }

  function draftPlayerLabel(seat) {
    const player = draftPlayer(seat);
    if (!player) return `Player ${seat}`;
    return player.id === myClientId ? "You" : player.name;
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
    config.format = matchTypeConfig().format;
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
    const teams = activeMatchType() === "teams4";
    const draftMode = isDraftMatch();
    for (const p of lobby?.players ?? []) {
      const li = document.createElement("li");
      li.className = "lobby-roster-item";
      const tags = [];
      if (p.id === lobby?.ownerId) tags.push('<span class="lobby-tag host">Host</span>');
      if (p.id === myClientId) tags.push('<span class="lobby-tag you">You</span>');
      if (draftMode) {
        const pickCount = draft?.picks?.[p.seat]?.length ?? 0;
        tags.push(
          pickCount >= 4
            ? '<span class="lobby-tag ready">Drafted</span>'
            : '<span class="lobby-tag picking">Drafting</span>',
        );
      } else {
        tags.push(
          readyByClientId.get(p.id) === true
            ? '<span class="lobby-tag ready">Locked</span>'
            : '<span class="lobby-tag picking">Picking</span>',
        );
      }
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
    syncDraftMembership();
    const cfg = activeConfig() ?? config;
    cfg.format = matchTypeConfig().format;
    selectSeg(cfg.size);
    for (const seg of sizeSegs) seg.disabled = !isOwner;
    hostHintEl.textContent = isOwner ? "(you set it)" : "(set by host)";
    const draftMode = isDraftMatch();
    if (blindPickField) blindPickField.hidden = draftMode;
    if (draftField) draftField.hidden = !draftMode;
    if (!draftMode) {
      squadPicker.setLocked(localLocked);
      lockBtn.textContent = localLocked ? "Change Squad" : "Lock Squad";
      lockBtn.classList.toggle("primary", !localLocked);
    }
    renderRoster();
    renderDraft();
    syncStart();
  }

  function selectSeg(size) {
    for (const seg of sizeSegs) seg.classList.toggle("is-selected", Number(seg.dataset.size) === size);
  }

  function syncStart() {
    const count = playerCount();
    const type = matchTypeConfig();
    const full = count === type.maxPlayers;
    const draftMode = isDraftMatch();
    const draftDone = draftMode && full && isDraftComplete(draft);
    const locked = draftMode ? draftDone : full && allPlayersLocked();
    const missingLocks = full ? lobbyPlayers().filter((p) => readyByClientId.get(p.id) !== true).length : 0;
    startBtn.hidden = !isOwner;
    startBtn.disabled = !(isOwner && full && locked);
    if (isOwner) {
      lobbyHintEl.hidden = full && locked;
      if (!full) {
        lobbyHintEl.textContent = `Waiting for ${type.maxPlayers - count} more player${type.maxPlayers - count === 1 ? "" : "s"} for ${type.label}.`;
      } else if (draftMode && !draftDone) {
        const seat = currentDraftSeat(draft);
        lobbyHintEl.textContent = seat === localLobbySeat() ? "Your draft pick is up." : `Waiting for ${draftPlayerLabel(seat)} to draft.`;
      } else if (!locked) {
        lobbyHintEl.textContent = `Waiting for ${missingLocks} squad lock-in${missingLocks === 1 ? "" : "s"}.`;
      } else {
        lobbyHintEl.textContent = "";
      }
    } else {
      lobbyHintEl.hidden = false;
      lobbyHintEl.textContent = draftMode
        ? (draftDone ? "Draft complete. Waiting for the host to start..." : "Draft your squad, then wait for the host.")
        : localLocked
        ? (locked ? "Locked in. Waiting for the host to start..." : "Locked in. Waiting for the other squad lock-ins...")
        : "Lock in when your squad is ready.";
    }
  }

  function setLocalLocked(locked, { broadcast = true } = {}) {
    localLocked = !!locked;
    if (myClientId) readyByClientId.set(myClientId, localLocked);
    squadPicker.setLocked(localLocked);
    if (broadcast) client?.sendReady(localLocked);
    syncUI();
  }

  function renderDraft() {
    if (!draftField || draftField.hidden) return;
    const full = playerCount() === matchTypeConfig().maxPlayers;
    if (!full || !draft) {
      draftHint.textContent = "Draft starts when both commanders are in the room.";
      draftTrack.replaceChildren();
      draftSquads.replaceChildren();
      draftRoster.replaceChildren();
      return;
    }

    const currentSeat = currentDraftSeat(draft);
    const localSeat = localLobbySeat();
    const complete = isDraftComplete(draft);
    draftHint.textContent = complete
      ? "Draft complete. No duplicate units are allowed across either squad."
      : currentSeat === localSeat
        ? "Your pick. Choose one available unit for your squad."
        : `${draftPlayerLabel(currentSeat)} is picking. Taken units are locked for both sides.`;

    draftTrack.replaceChildren();
    for (let i = 0; i < DRAFT_PICK_ORDER.length; i += 1) {
      const seat = DRAFT_PICK_ORDER[i];
      const dot = document.createElement("span");
      dot.className = `draft-step${i < draft.pickIndex ? " is-done" : ""}${i === draft.pickIndex ? " is-current" : ""}`;
      dot.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      dot.textContent = String(i + 1);
      draftTrack.appendChild(dot);
    }

    draftSquads.replaceChildren();
    for (const seat of [1, 2]) {
      const panel = document.createElement("section");
      panel.className = `draft-side${seat === currentSeat && !complete ? " is-picking" : ""}`;
      panel.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      const title = document.createElement("h3");
      title.textContent = draftPlayerLabel(seat);
      const list = document.createElement("div");
      list.className = "draft-picks";
      const picks = draft.picks?.[seat] ?? [];
      const skins = draft.skins?.[seat] ?? [];
      for (let i = 0; i < 4; i += 1) {
        const type = picks[i];
        const slot = document.createElement("div");
        slot.className = `draft-pick${type ? " is-filled" : ""}`;
        if (type) {
          slot.append(createPortrait(type, { variant: "is-chip", eager: true, skin: skins[i] ?? null }));
          const name = document.createElement("span");
          name.textContent = UNIT_TYPES[type]?.name ?? type;
          slot.append(name);
        } else {
          slot.textContent = `Pick ${i + 1}`;
        }
        list.appendChild(slot);
      }
      panel.append(title, list);
      draftSquads.appendChild(panel);
    }

    const taken = draftedTypes(draft);
    draftRoster.replaceChildren();
    for (const group of groupedUnitTypes(UNIT_TYPE_KEYS)) {
      const section = document.createElement("section");
      section.className = "draft-class";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const units = document.createElement("div");
      units.className = "draft-class-units";
      for (const type of group.types) {
        const disabled = complete || currentSeat !== localSeat || !canDraftType(draft, localSeat, type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `draft-unit${taken.has(type) ? " is-taken" : ""}`;
        btn.disabled = disabled;
        btn.dataset.type = type;
        btn.append(createPortrait(type, { variant: "is-card", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name ?? type;
        btn.append(name);
        if (taken.has(type)) {
          const flag = document.createElement("i");
          flag.textContent = "Taken";
          btn.append(flag);
        }
        btn.addEventListener("click", () => submitDraftPick(type));
        units.appendChild(btn);
      }
      section.append(heading, units);
      draftRoster.appendChild(section);
    }
  }

  async function submitDraftPick(type) {
    const localSeat = localLobbySeat();
    if (!draft || currentDraftSeat(draft) !== localSeat) {
      setStatus("Wait for your draft turn.");
      return;
    }
    const pickIndex = draft.pickIndex;
    setStatus("Choose a skin for this draft pick.");
    const chosen = await openSkinPicker({ type, initial: null, accent: PLAYER_COLOR[localSeat] ?? PLAYER_COLOR[1] });
    if (!chosen) {
      setStatus("Draft pick cancelled.");
      syncUI();
      return;
    }
    if (!draft || currentDraftSeat(draft) !== localSeat || draft.pickIndex !== pickIndex) {
      setStatus("Draft changed before that pick locked.");
      syncUI();
      return;
    }
    const skin = chosen.skin ?? null;
    const result = applyDraftPick(draft, { seat: localSeat, type, skin });
    if (!result.accepted) {
      setStatus("That unit is already drafted.");
      renderDraft();
      return;
    }
    draft = result.nextState;
    client?.sendDraftPick({ pickIndex, seat: localSeat, type, skin });
    setStatus(isDraftComplete(draft) ? "Draft complete. Ready to start." : "Pick locked.");
    syncUI();
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
      selectedMatchType = normalizeMatchType(lobby.settings?.matchType ?? selectedMatchType);
      myClientId = client.getClientId();
      isOwner = lobby.ownerId === myClientId;
      localLocked = false;
      forgetDepartedReadyStates();
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
      forgetDepartedReadyStates();
      syncUI();
      if (localLocked) client?.sendReady(true);
    };

    cb.onRemoteConfig = (cfg) => {
      if (isOwner) return;
      if (cfg.rulesetVersion !== RULESET_VERSION) {
        setStatus("Rules version mismatch. Refresh before starting this match.");
        return;
      }
      receivedConfig = { ...receivedConfig, ...cfg, format: matchTypeConfig().format };
      syncUI();
      tryStart();
    };

    cb.onRemoteReady = ({ clientId, ready }) => {
      if (!clientId) return;
      readyByClientId.set(clientId, !!ready);
      syncUI();
    };

    cb.onLobbyStarted = ({ seed: matchSeed, members, myClientId: id }) => {
      myClientId = id ?? myClientId;
      membersAtStart = Array.isArray(members) ? members.slice() : [];
      const playersAtStart = membersAtStart.map((clientId, index) => ({ id: clientId, seat: index + 1 }));
      if (isDraftMatch()) {
        syncDraftMembership();
        if (!isDraftComplete(draft)) {
          membersAtStart = null;
          setStatus("Start blocked until the draft is complete.");
          syncUI();
          return;
        }
      } else if (!allPlayersLocked(playersAtStart)) {
        membersAtStart = null;
        setStatus("Start blocked until every squad is locked in.");
        syncUI();
        return;
      }
      mySeat = membersAtStart.indexOf(myClientId) + 1;
      isOwner = lobby?.ownerId === myClientId;
      seed = matchSeed;
      setStatus("Match starting…");

      const composition = isDraftMatch() ? [...(draft?.picks?.[mySeat] ?? DEFAULT_SQUAD)] : squadPicker.getSquad();
      const skins = isDraftMatch() ? draftSkinsForSeat(mySeat) : squadPicker.getSkins();
      compositionsBySeat[mySeat] = composition;
      skinsBySeat[mySeat] = skins;
      client.sendSetup({ seat: mySeat, composition, skins });
      if (isOwner) pushConfig(); // ensure the final framing is out
      tryStart();
    };

    cb.onRemoteSetup = ({ seat, composition, skins }) => {
      if (!seat) return;
      compositionsBySeat[seat] = Array.isArray(composition) ? composition : [...DEFAULT_SQUAD];
      skinsBySeat[seat] = Array.isArray(skins) ? skins : [null, null, null, null];
      tryStart();
    };

    cb.onRemoteDraftPick = ({ pickIndex, seat, type, skin }) => {
      if (!isDraftMatch() || !draft || pickIndex !== draft.pickIndex) return;
      const result = applyDraftPick(draft, { seat, type, skin });
      if (!result.accepted) return;
      draft = result.nextState;
      setStatus(isDraftComplete(draft) ? "Draft complete. Ready to start." : `${draftPlayerLabel(seat)} locked a pick.`);
      syncUI();
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

  function draftSkinsForSeat(seat) {
    const skins = [...(draft?.skins?.[seat] ?? [])];
    while (skins.length < 4) skins.push(null);
    return skins.slice(0, 4);
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
    const skins = {};
    for (let seat = 1; seat <= count; seat += 1) {
      squads[seat] = compositionsBySeat[seat];
      skins[seat] = skinsBySeat[seat] ?? [null, null, null, null];
    }

    const format = matchTypeConfig().format;
    onStartMatch({
      mode: "online",
      net: session,
      seed,
      size: cfg.size,
      mySeat,
      squads,
      skins,
      playerCount: count,
      format,
      teamColors: format === "teams" ? { ...cfg.teamColors } : null,
      teamNames: format === "teams" ? { ...cfg.teamNames } : null,
    });
  }

  function resetLobbyState() {
    lobby = null;
    isOwner = false;
    localLocked = false;
    readyByClientId.clear();
    draft = null;
    draftMembersKey = "";
    squadPicker.setLocked(false);
    lockBtn.textContent = "Lock Squad";
    lockBtn.classList.add("primary");
    receivedConfig = null;
    seed = null;
    mySeat = null;
    membersAtStart = null;
    for (const key of Object.keys(compositionsBySeat)) delete compositionsBySeat[key];
    for (const key of Object.keys(skinsBySeat)) delete skinsBySeat[key];
    roomCodeEl.hidden = true;
  }

  // ── one-time control wiring (the section persists across enter/exit) ─────────
  for (const seg of matchTypeSegs) {
    seg.addEventListener("click", () => {
      if (lobby) return;
      selectMatchType(seg.dataset.matchType);
    });
  }
  $('[data-action="quickMatch"]').addEventListener("click", () => client?.findLobby(lobbyOptions()));
  $('[data-action="createRoom"]').addEventListener("click", () => client?.createLobby(lobbyOptions()));
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
  lockBtn.addEventListener("click", () => setLocalLocked(!localLocked));
  startBtn.addEventListener("click", () => {
    const readyToStart = isDraftMatch() ? isDraftComplete(draft) : allPlayersLocked();
    if (isOwner && playerCount() === matchTypeConfig().maxPlayers && readyToStart) client?.startLobby();
    else syncStart();
  });
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
    selectMatchType("duel");
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
