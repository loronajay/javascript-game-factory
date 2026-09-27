// Productive trees: the orchard and the forestry. PURE — no THREE, no DOM, no
// clock — so the page, the tests and (mirrored) the API read one contract.
//
// A tree stands in a Tree Plot (decor `decor.plant.tree-plot`), one tree per
// plot, the way a crop stands in a plot's cell: the decor is WHERE, this row is
// WHAT grows there. Moving the plot in build mode moves the tree; removing the
// plot removes it.
//
// A tree row is four numbers and a flag:
//   growthMinutes  toward maturity — or, for a felled tree, toward regrowth;
//   fruitMinutes   a fruit tree's progress toward its next crop, once mature;
//   stump          a timber tree has been felled and is growing back;
//   lastFarmMinute the farm minute it was last brought up to date.
//
// Trees need no watering: an orchard is the farm's low-maintenance producer,
// and the choice it asks for is WHICH tree gets one of the few productive slots
// (farm-capacity.mts), not daily care. They grow offline at the same reduced
// rate as crops (farm-offline.mts), and nothing is ever picked or felled for the
// player. Picking and felling on an account farm are the server's decision
// (platform-api db/farm-economy.mts `harvestFarmTree`); the local functions here
// are for signed-out farms and for what the page shows.

import { TREE_PLOT_ITEM_ID, findTreeSpecies, type TreeKind, type TreeSpecies } from "./farm-catalog/trees.mjs";
import type { CropPlayerPose, FarmInventory } from "./farm-crops.mjs";

const MAX_STACK = 99;
/** A young tree is a sapling until it is this far to maturity. */
const SAPLING_FRACTION = 0.35;

export type FarmTree = Readonly<{
  plotId: string;
  speciesId: string;
  growthMinutes: number;
  fruitMinutes: number;
  stump: boolean;
  lastFarmMinute: number;
}>;

export type TreeStage = "sapling" | "young" | "mature" | "stump";
export type TreeAction = "pick" | "fell" | "none";

export type TreeStatus = Readonly<{
  stage: TreeStage;
  /** 0..1 toward maturity — or, for a stump, toward growing back. */
  progress: number;
  /** 0..1 toward the next fruit; 0 until a fruit tree is mature and always 0 for timber. */
  fruitProgress: number;
  /** Fruit to pick, or a tree ready to fell. */
  ready: boolean;
  action: TreeAction;
}>;

const finite = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Only plots that exist, one tree per plot, only species the catalog knows, every number bounded by its species. */
export function normalizeFarmTrees(value: unknown, validPlotIds: ReadonlySet<string>): readonly FarmTree[] {
  const seen = new Set<string>();
  const trees: FarmTree[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<FarmTree>;
    const species = findTreeSpecies(row.speciesId);
    if (!species || typeof row.plotId !== "string" || !validPlotIds.has(row.plotId) || seen.has(row.plotId)) continue;
    seen.add(row.plotId);
    const stump = species.kind === "timber" && row.stump === true;
    const growthLimit = stump ? species.regrowMinutes : species.growMinutes;
    trees.push(Object.freeze({
      plotId: row.plotId,
      speciesId: species.id,
      growthMinutes: Math.min(growthLimit, Math.max(0, finite(row.growthMinutes))),
      fruitMinutes: species.kind === "fruit" ? Math.min(species.fruitEveryMinutes, Math.max(0, finite(row.fruitMinutes))) : 0,
      stump,
      lastFarmMinute: Math.max(0, finite(row.lastFarmMinute)),
    }));
  }
  return Object.freeze(trees);
}

