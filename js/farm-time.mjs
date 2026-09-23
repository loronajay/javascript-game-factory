// The farm clock and its daylight envelope. Pure on purpose: crops and other
// time-based systems can consume the same minutes later without depending on
// THREE, the page, or a wall clock.
export const DAY_MINUTES = 24 * 60;
export const CLOCK_QUARTER_MINUTES = 15;
export const FARM_MINUTES_PER_REAL_SECOND = DAY_MINUTES / (60 * 60);
/** A six-hour nap completes in 2.5 seconds, long enough to watch the sky move. */
export const NAP_MINUTES_PER_REAL_SECOND = 144;
/** Restore absolute farm time. Whole days are retained for crop growth; display helpers wrap them. */
export function resumeFarmClock(clock, now) {
    const current = Number.isFinite(now) ? Math.max(0, now) : 0;
    const savedMinutes = Number.isFinite(clock.farmMinutes) ? Math.max(0, clock.farmMinutes) : 8 * 60;
    const savedAt = Number.isFinite(clock.updatedAt) ? Math.max(0, clock.updatedAt) : 0;
    if (savedAt <= 0 || current <= savedAt)
        return Object.freeze({ farmMinutes: savedMinutes, updatedAt: current });
    return Object.freeze({ farmMinutes: savedMinutes + ((current - savedAt) / 1000) * FARM_MINUTES_PER_REAL_SECOND, updatedAt: current });
}
function wrapMinutes(minutes) {
    const finite = Number.isFinite(minutes) ? minutes : 0;
    return ((finite % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}
export function advanceFarmTime(minutes, realSeconds, rate = FARM_MINUTES_PER_REAL_SECOND) {
    const seconds = Number.isFinite(realSeconds) ? Math.max(0, realSeconds) : 0;
    const speed = Number.isFinite(rate) ? Math.max(0, rate) : FARM_MINUTES_PER_REAL_SECOND;
    return wrapMinutes(minutes + seconds * speed);
}
export function quantizeFarmTime(minutes) {
    return Math.floor(wrapMinutes(minutes) / CLOCK_QUARTER_MINUTES) * CLOCK_QUARTER_MINUTES;
}
export function formatFarmTime(minutes) {
    const quarter = quantizeFarmTime(minutes);
    const hour24 = Math.floor(quarter / 60);
    const minute = quarter % 60;
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}
const KEYFRAMES = Object.freeze([
    { minute: 0, horizon: 0x10182c, zenith: 0x030711, fog: 0x10182c, sunColor: 0xffd7ad, moonColor: 0xbfd8ff, sun: 0, moon: 0.8, hemisphere: 0.2, stars: 1 },
    { minute: 300, horizon: 0x18243c, zenith: 0x081226, fog: 0x18243c, sunColor: 0xffb56b, moonColor: 0xbfd8ff, sun: 0, moon: 0.7, hemisphere: 0.22, stars: 0.95 },
    { minute: 360, horizon: 0xd67d68, zenith: 0x344f7c, fog: 0x8f6b70, sunColor: 0xffa45b, moonColor: 0xcfe0ff, sun: 0.22, moon: 0.35, hemisphere: 0.45, stars: 0.55 },
    { minute: 480, horizon: 0xdbe9f4, zenith: 0x5aa0e0, fog: 0xdbe9f4, sunColor: 0xfff1d6, moonColor: 0xdce9ff, sun: 2.25, moon: 0, hemisphere: 1, stars: 0 },
    { minute: 720, horizon: 0xe8f2f6, zenith: 0x4f9cdf, fog: 0xdbe9f4, sunColor: 0xfff5df, moonColor: 0xdce9ff, sun: 2.6, moon: 0, hemisphere: 1.08, stars: 0 },
    { minute: 1050, horizon: 0xdbe9f4, zenith: 0x5a91cf, fog: 0xdbe9f4, sunColor: 0xffe4bd, moonColor: 0xdce9ff, sun: 2.1, moon: 0, hemisphere: 0.95, stars: 0 },
    { minute: 1140, horizon: 0xd86f58, zenith: 0x35436f, fog: 0x8f6266, sunColor: 0xff9b54, moonColor: 0xcbdcff, sun: 0.25, moon: 0.3, hemisphere: 0.42, stars: 0.25 },
    { minute: 1230, horizon: 0x17223a, zenith: 0x060b19, fog: 0x17223a, sunColor: 0xffb46a, moonColor: 0xbfd8ff, sun: 0, moon: 0.72, hemisphere: 0.22, stars: 0.9 },
    { minute: DAY_MINUTES, horizon: 0x10182c, zenith: 0x030711, fog: 0x10182c, sunColor: 0xffd7ad, moonColor: 0xbfd8ff, sun: 0, moon: 0.8, hemisphere: 0.2, stars: 1 },
]);
function mix(a, b, amount) {
    return a + (b - a) * amount;
}
function mixColor(a, b, amount) {
    const channel = (shift) => Math.round(mix((a >> shift) & 255, (b >> shift) & 255, amount));
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
function phaseAt(minutes) {
    if (minutes < 330 || minutes >= 1230)
        return "night";
    if (minutes < 480)
        return "dawn";
    if (minutes < 1080)
        return "day";
    return "dusk";
}
/** A smooth rendering profile; the visible clock itself remains quarter-hour based. */
export function farmLightProfile(minutes) {
    const minute = wrapMinutes(minutes);
    const after = KEYFRAMES.findIndex((frame) => frame.minute > minute);
    const right = KEYFRAMES[Math.max(1, after)];
    const left = KEYFRAMES[Math.max(0, after - 1)];
    const amount = (minute - left.minute) / Math.max(1, right.minute - left.minute);
    const sunAngle = ((minute - 360) / 720) * Math.PI;
    return Object.freeze({
        phase: phaseAt(minute),
        horizon: mixColor(left.horizon, right.horizon, amount),
        zenith: mixColor(left.zenith, right.zenith, amount),
        fog: mixColor(left.fog, right.fog, amount),
        sunColor: mixColor(left.sunColor, right.sunColor, amount),
        moonColor: mixColor(left.moonColor, right.moonColor, amount),
        sun: mix(left.sun, right.sun, amount),
        moon: mix(left.moon, right.moon, amount),
        hemisphere: mix(left.hemisphere, right.hemisphere, amount),
        stars: mix(left.stars, right.stars, amount),
        sunHeight: Math.sin(sunAngle),
    });
}
