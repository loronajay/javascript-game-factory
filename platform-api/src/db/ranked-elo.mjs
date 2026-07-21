// Pure ranked ELO + anti-cheat + result-resolution logic.
//
// Everything security-relevant about ranked lives here as pure functions so it can
// be unit-tested without a database: how ratings move, provisional placement,
// same-opponent anti-boost damping, matchmaking windows, rank tiers, and — most
// importantly — decideReport(), which turns two players' attestations into a
// concrete resolution action. db/ranked.mjs is thin orchestration over these.
export const DEFAULT_RATING = 1200;
// Provisional placement: new accounts move fast for their first few games so they
// reach their true rating quickly (this also blunts smurfing), then settle to a
// slower K for stability.
export const PLACEMENT_GAMES = 10;
export const K_PROVISIONAL = 48;
export const K_ESTABLISHED = 24;
// Ranked is locked to a single board so competitive results are comparable.
export const RANKED_BOARD = "13x13";
// Anti-boost / anti-self-play: rating GAINS shrink for repeat matches against the
// same opponent inside a rolling window. Losses are never reduced — you can never
// dodge a loss by farming, so trading wins between two accounts nets nothing.
export const SAME_OPPONENT_WINDOW_HOURS = 24;
// Matches shorter than this many seconds award no rating and no W/L — kills the
// "queue, instantly concede, repeat" farm.
export const MIN_MATCH_SECONDS = 45;
// How long a lone forfeit/win claim waits for the opponent to attest before it
// finalizes. Gives a genuinely disconnected opponent a window to report.
export const FORFEIT_GRACE_SECONDS = 90;
export const VALID_OUTCOMES = Object.freeze(["win", "loss", "draw"]);
export function eloExpected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
export function provisionalK(gamesPlayed) {
    return (Number(gamesPlayed) || 0) < PLACEMENT_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
}
// n = how many resolved ranked matches these two already played in the window,
// BEFORE this one. Multiplies the positive rating delta only.
export function sameOpponentGainFactor(priorMeetings) {
    const n = Number(priorMeetings) || 0;
    if (n <= 0)
        return 1;
    if (n === 1)
        return 0.5;
    if (n === 2)
        return 0.25;
    return 0;
}
// outcomeA: 1 win / 0.5 draw / 0 loss, from player A's perspective.
export function computeRankedRatings({ ratingA, ratingB, outcomeA, kA = K_ESTABLISHED, kB = K_ESTABLISHED, gainFactorA = 1, gainFactorB = 1, }) {
    const eA = eloExpected(ratingA, ratingB);
    const eB = eloExpected(ratingB, ratingA);
    const outcomeB = 1 - outcomeA;
    const rawA = kA * (outcomeA - eA);
    const rawB = kB * (outcomeB - eB);
    const deltaA = rawA > 0 ? rawA * gainFactorA : rawA;
    const deltaB = rawB > 0 ? rawB * gainFactorB : rawB;
    return {
        newRatingA: Math.max(100, Math.round(ratingA + deltaA)),
        newRatingB: Math.max(100, Math.round(ratingB + deltaB)),
        deltaA: Math.round(deltaA),
        deltaB: Math.round(deltaB),
    };
}
// Matchmaking rating tolerance widens the longer a player has waited.
export function ratingWindow(waitSeconds) {
    const base = 100;
    const grown = base + Math.floor((Number(waitSeconds) || 0) / 10) * 50;
    return Math.min(grown, 800);
}
// Two reports, each in that reporter's own perspective. Agree iff they describe the
// same result: one win + one loss, or both draw.
export function reportsAgree(reportA, reportB) {
    if (!reportA || !reportB)
        return false;
    if (reportA === "draw" || reportB === "draw")
        return reportA === "draw" && reportB === "draw";
    return reportA !== reportB;
}
// Convert a single side's own-perspective outcome into A's perspective.
export function toOutcomeA(side, outcome) {
    if (side === "a")
        return outcome;
    if (outcome === "win")
        return "loss";
    if (outcome === "loss")
        return "win";
    return "draw";
}
export function outcomeScoreA(outcomeA) {
    return outcomeA === "win" ? 1 : outcomeA === "draw" ? 0.5 : 0;
}
export const RANK_TIERS = Object.freeze([
    Object.freeze({ id: "bronze", label: "Bronze", min: 0 }),
    Object.freeze({ id: "silver", label: "Silver", min: 1100 }),
    Object.freeze({ id: "gold", label: "Gold", min: 1400 }),
    Object.freeze({ id: "platinum", label: "Platinum", min: 1600 }),
    Object.freeze({ id: "diamond", label: "Diamond", min: 1800 }),
    Object.freeze({ id: "master", label: "Master", min: 2000 }),
    Object.freeze({ id: "grandmaster", label: "Grandmaster", min: 2200 }),
]);
export function rankTier(rating) {
    const r = Number(rating) || 0;
    let tier = RANK_TIERS[0];
    for (const t of RANK_TIERS) {
        if (r >= t.min)
            tier = t;
    }
    return tier;
}
// Deterministic, server-fair choice of who bans first, derived from the server seed
// so neither client can influence it.
export function banFirstIndex(seed) {
    let h = 0;
    const s = String(seed);
    for (let i = 0; i < s.length; i += 1) {
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h & 1;
}
// Core resolver. Given the incoming attestation and the match's current state,
// decide what happens. Never trusts a lone non-loss claim outright — that path only
// arms a grace-timed forfeit. Returns an action the DB layer applies verbatim.
//
// action:
//   'void'            -> no rating, no W/L (too-short match); reason in .reason
//   'resolve'         -> apply ELO with .outcomeA
//   'dispute'         -> reports conflict; no rating; flag for review
//   'forfeit_pending' -> lone win/draw claim; wait for opponent until .deadline
//   'store'           -> first (loss) attestation already resolves; not used for pending waits
export function decideReport({ reporterSide, outcome, existingReportA, existingReportB, matchAgeSeconds, minMatchSeconds = MIN_MATCH_SECONDS, graceSeconds = FORFEIT_GRACE_SECONDS, now, }) {
    if (!VALID_OUTCOMES.includes(outcome)) {
        return { action: "reject", reason: "invalid_outcome" };
    }
    if (reporterSide !== "a" && reporterSide !== "b") {
        return { action: "reject", reason: "not_a_member" };
    }
    const myReport = outcome;
    const otherReport = reporterSide === "a" ? existingReportB : existingReportA;
    if (Number(matchAgeSeconds) < Number(minMatchSeconds)) {
        return { action: "void", reason: "short_match", report: { side: reporterSide, outcome: myReport } };
    }
    if (otherReport) {
        const mineA = toOutcomeA(reporterSide, myReport);
        const otherSide = reporterSide === "a" ? "b" : "a";
        const otherA = toOutcomeA(otherSide, otherReport);
        if (mineA === otherA) {
            return { action: "resolve", outcomeA: mineA, report: { side: reporterSide, outcome: myReport } };
        }
        return { action: "dispute", reason: "report_conflict", report: { side: reporterSide, outcome: myReport } };
    }
    // First attestation for this match.
    if (myReport === "loss") {
        // Safe: nobody lies to lose. Resolve immediately.
        return { action: "resolve", outcomeA: toOutcomeA(reporterSide, myReport), report: { side: reporterSide, outcome: myReport } };
    }
    // Lone win/draw claim: do not trust it yet. Arm a grace-timed forfeit.
    const base = now ? new Date(now).getTime() : Date.now();
    const deadline = new Date(base + Number(graceSeconds) * 1000).toISOString();
    return { action: "forfeit_pending", deadline, report: { side: reporterSide, outcome: myReport } };
}
// A pending_forfeit match whose deadline has passed and whose opponent never
// attested finalizes to the claimer's reported result.
export function decideForfeitFinalize({ reportA, reportB, forfeitDeadline, now }) {
    const claim = reportA || reportB;
    if (!claim)
        return { action: "none" };
    const base = now ? new Date(now).getTime() : Date.now();
    if (!forfeitDeadline || base < new Date(forfeitDeadline).getTime()) {
        return { action: "wait" };
    }
    const side = reportA ? "a" : "b";
    return { action: "resolve", outcomeA: toOutcomeA(side, claim), reason: "forfeit" };
}
