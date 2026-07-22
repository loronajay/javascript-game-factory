// Online Versus lobby. Owns the relay client for the whole lobby phase: connects on
// entry, runs quick-match / private-room pairing for 1v1 or 4-player formats, and
// once the lobby owner starts AND every seat's squad/draft has been exchanged, builds
// the onlineSession and hands off to the match (onStartMatch). The match then owns
// the live socket — so onExit only tears the client down when we leave WITHOUT starting.
//
// Authority model (see onlineClient.js / onlineSession.js): deterministic lockstep
// over the generic v2 lobby. `lobby_started` hands every client an identical ordered
// `members` array + a shared `seed`; seat = index in members + 1. The lobby OWNER
// owns the match framing (board size), broadcast in-band via a `config` lobby_message
// so every client builds it identically. Classic/FFA/team matches use BLIND pick:
// each player builds its own squad (the same roster pop-up as hot-seat) and broadcasts
// a `setup` message on start. Draft 1v1 uses the same transport with `draft_pick`
// messages, then shares each completed draft squad through `setup`.
import { createSquadPicker, DEFAULT_SQUAD } from "./squadPicker.js";
import { getNicknamePref } from "./nicknameModel.js";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";
import { createOnlineClient, normalizeRoomCode } from "../online/onlineClient.js";
import { createOnlineSession } from "../online/onlineSession.js";
import { ONLINE_RULESET_VERSION } from "../online/ruleset.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { DRAFT_BATTLE_REQUIRED_UNITS, RANKED_BATTLE_REQUIRED_UNITS, isDraftBattleAvailable, isRankedBattleAvailable, unlockedDraftUnitCount } from "../progression/draftAvailability.js";
import { UNIT_TYPE_KEYS, groupedUnitTypes, isUnitUnlocked } from "./squadModel.js";
import { createPortrait } from "./portraits.js";
import { openSkinPicker } from "./skinPicker.js";
import { openDraftFormationPicker } from "./draftFormationPicker.js";
import { DRAFT_PICK_ORDER, applyBan, applyDraftPick, arrangeDraftLoadout, bannedTypes, canBanType, canDraftType, createDraftState, currentBanSeat, currentDraftSeat, draftPhase, draftedTypes, isBanPhaseComplete, isDraftComplete } from "./draftModel.js";
import { playerSeatListLabel, teamForSeat, teamGroupsForSetup } from "./teamDisplay.js";
import { escapeHtml } from "./domHelpers.js";
import { createRankedFlow } from "../online/rankedFlow.js";
import { loadRankedName } from "./rankedNameModel.js";
import { isFactoryAccountLoggedIn, readStoredFactoryAccountSession } from "../platform/factoryAccount.js";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { publishTacticalArenaMatchActivity } from "../../../../js/platform/activity/activity.mjs";

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
  const draftActions = $('[data-online="draftActions"]') ?? document.createElement("div");
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];
  const matchTypeSegs = [...el.querySelectorAll('[data-field="onlineMatchType"] .seg')];
  const matchTypeHintEl = $('[data-online="matchTypeHint"]');
  const rankedBtn = $('[data-online="rankedBtn"]');
  const rankedHint = $('[data-online="rankedHint"]');
  const modeSegs = [...el.querySelectorAll('[data-field="onlineMode"] .seg')];
  const casualModePanel = $('[data-online-mode-panel="casual"]');
  const rankedModePanel = $('[data-online-mode-panel="ranked"]');

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
  let localFormationOrder = null;
  let formationPromptOpen = false;

  // Ranked (server-brokered matchmaking + ban phase). onlineMode is the idle-panel
  // toggle (which pairing flow is shown); rankedMode is true only once a ranked search
  // is actually in flight; rankedInfo holds the platform match once paired.
  let onlineMode = "casual"; // "casual" | "ranked"
  let rankedFlow = null;
  let rankedMode = false;
  let rankedInfo = null;
  let rankedBanFirstSeat = null;
  let rankedIdentityProfile = null;

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
  const nicknamesBySeat = {};

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

  // Draft needs DRAFT_PICK_ORDER.length (8) unique units across both seats — one
  // per pick, no duplicate types. With the campaign lock on, there just aren't
  // enough unlocked units yet, so the mode stays greyed out until enough are.
  function unlockedUnitCount() {
    return unlockedDraftUnitCount(globalThis.localStorage);
  }

  function isDraftUnlockable() {
    return isDraftBattleAvailable(globalThis.localStorage);
  }

  // Ranked needs a bigger owned pool than plain draft: the ban phase can knock a champ
  // out from under you before you ever pick, so the gate is stricter (see
  // RANKED_BATTLE_REQUIRED_UNITS).
  function isRankedUnlockable() {
    return isRankedBattleAvailable(globalThis.localStorage);
  }

  function syncMatchTypeAvailability() {
    const draftReady = isDraftUnlockable();
    for (const seg of matchTypeSegs) {
      const locked = normalizeMatchType(seg.dataset.matchType) === "draft1v1" && !draftReady;
      seg.disabled = locked;
      seg.classList.toggle("is-locked", locked);
      seg.title = locked
        ? `Must own ${DRAFT_BATTLE_REQUIRED_UNITS} unique units to draft (${unlockedUnitCount()} unlocked)`
        : "";
    }
    if (matchTypeHintEl) {
      const showHint = !draftReady && normalizeMatchType(selectedMatchType) === "draft1v1";
      matchTypeHintEl.hidden = !showHint;
      matchTypeHintEl.textContent = showHint
        ? `Draft 1v1 needs ${DRAFT_BATTLE_REQUIRED_UNITS} unique units — you have ${unlockedUnitCount()} unlocked.`
        : "";
    }
  }

  function selectMatchType(type) {
    const normalized = normalizeMatchType(type);
    if (normalized === "draft1v1" && !isDraftUnlockable()) return;
    selectedMatchType = normalized;
    for (const seg of matchTypeSegs) {
      seg.classList.toggle("is-selected", normalizeMatchType(seg.dataset.matchType) === selectedMatchType);
    }
    syncMatchTypeAvailability();
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
      localFormationOrder = null;
      formationPromptOpen = false;
      return;
    }
    if (key !== draftMembersKey) {
      // Ranked adds a ban phase. Both clients agree on the ban-first SEAT from their
      // own bansFirst flag (exactly one is true) mapped to their lobby seat, so the
      // deterministic draft state matches on both sides.
      if (rankedMode && rankedInfo) {
        const mySeat = localLobbySeat() ?? 1;
        const otherSeat = mySeat === 1 ? 2 : 1;
        rankedBanFirstSeat = rankedInfo.bansFirst ? mySeat : otherSeat;
        draft = createDraftState({ seats: [1, 2], banFirstSeat: rankedBanFirstSeat });
      } else {
        draft = createDraftState({ seats: [1, 2] });
      }
      draftMembersKey = key;
      localFormationOrder = null;
      formationPromptOpen = false;
      localLocked = false;
      if (myClientId) readyByClientId.set(myClientId, false);
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

  function allDraftFormationsLocked(players = lobbyPlayers()) {
    return isDraftComplete(draft) && players.length > 0 && players.every((p) => readyByClientId.get(p.id) === true);
  }

  function identity() {
    // Pull the canonical Javascript Game Factory profile so the lobby and ranked
    // nameplate can show the pilot name separately from the Tactical Arena tagline.
    try {
      const payload = createOnlineIdentityPayload(loadFactoryProfile());
      if (!rankedMode) return payload;
      const fallbackTagline = loadRankedName();
      return {
        ...payload,
        rankedProfile: rankedIdentityProfile || (fallbackTagline ? { title: fallbackTagline, tagline: fallbackTagline } : null),
      };
    } catch {
      return { playerId: "", displayName: "" };
    }
  }

  function rankedProfileFromStanding(standing) {
    if (!standing || typeof standing !== "object") return null;
    const title = typeof standing.title === "string" ? standing.title.trim() : "";
    const rating = Number(standing.rating);
    return {
      title,
      tagline: title,
      avatarUnit: typeof standing.avatarUnit === "string" ? standing.avatarUnit : null,
      avatarSkin: typeof standing.avatarSkin === "string" ? standing.avatarSkin : null,
      tier: standing.tier && typeof standing.tier === "object" ? { ...standing.tier } : null,
      rating: Number.isFinite(rating) ? Math.round(rating) : undefined,
      wins: Number(standing.wins) || 0,
      losses: Number(standing.losses) || 0,
      draws: Number(standing.draws) || 0,
    };
  }

  async function hydrateRankedIdentityProfile() {
    rankedIdentityProfile = null;
    let apiClient = null;
    try { apiClient = createPlatformApiClient(); } catch { apiClient = null; }
    if (!apiClient?.isConfigured || typeof apiClient.fetchRankedStanding !== "function") {
      const fallback = loadRankedName();
      rankedIdentityProfile = fallback ? { title: fallback, tagline: fallback } : null;
      return;
    }
    try {
      rankedIdentityProfile = rankedProfileFromStanding(await apiClient.fetchRankedStanding(TACTICAL_ARENA_GAME_SLUG));
    } catch {
      const fallback = loadRankedName();
      rankedIdentityProfile = fallback ? { title: fallback, tagline: fallback } : null;
    }
  }

  // ── Ranked matchmaking + rendezvous ─────────────────────────────────────────
  function rankedLobbyOptions() {
    return { minPlayers: 2, maxPlayers: 2, settings: { matchType: "draft1v1", ranked: true } };
  }

  // Switches the idle panel between the casual pairing flow and the ranked
  // matchmaking flow. Leaving ranked abandons any in-flight search.
  function setOnlineMode(mode) {
    const next = mode === "ranked" ? "ranked" : "casual";
    onlineMode = next;
    for (const seg of modeSegs) seg.classList.toggle("is-selected", seg.dataset.onlineMode === next);
    if (casualModePanel) casualModePanel.hidden = next !== "casual";
    if (rankedModePanel) rankedModePanel.hidden = next !== "ranked";
    if (next === "casual") endRankedSearch();
    else syncRankedAvailability();
  }

  // Reflects the champ-pool gate on the ranked panel before the player commits: the ban
  // phase can strip a champ, so ranked needs a bigger owned pool than plain draft. When
  // the pool is too small the Find button is disabled and the hint says how many more.
  function syncRankedAvailability() {
    if (!rankedBtn || rankedMode) return; // don't fight the live Cancel state
    const enough = isRankedUnlockable();
    rankedBtn.disabled = !enough;
    if (rankedHint) {
      rankedHint.textContent = enough
        ? ""
        : `Ranked drafts with bans — unlock ${RANKED_BATTLE_REQUIRED_UNITS} unique units first (${unlockedUnitCount()} unlocked).`;
    }
  }

  function setRankedSearchingUI(searching) {
    if (rankedBtn) {
      rankedBtn.textContent = searching ? "✕ Cancel Search" : "⚔ Find Ranked Match";
      rankedBtn.classList.toggle("is-searching", !!searching);
      rankedBtn.disabled = false; // Cancel (or a re-evaluated Find) must stay clickable
    }
    // Lock the Casual/Ranked toggle while a search is live — Cancel or Back to leave.
    for (const seg of modeSegs) seg.disabled = !!searching;
  }

  async function startRanked() {
    if (rankedMode) return;
    if (!isFactoryAccountLoggedIn(readStoredFactoryAccountSession())) {
      setStatus("Sign in to your account to play ranked.");
      if (rankedHint) rankedHint.textContent = "You need a signed-in Javascript Game Factory account for ranked.";
      return;
    }
    if (!isRankedUnlockable()) {
      setStatus("Unlock more units to play ranked Draft.");
      if (rankedHint) rankedHint.textContent = `Ranked drafts with bans — unlock ${RANKED_BATTLE_REQUIRED_UNITS} unique units first (${unlockedUnitCount()} unlocked).`;
      return;
    }
    rankedMode = true;
    rankedInfo = null;
    // Ranked framing is fixed: Draft 1v1 on a 13×13 board. The lobby settings drive
    // the match type once paired, so we only pin the owner's board-size framing here
    // rather than mutating the (hidden) casual controls.
    config.size = 13;
    if (rankedHint) rankedHint.textContent = "";
    setRankedSearchingUI(true);
    setStatus("Loading ranked profile...");
    await hydrateRankedIdentityProfile();
    if (!rankedMode) return;
    setStatus("Joining the ranked queue…");
    client?.setIdentity(identity()); // re-stamp identity so ranked metadata is used
    rankedFlow = createRankedFlow({
      callbacks: {
        onStatus: (text) => setStatus(text),
        onMatched: (match) => { rankedInfo = match; },
        onLobbyReady: ({ role, code }) => {
          if (role === "create") client?.createLobby(rankedLobbyOptions());
          else if (code) client?.joinLobby(code);
        },
        onError: (text) => { setStatus(text); endRankedSearch(); },
      },
    });
    void rankedFlow.queue();
  }

  // Tears down an in-progress ranked SEARCH (before a match hands off). Safe to call
  // when not searching. Does not touch a ranked match already in progress.
  function endRankedSearch() {
    const flow = rankedFlow;
    rankedFlow = null;
    rankedMode = false;
    rankedInfo = null;
    rankedBanFirstSeat = null;
    rankedIdentityProfile = null;
    setRankedSearchingUI(false);
    if (onlineMode === "ranked") syncRankedAvailability(); // back on the ranked idle panel
    void flow?.cancel();
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
    rosterEl.classList.toggle("is-team-roster", teams);
    const players = lobby?.players ?? [];
    const renderPlayer = (p) => {
      const li = document.createElement("li");
      li.className = "lobby-roster-item";
      const tags = [];
      if (p.id === lobby?.ownerId) tags.push('<span class="lobby-tag host">Host</span>');
      if (p.id === myClientId) tags.push('<span class="lobby-tag you">You</span>');
      if (draftMode) {
        const pickCount = draft?.picks?.[p.seat]?.length ?? 0;
        tags.push(
          readyByClientId.get(p.id) === true
            ? '<span class="lobby-tag ready">Formation</span>'
            : pickCount >= 4
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
        const team = teamForSeat(p.seat, "teams");
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
    };
    if (teams) {
      for (const group of teamGroupsForSetup(4, "teams")) {
        const header = document.createElement("li");
        header.className = "lobby-team-heading";
        header.style.setProperty("--team", TEAM_COLOR[group.team] ?? PLAYER_COLOR[1]);
        header.innerHTML = `<span>Team ${group.team}</span><small>${playerSeatListLabel(group.seats)}</small>`;
        rosterEl.appendChild(header);
        for (const seat of group.seats) {
          const player = players.find((candidate) => candidate.seat === seat);
          if (player) renderPlayer(player);
        }
      }
    } else {
      for (const p of players) renderPlayer(p);
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
      const localSeat = localLobbySeat() ?? 1;
      const teams = activeMatchType() === "teams4";
      const localTeam = teamForSeat(localSeat, teams ? "teams" : "ffa");
      squadPicker.setPlayer(localSeat);
      squadPicker.setPlayerCount(matchTypeConfig().maxPlayers);
      squadPicker.setFormat(teams ? "teams" : "ffa");
      squadPicker.setTitle(teams ? `Your squad - Team ${localTeam}` : "Your squad");
      squadPicker.setAccent(teams ? (TEAM_COLOR[localTeam] ?? PLAYER_COLOR[localSeat]) : (PLAYER_COLOR[localSeat] ?? PLAYER_COLOR[1]));
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
    const draftReady = draftDone && allDraftFormationsLocked();
    const locked = draftMode ? draftReady : full && allPlayersLocked();
    const missingLocks = full ? lobbyPlayers().filter((p) => readyByClientId.get(p.id) !== true).length : 0;
    startBtn.hidden = !isOwner;
    startBtn.disabled = !(isOwner && full && locked);
    if (isOwner) {
      lobbyHintEl.hidden = full && locked;
      if (!full) {
        lobbyHintEl.textContent = `Waiting for ${type.maxPlayers - count} more player${type.maxPlayers - count === 1 ? "" : "s"} for ${type.label}.`;
      } else if (draftMode && !draftDone) {
        if (rankedMode && draft && !isBanPhaseComplete(draft)) {
          const banSeat = currentBanSeat(draft);
          lobbyHintEl.textContent = banSeat === localLobbySeat() ? "Your ban is up." : `Waiting for ${draftPlayerLabel(banSeat)} to ban.`;
        } else {
          const seat = currentDraftSeat(draft);
          lobbyHintEl.textContent = seat === localLobbySeat() ? "Your draft pick is up." : `Waiting for ${draftPlayerLabel(seat)} to draft.`;
        }
      } else if (draftMode && !draftReady) {
        lobbyHintEl.textContent = localLocked
          ? `Waiting for ${missingLocks} formation lock-in${missingLocks === 1 ? "" : "s"}.`
          : "Arrange and lock your formation.";
      } else if (!locked) {
        lobbyHintEl.textContent = `Waiting for ${missingLocks} squad lock-in${missingLocks === 1 ? "" : "s"}.`;
      } else {
        lobbyHintEl.textContent = "";
      }
    } else {
      lobbyHintEl.hidden = false;
      lobbyHintEl.textContent = draftMode
        ? (!draftDone ? "Draft your squad, then arrange formation." : localLocked ? "Formation locked. Waiting for the host to start..." : "Arrange and lock your formation.")
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
      draftActions.replaceChildren();
      draftRoster.replaceChildren();
      return;
    }

    if (draftPhase(draft) === "ban") {
      renderBanPhase();
      return;
    }

    const currentSeat = currentDraftSeat(draft);
    const localSeat = localLobbySeat();
    const complete = isDraftComplete(draft);
    draftHint.textContent = complete
      ? (localLocked ? "Formation locked. The host can start once both sides are ready." : "Draft complete. Arrange your starting slots before the match starts.")
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
      const nicknames = draft.nicknames?.[seat] ?? [];
      for (let i = 0; i < 4; i += 1) {
        const type = picks[i];
        const slot = document.createElement("div");
        slot.className = `draft-pick${type ? " is-filled" : ""}`;
        if (type) {
          slot.append(createPortrait(type, { variant: "is-chip", eager: true, skin: skins[i] ?? null }));
          const name = document.createElement("span");
          name.textContent = nicknames[i] || UNIT_TYPES[type]?.name || type;
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
    draftActions.replaceChildren();
    if (complete) {
      const arrangeBtn = document.createElement("button");
      arrangeBtn.type = "button";
      arrangeBtn.className = `menu-btn${localLocked ? "" : " primary"}`;
      arrangeBtn.textContent = localLocked ? "Change Formation" : "Arrange Formation";
      arrangeBtn.addEventListener("click", () => openLocalFormation());
      const status = document.createElement("p");
      status.className = "setup-hint";
      status.textContent = localLocked ? "Your formation is locked." : "Pick your spawn-slot order.";
      draftActions.append(arrangeBtn, status);
      draftRoster.replaceChildren();
      if (!localLocked && !localFormationOrder && !formationPromptOpen && localSeat) {
        formationPromptOpen = true;
        window.setTimeout(() => { formationPromptOpen = false; openLocalFormation(); }, 0);
      }
      return;
    }

    draftRoster.replaceChildren();
    for (const group of groupedUnitTypes(UNIT_TYPE_KEYS)) {
      const section = document.createElement("section");
      section.className = "draft-class";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const units = document.createElement("div");
      units.className = "draft-class-units";
      for (const type of group.types) {
        const locked = !isUnitUnlocked(type);
        const disabled = complete || currentSeat !== localSeat || !canDraftType(draft, localSeat, type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `draft-unit${taken.has(type) ? " is-taken" : ""}${locked ? " is-locked" : ""}`;
        btn.disabled = disabled;
        btn.dataset.type = type;
        btn.append(createPortrait(type, { variant: "is-card", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name ?? type;
        btn.append(name);
        if (locked) {
          const flag = document.createElement("i");
          flag.textContent = "🔒 Locked";
          btn.append(flag);
        } else if (taken.has(type)) {
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
    const nickname = getNicknamePref(type);
    const result = applyDraftPick(draft, { seat: localSeat, type, skin, nickname });
    if (!result.accepted) {
      setStatus("That unit is already drafted.");
      renderDraft();
      return;
    }
    draft = result.nextState;
    client?.sendDraftPick({ pickIndex, seat: localSeat, type, skin, nickname });
    setStatus(isDraftComplete(draft) ? "Draft complete. Ready to start." : "Pick locked.");
    syncUI();
  }

  function renderBanPhase() {
    const localSeat = localLobbySeat();
    const banSeat = currentBanSeat(draft);
    const banned = bannedTypes(draft);

    draftHint.textContent = banSeat === localSeat
      ? "Ban phase — ban one enemy unit from the match."
      : `${draftPlayerLabel(banSeat)} is banning. One ban each.`;

    draftTrack.replaceChildren();
    for (let i = 0; i < draft.banOrder.length; i += 1) {
      const seat = draft.banOrder[i];
      const dot = document.createElement("span");
      dot.className = `draft-step${i < draft.banIndex ? " is-done" : ""}${i === draft.banIndex ? " is-current" : ""}`;
      dot.style.setProperty("--team", PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]);
      dot.textContent = "⊘";
      draftTrack.appendChild(dot);
    }

    draftSquads.replaceChildren();
    if (banned.size) {
      const strip = document.createElement("section");
      strip.className = "draft-side";
      const list = document.createElement("div");
      list.className = "draft-picks";
      for (const type of banned) {
        const slot = document.createElement("div");
        slot.className = "draft-pick is-filled is-banned";
        slot.append(createPortrait(type, { variant: "is-chip", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name || type;
        slot.append(name);
        list.appendChild(slot);
      }
      strip.append(Object.assign(document.createElement("h3"), { textContent: "Banned" }), list);
      draftSquads.appendChild(strip);
    }

    draftActions.replaceChildren();
    draftRoster.replaceChildren();
    for (const group of groupedUnitTypes(UNIT_TYPE_KEYS)) {
      const section = document.createElement("section");
      section.className = "draft-class";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const units = document.createElement("div");
      units.className = "draft-class-units";
      for (const type of group.types) {
        // Bans cover the whole roster, including units you don't own — no lock state.
        const isBanned = banned.has(type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `draft-unit${isBanned ? " is-taken is-banned" : ""}`;
        btn.disabled = banSeat !== localSeat || !canBanType(draft, localSeat, type);
        btn.dataset.type = type;
        btn.append(createPortrait(type, { variant: "is-card", eager: true }));
        const name = document.createElement("span");
        name.textContent = UNIT_TYPES[type]?.name ?? type;
        btn.append(name);
        if (isBanned) {
          const flag = document.createElement("i");
          flag.textContent = "Banned";
          btn.append(flag);
        }
        btn.addEventListener("click", () => submitBan(type));
        units.appendChild(btn);
      }
      section.append(heading, units);
      draftRoster.appendChild(section);
    }
  }

  function submitBan(type) {
    const localSeat = localLobbySeat();
    if (!draft || currentBanSeat(draft) !== localSeat) {
      setStatus("Wait for your ban.");
      return;
    }
    const banIndex = draft.banIndex;
    const result = applyBan(draft, { seat: localSeat, type });
    if (!result.accepted) {
      setStatus("You can't ban that unit.");
      renderDraft();
      return;
    }
    draft = result.nextState;
    client?.sendBanPick({ banIndex, seat: localSeat, type });
    setStatus(isBanPhaseComplete(draft) ? "Bans locked. Draft begins." : "Ban locked.");
    syncUI();
  }

  async function openLocalFormation() {
    const seat = localLobbySeat();
    if (!draft || !isDraftComplete(draft) || !seat || formationPromptOpen) return;
    const picks = [...(draft.picks?.[seat] ?? [])];
    const skins = [...(draft.skins?.[seat] ?? [])];
    const nicknames = [...(draft.nicknames?.[seat] ?? [])];
    if (picks.length < 4) return;

    const wasLocked = localLocked;
    if (wasLocked) setLocalLocked(false);
    formationPromptOpen = true;
    const result = await openDraftFormationPicker({
      title: "Arrange Formation",
      composition: picks,
      skins,
      nicknames,
      order: localFormationOrder,
      accent: matchTypeConfig().format === "teams"
        ? (TEAM_COLOR[teamForSeat(seat, "teams")] ?? PLAYER_COLOR[seat])
        : (PLAYER_COLOR[seat] ?? PLAYER_COLOR[1]),
      player: seat,
      format: matchTypeConfig().format,
    });
    formationPromptOpen = false;
    if (!result?.order) {
      if (wasLocked && localFormationOrder) setLocalLocked(true);
      else syncUI();
      return;
    }
    localFormationOrder = result.order;
    setStatus("Formation locked. Waiting for the other side.");
    setLocalLocked(true);
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
      roomCodeEl.textContent = rankedMode ? "Ranked match" : `Room code: ${lobby.roomCode}`;
      // Ranked rendezvous: the seat-1 creator publishes its relay code to the platform
      // so the brokered opponent can poll for it and join this exact lobby.
      if (rankedMode && isOwner && rankedFlow && lobby.roomCode) {
        setRankedSearchingUI(false);
        void rankedFlow.publishLobbyCode(lobby.roomCode);
      } else if (rankedMode) {
        setRankedSearchingUI(false);
      }
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
        if (!isDraftComplete(draft) || !allDraftFormationsLocked(playersAtStart)) {
          membersAtStart = null;
          setStatus("Start blocked until every formation is locked.");
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

      const arrangedDraft = isDraftMatch() ? arrangeDraftLoadout(draft, mySeat, localFormationOrder) : null;
      const composition = arrangedDraft ? arrangedDraft.composition : squadPicker.getSquad();
      const skins = arrangedDraft ? arrangedDraft.skins : squadPicker.getSkins();
      const nicknames = arrangedDraft ? arrangedDraft.nicknames : squadPicker.getNicknames();
      compositionsBySeat[mySeat] = composition;
      skinsBySeat[mySeat] = skins;
      nicknamesBySeat[mySeat] = nicknames;
      client.sendSetup({ seat: mySeat, composition, skins, nicknames });
      if (isOwner) pushConfig(); // ensure the final framing is out
      tryStart();
    };

    cb.onRemoteSetup = ({ seat, composition, skins, nicknames }) => {
      if (!seat) return;
      compositionsBySeat[seat] = Array.isArray(composition) ? composition : [...DEFAULT_SQUAD];
      skinsBySeat[seat] = Array.isArray(skins) ? skins : [null, null, null, null];
      nicknamesBySeat[seat] = Array.isArray(nicknames) ? nicknames : [null, null, null, null];
      tryStart();
    };

    cb.onRemoteDraftPick = ({ pickIndex, seat, type, skin, nickname }) => {
      if (!isDraftMatch() || !draft || pickIndex !== draft.pickIndex) return;
      const result = applyDraftPick(draft, { seat, type, skin, nickname });
      if (!result.accepted) return;
      draft = result.nextState;
      setStatus(isDraftComplete(draft) ? "Draft complete. Arrange your formation." : `${draftPlayerLabel(seat)} locked a pick.`);
      syncUI();
    };

    cb.onRemoteBanPick = ({ banIndex, seat, type }) => {
      if (!rankedMode || !draft || banIndex !== draft.banIndex) return;
      const result = applyBan(draft, { seat, type });
      if (!result.accepted) return;
      draft = result.nextState;
      setStatus(isBanPhaseComplete(draft) ? "Bans complete. Draft begins." : `${draftPlayerLabel(seat)} banned a unit.`);
      syncUI();
    };

    cb.onError = (_code, message) => {
      setStatus(message || "Connection problem. Try again.");
    };

    cb.onClosed = () => {
      if (handedOff) return;
      endRankedSearch();
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
      localProfile: identity(),
    });
    handedOff = true; // onExit must NOT disconnect — the match owns the client now

    const squads = {};
    const skins = {};
    const nicknames = {};
    for (let seat = 1; seat <= count; seat += 1) {
      squads[seat] = compositionsBySeat[seat];
      skins[seat] = skinsBySeat[seat] ?? [null, null, null, null];
      nicknames[seat] = nicknamesBySeat[seat] ?? [null, null, null, null];
    }

    const format = matchTypeConfig().format;
    // Ranked: bind a report() the match-outcome controller fires at victory. The
    // controller sends win/loss to the platform; the backend attests and applies ELO.
    const rankedHandoff = rankedInfo && rankedFlow
      ? {
          matchId: rankedInfo.matchId,
          ratingBefore: rankedInfo.myRatingBefore,
          opponentPlayerId: rankedInfo.opponentPlayerId,
          report: (outcome, detail) => rankedFlow?.reportResult(outcome, detail),
          // Publish the ranked result to the platform activity feed for discovery.
          // Fire-and-forget; identity + opponent are resolved here where they live.
          publishActivity: (outcome, detail) => publishTacticalArenaMatchActivity({
            myProfile: createOnlineIdentityPayload(loadFactoryProfile()),
            opponentProfile: { playerId: rankedInfo.opponentPlayerId },
            result: outcome,
            ranked: true,
            ratingBefore: rankedInfo.myRatingBefore,
            mySquad: detail?.squad,
            sessionId: `tactical-arena:${rankedInfo.matchId}`,
          }).catch(() => {}),
        }
      : null;
    onStartMatch({
      mode: "online",
      net: session,
      seed,
      size: cfg.size,
      mySeat,
      squads,
      skins,
      nicknames,
      playerCount: count,
      format,
      trustedSkinSeats: [mySeat],
      teamColors: format === "teams" ? { ...cfg.teamColors } : null,
      teamNames: format === "teams" ? { ...cfg.teamNames } : null,
      ranked: rankedHandoff,
    });
  }

  function resetLobbyState() {
    lobby = null;
    isOwner = false;
    localLocked = false;
    readyByClientId.clear();
    draft = null;
    draftMembersKey = "";
    localFormationOrder = null;
    formationPromptOpen = false;
    squadPicker.setLocked(false);
    lockBtn.textContent = "Lock Squad";
    lockBtn.classList.add("primary");
    receivedConfig = null;
    seed = null;
    mySeat = null;
    membersAtStart = null;
    for (const key of Object.keys(compositionsBySeat)) delete compositionsBySeat[key];
    for (const key of Object.keys(skinsBySeat)) delete skinsBySeat[key];
    for (const key of Object.keys(nicknamesBySeat)) delete nicknamesBySeat[key];
    roomCodeEl.hidden = true;
  }

  // ── one-time control wiring (the section persists across enter/exit) ─────────
  for (const seg of matchTypeSegs) {
    seg.addEventListener("click", () => {
      if (lobby || rankedMode) return;
      selectMatchType(seg.dataset.matchType);
    });
  }
  for (const seg of modeSegs) {
    seg.addEventListener("click", () => {
      if (lobby || seg.disabled) return; // locked while in a lobby or mid-search
      setOnlineMode(seg.dataset.onlineMode);
    });
  }
  rankedBtn?.addEventListener("click", () => {
    if (rankedMode && !rankedInfo) endRankedSearch(); // cancel an in-progress search
    else if (!rankedMode) void startRanked();
  });
  syncMatchTypeAvailability();
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
    const readyToStart = isDraftMatch() ? allDraftFormationsLocked() : allPlayersLocked();
    if (isOwner && playerCount() === matchTypeConfig().maxPlayers && readyToStart) client?.startLobby();
    else syncStart();
  });
  $('[data-action="leaveLobby"]').addEventListener("click", () => {
    client?.leaveLobby();
    endRankedSearch();
    resetLobbyState();
    setPanel("idle");
    setStatus(`Connected to ${describeRelay(client?.getWebSocketUrl())}. Choose how to play.`);
  });
  for (const seg of sizeSegs) {
    seg.addEventListener("click", () => {
      if (!isOwner || seg.disabled || rankedMode) return;
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
    rankedInfo = null;
    rankedBanFirstSeat = null;
    selectMatchType("duel");
    setOnlineMode("casual"); // resets ranked search + shows the casual pairing flow
    resetLobbyState();
    setPanel("none");
    setStatus("Connecting to the network…");
    client = createOnlineClient();
    client.setIdentity(identity());
    wireLobby();
    client.connect();
  }

  function onExit() {
    // Leaving without starting a match: drop the connection and abandon any ranked
    // search. After a successful handoff the match owns the socket AND the ranked
    // reporter, so leave both alone.
    if (!handedOff) {
      endRankedSearch();
      if (client) client.disconnect();
    }
    client = null;
  }

  return { el, onEnter, onExit };
}
