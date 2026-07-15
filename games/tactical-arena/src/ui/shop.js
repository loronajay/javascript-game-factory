import {
  formatPremiumPrice,
  formatValor,
  formatValorAmount,
  groupSkinOffersByClassAndType,
  getShopCatalog,
  purchaseSkinWithValor,
  purchaseUnitWithValor,
} from "../progression/marketplace.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { groupedUnitTypes } from "./squadModel.js";
import { unitDetailHtml } from "./codex.js";
import { createPortrait } from "./portraits.js";
import { openSkinViewer } from "./skinGallery.js";

let host = null;
let hostDocument = null;

function ensureHost() {
  if (host && hostDocument === document) return host;
  host = document.createElement("div");
  hostDocument = document;
  host.className = "ref-modal shop-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export function openShop(storage = globalThis.localStorage) {
  const overlay = ensureHost();
  let activeTab = "units";
  let statusText = "";
  let detailUnitType = null;
  let unitScrollTop = 0;
  let pendingValorPurchase = null;

  function render() {
    const catalog = getShopCatalog(storage);
    const pendingOffer = pendingValorPurchase ? currentPendingOffer(catalog) : null;
    if (pendingValorPurchase && (!pendingOffer || pendingOffer.owned)) pendingValorPurchase = null;
    const detailOffer = activeTab === "units" && detailUnitType
      ? catalog.units.find((offer) => offer.type === detailUnitType)
      : null;
    overlay.replaceChildren();

    const card = el("div", "ref-card shop-card");
    overlay.appendChild(card);

    const head = el("header", "ref-head shop-head");
    const titleRow = el("div", "ref-head-title shop-title-row");
    const titleStack = el("div", "shop-title-stack");
    titleStack.append(el("h2", "", "Shop"), createValorBadge(catalog.resource.balance, "shop-balance"));
    const closeBtn = el("button", "ref-close", "X");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", close);
    titleRow.append(titleStack, closeBtn);
    head.appendChild(titleRow);

    const tabs = el("div", "ref-tabs shop-tabs");
    for (const tab of catalog.tabs) {
      const tabBtn = el("button", `ref-tab${activeTab === tab.id ? " is-active" : ""}`, tab.label);
      tabBtn.type = "button";
      tabBtn.setAttribute("aria-selected", String(activeTab === tab.id));
      tabBtn.addEventListener("click", () => {
        activeTab = tab.id;
        detailUnitType = null;
        pendingValorPurchase = null;
        statusText = "";
        render();
      });
      tabs.appendChild(tabBtn);
    }
    head.appendChild(tabs);
    card.appendChild(head);

    const body = el("div", `shop-body${detailOffer ? " is-detail-view" : ""}`);
    if (detailOffer) renderUnitDetail(body, detailOffer);
    else if (activeTab === "units") renderUnits(body, catalog.units);
    else if (activeTab === "skins") renderSkins(body, catalog.skins);
    else renderBoosts(body);
    card.appendChild(body);
    if (activeTab === "units" && !detailOffer && unitScrollTop > 0) body.scrollTop = unitScrollTop;

    const foot = el("footer", "roster-foot shop-foot");
    const status = el("span", "shop-status", statusText);
    const done = el("button", "menu-btn", "Done");
    done.type = "button";
    done.addEventListener("click", close);
    foot.append(status, done);
    card.appendChild(foot);

    if (pendingOffer && !pendingOffer.owned) overlay.appendChild(createPurchaseConfirm(pendingValorPurchase.kind, pendingOffer));
  }

  function renderUnits(body, offers) {
    for (const group of groupedUnitTypes(offers.map((offer) => offer.type))) {
      const section = el("section", "shop-section");
      section.appendChild(el("h3", "shop-section-title", group.label));
      const grid = el("div", "shop-grid shop-unit-grid");
      for (const type of group.types) {
        const offer = offers.find((item) => item.type === type);
        if (!offer) continue;
        const def = UNIT_TYPES[type];
        const card = el("article", `shop-item shop-unit${offer.owned ? " is-owned" : ""}`);
        card.appendChild(createPortrait(type, { variant: "is-shop-unit", eager: activeTab === "units" }));
        const copy = el("div", "shop-item-copy");
        copy.append(el("b", "shop-item-title", offer.name), el("span", "shop-item-sub", classLabel(def.classType)));
        const actions = el("div", "shop-unit-actions");
        const details = el("button", "shop-detail-btn", "Details");
        details.type = "button";
        details.setAttribute("aria-label", `View ${offer.name} details`);
        details.addEventListener("click", () => {
          unitScrollTop = Number(body.scrollTop) || 0;
          detailUnitType = offer.type;
          statusText = "";
          render();
        });
        actions.append(details, createUnitBuyActions(offer));
        card.append(copy, actions);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
  }

  function renderUnitDetail(body, offer) {
    const def = UNIT_TYPES[offer.type];
    const detail = el("article", "shop-unit-detail");

    const top = el("div", "shop-unit-detail-top");
    const back = el("button", "shop-detail-back", "Back");
    back.type = "button";
    back.setAttribute("aria-label", "Back to unit shop");
    back.addEventListener("click", () => {
      detailUnitType = null;
      pendingValorPurchase = null;
      render();
    });
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
    actions.appendChild(createUnitBuyActions(offer));
    detail.appendChild(actions);

    body.appendChild(detail);
  }

  function renderSkins(body, offers) {
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
          const card = el("article", `shop-item shop-skin is-${offer.rarity}${offer.owned ? " is-owned" : ""}`);
          card.setAttribute("aria-label", `View ${offer.name} skin for ${unit.name}`);
          card.addEventListener("click", () => {
            openSkinViewer({ type: offer.type, slug: offer.slug, storage });
          });
          const preview = el("button", "shop-skin-preview");
          preview.type = "button";
          preview.setAttribute("aria-label", `View ${offer.name} skin for ${unit.name}`);
          preview.appendChild(createPortrait(offer.type, { variant: "is-shop-skin", eager: true, skin: offer.slug }));
          preview.addEventListener("click", (event) => {
            event.stopPropagation?.();
            openSkinViewer({ type: offer.type, slug: offer.slug, storage });
          });
          card.appendChild(preview);
          const copy = el("div", "shop-item-copy");
          copy.append(
            el("b", "shop-item-title", offer.name),
            el("span", "shop-item-meta", rarityLabel(offer.rarity)),
          );
          card.append(copy, createSkinBuyActions(offer));
          grid.appendChild(card);
        }
        unitSection.append(unitHead, grid);
        section.appendChild(unitSection);
      }
      body.appendChild(section);
    }
  }

  function renderBoosts(body) {
    const empty = el("div", "shop-empty");
    empty.append(el("b", "shop-empty-title", "No Boosts Yet"), el("span", "shop-empty-sub", "This shelf is ready when boosts arrive."));
    body.appendChild(empty);
  }

  function close() {
    pendingValorPurchase = null;
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }

  function openValorPurchase(kind, offer) {
    pendingValorPurchase = kind === "skin"
      ? { kind, type: offer.type, slug: offer.slug }
      : { kind, type: offer.type };
    render();
  }

  function dismissValorPurchase() {
    pendingValorPurchase = null;
    render();
  }

  function currentPendingOffer(catalog) {
    if (!pendingValorPurchase) return null;
    if (pendingValorPurchase.kind === "unit") {
      return catalog.units.find((offer) => offer.type === pendingValorPurchase.type) ?? null;
    }
    return catalog.skins.find((offer) =>
      offer.type === pendingValorPurchase.type && offer.slug === pendingValorPurchase.slug) ?? null;
  }

  function confirmValorPurchase(kind, offer) {
    const result = kind === "skin"
      ? purchaseSkinWithValor(storage, offer.type, offer.slug)
      : purchaseUnitWithValor(storage, offer.type);
    pendingValorPurchase = null;
    statusText = kind === "skin" ? skinValorPurchaseStatus(result) : unitPurchaseStatus(result);
    render();
  }

  function createPurchaseConfirm(kind, offer) {
    const amount = kind === "skin" ? offer.valorPrice?.amount : offer.price?.amount;
    const layer = el("div", "shop-confirm-layer");
    layer.addEventListener("click", (event) => {
      if (event.target === layer) dismissValorPurchase();
    });

    const dialog = el("section", "shop-purchase-confirm");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "shop-purchase-confirm-title");
    dialog.addEventListener("click", (event) => event.stopPropagation?.());

    const head = el("header", "shop-confirm-head");
    const title = el("h3", "shop-confirm-title", "Confirm Unlock");
    title.id = "shop-purchase-confirm-title";
    head.append(el("span", "shop-confirm-kicker", "Valor Purchase"), title);

    const item = el("div", "shop-confirm-item");
    item.appendChild(createPortrait(offer.type, {
      variant: "is-shop-confirm",
      eager: true,
      skin: kind === "skin" ? offer.slug : null,
    }));
    const copy = el("div", "shop-confirm-copy");
    copy.append(
      el("b", "shop-confirm-name", offer.name),
      el("span", "shop-confirm-sub", kind === "skin" ? `Skin for ${offer.unitName}` : "Unit unlock"),
    );
    item.appendChild(copy);

    const cost = el("div", "shop-confirm-cost");
    cost.append(el("span", "", "Cost"), createValorBadge(amount, "shop-confirm-price"));

    const foot = el("footer", "shop-confirm-actions");
    const cancel = el("button", "menu-btn ghost shop-confirm-cancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", dismissValorPurchase);
    const purchase = el("button", "menu-btn shop-confirm-purchase");
    purchase.type = "button";
    purchase.setAttribute("aria-label", `Purchase ${offer.name} for ${formatValor(amount)}`);
    purchase.append(el("span", "", "Purchase for"), createValorBadge(amount, "shop-confirm-price"));
    purchase.addEventListener("click", () => confirmValorPurchase(kind, offer));
    foot.append(cancel, purchase);

    dialog.append(head, item, cost, foot);
    layer.appendChild(dialog);
    return layer;
  }

  function createUnitBuyActions(offer) {
    const actions = el("div", `shop-unit-purchase-actions${offer.owned ? " is-owned" : ""}`);
    if (offer.owned) {
      actions.append(createOwnedBuyButton("premium"), createOwnedBuyButton("valor"));
      return actions;
    }

    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.premiumPrice));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-disabled", "true");
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.premiumPrice)} soon`);

    const valorBuy = el("button", "shop-buy-btn is-valor");
    valorBuy.type = "button";
    valorBuy.setAttribute("aria-label", `Unlock ${offer.name} for ${formatValor(offer.price.amount)}`);
    valorBuy.appendChild(createValorBadge(offer.price.amount, "shop-price"));
    valorBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openValorPurchase("unit", offer);
    });

    actions.append(premiumBuy, valorBuy);
    return actions;
  }

  function createSkinBuyActions(offer) {
    const actions = el("div", `shop-skin-actions${offer.owned ? " is-owned" : ""}`);
    if (offer.owned) {
      actions.append(createOwnedBuyButton("premium"), createOwnedBuyButton("valor"));
      return actions;
    }

    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.price));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.price)}`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      statusText = `${formatPremiumPrice(offer.price)} ${offer.name} checkout ready: ${offer.sku}`;
      overlay.dispatchEvent(new CustomEvent("tacticalarena:premium-purchase-request", {
        bubbles: true,
        detail: { offer },
      }));
      render();
    });

    const valorBuy = el("button", "shop-buy-btn is-valor");
    valorBuy.type = "button";
    valorBuy.setAttribute("aria-label", `Unlock ${offer.name} for ${formatValor(offer.valorPrice?.amount)}`);
    valorBuy.appendChild(createValorBadge(offer.valorPrice?.amount, "shop-price"));
    valorBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openValorPurchase("skin", offer);
    });

    actions.append(premiumBuy, valorBuy);
    return actions;
  }

  function createOwnedBuyButton(channel) {
    const owned = el("button", `shop-buy-btn is-owned is-${channel}`, "Owned");
    owned.type = "button";
    owned.disabled = true;
    return owned;
  }

  function onOverlay(event) {
    if (event.target === overlay) close();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    if (pendingValorPurchase) {
      event.preventDefault?.();
      dismissValorPurchase();
      return;
    }
    close();
  }

  overlay.addEventListener("click", onOverlay);
  document.addEventListener("keydown", onKey, true);
  overlay.hidden = false;
  render();
}

