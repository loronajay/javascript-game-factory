// Post-match opponent ranked card + discovery actions, extracted from resultsScreen.js
// to keep that screen a thin composer. Ranked matches are the first-class add-friend
// entry point, so a resolved online ranked duel surfaces the opponent's ranked
// standing plus the Tactical Arena profile/friend actions and the wider factory
// profile + DM deep-links.
//
// Adding a friend here adds a TACTICAL ARENA friend (src/platform/taFriendsClient.js),
// not a factory-wide one — the factory profile link next to it is the other option.
//
// Card/record shaping lives in resultsOpponentCardModel.js; this file owns only the DOM
// rendering and the friend-action wiring.

import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { createTaFriendsClient, taSocialAvailability } from "../platform/taFriendsClient.js";
import { factoryMessagesUrl, factoryPlayerUrl } from "../platform/factoryLinks.js";
import { createRankedTierEmblem, normalizeRankedTierId } from "./rankedEmblems.js";
import { openTaPlayerProfile } from "./taPlayerProfile.js";
import { renderTaSocialActions } from "./taSocialActions.js";
import { cardName, mergeFetchedCard, opponentCardFromMatch } from "./resultsOpponentCardModel.js";

// Fill `host` with the opponent card for a resolved online ranked match, or hide it.
// `context` carries the match-local identity exchange so offline/stale platform reads
// still render the opponent's pilot name and the just-finished result.
export function renderOpponentCard(host, ranked, context = {}) {
  if (!host) return;
  host.replaceChildren();
  const opponentId = ranked?.opponentPlayerId;
  if (!opponentId) { host.hidden = true; return; }
  host.hidden = false;
  const matchCard = opponentCardFromMatch(ranked, context);

  host.appendChild(el("h3", "results-opponent-title", "Your Opponent"));
  const body = el("div", "results-opponent-body");
  body.appendChild(el("p", "results-opponent-loading", "Loading opponent..."));
  host.appendChild(body);

  let apiClient = null;
  try { apiClient = createPlatformApiClient(); } catch { apiClient = null; }
  if (!apiClient?.isConfigured || typeof apiClient.fetchRankedCard !== "function") {
    fillOpponentCard(body, matchCard.card);
    return;
  }
  apiClient.fetchRankedCard(TACTICAL_ARENA_GAME_SLUG, opponentId)
    .then((card) => fillOpponentCard(body, mergeFetchedCard(card, matchCard)))
    .catch(() => fillOpponentCard(body, matchCard.card));
}

function fillOpponentCard(body, card) {
  body.replaceChildren();
  const opponentId = card.playerId;
  const head = el("div", "results-opponent-head");
  head.appendChild(el("span", "results-opponent-name", cardName(card)));
  if (Number.isFinite(Number(card.rating))) {
    const tierId = normalizeRankedTierId(card.tier);
    const standing = el("span", "results-opponent-standing");
    standing.appendChild(createRankedTierEmblem(card.tier, { className: "is-opponent" }));
    standing.appendChild(el("span", `results-opponent-tier ranked-tier-${tierId}`, `${card.tier?.label || "Bronze"} - ${card.rating}`));
    head.appendChild(standing);
  }
  body.appendChild(head);

  const record = (Number(card.wins) || 0) + (Number(card.losses) || 0) + (Number(card.draws) || 0) > 0
    ? `${card.wins || 0}W / ${card.losses || 0}L / ${card.draws || 0}D`
    : "No ranked record yet";
  body.appendChild(el("p", "results-opponent-record", record));

  const actions = el("div", "results-opponent-actions");

  // Tactical Arena's own profile + friends come first — this is a TA results screen,
  // and the TA friends graph is the one an opponent here belongs in. The factory
  // profile and DM links stay as the wider platform option.
  const viewTa = el("button", "results-opponent-btn menu-btn", "View Profile");
  viewTa.type = "button";
  viewTa.addEventListener("click", () => {
    openTaPlayerProfile(opponentId, { seed: { ...card, displayName: cardName(card) } });
  });
  actions.appendChild(viewTa);

  const addFriend = el("div", "results-opponent-friend");
  renderTaAddFriend(addFriend, opponentId);
  actions.appendChild(addFriend);

  const profileUrl = factoryPlayerUrl(opponentId);
  if (profileUrl) {
    const view = el("a", "results-opponent-btn menu-btn ghost", "Factory Profile");
    view.href = profileUrl;
    actions.appendChild(view);
  }

  const messageUrl = factoryMessagesUrl(opponentId, { name: cardName(card) });
  if (messageUrl) {
    const message = el("a", "results-opponent-btn menu-btn ghost", "Message");
    message.href = messageUrl;
    actions.appendChild(message);
  }
  body.appendChild(actions);
}

// The TA add-friend control. It waits for the server's answer on the current
// relationship before rendering, so it never offers "Add Friend" to someone who is
// already a friend or has a request outstanding.
function renderTaAddFriend(host, opponentId) {
  if (taSocialAvailability() !== "ready") return;
  const client = createTaFriendsClient();
  host.appendChild(el("span", "results-opponent-friend-loading", "…"));
  client.relationshipWith(opponentId)
    .then((relationship) => {
      host.replaceChildren();
      if (!relationship || relationship.relationship === "self") return;
      renderTaSocialActions(host, {
        player: {
          playerId: opponentId,
          relationship: relationship.relationship,
          requestId: relationship.requestId,
        },
        client,
        compact: true,
      });
    })
    .catch(() => host.replaceChildren());
}
