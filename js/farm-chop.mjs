// Felling a tree: the Woodcutting timing game. PURE — no DOM, no THREE, no
// clock (times are passed in, in seconds), no Math.random (a random source is
// injected) — so the swing maths is tested under node.
//
// Woodcutting is never "hold E until the tree disappears". A marker sweeps
// back and forth across a bar; each press of E swings the axe, and where the
// marker is against the target zone decides the hit:
//
//   perfect  the marker is inside the narrow centre   → PERFECT_DAMAGE
//   good     inside the wider band around it          → GOOD_DAMAGE
//   poor     anywhere else                            → POOR_DAMAGE
//
// A tree's `toughness` (farm-catalog/trees.mts) is how much damage it takes to
// fell. After each swing the zone moves, so the rhythm has to be read again,
// and a short recovery keeps a mashed key from counting as swings. Woodcutting
// level widens both bands a little — consistency, not a shortcut.
//
// What the game decides is only how MUCH swinging a felling takes. What a
// felling yields (logs, XP) is fixed per species and, on an account farm,
// decided by the server — a client that skips the game gains time, never logs.
import { findTreeSpecies } from "./farm-catalog/trees.mjs";
export const PERFECT_DAMAGE = 18;
export const GOOD_DAMAGE = 12;
export const POOR_DAMAGE = 4;
/** Seconds after a swing during which another press is ignored. */
export const SWING_RECOVERY_SECONDS = 0.32;
/** Seconds for the marker to cross the bar and come back. */
export const SWEEP_SECONDS = 1.5;
/** Half-widths of the two bands, as fractions of the bar. Level 99 is about twice level 1. */
export function chopWindows(level) {
    const reached = Math.min(99, Math.max(1, Number.isFinite(level) ? level : 1));
    return Object.freeze({ perfect: 0.04 + 0.0004 * reached, good: 0.12 + 0.0009 * reached });
}
/** Somewhere the whole zone fits on the bar. */
function nextZone(random, windows) {
    const roll = random();
    const unit = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0.5;
    const margin = windows.good + 0.02;
    return margin + unit * (1 - margin * 2);
}
export function startChop(speciesId, level, now, random) {
    const species = findTreeSpecies(speciesId);
    if (!species || species.kind !== "timber")
        return null;
    const windows = chopWindows(level);
    return Object.freeze({
        speciesId: species.id,
        health: species.toughness,
        toughness: species.toughness,
        windows,
        zone: nextZone(random, windows),
        sweepStartedAt: now,
        readyAt: now,
        swings: 0,
        last: null,
    });
}
/** Where the marker is on the bar at `now`: 0 → 1 → 0 over one sweep. */
export function chopMarker(state, now) {
    const phase = (((now - state.sweepStartedAt) / SWEEP_SECONDS) % 1 + 1) % 1;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}
export function chopQualityAt(state, marker) {
    const distance = Math.abs(marker - state.zone);
    if (distance <= state.windows.perfect)
        return "perfect";
    if (distance <= state.windows.good)
        return "good";
    return "poor";
}
const DAMAGE = Object.freeze({ perfect: PERFECT_DAMAGE, good: GOOD_DAMAGE, poor: POOR_DAMAGE });
/** Swing the axe at `now`. The zone moves after every counted swing. */
export function swingAxe(state, now, random) {
    if (state.health <= 0)
        return Object.freeze({ state, quality: null, damage: 0, felled: true });
    if (now < state.readyAt)
        return Object.freeze({ state, quality: null, damage: 0, felled: false });
    const quality = chopQualityAt(state, chopMarker(state, now));
    const damage = DAMAGE[quality];
    const health = Math.max(0, state.health - damage);
    const next = Object.freeze({
        ...state,
        health,
        zone: nextZone(random, state.windows),
        readyAt: now + SWING_RECOVERY_SECONDS,
        swings: state.swings + 1,
        last: quality,
    });
    return Object.freeze({ state: next, quality, damage, felled: health <= 0 });
}
/** The fewest swings a felling can take: every one perfect. */
export function fewestSwings(speciesId) {
    const species = findTreeSpecies(speciesId);
    return species && species.kind === "timber" ? Math.ceil(species.toughness / PERFECT_DAMAGE) : 0;
}
