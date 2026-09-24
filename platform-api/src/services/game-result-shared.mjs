// Shared field rules for the per-game result normalizers behind
// POST /games/:slug/results (see services/game-result-catalog).
//
// Every normalizer is a trust boundary: a result arrives from a browser, so
// each field is attacker-controlled. These helpers are the parts every game
// judges the same way — the result id, integer bounds, and the rule that a
// payload naming its own payout is refused outright rather than stripped, so
// a client that tries it finds out loudly.
const RESULT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/i;
const CLIENT_AMOUNT_FIELDS = ["tickets", "reward", "rewards", "amount", "price", "payout"];
/** Hard ceiling on any one claimed duration: an idle tab is not play time. */
export const MAX_RESULT_DURATION_MS = 4 * 60 * 60 * 1000;
export function refuse(error) {
    return { error };
}
export function readResultSource(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    return raw;
}
export function namesClientAmount(source) {
    return CLIENT_AMOUNT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(source, field));
}
export function readResultId(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return RESULT_ID_PATTERN.test(id) ? id : "";
}
/** An integer within [min, max], or null. Non-integers are refused, not rounded. */
export function readInt(value, min, max) {
    const number = Number(value);
    if (typeof value !== "number" || !Number.isSafeInteger(number) || number < min || number > max)
        return null;
    return number;
}
/** Duration in ms, clamped to the ceiling; null when missing or negative. */
export function readDurationMs(value) {
    const number = Number(value);
    if (typeof value !== "number" || !Number.isFinite(number) || number < 0)
        return null;
    return Math.min(MAX_RESULT_DURATION_MS, Math.floor(number));
}
export function readChoice(value, choices) {
    return typeof value === "string" && choices.includes(value) ? value : null;
}
