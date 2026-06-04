import { el } from "./dom.mjs";

export function createCardPiece(card, options = {}) {
  const classes = [
    "card-piece",
    `card-piece--${card.type}`,
    card.hidden ? "card-piece--hidden" : "",
    options.large ? "card-piece--large" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const piece = el("article", classes);

  if (card.hidden) {
    piece.append(el("div", "card-piece-back", "Meat Cards"));
    return piece;
  }

  piece.append(
    el("div", "card-piece-header", [
      card.type === "monster"
        ? el("span", "card-stat card-stat--strength", String(card.currentStrength ?? card.printedStrength ?? ""))
        : null,
      el("span", "card-piece-title", card.name),
      card.type === "monster"
        ? el("span", "card-stat card-stat--hp", String(card.currentHp ?? card.printedHp ?? ""))
        : null,
    ]),
    el("div", "card-art-frame", [
      card.art ? el("img", "card-art", { src: `/${card.art}`, alt: "" }) : null,
    ]),
    el("div", "card-piece-footer", [
      el("span", "card-piece-type", card.type),
      options.compactStats ? el("span", "card-compact-stats", options.compactStats) : null,
    ]),
  );
  return piece;
}

export function createCostLine(card) {
  const costs = cardCostItems(card);
  return el(
    "div",
    "viewer-costs",
    costs.length
      ? costs.map((cost) =>
          el("span", "viewer-cost", [
            el("span", "viewer-cost-label", cost.label),
            el("span", "viewer-cost-value", cost.value),
          ]),
        )
      : "No cost",
  );
}

export function createEffectSlotList(card) {
  if (!card.effectSlots?.length) return [];
  return [
    el(
      "div",
      "viewer-slots",
      card.effectSlots.map((slot) =>
        el("div", "viewer-slot", [
          el("div", "viewer-slot-header", [
            el("strong", "viewer-slot-name", slot.name),
            el("span", "viewer-slot-meta", formatEffectSlotMeta(slot)),
          ]),
          el("span", "viewer-slot-rules", formatRulesText(slot.rulesText)),
        ]),
      ),
    ),
  ];
}

export function cardCostItems(card) {
  const costs = [];
  if (card.summonCostStars !== undefined) costs.push({ label: "Summon", value: formatStarCost(card.summonCostStars) });
  if (card.playCostStars !== undefined) costs.push({ label: "Play", value: formatStarCost(card.playCostStars) });
  if (card.baseEquipCostStars !== undefined) {
    costs.push({ label: "Equip", value: formatStarCost(card.baseEquipCostStars) });
  }
  return costs;
}

export function formatEffectSlotMeta(slot) {
  return slot.kind === "passive" ? "Passive" : formatStarCost(slot.costStars ?? 0);
}

export function formatStarCost(count) {
  return `${count} ★`;
}

export function formatRulesText(text) {
  return String(text ?? "").replace(/\b(\d+)\s+star(?:\(s\)|s)?\b/gi, "$1 ★");
}
