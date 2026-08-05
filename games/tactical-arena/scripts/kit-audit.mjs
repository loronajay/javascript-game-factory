// Kit extractor — dumps every unit's ENGINE-TRUE kit straight out of UNIT_TYPES.
//
// The point of this script is that the balance docs must never restate a number by
// hand. Anything numeric in BALANCE.md / MATCHUPS.md should be traceable to the JSON
// this emits, and UNIT_KIT_REFERENCE.generated.md is written by this script only.
//
// Usage:
//   node scripts/kit-audit.mjs            # writes balance-data/kit-audit.json + the .md
//   node scripts/kit-audit.mjs --check    # fails if the committed output is stale
//
// Design notes:
// - Effects are flattened GENERICALLY (every key/value on the effect object) rather
//   than translated into prose. Prose drifts; a flattened `chance=0.7 durationTurns=1`
//   cannot. The unit's own authored `description` is carried alongside because that is
//   the string the player actually reads in-game.
// - Derived stat folding (auras, weather, thresholds) deliberately is NOT applied here.
//   This file is the BASE kit. Folded/live numbers belong to the simulator, which runs
//   getEffectiveStats through real matches.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { UNIT_TYPES } from "../src/core/unitRegistry.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DATA_DIR = join(ROOT, "balance-data");
const JSON_OUT = join(DATA_DIR, "kit-audit.json");
const MD_OUT = join(ROOT, "UNIT_KIT_REFERENCE.generated.md");

const CHECK = process.argv.includes("--check");

// ---- generic flattening ----------------------------------------------------
// Turn an arbitrary effect/targeting/resolution object into stable `key=value` text.
// Nested objects recurse with dotted keys; arrays render as [a, b, c]. Keys that carry
// no balance information are dropped so the reference stays readable.
const NOISE_KEYS = new Set(["description", "implemented", "name", "id", "glyph"]);

function flatten(value, prefix = "", out = []) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    const scalars = value.every((v) => typeof v !== "object" || v === null);
    if (scalars) {
      out.push(`${prefix}=[${value.join(", ")}]`);
      return out;
    }
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (NOISE_KEYS.has(k)) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out.push(`${prefix}=${value}`);
  return out;
}

function flatText(value) {
  const parts = flatten(value);
  return parts.length ? parts.join(" ") : "";
}

// ---- ART shaping -----------------------------------------------------------
// Split an ART's fields into the ones that get their own column (cost/accuracy/damage)
// and "everything else", so no authored field is silently dropped from the reference.
const ART_COLUMN_KEYS = new Set([
  "id", "name", "kind", "mpCost", "hpCost", "accuracy", "damage", "damageType",
  "description", "implemented", "ai"
]);

function shapeArt(art, { rageArt = false } = {}) {
  const rest = {};
  for (const [k, v] of Object.entries(art)) {
    if (ART_COLUMN_KEYS.has(k)) continue;
    rest[k] = v;
  }
  return {
    id: art.id,
    name: art.name,
    kind: art.kind ?? "active",
    rageArt,
    rageLocked: Boolean(art.rageLocked),
    bonusAction: art.bonusActionGroup ?? null,
    mpCost: art.mpCost ?? 0,
    hpCost: art.hpCost ?? null,
    costLabel: art.costLabel ?? null,
    uses: art.uses ?? null,
    accuracy: art.accuracy ?? null,
    damage: art.damage ?? null,
    damageType: art.damageType ?? null,
    range: art.targeting?.range ?? null,
    shape: art.targeting?.shape ?? null,
    radius: art.targeting?.radius ?? null,
    selfCast: Boolean(art.selfCast),
    effectType: art.effect?.type ?? null,
    effect: art.effect ? flatText(art.effect) : "",
    detail: flatText(rest),
    description: art.description ?? "",
    aiIntent: art.ai?.intent ?? null,
    aiTags: art.ai?.tags ? [...art.ai.tags] : []
  };
}

