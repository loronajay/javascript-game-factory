// Injects generated data tables into the hand-written balance docs.
//
// The split this enforces: PROSE is hand-written and carries judgment; TABLES are generated
// from balance-data/analysis.json and carry numbers. Re-running the sim refreshes every
// number in the docs without anyone retyping a percentage, which is the failure mode the
// whole rewrite exists to prevent.
//
// Markers in the markdown look like:
//   <!-- BEGIN GENERATED: ratings -->
//   ...anything here is replaced...
//   <!-- END GENERATED: ratings -->
//
// Usage:
//   node scripts/balance-tables.mjs           # rewrite the marked blocks in place
//   node scripts/balance-tables.mjs --check   # non-zero exit if any block is stale

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CHECK = process.argv.includes("--check");

const analysis = JSON.parse(readFileSync(resolve(ROOT, "balance-data/analysis.json"), "utf8"));
const kit = JSON.parse(readFileSync(resolve(ROOT, "balance-data/kit-audit.json"), "utf8"));
const nameOf = Object.fromEntries(kit.units.map((u) => [u.id, u.name]));

const pct = (x, digits = 1) => `${(100 * x).toFixed(digits)}%`;
const signed = (x, digits = 2) => (x >= 0 ? `+${x.toFixed(digits)}` : x.toFixed(digits));

// ---- tier assignment -------------------------------------------------------
// Tiers are cut on the fitted rating, but the cuts are only meaningful if they exceed the
// measurement error. Any unit whose rating is within ~2 standard errors of a boundary is
// genuinely ambiguous, and the docs say so rather than pretending the line is crisp.
const TIER_CUTS = [
  { tier: "S", min: 0.60 },
  { tier: "A", min: 0.25 },
  { tier: "B", min: -0.10 },
  { tier: "C", min: -0.50 },
  { tier: "D", min: -Infinity }
];

export function tierFor(rating) {
  return TIER_CUTS.find((t) => rating >= t.min).tier;
}

function tierTable() {
  const rows = analysis.ratings.map((r) => ({ ...r, tier: tierFor(r.rating) }));
  const lines = [];
  lines.push("| Tier | Unit | Rating | ± | Squad win% | Raw win% | Games |");
  lines.push("| :---: | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of rows) {
    lines.push(`| ${r.tier} | ${nameOf[r.unit] ?? r.unit} | ${signed(r.rating)} | ${r.stderr.toFixed(2)} | ${r.marginalWinPct.toFixed(1)}% | ${pct(r.winRate)} | ${r.games} |`);
  }
  return lines.join("\n");
}

function tierSummary() {
  const byTier = {};
  for (const r of analysis.ratings) (byTier[tierFor(r.rating)] ??= []).push(nameOf[r.unit] ?? r.unit);
  const labels = {
    S: "format-defining",
    A: "strong in most squads",
    B: "solid role-players",
    C: "conditional or demanding",
    D: "hardest to justify"
  };
  return Object.entries(labels)
    .filter(([tier]) => byTier[tier]?.length)
    .map(([tier, label]) => `- **${tier}** *(${label})* — ${byTier[tier].join(", ")}`)
    .join("\n");
}

function telemetryTable() {
  const lines = [];
  lines.push("| Unit | Dmg/game | Taken/game | Heal/game | Kills/game | Survival | Acts/game | RAGE uptime |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of analysis.ratings) {
    lines.push(`| ${nameOf[r.unit] ?? r.unit} | ${r.perGame.damageDealt.toFixed(1)} | ${r.perGame.damageTaken.toFixed(1)} | ${r.perGame.healingDone.toFixed(1)} | ${r.perGame.kills.toFixed(2)} | ${pct(r.survivalRate, 0)} | ${r.perGame.activations.toFixed(1)} | ${pct(r.rageUptime, 1)} |`);
  }
  return lines.join("\n");
}

// A pair effect is only worth printing when it clears the noise floor. |z| >= 3 with a
// decent sample is the bar; everything below it is sampling scatter dressed as insight.
function pairTable(entries, { limit = 15, minZ = 3, separator = "|", verb = "+", sign = 1 } = {}) {
  const rows = entries
    // A unit can be sampled onto both squads, producing a mirror "X vs X" row whose
    // effect is zero by construction. Real data, no information.
    .filter((e) => { const [a, b] = e.key.split(separator); return a !== b; })
    .filter((e) => Math.abs(e.z) >= minZ)
    // Only pairs pointing the requested way: the synergy table must not fill up with
    // anti-synergies just because few pairs clear the significance bar.
    .filter((e) => (sign >= 0 ? e.effect > 0 : e.effect < 0))
    .slice(0, limit);
  if (!rows.length) return "_No pair cleared the significance bar in this run._";
  const lines = [];
  lines.push(`| Pair | Effect on win rate | z | Games |`);
  lines.push("| --- | ---: | ---: | ---: |");
  for (const e of rows) {
    const [a, b] = e.key.split(separator);
    lines.push(`| ${nameOf[a] ?? a} ${verb} ${nameOf[b] ?? b} | ${signed(100 * e.effect, 1)} pts | ${e.z.toFixed(1)} | ${e.n} |`);
  }
  return lines.join("\n");
}

function unusedArtsTable() {
  if (!analysis.unusedArts?.length) return "_Every ART saw use._";
  const lines = [];
  lines.push("| Unit | ART | Share of activations | Rage-locked |");
  lines.push("| --- | --- | ---: | :---: |");
  for (const u of analysis.unusedArts) {
    lines.push(`| ${nameOf[u.unit] ?? u.unit} | ${u.art} | ${(100 * u.share).toFixed(2)}% | ${u.rageLocked ? "yes" : ""} |`);
  }
  return lines.join("\n");
}

