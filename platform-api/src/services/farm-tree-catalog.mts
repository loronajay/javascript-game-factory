// The farm's productive trees, server side: what each species takes to grow
// and yields, how many may stand, and how far a save may claim they grew.
// Mirrors js/farm-catalog/trees.mts and js/farm-capacity.mts (a test holds them
// equal), because a pick and a felling are decided HERE: the client names a
// Tree Plot, the server decides whether its tree is ready and what it pays.
//
// A productive tree is not decor. Decor trees are cosmetic and yield nothing
// however many stand; a productive tree grows from a sapling bought with
// tickets, in a Tree Plot, and the number standing at once is capped by skill.

import { offlineGrowthAllowance, type VerifiedClock } from "./farm-time-policy.mjs";

const DAY = 24 * 60;
/** A tree drinks like a crop (js/farm-crops.mts): the same soil capacity, thirst clock and wilting cap. */
const MOISTURE_CAPACITY_MINUTES = 18 * 60;
const DEATH_DRY_MINUTES = 3 * DAY;
const MAX_CARE_PENALTY = 0.6;

export type FarmTreeRule = Readonly<{
  kind: "fruit" | "timber";
  saplingPrice: number;
  /** Farming for fruit, Woodcutting for timber. */
  minLevel: number;
  growMinutes: number;
  fruitEveryMinutes: number;
  regrowMinutes: number;
  yield: number;
  xp: number;
}>;

const fruit = (price: number, level: number, growDays: number, everyDays: number, yieldCount: number): FarmTreeRule => Object.freeze({
  kind: "fruit" as const, saplingPrice: price, minLevel: level, growMinutes: growDays * DAY, fruitEveryMinutes: everyDays * DAY,
  regrowMinutes: 0, yield: yieldCount, xp: Math.round(60 * everyDays),
});
const timber = (price: number, level: number, growDays: number, regrowDays: number, logs: number, xp: number): FarmTreeRule => Object.freeze({
  kind: "timber" as const, saplingPrice: price, minLevel: level, growMinutes: growDays * DAY, fruitEveryMinutes: 0,
  regrowMinutes: regrowDays * DAY, yield: logs, xp,
});

export const FARM_TREE_RULES: Readonly<Record<string, FarmTreeRule>> = Object.freeze({
  apple: fruit(60, 1, 4, 1.5, 5),
  pear: fruit(70, 5, 4, 2, 5),
  cherry: fruit(80, 10, 5, 2, 8),
  peach: fruit(90, 15, 5, 2.5, 5),
  orange: fruit(100, 20, 6, 2.5, 6),
  oak: timber(40, 1, 3, 1, 4, 150),
  pine: timber(50, 10, 3, 1.25, 5, 220),
  birch: timber(60, 20, 3.5, 1.5, 5, 320),
  willow: timber(80, 35, 4, 2, 6, 480),
});

export const TREE_PLOT_ITEM_ID = "decor.plant.tree-plot";

export function farmTreeRule(speciesId: unknown): FarmTreeRule | null {
  return typeof speciesId === "string" && Object.prototype.hasOwnProperty.call(FARM_TREE_RULES, speciesId) ? FARM_TREE_RULES[speciesId]! : null;
}

export const FRUIT_TREE_IDS: readonly string[] = Object.freeze(Object.keys(FARM_TREE_RULES).filter((id) => FARM_TREE_RULES[id]!.kind === "fruit"));
export const TIMBER_TREE_IDS: readonly string[] = Object.freeze(Object.keys(FARM_TREE_RULES).filter((id) => FARM_TREE_RULES[id]!.kind === "timber"));

// ---------------------------------------------------------------- capacity (mirrors js/farm-capacity.mts)

export const ORCHARD_CAPACITY_BY_FARMING_LEVEL: readonly Readonly<{ level: number; trees: number }>[] = Object.freeze([
  Object.freeze({ level: 1, trees: 1 }),
  Object.freeze({ level: 15, trees: 2 }),
  Object.freeze({ level: 30, trees: 4 }),
  Object.freeze({ level: 50, trees: 6 }),
  Object.freeze({ level: 70, trees: 8 }),
]);
export const FORESTRY_CAPACITY_BY_WOODCUTTING_LEVEL: readonly Readonly<{ level: number; trees: number }>[] = Object.freeze([
  Object.freeze({ level: 1, trees: 2 }),
  Object.freeze({ level: 20, trees: 3 }),
  Object.freeze({ level: 40, trees: 4 }),
  Object.freeze({ level: 65, trees: 5 }),
  Object.freeze({ level: 85, trees: 6 }),
]);

