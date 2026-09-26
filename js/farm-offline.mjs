// Offline production: what the farm's PRODUCTION does while its owner is away.
// Pure — no clock, DOM or THREE — so the page, tests and a later server check
// all read one rule.
//
// This is deliberately NOT the farm clock. The clock stays paused while the
// player is away (see resumeFarmClock), so pets never go hungry, age or die off
// screen. Only crops move, at a fraction of active speed and for a capped span.
//
// A farm never progresses until its owner has stepped onto it at least once:
// `checkpointAt` is 0 until the first entry, and 0 means no away time at all.
import { FARM_MINUTES_PER_REAL_SECOND } from "./farm-time.mjs";
import { advanceAgricultureBy, cropStatus, findCrop } from "./farm-crops.mjs";
/** Offline crops grow at a tenth of active speed: one active hour takes ten away. */
export const OFFLINE_PRODUCTION_RATE = 0.1;
/** Only the first real day away counts; three weeks away is not three weeks of harvest. */
export const OFFLINE_CATCH_UP_CAP_MS = 24 * 60 * 60 * 1000;
/** Shorter absences still progress; they just do not interrupt the player with a report. */
export const OFFLINE_REPORT_MIN_MS = 10 * 60 * 1000;
const NO_TIME = Object.freeze({ awayMs: 0, countedMs: 0, farmMinutes: 0 });
export function offlineSpan(checkpointAt, now) {
    if (!Number.isFinite(checkpointAt) || checkpointAt <= 0 || !Number.isFinite(now))
        return NO_TIME;
    const awayMs = Math.max(0, now - checkpointAt);
    const countedMs = Math.min(awayMs, OFFLINE_CATCH_UP_CAP_MS);
    return Object.freeze({ awayMs, countedMs, farmMinutes: (countedMs / 1000) * FARM_MINUTES_PER_REAL_SECOND * OFFLINE_PRODUCTION_RATE });
}
/**
 * Apply an absence to the crops at farm minute `now`, and say what changed.
 * The report is null for an absence too short (or a farm too new) to mention.
 */
export function applyOfflineProduction(agriculture, span, now) {
    if (span.farmMinutes <= 0)
        return Object.freeze({ agriculture, report: null });
    const after = advanceAgricultureBy(agriculture, span.farmMinutes, now);
    const report = span.awayMs >= OFFLINE_REPORT_MIN_MS && agriculture.crops.length
        ? summarizeOfflineProduction(agriculture.crops, after.crops, span, now)
        : null;
    return Object.freeze({ agriculture: after, report });
}
export function formatAwayTime(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    if (days)
        return `${days}d ${hours}h`;
    if (hours)
        return `${hours}h ${rest}m`;
    return `${rest}m`;
}
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const percent = (value) => `${Math.round(value * 100)}%`;
export function summarizeOfflineProduction(before, after, span, now) {
    const key = (row) => `${row.plotId}:${row.cellId}`;
    const earlier = new Map(before.map((row) => [key(row), cropStatus(row, now)]));
    const growth = new Map();
    let ripened = 0;
    let thirsty = 0;
    let wilted = 0;
    const died = { thirst: 0, neglect: 0 };
    for (const row of after) {
        const was = earlier.get(key(row));
        if (!was)
            continue;
        const current = cropStatus(row, now);
        if (current.dead) {
            if (!was.dead && row.diedOf)
                died[row.diedOf] += 1;
            continue;
        }
        if (current.mature && !was.mature)
            ripened += 1;
        if (current.wilted && !was.wilted)
            wilted += 1;
        else if (current.thirsty && !current.wilted)
            thirsty += 1;
        if (!was.dead && !was.mature) {
            const entry = growth.get(row.cropId) ?? { count: 0, before: 0, after: 0 };
            entry.count += 1;
            entry.before += was.progress;
            entry.after += current.progress;
            growth.set(row.cropId, entry);
        }
    }
    const crops = [...growth.entries()]
        .map(([cropId, entry]) => ({ cropId, title: findCrop(cropId)?.title ?? cropId, count: entry.count, before: entry.before / entry.count, after: entry.after / entry.count }))
        // A crop that did not grow is explained by the thirsty/wilted lines, not a "0% → 0%".
        .filter((entry) => entry.after > entry.before)
        .sort((a, b) => a.title.localeCompare(b.title));
    const capped = span.awayMs > span.countedMs;
    const line = (text, tone) => Object.freeze({ text, tone });
    const them = wilted === 1 ? "it" : "them";
    const lines = [
        ...crops.map((entry) => line(`${entry.title}${entry.count > 1 ? ` ×${entry.count}` : ""}: ${percent(entry.before)} → ${percent(entry.after)}`, "info")),
        ...(ripened ? [line(`${plural(ripened, "crop is", "crops are")} ripe and ready to harvest.`, "good")] : []),
        ...(thirsty ? [line(`${plural(thirsty, "crop is", "crops are")} thirsty.`, "warn")] : []),
        ...(wilted ? [line(`${plural(wilted, "crop", "crops")} wilted — water or tend ${them} to save ${them}.`, "warn")] : []),
        ...(died.thirst ? [line(`${plural(died.thirst, "crop", "crops")} died from prolonged dehydration.`, "loss")] : []),
        ...(died.neglect ? [line(`${plural(died.neglect, "crop", "crops")} died after going untended too long.`, "loss")] : []),
        ...(capped ? [line("Only your first 24 hours away count toward growth.", "info")] : []),
    ];
    return Object.freeze({ awayMs: span.awayMs, capped, crops: Object.freeze(crops), ripened, thirsty, wilted, died: Object.freeze(died), lines: Object.freeze(lines) });
}
