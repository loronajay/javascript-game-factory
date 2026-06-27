import { svgElement } from "./svgHelpers.js";
import { createBoardMetrics, gridToScreen } from "./isometric.js";
import { getArt, getEffectiveStats } from "../core/unitCatalog.js";
import { areEnemies } from "../core/state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { getMissChance, isShotBlocked, isWallBetween, resolveBaseStrike } from "../rules/combat.js";

function drawForecastBadge(forecastLayer, metrics, target, label, cls) {
  const point = gridToScreen(metrics, target.position.x, target.position.y);
  const y = point.y + metrics.tileHeight * 0.45 - 52;
  const group = svgElement("g", { class: `forecast-badge ${cls}`, transform: `translate(${point.x} ${y})` });
  const halfWidth = 15 + (label.length - 1) * 4.5;
  const text = svgElement("text", { class: "fc-text", x: 0, y: 5, "text-anchor": "middle" });
  text.textContent = label;
  group.append(svgElement("rect", { class: "fc-bg", x: -halfWidth, y: -11, width: halfWidth * 2, height: 22, rx: 11 }), text);
  forecastLayer.append(group);
}

// While in attack or single-target ART mode, every enemy in range wears a badge
// showing the predicted normal-hit damage (skull when lethal, "miss" when blinded).
// Uses the same resolvePhysicalStrike the reducer uses — can never drift.
export function renderForecast({ forecastLayer, state, mode, actor, resolving }) {
  forecastLayer.replaceChildren();
  if (!actor || state.phase !== "playing" || resolving) return;
  const isAttack = mode === "attack";
  const artId = mode?.startsWith("art:") ? mode.slice(4) : null;
  const art = artId ? getArt(actor.type, artId) : null;
  const isStrikeArt = Boolean(artId) && mode !== "art:volley-shot" && art?.resolution !== "statusCast" && art?.resolution !== "flee" && art?.effect?.type !== "healAllies";
  if (!isAttack && !isStrikeArt) return;

  const metrics = createBoardMetrics(state.size);
  const reach = getEffectiveStats(actor, state).attackRange;
  const guaranteedMiss = (isAttack || isStrikeArt) && getMissChance(actor) >= 1;
  // Physical strikes (basic attack + physical ARTS) can be body-blocked; magic ARTS
  // ignore intervening units, so they keep forecasting through them.
  const blockable = isAttack || (isStrikeArt && (art?.damageType ?? "physical") === "physical");

  for (const target of state.units) {
    if (target.hp <= 0 || !areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > reach) continue;
    if (blockable && isShotBlocked(state, actor.position, target.position, actor)) continue;
    // A wall hides the forecast for any ranged ability (physical or magic) — the
    // Sniper's pierce is the only shot that still reaches and shows a number.
    if (isWallBetween(state, actor.position, target.position, actor)) continue;
    if (guaranteedMiss) {
      drawForecastBadge(forecastLayer, metrics, target, "miss", "fc-miss");
      continue;
    }
    const artDamageType = art?.damageType ?? null;
    const strike = resolveBaseStrike(actor, target, { proximity: true, state, damageType: artDamageType });
    const lethal = strike.damage >= target.hp;
    drawForecastBadge(forecastLayer, metrics, target, lethal ? `☠ ${strike.damage}` : `-${strike.damage}`, lethal ? "fc-lethal" : "fc-attack");
  }
}
