// The farm's player-facing skill record, shaped for the Stats screen. PURE —
// no DOM and no persistence. The server-owned FarmSkills record remains the
// authority; this module only gives its XP and lifetime counters readable names.

import { CROP_CATALOG } from "./farm-crops.mjs";
import { FRUIT_TREES, TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { PATTERN_CATALOG } from "./farm-catalog/carpentry.mjs";
import { farmingProgress, type FarmSkills } from "./farm-skills.mjs";

export type FarmStatLine = Readonly<{ label: string; value: number }>;
export type FarmSkillStats = Readonly<{
  id: "farming" | "woodcutting" | "cooking" | "carpentry";
  title: string;
  description: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  xpRemaining: number;
  fraction: number;
  maxed: boolean;
  stats: readonly FarmStatLine[];
  breakdownTitle: string;
  breakdown: readonly FarmStatLine[];
}>;

export type FarmStatsView = Readonly<{
  totalLevel: number;
  totalXp: number;
  skills: readonly FarmSkillStats[];
}>;

function sumCounts(values: Readonly<Record<string, number>>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function breakdown(
  catalog: readonly Readonly<{ id: string; title: string }>[] ,
  counts: Readonly<Record<string, number>>,
): FarmStatLine[] {
  return catalog
    .map((entry) => ({ label: entry.title, value: counts[entry.id] ?? 0 }))
    .filter((line) => line.value > 0);
}

function skill(
  id: FarmSkillStats["id"],
  title: string,
  description: string,
  xp: number,
  stats: readonly FarmStatLine[],
  breakdownTitle: string,
  detail: readonly FarmStatLine[],
): FarmSkillStats {
  const progress = farmingProgress(xp);
  return Object.freeze({
    id, title, description,
    level: progress.level,
    xp: progress.xp,
    nextLevelXp: progress.nextLevelXp,
    xpRemaining: progress.maxed ? 0 : Math.max(0, progress.nextLevelXp - progress.xp),
    fraction: progress.fraction,
    maxed: progress.maxed,
    stats: Object.freeze([...stats]),
    breakdownTitle,
    breakdown: Object.freeze([...detail]),
  });
}

export function buildFarmStats(skills: FarmSkills): FarmStatsView {
  const rows: FarmSkillStats[] = [
    skill(
      "farming", "Farming", "Grow crops, pick orchard fruit and fill produce orders.", skills.farming.xp,
      [
        { label: "Crop harvests", value: skills.farming.harvests },
        { label: "Fruit picks", value: sumCounts(skills.farming.fruit) },
        { label: "Orders filled", value: skills.farming.orders },
      ],
      "What you've grown",
      [
        ...breakdown(CROP_CATALOG, skills.farming.crops),
        ...breakdown(FRUIT_TREES, skills.farming.fruit),
      ],
    ),
    skill(
      "woodcutting", "Woodcutting", "Fell mature timber trees with well-timed swings.", skills.woodcutting.xp,
      [{ label: "Trees felled", value: skills.woodcutting.fellings }],
      "Trees felled",
      breakdown(TIMBER_TREES, skills.woodcutting.trees),
    ),
    skill(
      "cooking", "Cooking", "Turn farm produce into dishes and fill kitchen orders.", skills.cooking.xp,
      [
        { label: "Dishes cooked", value: skills.cooking.dishes },
        { label: "Three-star dishes", value: skills.cooking.perfect },
        { label: "Orders filled", value: skills.cooking.orders },
      ],
      "Recipes cooked",
      breakdown(RECIPE_CATALOG, skills.cooking.recipes),
    ),
    skill(
      "carpentry", "Carpentry", "Mill logs and craft furniture at the workbench.", skills.carpentry.xp,
      [
        { label: "Logs milled", value: skills.carpentry.milled },
        { label: "Pieces made", value: skills.carpentry.pieces },
        { label: "Masterworks", value: skills.carpentry.masterwork },
      ],
      "Patterns made",
      breakdown(PATTERN_CATALOG, skills.carpentry.patterns),
    ),
  ];
  return Object.freeze({
    totalLevel: rows.reduce((total, row) => total + row.level, 0),
    totalXp: rows.reduce((total, row) => total + row.xp, 0),
    skills: Object.freeze(rows),
  });
}
