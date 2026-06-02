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
  const costs = [];
  if (card.summonCostStars !== undefined) costs.push(`Summon: ${card.summonCostStars} star(s)`);
  if (card.playCostStars !== undefined) costs.push(`Play: ${card.playCostStars} star(s)`);
  if (card.baseEquipCostStars !== undefined) costs.push(`Equip: ${card.baseEquipCostStars} star(s)`);
  return el("div", "viewer-costs", costs.length ? costs.join(" | ") : "No star cost");
}

export function createEffectSlotList(card) {
  if (!card.effectSlots?.length) return [];
  return [
    el(
      "div",
      "viewer-slots",
      card.effectSlots.map((slot) =>
        el("div", "viewer-slot", [
          el("strong", "", `${slot.name} ${slot.kind === "passive" ? "Passive" : `${slot.costStars} star(s)`}`),
          el("span", "", slot.rulesText),
        ]),
      ),
    ),
  ];
}
