// Shop modal controller. Owns the modal shell, the open-shop state (active tab, detail
// selection, pending Valor purchase, in-flight premium checkout) and the lifecycle
// (open/close, overlay/keydown handling). Body rendering is delegated to ./shop/shopTabs
// per tab, the confirm/checkout layers to ./shop/shopCheckout, and the pure widgets /
// status strings to ./shop/shopWidgets. Purchase execution (Valor + premium) stays here
// because it drives shop state; the tab renderers reach it through the `ctx` object.

import {
  formatPremiumPrice,
  formatValor,
  getShopCatalog,
} from "../progression/marketplace.js";
import {
  isFactoryAccountLoggedIn,
  readStoredFactoryAccountSession,
  redirectToFactoryAccountSignIn,
} from "../platform/factoryAccount.js";
import { runValorPurchase } from "./shop/shopValorPurchase.js";
import {
  PREMIUM_CHECKOUT_EVENT,
  premiumCheckoutErrorMessage,
  startPremiumCheckout,
} from "../platform/premiumCheckoutClient.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../progression/unlocks.js";
import { enqueuePurchasedUnlockAnnouncements } from "../progression/announcements.js";
import { el } from "./domHelpers.js";
import { openSkinViewer } from "./skinGallery.js";
import { showPendingProgressionAnnouncements } from "./progressionAnnouncements.js";
import {
  createValorBadge,
  detachNode,
} from "./shop/shopWidgets.js";
import {
  renderConsumables,
  renderEmpty,
  renderSkinPackDetail,
  renderSkinPacks,
  renderSkins,
  renderUnitDetail,
  renderUnits,
} from "./shop/shopTabs.js";
import { createPremiumCheckoutLayer, createPurchaseConfirm } from "./shop/shopCheckout.js";

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

