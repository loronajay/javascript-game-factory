import { svgElement } from "./svgHelpers.js";
import { createBoardMetrics, gridToScreen } from "./isometric.js";
import { getArt, getEffectiveStats, isDefending } from "../core/unitCatalog.js";
import { areEnemies } from "../core/state.js";
import { chebyshevDistance, positionKey } from "../rules/movement.js";
import { artIsBodyBlocked, artUsesPhysicalStrike, getArtTargetRange, getConeCells, getPyroclasmTargets, getSelfBlastRadius, getTargetedBlastTargets } from "../rules/arts.js";
import { finalizeMagicDamage, getBasicAttackDamageType, getMissChance, getProximityBonus, isShotBlocked, isWallBetween, negatesPhysicalWhileDefending, resolveBaseStrike, resolveFixedMagicStrike, resolveFixedPhysicalStrike } from "../rules/combat.js";
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

// Shapes whose real resolver does NOT run a plain single-target strike through
// resolveBaseStrike/resolveFixedMagicStrike (the two paths this file mirrors) — either
// because they hit an area, land at a chosen TILE rather than the hovered enemy, or
// use a custom fixed-power formula. A forecast badge for one of these would show a
// number (or a target) the ability doesn't actually produce, so they're excluded here
// rather than special-cased. New shapes with a bespoke resolver must be added here
// UNLESS they route through resolveBaseStrike/resolveFixedMagicStrike/scaleStat like a
// normal single-target strike (see the scaledPowerForecast/fixedMagic branches below).
const NON_STRIKE_FORECAST_SHAPES = [
  "cone", "globalAllies", "nukeAura", "placement", "selfAura", "tilePlacement",
  "protectAlly", "ally", "targetedBlast", "rushPath", "flightMove", "lineEnemy",
  "lineBurst", "darkPulse"
];

const AREA_FORECAST_SHAPES = new Set(["cone", "nukeAura", "targetedBlast", "lineBurst"]);

function damageLabel(damage, target) {
  const amount = Object.is(damage, -0) ? 0 : damage;
  if (amount <= 0) return "0";
  return amount >= target.hp ? `☠ ${amount}` : `-${amount}`;
}

function damageClass(damage, target) {
  return damage > 0 && damage >= target.hp ? "fc-lethal" : "fc-attack";
}

function isForecastableStrikeArt(art) {
  const hasDamagePayload = Boolean(art?.damage || art?.damageType);
  const isAuthoredStrike = art?.ai?.intent === "strike";
  return Boolean(
    art &&
    art.kind === "active" &&
    (hasDamagePayload || isAuthoredStrike) &&
    !art.selfCast &&
    art.resolution !== "statusCast" &&
    art.resolution !== "flee" &&
    art.resolution !== "summon" &&
    art.effect?.type !== "healAllies" &&
    !NON_STRIKE_FORECAST_SHAPES.includes(art.targeting?.shape)
  );
}

function isForecastableAreaArt(art) {
  return Boolean(
    art &&
    art.kind === "active" &&
    AREA_FORECAST_SHAPES.has(art.targeting?.shape) &&
    (art.damage || art.damageType || art.effect?.amount)
  );
}

function areaDamage(actor, target, art, state, amount, type) {
  if (type === "true") return Math.max(0, amount);
  if (type === "magic") {
    const result = resolveDamage({
      attacker: { strength: amount },
      defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
      type: "magic"
    });
    return finalizeMagicDamage({ attacker: actor, target, state, rawDamage: result.damage, art });
  }
  const result = resolveDamage({
    attacker: { strength: amount },
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical"
  });
  return negatesPhysicalWhileDefending(target) ? 0 : result.damage;
}

