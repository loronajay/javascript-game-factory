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

import { findFishSpecies, findFishingLure, type FishingRod, type FishZone } from "./farm-catalog/fish.mjs";
import { castLanding, castOrigin, coveZoneAt } from "./farm-cove.mjs";
import {
  fightStrength,
  fishValue,
  fishXp,
  lengthMmForWeight,
  rollBite,
  shadowInReach,
  sizeClassForRank,
  weightGramsAtRank,
  type FishGrade,
  type FishVariant,
  type PublicShadow,
} from "./farm-fish.mjs";
import {
  castPower,
  fightGrade,
  holdNet,
  planWait,
  pressNet,
  startFight,
  stepFight,
  strikeAt,
  type FightState,
  type WaitPlan,
} from "./farm-fishing.mjs";
import type { FightStyle } from "./farm-catalog/fish.mjs";

export type FishingPhase = "idle" | "charging" | "flight" | "waiting" | "fighting" | "netting" | "settling" | "reveal";

/** A fish as the server minted it (or a practice fish, which goes nowhere). */
export type CaughtFish = Readonly<{
  id: string;
  speciesId: string;
  weightG: number;
  lengthMm: number;
  sizeClass: string;
  grade: FishGrade;
  variant: FishVariant;
  value: number;
}>;

export type CastAnswer = Readonly<{
  ok: true;
  cast: Readonly<{ id: string; zone: FishZone; shadowId: string | null; biteDelay: number; fight: Readonly<{ style: FightStyle; strength: number }>; hint: string }>;
  tackle?: unknown;
}>;
export type LandAnswer = Readonly<{ ok: true; outcome: string; fish: CaughtFish | null; xp: number; fishing?: any; tackle?: unknown; achievements?: readonly any[] }>;
export type Refusal = Readonly<{ ok: false; error: string; [key: string]: unknown }>;

export type FishingApi = Readonly<{
  cast: (request: Readonly<{ castId: string; point: Readonly<{ x: number; z: number }>; shadowId: string | null; rodId: string; bait: string }>) => Promise<CastAnswer | Refusal>;
  land: (castId: string, outcome: "landed" | "escaped" | "snapped" | "missed", grade?: FishGrade) => Promise<LandAnswer | Refusal>;
}>;

export type FishingEvent =
  | Readonly<{ kind: "notice"; text: string }>
  | Readonly<{ kind: "cast"; answer: CastAnswer | null }>
  | Readonly<{ kind: "refused"; error: string; detail: Refusal }>
  | Readonly<{ kind: "hooked" }>
  | Readonly<{ kind: "lost"; how: "early" | "late" | "snapped" | "thrown"; answer: LandAnswer | Refusal | null }>
  | Readonly<{ kind: "landed"; fish: CaughtFish; xp: number; answer: LandAnswer | null; practice: boolean }>
  | Readonly<{ kind: "landing-refused"; error: string }>;

export type FishingDeps = Readonly<{
  /** Null when signed out: practice, and nothing is kept. */
  api: FishingApi | null;
  random: () => number;
  /** Wall-clock ms: where the shadows are. */
  now: () => number;
  tackle: () => Readonly<{ rod: FishingRod; bait: string; level: number }>;
  shadows: () => readonly PublicShadow[];
  /** Shadows this angler has already caught: a lure by one of them is a blind cast. */
  caught: () => ReadonlySet<string>;
  onEvent: (event: FishingEvent) => void;
  newId: (prefix: string) => string;
}>;

type Pose = Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>;

export type FishingSnapshot = Readonly<{
  phase: FishingPhase;
  /** 0..1 on the power meter while charging. */
  power: number;
  from: Readonly<{ x: number; z: number }> | null;
  landing: Readonly<{ x: number; z: number }> | null;
  zone: FishZone | null;
  /** 0..1 of the lure's flight. */
  flight: number;
  plan: WaitPlan | null;
  /** Seconds since the lure settled on the water. */
  waited: number;
  fight: FightState | null;
  /** The shadow that took the lure, if one did. */
  shadowId: string | null;
  /** A shadow that has seen the lure and is coming to it. */
  interestedShadowId: string | null;
  /** How big the fish on the line looks to be. */
  hint: string;
  fish: CaughtFish | null;
}>;

/** Seconds the lure flies. */
export const FLIGHT_SECONDS = 0.7;
/** How long the practice clock pretends the server took. */
const PRACTICE_BITE = Object.freeze({ blind: [3, 9], shadow: [1.2, 3.2] });

export type FishingController = Readonly<{
  /** Space (or the primary button) went down or up. */
  primary: (down: boolean, pose: Pose) => void;
  steer: (direction: number) => void;
  bow: () => void;
  /** Reel in and put the rod down: abandons a cast, never a fish already landed. */
  cancel: () => void;
  tick: (dt: number) => void;
  state: () => FishingSnapshot;
  /** True from the first press until the catch is put away: the walker stays still. */
  busy: () => boolean;
}>;

