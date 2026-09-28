// Fishing: the minigame. PURE — no DOM, no THREE, no clock (every step is
// handed its dt, in seconds, at the page's fixed 60 Hz), no Math.random (a
// random source is injected), so a whole fight is played out under node.
//
// A catch is five beats, and each is a skill, not a wait:
//
//   CAST    hold to draw the rod back; a power meter swings, release to cast.
//           Where the lure lands decides the water — and whether a shadow sees it.
//   WAIT    the bobber sits. Nibbles dip it; striking at a nibble spooks the
//           fish. The BITE is a hard pull with a short window: strike (press)
//           inside it or the bait is stolen.
//   FIGHT   a line-tension gauge with a safe band. Hold to reel: the fish
//           comes in and the tension rises. Let go: the fish runs and takes
//           line. Over the top the line snaps; slack too long and the hook is
//           thrown. The fish pulls left or right — steer against it (A/D) and
//           it tires faster. Tension kept inside the band is what tires it.
//           How it pulls is its style (farm-catalog/fish.mts), and how HARD is
//           its strength, which grows with its size: a Trophy fights harder.
//   NET     tired and at the rod, it comes to the net: press as the closing
//           ring crosses the mark. A miss and it finds its second wind.
//   GRADE   how clean the whole fight was — time in the band, near snaps, the
//           net — is the fish's grade, Poor to Perfect.
//
// This file decides only WHETHER a fish is landed and HOW CLEANLY. What the
// fish is — species, weight, colour — was decided by the server at the bite
// and never changes here (farm-fish.mts; planning-docs/FARM_FISHING_PLAN.md §5.5).
// ---------------------------------------------------------------- the cast
/** Seconds for the power meter to swing from empty to full and back. */
export const CAST_SWING_SECONDS = 1.6;
/** The power meter at `held` seconds of holding: 0 → 1 → 0, eased so the top is a short moment. */
export function castPower(heldSeconds) {
    const phase = ((Math.max(0, heldSeconds) / CAST_SWING_SECONDS) % 1 + 1) % 1;
    const linear = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    return Math.sin(linear * Math.PI / 2);
}
/** How long a strike window lasts: shorter for a stronger fish. */
export function strikeWindowFor(strength) {
    return Math.max(0.36, 0.72 - Math.min(1.2, Math.max(0, strength)) * 0.3);
}
/** A few nibbles between the landing and the bite, none too close to it. Drawn from `random`. */
export function planWait(biteAt, strength, random) {
    const nibbles = [];
    const count = biteAt > 3 ? 1 + Math.floor(random() * 3) : biteAt > 1.6 ? 1 : 0;
    for (let index = 0; index < count; index += 1) {
        const at = 0.8 + random() * Math.max(0.2, biteAt - 1.6);
        if (biteAt - at > 0.9)
            nibbles.push(Number(at.toFixed(3)));
    }
    nibbles.sort((a, b) => a - b);
    return Object.freeze({ biteAt, strikeWindow: strikeWindowFor(strength), nibbles: Object.freeze(nibbles) });
}
/** What a strike at `seconds` after the landing does. */
export function strikeAt(plan, seconds) {
    if (seconds < plan.biteAt)
        return "early";
    if (seconds <= plan.biteAt + plan.strikeWindow)
        return "hooked";
    return "late";
}
/** How far down the bobber is at `seconds`: 0 floating, up to 1 at the bite's pull. For drawing. */
export function bobberDip(plan, seconds) {
    for (const at of plan.nibbles) {
        const since = seconds - at;
        if (since >= 0 && since < 0.35)
            return 0.35 * Math.sin((since / 0.35) * Math.PI);
    }
    const since = seconds - plan.biteAt;
    if (since >= 0 && since <= plan.strikeWindow)
        return 1;
    return 0;
}
// ---------------------------------------------------------------- the fight
/** Tension is 0..1 on the gauge; the line snaps at 1. */
export const SNAP = 1;
/** Below this the line is slack; this long slack and the hook comes out. */
export const SLACK = 0.07;
export const SLACK_SECONDS = 2.2;
/** A near-snap: the gauge in the red. Each one costs the grade. */
export const RED_LINE = 0.93;
/** The fish is at the rod inside this, and comes to the net if it is tired enough. */
export const NET_DISTANCE = 1.6;
export const NET_STAMINA = 0.3;
/** How much line the reel holds past a full cast before it runs out and parts. */
export const SPARE_LINE = 14;
/** Tension from cranking the reel, a second, before the fish's pull. */
const REEL_TENSION = 0.5;
/** Tension falling away a second with the reel still. */
const RELAX = 0.75;
/** How fast a running fish takes line, metres a second at full pull. */
const RUN_SPEED = 2.4;
export function fightBand(level, rod) {
    const reached = Math.min(99, Math.max(1, Number.isFinite(level) ? level : 1));
    const spread = 0.0012 * reached + 0.06 * (rod.line - 1);
    return Object.freeze({ low: Math.max(0.2, 0.34 - spread / 2), high: Math.min(0.86, 0.7 + spread / 2) });
}
export function startFight(params, random) {
    return Object.freeze({
        phase: "fighting",
        params,
        band: fightBand(params.level, params.rod),
        tension: 0.4,
        stamina: 1,
        distance: Math.max(NET_DISTANCE + 1, params.distance),
        pullSide: random() < 0.5 ? -1 : 1,
        sideChangeAt: 1.5 + random() * 2.5,
        effort: 1,
        effortUntil: 0,
        leapUntil: 0,
        bowed: false,
        slackFor: 0,
        elapsed: 0,
        inBand: 0,
        nearSnaps: 0,
        wasRed: false,
        netStartedAt: 0,
        netMisses: 0,
        netQuality: null,
    });
}
/** Seconds a style holds an effort, and what effort it picks next. */
function nextEffort(style, random) {
    const roll = random();
    switch (style) {
        case "darter":
            // Mostly easy, then a sudden short sprint.
            return roll < 0.35 ? { effort: 1.9, seconds: 0.5 + random() * 0.5, leap: false } : { effort: 0.6, seconds: 1 + random() * 1.8, leap: false };
        case "diver":
            // Long steady runs down, then a breather.
            return roll < 0.5 ? { effort: 1.45, seconds: 2 + random() * 1.5, leap: false } : { effort: 0.55, seconds: 1.2 + random(), leap: false };
        case "thrasher":
            // Never still: short jittery spikes.
            return { effort: 0.5 + random() * 1.3, seconds: 0.18 + random() * 0.3, leap: false };
        case "sulker":
            // Heavy and slow; hardly pulls, but its stamina lasts (see drain).
            return { effort: 0.55 + random() * 0.35, seconds: 1.5 + random() * 2, leap: false };
        case "leaper":
            return roll < 0.3 ? { effort: 0.9, seconds: 0.75, leap: true } : { effort: 0.8, seconds: 1 + random() * 1.4, leap: false };
    }
}
/** How fast a fish tires in the band, a second: slower for a stronger fish, much slower for a sulker. */
export function staminaDrain(style, strength) {
    const base = 0.11 / (0.45 + Math.max(0, strength));
    return style === "sulker" ? base * 0.62 : base;
}
/** Steering against the pull tires the fish this much faster. */
export const STEER_BONUS = 0.5;
/**
 * The fewest seconds a fight with this fish can take: every second in the
 * band, steering against it the whole way. The server will not accept a
 * landing sooner than this after the bite (platform-api's farm-fish-catalog).
 */
