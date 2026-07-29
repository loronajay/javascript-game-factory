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
} from "../platform/factoryAccount.js";
import { isNativeApp, requestFactorySignIn } from "../platform/factorySignIn.js";
import { runValorPurchase } from "./shop/shopValorPurchase.js";
import { PURCHASE_PROVIDERS, selectPurchaseProvider } from "../platform/purchaseProviders.js";
import { runPlayPurchase } from "./shop/shopPlayPurchase.js";
import {
  PREMIUM_CHECKOUT_EVENT,
  premiumCheckoutErrorMessage,
  startPremiumCheckout,
} from "../platform/premiumCheckoutClient.js";
import { fetchGameProgressSnapshot } from "../platform/gameProgressClient.js";
import { mergeServerEntitlementsIntoUnlockProgress, readUnlockProgress } from "../progression/unlocks.js";
import { getInventoryCatalog, mergeServerInventory } from "../progression/inventory.js";
import { enqueuePurchasedUnlockAnnouncements } from "../progression/announcements.js";
import { el } from "./domHelpers.js";
import { openSkinViewer } from "./skinGallery.js";
import { requestProgressionAnnouncements } from "./progressionAnnouncements.js";
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
import { renderAvatars } from "./shop/shopAvatarTab.js";
import { createPremiumCheckoutLayer, createPurchaseConfirm } from "./shop/shopCheckout.js";
import { createBuyActions } from "./shop/shopBuyActions.js";

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
  // Injected in tests so the open-time ownership refresh can be driven without a network.
  const fetchSnapshot = options.fetchGameProgressSnapshot ?? fetchGameProgressSnapshot;
  let closed = false;
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

  const buyActions = createBuyActions({
    accountLoggedIn,
    locationRef: options.locationRef,
    onPremium: (offer) => { void beginPremiumCheckout(offer); },
    onValor: (kind, offer) => openValorPurchase(kind, offer),
  });

  // Callbacks the tab renderers use to drive shop state and build buy actions.
  const ctx = {
    ...buyActions,
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
    else if (activeTab === "avatars") renderAvatars(body, catalog.avatars, ctx);
    // The inventory catalog is the shop offers plus the quantity already banked, so the tab
    // can show "Owned x2" on a stackable item without the shop catalog knowing about storage.
    else if (activeTab === "consumables") renderConsumables(body, getInventoryCatalog(storage).items, ctx);
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
    closed = true;
    closePremiumCheckoutLayer();
    pendingValorPurchase = null;
    overlay.hidden = true;
    overlay.removeEventListener("click", onOverlay);
    document.removeEventListener("keydown", onKey, true);
    overlay.replaceChildren();
  }

  // Pull server ownership as the shop opens, so an item bought elsewhere (the web shop, another
  // device) is never displayed as buyable here. Without this the catalog is only as fresh as
  // the last boot, and a stale "not owned" is what puts a player in front of a purchase they
  // do not need — the Play preflight then refuses it, which is correct but is a worse
  // experience than never offering it.
  //
  // Deliberately NOT awaited: the shop opens immediately on local state and corrects itself a
  // moment later. Blocking the modal on a network round trip would be a visible regression for
  // every player to fix a case that affects few.
  //
  // Additive merge, not `authoritative`. Two reasons: full authority is only safe after a
  // confirmed backfill (SECURITY.md invariant 2), which is boot's job to establish; and
  // `authoritativeValor` would overwrite the balance with the server's, dropping legitimately
  // earned Valor that is still sitting in the unflushed claim queue. Adding ownership the
  // server knows about is all this needs to do, and additive cannot take anything away.
  async function refreshOwnershipFromServer() {
    if (!accountLoggedIn) return;
    let snapshot = null;
    try {
      snapshot = await fetchSnapshot({ account });
    } catch {
      return;
    }
    // The player may have closed the shop while this was in flight; re-rendering then would
    // repopulate a hidden overlay and leave a stale card behind the next time it opens.
    if (!snapshot || closed) return;
    mergeServerEntitlementsIntoUnlockProgress(storage, snapshot);
    render();
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
        : kind === "avatar"
          ? { kind, avatarId: offer.avatarId }
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
    if (pendingValorPurchase.kind === "avatar") {
      return catalog.avatars.find((offer) => offer.avatarId === pendingValorPurchase.avatarId) ?? null;
    }
    return catalog.skins.find((offer) =>
      offer.type === pendingValorPurchase.type && offer.slug === pendingValorPurchase.slug) ?? null;
  }

  function announcePurchaseProgress(beforeProgress, afterProgress) {
    enqueuePurchasedUnlockAnnouncements(storage, beforeProgress, afterProgress);
    requestProgressionAnnouncements({ storage });
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

  // Google Play purchase. Execution lives in ./shop/shopPlayPurchase.js; this only
  // maps the outcome onto shop state, the same way the Valor path does.
  async function beginPlayPurchase(offer, provider) {
    premiumCheckoutInFlight = true;
    statusText = `Opening Google Play for ${offer.name}.`;
    render();

    try {
      const result = await runPlayPurchase({
        offer,
        provider,
        storage,
        account,
        verifyPurchase: options.verifyPlayPurchase,
        fetchImpl: options.fetchImpl,
      });
      statusText = result.status;
      if (result.outcome === "purchased" && result.applied) {
        announcePurchaseProgress(result.beforeProgress, result.afterProgress);
      }
    } catch {
      statusText = "Something went wrong with that purchase. Please try again.";
    } finally {
      premiumCheckoutInFlight = false;
      if (!closed) render();
    }
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

    // The packaged Android app must buy through Google Play, not Stripe. Google
    // renders its own purchase sheet, so this path has no embedded checkout layer.
    const provider = selectPurchaseProvider({
      nativeApp: isNativeApp(),
      plugins: globalThis.Capacitor?.Plugins,
    });
    if (provider !== PURCHASE_PROVIDERS.stripe) {
      await beginPlayPurchase(offer, provider);
      return;
    }

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
          // Consumables are credited as inventory quantity, not as an entitlement, so the
          // server snapshot has to land in the local inventory cache too.
          if (fulfillment?.progress) mergeServerInventory(storage, fulfillment.progress, { authoritative: true });
          premiumCheckoutInFlight = false;
          statusText = offer.kind === "consumable"
            ? `${offer.name} added to your Inventory.`
            : `${offer.name} unlocked.`;
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
  void refreshOwnershipFromServer();
}
