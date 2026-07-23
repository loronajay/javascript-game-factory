// Ranked match detail — the popup opened by clicking a row in the recent-matches list.
// Shows the outcome, the rating swing, both commanders, and the per-unit final board.
//
// Every fact rendered here comes from the server's match-history contract; this module
// never reconstructs a result from local state. When the server says the final board was
// not cross-attested by both clients, the unit rows fall back to squad names and the
// popup says so rather than presenting one player's report as the record.
//
// Layered over the ranked profile modal (a second `.ref-modal`), so Escape and the
// backdrop close only this popup and leave the profile beneath it open.
import { el } from "./domHelpers.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { TACTICAL_ARENA_GAME_SLUG } from "../platform/gameProgressClient.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { createRankedAvatarIcon, hasRankedAvatar } from "./rankedAvatars.js";
import { unitLabel } from "./rankedProfileIdentity.js";
import { buildMatchDetailView } from "./rankedMatchDetailModel.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal ranked-matchdetail-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

/**
 * Open the detail popup for one match.
 *
 * `perspective` is the player whose side the detail is shaped from — the owner of the
 * list that was clicked, not necessarily the signed-in reader, so opening another
 * player's history keeps showing their outcome.
 */
export function openRankedMatchDetail(matchId, { perspective = null, apiClient = null } = {}) {
  if (!matchId) return;
  const overlay = ensureHost();
  overlay.replaceChildren();

  const card = el("div", "ref-card ranked-matchdetail-card");
  overlay.appendChild(card);

  const head = el("header", "ref-head");
  const titleRow = el("div", "ref-head-title");
  titleRow.appendChild(el("h2", "", "Match Details"));
  const closeBtn = el("button", "ref-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close match details");
  titleRow.appendChild(closeBtn);
  head.appendChild(titleRow);
  card.appendChild(head);

  const body = el("div", "ranked-matchdetail-body");
  card.appendChild(body);
  body.appendChild(el("p", "ranked-profile-meta-loading", "Loading match…"));

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
    if (event.key !== "Escape") return;
    // Stop the ranked profile underneath from closing on the same keypress.
    event.stopPropagation();
    close();
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
  closeBtn.focus?.();

  const client = apiClient || createPlatformApiClient();
  if (typeof client?.fetchRankedMatchDetail !== "function") {
    renderError(body, "Match details are unavailable right now.");
    return;
  }
  client.fetchRankedMatchDetail(TACTICAL_ARENA_GAME_SLUG, matchId, { perspective })
    .then((match) => {
      const view = buildMatchDetailView(match);
      if (!view) {
        renderError(body, "That match could not be found.");
        return;
      }
      renderDetail(body, view);
    })
    .catch(() => renderError(body, "Could not load this match. Try again."));
}

function renderError(body, message) {
  body.replaceChildren(el("p", "ranked-profile-standing-error", message));
}

export function renderDetail(body, view) {
  body.replaceChildren();

  const banner = el("div", `ranked-matchdetail-banner is-${view.outcome}`);
  banner.appendChild(el("span", "ranked-matchdetail-outcome", view.outcomeLabel));
  if (view.rating) {
    const swing = el("span", `ranked-matchdetail-swing is-${view.rating.direction}`);
    swing.appendChild(el("b", "ranked-matchdetail-delta", view.rating.deltaText));
    swing.appendChild(el("span", "ranked-matchdetail-swing-range", `${view.rating.before} to ${view.rating.after}`));
    banner.appendChild(swing);
  } else if (!view.rated) {
    banner.appendChild(el("span", "ranked-matchdetail-swing is-flat", "Unrated"));
  }
  body.appendChild(banner);

  if (view.meta.length) {
    const meta = el("dl", "ranked-matchdetail-meta");
    for (const item of view.meta) {
      // Each label/value pair is wrapped so the grid lays out pairs, not alternating
      // cells — a <div> inside <dl> is valid and keeps dt/dd semantics intact.
      const pair = el("div", "ranked-matchdetail-meta-item");
      pair.appendChild(el("dt", "ranked-matchdetail-meta-label", item.label));
      pair.appendChild(el("dd", "ranked-matchdetail-meta-value", item.value));
      meta.appendChild(pair);
    }
    body.appendChild(meta);
  }

  const sides = el("div", "ranked-matchdetail-sides");
  for (const side of view.sides) sides.appendChild(renderSide(side, view.verified));
  body.appendChild(sides);

  if (view.notes.length) {
    const notes = el("ul", "ranked-matchdetail-notes");
    for (const note of view.notes) {
      notes.appendChild(el("li", `ranked-matchdetail-note is-${note.code}`, note.text));
    }
    body.appendChild(notes);
  }

  const footer = el("p", "ranked-matchdetail-footer");
  footer.appendChild(el("span", "ranked-matchdetail-verified", view.verified
    ? "Final board confirmed by both players."
    : "Final board not confirmed by both players."));
  footer.appendChild(el("span", "ranked-matchdetail-id", view.matchId));
  body.appendChild(footer);
}