function stepFor(table: readonly Readonly<{ level: number; trees: number }>[], level: number): number {
  let trees = table[0]!.trees;
  for (const step of table) if (level >= step.level) trees = step.trees;
  return trees;
}

export function farmOrchardCapacity(farmingLevel: number): number {
  return stepFor(ORCHARD_CAPACITY_BY_FARMING_LEVEL, farmingLevel);
}

export function farmForestryCapacity(woodcuttingLevel: number): number {
  return stepFor(FORESTRY_CAPACITY_BY_WOODCUTTING_LEVEL, woodcuttingLevel);
}

// ---------------------------------------------------------------- the stored row

const INSTANCE_ID = /^[a-z0-9-]{1,40}$/;
const finite = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const bounded = (value: unknown, limit: number): number => Number(Math.min(limit, Math.max(0, finite(value))).toFixed(4));

/** Known species only, one per existing Tree Plot, every number bounded by its species. */
export function normalizeFarmTreeRows(value: unknown, treePlotIds: ReadonlySet<string>): any[] {
  const seen = new Set<string>();
  const trees: any[] = [];
  for (const raw of Array.isArray(value) ? value.slice(0, 160) : []) {
    const row: any = raw && typeof raw === "object" ? raw : {};
    const plotId = typeof row.plotId === "string" ? row.plotId.trim() : "";
    const rule = farmTreeRule(row.speciesId);
    if (!rule || !INSTANCE_ID.test(plotId) || !treePlotIds.has(plotId) || seen.has(plotId)) continue;
    seen.add(plotId);
    const stump = rule.kind === "timber" && row.stump === true;
    trees.push({
      plotId,
      speciesId: row.speciesId,
      growthMinutes: bounded(row.growthMinutes, stump ? rule.regrowMinutes : rule.growMinutes),
      fruitMinutes: rule.kind === "fruit" ? bounded(row.fruitMinutes, rule.fruitEveryMinutes) : 0,
      stump,
      lastFarmMinute: bounded(row.lastFarmMinute, 1_000_000_000),
      moistureMinutes: bounded(row.moistureMinutes, MOISTURE_CAPACITY_MINUTES),
      dryMinutes: bounded(row.dryMinutes, DEATH_DRY_MINUTES),
      carePenalty: bounded(row.carePenalty, MAX_CARE_PENALTY),
      diedOf: row.diedOf === "thirst" ? "thirst" : "",
    });
  }
  return trees;
}

const treeKey = (row: any): string => `${row.plotId}:${row.speciesId}`;

/**
 * Bound each submitted tree against what is stored, exactly as crops are
 * bounded (farm-time-policy `boundCropGrowth`): a tree's stamp only moves
 * forward and never past the verified clock, and it may grow by no more than
 * its stamp moved plus what offline production could have added. A stump
 * stays a stump until it has had the time to grow back; a standing tree is
 * never turned into a stump by a save (only a felling does that), and fruit
 * only accrues once the tree is mature. A tree planted since the stored save
 * counts from the stored clock. As with a crop, death is permanent and the
 * wilting penalty never falls in a save (only a pick or a felling, which the
 * server makes, starts a tree's next harvest clean).
 */
export function boundTreeGrowth(trees: any[], storedTrees: any[], storedClockMinutes: number, verified: VerifiedClock): any[] {
  const stored = new Map(storedTrees.map((row) => [treeKey(row), row]));
  const offline = offlineGrowthAllowance(verified.elapsedSeconds);
  return trees.map((row) => {
    const rule = farmTreeRule(row.speciesId)!;
    const previous = stored.get(treeKey(row));
    const floorStamp = previous ? finite(previous.lastFarmMinute) : storedClockMinutes;
    const stamp = Math.min(Math.max(finite(row.lastFarmMinute, floorStamp), floorStamp), Math.max(floorStamp, verified.farmMinutes));
    const care = {
      carePenalty: Math.max(finite(row.carePenalty), previous ? finite(previous.carePenalty) : 0),
      diedOf: previous?.diedOf || row.diedOf || "",
    };
    // A dead tree never changes again: it stands as it died until it is dug out.
    if (previous?.diedOf) {
      return { ...row, ...care, lastFarmMinute: stamp, stump: previous.stump === true, growthMinutes: finite(previous.growthMinutes), fruitMinutes: finite(previous.fruitMinutes) };
    }
    const before = previous ?? { growthMinutes: 0, fruitMinutes: 0, stump: false };
    return { ...row, ...boundedGrowth(row, before, rule, Math.max(0, stamp - floorStamp) + offline), ...care, lastFarmMinute: stamp };
  });
}

