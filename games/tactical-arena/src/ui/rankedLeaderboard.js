// Ranked Leaderboard — the top-N ranked ladder for Tactical Arena (Phase 4 of
// RANKED_FEATURE_PLAN.md). A read-only modal over the public leaderboard endpoint;
// each row shows rank, avatar, ranked title, tier + rating, and W/L/D. The signed-in
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
import { createPortrait, hasPortrait } from "./portraits.js";

const LEADERBOARD_LIMIT = 50;

let host = null;

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
  const canServe = isFactoryAccountLoggedIn(account)
    && apiClient?.isConfigured
    && typeof apiClient.fetchRankedLeaderboard === "function";

  if (!canServe) {
    const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to view the ranked ladder.");
    const link = document.createElement("a");
    link.className = "ranked-profile-signin-link menu-btn";
    link.textContent = "Sign In";
    try { link.href = createFactoryAccountSignInUrl(); } catch { link.href = "#"; }
    body.append(notice, link);
    return;
  }

  body.appendChild(el("p", "ranked-profile-meta-loading", "Loading ladder…"));

  apiClient.fetchRankedLeaderboard(TACTICAL_ARENA_GAME_SLUG, LEADERBOARD_LIMIT)
    .then((leaderboard) => renderLeaderboard(body, leaderboard?.entries || []))
    .catch(() => {
      body.replaceChildren(el("p", "ranked-profile-standing-error", "Could not load the leaderboard."));
    });
}

function renderLeaderboard(body, entries) {
  body.replaceChildren();
  if (!entries.length) {
    body.appendChild(el("p", "ranked-profile-meta-empty", "No ranked players yet. Play a ranked match to claim the top spot."));
    return;
  }

  const mine = myPlayerId();
  const list = el("ol", "ranked-leaderboard-list");
  for (const entry of entries) {
    const isMe = mine && entry.playerId === mine;
    const row = el("li", `ranked-leaderboard-row${isMe ? " is-me" : ""}`);

    row.appendChild(el("span", "ranked-leaderboard-rank", `#${entry.rank}`));

    const avatar = el("div", "ranked-leaderboard-avatar");
    if (entry.avatarUnit && hasPortrait(entry.avatarUnit)) {
      avatar.appendChild(createPortrait(entry.avatarUnit, { variant: "is-thumb", skin: entry.avatarSkin }));
    }
    row.appendChild(avatar);

    const name = el("div", "ranked-leaderboard-name");
    name.appendChild(el("span", "ranked-leaderboard-title", entry.title || (isMe ? "You" : "Commander")));
    const record = `${entry.wins || 0}W / ${entry.losses || 0}L / ${entry.draws || 0}D`;
    name.appendChild(el("span", "ranked-leaderboard-record", record));
    row.appendChild(name);

    const tierId = entry.tier?.id || "bronze";
    const standing = el("div", "ranked-leaderboard-standing");
    standing.appendChild(el("span", `ranked-leaderboard-tier ranked-tier-${tierId}`, entry.tier?.label || "Bronze"));
    standing.appendChild(el("span", "ranked-leaderboard-rating", String(entry.rating ?? 1200)));
    row.appendChild(standing);

    list.appendChild(row);
  }
  body.appendChild(list);
}
