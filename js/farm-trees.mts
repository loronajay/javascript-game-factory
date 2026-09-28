// Productive trees: the orchard and the forestry. PURE — no THREE, no DOM, no
// clock — so the page, the tests and (mirrored) the API read one contract.
//
// A tree stands in a Tree Plot (decor `decor.plant.tree-plot`), one tree per
// plot, the way a crop stands in a plot's cell: the decor is WHERE, this row is
// WHAT grows there. Moving the plot in build mode moves the tree; removing the
// plot removes it.
//
// A tree row is:
//   growthMinutes  toward maturity — or, for a felled tree, toward regrowth;
//   fruitMinutes   a fruit tree's progress toward its next crop, once mature;
//   stump          a timber tree has been felled and is growing back;
//   lastFarmMinute the farm minute it was last brought up to date;
// and the same watering record a crop keeps (farm-crops.mts):
//   moistureMinutes water left in its soil; growth (and fruiting) stops at 0;
//   dryMinutes      continuous time dry while it is working toward something;
//   carePenalty     wilting damage, taken off what it gives at its next pick or
//                   felling (then it starts clean — a tree outlives its crops);
//   diedOf          "thirst" once it has died; a dead tree gives nothing and is
//                   dug out onto the compost heap.
//
// A tree is watered exactly like a crop, on the crop's own thirst clock
// (thirsty → wilted → dead, `DRY_CLOCK`). It suffers only while it is WORKING —
// growing up, growing back from a stump, or ripening its next fruit. A tree
// with fruit waiting or a grown timber tree is resting, as a ripe crop is.
// Trees grow offline at the same reduced rate as crops (farm-offline.mts),
// where thirst can wilt them but never kill them, and nothing is ever picked
// or felled for the player. Picking and felling on an account farm are the server's decision
// (platform-api db/farm-economy.mts `harvestFarmTree`); the local functions here
// are for signed-out farms and for what the page shows.

import { TREE_PLOT_ITEM_ID, findTreeSpecies, type TreeKind, type TreeSpecies } from "./farm-catalog/trees.mjs";
import { DEATH_DRY_MINUTES, DRY_CLOCK, MAX_CARE_PENALTY, MOISTURE_CAPACITY_MINUTES, WILT_DRY_MINUTES, accrueStress, type CropCondition, type CropPlayerPose, type FarmInventory } from "./farm-crops.mjs";

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
  moistureMinutes: number;
  dryMinutes: number;
  carePenalty: number;
  diedOf: "" | "thirst";
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
  /** Working toward something (growing, regrowing, ripening) with a dry soil: it needs water. */
  thirsty: boolean;
  /** Its soil still holds water (shown as dark, wet mulch). */
  moist: boolean;
  wilted: boolean;
  dead: boolean;
  condition: CropCondition;
  /** What a pick or a felling would give now, after any wilting (0 until ready, 0 when dead). */
  harvestYield: number;
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
      // A tree saved before trees drank starts dry, with its whole grace ahead of it.
      moistureMinutes: Math.min(MOISTURE_CAPACITY_MINUTES, Math.max(0, finite(row.moistureMinutes))),
      dryMinutes: Math.min(DEATH_DRY_MINUTES, Math.max(0, finite(row.dryMinutes))),
      carePenalty: Math.min(MAX_CARE_PENALTY, Math.max(0, finite(row.carePenalty))),
      diedOf: row.diedOf === "thirst" ? "thirst" : "",
    }));
  }
  return Object.freeze(trees);
}

/** Resting: fruit waiting to be picked, or a grown timber tree waiting for the axe. It neither works nor thirsts. */
function resting(row: FarmTree, species: TreeSpecies): boolean {
  if (row.stump || row.growthMinutes < species.growMinutes) return false;
  return species.kind === "timber" || row.fruitMinutes >= species.fruitEveryMinutes;
}

/**
 * `span` farm minutes of one tree's life. While its soil holds water it grows
 * (or regrows, or ripens its fruit); once the soil is dry that stops, and if it
 * still had work to do it suffers on the crop's thirst clock.
 */
function simulateTree(row: FarmTree, span: number, lethal = true): FarmTree {
  const species = findTreeSpecies(row.speciesId);
  const minutes = Math.max(0, finite(span));
  if (!species || minutes <= 0 || row.diedOf) return row;
  const wet = Math.min(minutes, row.moistureMinutes);
  let next: FarmTree = { ...growTree(row, species, wet), moistureMinutes: Math.max(0, row.moistureMinutes - minutes) };
  const dry = minutes - wet;
  if (dry > 0 && !resting(next, species)) next = accrueStress(next, dry, [DRY_CLOCK], lethal);
  return next;
}

