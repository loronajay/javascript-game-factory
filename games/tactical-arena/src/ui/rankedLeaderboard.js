// Ranked Leaderboard — the top-N ranked ladder for Tactical Arena (Phase 4 of
// RANKED_FEATURE_PLAN.md). A read-only modal over the public leaderboard endpoint;
// each row shows rank, avatar, player name, ranked tagline, tier + rating, and W/L/D. The signed-in
// player's own row is highlighted. Structurally mirrors rankedProfile.js.
import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import {
  isFactoryAccountLoggedIn,
  readStoredFactoryAccountSession,
  createFactoryAccountSignInUrl,
} from "../platform/factoryAccount.js";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";
import { syncRankedPilotProfile } from "../online/rankedPilotProfile.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";
import { createRankedAvatarIcon, hasRankedAvatar } from "./rankedAvatars.js";

const LEADERBOARD_LIMIT = 100;
const TOP_LEADERBOARD_COUNT = 10;
const LEADERBOARD_TABS = Object.freeze([
  { id: "top", label: "Top 10" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "diamond", label: "Diamond" },
  { id: "master", label: "Master" },
  { id: "grandmaster", label: "Grandmaster" },
]);

let host = null;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isGenericCommanderName(value) {
  return cleanText(value).toLowerCase() === "commander";
}

function leaderboardPlayerName(entry, isMe) {
  const displayName = cleanText(entry.displayName);
  const pilotName = cleanText(entry.pilotName)
    || cleanText(entry.profileName)
    || cleanText(entry.playerName);
  return (!isGenericCommanderName(displayName) ? displayName : "")
    || pilotName
    || displayName
    || (isMe ? "You" : "Commander");
}

function leaderboardTagline(entry) {
  return cleanText(entry.tagline) || cleanText(entry.title);
}

function cleanSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function entryMatchesSearch(entry, search) {
  if (!search) return true;
  const tierId = normalizeRankedTierId(entry.tier);
  const searchable = [
    entry.rank != null ? `#${entry.rank}` : "",
    entry.rank,
    entry.rating,
    entry.playerId,
    entry.displayName,
    entry.pilotName,
    entry.playerName,
    entry.profileName,
    entry.tagline,
    entry.title,
    entry.tier?.id,
    entry.tier?.label,
    tierId,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return searchable.includes(search);
}

function isTierTab(tab) {
  return LEADERBOARD_TABS.some((entry) => entry.id === tab && tab !== "top");
}

export function filterLeaderboardEntries(entries, { tab = "top", search = "" } = {}) {
  const query = cleanSearch(search);
  const selectedTab = LEADERBOARD_TABS.some((entry) => entry.id === tab) ? tab : "top";
  let visible = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === "object") : [];

  if (isTierTab(selectedTab)) {
    visible = visible.filter((entry) => normalizeRankedTierId(entry.tier) === selectedTab);
  }

  if (query) {
    visible = visible.filter((entry) => entryMatchesSearch(entry, query));
  } else if (selectedTab === "top") {
    visible = visible.slice(0, TOP_LEADERBOARD_COUNT);
  }

  return visible;
}

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ranked-leaderboard-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

function myPlayerId() {
  try {
    return createOnlineIdentityPayload(loadFactoryProfile()).playerId || "";
  } catch {
    return "";
  }
}

export function openRankedLeaderboard() {
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card ranked-leaderboard-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Ranked Leaderboard"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  head.appendChild(el("p", "ranked-profile-sub", "The top commanders on the Tactical Arena ladder."));
  card.appendChild(head);

  const body = el("div", "ranked-leaderboard-body");
  card.appendChild(body);

  populate(body);

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
    if (event.key === "Escape") close();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
}

function populate(body) {
  const account = readStoredFactoryAccountSession();
  const apiClient = createPlatformApiClient();

  if (!isFactoryAccountLoggedIn(account)) {
    const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to view the ranked ladder.");
    const link = document.createElement("a");
    link.className = "ranked-profile-signin-link menu-btn";
    link.textContent = "Sign In";
    try { link.href = createFactoryAccountSignInUrl(); } catch { link.href = "#"; }
    body.append(notice, link);
    return;
  }
  if (!apiClient?.isConfigured || typeof apiClient.fetchRankedLeaderboard !== "function") {
    body.appendChild(el("p", "ranked-profile-standing-error", "Ranked service is unavailable right now. Try again in a moment."));
    return;
  }

  body.appendChild(el("p", "ranked-profile-meta-loading", "Loading ladder…"));

  Promise.resolve(syncRankedPilotProfile({ apiClient, loadProfile: loadFactoryProfile }))
    .catch(() => null)
    .then(() => apiClient.fetchRankedLeaderboard(TACTICAL_ARENA_GAME_SLUG, LEADERBOARD_LIMIT))
    .then((leaderboard) => renderLeaderboard(body, leaderboard?.entries || []))
    .catch(() => {
      body.replaceChildren(el("p", "ranked-profile-standing-error", "Could not load the leaderboard."));
    });
}

