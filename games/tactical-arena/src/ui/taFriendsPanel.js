// Tactical Arena friends panel — the menu-opened overlay for TA's own friends list:
// friends, incoming/outgoing requests, player search, and blocked players.
//
// These friends are separate from the factory-wide friends list on /me; see
// src/platform/taFriendsClient.js. Rows open the in-game player profile
// (taPlayerProfile.js), and the factory profile stays reachable from there.
//
// This file is a renderer plus tab state. Display rules live in taFriendsModel.js and
// the action buttons in taSocialActions.js, both unit-tested without a DOM.
import { el } from "./domHelpers.js";
import {
  createTaFriendsClient,
  taSocialAvailability,
  TA_SOCIAL_SIGNED_OUT,
  TA_SOCIAL_UNAVAILABLE,
} from "../platform/taFriendsClient.js";
import { wireSignInLink } from "./signInLink.js";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";
import { renderNameplateAvatar } from "./rankedProfileNameplate.js";
import { openTaPlayerProfile } from "./taPlayerProfile.js";
import { renderTaSocialActions } from "./taSocialActions.js";
import { filterTaPlayers, taFriendsTabCounts, taPlayerName, taPlayerRecordLine } from "./taFriendsModel.js";

const TABS = Object.freeze([
  { id: "friends", label: "Friends" },
  { id: "requests", label: "Requests" },
  { id: "find", label: "Find Players" },
  { id: "blocked", label: "Blocked" },
]);

const SEARCH_DEBOUNCE_MS = 300;

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ta-friends-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

/**
 * Open the friends panel.
 *
 * `client` and `availability` are injectable so the panel can be driven headlessly
 * against a fake client; production calls pass neither.
 */
export function openTaFriendsPanel({ client = null, availability = null } = {}) {
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card ta-friends-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Friends"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  head.appendChild(el("p", "ranked-profile-sub", "Your Tactical Arena friends, kept separate from your Factory friends list."));
  card.appendChild(head);

  const body = el("div", "ta-friends-body");
  card.appendChild(body);

  populate(body, { injectedClient: client, injectedAvailability: availability });

  function close() {
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }
  function onOverlay(event) {
    if (event.target === overlay) close();
  }
  function onKey(event) {
    // The player profile opens on top of this panel and handles its own Escape, so
    // only close here when this is the topmost overlay.
    if (event.key !== "Escape") return;
    if (document.querySelector(".ta-player-modal:not([hidden])")) return;
    close();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
}

function populate(body, { injectedClient = null, injectedAvailability = null } = {}) {
  const availability = injectedAvailability || taSocialAvailability();

  if (availability === TA_SOCIAL_SIGNED_OUT) {
    const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to add Tactical Arena friends.");
    const link = document.createElement("a");
    link.className = "ranked-profile-signin-link menu-btn";
    link.textContent = "Sign In";
    wireSignInLink(link);
    body.append(notice, link);
    return;
  }
  if (availability === TA_SOCIAL_UNAVAILABLE) {
    body.appendChild(el("p", "ranked-profile-standing-error", "The friends service is unavailable right now. Try again in a moment."));
    return;
  }

  const client = injectedClient || createTaFriendsClient();
  const state = {
    tab: "friends",
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
    filter: "",
    search: { query: "", results: [], status: "idle" },
    loaded: false,
  };

  const tabsRow = el("div", "ta-friends-tabs");
  tabsRow.setAttribute("role", "tablist");
  const panel = el("div", "ta-friends-panel");
  body.append(tabsRow, panel);

  const tabButtons = [];
  for (const tab of TABS) {
    const button = el("button", "ta-friends-tab", tab.label);
    button.type = "button";
    button.dataset.tab = tab.id;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      state.tab = tab.id;
      state.filter = "";
      syncTabs();
      renderTab();
    });
    tabButtons.push({ button, id: tab.id });
    tabsRow.appendChild(button);
  }

  function syncTabs() {
    const counts = taFriendsTabCounts(state);
    for (const { button, id } of tabButtons) {
      const selected = state.tab === id;
      button.className = `ta-friends-tab${selected ? " is-selected" : ""}`;
      button.setAttribute("aria-selected", String(selected));
      const label = TABS.find((tab) => tab.id === id)?.label || id;
      const count = id === "requests" ? counts.requests : id === "friends" ? counts.friends : id === "blocked" ? counts.blocked : 0;
      button.textContent = count > 0 ? `${label} (${count})` : label;
    }
  }

  // A change anywhere (accepting a request, blocking from a search row) can affect
  // more than one tab, so every action reloads the whole set rather than trying to
  // patch each list individually.
  async function reload() {
    const [friends, requests, blocked] = await Promise.all([
      client.listFriends(),
      client.listRequests(),
      client.listBlocked(),
    ]);
    state.friends = friends?.friends || [];
    state.incoming = requests?.incoming || [];
    state.outgoing = requests?.outgoing || [];
    state.blocked = blocked?.blocked || [];
    state.loaded = Boolean(friends || requests);
    syncTabs();
    renderTab();
  }

  function renderTab() {
    panel.replaceChildren();
    if (!state.loaded) {
      panel.appendChild(el("p", "ranked-profile-meta-loading", "Loading friends…"));
      return;
    }
    if (state.tab === "friends") renderFriendsTab(panel, state, client, reload);
    else if (state.tab === "requests") renderRequestsTab(panel, state, client, reload);
    else if (state.tab === "find") renderFindTab(panel, state, client, reload);
    else renderBlockedTab(panel, state, client, reload);
  }

  syncTabs();
  renderTab();
  void reload();
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function renderFriendsTab(panel, state, client, reload) {
  if (!state.friends.length) {
    panel.appendChild(el("p", "ranked-profile-meta-empty", "No Tactical Arena friends yet. Use Find Players, or add an opponent after a match."));
    return;
  }
  panel.appendChild(renderFilterBox(state, () => renderList(list, filterTaPlayers(state.friends, state.filter))));
  const list = el("ul", "ta-friends-list");
  panel.appendChild(list);
  renderList(list, filterTaPlayers(state.friends, state.filter));

  function renderList(target, players) {
    target.replaceChildren();
    if (!players.length) {
      target.appendChild(el("li", "ranked-profile-meta-empty", `No friends match "${state.filter}".`));
      return;
    }
    for (const player of players) {
      target.appendChild(playerRow(player, { client, reload }));
    }
  }
}