/** `minutes` of watered growth. */
function growTree(row: FarmTree, species: TreeSpecies, minutes: number): FarmTree {
  if (minutes <= 0) return row;
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

/**
 * Bring every tree to `now`, then give it `extraMinutes` more of life without
 * the farm clock moving (time away). Like a crop, thirst while away can wilt a
 * tree but never kill it (farm-crops.mts OFFLINE_RESCUE_MINUTES).
 */
export function advanceFarmTreesBy(trees: readonly FarmTree[], extraMinutes: number, now: number): readonly FarmTree[] {
  return Object.freeze(trees.map((row) => Object.freeze(simulateTree(advanceTree(row, now), extraMinutes, false))));
}

/** What a ready tree gives: the species' yield less its wilting, never below one. Nothing when dead. */
export function treeHarvestYield(row: FarmTree): number {
  const species = findTreeSpecies(row.speciesId);
  if (!species || row.diedOf) return 0;
  return Math.max(1, Math.round(species.yield * (1 - Math.min(MAX_CARE_PENALTY, row.carePenalty))));
}

export function treeStatus(row: FarmTree, now: number): TreeStatus {
  const current = advanceTree(row, now);
  const species = findTreeSpecies(current.speciesId)!;
  const dead = Boolean(current.diedOf);
  const working = !dead && !resting(current, species);
  const thirsty = working && current.moistureMinutes <= 0;
  const wilted = working && current.dryMinutes >= WILT_DRY_MINUTES;
  const care = { thirsty, moist: !dead && current.moistureMinutes > 0, wilted, dead, condition: (dead ? "dead" : wilted ? "wilted" : thirsty ? "thirsty" : "healthy") as CropCondition };
  if (current.stump) {
    return Object.freeze({ stage: "stump", progress: Math.min(1, current.growthMinutes / species.regrowMinutes), fruitProgress: 0, ready: false, action: "none", ...care, harvestYield: 0 });
  }
  const progress = Math.min(1, current.growthMinutes / species.growMinutes);
  const mature = progress >= 1;
  const stage: TreeStage = mature ? "mature" : progress < SAPLING_FRACTION ? "sapling" : "young";
  const fruitProgress = species.kind === "fruit" && mature ? Math.min(1, current.fruitMinutes / species.fruitEveryMinutes) : 0;
  const ready = !dead && (species.kind === "fruit" ? fruitProgress >= 1 : mature);
  const action: TreeAction = !ready ? "none" : species.kind === "fruit" ? "pick" : "fell";
  return Object.freeze({ stage, progress, fruitProgress, ready, action, ...care, harvestYield: ready ? treeHarvestYield(current) : 0 });
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
  const planted: FarmTree = Object.freeze({
    plotId, speciesId: species.id, growthMinutes: 0, fruitMinutes: 0, stump: false, lastFarmMinute: now,
    moistureMinutes: 0, dryMinutes: 0, carePenalty: 0, diedOf: "",
  });
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
  if (row.diedOf) return result(current, inventory, false, "dead");
  const species = findTreeSpecies(row.speciesId)!;
  const status = treeStatus(row, now);
  if (!status.ready) return result(current, inventory, false, "not_ready");
  const amount = treeHarvestYield(row);
  const replace = (next: FarmTree) => current.map((entry) => entry === row ? Object.freeze(next) : entry);
  // Wilting cost this harvest; the next fruit (or the stump's regrowth) starts clean.
  if (species.kind === "fruit") {
    const produce = Object.freeze({ ...inventory.produce, [species.fruitId]: Math.min(MAX_STACK, (inventory.produce[species.fruitId] ?? 0) + amount) });
    return result(replace({ ...row, fruitMinutes: 0, carePenalty: 0 }), Object.freeze({ ...inventory, produce }), true, "", amount);
  }
  const logs = Object.freeze({ ...inventory.logs, [species.id]: Math.min(MAX_STACK, (inventory.logs[species.id] ?? 0) + amount) });
  return result(replace({ ...row, stump: true, growthMinutes: 0, fruitMinutes: 0, carePenalty: 0 }), Object.freeze({ ...inventory, logs }), true, "", amount);
}

/** Water a living tree: its soil fills and its dry spell ends. A dead tree cannot be watered back. */
export function waterFarmTree(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, now: number): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const row = current.find((entry) => entry.plotId === plotId);
  if (!row) return result(current, inventory, false, "empty");
  if (row.diedOf) return result(current, inventory, false, "dead");
  return result(current.map((entry) => entry === row ? Object.freeze({ ...row, moistureMinutes: MOISTURE_CAPACITY_MINUTES, dryMinutes: 0 }) : entry), inventory, true);
}

/** Dig out a tree that died of thirst: it gives nothing, goes on the compost heap (one compost) and frees the plot. */
export function clearDeadFarmTree(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, now: number): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const row = current.find((entry) => entry.plotId === plotId);
  if (!row) return result(current, inventory, false, "empty");
  if (!row.diedOf) return result(current, inventory, false, "alive");
  return result(current.filter((entry) => entry !== row), Object.freeze({ ...inventory, compost: Math.min(MAX_STACK, inventory.compost + 1) }), true);
}

/** Dig out a stump: nothing comes of it, and the plot is free for another sapling. */
export function digOutStump(trees: readonly FarmTree[], inventory: FarmInventory, plotId: string, now: number): TreeActionResult {
  const current = advanceFarmTrees(trees, now);
  const row = current.find((entry) => entry.plotId === plotId);
  if (!row) return result(current, inventory, false, "empty");
  if (!row.stump || row.diedOf) return result(current, inventory, false, "not_a_stump");
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
  if (status.dead) return `The ${species.title} ${status.stage === "stump" ? "stump " : ""}died of thirst`;
  const care = status.wilted ? " · wilting" : status.thirsty ? " · thirsty" : "";
  if (status.stage === "stump") return `${species.title} stump · growing back ${percent(status.progress)}${care}`;
  if (status.stage !== "mature") return `${species.title} ${status.stage} · ${percent(status.progress)} grown${care}`;
  if (species.kind === "fruit") return status.ready ? `${species.title} · ${status.harvestYield} ${species.fruitPlural.toLowerCase()} ready` : `${species.title} · next fruit ${percent(status.fruitProgress)}${care}`;
  return `${species.title} · ready to fell`;
}