/** `span` farm minutes of one tree's life. */
function simulateTree(row: FarmTree, span: number): FarmTree {
  const species = findTreeSpecies(row.speciesId);
  const minutes = Math.max(0, finite(span));
  if (!species || minutes <= 0) return row;
  if (row.stump) {
    const regrown = row.growthMinutes + minutes;
    // A stump that has grown back is a tree ready to fell again.
    if (regrown >= species.regrowMinutes) return { ...row, stump: false, growthMinutes: species.growMinutes, fruitMinutes: 0 };
    return { ...row, growthMinutes: regrown };
  }
  const growing = Math.min(minutes, Math.max(0, species.growMinutes - row.growthMinutes));
  const growthMinutes = row.growthMinutes + growing;
  if (species.kind !== "fruit" || growthMinutes < species.growMinutes) return { ...row, growthMinutes };
  // The rest of the span, once mature, goes toward the next fruit.
  return { ...row, growthMinutes, fruitMinutes: Math.min(species.fruitEveryMinutes, row.fruitMinutes + (minutes - growing)) };
}

function advanceTree(row: FarmTree, now: number): FarmTree {
  const target = finite(now, row.lastFarmMinute);
  return Object.freeze({ ...simulateTree(row, target - row.lastFarmMinute), lastFarmMinute: Math.max(row.lastFarmMinute, target) });
}

export function advanceFarmTrees(trees: readonly FarmTree[], now: number): readonly FarmTree[] {
  return Object.freeze(trees.map((row) => advanceTree(row, now)));
}

/** Bring every tree to `now`, then give it `extraMinutes` more of life without the farm clock moving (time away). */
export function advanceFarmTreesBy(trees: readonly FarmTree[], extraMinutes: number, now: number): readonly FarmTree[] {
  return Object.freeze(trees.map((row) => Object.freeze(simulateTree(advanceTree(row, now), extraMinutes))));
}

export function treeStatus(row: FarmTree, now: number): TreeStatus {
  const current = advanceTree(row, now);
  const species = findTreeSpecies(current.speciesId)!;
  if (current.stump) {
    return Object.freeze({ stage: "stump", progress: Math.min(1, current.growthMinutes / species.regrowMinutes), fruitProgress: 0, ready: false, action: "none" });
  }
  const progress = Math.min(1, current.growthMinutes / species.growMinutes);
  const mature = progress >= 1;
  const stage: TreeStage = mature ? "mature" : progress < SAPLING_FRACTION ? "sapling" : "young";
  const fruitProgress = species.kind === "fruit" && mature ? Math.min(1, current.fruitMinutes / species.fruitEveryMinutes) : 0;
  const ready = species.kind === "fruit" ? fruitProgress >= 1 : mature;
  const action: TreeAction = !ready ? "none" : species.kind === "fruit" ? "pick" : "fell";
  return Object.freeze({ stage, progress, fruitProgress, ready, action });
}

export type TreeActionResult = Readonly<{
  ok: boolean;
  reason: string;
  trees: readonly FarmTree[];
  inventory: FarmInventory;
  /** What a pick or a felling put in the inventory. */
  quantity: number;
}>;

function result(trees: readonly FarmTree[], inventory: FarmInventory, ok: boolean, reason = "", quantity = 0): TreeActionResult {
  return Object.freeze({ ok, reason, trees: Object.freeze([...trees]), inventory, quantity });
}

export function treesOfKind(trees: readonly FarmTree[], kind: TreeKind): number {
  return trees.filter((row) => findTreeSpecies(row.speciesId)?.kind === kind).length;
}

/**
 * Plant a sapling in an empty Tree Plot. `capacity` is how many trees of the
 * sapling's kind may grow at once (farm-capacity.mts) and `level` the skill
 * that sells it; both are refused rather than silently ignored.
 */
export function plantFarmTree(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, speciesId: string, now: number, capacity = Infinity, level = Infinity): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const species = findTreeSpecies(speciesId);
  if (!species) return result(current, inventory, false, "unknown_species");
  if (current.some((row) => row.plotId === plotId)) return result(current, inventory, false, "occupied");
  if ((inventory.saplings[species.id] ?? 0) <= 0) return result(current, inventory, false, "no_saplings");
  if (level < species.minLevel) return result(current, inventory, false, "level_too_low");
  if (treesOfKind(current, species.kind) >= capacity) return result(current, inventory, false, "at_capacity");
  const planted: FarmTree = Object.freeze({ plotId, speciesId: species.id, growthMinutes: 0, fruitMinutes: 0, stump: false, lastFarmMinute: now });
  const saplings = Object.freeze({ ...inventory.saplings, [species.id]: inventory.saplings[species.id]! - 1 });
  return result([...current, planted], Object.freeze({ ...inventory, saplings }), true);
}

