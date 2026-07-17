import { el } from "./domHelpers.js";

export function createConsumableIcon(offer, { className = "" } = {}) {
  const kind = offer?.effect?.kind;
  const icon = el("div", `shop-consumable-icon ${iconClass(kind, offer)}${className ? ` ${className}` : ""}`);
  icon.setAttribute("aria-hidden", "true");

  if (kind === "valor-boost") {
    icon.append(
      el("span", "shop-consumable-icon-value", `+${Math.max(0, Math.floor(Number(offer.effect.percentBonus) || 0))}%`),
      el("span", "valor-icon"),
    );
    return icon;
  }

  if (kind === "campaign-damage-boost") {
    icon.append(
      el("span", "shop-consumable-icon-value", `+${Math.max(0, Math.floor(Number(offer.effect.damageBonus) || 0))}`),
      el("span", "shop-consumable-icon-label", "DMG"),
    );
    return icon;
  }

  if (kind === "random-unowned-skin") {
    icon.appendChild(el("span", "shop-consumable-mystery-card", "?"));
    const count = Math.max(1, Math.floor(Number(offer.effect.count) || 1));
    if (count > 1) icon.appendChild(el("span", "shop-consumable-icon-count", `x${count}`));
    return icon;
  }

  icon.appendChild(el("span", "shop-consumable-icon-value", "?"));
  return icon;
}

function iconClass(kind, offer) {
  if (kind === "valor-boost") return "is-valor-boost";
  if (kind === "campaign-damage-boost") return "is-damage-boost";
  if (kind === "random-unowned-skin") return `is-random-skin is-${safeClass(offer?.effect?.rarity ?? "skin")}`;
  return "is-generic-consumable";
}

function safeClass(value) {
  return String(value || "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
