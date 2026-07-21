// Post-match opponent ranked card + discovery actions, extracted from resultsScreen.js
// to keep that screen a thin composer. Ranked matches are the first-class add-friend
// entry point (see the platform discovery vision), so a resolved online ranked duel
// surfaces the opponent's ranked standing plus View Profile / Add Friend / Message
// deep-links. All platform I/O is best-effort: a signed-out or offline player still sees
// the card, just with the actions disabled.

import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";
import { factoryMessagesUrl, factoryPlayerUrl } from "../platform/factoryLinks.js";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";

// Fill `host` with the opponent card for a resolved online ranked match, or hide it.
// `ranked` is the last match's ranked handoff ({ opponentPlayerId, ... }) or null.
export function renderOpponentCard(host, ranked) {
  if (!host) return;
  host.replaceChildren();
  const opponentId = ranked?.opponentPlayerId;
  if (!opponentId) { host.hidden = true; return; }
  host.hidden = false;

  host.appendChild(el("h3", "results-opponent-title", "Your Opponent"));
  const body = el("div", "results-opponent-body");
  body.appendChild(el("p", "results-opponent-loading", "Loading opponent…"));
  host.appendChild(body);

  let apiClient = null;
  try { apiClient = createPlatformApiClient(); } catch { apiClient = null; }
  if (!apiClient?.isConfigured || typeof apiClient.fetchRankedCard !== "function") {
    fillOpponentCard(body, { playerId: opponentId }, apiClient);
    return;
  }
  apiClient.fetchRankedCard(TACTICAL_ARENA_GAME_SLUG, opponentId)
    .then((card) => fillOpponentCard(body, card || { playerId: opponentId }, apiClient))
    .catch(() => fillOpponentCard(body, { playerId: opponentId }, apiClient));
}

function fillOpponentCard(body, card, apiClient) {
  body.replaceChildren();
  const opponentId = card.playerId;

  const head = el("div", "results-opponent-head");
  head.appendChild(el("span", "results-opponent-name", card.title || "Ranked Rival"));
  if (Number.isFinite(Number(card.rating))) {
    const tierId = normalizeRankedTierId(card.tier);
    const standing = el("span", "results-opponent-standing");
    standing.appendChild(createRankedTierEmblem(card.tier, { className: "is-opponent" }));
    standing.appendChild(el("span", `results-opponent-tier ranked-tier-${tierId}`, `${card.tier?.label || "Bronze"} · ${card.rating}`));
    head.appendChild(standing);
  }
  body.appendChild(head);

  const record = (Number(card.wins) || 0) + (Number(card.losses) || 0) + (Number(card.draws) || 0) > 0
    ? `${card.wins || 0}W / ${card.losses || 0}L / ${card.draws || 0}D`
    : "No ranked record yet";
  body.appendChild(el("p", "results-opponent-record", record));

  const actions = el("div", "results-opponent-actions");

  const profileUrl = factoryPlayerUrl(opponentId);
  if (profileUrl) {
    const view = el("a", "results-opponent-btn menu-btn", "View Profile");
    view.href = profileUrl;
    actions.appendChild(view);
  }

  const addFriend = el("button", "results-opponent-btn menu-btn", "Add Friend");
  addFriend.type = "button";
  wireAddFriend(addFriend, apiClient, opponentId);
  actions.appendChild(addFriend);

  const messageUrl = factoryMessagesUrl(opponentId, { name: card.title || "" });
  if (messageUrl) {
    const message = el("a", "results-opponent-btn menu-btn ghost", "Message");
    message.href = messageUrl;
    actions.appendChild(message);
  }

  body.appendChild(actions);
}

function wireAddFriend(button, apiClient, opponentId) {
  const myId = myPlayerId();
  if (!apiClient?.isConfigured || typeof apiClient.createFriendshipBetweenPlayers !== "function" || !myId) {
    button.disabled = true;
    button.title = "Sign in to add friends.";
    return;
  }
  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "Adding…";
    apiClient.createFriendshipBetweenPlayers(myId, opponentId)
      .then((friendship) => { button.textContent = friendship ? "Friend Added" : "Request Sent"; })
      .catch(() => { button.textContent = "Try Again"; button.disabled = false; });
  });
}

function myPlayerId() {
  try {
    return createOnlineIdentityPayload(loadFactoryProfile()).playerId || "";
  } catch {
    return "";
  }
}