function renderRequestsTab(panel, state, client, reload) {
  if (!state.incoming.length && !state.outgoing.length) {
    panel.appendChild(el("p", "ranked-profile-meta-empty", "No pending friend requests."));
    return;
  }

  if (state.incoming.length) {
    panel.appendChild(el("h3", "ranked-profile-section-title", "Incoming"));
    const list = el("ul", "ta-friends-list");
    for (const request of state.incoming) {
      const player = { ...(request.player || {}), playerId: request.requesterPlayerId };
      list.appendChild(playerRow(
        { ...player, relationship: "request-received", requestId: request.requestId },
        { client, reload },
      ));
    }
    panel.appendChild(list);
  }

  if (state.outgoing.length) {
    panel.appendChild(el("h3", "ranked-profile-section-title", "Sent"));
    const list = el("ul", "ta-friends-list");
    for (const request of state.outgoing) {
      const player = { ...(request.player || {}), playerId: request.recipientPlayerId };
      list.appendChild(playerRow(
        { ...player, relationship: "request-sent", requestId: request.requestId },
        { client, reload },
      ));
    }
    panel.appendChild(list);
  }
}

function renderFindTab(panel, state, client, reload) {
  const searchWrap = el("label", "ta-friends-search");
  searchWrap.appendChild(el("span", "ranked-profile-label", "Search Tactical Arena players"));
  const input = document.createElement("input");
  input.type = "search";
  input.className = "ta-friends-search-input";
  input.placeholder = "Commander name or tagline";
  input.setAttribute("aria-label", "Search Tactical Arena players");
  input.value = state.search.query;
  searchWrap.appendChild(input);
  panel.appendChild(searchWrap);

  const results = el("div", "ta-friends-results");
  panel.appendChild(results);

  let timer = null;
  // Only the newest query may write results — a slow earlier request must not
  // overwrite what the player is looking at now.
  let generation = 0;

  const runSearch = async (query) => {
    const mine = ++generation;
    if (!query.trim()) {
      state.search = { query, results: [], status: "idle" };
      if (mine === generation) drawResults();
      return;
    }
    state.search = { query, results: state.search.results, status: "loading" };
    drawResults();
    const res = await client.search(query);
    if (mine !== generation) return;
    state.search = {
      query,
      results: res?.results || [],
      status: res ? "done" : "error",
    };
    drawResults();
  };

  input.addEventListener("input", () => {
    const query = input.value;
    state.search = { ...state.search, query };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void runSearch(query); }, SEARCH_DEBOUNCE_MS);
  });

  function drawResults() {
    results.replaceChildren();
    const { query, status, results: hits } = state.search;
    if (status === "idle") {
      results.appendChild(el("p", "ranked-profile-meta-empty", "Search for players who have played Tactical Arena."));
      return;
    }
    if (status === "loading") {
      results.appendChild(el("p", "ranked-profile-meta-loading", "Searching…"));
      return;
    }
    if (status === "error") {
      results.appendChild(el("p", "ranked-profile-standing-error", "Search failed. Try again in a moment."));
      return;
    }
    if (!hits.length) {
      results.appendChild(el("p", "ranked-profile-meta-empty", `No Tactical Arena players match "${query.trim()}".`));
      return;
    }
    const list = el("ul", "ta-friends-list");
    for (const player of hits) list.appendChild(playerRow(player, { client, reload }));
    results.appendChild(list);
  }

  drawResults();
}

