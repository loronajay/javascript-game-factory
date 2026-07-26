// Tactical Arena player profile — the in-game, public view of ANY player: their
// ranked nameplate, badges, record, per-unit stats, recent matches, and the friend
// actions for your relationship with them.
//
// This is the in-game counterpart to the factory /player page. Both stay available:
// the platform profile is the wider social view, this one is the Tactical Arena view,
// and a link to the platform page sits in the footer rather than replacing anything.
//
// Everything shown is a public read (ranked card / unit stats / match history /
// badges), so this renders for opponents and strangers, not just friends.
import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import {
  createTaFriendsClient,
  taSocialAvailability,
  TA_SOCIAL_SIGNED_OUT,
} from "../platform/taFriendsClient.js";
import { createFactoryAccountSignInUrl } from "../platform/factoryAccount.js";
import { factoryPlayerUrl } from "../platform/factoryLinks.js";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";
import { renderNameplateAvatar } from "./rankedProfileNameplate.js";
import { renderUnitStats } from "./rankedUnitStats.js";
import { RANKED_MATCH_HISTORY_LIMIT, renderMatchHistory } from "./rankedMatchHistory.js";
import { renderTaSocialActions } from "./taSocialActions.js";
import { taPlayerName, taPlayerRecordLine } from "./taFriendsModel.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ta-player-modal";
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

/**
 * Open the profile for `playerId`.
 *
 * `seed` carries anything the caller already knows (name, rating, relationship) so
 * the card renders immediately and then fills in — an opponent card or a friends row
 * already has most of it, and a blank modal while the network settles reads as broken.
 * `onRelationshipChanged` lets the opening list refresh itself after an action here.
 *
 * `client`/`apiClient`/`availability` are injectable: a caller that already has a
 * friends client (the friends panel) passes its own rather than building a second,
 * and headless tests pass fakes. Production callers may omit all three.
 */
export function openTaPlayerProfile(playerId, {
  seed = null,
  onRelationshipChanged = () => {},
  client = null,
  apiClient = null,
  availability = null,
} = {}) {
  const targetId = typeof playerId === "string" ? playerId.trim() : "";
  if (!targetId) return;

  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card ta-player-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Player Profile"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  card.appendChild(head);

  const body = el("div", "ta-player-body");
  card.appendChild(body);

  populate(body, targetId, { seed, onRelationshipChanged, injected: { client, apiClient, availability } });

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
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
}

function populate(body, targetId, { seed, onRelationshipChanged, injected = {} }) {
  const availability = injected.availability || taSocialAvailability();
  const apiClient = injected.apiClient || safeApiClient();
  const friendsClient = injected.client || createTaFriendsClient({ apiClient });
  const isMe = targetId === myPlayerId();

  // The identity block renders from the seed straight away, then upgrades when the
  // public card arrives.
  const identity = el("section", "ta-player-identity");
  body.appendChild(identity);
  renderIdentity(identity, { ...(seed || {}), playerId: targetId });

  const badges = el("section", "ta-player-badges");
  body.appendChild(badges);

  const actions = el("section", "ta-player-actions");
  body.appendChild(actions);

  if (availability === TA_SOCIAL_SIGNED_OUT) {
    const notice = el("p", "ranked-profile-signin", "Sign in to your Javascript Game Factory account to add Tactical Arena friends.");
    const link = document.createElement("a");
    link.className = "ranked-profile-signin-link menu-btn";
    link.textContent = "Sign In";
    try { link.href = createFactoryAccountSignInUrl(); } catch { link.href = "#"; }
    actions.append(notice, link);
  } else if (isMe) {
    actions.appendChild(el("p", "ta-player-self-note", "This is your Tactical Arena profile."));
  }

  const stats = el("section", "ranked-profile-units");
  stats.appendChild(el("h3", "ranked-profile-section-title", "Unit Record"));
  const statsBody = el("div", "ranked-profile-units-body");
  statsBody.appendChild(el("p", "ranked-profile-meta-loading", "Loading unit stats…"));
  stats.appendChild(statsBody);
  body.appendChild(stats);

  const matches = el("section", "ranked-profile-matches");
  matches.appendChild(el("h3", "ranked-profile-section-title", "Recent Matches"));
  const matchesBody = el("div", "ranked-profile-matches-body");
  matchesBody.appendChild(el("p", "ranked-profile-meta-loading", "Loading match history…"));
  matches.appendChild(matchesBody);
  body.appendChild(matches);

  body.appendChild(renderFooter(targetId));

  // The ranked reads (card / units / matches) and the social reads (badges /
  // relationship) come from different clients, so an unavailable ranked service must
  // not blank out the friend actions, and vice versa.
  const rankedReady = Boolean(apiClient?.isConfigured);
  if (!rankedReady) {
    statsBody.replaceChildren(el("p", "ranked-profile-standing-error", "Ranked stats are unavailable right now."));
    matchesBody.replaceChildren();
  } else if (typeof apiClient.fetchRankedCard === "function") {
    // Ranked card (identity + standing).
    apiClient.fetchRankedCard(TACTICAL_ARENA_GAME_SLUG, targetId)
      .then((cardData) => {
        if (!cardData) return;
        renderIdentity(identity, { ...(seed || {}), ...cardData, playerId: targetId });
      })
      .catch(() => {});
  }

  // Badges.
  Promise.resolve(friendsClient.badgesFor(targetId))
    .then((res) => renderBadges(badges, res?.badges || []))
    .catch(() => renderBadges(badges, []));

  // Friend actions, once the server has told us the actual relationship.
  if (availability === "ready" && !isMe) {
    actions.appendChild(el("p", "ranked-profile-meta-loading", "Loading…"));
    Promise.resolve(friendsClient.relationshipWith(targetId))
      .then((relationship) => {
        actions.replaceChildren();
        renderTaSocialActions(actions, {
          player: {
            playerId: targetId,
            relationship: relationship?.relationship || seed?.relationship || "none",
            requestId: relationship?.requestId || seed?.requestId || null,
          },
          client: friendsClient,
          onChanged: onRelationshipChanged,
        });
      })
      .catch(() => {
        actions.replaceChildren(el("p", "ranked-profile-standing-error", "Could not load your relationship with this player."));
      });
  }

  if (!rankedReady) return;

  // Per-unit record.
  if (typeof apiClient.fetchRankedUnitStats === "function") {
    apiClient.fetchRankedUnitStats(TACTICAL_ARENA_GAME_SLUG, targetId)
      .then((res) => renderUnitStats(statsBody, res?.units || []))
      .catch(() => renderUnitStats(statsBody, []));
  } else {
    renderUnitStats(statsBody, []);
  }

  // Match history, kept in this player's perspective rather than the reader's.
  const history = (rows) => renderMatchHistory(matchesBody, rows, { perspective: targetId, apiClient });
  if (typeof apiClient.fetchRankedMatches === "function") {
    apiClient.fetchRankedMatches(TACTICAL_ARENA_GAME_SLUG, targetId, RANKED_MATCH_HISTORY_LIMIT)
      .then((res) => history(res?.matches || []))
      .catch(() => history([]));
  } else {
    history([]);
  }
}

