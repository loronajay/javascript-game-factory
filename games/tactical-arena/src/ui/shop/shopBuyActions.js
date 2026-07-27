// Buy-button builders for each shop offer type, extracted from shop.js so the modal
// controller stays under its architecture-guard budget. Pure view construction: it
// builds the buttons and calls back into the shop for anything stateful.

import { formatPremiumPrice, formatValor } from "../../progression/marketplace.js";
import { requestFactorySignIn } from "../../platform/factorySignIn.js";
import { el } from "../domHelpers.js";
import { createValorBadge } from "./shopWidgets.js";

// `onPremium(offer)` runs the premium path (Stripe on web, Google Play in the app);
// `onValor(kind, offer)` opens the Valor confirm.
export function createBuyActions({ accountLoggedIn, locationRef, onPremium, onValor }) {
  const beginPremiumCheckout = (offer) => onPremium(offer);
  const openValorPurchase = (kind, offer) => onValor(kind, offer);
  const options = { locationRef };

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

  // Avatars are Valor-only (no premium/USD price), so this is a single buy button rather
  // than the premium+Valor pair the other offer kinds use.
  function createAvatarBuyActions(offer) {
    const actions = el("div", `shop-avatar-purchase-actions${offer.owned ? " is-owned" : ""}`);
    if (offer.owned) {
      actions.appendChild(createOwnedBuyButton());
      return actions;
    }
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }

    const valorBuy = el("button", "shop-buy-btn is-valor");
    valorBuy.type = "button";
    valorBuy.setAttribute("aria-label", `Unlock ${offer.name} for ${formatValor(offer.valorPrice?.amount)}`);
    valorBuy.appendChild(createValorBadge(offer.valorPrice?.amount, "shop-price"));
    valorBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      openValorPurchase("avatar", offer);
    });

    actions.appendChild(valorBuy);
    return actions;
  }

  function createConsumableBuyActions(offer) {
    const actions = el("div", "shop-consumable-actions");
    if (!accountLoggedIn) {
      actions.appendChild(createLoginRequiredButton(offer.name));
      return actions;
    }
    // Consumables stack, so there is no owned state and no Valor price — premium only.
    const premiumBuy = el("button", "shop-buy-btn is-premium", formatPremiumPrice(offer.price));
    premiumBuy.type = "button";
    premiumBuy.dataset.sku = offer.sku;
    premiumBuy.setAttribute("aria-label", `Buy ${offer.name} with ${formatPremiumPrice(offer.price)}`);
    premiumBuy.addEventListener("click", (event) => {
      event.stopPropagation?.();
      void beginPremiumCheckout(offer);
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
      // Opens the in-app panel when packaged, else redirects to the arcade shell.
      requestFactorySignIn({ locationRef: options.locationRef });
    });
    return login;
  }

  return {
    createUnitBuyActions,
    createSkinBuyActions,
    createPackBuyActions,
    createAvatarBuyActions,
    createConsumableBuyActions,
  };
}