function stabilityTable() {
  if (!analysis.comparison?.length) return "_No second-difficulty run was compared._";
  const sorted = [...analysis.comparison].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12);
  const lines = [];
  lines.push("| Unit | Hard | Normal | Δ |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const c of sorted) {
    lines.push(`| ${nameOf[c.unit] ?? c.unit} | ${signed(c.a)} | ${signed(c.b)} | ${signed(c.delta)} |`);
  }
  return lines.join("\n");
}

function runMeta() {
  const m = analysis.meta;
  return [
    `- **Matches:** ${m.games.toLocaleString()} (${m.decided.toLocaleString()} decided, ${(100 * m.decided / m.games).toFixed(1)}%)`,
    `- **CPU difficulty:** ${m.difficulty}`,
    `- **Board:** ${m.size}×${m.size}, 1v1, 4-unit squads drawn at random from all ${m.roster.length} draftable units`,
    `- **Both orientations played:** every sampled pairing is played twice, swapping which side spawns first, so corner and first-turn advantage cancel`,
    `- **Engine:** real `+"`createMatchState`"+` → `+"`chooseActivation`"+` → `+"`applyCommand`"+`; no synthetic damage model`,
    `- **Regenerate:** `+"`npm run sim -- --games 16000 --difficulty hard`"+` then `+"`npm run balance`"+``
  ].join("\n");
}

// Before/after for the CPU planner fixes. Both runs use the same seed, so the squads are
// identical and this is a PAIRED comparison — but ratings are re-centred on zero every
// fit, so one unit rising mechanically pushes all others down by (delta / roster size).
// That drift is not evidence of anything, and the table says so.
function fixImpactTable() {
  let pre;
  try {
    pre = JSON.parse(readFileSync(resolve(ROOT, "balance-data/analysis-prefix.json"), "utf8"));
  } catch {
    return "_No pre-fix baseline present._";
  }
  const before = Object.fromEntries(pre.ratings.map((r) => [r.unit, r]));
  const rows = analysis.ratings
    .filter((r) => before[r.unit])
    .map((r) => ({
      unit: r.unit,
      pre: before[r.unit].rating,
      post: r.rating,
      delta: r.rating - before[r.unit].rating,
      dmgPre: before[r.unit].perGame.damageDealt,
      dmgPost: r.perGame.damageDealt
    }))
    .sort((a, b) => b.delta - a.delta);

  // Two standard errors on a difference of two independent fits.
  const typicalSe = analysis.ratings.reduce((n, r) => n + r.stderr, 0) / analysis.ratings.length;
  const threshold = 2 * Math.sqrt(2) * typicalSe;

  const lines = [];
  lines.push(`Significance threshold for a real change: **±${threshold.toFixed(2)}** rating (2σ on a paired difference).`);
  lines.push("");
  lines.push("| Unit | Pre-fix | Post-fix | Δ rating | Dmg/game | Verdict |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
  for (const r of rows) {
    if (Math.abs(r.delta) < threshold && Math.abs(r.dmgPost - r.dmgPre) < 3) continue;
    const verdict = Math.abs(r.delta) >= threshold ? "**real**" : "within noise";
    lines.push(`| ${nameOf[r.unit] ?? r.unit} | ${signed(r.pre)} | ${signed(r.post)} | ${signed(r.delta)} | ${r.dmgPre.toFixed(1)} → ${r.dmgPost.toFixed(1)} | ${verdict} |`);
  }
  lines.push("");
  lines.push(`Every other unit moved less than ±${threshold.toFixed(2)}, which is what re-centring plus sampling noise looks like.`);
  return lines.join("\n");
}

const BLOCKS = {
  "run-meta": runMeta,
  "fix-impact": fixImpactTable,
  "tier-summary": tierSummary,
  "tier-table": tierTable,
  "telemetry": telemetryTable,
  "synergy": () => pairTable(analysis.synergy, { separator: "|", verb: "+", sign: 1 }),
  "antisynergy": () => pairTable([...analysis.synergy].reverse(), { separator: "|", verb: "+", sign: -1 }),
  "counters": () => pairTable(analysis.counter, { separator: ">", verb: "vs", limit: 20, sign: 1 }),
  "unused-arts": unusedArtsTable,
  "stability": stabilityTable
};

const DOCS = ["BALANCE.md", "MATCHUPS.md"];

let stale = 0;
for (const doc of DOCS) {
  const path = resolve(ROOT, doc);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.log(`skip ${doc} (not present)`);
    continue;
  }

  let updated = text;
  for (const [name, render] of Object.entries(BLOCKS)) {
    const re = new RegExp(`(<!-- BEGIN GENERATED: ${name} -->\\n)([\\s\\S]*?)(<!-- END GENERATED: ${name} -->)`, "g");
    if (!re.test(updated)) continue;
    re.lastIndex = 0;
    updated = updated.replace(re, (_, open, __, close) => `${open}${render()}\n${close}`);
  }

  if (updated !== text) {
    if (CHECK) {
      console.error(`${doc} has stale generated tables — run \`node scripts/balance-tables.mjs\``);
      stale += 1;
    } else {
      writeFileSync(path, updated);
      console.log(`updated ${doc}`);
    }
  } else {
    console.log(`${doc} up to date`);
  }
}

if (CHECK && stale) process.exit(1);
