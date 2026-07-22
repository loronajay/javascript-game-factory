// Shop body renderers, one per tab plus the two detail views. Split out of shop.js so
// the controller stays focused on state + lifecycle. Each renderer is a pure view over
// its offers and a `ctx` of callbacks the controller supplies: state transitions
// (openUnitDetail/closeUnitDetail, openPackDetail/closePackDetail, viewSkin) and the
// buy-action builders (which stay in the controller because they touch shop state).

import { UNIT_TYPES } from "../../core/unitCatalog.js";
import { groupedUnitTypes } from "../squadModel.js";
import { el } from "../domHelpers.js";
import { unitDetailHtml } from "../codex.js";
import { createConsumableIcon } from "../consumableIcons.js";
import { createPortrait } from "../portraits.js";
import { groupSkinOffersByClassAndType } from "../../progression/marketplace.js";
import {
  classLabel,
  createPackOwnershipLine,
  createPackPreview,
  createUnitOwnershipLine,
  packOwnershipLabel,
  rarityClass,
  rarityLabel,
} from "./shopWidgets.js";

export function renderUnits(body, offers, ctx) {
  for (const group of groupedUnitTypes(offers.map((offer) => offer.type))) {
    const section = el("section", "shop-section");
    section.appendChild(el("h3", "shop-section-title", group.label));
    const grid = el("div", "shop-grid shop-unit-grid");
    for (const type of group.types) {
      const offer = offers.find((item) => item.type === type);
      if (!offer) continue;
      const def = UNIT_TYPES[type];
      const card = el("article", `shop-item shop-unit${offer.owned ? " is-owned" : ""}`);
      card.appendChild(createPortrait(type, { variant: "is-shop-unit", eager: true }));
      const copy = el("div", "shop-item-copy");
      copy.append(el("b", "shop-item-title", offer.name), el("span", "shop-item-sub", classLabel(def.classType)));
      const actions = el("div", "shop-unit-actions");
      const details = el("button", "shop-detail-btn", "Details");
      details.type = "button";
      details.setAttribute("aria-label", `View ${offer.name} details`);
      details.addEventListener("click", () => ctx.openUnitDetail(offer.type, Number(body.scrollTop) || 0));
      actions.append(details, ctx.createUnitBuyActions(offer));
      card.append(copy, actions);
      grid.appendChild(card);
    }
    section.appendChild(grid);
    body.appendChild(section);
  }
}

export function renderUnitDetail(body, offer, ctx) {
  const def = UNIT_TYPES[offer.type];
  const detail = el("article", "shop-unit-detail");

  const top = el("div", "shop-unit-detail-top");
  const back = el("button", "shop-detail-back", "Back");
  back.type = "button";
  back.setAttribute("aria-label", "Back to unit shop");
  back.addEventListener("click", () => ctx.closeUnitDetail());
  top.appendChild(back);
  detail.appendChild(top);

  const hero = el("header", "shop-unit-detail-hero");
  hero.appendChild(createPortrait(offer.type, { variant: "is-shop-detail", eager: true }));
  const heroCopy = el("div", "shop-unit-detail-hero-copy");
  heroCopy.append(
    el("span", "shop-unit-detail-kicker", classLabel(def.classType)),
    el("h3", "shop-unit-detail-title", offer.name),
    createUnitOwnershipLine(offer),
  );
  hero.appendChild(heroCopy);
  detail.appendChild(hero);

  const rules = el("div", "shop-unit-detail-rules codex-detail");
  rules.innerHTML = unitDetailHtml(def);
  detail.appendChild(rules);

  const actions = el("div", "shop-unit-detail-actions");
  actions.appendChild(ctx.createUnitBuyActions(offer));
  detail.appendChild(actions);

  body.appendChild(detail);
}

export function renderSkinPacks(body, offers, ctx) {
  const section = el("section", "shop-section");
  section.appendChild(el("h3", "shop-section-title", "Skin Packs"));
  const grid = el("div", "shop-grid shop-pack-grid");
  for (const offer of offers) {
    const card = el("article", `shop-item shop-skin-pack${offer.owned ? " is-owned" : ""}`);
    card.setAttribute("aria-label", `View ${offer.name} contents`);
    card.addEventListener("click", () => ctx.openPackDetail(offer.packId));
    card.appendChild(createPackPreview(offer, "shop-pack-preview"));
    const copy = el("div", "shop-item-copy");
    copy.append(
      el("b", "shop-item-title", offer.name),
      el("span", "shop-item-sub", `${offer.skinCount} skins`),
      el("span", "shop-item-meta", packOwnershipLabel(offer)),
    );
    if (offer.donationNote) copy.appendChild(el("span", "shop-item-note", offer.donationNote));
    const actions = el("div", "shop-pack-actions");
    const details = el("button", "shop-detail-btn", "Details");
    details.type = "button";
    details.setAttribute("aria-label", `View ${offer.name} contents`);
    details.addEventListener("click", (event) => {
      event.stopPropagation?.();
      ctx.openPackDetail(offer.packId);
    });
    actions.append(details, ctx.createPackBuyActions(offer));
    card.append(copy, actions);
    grid.appendChild(card);
  }
  section.appendChild(grid);
  body.appendChild(section);
}

