import {
  formatPremiumPrice,
  formatValor,
  formatValorAmount,
  groupSkinOffersByClassAndType,
  getShopCatalog,
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

  function render() {
    const catalog = getShopCatalog(storage);
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
        actions.append(details, createUnitBuyButton(offer));
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

    detail.appendChild(createUnitTips(def));

    const actions = el("div", "shop-unit-detail-actions");
    actions.appendChild(createUnitBuyButton(offer));
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
          const buy = el("button", `shop-buy-btn${offer.owned ? " is-owned" : ""}`, offer.owned ? "Owned" : formatPremiumPrice(offer.price));
          buy.type = "button";
          buy.disabled = offer.owned;
          buy.dataset.sku = offer.sku;
          buy.addEventListener("click", (event) => {
            event.stopPropagation?.();
            statusText = `${formatPremiumPrice(offer.price)} ${offer.name} checkout ready: ${offer.sku}`;
            overlay.dispatchEvent(new CustomEvent("tacticalarena:premium-purchase-request", {
              bubbles: true,
              detail: { offer },
            }));
            render();
          });
          card.append(copy, buy);
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
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }

  function createUnitBuyButton(offer) {
    const buy = el("button", `shop-buy-btn${offer.owned ? " is-owned" : ""}`, offer.owned ? "Owned" : null);
    buy.type = "button";
    buy.disabled = offer.owned;
    if (!offer.owned) {
      buy.setAttribute("aria-label", `Unlock ${offer.name} for ${formatValor(offer.price.amount)}`);
      buy.appendChild(createValorBadge(offer.price.amount, "shop-price"));
    }
    buy.addEventListener("click", () => {
      const result = purchaseUnitWithValor(storage, offer.type);
      statusText = unitPurchaseStatus(result);
      render();
    });
    return buy;
  }

  function onOverlay(event) {
    if (event.target === overlay) close();
  }

  function onKey(event) {
    if (event.key === "Escape") close();
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

function createUnitTips(def) {
  const tips = el("section", "shop-unit-tips");
  tips.appendChild(el("h4", "shop-unit-tips-title", "Tips"));
  const list = el("ul", "shop-unit-tips-list");
  for (const tip of unitTips(def)) {
    const item = el("li", "", tip);
    list.appendChild(item);
  }
  tips.appendChild(list);
  return tips;
}

function unitTips(def) {
  const stats = def.stats ?? {};
  const role = def.ai?.role ?? def.classType ?? "unit";
  const tips = [];

  if (role === "support" || role === "caster") {
    tips.push("Keep them screened until their ARTS can swing a turn.");
  } else if (role === "ranged" || stats.attackRange >= 4) {
    tips.push("Use range and sight lines to pressure targets before they can answer.");
  } else if (role === "controller") {
    tips.push("Save MP for control turns that deny an enemy's best activation.");
  } else if (role === "bruiser" || def.classType === "melee") {
    tips.push("Send them toward contested tiles where their basic attack stays relevant.");
  } else {
    tips.push("Look for flanks and timing windows instead of trading straight ahead.");
  }

  const activeArts = (def.arts ?? []).filter((art) => art.kind === "active");
  if (activeArts.length > 0 && stats.maxMp > 0) {
    tips.push(`${def.name} has ${activeArts.length} active ART${activeArts.length === 1 ? "" : "S"}; spend MP when the position is worth more than a basic attack.`);
  }

  const rage = def.rageArt ?? def.ragePassive;
  if (rage) {
    tips.push(`At 5 HP or lower, RAGE turns on ${rage.name}, so a wounded ${def.name} can still change the fight.`);
  }

  return tips;
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
