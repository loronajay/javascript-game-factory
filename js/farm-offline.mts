// Offline production: what the farm's PRODUCTION does while its owner is away.
// Pure — no clock, DOM or THREE — so the page, tests and a later server check
// all read one rule.
//
// This is deliberately NOT the farm clock. The clock stays paused while the
// player is away (see resumeFarmClock), so pets never go hungry, age or die off
// screen. Only production moves — crops and the productive trees — at a
// fraction of active speed and for a capped span.
//
// A farm never progresses until its owner has stepped onto it at least once:
// `checkpointAt` is 0 until the first entry, and 0 means no away time at all.

import { FARM_MINUTES_PER_REAL_SECOND } from "./farm-time.mjs";
import { advanceAgricultureBy, cropStatus, findCrop, type CropDeathCause, type FarmAgriculture, type FarmCrop } from "./farm-crops.mjs";
import { advanceFarmTreesBy, treeStatus, type FarmTree } from "./farm-trees.mjs";
import { findTreeSpecies } from "./farm-catalog/trees.mjs";

/** Offline crops grow at a tenth of active speed: one active hour takes ten away. */
export const OFFLINE_PRODUCTION_RATE = 0.1;
/** Only the first real day away counts; three weeks away is not three weeks of harvest. */
export const OFFLINE_CATCH_UP_CAP_MS = 24 * 60 * 60 * 1000;
/** Shorter absences still progress; they just do not interrupt the player with a report. */
export const OFFLINE_REPORT_MIN_MS = 10 * 60 * 1000;

export type OfflineSpan = Readonly<{
  /** Real time since the checkpoint. */
  awayMs: number;
  /** The part of it that counts, after the cap. */
  countedMs: number;
  /** Farm minutes of crop life that buys. */
  farmMinutes: number;
}>;

const NO_TIME: OfflineSpan = Object.freeze({ awayMs: 0, countedMs: 0, farmMinutes: 0 });

export function offlineSpan(checkpointAt: number, now: number): OfflineSpan {
  if (!Number.isFinite(checkpointAt) || checkpointAt <= 0 || !Number.isFinite(now)) return NO_TIME;
  const awayMs = Math.max(0, now - checkpointAt);
  const countedMs = Math.min(awayMs, OFFLINE_CATCH_UP_CAP_MS);
  return Object.freeze({ awayMs, countedMs, farmMinutes: (countedMs / 1000) * FARM_MINUTES_PER_REAL_SECOND * OFFLINE_PRODUCTION_RATE });
}

export type ReportTone = "info" | "good" | "warn" | "loss";
export type ReportLine = Readonly<{ text: string; tone: ReportTone }>;
export type CropReportLine = Readonly<{ cropId: string; title: string; count: number; before: number; after: number }>;
export type OfflineReport = Readonly<{
  awayMs: number;
  capped: boolean;
  crops: readonly CropReportLine[];
  ripened: number;
  thirsty: number;
  wilted: number;
  died: Readonly<Record<Exclude<CropDeathCause, "">, number>>;
  /** Fruit trees that came into fruit, and timber trees that became ready to fell (grown up or grown back). */
  fruitReady: number;
  timberReady: number;
  /** The report as the player reads it, one sentence a line. */
  lines: readonly ReportLine[];
}>;

export type OfflineResult = Readonly<{ agriculture: FarmAgriculture; trees: readonly FarmTree[]; report: OfflineReport | null }>;

/**
 * Apply an absence to the crops and trees at farm minute `now`, and say what
 * changed. The report is null for an absence too short (or a farm too new) to mention.
 */
export function applyOfflineProduction(agriculture: FarmAgriculture, span: OfflineSpan, now: number, trees: readonly FarmTree[] = []): OfflineResult {
  if (span.farmMinutes <= 0) return Object.freeze({ agriculture, trees, report: null });
  const after = advanceAgricultureBy(agriculture, span.farmMinutes, now);
  const grownTrees = advanceFarmTreesBy(trees, span.farmMinutes, now);
  const report = span.awayMs >= OFFLINE_REPORT_MIN_MS && (agriculture.crops.length || trees.length)
    ? summarizeOfflineProduction(agriculture.crops, after.crops, span, now, trees, grownTrees)
    : null;
  return Object.freeze({ agriculture: after, trees: grownTrees, report });
}