function unitPurchaseStatus(result) {
  if (result.accepted) return `${result.offer.name} unlocked.`;
  if (result.errorCode === "INSUFFICIENT_VALOR") return "Not enough currency.";
  if (result.errorCode === "UNIT_ALREADY_OWNED") return "Already owned.";
  return "That unit is not for sale.";
}

function skinValorPurchaseStatus(result) {
  if (result.accepted) return `${result.offer.name} unlocked.`;
  if (result.errorCode === "INSUFFICIENT_VALOR") return "Not enough Valor.";
  if (result.errorCode === "SKIN_ALREADY_OWNED") return "Already owned.";
  return "That skin is not for sale.";
}

function classLabel(value) {
  return String(value || "unit")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rarityLabel(value) {
  return classLabel(value);
}

function createUnitOwnershipLine(offer) {
  if (offer.owned) return el("span", "shop-unit-detail-state is-owned", "Owned");
  const line = el("span", "shop-unit-detail-state");
  line.append(el("span", "", "Unlock for"), createValorBadge(offer.price.amount, "shop-price"));
  return line;
}

function createValorBadge(amount, className = "") {
  const badge = el("span", `valor-badge${className ? ` ${className}` : ""}`);
  badge.setAttribute("aria-label", formatValor(amount));
  const icon = el("span", "valor-icon");
  icon.setAttribute("aria-hidden", "true");
  const value = el("span", "valor-amount", formatValorAmount(amount));
  badge.append(icon, value);
  return badge;
}

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
