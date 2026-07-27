// Avatars shop tab renderer. Split out of shopTabs.js (which is close to its architecture
// line cap) rather than grown inside it — a pure view over the avatar offers plus the
// buy-action builder, same contract as the other shopTabs.js renderers.

import { el } from "../domHelpers.js";
import { createRankedAvatarIcon } from "../rankedAvatars.js";

export function renderAvatars(body, offers, ctx) {
  const note = el(
    "p",
    "shop-consumable-note",
    "The first avatars are free starters. Unlock the rest with Valor, or set your avatar to a portrait of any unit or skin you own from the Ranked profile editor.",
  );
  body.appendChild(note);

  const section = el("section", "shop-section");
  const grid = el("div", "shop-grid shop-avatar-grid");
  for (const offer of offers) {
    const card = el("article", `shop-item shop-avatar${offer.owned ? " is-owned" : ""}`);
    card.appendChild(createRankedAvatarIcon(offer.avatarId, { className: "is-shop-avatar" }));
    const copy = el("div", "shop-item-copy");
    copy.append(el("b", "shop-item-title", offer.name));
    if (offer.free) copy.appendChild(el("span", "shop-item-sub", "Starter"));
    card.append(copy, ctx.createAvatarBuyActions(offer));
    grid.appendChild(card);
  }
  section.appendChild(grid);
  body.appendChild(section);
}