function renderBlockedTab(panel, state, client, reload) {
  if (!state.blocked.length) {
    panel.appendChild(el("p", "ranked-profile-meta-empty", "You haven't blocked anyone."));
    return;
  }
  const list = el("ul", "ta-friends-list");
  for (const player of state.blocked) {
    list.appendChild(playerRow({ ...player, relationship: "blocked" }, { client, reload }));
  }
  panel.appendChild(list);
}

// ── Row ─────────────────────────────────────────────────────────────────────

function renderFilterBox(state, onChange) {
  const wrap = el("label", "ta-friends-filter");
  wrap.appendChild(el("span", "ranked-profile-label", "Filter"));
  const input = document.createElement("input");
  input.type = "search";
  input.className = "ta-friends-filter-input";
  input.placeholder = "Name or tagline";
  input.setAttribute("aria-label", "Filter friends");
  input.value = state.filter;
  input.addEventListener("input", () => {
    state.filter = input.value;
    onChange();
  });
  wrap.appendChild(input);
  return wrap;
}

function playerRow(player, { client, reload }) {
  const row = el("li", "ta-friends-row");

  // The identity block is the button that opens the profile; the action buttons sit
  // outside it so pressing Add doesn't also open the profile.
  const open = el("button", "ta-friends-rowmain");
  open.type = "button";
  open.setAttribute("aria-label", `View ${taPlayerName(player)}'s Tactical Arena profile`);

  const avatar = el("div", "ranked-profile-nameplate-avatar ta-friends-avatar");
  renderNameplateAvatar(avatar, {
    pilot: taPlayerName(player),
    avatarUnit: player.avatarUnit,
    avatarSkin: player.avatarSkin,
  });
  open.appendChild(avatar);

  const copy = el("div", "ta-friends-rowcopy");
  copy.appendChild(el("span", "ta-friends-rowname", taPlayerName(player)));
  if (player.tagline) copy.appendChild(el("span", "ta-friends-rowtagline", player.tagline));
  copy.appendChild(el("span", "ta-friends-rowrecord", taPlayerRecordLine(player)));
  open.appendChild(copy);

  if (player.tier) {
    const standing = el("div", "ta-friends-rowstanding");
    standing.appendChild(createRankedTierEmblem(player.tier, { className: "is-leaderboard" }));
    standing.appendChild(el("span", `ranked-leaderboard-tier ranked-tier-${normalizeRankedTierId(player.tier)}`, player.tier.label || ""));
    open.appendChild(standing);
  }

  open.addEventListener("click", () => {
    openTaPlayerProfile(player.playerId, {
      seed: player,
      // Reuse this panel's client and its already-resolved availability rather than
      // constructing a second client and re-deciding whether the feature is usable.
      client,
      // Rows only exist once populate() has established the feature is usable, so the
      // profile must not re-derive availability and disagree (it would, for an
      // injected client whose availability isn't the ambient one).
      availability: "ready",
      // The profile can change the relationship; the panel behind it must not keep
      // showing the old one.
      onRelationshipChanged: () => { void reload(); },
    });
  });
  row.appendChild(open);

  const actions = el("div", "ta-friends-rowactions");
  renderTaSocialActions(actions, {
    player,
    client,
    compact: true,
    onChanged: () => { void reload(); },
  });
  row.appendChild(actions);

  return row;
}
