// How much farm time a save may claim. Pure: no clock of its own (the caller
// passes `now`), no database.
//
// The farm clock is run by the client, so on its own it could be set to
// anything — and crop growth, and therefore every harvest, follows it. This is
// the bound. Between two saves the clock may advance by:
//
//   real seconds × ACTIVE_RATE        (walking the farm: one farm day per real hour)
// + whatever the NAP BANK can pay      (naps: the bank refills 18 farm hours per real
//                                       day and holds at most 24)
//
// and never backwards. Crops may then grow by no more than their own farm-time
// stamp moved inside that verified clock, plus the most offline production could
// have given them over the same real interval. Mirrors js/farm-time.mts,
// js/farm-nap-bank.mts and js/farm-offline.mts (held together by tests).
export const ACTIVE_FARM_MINUTES_PER_SECOND = 0.4;
/** A little slack on the active rate for request timing; multiplicative, so it cannot be farmed by saving often. */
export const ACTIVE_RATE_SLACK = 1.02;
export const NAP_BANK_CAPACITY_MINUTES = 24 * 60;
export const NAP_BANK_REFILL_MINUTES_PER_REAL_DAY = 18 * 60;
export const OFFLINE_PRODUCTION_RATE = 0.1;
export const OFFLINE_CATCH_UP_CAP_SECONDS = 24 * 60 * 60;
const REAL_DAY_SECONDS = 24 * 60 * 60;
const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
/**
 * Verify a submitted clock against the stored one. `storedAt` is when the
 * stored clock was verified (server time); with no stored clock at all this is
 * the farm's first save, which becomes the baseline and may claim no growth.
 */
export function verifyFarmClock(stored, storedAt, submittedMinutes, now) {
    const claimed = Math.max(0, finite(submittedMinutes, 480));
    if (!stored || storedAt === null) {
        return Object.freeze({ farmMinutes: claimed, napBank: NAP_BANK_CAPACITY_MINUTES, verifiedAt: now, elapsedSeconds: 0, clamped: false });
    }
    const previous = Math.max(0, finite(stored.farmMinutes, 480));
    const elapsedSeconds = Math.max(0, (now - storedAt) / 1000);
    const bank = Math.min(NAP_BANK_CAPACITY_MINUTES, Math.max(0, finite(stored.napBank, NAP_BANK_CAPACITY_MINUTES)) + (elapsedSeconds / REAL_DAY_SECONDS) * NAP_BANK_REFILL_MINUTES_PER_REAL_DAY);
    const active = elapsedSeconds * ACTIVE_FARM_MINUTES_PER_SECOND * ACTIVE_RATE_SLACK;
    // Time on the farm never runs backwards; a stale client copy just keeps the stored clock.
    const advance = Math.max(0, claimed - previous);
    const napped = Math.max(0, advance - active);
    if (napped <= bank) {
        return Object.freeze({ farmMinutes: previous + advance, napBank: bank - napped, verifiedAt: now, elapsedSeconds, clamped: false });
    }
    return Object.freeze({ farmMinutes: previous + active + bank, napBank: 0, verifiedAt: now, elapsedSeconds, clamped: true });
}
/** The most growth offline production could have added over `elapsedSeconds` of real time. */
export function offlineGrowthAllowance(elapsedSeconds) {
    return Math.min(Math.max(0, elapsedSeconds), OFFLINE_CATCH_UP_CAP_SECONDS) * ACTIVE_FARM_MINUTES_PER_SECOND * OFFLINE_PRODUCTION_RATE;
}
const cropKey = (row) => `${row.plotId}:${row.cellId}:${row.cropId}`;
/**
 * Bound each submitted crop against what is stored. A crop's own stamp
 * (`lastFarmMinute`) may only move forward and never past the verified clock;
 * its growth may rise by no more than that stamp moved plus the offline
 * allowance. A crop planted since the stored save counts from the stored
 * clock. Death is permanent and the care penalty never falls.
 */
export function boundCropGrowth(crops, storedCrops, storedClockMinutes, verified, growLimit) {
    const stored = new Map(storedCrops.map((row) => [cropKey(row), row]));
    const offline = offlineGrowthAllowance(verified.elapsedSeconds);
    const ceiling = verified.farmMinutes;
    return crops.map((row) => {
        const previous = stored.get(cropKey(row));
        const floorStamp = previous ? finite(previous.lastFarmMinute, 0) : storedClockMinutes;
        const stamp = Math.min(Math.max(finite(row.lastFarmMinute, floorStamp), floorStamp), Math.max(floorStamp, ceiling));
        const base = previous ? Math.max(0, finite(previous.growthMinutes, 0)) : 0;
        const growth = Math.min(finite(row.growthMinutes, 0), base + (stamp - floorStamp) + offline, growLimit(row.cropId));
        return {
            ...row,
            lastFarmMinute: stamp,
            growthMinutes: Math.max(0, growth),
            carePenalty: Math.max(finite(row.carePenalty, 0), previous ? finite(previous.carePenalty, 0) : 0),
            // A crop's stress only ever accrues, and compost once worked in stays: both decide its grade.
            stressMinutes: Math.max(finite(row.stressMinutes, 0), previous ? finite(previous.stressMinutes, 0) : 0),
            fertilized: row.fertilized === true || previous?.fertilized === true,
            diedOf: previous?.diedOf || row.diedOf || "",
        };
    });
}
