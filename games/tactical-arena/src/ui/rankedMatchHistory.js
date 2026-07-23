// Ranked match history list — the "Recent Matches" section of the Ranked profile.
// Each row is a button that opens the in-depth detail popup (rankedMatchDetail.js).
//
// Extracted from rankedProfile.js so the profile overlay keeps owning identity/standing
// and this module owns history. Both read the server's match-history contract, so a row
// and the popup it opens can never disagree about an outcome or a rating delta.
import { el } from "./domHelpers.js";
import { unitLabel } from "./rankedProfileIdentity.js";
import { buildMatchRowView } from "./rankedMatchDetailModel.js";
import { openRankedMatchDetail } from "./rankedMatchDetail.js";

export const RANKED_MATCH_HISTORY_LIMIT = 20;

/**
 * Render the recent-matches list into `container`.
 *
 * `perspective` is the player whose history this is; it is passed through to the detail
 * popup so opening a row keeps that player's side of the match rather than flipping to
 * the signed-in reader's.
 */
export function renderMatchHistory(container, matches, { perspective = null, apiClient = null, openDetail = openRankedMatchDetail } = {}) {
  container.replaceChildren();
  const rows = (Array.isArray(matches) ? matches : []).map(buildMatchRowView).filter(Boolean);
  if (!rows.length) {
    container.appendChild(el("p", "ranked-profile-meta-empty", "No ranked matches yet."));
    return;
  }

  const list = el("ul", "ranked-profile-matchlist");
  for (const row of rows) {
    const item = el("li", "ranked-profile-matchitem");
    const button = el("button", `ranked-profile-matchrow is-${row.outcome}`);
    button.type = "button";
    button.setAttribute("aria-label", `${row.mark === "W" ? "Win" : row.mark === "L" ? "Loss" : "Draw"} against ${row.opponentName}. View match details.`);

    button.appendChild(el("span", "ranked-profile-matchoutcome", row.mark));
    if (row.deltaText) button.appendChild(el("span", "ranked-profile-matchdelta", row.deltaText));

    const copy = el("div", "ranked-profile-matchcopy");
    copy.appendChild(el("span", "ranked-profile-matchopponent", `vs ${row.opponentName}`));
    copy.appendChild(el("span", "ranked-profile-matchsquads", squadLine(row.squad)));
    button.appendChild(copy);

    button.appendChild(el("span", "ranked-profile-matchdate", row.dateText));
    button.appendChild(el("span", "ranked-profile-matchopen", "›"));

    button.addEventListener("click", () => {
      openDetail(row.matchId, { perspective, apiClient });
    });

    item.appendChild(button);
    list.appendChild(item);
  }
  container.appendChild(list);
}

function squadLine(squad) {
  const names = (squad || []).map(unitLabel).filter(Boolean);
  return names.length ? names.join(", ") : "Squad not recorded";
}