export function renderLeaderboard(body, entries) {
  body.replaceChildren();
  if (!entries.length) {
    body.appendChild(el("p", "ranked-profile-meta-empty", "No ranked players yet. Play a ranked match to claim the top spot."));
    return;
  }

  const state = { tab: "top", search: "" };
  const results = el("div", "ranked-leaderboard-results");
  const renderRows = () => {
    renderLeaderboardRows(results, filterLeaderboardEntries(entries, state), entries.length, state);
  };

  body.append(renderLeaderboardControls(state, renderRows), results);
  renderRows();
}

function renderLeaderboardControls(state, onChange) {
  const controls = el("section", "ranked-leaderboard-controls");

  const tabs = el("div", "ranked-leaderboard-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Leaderboard filters");

  const buttons = [];
  const syncButtons = () => {
    for (const { button, id } of buttons) {
      const selected = state.tab === id;
      button.className = `ranked-leaderboard-tab${selected ? " is-selected" : ""}`;
      button.setAttribute("aria-selected", String(selected));
    }
  };
  for (const tab of LEADERBOARD_TABS) {
    const button = el("button", "", tab.label);
    button.type = "button";
    button.dataset.tab = tab.id;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      state.tab = tab.id;
      syncButtons();
      onChange();
    });
    buttons.push({ button, id: tab.id });
    tabs.appendChild(button);
  }
  syncButtons();

  const searchWrap = el("label", "ranked-leaderboard-search");
  searchWrap.appendChild(el("span", "ranked-profile-label", "Search"));
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "ranked-leaderboard-search-input";
  searchInput.placeholder = "Commander, title, rank";
  searchInput.setAttribute("aria-label", "Search leaderboard");
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    onChange();
  });
  searchWrap.appendChild(searchInput);

  controls.append(tabs, searchWrap);
  return controls;
}

function renderLeaderboardRows(body, entries, totalEntries, state) {
  body.replaceChildren();
  const query = cleanSearch(state.search);
  if (!entries.length) {
    const selectedLabel = LEADERBOARD_TABS.find((tab) => tab.id === state.tab)?.label || "ranked";
    const emptyCopy = query
      ? `No loaded commanders match "${state.search.trim()}".`
      : `No ${selectedLabel} players in the loaded leaderboard.`;
    body.appendChild(el("p", "ranked-profile-meta-empty", emptyCopy));
    return;
  }

  const selectedLabel = LEADERBOARD_TABS.find((tab) => tab.id === state.tab)?.label || "Top 10";
  const metaCopy = query
    ? `${entries.length} match${entries.length === 1 ? "" : "es"} in ${totalEntries} loaded commanders`
    : `${selectedLabel} - ${entries.length} shown from ${totalEntries} loaded commanders`;
  body.appendChild(el("p", "ranked-leaderboard-meta", metaCopy));

  const mine = myPlayerId();
  const list = el("ol", "ranked-leaderboard-list");
  for (const entry of entries) {
    const isMe = mine && entry.playerId === mine;
    const row = el("li", `ranked-leaderboard-row${isMe ? " is-me" : ""}`);

    row.appendChild(el("span", "ranked-leaderboard-rank", `#${entry.rank}`));

    const avatar = el("div", "ranked-leaderboard-avatar");
    if (hasRankedAvatar(entry.avatarUnit)) {
      avatar.appendChild(createRankedAvatarIcon(entry.avatarUnit, { className: "is-thumb" }));
    } else if (entry.avatarUnit && hasPortrait(entry.avatarUnit)) {
      avatar.appendChild(createPortrait(entry.avatarUnit, { variant: "is-thumb", skin: entry.avatarSkin }));
    }
    row.appendChild(avatar);

    const name = el("div", "ranked-leaderboard-name");
    name.appendChild(el("span", "ranked-leaderboard-player", leaderboardPlayerName(entry, isMe)));
    const tagline = leaderboardTagline(entry);
    if (tagline) name.appendChild(el("span", "ranked-leaderboard-title", tagline));
    const record = `${entry.wins || 0}W / ${entry.losses || 0}L / ${entry.draws || 0}D`;
    name.appendChild(el("span", "ranked-leaderboard-record", record));
    row.appendChild(name);

    const tierId = normalizeRankedTierId(entry.tier);
    const standing = el("div", "ranked-leaderboard-standing");
    standing.appendChild(createRankedTierEmblem(entry.tier, { className: "is-leaderboard" }));
    const standingCopy = el("span", "ranked-leaderboard-standing-copy");
    standingCopy.appendChild(el("span", `ranked-leaderboard-tier ranked-tier-${tierId}`, entry.tier?.label || "Bronze"));
    standingCopy.appendChild(el("span", "ranked-leaderboard-rating", String(entry.rating ?? 1200)));
    standing.appendChild(standingCopy);
    row.appendChild(standing);

    list.appendChild(row);
  }
  body.appendChild(list);
}