function areaForecastEntries(state, actor, art, areaCenter) {
  const shape = art.targeting?.shape;
  if (shape === "nukeAura") {
    const radius = getSelfBlastRadius(state, actor, art);
    const targets = state.units.filter((unit) =>
      unit.hp > 0 && areEnemies(actor, unit) && chebyshevDistance(actor.position, unit.position) <= radius);
    const amount = art.id === "quake"
      ? (art.damage?.amount ?? 3) + targets.length
      : Math.max(0, Number(art.damage?.amount) || 0);
    const type = art.damage?.type ?? art.damageType ?? "magic";
    return targets.map((target) => ({ target, damage: areaDamage(actor, target, art, state, amount, type) }));
  }
  if (shape === "targetedBlast") {
    if (!areaCenter) return [];
    const radius = art.targeting?.radius ?? 2;
    const amount = Math.max(0, Number(art.damage?.amount) || 0);
    const type = art.damage?.type ?? "physical";
    return getTargetedBlastTargets(state, actor, areaCenter, radius)
      .map((target) => ({ target, damage: areaDamage(actor, target, art, state, amount, type) }));
  }
  if (shape === "cone") {
    if (!areaCenter) return [];
    const cells = getConeCells(state, actor, areaCenter, art) ?? [];
    const cellKeys = new Set(cells.map(positionKey));
    const amount = Math.max(0, Number(art.damage?.amount) || 0);
    const type = art.damage?.type ?? "true";
    return state.units
      .filter((target) => target.hp > 0 && areEnemies(actor, target) && cellKeys.has(positionKey(target.position)))
      .map((target) => ({
        target,
        damage: areaDamage(actor, target, art, state, amount, type) + (art.id === "volley-shot" ? getProximityBonus(actor, target) : 0)
      }));
  }
  if (shape === "lineBurst") {
    const amount = Math.max(0, Number(art.damage?.amount) || 0);
    const type = art.damage?.type ?? art.damageType ?? "magic";
    return getPyroclasmTargets(state, actor, art)
      .map((target) => ({ target, damage: areaDamage(actor, target, art, state, amount, type) }));
  }
  return [];
}

// While in attack or single-target ART mode, every enemy in range wears a badge
// showing the predicted normal-hit damage (skull when lethal, "miss" when an attack
// or physical strike ART is blinded).
// Uses the same strike resolver the reducer uses, so damage-type changes stay honest.
export function renderForecast({ forecastLayer, state, mode, actor, resolving, areaCenter = null }) {
  forecastLayer.replaceChildren();
  if (!actor || state.phase !== "playing" || resolving) return;
  const isAttack = mode === "attack";
  const artId = mode?.startsWith("art:") ? mode.slice(4) : null;
  const art = artId ? getArt(actor.type, artId) : null;
  const isStrikeArt = Boolean(artId) && isForecastableStrikeArt(art);
  const isAreaArt = Boolean(artId) && isForecastableAreaArt(art);
  if (!isAttack && !isStrikeArt && !isAreaArt) return;

  const metrics = createBoardMetrics(state.size);
  if (isAreaArt && !isStrikeArt && !isAttack) {
    for (const { target, damage } of areaForecastEntries(state, actor, art, areaCenter)) {
      drawForecastBadge(forecastLayer, metrics, target, damageLabel(damage, target), damageClass(damage, target));
    }
    return;
  }

  const reach = isStrikeArt ? getArtTargetRange(state, actor, art) : getEffectiveStats(actor, state).attackRange;
  const guaranteedMiss = (isAttack || (isStrikeArt && artUsesPhysicalStrike(art))) && getMissChance(actor) >= 1;
  // The damage type of what's being aimed: a basic attack reads the unit's passive
  // (Angel's Blessed Arrow is magic); an ART carries its own damageType.
  const damageType = isAttack ? getBasicAttackDamageType(actor) : (art?.damageType ?? null);
  // Basic attacks are body-blocked unless the attacker has an explicit pierce passive
  // (Sniper). Physical ARTS can opt out with pierceUnits (Curve Shot), and magic strike
  // ARTS still reach through bodies.
  const blockable = isAttack || (isStrikeArt && artIsBodyBlocked(art));

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
    const fixedPhysical = isStrikeArt && art?.damage?.type === "physical" && art.damage.fixed && Number.isFinite(art.damage.amount);
    // A fixed-amount TRUE strike (Ronin's Shuriken) shows its authored amount — true damage
    // ignores DEF and Defend, so the normal-hit number is exactly `damage.amount`.
    const fixedTrue = isStrikeArt && art?.damage?.type === "true" && art.damage.fixed && Number.isFinite(art.damage.amount);
    // Fixed-power physical ARTS that scale with STR above a base (Front Kick, Stone Throw)
    // resolve their own power formula, not a plain STR strike.
    const strike = art?.damage?.scaleStat
      ? scaledPowerForecast(actor, target, art, state)
      : fixedTrue
        ? { damage: Math.max(0, art.damage.amount) }
        : fixedMagic
          ? resolveFixedMagicStrike(actor, target, art.damage.amount, { state, art })
          : fixedPhysical
            ? resolveFixedPhysicalStrike(actor, target, art.damage.amount, { state })
            : resolveBaseStrike(actor, target, { proximity: true, state, damageType, damageAffinity: art?.damageAffinity ?? art?.damage?.affinity ?? null });
    drawForecastBadge(forecastLayer, metrics, target, damageLabel(strike.damage, target), damageClass(strike.damage, target));
  }
}

function scaledPowerForecast(actor, target, art, state) {
  const actorStats = getEffectiveStats(actor, state);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 10) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical"
  });
  // Honest against a braced Clod: Rock Hard negates physical entirely while defending.
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  return { ...result, damage };
}