export function renderSkinPackDetail(body, offer, ctx) {
  const detail = el("article", "shop-pack-detail");

  const top = el("div", "shop-unit-detail-top");
  const back = el("button", "shop-detail-back", "Back");
  back.type = "button";
  back.setAttribute("aria-label", "Back to skin packs");
  back.addEventListener("click", () => ctx.closePackDetail());
  top.appendChild(back);
  detail.appendChild(top);

  const hero = el("header", "shop-pack-detail-hero");
  hero.appendChild(createPackPreview(offer, "shop-pack-detail-preview"));
  const heroCopy = el("div", "shop-unit-detail-hero-copy");
  heroCopy.append(
    el("span", "shop-unit-detail-kicker", `${offer.skinCount} skins`),
    el("h3", "shop-unit-detail-title", offer.name),
    createPackOwnershipLine(offer),
  );
  if (offer.donationNote) heroCopy.appendChild(el("span", "shop-item-note", offer.donationNote));
  hero.appendChild(heroCopy);
  detail.appendChild(hero);

  const contents = el("div", "shop-pack-contents");
  for (const skin of offer.skins) {
    const item = el("button", `shop-pack-skin${skin.owned ? " is-owned" : ""}`);
    item.type = "button";
    item.setAttribute("aria-label", `View ${skin.name} skin for ${skin.unitName}`);
    item.append(
      createPortrait(skin.type, { variant: "is-shop-pack-skin", eager: true, skin: skin.slug }),
      el("span", "shop-pack-skin-name", skin.name),
      el("span", "shop-pack-skin-unit", skin.unitName),
    );
    item.addEventListener("click", () => ctx.viewSkin(skin.type, skin.slug));
    contents.appendChild(item);
  }
  detail.appendChild(contents);

  const actions = el("div", "shop-pack-detail-actions");
  actions.appendChild(ctx.createPackBuyActions(offer));
  detail.appendChild(actions);

  body.appendChild(detail);
}

export function renderSkins(body, offers, ctx) {
  for (const group of groupSkinOffersByClassAndType(offers)) {
    const section = el("section", "shop-section shop-skin-class-section");
    section.appendChild(el("h3", "shop-section-title", group.label));
    for (const unit of group.units) {
      const unitSection = el("section", "shop-unit-skin-section");
      unitSection.dataset.type = unit.type;
      const unitHead = el("header", "shop-unit-skin-head");
      unitHead.append(
        createPortrait(unit.type, { variant: "is-shop-skin-unit", eager: true }),
        el("h4", "shop-unit-skin-title", unit.name),
        el("span", "shop-unit-skin-count", `${unit.offers.length} skins`),
      );
      const grid = el("div", "shop-grid shop-skin-grid");
      for (const offer of unit.offers) {
        const card = el("article", `shop-item shop-skin is-${rarityClass(offer.rarity)}${offer.owned ? " is-owned" : ""}`);
        card.setAttribute("aria-label", `View ${offer.name} skin for ${unit.name}`);
        card.addEventListener("click", () => ctx.viewSkin(offer.type, offer.slug));
        const preview = el("button", "shop-skin-preview");
        preview.type = "button";
        preview.setAttribute("aria-label", `View ${offer.name} skin for ${unit.name}`);
        preview.appendChild(createPortrait(offer.type, { variant: "is-shop-skin", eager: true, skin: offer.slug }));
        preview.addEventListener("click", (event) => {
          event.stopPropagation?.();
          ctx.viewSkin(offer.type, offer.slug);
        });
        card.appendChild(preview);
        const copy = el("div", "shop-item-copy");
        copy.append(
          el("b", "shop-item-title", offer.name),
          el("span", "shop-item-meta", rarityLabel(offer.rarity)),
        );
        if (offer.donationNote) copy.appendChild(el("span", "shop-item-note", offer.donationNote));
        card.append(copy, ctx.createSkinBuyActions(offer));
        grid.appendChild(card);
      }
      unitSection.append(unitHead, grid);
      section.appendChild(unitSection);
    }
    body.appendChild(section);
  }
}

export function renderConsumables(body, offers, ctx) {
  body.appendChild(el(
    "p",
    "shop-consumable-note",
    "Consumables are stored in Inventory. Boosts do nothing until activated from the Inventory tab; after activation, timed boosts begin on their next Valor or campaign trigger.",
  ));
  const groups = new Map();
  for (const offer of offers) {
    const list = groups.get(offer.family) ?? [];
    list.push(offer);
    groups.set(offer.family, list);
  }
  for (const [family, list] of groups.entries()) {
    const section = el("section", "shop-section");
    section.appendChild(el("h3", "shop-section-title", family));
    const grid = el("div", "shop-grid shop-consumable-grid");
    for (const offer of list) {
      const card = el("article", "shop-item shop-consumable");
      card.appendChild(createConsumableIcon(offer));
      const copy = el("div", "shop-item-copy");
      copy.append(
        el("b", "shop-item-title", offer.name),
        el("span", "shop-item-meta", offer.description),
      );
      card.append(copy, ctx.createConsumableBuyActions(offer));
      grid.appendChild(card);
    }
    section.appendChild(grid);
    body.appendChild(section);
  }
}

export function renderEmpty(body) {
  const empty = el("div", "shop-empty");
  empty.append(el("b", "shop-empty-title", "Nothing Here Yet"), el("span", "shop-empty-sub", "This shelf is ready for future offers."));
  body.appendChild(empty);
}
