// Pure view model behind the hold-to-read ability card. No DOM here.
import { canIgniteFire } from "../core/fireTiles.js";
import {
  getAbilityUseMax,
  getAbilityUsesRemaining,
  getArtMpCost,
  getAvailableArts,
  getEffectiveStats,
  getRageEffectValue,
  getResourceMeta,
  getUnitType,
  isCommandOnly,
  isRaging
} from "../core/unitCatalog.js";
import { canUseArt } from "../rules/arts.js";
import { isStunned } from "../rules/statuses.js";

const TARGET_SHAPES = {
  single: "One enemy in range",
  ally: "One ally in range",
  allyOrEnemy: "One ally or enemy in range",
  protectAlly: "A landing tile beside an ally",
  cone: "A cone, aimed from an adjacent tile",
  lineAny: "An ally or enemy on a straight line",
  lineEnemy: "An enemy on a straight line",
  lineBurst: "A line erupting from this unit",
  targetedBlast: "An empty tile — hits everything around it",
  nukeAura: "A blast centred on this unit",
  selfAura: "Everything around this unit",
  radius: "Everything within a radius",
  darkPulse: "A pulse around this unit",
  self: "This unit only",
  globalAllies: "Every ally, anywhere on the board",
  placement: "An empty tile in range",
  tilePlacement: "An empty tile in range",
  flee: "An empty tile to teleport to",
  flightMove: "An empty tile to fly onto",
  rushPath: "A charge path, one step at a time",
  revive: "A fallen ally, then a tile to place them on"
};

const DAMAGE_TYPES = {
  physical: "physical (reduced by DEF)",
  magic: "magic (ignores DEF)",
  true: "true (ignores DEF and Defend)"
};

function percent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

export function abilityCostParts(art, unit = null, state = null) {
  if (art.costLabel) {
    const [main, ...rest] = String(art.costLabel).split(" ");
    return { main, unit: rest.join(" ") };
  }
  const useMax = getAbilityUseMax(art);
  if (useMax !== null) {
    const remaining = unit?.abilityUses ? getAbilityUsesRemaining(unit, art) : useMax;
    return { main: `${remaining}/${useMax}`, unit: "USE" };
  }
  if (art.hpCost) return { main: String(art.hpCost), unit: "HP" };
  const resource = getResourceMeta(unit?.type ?? null);
  const mpCost = unit?.type && state ? getArtMpCost(unit, art, state) : art.mpCost;
  return { main: String(mpCost), unit: resource.shortLabel };
}

function statusFact(effect) {
  if (!effect || effect.type !== "status" || !effect.status) return null;
  const duration = effect.duration === "permanent"
    ? "permanent"
    : Number.isFinite(effect.durationTurns) ? `${effect.durationTurns} turn${effect.durationTurns === 1 ? "" : "s"}` : null;
  const chance = Number.isFinite(effect.chance) ? `${percent(effect.chance)} chance` : null;
  const parts = [effect.status, duration, chance].filter(Boolean);
  return { label: "Status", value: parts.join(" · ") };
}

function artFacts(art, unit, state) {
  const cost = abilityCostParts(art, unit, state);
  const range = art.targeting?.range ?? art.targeting?.radius ?? null;
  const shape = art.targeting?.shape ? TARGET_SHAPES[art.targeting.shape] ?? null : null;
  return [
    { label: "Cost", value: [cost.main, cost.unit].filter(Boolean).join(" ") },
    shape ? { label: "Targets", value: shape } : null,
    Number.isFinite(range) ? { label: "Range", value: `${range} tile${range === 1 ? "" : "s"}` } : null,
    Number.isFinite(art.accuracy) ? { label: "Accuracy", value: `${percent(art.accuracy)} at range 1` } : null,
    art.damage?.type ? { label: "Damage", value: [Number.isFinite(art.damage.amount) ? art.damage.amount : null, DAMAGE_TYPES[art.damage.type] ?? art.damage.type].filter((v) => v !== null).join(" ") } : null,
    statusFact(art.effect)
  ].filter(Boolean);
}

function artNotes(art, unit, state) {
  const useMax = getAbilityUseMax(art);
  return [
    art.bonusActionGroup
      ? "Bonus action — this unit can still move and take its normal action afterwards."
      : isCommandOnly(unit)
        ? "A command spends this commander's whole activation and rallies the squad for the turn."
        : "Replaces the whole activation; it cannot follow a move or an attack.",
    useMax !== null ? `${unit?.abilityUses ? getAbilityUsesRemaining(unit, art) : useMax} of ${useMax} uses left. The pool refills a full turn after it runs dry.` : null,
    art.rageLocked ? "Only available while this unit is in RAGE (5 HP or lower)." : null,
    art.selfKill ? "Spends every remaining point of HP — this unit will not survive it." : null,
    art.weather ? "Changes the whole board's weather until something else changes it." : null,
    art.fire && state && !canIgniteFire(state) ? "The rain has put the fires out — this cannot be used right now." : null
  ].filter(Boolean);
}

