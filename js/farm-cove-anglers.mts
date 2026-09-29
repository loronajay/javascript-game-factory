// Other people fishing at the Cove: what a line looks like from the outside.
//
// Pure — no THREE, no DOM, no clock. The angler's own client says what its
// line is doing (`presenceRodFor`, published on the presence pose), and every
// other client turns that into a rod in their hands, a line and a lure on the
// water (`anglerRig`), drawn by farm-cove-anglers-view.mts. Nothing here is
// the catch: that stays between the angler and the API.

import { COVE_WATER_LEVEL } from "./farm-cove.mjs";
import type { PresenceRod } from "./arcade-room-presence.mjs";

/** Metres of rod, as the angler's own view draws it. */
export const REMOTE_ROD_LENGTH = 1.45;
/** Seconds a cast lure flies (the controller's FLIGHT_SECONDS). */
export const REMOTE_CAST_SECONDS = 0.7;

type Point = Readonly<{ x: number; z: number }>;
type Point3 = Readonly<{ x: number; y: number; z: number }>;

/** The line as the angler's controller has it → the line as everyone else is told. Null when there is no line to show. */
export function presenceRodFor(phase: string, landing: Point | null, rodId: string): PresenceRod | null {
  if (!/^rod\.[a-z0-9-]{1,16}$/.test(rodId)) return null;
  const at = (kind: PresenceRod["phase"]): PresenceRod | null => landing
    ? Object.freeze({ rodId, phase: kind, x: Number(landing.x.toFixed(2)), z: Number(landing.z.toFixed(2)) })
    : null;
  switch (phase) {
    case "charging": return Object.freeze({ rodId, phase: "charge", x: 0, z: 0 });
    case "flight": return at("cast");
    case "waiting": return at("line");
    case "fighting":
    case "netting":
    case "settling": return at("fight");
    default: return null;
  }
}

export type AnglerRig = Readonly<{
  /** Where the rod's butt is held. */
  hand: Point3;
  /** Where the rod's tip is. */
  tip: Point3;
  /** The lure (or the fish's pull on the line), or null while there is no line out. */
  lure: Point3 | null;
  /** A fish is on: the water should break around the lure. */
  thrashing: boolean;
}>;

/**
 * The rod, line and lure for a member standing at `body` (feet, and the way they face).
 * `phaseSeconds` is how long this phase has been showing; `seconds` a free-running clock.
 */
export function anglerRig(body: Readonly<{ x: number; y: number; z: number; yaw: number }>, rod: PresenceRod, phaseSeconds: number, seconds: number): AnglerRig {
  const forward = { x: -Math.sin(body.yaw), z: -Math.cos(body.yaw) };
  const right = { x: -forward.z, z: forward.x };
  const hand = { x: body.x + forward.x * 0.28 + right.x * 0.22, y: body.y + 1.05, z: body.z + forward.z * 0.28 + right.z * 0.22 };
  // Point the rod at the lure once there is one; before that, the way they face.
  let aim = forward;
  if (rod.phase !== "charge") {
    const dx = rod.x - hand.x;
    const dz = rod.z - hand.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.05) aim = { x: dx / length, z: dz / length };
  }
  // How far the rod is raised above level along the aim: drawn back to charge, flicked out on the cast, held up against a fish.
  let lift = 0.6;
  let sway = 0;
  if (rod.phase === "charge") lift = 1.45;
  else if (rod.phase === "cast") lift = 1.45 - Math.min(1, phaseSeconds / 0.25) * 0.95;
  else if (rod.phase === "line") lift = 0.6 + Math.sin(seconds * 1.3) * 0.02;
  else {
    lift = 0.95 + Math.sin(seconds * 23) * 0.04;
    sway = Math.sin(seconds * 1.7) * 0.25;
  }
  const side = { x: aim.x * Math.cos(sway) - aim.z * Math.sin(sway), z: aim.z * Math.cos(sway) + aim.x * Math.sin(sway) };
  const tip = {
    x: hand.x + side.x * Math.cos(lift) * REMOTE_ROD_LENGTH,
    y: hand.y + Math.sin(lift) * REMOTE_ROD_LENGTH,
    z: hand.z + side.z * Math.cos(lift) * REMOTE_ROD_LENGTH,
  };
  if (rod.phase === "charge") return Object.freeze({ hand, tip, lure: null, thrashing: false });
  if (rod.phase === "cast" && phaseSeconds < REMOTE_CAST_SECONDS) {
    const t = phaseSeconds / REMOTE_CAST_SECONDS;
    const lure = {
      x: tip.x + (rod.x - tip.x) * t,
      y: tip.y + (COVE_WATER_LEVEL - tip.y) * t + Math.sin(t * Math.PI) * 2.2,
      z: tip.z + (rod.z - tip.z) * t,
    };
    return Object.freeze({ hand, tip, lure, thrashing: false });
  }
  if (rod.phase === "fight") {
    // The fish runs about where the lure went down, pulling one way and the other.
    const lure = { x: rod.x + Math.sin(seconds * 0.9) * 0.9, y: COVE_WATER_LEVEL, z: rod.z + Math.cos(seconds * 0.7) * 0.6 };
    return Object.freeze({ hand, tip, lure, thrashing: true });
  }
  return Object.freeze({ hand, tip, lure: { x: rod.x, y: COVE_WATER_LEVEL + 0.02 + Math.sin(seconds * 2.2) * 0.012, z: rod.z }, thrashing: false });
}
