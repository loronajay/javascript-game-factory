import { ACTION_MODES } from "../config.js";
import { gridToScreen, tileKey } from "../geometry/isometric.js";
import { getBaseDamage } from "../rules/combat.js";
import { getSelectedUnit, livingUnits } from "../state/gameState.js";
import { createSvgElement } from "./svg.js";

// Floating combat forecast: while a unit is in Attack or Heal mode, every legal
// target wears a small badge showing what the action would most likely do — the
// normal-hit damage (or heal), with a lethal flag when a non-miss kills outright.
//
// This is the human-facing twin of the AI's expected-value math: it reuses the
// same getBaseDamage table and the same d6 reading (1 miss / 2-5 normal / 6 crit)
// so the number a player sees matches what the engine will roll against. It is
// strictly presentation — the reducer still re-validates and rolls the real die.
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
        this.drawAttackBadge(actor, target);
      } else {
        this.drawHealBadge(target);
      }
    }
  }

  drawAttackBadge(attacker, target) {
    const base = getBaseDamage(attacker, target);
    const reduce = target.defending ? 1 : 0;
    const normalDamage = Math.max(0, base - reduce);
    const critDamage = Math.max(0, base + 1 - reduce);

    // Lethal on any non-miss vs. only on a crit — two distinct, honest flags.
    const lethal = normalDamage >= target.hp;
    const critLethal = !lethal && critDamage >= target.hp;

    const label = lethal ? `☠ ${normalDamage}` : `-${normalDamage}`;
    const cls = lethal ? "fc-attack fc-lethal" : critLethal ? "fc-attack fc-critlethal" : "fc-attack";
    this.drawBadge(target, label, cls);
  }

  drawHealBadge(target) {
    const missing = Math.max(0, target.maxHp - target.hp);
    const amount = Math.min(3, missing); // most-likely (normal) heal, capped
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