function artUnavailableReason(art, unit, state) {
  if (canUseArt(state, unit, art.id)) return null;
  if (isStunned(unit)) return "This unit is stunned.";
  if (unit.statuses?.some((status) => status.type === "silence")) return "This unit is silenced and cannot use ARTS.";
  if (art.rageLocked && !isRaging(unit)) return "Locked until this unit enters RAGE.";
  if (art.fire && !canIgniteFire(state)) return "Nothing will light in this weather.";
  const useMax = getAbilityUseMax(art);
  if (useMax !== null && getAbilityUsesRemaining(unit, art) <= 0) return "Out of uses — the pool refills a full turn after it empties.";
  if (art.hpCost && !art.selfKill && unit.hp <= art.hpCost) return `Not enough HP — this costs ${art.hpCost}.`;
  if (unit.mp < getArtMpCost(unit, art, state)) return `Not enough ${getResourceMeta(unit.type).shortLabel}.`;
  const activation = state.activation;
  if (activation?.unitId === unit.id && (activation.moved || activation.primaryUsed) && !art.bonusActionGroup) {
    return "An ART must be the whole activation — this unit has already moved or acted.";
  }
  return "Not available right now.";
}

function baseActionUnavailableReason(action, unit, state) {
  const activation = state.activation;
  if (!activation || activation.unitId !== unit.id) return "Select this unit to act.";

  switch (action) {
    case "move":
      return activation.moved ? "This unit has already moved." : null;
    case "cancel-move": {
      if (!activation.moved) return "Only available after this unit moves.";
      if (activation.primaryUsed) return "This unit has already attacked, defended, or used an ART.";
      const trampleDamage = Math.max(0, Number(getRageEffectValue(unit, "trampleDamage", 0)) || 0);
      return trampleDamage > 0 ? "Trample movement is committed and cannot be cancelled." : null;
    }
    case "attack":
    case "defend":
      return activation.primaryUsed ? "This unit has already attacked, defended, or used an ART." : null;
    case "finish":
      return activation.primaryUsed ? null : "Available after this unit attacks, defends, or uses an ART.";
    default:
      return null;
  }
}

function baseActionDetail(action, unit, state) {
  const stats = getEffectiveStats(unit, state);
  const range = stats.attackRange;
  switch (action) {
    case "move":
      return {
        kicker: "Action",
        title: "Move",
        facts: [{ label: "Distance", value: `Up to ${stats.moveRange} tiles` }],
        description: "Walk this unit up to its MOVE, before or after its primary action.",
        notes: ["A move on its own does not end the activation — finish with an attack, an ART, or Defend."]
      };
    case "cancel-move":
      return {
        kicker: "Action",
        title: "Cancel Move",
        facts: [],
        description: "Put this unit back where its activation started.",
        notes: ["Only while it has not yet attacked, defended, or used an ART. A trample move is committed and cannot be taken back."]
      };
    case "attack":
      return {
        kicker: "Action",
        title: "Attack",
        facts: [
          { label: "Range", value: `${range} tile${range === 1 ? "" : "s"}` },
          { label: "Accuracy", value: "96% at range 1, −1% per further tile" },
          { label: "Damage", value: "max(1, STR − DEF), 15% crit for ×1.5" }
        ],
        description: "Strike one enemy within range. This is the unit's primary action for the activation.",
        notes: []
      };
    case "defend":
      return {
        kicker: "Action",
        title: "Defend",
        facts: [{ label: "Effect", value: "Halves physical and magic damage (rounded up)" }],
        description: "Brace until this unit next activates.",
        notes: ["True damage ignores Defend entirely."]
      };
    case "finish":
      return {
        kicker: "Action",
        title: "Finish",
        facts: [],
        description: "End this unit's activation and pass to the next commander.",
        notes: []
      };
    default:
      return null;
  }
}

function passiveEntries(definition, unit) {
  return [
    definition.passive ? { tag: "Passive", ...definition.passive } : null,
    ...definition.arts.filter((art) => art.kind === "passive").map((art) => ({ tag: "Passive", ...art })),
    definition.ragePassive ? { tag: "RAGE Passive", ...definition.ragePassive } : null,
    definition.rageArt?.kind === "passive" ? { tag: "RAGE Passive", ...definition.rageArt } : null
  ]
    .filter((entry) => entry && entry.description)
    .map((entry) => ({
      tag: entry.tag,
      name: /^rage( passive)?$/i.test(String(entry.name ?? "").trim()) ? "" : entry.name,
      description: entry.description,
      active: entry.tag === "RAGE Passive" ? isRaging(unit) : true
    }));
}

export function buildAbilityDetail(action, unit, state) {
  if (!action || !unit || !state) return null;
  const definition = getUnitType(unit.type);
  if (!definition) return null;

  const artId = action.startsWith("art:") ? action.slice(4) : action === "footwork" ? "footwork" : null;
  const base = {
    unitType: unit.type,
    unitName: unit.nickname || definition.name,
    passives: passiveEntries(definition, unit)
  };

  if (!artId) {
    const detail = baseActionDetail(action, unit, state);
    return detail ? { ...base, id: action, ...detail, unavailableReason: baseActionUnavailableReason(action, unit, state) } : null;
  }

  const art = getAvailableArts(unit).find((candidate) => candidate.id === artId);
  if (!art) return null;
  const isRageArt = definition.rageArt?.id === art.id;
  return {
    ...base,
    id: action,
    kicker: art.bonusActionGroup
      ? "Bonus ART"
      : isRageArt ? "RAGE ART" : isCommandOnly(unit) ? "Command" : "ART",
    title: art.name,
    facts: artFacts(art, unit, state),
    description: art.description ?? "",
    notes: artNotes(art, unit, state),
    unavailableReason: artUnavailableReason(art, unit, state)
  };
}
