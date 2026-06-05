import { el } from "./dom.mjs";

export function createHudLayer(hud, side) {
  const layer = el("section", `scene-hud scene-hud--${side}${hud.isCurrentPlayer ? " is-active-turn" : ""}`);
  layer.append(
    el("div", "scene-hud-name", hud.name),
    el("div", "scene-hud-stats", [
      stat("HP", hud.hpLabel),
      stat("★", hud.starsLabel),
    ]),
  );
  return layer;
}

export function createPileLayer(piles, side) {
  const layer = el("section", `pile-layer pile-layer--${side}`, { "aria-label": `${side} deck and graveyard` });
  piles.forEach((pile) => {
    layer.append(
      el("div", `card-pile card-pile--${pile.kind}`, [
        el("span", "pile-count", String(pile.count)),
        el("span", "pile-label", pile.label),
      ]),
    );
  });
  return layer;
}

function stat(label, value) {
  return el("span", "scene-stat", [el("span", "scene-stat-label", label), el("strong", "scene-stat-value", value)]);
}