export function createFishingController(deps: FishingDeps): FishingController {
  let phase: FishingPhase = "idle";
  let held = 0;
  let reeling = false;
  let steering = 0;
  let bowing = false;
  let from: { x: number; z: number } | null = null;
  let landing: { x: number; z: number } | null = null;
  let zone: FishZone | null = null;
  let flight = 0;
  let plan: WaitPlan | null = null;
  let waited = 0;
  let fight: FightState | null = null;
  let shadowId: string | null = null;
  let interested: string | null = null;
  let hint = "";
  let fish: CaughtFish | null = null;
  let castId = "";
  let fightParams: Readonly<{ style: FightStyle; strength: number }> | null = null;
  /** The cast answer, once it arrives; the lure can land before it does. */
  let answer: CastAnswer | null = null;
  let answerPending = false;
  let practiceBite: { speciesId: string; rank: number; variant: FishVariant } | null = null;
  let token = 0;

  function reset(): void {
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

  function release(pose: Pose): void {
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
      const bite = rollBite(where, lure, nearby ? "shadow" : "blind", deps.random);
      practiceBite = bite;
      const species = findFishSpecies(bite.speciesId)!;
      const range = nearby ? PRACTICE_BITE.shadow : PRACTICE_BITE.blind;
      const strength = fightStrength(species.id, weightGramsAtRank(species, bite.rank));
      answer = Object.freeze({
        ok: true,
        cast: Object.freeze({ id: castId, zone: where, shadowId: nearby?.id ?? null, biteDelay: range[0]! + deps.random() * (range[1]! - range[0]!), fight: Object.freeze({ style: species.fight, strength }), hint: "" }),
      });
      deps.onEvent({ kind: "cast", answer });
      return;
    }
    answerPending = true;
    void deps.api.cast({ castId, point, shadowId: nearby?.id ?? null, rodId: tackle.rod.id, bait: tackle.bait }).then((result) => {
      if (mine !== token) return;
      answerPending = false;
      if (!result.ok) {
        deps.onEvent({ kind: "refused", error: result.error, detail: result });
        reset();
        return;
      }
      answer = result;
      deps.onEvent({ kind: "cast", answer: result });
    }).catch(() => {
      if (mine !== token) return;
      deps.onEvent({ kind: "notice", text: "The line tangled — the Cove could not be reached. Try again in a moment." });
      reset();
    });
  }

  function settleOnWater(): void {
    if (!answer) return;
    phase = "waiting";
    waited = 0;
    shadowId = answer.cast.shadowId;
    if (!shadowId) interested = null;
    fightParams = answer.cast.fight;
    hint = answer.cast.hint;
    plan = planWait(answer.cast.biteDelay, answer.cast.fight.strength, deps.random);
  }

  function hook(): void {
    const tackle = deps.tackle();
    const distance = from && landing ? Math.hypot(landing.x - from.x, landing.z - from.z) : 8;
    fight = startFight({ style: fightParams!.style, strength: fightParams!.strength, rod: tackle.rod, level: tackle.level, distance }, deps.random);
    phase = "fighting";
    interested = null;
    deps.onEvent({ kind: "hooked" });
  }

  function lose(how: "early" | "late" | "snapped" | "thrown"): void {
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

  function landed(state: FightState): void {
    const grade = fightGrade(state);
    phase = "settling";
    const api = deps.api;
    const mine = token;
    if (!api) {
      const bite = practiceBite!;
      const species = findFishSpecies(bite.speciesId)!;
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
      if (mine !== token) return;
      if (!result.ok || !result.fish) {
        deps.onEvent({ kind: "landing-refused", error: result.ok ? "no_fish" : result.error });
        reset();
        return;
      }
      fish = result.fish;
      phase = "reveal";
      deps.onEvent({ kind: "landed", fish: result.fish, xp: result.xp, answer: result, practice: false });
    }).catch(() => {
      if (mine !== token) return;
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
        if (result === "hooked") hook();
        else lose(result);
        return;
      }
      if (phase === "fighting") {
        reeling = down;
        return;
      }
      if (phase === "netting" && down && fight) {
        fight = pressNet(fight, fight.elapsed);
        if (fight.phase === "landed") landed(fight);
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
      if (phase === "settling" || phase === "reveal") return;
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
      if (phase === "charging") held += dt;
      else if (phase === "flight") {
        flight = Math.min(1, flight + dt / FLIGHT_SECONDS);
        if (flight >= 1 && answer) settleOnWater();
      } else if (phase === "waiting" && plan) {
        waited += dt;
        if (waited > plan.biteAt + plan.strikeWindow) lose("late");
      } else if (phase === "fighting" && fight) {
        fight = stepFight(fight, { reel: reeling, steer: steering, bow: bowing }, dt, deps.random);
        bowing = false;
        if (fight.phase === "snapped") lose("snapped");
        else if (fight.phase === "thrown") lose("thrown");
        else if (fight.phase === "netting") phase = "netting";
      } else if (phase === "netting" && fight) {
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