/** How far a living tree may have grown, regrown or fruited in `allowance` farm minutes since `before`. */
function boundedGrowth(row: any, before: any, rule: FarmTreeRule, allowance: number): { stump: boolean; growthMinutes: number; fruitMinutes: number } {
  if (before.stump) {
    const regrown = before.growthMinutes + allowance;
    if (!row.stump && regrown >= rule.regrowMinutes) return { stump: false, growthMinutes: rule.growMinutes, fruitMinutes: 0 };
    const claimed = row.stump ? finite(row.growthMinutes) : regrown;
    return { stump: true, growthMinutes: Math.max(0, Math.min(claimed, regrown, rule.regrowMinutes)), fruitMinutes: 0 };
  }
  const claimedGrowth = row.stump ? before.growthMinutes : finite(row.growthMinutes);
  const growthMinutes = Math.max(0, Math.min(claimedGrowth, before.growthMinutes + allowance, rule.growMinutes));
  let fruitMinutes = 0;
  if (rule.kind === "fruit" && growthMinutes >= rule.growMinutes) {
    // Only the part of the allowance left once the tree was grown can have gone to fruit.
    const toFruit = Math.max(0, allowance - Math.max(0, rule.growMinutes - before.growthMinutes));
    fruitMinutes = Math.max(0, Math.min(finite(row.fruitMinutes), before.fruitMinutes + toFruit, rule.fruitEveryMinutes));
  }
  return { stump: false, growthMinutes, fruitMinutes };
}

/**
 * Which submitted trees a save may keep. Stored trees always survive (a farm
 * over its capacity is grandfathered, as crops are). A NEW tree is admitted
 * only if (1) the save spent a sapling of its species for it — the stored
 * sapling count less the submitted one, one per new tree; (2) the stored skill
 * reaches its species' level; (3) its kind is under capacity.
 */
export function admitNewTrees(trees: any[], storedTrees: any[], context: {
  storedSaplings: Readonly<Record<string, number>>;
  submittedSaplings: Readonly<Record<string, number>>;
  farmingLevel: number;
  woodcuttingLevel: number;
}): any[] {
  const stored = new Set(storedTrees.map(treeKey));
  const kept = trees.filter((row) => stored.has(treeKey(row)));
  const count = (kind: string) => kept.filter((row) => farmTreeRule(row.speciesId)?.kind === kind).length;
  const spent: Record<string, number> = {};
  for (const row of trees) {
    if (stored.has(treeKey(row))) continue;
    const rule = farmTreeRule(row.speciesId)!;
    const available = (Number(context.storedSaplings[row.speciesId]) || 0) - (Number(context.submittedSaplings[row.speciesId]) || 0);
    if ((spent[row.speciesId] ?? 0) >= available) continue;
    const level = rule.kind === "fruit" ? context.farmingLevel : context.woodcuttingLevel;
    if (level < rule.minLevel) continue;
    const capacity = rule.kind === "fruit" ? farmOrchardCapacity(context.farmingLevel) : farmForestryCapacity(context.woodcuttingLevel);
    if (count(rule.kind) >= capacity) continue;
    spent[row.speciesId] = (spent[row.speciesId] ?? 0) + 1;
    kept.push(row);
  }
  const accepted = new Set(kept);
  return trees.filter((row) => accepted.has(row));
}

/** Ready to pick (fruit) or to fell (timber), on the verified row. A dead tree never is. */
export function farmTreeReady(row: any): boolean {
  const rule = farmTreeRule(row?.speciesId);
  if (!rule || row.stump || row.diedOf) return false;
  if (!(finite(row.growthMinutes) >= rule.growMinutes)) return false;
  return rule.kind === "timber" || finite(row.fruitMinutes) >= rule.fruitEveryMinutes;
}

/** What a ready tree pays: the species' yield less the verified row's wilting, never below one (js/farm-trees.mts `treeHarvestYield`). */
export function farmTreeYield(row: any): number {
  const rule = farmTreeRule(row?.speciesId);
  if (!rule || row.diedOf) return 0;
  return Math.max(1, Math.round(rule.yield * (1 - Math.min(MAX_CARE_PENALTY, Math.max(0, finite(row.carePenalty))))));
}