function renderIdentity(section, player) {
  section.replaceChildren();
  const tierId = normalizeRankedTierId(player.tier);
  const nameplate = el("div", `ranked-profile-nameplate ranked-tier-${tierId}`);

  const avatar = el("div", "ranked-profile-nameplate-avatar");
  // Same filler the ranked profile uses, so avatars, skins, and the initial fallback
  // look identical on both surfaces.
  renderNameplateAvatar(avatar, {
    pilot: taPlayerName(player),
    avatarUnit: player.avatarUnit,
    avatarSkin: player.avatarSkin,
  });
  nameplate.appendChild(avatar);

  const copy = el("div", "ranked-profile-nameplate-copy");
  copy.appendChild(el("span", "ranked-profile-nameplate-name", taPlayerName(player)));
  const tagline = typeof player.tagline === "string" ? player.tagline.trim() : (player.title || "");
  if (tagline) copy.appendChild(el("span", "ranked-profile-nameplate-tagline", tagline));
  const meta = el("span", "ranked-profile-nameplate-meta");
  if (player.tier?.label) meta.appendChild(el("b", `ranked-profile-tier ranked-tier-${tierId}`, player.tier.label));
  meta.appendChild(el("span", "ranked-profile-rating-inline", taPlayerRecordLine(player)));
  copy.appendChild(meta);
  nameplate.appendChild(copy);

  if (player.tier) nameplate.appendChild(createRankedTierEmblem(player.tier, { className: "is-profile" }));
  section.appendChild(nameplate);
}

function renderBadges(section, badges) {
  section.replaceChildren();
  if (!badges.length) return;
  section.appendChild(el("h3", "ranked-profile-section-title", "Badges"));
  const row = el("div", "ta-player-badge-row");
  for (const badge of badges) {
    const item = el("div", "ta-player-badge");
    item.title = `${badge.label} — ${badge.description}`;
    if (badge.icon) {
      const img = document.createElement("img");
      img.className = "ta-player-badge-icon";
      // Badge icons are declared relative to the game folder; this module lives at
      // src/ui/, so resolve against the document rather than assuming a depth.
      img.src = new URL(`../../${badge.icon}`, import.meta.url).href;
      img.alt = badge.label;
      img.loading = "lazy";
      item.appendChild(img);
    }
    item.appendChild(el("span", "ta-player-badge-label", badge.label));
    row.appendChild(item);
  }
  section.appendChild(row);
}

function renderFooter(targetId) {
  const footer = el("footer", "ta-player-footer");
  const url = factoryPlayerUrl(targetId);
  if (url) {
    const link = document.createElement("a");
    link.className = "menu-btn ghost ta-player-platform-link";
    link.href = url;
    link.textContent = "View Factory Profile";
    link.title = "Open this player's Javascript Game Factory profile.";
    footer.appendChild(link);
  }
  return footer;
}

function safeApiClient() {
  try {
    return createPlatformApiClient();
  } catch {
    return null;
  }
}
