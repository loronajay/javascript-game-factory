import { el } from "./dom.mjs";

export function createHudLayer(hud, side, handlers = {}) {
  const layer = el("section", `scene-hud scene-hud--${side}${hud.isCurrentPlayer ? " is-active-turn" : ""}`);
  layer.append(
    createPlayerTarget(hud.playerTarget, handlers),
    el("div", "scene-hud-copy", [
      el("div", "scene-hud-name", hud.name),
      el("div", "scene-hud-stats", [
        stat("HP", hud.hpLabel),
        stat("★", hud.starsLabel),
      ]),
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

function createPlayerTarget(playerTarget, handlers = {}) {
  const classes = [
    "player-target",
    playerTarget?.isValidTarget ? "is-valid-target" : "",
    playerTarget?.isTargeted ? "is-targeted" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const target = el(
    "button",
    classes,
    {
      type: "button",
      "aria-label": playerTarget?.ariaLabel ?? "Player",
      "data-player-target-id": playerTarget?.playerId,
    },
    [
      el("span", "player-avatar-sprite", {
        "aria-hidden": "true",
        style: playerAvatarStyle(playerTarget),
      }),
      playerTarget?.actionCue ? el("span", "player-target-cue", playerTarget.actionCue) : null,
    ],
  );
  target.addEventListener("click", () => {
    if (!playerTarget?.playerId) return;
    handlers.onPlayerTarget?.({ playerId: playerTarget.playerId });
  });
  return target;
}

function playerAvatarStyle(playerTarget) {
  const imageSrc = playerTarget?.isTargeted ? playerTarget?.hurtSrc : playerTarget?.idleSrc;
  return imageSrc ? `--player-avatar-image: url("/${imageSrc}");` : "";
}

function stat(label, value) {
  return el("span", "scene-stat", [el("span", "scene-stat-label", label), el("strong", "scene-stat-value", value)]);
}