function renderSide(side, verified) {
  const section = el("section", `ranked-matchdetail-side is-${side.outcome || "none"}${side.isViewer ? " is-me" : ""}`);

  const header = el("div", "ranked-matchdetail-sidehead");
  const avatar = el("div", "ranked-matchdetail-sideavatar");
  if (hasRankedAvatar(side.avatarUnit)) {
    avatar.appendChild(createRankedAvatarIcon(side.avatarUnit, { className: "is-thumb" }));
  } else if (side.avatarUnit && hasPortrait(side.avatarUnit)) {
    avatar.appendChild(createPortrait(side.avatarUnit, { variant: "is-thumb", skin: side.avatarSkin }));
  }
  header.appendChild(avatar);

  const copy = el("div", "ranked-matchdetail-sidecopy");
  copy.appendChild(el("span", "ranked-matchdetail-sidename", side.name));
  if (side.title) copy.appendChild(el("span", "ranked-matchdetail-sidetitle", side.title));
  const standing = [];
  if (Number.isFinite(side.ratingAfter)) standing.push(`${side.ratingAfter} rating`);
  if (side.deltaText) standing.push(side.deltaText);
  if (side.survivalText) standing.push(side.survivalText);
  if (standing.length) copy.appendChild(el("span", "ranked-matchdetail-sidestanding", standing.join(" · ")));
  header.appendChild(copy);
  section.appendChild(header);

  const squad = el("ul", "ranked-matchdetail-squad");
  if (!side.units.length) {
    squad.appendChild(el("li", "ranked-matchdetail-unit is-unknown", "Squad not recorded"));
  }
  for (const unit of side.units) {
    // `alive === null` means the board was never cross-attested: name the unit, claim
    // nothing about whether it survived.
    const stateClass = unit.alive === null ? "is-unknown" : unit.alive ? "is-alive" : "is-fallen";
    const item = el("li", `ranked-matchdetail-unit ${stateClass}`);
    if (hasPortrait(unit.unitType)) {
      item.appendChild(createPortrait(unit.unitType, { variant: "is-thumb" }));
    }
    const info = el("div", "ranked-matchdetail-unitinfo");
    info.appendChild(el("span", "ranked-matchdetail-unitname", unitLabel(unit.unitType)));
    if (verified && unit.alive !== null) {
      const state = unit.alive ? "Survived" : "Fell";
      // Kills only appear on a cross-attested board, and only when there are any — a
      // "0 kills" badge on every support unit is noise, not information. Environmental
      // and self-inflicted deaths credit nobody, so these tallies can legitimately add
      // up to less than the number of units that fell (see core/killAttribution.js).
      const kills = Number.isInteger(unit.kills) && unit.kills > 0 ? unit.kills : 0;
      const text = kills ? `${state} · ${kills} ${kills === 1 ? "kill" : "kills"}` : state;
      info.appendChild(el("span", "ranked-matchdetail-unitstate", text));
    }
    item.appendChild(info);
    squad.appendChild(item);
  }
  section.appendChild(squad);

  return section;
}