export function minimumFightSeconds(style, strength) {
    return (1 - NET_STAMINA) / (staminaDrain(style, strength) * (1 + STEER_BONUS));
}
/** One fixed step of the fight. */
export function stepFight(state, input, dt, random) {
    if (state.phase !== "fighting")
        return state;
    const { params } = state;
    const elapsed = state.elapsed + dt;
    let { effort, effortUntil, leapUntil, bowed, pullSide, sideChangeAt } = state;
    if (elapsed >= effortUntil) {
        const next = nextEffort(params.style, random);
        effort = next.effort;
        effortUntil = elapsed + next.seconds;
        if (next.leap) {
            leapUntil = elapsed + next.seconds;
            bowed = false;
        }
    }
    if (elapsed >= sideChangeAt) {
        pullSide = -pullSide;
        sideChangeAt = elapsed + 1.4 + random() * 2.6;
    }
    const leaping = elapsed < leapUntil;
    if (leaping && input.bow)
        bowed = true;
    // A tired fish pulls less; the strength scales it all.
    const pull = params.strength * effort * (0.35 + 0.65 * state.stamina);
    const line = Math.max(0.6, params.rod.line);
    let tension = state.tension;
    let distance = state.distance;
    if (input.reel) {
        tension += ((REEL_TENSION + pull * 0.9) / line) * dt;
        distance += (-params.rod.reel + pull * RUN_SPEED * 0.3) * dt;
    }
    else {
        tension += (-RELAX + (pull * 0.75) / line) * dt;
        distance += pull * RUN_SPEED * dt;
    }
    // A leap the rod was not bowed to yanks the line.
    if (leaping && !bowed)
        tension += (0.55 / line) * dt;
    const steer = Math.sign(input.steer);
    const against = steer !== 0 && steer === -pullSide;
    const withIt = steer !== 0 && steer === pullSide;
    if (against)
        tension += (0.08 / line) * dt;
    tension = Math.max(0, tension);
    distance = Math.max(0, distance);
    const inside = tension >= state.band.low && tension <= state.band.high;
    let stamina = state.stamina;
    const drain = staminaDrain(params.style, params.strength);
    if (inside)
        stamina -= drain * (1 + (against ? STEER_BONUS : 0) + (leaping && bowed ? 0.4 : 0)) * dt;
    else
        stamina -= drain * 0.15 * dt;
    if (withIt)
        stamina += drain * 0.2 * dt;
    stamina = Math.min(1, Math.max(0, stamina));
    const red = tension >= RED_LINE;
    const nearSnaps = state.nearSnaps + (red && !state.wasRed ? 1 : 0);
    const slackFor = tension < SLACK ? state.slackFor + dt : 0;
    let phase = "fighting";
    if (tension >= SNAP)
        phase = "snapped";
    else if (distance > params.rod.castRange + SPARE_LINE)
        phase = "snapped";
    else if (slackFor >= SLACK_SECONDS)
        phase = "thrown";
    else if (distance <= NET_DISTANCE && stamina <= NET_STAMINA)
        phase = "netting";
    return Object.freeze({
        ...state,
        phase,
        tension: Math.min(SNAP, tension),
        stamina,
        distance,
        pullSide,
        sideChangeAt,
        effort,
        effortUntil,
        leapUntil,
        bowed,
        slackFor,
        elapsed,
        inBand: state.inBand + (inside ? dt : 0),
        nearSnaps,
        wasRed: red,
        netStartedAt: phase === "netting" ? elapsed : state.netStartedAt,
    });
}
/** True while a leaper is in the air and the rod has not been bowed to it: the moment to press. */
export function leapPending(state) {
    return state.elapsed < state.leapUntil && !state.bowed;
}
// ---------------------------------------------------------------- the net
/** Seconds for the net's ring to close from wide to shut; the mark is where a press lands it. */
export const NET_CLOSE_SECONDS = 1.3;
export const NET_MARK = 0.35;
export const NET_PERFECT = 0.06;
export const NET_GOOD = 0.16;
/** The ring's size at `seconds` since the net began: 1 wide open, closing to 0, then opening again. */
export function netRing(state, seconds) {
    const phase = ((seconds - state.netStartedAt) / NET_CLOSE_SECONDS) % 2;
    return phase < 1 ? 1 - phase : phase - 1;
}
/** Press the net at `seconds`. A hit lands the fish; a miss gives it back some fight. */
export function pressNet(state, seconds) {
    if (state.phase !== "netting")
        return state;
    const off = Math.abs(netRing(state, seconds) - NET_MARK);
    if (off <= NET_GOOD) {
        return Object.freeze({ ...state, phase: "landed", netQuality: off <= NET_PERFECT ? "perfect" : "good", elapsed: seconds });
    }
    // Its second wind: back out a way, fresher, the fight goes on.
    return Object.freeze({
        ...state,
        phase: "fighting",
        stamina: Math.min(1, state.stamina + 0.28),
        distance: state.distance + 2.5,
        netMisses: state.netMisses + 1,
        elapsed: seconds,
        effortUntil: seconds,
    });
}
/** The fish in the net sits there while the ring closes; time passes on the fight's clock. */
export function holdNet(state, dt) {
    if (state.phase !== "netting")
        return state;
    return Object.freeze({ ...state, elapsed: state.elapsed + dt });
}
// ---------------------------------------------------------------- the grade
/** 0..1: how clean the fight was. */
export function fightScore(state) {
    const fighting = Math.max(0.001, state.elapsed);
    const band = Math.min(1, state.inBand / fighting / 0.92);
    const clean = Math.max(0, 1 - state.nearSnaps * 0.35);
    const net = state.netQuality === "perfect" ? 1 : state.netQuality === "good" ? 0.55 : 0;
    const misses = Math.max(0, 1 - state.netMisses * 0.5);
    return Math.min(1, band * 0.55 + clean * 0.2 + net * 0.15 + misses * 0.1);
}
export function gradeForScore(score) {
    if (score >= 0.9)
        return "perfect";
    if (score >= 0.74)
        return "fine";
    if (score >= 0.5)
        return "normal";
    return "poor";
}
export function fightGrade(state) {
    return gradeForScore(fightScore(state));
}