// ---- unit shaping ----------------------------------------------------------
function shapeUnit(id, def) {
  const passives = [];
  if (def.passive) {
    passives.push({
      id: def.passive.id,
      name: def.passive.name,
      effectType: def.passive.effect?.type ?? null,
      effect: def.passive.effect ? flatText(def.passive.effect) : "",
      description: def.passive.description ?? ""
    });
  }
  if (def.ragePassive) {
    passives.push({
      id: def.ragePassive.id,
      name: def.ragePassive.name,
      rageOnly: true,
      effectType: def.ragePassive.effect?.type ?? null,
      effect: def.ragePassive.effect ? flatText(def.ragePassive.effect) : "",
      description: def.ragePassive.description ?? ""
    });
  }

  // Several units park always-on behavior inside the ARTS list as kind:"passive".
  // Those are real passives for balance purposes, so they are surfaced as such while
  // still appearing in the ART table (a reader looking at either place sees them).
  const arts = (def.arts ?? []).map((a) => shapeArt(a));
  const rage = def.rageArt ? shapeArt(def.rageArt, { rageArt: true }) : null;

  return {
    id,
    name: def.name,
    classType: def.classType ?? null,
    summonOnly: Boolean(def.summon),
    draftable: !def.summon,
    actsFirst: Boolean(def.actsFirst),
    commandOnly: Boolean(def.commandOnly),
    sustainsVictory: def.sustainsVictory !== false,
    stats: { ...def.stats },
    resource: def.resource ? { ...def.resource } : { id: "mp", label: "MP", startsAt: def.stats?.maxMp ?? 0 },
    ai: def.ai ? { ...def.ai, tags: undefined } : null,
    passives,
    arts,
    rage,
    stances: def.stances ? flatText(def.stances) : "",
    weathers: def.weathers ? flatText(def.weathers) : "",
    // Rollups the docs lean on constantly, computed rather than counted by hand.
    counts: {
      arts: arts.length,
      passiveArts: arts.filter((a) => a.kind === "passive").length,
      activeArts: arts.filter((a) => a.kind !== "passive").length,
      rageLockedArts: arts.filter((a) => a.rageLocked).length,
      bonusActionArts: arts.filter((a) => a.bonusAction).length,
      cheapestActiveMp: Math.min(...[Infinity, ...arts.filter((a) => a.kind !== "passive").map((a) => a.mpCost)]),
      totalActiveMp: arts.filter((a) => a.kind !== "passive").reduce((n, a) => n + (a.mpCost ?? 0), 0)
    }
  };
}

const units = Object.entries(UNIT_TYPES).map(([id, def]) => shapeUnit(id, def));
const draftable = units.filter((u) => u.draftable);

// ---- cross-roster indexes --------------------------------------------------
// These answer the questions the docs kept guessing at: who has magic, who has true
// damage, who is status-immune, who edits the board for both teams.
function unitsWhere(predicate) {
  return draftable.filter(predicate).map((u) => u.id);
}

// Damage-type access is NOT fully declarative: several ARTS (Swordsman's Footwork,
// Fat Knight's Fart) apply true damage from resolver code, so scanning `damageType`
// alone under-counts. Two independent sources are combined and any disagreement is
// reported, because a silently-incomplete index is exactly the kind of "close enough"
// claim these docs are supposed to stop making:
//   declared — a `damageType` field anywhere in the ART's data
//   stated   — the unit's own in-game description text (what the player is promised)
// The simulator measures what actually lands; this index is the authored intent.
const DAMAGE_WORDS = { true: /\btrue damage\b/i, magic: /\bmagic damage\b/i, physical: /\bphysical damage\b/i };

const damageTypeIndex = {};
const damageTypeSources = {};
for (const u of draftable) {
  const declared = new Set();
  const stated = new Set();
  for (const a of [...u.arts, ...(u.rage ? [u.rage] : [])]) {
    if (a.damageType) declared.add(a.damageType);
    for (const m of a.detail.matchAll(/damageType=(\w+)/g)) declared.add(m[1]);
    for (const [type, re] of Object.entries(DAMAGE_WORDS)) {
      if (re.test(a.description)) stated.add(type);
    }
  }
  for (const p of u.passives) {
    for (const [type, re] of Object.entries(DAMAGE_WORDS)) {
      if (re.test(p.description)) stated.add(type);
    }
  }
  damageTypeIndex[u.id] = [...new Set([...declared, ...stated])].sort();
  damageTypeSources[u.id] = {
    declared: [...declared].sort(),
    stated: [...stated].sort(),
    // Types promised in text but never declared in data — these are the resolver-coded
    // ones, and a reviewer should confirm each against its resolver.
    textOnly: [...stated].filter((t) => !declared.has(t)).sort()
  };
}

