// Shop modal-layer builders: the Valor purchase-confirm dialog and the embedded
// premium (Stripe) checkout layer. Split out of shop.js because these are self-contained
// DOM constructions; the controller keeps the purchase state and passes in the callbacks
// (dismiss/confirm/close) plus the current insufficient-valor flag.

import { formatValor } from "../../progression/marketplace.js";
import { el } from "../domHelpers.js";
import { createPackPreview, createValorBadge, createValorWarning, confirmSubtitle } from "./shopWidgets.js";
import { createPortrait } from "../portraits.js";

export function createPurchaseConfirm(kind, offer, balance, { pendingValorError = "", onDismiss, onConfirm }) {
  const amount = kind === "unit" ? offer.price?.amount : offer.valorPrice?.amount;
  const shortOnValor = Number.isFinite(amount) && balance < amount;
  const shouldShowValorWarning = pendingValorError === "INSUFFICIENT_VALOR" || shortOnValor;
  const layer = el("div", "shop-confirm-layer");
  layer.addEventListener("click", (event) => {
    if (event.target === layer) onDismiss();
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
  item.appendChild(kind === "skin-pack"
    ? createPackPreview(offer, "is-shop-confirm")
    : createPortrait(offer.type, {
      variant: "is-shop-confirm",
      eager: true,
      skin: kind === "skin" ? offer.slug : null,
    }));
  const copy = el("div", "shop-confirm-copy");
  copy.append(
    el("b", "shop-confirm-name", offer.name),
    el("span", "shop-confirm-sub", confirmSubtitle(kind, offer)),
  );
  if (kind === "skin" && offer.donationNote) {
    copy.appendChild(el("span", "shop-confirm-note", offer.donationNote));
  }
  if (kind === "skin-pack" && offer.donationNote) {
    copy.appendChild(el("span", "shop-confirm-note", offer.donationNote));
  }
  item.appendChild(copy);

  const cost = el("div", "shop-confirm-cost");
  cost.append(el("span", "", "Cost"), createValorBadge(amount, "shop-confirm-price"));

  const warning = shouldShowValorWarning
    ? createValorWarning(balance, amount)
    : null;

  const foot = el("footer", "shop-confirm-actions");
  const cancel = el("button", "menu-btn ghost shop-confirm-cancel", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", onDismiss);
  const purchase = el("button", "menu-btn shop-confirm-purchase");
  purchase.type = "button";
  purchase.setAttribute("aria-label", `Purchase ${offer.name} for ${formatValor(amount)}`);
  purchase.append(el("span", "", "Purchase for"), createValorBadge(amount, "shop-confirm-price"));
  if (shortOnValor) {
    purchase.disabled = true;
    purchase.setAttribute("aria-disabled", "true");
  } else {
    purchase.addEventListener("click", onConfirm);
  }
  foot.append(cancel, purchase);

  dialog.append(head, item, cost);
  if (warning) dialog.appendChild(warning);
  dialog.appendChild(foot);
  layer.appendChild(dialog);
  return layer;
}

export function createPremiumCheckoutLayer(offer, { onClose }) {
  const layer = el("div", "shop-checkout-layer");
  layer.addEventListener("click", (event) => {
    if (event.target === layer) onClose();
  });

  const dialog = el("section", "shop-checkout-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "shop-checkout-title");
  dialog.addEventListener("click", (event) => event.stopPropagation?.());

  const head = el("header", "shop-checkout-head");
  const copy = el("div", "shop-checkout-copy");
  const title = el("h3", "shop-checkout-title", "Secure Checkout");
  title.id = "shop-checkout-title";
  copy.append(title, el("span", "shop-checkout-sub", offer.name));
  const closeBtn = el("button", "ref-close shop-checkout-close", "X");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close checkout");
  closeBtn.addEventListener("click", () => onClose());
  head.append(copy, closeBtn);

  const mount = el("div", "shop-checkout-mount");
  dialog.append(head, mount);
  layer.appendChild(dialog);
  return { layer, mount };
}
