import { ACTION_MODES } from "../config.js";
import { gridToScreen, tileKey } from "../geometry/isometric.js";
import { getBaseDamage } from "../rules/combat.js";
import { getGuardingTank } from "../rules/guard.js";
import { getSelectedUnit, livingUnits } from "../state/gameState.js";
import { createSvgElement } from "./svg.js";

// Floating combat forecast: while a unit is in Attack or Heal mode, every legal
// target wears a small badge showing what the action would most likely do. Guard
// interception keeps the badge on the declared target while calculating damage
// against the tank that will actually receive the hit.
export class ForecastRenderer {
  constructor({ forecastLayer, metrics }) {
    this.layer = forecastLayer;
    this.metrics = metrics;
  }

  setMetrics(metrics) {
    this.metrics = metrics;
  }

  render(state) {
    this.layer.replaceChildren();

    const actor = getSelectedUnit(state);
    if (!actor || (state.mode !== ACTION_MODES.ATTACK && state.mode !== ACTION_MODES.HEAL)) {
      return;
    }

    const legal = state.legalTiles ?? new Set();
    if (legal.size === 0) {
      return;
    }

    for (const target of livingUnits(state)) {
      if (!legal.has(tileKey(target.x, target.y))) {
        continue;
      }

      if (state.mode === ACTION_MODES.ATTACK) {
        this.drawAttackBadge(state, actor, target);
      } else {
        this.drawHealBadge(target);
      }
    }
  }

  drawAttackBadge(state, attacker, target) {
    const guardingTank = getGuardingTank(state, target);
    const recipient = guardingTank ?? target;
    const intercepted = Boolean(guardingTank);
    const base = getBaseDamage(attacker, recipient);
    const reduce = recipient.defending || intercepted ? 1 : 0;
    const normalDamage = Math.max(0, base - reduce);
    const critDamage = Math.max(0, base + 1 - reduce);

    const lethal = normalDamage >= recipient.hp;
    const critLethal = !lethal && critDamage >= recipient.hp;

    const label = intercepted
      ? `G -${normalDamage}`
      : lethal ? `KO ${normalDamage}` : `-${normalDamage}`;
    const cls = [
      "fc-attack",
      intercepted ? "fc-guard" : "",
      lethal ? "fc-lethal" : critLethal ? "fc-critlethal" : "",
    ].filter(Boolean).join(" ");
    this.drawBadge(target, label, cls);
  }

  drawHealBadge(target) {
    const missing = Math.max(0, target.maxHp - target.hp);
    const amount = Math.min(3, missing); // most-likely normal heal, capped
    this.drawBadge(target, `+${amount}`, "fc-heal");
  }

  drawBadge(target, label, cls) {
    const point = gridToScreen(this.metrics, target.x, target.y);
    const y = point.y + this.metrics.tileHeight * 0.45 - 46;

    const group = createSvgElement("g", {
      class: `forecast-badge ${cls}`,
      transform: `translate(${point.x} ${y})`,
    });

    const halfWidth = 15 + (label.length - 1) * 4.5;
    group.append(
      createSvgElement("rect", {
        class: "fc-bg",
        x: -halfWidth,
        y: -11,
        width: halfWidth * 2,
        height: 22,
        rx: 11,
      }),
      createSvgElement("text", {
        class: "fc-text",
        x: 0,
        y: 5,
        "text-anchor": "middle",
        text: label,
      }),
    );

    this.layer.appendChild(group);
  }
}
