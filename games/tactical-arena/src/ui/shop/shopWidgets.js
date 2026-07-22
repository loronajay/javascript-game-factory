// Pure, stateless shop presentation helpers: purchase-result status strings, label
// formatting, and the small reusable DOM widgets (valor badge, pack preview, ownership
// lines, insufficient-valor warning). Split out of shop.js so the shop controller and
// its tab renderers share one source for these building blocks. Nothing here reads shop
// state — every value comes from arguments.

import { formatValor, formatValorAmount } from "../../progression/marketplace.js";
import { SHOP_LOGIN_REQUIRED_ERROR } from "../../platform/factoryAccount.js";
import { el } from "../domHelpers.js";
import { createPortrait } from "../portraits.js";

export function unitPurchaseStatus(result) {
  if (result.accepted) return `${result.offer.name} unlocked.`;
  if (result.errorCode === SHOP_LOGIN_REQUIRED_ERROR) return "Sign in to buy shop items.";
  if (result.errorCode === "INSUFFICIENT_VALOR") return "Not enough currency.";
  if (result.errorCode === "UNIT_ALREADY_OWNED") return "Already owned.";
  return "That unit is not for sale.";
}

export function skinValorPurchaseStatus(result) {
  if (result.accepted) return `${result.offer.name} unlocked.`;
  if (result.errorCode === SHOP_LOGIN_REQUIRED_ERROR) return "Sign in to buy shop items.";
  if (result.errorCode === "INSUFFICIENT_VALOR") return "Not enough Valor.";
  if (result.errorCode === "SKIN_ALREADY_OWNED") return "Already owned.";
  return "That skin is not for sale.";
}

export function skinPackValorPurchaseStatus(result) {
  if (result.accepted) return `${result.offer.name} unlocked.`;
  if (result.errorCode === SHOP_LOGIN_REQUIRED_ERROR) return "Sign in to buy shop items.";
  if (result.errorCode === "INSUFFICIENT_VALOR") return "Not enough Valor.";
  if (result.errorCode === "SKIN_PACK_ALREADY_OWNED") return "Already owned.";
  return "That skin pack is not for sale.";
}

export function classLabel(value) {
  return String(value || "unit")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function rarityLabel(value) {
  return classLabel(value);
}

export function rarityClass(value) {
  return String(value || "common").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function packOwnershipLabel(offer) {
  if (offer.owned) return "Owned";
  if (offer.ownedSkinCount > 0) return `${offer.ownedSkinCount}/${offer.skinCount} owned`;
  return "Bundle";
}

export function confirmSubtitle(kind, offer) {
  if (kind === "skin") return `Skin for ${offer.unitName}`;
  if (kind === "skin-pack") return `${offer.unownedSkinCount} skins`;
  return "Unit unlock";
}

export function createUnitOwnershipLine(offer) {
  if (offer.owned) return el("span", "shop-unit-detail-state is-owned", "Owned");
  const line = el("span", "shop-unit-detail-state");
  line.append(el("span", "", "Unlock for"), createValorBadge(offer.price.amount, "shop-price"));
  return line;
}

export function createPackOwnershipLine(offer) {
  if (offer.owned) return el("span", "shop-unit-detail-state is-owned", "Owned");
  const line = el("span", "shop-unit-detail-state");
  line.append(el("span", "", packOwnershipLabel(offer)), createValorBadge(offer.valorPrice.amount, "shop-price"));
  return line;
}

export function createPackPreview(offer, className = "") {
  const preview = el("div", `shop-pack-preview${className ? ` ${className}` : ""}`);
  for (const skin of offer.skins.slice(0, 4)) {
    preview.appendChild(createPortrait(skin.type, {
      variant: "is-shop-pack-preview",
      eager: true,
      skin: skin.slug,
    }));
  }
  return preview;
}

export function createValorBadge(amount, className = "") {
  const badge = el("span", `valor-badge${className ? ` ${className}` : ""}`);
  badge.setAttribute("aria-label", formatValor(amount));
  const icon = el("span", "valor-icon");
  icon.setAttribute("aria-hidden", "true");
  const value = el("span", "valor-amount", formatValorAmount(amount));
  badge.append(icon, value);
  return badge;
}

export function createValorWarning(balance, amount) {
  const message = el(
    "p",
    "shop-confirm-warning",
    `Not enough Valor. You have ${formatValorAmount(balance)} and need ${formatValorAmount(amount)}.`,
  );
  message.setAttribute("role", "alert");
  return message;
}

export function detachNode(node) {
  if (!node) return;
  if (typeof node.remove === "function") {
    node.remove();
    return;
  }
  if (node.parentElement && typeof node.parentElement.removeChild === "function") {
    node.parentElement.removeChild(node);
    return;
  }
  if (node.parentElement?.children) {
    node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
    node.parentElement = null;
  }
}
