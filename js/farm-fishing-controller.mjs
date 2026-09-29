// A catch, from the first press to the fish in the creel. No DOM, no THREE:
// the page feeds it keys and ticks, the views draw `state()`, and the server
// (or, signed out, a local practice roll) decides what bites.
//
//   idle ─hold─▶ charging ─release─▶ flight ─lands─▶ waiting ─strike─▶ fighting ─tired, near─▶ netting ─▶ landed
//                                     │ (no water: back to idle)   │ early/late: missed        │ snapped / thrown
//
// The minigame is farm-fishing.mts; this file only sequences it, sends the
// cast when the line is released (so the server's bite clock starts with the
// splash) and reports how it ended. The server's answer to a landing is the
// fish — the page is told what it caught only then.
import { findFishSpecies, findFishingLure } from "./farm-catalog/fish.mjs";
import { castLanding, castOrigin, coveZoneAt } from "./farm-cove.mjs";
import { fightStrength, fishValue, fishXp, lengthMmForWeight, rollBite, shadowInReach, sizeClassForRank, weightGramsAtRank, } from "./farm-fish.mjs";
import { castPower, fightGrade, holdNet, planWait, pressNet, startFight, stepFight, strikeAt, } from "./farm-fishing.mjs";
/** Seconds the lure flies. */
export const FLIGHT_SECONDS = 0.7;
/** How long the practice clock pretends the server took. */
const PRACTICE_BITE = Object.freeze({ blind: [3, 9], shadow: [1.2, 3.2] });
export function createFishingController(deps) {
    let phase = "idle";
    let held = 0;
    let reeling = false;
    let steering = 0;
    let bowing = false;
    let from = null;
    let landing = null;
    let zone = null;
    let flight = 0;
    let plan = null;
    let waited = 0;
    let fight = null;
    let shadowId = null;
    let interested = null;
    let hint = "";
    let fish = null;
    let castId = "";
    let fightParams = null;
    /** The cast answer, once it arrives; the lure can land before it does. */
    let answer = null;
    let answerPending = false;
    let practiceBite = null;
    let token = 0;
    function reset() {
        phase = "idle";
        held = 0;
        reeling = false;
        steering = 0;
        bowing = false;
        from = null;
        landing = null;
        zone = null;
        flight = 0;
        plan = null;
        waited = 0;
        fight = null;
        shadowId = null;
        interested = null;
        hint = "";
        answer = null;
        answerPending = false;
        practiceBite = null;
        castId = "";
        fightParams = null;
        token += 1;
    }
    function release(pose) {
        const origin = castOrigin(pose);
        const tackle = deps.tackle();
        const power = castPower(held);
        const point = castLanding(pose, power, tackle.rod.castRange);
        const where = coveZoneAt(point);
        if (!origin || !where) {
            deps.onEvent({ kind: "notice", text: origin ? "The cast fell on the bank. Face open water and try again." : "Face the water to cast." });
            reset();
            return;
        }
        from = { x: pose.x, z: pose.z };
        landing = point;
        zone = where;
        phase = "flight";
        flight = 0;
        const lure = deps.tackle().bait === "bait.worm" ? null : findFishingLure(tackle.bait) ?? null;
        // Did a shadow see where it will land? (The server checks the same thing.)
        const now = deps.now();
        const nearby = shadowInReach(deps.shadows().filter((entry) => entry.zone === where && !deps.caught().has(entry.id)), point, now);
        interested = nearby?.id ?? null;
        castId = deps.newId("cast");
        const mine = token;
        if (!deps.api) {
            // Practice: roll the bite here. Nothing is kept.
            const bite = rollBite(where, lure, nearby ? "shadow" : "blind", deps.random, tackle.level);
            practiceBite = bite;
            const species = findFishSpecies(bite.speciesId);
            const range = nearby ? PRACTICE_BITE.shadow : PRACTICE_BITE.blind;
            const strength = fightStrength(species.id, weightGramsAtRank(species, bite.rank));
            answer = Object.freeze({
                ok: true,
                cast: Object.freeze({ id: castId, zone: where, shadowId: nearby?.id ?? null, biteDelay: range[0] + deps.random() * (range[1] - range[0]), fight: Object.freeze({ style: species.fight, strength }), hint: "" }),
            });
            deps.onEvent({ kind: "cast", answer });
            return;
        }
        answerPending = true;
        void deps.api.cast({ castId, point, shadowId: nearby?.id ?? null, rodId: tackle.rod.id, bait: tackle.bait }).then((result) => {
            if (mine !== token)
                return;
            answerPending = false;
            if (!result.ok) {
                deps.onEvent({ kind: "refused", error: result.error, detail: result });
                reset();
                return;
            }
            answer = result;
            deps.onEvent({ kind: "cast", answer: result });
        }).catch(() => {
            if (mine !== token)
                return;
            deps.onEvent({ kind: "notice", text: "The line tangled — the Cove could not be reached. Try again in a moment." });
            reset();
        });
    }
    function settleOnWater() {
        if (!answer)
            return;
        phase = "waiting";
        waited = 0;
        shadowId = answer.cast.shadowId;
        if (!shadowId)
            interested = null;
        fightParams = answer.cast.fight;
        hint = answer.cast.hint;
        plan = planWait(answer.cast.biteDelay, answer.cast.fight.strength, deps.random);
    }
    function hook() {
        const tackle = deps.tackle();
        const distance = from && landing ? Math.hypot(landing.x - from.x, landing.z - from.z) : 8;
        fight = startFight({ style: fightParams.style, strength: fightParams.strength, rod: tackle.rod, level: tackle.level, distance }, deps.random);
        phase = "fighting";
        interested = null;
        deps.onEvent({ kind: "hooked" });
    }
    function lose(how) {
        const outcome = how === "snapped" ? "snapped" : how === "thrown" ? "escaped" : "missed";
        const id = castId;
        const api = deps.api;
        reset();
        if (!api) {
            deps.onEvent({ kind: "lost", how, answer: null });
            return;
        }
        void api.land(id, outcome).then((result) => deps.onEvent({ kind: "lost", how, answer: result })).catch(() => deps.onEvent({ kind: "lost", how, answer: null }));
    }
    function landed(state) {
        const grade = fightGrade(state);
        phase = "settling";
        const api = deps.api;
        const mine = token;
        if (!api) {
            const bite = practiceBite;
            const species = findFishSpecies(bite.speciesId);
            const weightG = weightGramsAtRank(species, bite.rank);
            fish = Object.freeze({
                id: `practice-${castId}`,
                speciesId: species.id,
                weightG,
                lengthMm: lengthMmForWeight(species, weightG),
                sizeClass: sizeClassForRank(bite.rank),
                grade,
                variant: bite.variant,
                value: fishValue(species.id, weightG, grade, bite.variant),
            });
            phase = "reveal";
            deps.onEvent({ kind: "landed", fish, xp: fishXp(species.id, weightG, grade), answer: null, practice: true });
            return;
        }
        void api.land(castId, "landed", grade).then((result) => {
            if (mine !== token)
                return;
            if (!result.ok || !result.fish) {
                deps.onEvent({ kind: "landing-refused", error: result.ok ? "no_fish" : result.error });
                reset();
                return;
            }
            fish = result.fish;
            phase = "reveal";
            deps.onEvent({ kind: "landed", fish: result.fish, xp: result.xp, answer: result, practice: false });
        }).catch(() => {
            if (mine !== token)
                return;
            deps.onEvent({ kind: "landing-refused", error: "network" });
            reset();
        });
    }
    return Object.freeze({
        primary(down, pose) {
            if (phase === "idle" && down) {
                if (!castOrigin(pose)) {
                    deps.onEvent({ kind: "notice", text: "Walk to the water's edge (or out on a dock) and face the water to cast." });
                    return;
                }
                phase = "charging";
                held = 0;
                return;
            }
            if (phase === "charging" && !down) {
                release(pose);
                return;
            }
            if (phase === "waiting" && down && plan) {
                const result = strikeAt(plan, waited);
                if (result === "hooked")
                    hook();
                else
                    lose(result);
                return;
            }
            if (phase === "fighting") {
                reeling = down;
                return;
            }
            if (phase === "netting" && down && fight) {
                fight = pressNet(fight, fight.elapsed);
                if (fight.phase === "landed")
                    landed(fight);
                else if (fight.phase === "fighting") {
                    phase = "fighting";
                    deps.onEvent({ kind: "notice", text: "Missed the net — it's found its second wind!" });
                }
                return;
            }
            if (phase === "reveal" && down) {
                fish = null;
                reset();
            }
        },
        steer(direction) {
            steering = Math.sign(direction);
        },
        bow() {
            bowing = true;
        },
        cancel() {
            if (phase === "settling" || phase === "reveal")
                return;
            if (phase === "fighting" || phase === "netting") {
                lose("thrown");
                return;
            }
            if (phase === "waiting" || (phase === "flight" && !answerPending)) {
                lose("early");
                return;
            }
            reset();
        },
        tick(dt) {
            if (phase === "charging")
                held += dt;
            else if (phase === "flight") {
                flight = Math.min(1, flight + dt / FLIGHT_SECONDS);
                if (flight >= 1 && answer)
                    settleOnWater();
            }
            else if (phase === "waiting" && plan) {
                waited += dt;
                if (waited > plan.biteAt + plan.strikeWindow)
                    lose("late");
            }
            else if (phase === "fighting" && fight) {
                fight = stepFight(fight, { reel: reeling, steer: steering, bow: bowing }, dt, deps.random);
                bowing = false;
                if (fight.phase === "snapped")
                    lose("snapped");
                else if (fight.phase === "thrown")
                    lose("thrown");
                else if (fight.phase === "netting")
                    phase = "netting";
            }
            else if (phase === "netting" && fight) {
                fight = holdNet(fight, dt);
            }
        },
        state() {
            return Object.freeze({
                phase,
                power: phase === "charging" ? castPower(held) : 0,
                from,
                landing,
                zone,
                flight,
                plan,
                waited,
                fight,
                shadowId,
                interestedShadowId: interested,
                hint,
                fish,
            });
        },
        busy: () => phase !== "idle",
    });
}