/**
 * Pick a fruit tree or fell a timber tree, locally (a signed-out farm; an
 * account farm asks the server, which runs the same rule on its own copy).
 * Picking leaves the tree and starts the next fruit; felling leaves a stump.
 */
export function harvestFarmTree(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, now: number): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const row = current.find((entry) => entry.plotId === plotId);
  if (!row) return result(current, inventory, false, "empty");
  const species = findTreeSpecies(row.speciesId)!;
  const status = treeStatus(row, now);
  if (!status.ready) return result(current, inventory, false, "not_ready");
  const replace = (next: FarmTree) => current.map((entry) => entry === row ? Object.freeze(next) : entry);
  if (species.kind === "fruit") {
    const produce = Object.freeze({ ...inventory.produce, [species.fruitId]: Math.min(MAX_STACK, (inventory.produce[species.fruitId] ?? 0) + species.yield) });
    return result(replace({ ...row, fruitMinutes: 0 }), Object.freeze({ ...inventory, produce }), true, "", species.yield);
  }
  const logs = Object.freeze({ ...inventory.logs, [species.id]: Math.min(MAX_STACK, (inventory.logs[species.id] ?? 0) + species.yield) });
  return result(replace({ ...row, stump: true, growthMinutes: 0, fruitMinutes: 0 }), Object.freeze({ ...inventory, logs }), true, "", species.yield);
}

/** Dig out a stump: nothing comes of it, and the plot is free for another sapling. */
export function digOutStump(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, now: number): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const row = current.find((entry) => entry.plotId === plotId);
  if (!row) return result(current, inventory, false, "empty");
  if (!row.stump) return result(current, inventory, false, "not_a_stump");
  return result(current.filter((entry) => entry !== row), inventory, true);
}

export type TreePlotRow = Readonly<{ instanceId: string; itemId: string; x: number; z: number }>;
export type TreePlotTarget<T extends TreePlotRow = TreePlotRow> = Readonly<{ plot: T; x: number; z: number }>;

/** The nearest Tree Plot close enough and in front of the walking player. */
export function findTreePlotInReach<T extends TreePlotRow>(decor: readonly T[], player: CropPlayerPose, reach = 2.4): TreePlotTarget<T> | null {
  let best: TreePlotTarget<T> | null = null;
  let bestDistance = Infinity;
  const forwardLength = Math.hypot(player.forward.x, player.forward.z) || 1;
  for (const row of decor) {
    if (row.itemId !== TREE_PLOT_ITEM_ID) continue;
    const dx = row.x - player.x;
    const dz = row.z - player.z;
    const distance = Math.hypot(dx, dz);
    const facing = distance < 0.001 ? 1 : (player.forward.x * dx + player.forward.z * dz) / (forwardLength * distance);
    if (distance <= reach && facing >= 0.35 && distance < bestDistance) {
      best = { plot: row, x: row.x, z: row.z };
      bestDistance = distance;
    }
  }
  return best;
}

/** The words for what a tree is doing, for the prompt and the away report. */
export function describeTree(species: TreeSpecies, status: TreeStatus): string {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  if (status.stage === "stump") return `${species.title} stump · growing back ${percent(status.progress)}`;
  if (status.stage !== "mature") return `${species.title} ${status.stage} · ${percent(status.progress)} grown`;
  if (species.kind === "fruit") return status.ready ? `${species.title} · ${species.yield} ${species.fruitPlural.toLowerCase()} ready` : `${species.title} · next fruit ${percent(status.fruitProgress)}`;
  return `${species.title} · ready to fell`;
}
