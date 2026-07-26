// Per-unit ranked record grid. Extracted from rankedProfile.js so the public player
// profile (taPlayerProfile.js) renders the same grid from the same public endpoint —
// two surfaces showing one player's unit record must never disagree about it.
import { el } from "./domHelpers.js";
import { createPortrait, hasPortrait } from "./portraits.js";
import { unitLabel } from "./rankedProfileIdentity.js";

export function renderUnitStats(container, units) {
  container.replaceChildren();
  const list = Array.isArray(units) ? units : [];
  if (!list.length) {
    container.appendChild(el("p", "ranked-profile-meta-empty", "No ranked unit records yet."));
    return;
  }
  const grid = el("div", "ranked-profile-unitgrid");
  for (const u of list) {
    const cell = el("div", "ranked-profile-unitcell");
    if (hasPortrait(u.unitType)) {
      cell.appendChild(createPortrait(u.unitType, { variant: "is-thumb" }));
    }
    const info = el("div", "ranked-profile-unitinfo");
    info.appendChild(el("span", "ranked-profile-unitname", unitLabel(u.unitType)));
    const winPct = u.games > 0 ? Math.round((u.wins / u.games) * 100) : 0;
    info.appendChild(el("span", "ranked-profile-unitstat", `${u.games}G · ${winPct}% W · ${u.survivals} survived`));
    cell.appendChild(info);
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}