const indexes = {
  damageTypeByUnit: damageTypeIndex,
  damageTypeSources,
  hasTrueDamage: unitsWhere((u) => damageTypeIndex[u.id].includes("true")),
  hasMagicDamage: unitsWhere((u) => damageTypeIndex[u.id].includes("magic")),
  statusImmune: unitsWhere((u) => u.passives.some((p) => p.effectType === "immunity")
    || u.arts.some((a) => a.effectType === "immunity")),
  teamAuras: unitsWhere((u) => u.passives.some((p) => /Aura|team/i.test(p.effectType ?? ""))
    || u.arts.some((a) => /teamAura|teamDamageReduction|healingLockoutAura|allyAura|enemyAura/.test(a.effectType ?? ""))),
  moveAndArt: unitsWhere((u) => /movementShape|moveArts/i.test(JSON.stringify(u.passives))
    || u.arts.some((a) => a.detail.includes("moveArts"))),
  bonusActions: unitsWhere((u) => u.counts.bonusActionArts > 0),
  rageLocked: unitsWhere((u) => u.counts.rageLockedArts > 0),
  summoners: unitsWhere((u) => u.arts.some((a) => a.detail.includes("summon"))),
  alternateResource: unitsWhere((u) => (u.resource?.id ?? "mp") !== "mp"),
  healers: unitsWhere((u) => [...u.arts, ...(u.rage ? [u.rage] : [])]
    .some((a) => /heal/i.test(a.effectType ?? "") || /heal/i.test(a.detail))),
  cleansers: unitsWhere((u) => u.arts.some((a) => /cleanse/i.test(a.effectType ?? "") || a.detail.includes("cleanse")))
};

