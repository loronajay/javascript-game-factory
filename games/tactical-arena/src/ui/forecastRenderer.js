import { svgElement } from "./svgHelpers.js";
import { createBoardMetrics, gridToScreen } from "./isometric.js";
import { getArt, getEffectiveStats, isDefending } from "../core/unitCatalog.js";
import { areEnemies } from "../core/state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { getArtTargetRange } from "../rules/arts.js";
import { getBasicAttackDamageType, getMissChance, isShotBlocked, isWallBetween, resolveBaseStrike, resolveFixedMagicStrike } from "../rules/combat.js";
import { resolveDamage } from "../rules/damage.js";

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

function isForecastableStrikeArt(art) {
  return Boolean(
    art &&
    art.kind === "active" &&
    !art.selfCast &&
    art.resolution !== "statusCast" &&
    art.resolution !== "flee" &&
    art.resolution !== "summon" &&
    art.effect?.type !== "healAllies" &&
    !["cone", "globalAllies", "nukeAura", "placement", "selfAura", "tilePlacement", "protectAlly", "ally"].includes(art.targeting?.shape)
  );
}

// While in attack or single-target ART mode, every enemy in range wears a badge
// showing the predicted normal-hit damage (skull when lethal, "miss" when blinded).
// Uses the same strike resolver the reducer uses, so damage-type changes stay honest.
export function renderForecast({ forecastLayer, state, mode, actor, resolving }) {
  forecastLayer.replaceChildren();
  if (!actor || state.phase !== "playing" || resolving) return;
  const isAttack = mode === "attack";
  const artId = mode?.startsWith("art:") ? mode.slice(4) : null;
  const art = artId ? getArt(actor.type, artId) : null;
  const isStrikeArt = Boolean(artId) && isForecastableStrikeArt(art);
  if (!isAttack && !isStrikeArt) return;

  const metrics = createBoardMetrics(state.size);
  const reach = isStrikeArt ? getArtTargetRange(state, actor, art) : getEffectiveStats(actor, state).attackRange;
  const guaranteedMiss = (isAttack || isStrikeArt) && getMissChance(actor) >= 1;
  // The damage type of what's being aimed: a basic attack reads the unit's passive
  // (Angel's Blessed Arrow is magic); an ART carries its own damageType.
  const damageType = isAttack ? getBasicAttackDamageType(actor) : (art?.damageType ?? null);
  // Basic attacks are body-blocked unless the attacker has an explicit pierce passive
  // (Sniper). Magic strike ARTS still reach through bodies.
  const blockable = isAttack || (isStrikeArt && (damageType ?? "physical") === "physical");

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
    // A fixed-amount magic art (Virus's Cough) forecasts its authored amount, not a
    // STR-scaled hit — the same resolver the reducer uses, so the number can't drift.
    const fixedMagic = isStrikeArt && art?.damageType === "magic" && Number.isFinite(art?.damage?.amount);
    const strike = art?.resolution === "frontKick"
      ? frontKickForecast(actor, target, art, state)
      : fixedMagic
        ? resolveFixedMagicStrike(actor, target, art.damage.amount, { state, art })
        : resolveBaseStrike(actor, target, { proximity: true, state, damageType, damageAffinity: art?.damageAffinity ?? art?.damage?.affinity ?? null });
    const lethal = strike.damage >= target.hp;
    drawForecastBadge(forecastLayer, metrics, target, lethal ? `☠ ${strike.damage}` : `-${strike.damage}`, lethal ? "fc-lethal" : "fc-attack");
  }
}

function frontKickForecast(actor, target, art, state) {
  const actorStats = getEffectiveStats(actor, state);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 10) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical"
  });
  return { ...result, damage: result.damage };
}