export function openShop(storage = globalThis.localStorage, options = {}) {
  const overlay = ensureHost();
  const account = options.account ?? readStoredFactoryAccountSession();
  const accountLoggedIn = isFactoryAccountLoggedIn(account);
  // Injected in tests; otherwise runValorPurchase builds the default platform client.
  const apiClient = options.apiClient;
  let activeTab = "units";
  let statusText = accountLoggedIn ? "" : "Sign in to buy shop items.";
  let detailUnitType = null;
  let detailPackId = null;
  let unitScrollTop = 0;
  let pendingValorPurchase = null;
  let pendingValorError = "";
  let premiumCheckoutInFlight = false;
  let premiumCheckoutLayer = null;
  let premiumCheckoutInstance = null;

  // Callbacks the tab renderers use to drive shop state and build buy actions.
  const ctx = {
    createUnitBuyActions,
    createSkinBuyActions,
    createPackBuyActions,
    createConsumableBuyActions,
    openUnitDetail(type, scrollTop) {
      unitScrollTop = scrollTop;
      detailUnitType = type;
      statusText = "";
      render();
    },
    closeUnitDetail() {
      detailUnitType = null;
      pendingValorPurchase = null;
      pendingValorError = "";
      render();
    },
    openPackDetail(packId) {
      detailPackId = packId;
      pendingValorPurchase = null;
      pendingValorError = "";
      statusText = "";
      render();
    },
    closePackDetail() {
      detailPackId = null;
      pendingValorPurchase = null;
      pendingValorError = "";
      render();
    },
    viewSkin(type, slug) {
      openSkinViewer({ type, slug, storage });
    },
  };

  function render() {
    const catalog = getShopCatalog(storage);
    const pendingOffer = pendingValorPurchase ? currentPendingOffer(catalog) : null;
    if (pendingValorPurchase && (!pendingOffer || pendingOffer.owned)) {
      pendingValorPurchase = null;
      pendingValorError = "";
    }
    const detailOffer = activeTab === "units" && detailUnitType
      ? catalog.units.find((offer) => offer.type === detailUnitType)
      : null;
    const detailPackOffer = activeTab === "skin-packs" && detailPackId
      ? catalog.skinPacks.find((offer) => offer.packId === detailPackId)
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
        detailPackId = null;
        pendingValorPurchase = null;
        pendingValorError = "";
        statusText = "";
        render();
      });
      tabs.appendChild(tabBtn);
    }
    head.appendChild(tabs);
    card.appendChild(head);

    const body = el("div", `shop-body${detailOffer || detailPackOffer ? " is-detail-view" : ""}`);
    if (detailOffer) renderUnitDetail(body, detailOffer, ctx);
    else if (detailPackOffer) renderSkinPackDetail(body, detailPackOffer, ctx);
    else if (activeTab === "units") renderUnits(body, catalog.units, ctx);
    else if (activeTab === "skin-packs") renderSkinPacks(body, catalog.skinPacks, ctx);
    else if (activeTab === "skins") renderSkins(body, catalog.skins, ctx);
    else if (activeTab === "consumables") renderConsumables(body, catalog.consumables, ctx);
    else renderEmpty(body);
    card.appendChild(body);
    if (activeTab === "units" && !detailOffer && unitScrollTop > 0) body.scrollTop = unitScrollTop;

    const foot = el("footer", "roster-foot shop-foot");
    const status = el("span", "shop-status", statusText);
    const done = el("button", "menu-btn", "Done");
    done.type = "button";
    done.addEventListener("click", close);
    foot.append(status, done);
    card.appendChild(foot);

    if (pendingOffer && !pendingOffer.owned) {
      overlay.appendChild(createPurchaseConfirm(pendingValorPurchase.kind, pendingOffer, catalog.resource.balance, {
        pendingValorError,
        onDismiss: dismissValorPurchase,
        onConfirm: () => confirmValorPurchase(pendingValorPurchase.kind, pendingOffer),
      }));
    }
  }

  function close() {
    closePremiumCheckoutLayer();
    pendingValorPurchase = null;
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }

  function openValorPurchase(kind, offer) {
    if (!accountLoggedIn) {
      statusText = "Sign in to buy shop items.";
      pendingValorPurchase = null;
      pendingValorError = "";
      render();
      return;
    }
    pendingValorPurchase = kind === "skin"
      ? { kind, type: offer.type, slug: offer.slug }
      : kind === "skin-pack"
        ? { kind, packId: offer.packId }
        : { kind, type: offer.type };
    pendingValorError = "";
    render();
  }

  function dismissValorPurchase() {
    pendingValorPurchase = null;
    pendingValorError = "";
    render();
  }

  function currentPendingOffer(catalog) {
    if (!pendingValorPurchase) return null;
    if (pendingValorPurchase.kind === "unit") {
      return catalog.units.find((offer) => offer.type === pendingValorPurchase.type) ?? null;
    }
    if (pendingValorPurchase.kind === "skin-pack") {
      return catalog.skinPacks.find((offer) => offer.packId === pendingValorPurchase.packId) ?? null;
    }
    return catalog.skins.find((offer) =>
      offer.type === pendingValorPurchase.type && offer.slug === pendingValorPurchase.slug) ?? null;
  }

  function announcePurchaseProgress(beforeProgress, afterProgress) {
    enqueuePurchasedUnlockAnnouncements(storage, beforeProgress, afterProgress);
    void showPendingProgressionAnnouncements(storage);
  }

  async function confirmValorPurchase(kind, offer) {
    if (!accountLoggedIn) {
      statusText = "Sign in to buy shop items.";
      pendingValorPurchase = null;
      pendingValorError = "";
      render();
      return;
    }
    statusText = `Purchasing ${offer.name}…`;
    render();
    const result = await runValorPurchase({ kind, offer, storage, account, apiClient });
    if (result.outcome === "insufficient") {
      pendingValorError = "INSUFFICIENT_VALOR";
      statusText = "";
      render();
      return;
    }
    if (result.outcome === "failed") {
      pendingValorError = "";
      statusText = result.errorCode === "ACCOUNT_LOGIN_REQUIRED"
        ? "Sign in to buy shop items."
        : "Couldn't complete that purchase. Please try again.";
      render();
      return;
    }
    pendingValorPurchase = null;
    pendingValorError = "";
    statusText = result.status;
    render();
    announcePurchaseProgress(result.beforeProgress, result.afterProgress);
  }

  async function beginPremiumCheckout(offer) {
    if (!accountLoggedIn) {
      statusText = "Sign in to buy shop items.";
      pendingValorPurchase = null;
      pendingValorError = "";
      render();
      return;
    }
    if (premiumCheckoutInFlight) return;
    pendingValorPurchase = null;
    pendingValorError = "";
    premiumCheckoutInFlight = true;
    statusText = `Opening checkout for ${offer.name}.`;
    overlay.dispatchEvent(new CustomEvent(PREMIUM_CHECKOUT_EVENT, {
      bubbles: true,
      detail: { offer },
    }));
    render();
    const checkoutUi = createPremiumCheckoutLayer(offer, {
      onClose: () => {
        premiumCheckoutInFlight = false;
        statusText = "Checkout closed.";
        closePremiumCheckoutLayer();
        render();
      },
    });
    premiumCheckoutLayer = checkoutUi.layer;
    overlay.appendChild(checkoutUi.layer);

    try {
      const checkoutResult = await startPremiumCheckout({
        offer,
        account,
        checkoutEndpoint: options.checkoutEndpoint,
        fetchImpl: options.fetchImpl,
        locationRef: options.locationRef,
        storage,
        documentRef: options.documentRef,
        checkoutContainer: checkoutUi.mount,
        stripeFactory: options.stripeFactory,
        stripeJsUrl: options.stripeJsUrl,
        onComplete: async (fulfillment) => {
          const beforeProgress = readUnlockProgress(storage);
          const nextProgress = fulfillment?.progress
            ? mergeServerEntitlementsIntoUnlockProgress(storage, fulfillment.progress)
            : beforeProgress;
          premiumCheckoutInFlight = false;
          statusText = `${offer.name} unlocked.`;
          closePremiumCheckoutLayer();
          render();
          if (fulfillment?.progress) announcePurchaseProgress(beforeProgress, nextProgress);
        },
      });
      premiumCheckoutInstance = checkoutResult.checkout || null;
    } catch (error) {
      premiumCheckoutInFlight = false;
      closePremiumCheckoutLayer();
      statusText = premiumCheckoutErrorMessage(error);
      render();
    }
  }

  function closePremiumCheckoutLayer() {
    if (premiumCheckoutInstance && typeof premiumCheckoutInstance.destroy === "function") {
      try {
        premiumCheckoutInstance.destroy();
      } catch {
        // Stripe cleanup is best-effort when the player closes the shop mid-checkout.
      }
    }
    premiumCheckoutInstance = null;
    if (premiumCheckoutLayer?.parentElement) {
      detachNode(premiumCheckoutLayer);
    }
    premiumCheckoutLayer = null;
  }

  function createUnitBuyActions(offer) {
    const actions = el("div", `shop-unit-purchase-actions${offer.owned ? " is-owned" : ""}`);
    if (offer.owned) {
      actions.appendChild(createOwnedBuyButton());
      return actions;
    }
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }

    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.premiumPrice));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.premiumPrice)}`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation();
      void beginPremiumCheckout(offer);
    });

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
      actions.appendChild(createOwnedBuyButton());
      return actions;
    }
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }

    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.price));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.price)}`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      void beginPremiumCheckout(offer);
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

  function createPackBuyActions(offer) {
    const actions = el("div", `shop-pack-purchase-actions${offer.owned ? " is-owned" : ""}`);
    if (offer.owned) {
      actions.appendChild(createOwnedBuyButton());
      return actions;
    }
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }

    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.price));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.price)}`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      void beginPremiumCheckout(offer);
    });

    const valorBuy = el("button", "shop-buy-btn is-valor");
    valorBuy.type = "button";
    valorBuy.setAttribute("aria-label", `Unlock ${offer.name} for ${formatValor(offer.valorPrice?.amount)}`);
    valorBuy.appendChild(createValorBadge(offer.valorPrice?.amount, "shop-price"));
    valorBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openValorPurchase("skin-pack", offer);
    });

    actions.append(premiumBuy, valorBuy);
    return actions;
  }

  function createConsumableBuyActions(offer) {
    const actions = el("div", "shop-consumable-actions");
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }
    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.price));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.price)} soon`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      statusText = "Consumable checkout coming soon.";
      overlay.dispatchEvent(new CustomEvent(PREMIUM_CHECKOUT_EVENT, {
        bubbles: true,
        detail: { offer },
      }));
      render();
    });
    actions.appendChild(premiumBuy);
    return actions;
  }

  function createOwnedBuyButton() {
    const owned = el("button", "shop-buy-btn is-owned", "Owned");
    owned.type = "button";
    owned.disabled = true;
    return owned;
  }

  function createLoginRequiredButton(name) {
    const login = el("button", "shop-buy-btn is-login-required", "Sign In");
    login.type = "button";
    login.setAttribute("aria-label", `Sign in to buy ${name}`);
    login.addEventListener("click", (event) => {
      event.stopPropagation?.();
      redirectToFactoryAccountSignIn({ locationRef: options.locationRef });
    });
    return login;
  }

  function onOverlay(event) {
    if (event.target === overlay) close();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    if (premiumCheckoutLayer) {
      event.preventDefault?.();
      premiumCheckoutInFlight = false;
      statusText = "Checkout closed.";
      closePremiumCheckoutLayer();
      render();
      return;
    }
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