// ---- stat leaderboards -----------------------------------------------------
function leaderboard(key) {
  return [...draftable]
    .map((u) => ({ id: u.id, value: u.stats[key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
}
const statBoards = Object.fromEntries(
  ["maxHp", "strength", "defense", "maxMp", "moveRange", "attackRange"].map((k) => [k, leaderboard(k)])
);

const payload = {
  generatedBy: "scripts/kit-audit.mjs",
  draftableCount: draftable.length,
  rosterCount: units.length,
  units,
  indexes,
  statBoards
};

// ---- markdown --------------------------------------------------------------
function mdEscape(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function statLine(u) {
  const s = u.stats;
  return `HP ${s.maxHp} · STR ${s.strength} · DEF ${s.defense} · ${u.resource.shortLabel ?? u.resource.label ?? "MP"} ${s.maxMp} · MOVE ${s.moveRange} · RANGE ${s.attackRange}`;
}

function artRow(a) {
  const cost = [
    a.mpCost ? `${a.mpCost} MP` : null,
    a.hpCost ? `${a.hpCost} HP` : null,
    a.costLabel,
    a.uses ? `${a.uses} uses` : null
  ].filter(Boolean).join(" + ") || "free";
  const tags = [
    a.kind === "passive" ? "passive" : null,
    a.rageArt ? "RAGE" : null,
    a.rageLocked ? "rage-locked" : null,
    a.bonusAction ? `bonus:${a.bonusAction}` : null,
    a.selfCast ? "self" : null,
    a.damageType,
    a.range != null ? `rng ${a.range}` : null,
    a.shape,
    a.radius != null ? `r${a.radius}` : null,
    a.accuracy != null ? `acc ${Math.round(a.accuracy * 100)}%` : null,
    a.damage != null ? `dmg ${a.damage}` : null
  ].filter(Boolean).join(", ");
  const mech = [a.effect, a.detail].filter(Boolean).join(" ");
  return `| ${mdEscape(a.name)} | ${cost} | ${mdEscape(tags)} | ${mdEscape(mech)} | ${mdEscape(a.description)} |`;
}

function renderMarkdown() {
  const lines = [];
  lines.push("# Tactical Arena — Unit Kit Reference (generated)");
  lines.push("");
  lines.push("> **Generated file. Do not edit by hand.** Regenerate with `node scripts/kit-audit.mjs`.");
  lines.push("> Every row is read directly out of `src/core/units/*.js` via `UNIT_TYPES`, so this file");
  lines.push("> cannot drift from the engine the way a hand-written table does. Prose analysis lives in");
  lines.push("> `BALANCE.md`, `MATCHUPS.md`, and `UNIT_ARCHETYPES.md`; this is the numbers substrate they cite.");
  lines.push("");
  lines.push(`Roster: **${draftable.length} draftable** units (+${units.length - draftable.length} summon-only).`);
  lines.push("");
  lines.push("Mechanics columns are flattened straight from the authored `effect`/`targeting`/`resolution`");
  lines.push("objects. `acc` is the ART's own range-1 accuracy; base stats here are **unfolded** — auras,");
  lines.push("weather, thresholds, and RAGE modifiers are applied live by `getEffectiveStats`.");
  lines.push("");

  // Stat tables
  lines.push("## Base stat table");
  lines.push("");
  lines.push("| Unit | Class | HP | STR | DEF | Resource | MOVE | RANGE | ARTS |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |");
  for (const u of [...draftable].sort((a, b) => a.name.localeCompare(b.name))) {
    const res = `${u.stats.maxMp} ${u.resource.shortLabel ?? u.resource.label ?? "MP"}`;
    lines.push(`| ${u.name} | ${u.classType ?? "—"} | ${u.stats.maxHp} | ${u.stats.strength} | ${u.stats.defense} | ${res} | ${u.stats.moveRange} | ${u.stats.attackRange} | ${u.counts.arts} |`);
  }
  lines.push("");

  // Indexes
  lines.push("## Roster indexes");
  lines.push("");
  const indexLabels = {
    hasTrueDamage: "Access true damage (ignores DEF *and* Defend)",
    hasMagicDamage: "Access magic damage (ignores DEF)",
    statusImmune: "Carry a status-immunity effect",
    healers: "Can heal",
    cleansers: "Can cleanse",
    teamAuras: "Project a team/enemy aura",
    bonusActions: "Have a bonus-action ART",
    rageLocked: "Have rage-locked ARTS",
    summoners: "Can put extra bodies on the board",
    alternateResource: "Use a non-MP resource"
  };
  for (const [key, label] of Object.entries(indexLabels)) {
    const list = indexes[key] ?? [];
    lines.push(`- **${label}** (${list.length}): ${list.length ? list.join(", ") : "—"}`);
  }
  lines.push("");

  // Per-unit
  lines.push("## Per-unit kits");
  lines.push("");
  for (const u of [...draftable].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`### ${u.name} \`${u.id}\``);
    lines.push("");
    lines.push(`${statLine(u)}`);
    const flags = [
      u.classType ? `class \`${u.classType}\`` : null,
      u.ai?.role ? `AI role \`${u.ai.role}\`` : null,
      u.ai?.threatValue != null ? `AI threat ${u.ai.threatValue}` : null,
      u.actsFirst ? "**acts first each turn**" : null,
      u.commandOnly ? "**command-only (never moves/attacks)**" : null,
      u.sustainsVictory ? null : "**does not sustain victory**"
    ].filter(Boolean);
    if (flags.length) {
      lines.push("");
      lines.push(flags.join(" · "));
    }
    if (u.passives.length) {
      lines.push("");
      for (const p of u.passives) {
        const tag = p.rageOnly ? " *(rage-only)*" : "";
        lines.push(`- **Passive — ${p.name}**${tag} \`${p.effectType ?? "—"}\`: ${mdEscape(p.description)}`);
        if (p.effect) lines.push(`  - mechanics: \`${p.effect}\``);
      }
    }
    if (u.stances) {
      lines.push("");
      lines.push(`- **Stances**: \`${u.stances}\``);
    }
    if (u.weathers) {
      lines.push("");
      lines.push(`- **Weather**: \`${u.weathers}\``);
    }
    const artRows = [...u.arts, ...(u.rage ? [u.rage] : [])];
    if (artRows.length) {
      lines.push("");
      lines.push("| ART | Cost | Tags | Mechanics | In-game text |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const a of artRows) lines.push(artRow(a));
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

const markdown = renderMarkdown();
const json = JSON.stringify(payload, null, 2) + "\n";

if (CHECK) {
  const stale = [];
  if (!existsSync(JSON_OUT) || readFileSync(JSON_OUT, "utf8") !== json) stale.push(JSON_OUT);
  if (!existsSync(MD_OUT) || readFileSync(MD_OUT, "utf8") !== markdown) stale.push(MD_OUT);
  if (stale.length) {
    console.error("Kit audit is stale — run `node scripts/kit-audit.mjs`:");
    for (const f of stale) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("Kit audit is up to date.");
} else {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(JSON_OUT, json);
  writeFileSync(MD_OUT, markdown);
  console.log(`Wrote ${JSON_OUT}`);
  console.log(`Wrote ${MD_OUT}`);
  console.log(`${draftable.length} draftable units, ${units.length} total.`);
}