export function formatAwayTime(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

export function summarizeOfflineProduction(before: readonly FarmCrop[], after: readonly FarmCrop[], span: OfflineSpan, now: number, treesBefore: readonly FarmTree[] = [], treesAfter: readonly FarmTree[] = []): OfflineReport {
  const key = (row: FarmCrop) => `${row.plotId}:${row.cellId}`;
  const earlier = new Map(before.map((row) => [key(row), cropStatus(row, now)]));
  const growth = new Map<string, { count: number; before: number; after: number }>();
  let ripened = 0;
  let thirsty = 0;
  let wilted = 0;
  const died = { thirst: 0, neglect: 0 };
  for (const row of after) {
    const was = earlier.get(key(row));
    if (!was) continue;
    const current = cropStatus(row, now);
    if (current.dead) {
      if (!was.dead && row.diedOf) died[row.diedOf] += 1;
      continue;
    }
    if (current.mature && !was.mature) ripened += 1;
    if (current.wilted && !was.wilted) wilted += 1;
    else if (current.thirsty && !current.wilted) thirsty += 1;
    if (!was.dead && !was.mature) {
      const entry = growth.get(row.cropId) ?? { count: 0, before: 0, after: 0 };
      entry.count += 1;
      entry.before += was.progress;
      entry.after += current.progress;
      growth.set(row.cropId, entry);
    }
  }
  const crops: CropReportLine[] = [...growth.entries()]
    .map(([cropId, entry]) => ({ cropId, title: findCrop(cropId)?.title ?? cropId, count: entry.count, before: entry.before / entry.count, after: entry.after / entry.count }))
    // A crop that did not grow is explained by the thirsty/wilted lines, not a "0% → 0%".
    .filter((entry) => entry.after > entry.before)
    .sort((a, b) => a.title.localeCompare(b.title));
  // Trees: what came into fruit or became ready to fell, and how far the young ones grew.
  const earlierTrees = new Map(treesBefore.map((row) => [row.plotId, treeStatus(row, now)]));
  const treeGrowth = new Map<string, { count: number; before: number; after: number }>();
  let fruitReady = 0;
  let timberReady = 0;
  for (const row of treesAfter) {
    const was = earlierTrees.get(row.plotId);
    const species = findTreeSpecies(row.speciesId);
    if (!was || !species) continue;
    const current = treeStatus(row, now);
    if (current.ready && !was.ready) {
      if (species.kind === "fruit") fruitReady += 1;
      else timberReady += 1;
      continue;
    }
    // A young tree or a stump growing back: how far it came, measured on the same scale it started on.
    const sameScale = (current.stage === "stump") === (was.stage === "stump");
    if (sameScale && was.stage !== "mature" && current.progress > was.progress) {
      const key = `${species.title}${current.stage === "stump" ? " stump" : ""}`;
      const entry = treeGrowth.get(key) ?? { count: 0, before: 0, after: 0 };
      entry.count += 1;
      entry.before += was.progress;
      entry.after += current.progress;
      treeGrowth.set(key, entry);
    }
  }
  const capped = span.awayMs > span.countedMs;
  const line = (text: string, tone: ReportTone): ReportLine => Object.freeze({ text, tone });
  const them = wilted === 1 ? "it" : "them";
  const lines = [
    ...crops.map((entry) => line(`${entry.title}${entry.count > 1 ? ` ×${entry.count}` : ""}: ${percent(entry.before)} → ${percent(entry.after)}`, "info")),
    ...(ripened ? [line(`${plural(ripened, "crop is", "crops are")} ripe and ready to harvest.`, "good")] : []),
    ...(thirsty ? [line(`${plural(thirsty, "crop is", "crops are")} thirsty.`, "warn")] : []),
    ...(wilted ? [line(`${plural(wilted, "crop", "crops")} wilted — water or tend ${them} to save ${them}.`, "warn")] : []),
    ...(died.thirst ? [line(`${plural(died.thirst, "crop", "crops")} died from prolonged dehydration.`, "loss")] : []),
    ...(died.neglect ? [line(`${plural(died.neglect, "crop", "crops")} died after going untended too long.`, "loss")] : []),
    ...[...treeGrowth.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([title, entry]) => line(`${title}${entry.count > 1 ? ` ×${entry.count}` : ""}: ${percent(entry.before / entry.count)} → ${percent(entry.after / entry.count)} grown`, "info")),
    ...(fruitReady ? [line(`${plural(fruitReady, "fruit tree is", "fruit trees are")} ready to pick.`, "good")] : []),
    ...(timberReady ? [line(`${plural(timberReady, "tree is", "trees are")} ready to fell.`, "good")] : []),
    ...(capped ? [line("Only your first 24 hours away count toward growth.", "info")] : []),
  ];
  return Object.freeze({ awayMs: span.awayMs, capped, crops: Object.freeze(crops), ripened, thirsty, wilted, died: Object.freeze(died), fruitReady, timberReady, lines: Object.freeze(lines) });
}
