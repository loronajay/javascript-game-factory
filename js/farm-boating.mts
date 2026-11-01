/** Deterministic local boat handling. This grants no ownership, travel, fish, or rewards. */
import { HARBOR_BOUNDS, HARBOR_DOCKS, HARBOR_ISLANDS, type SeaPoint } from "./farm-harbor-geometry.mjs";
export { HARBOR_BOUNDS, HARBOR_DOCKS, HARBOR_ISLANDS, type HarborDock, type SeaPoint } from "./farm-harbor-geometry.mjs";
import type { HarborDock } from "./farm-harbor-geometry.mjs";
export type BoatState = Readonly<{ x: number; z: number; yaw: number; speed: number; mode: "docked" | "sailing" | "anchored"; dockId: string | null }>;
/** The GLB's pointed bow faces +z; the game's forward direction is -z. */
export const BOAT_MODEL_YAW_OFFSET = Math.PI;
export const BOAT_HANDLING = Object.freeze({ maxSpeed: 5, reverseSpeed: 1.8, acceleration: 1.8, drag: 0.25, turnRate: 0.85, hullRadius: 1, hullSampleOffset: 1.2, dockRadius: 4, dockingSpeed: 0.9 });

export function dockedBoat(dockId = HARBOR_DOCKS[0]!.id): BoatState {
  const dock = HARBOR_DOCKS.find((entry) => entry.id === dockId) ?? HARBOR_DOCKS[0]!;
  return { x: dock.x, z: dock.z, yaw: dock.yaw, speed: 0, mode: "docked", dockId: dock.id };
}

/** Signed clearance: positive in navigable water, negative in a bank, shallow or pier. */
export function harborWaterClearance(point: SeaPoint): number {
  let distance = Math.min(point.x - HARBOR_BOUNDS.minX, HARBOR_BOUNDS.maxX - point.x, point.z - HARBOR_BOUNDS.minZ, HARBOR_BOUNDS.maxZ - point.z);
  for (const island of HARBOR_ISLANDS) distance = Math.min(distance, Math.hypot(point.x - island.x, point.z - island.z) - island.radius - 1.8);
  for (const dock of HARBOR_DOCKS) {
    const dx = Math.max(dock.minX - point.x, 0, point.x - dock.maxX);
    const dz = Math.max(dock.minZ - point.z, 0, point.z - dock.maxZ);
    distance = Math.min(distance, Math.hypot(dx, dz));
  }
  return distance;
}

export function boatFitsWater(point: SeaPoint, yaw: number): boolean {
  return [-BOAT_HANDLING.hullSampleOffset, 0, BOAT_HANDLING.hullSampleOffset].every((offset) =>
    harborWaterClearance({ x: point.x - Math.sin(yaw) * offset, z: point.z - Math.cos(yaw) * offset }) >= BOAT_HANDLING.hullRadius);
}

export function nearbyBoatDock(state: BoatState): HarborDock | undefined {
  return HARBOR_DOCKS.find((dock) => Math.hypot(state.x - dock.x, state.z - dock.z) <= BOAT_HANDLING.dockRadius);
}

export function useBoatDock(state: BoatState): BoatState {
  if (state.mode === "docked") return { ...state, mode: "sailing", dockId: null };
  const dock = nearbyBoatDock(state);
  return dock && Math.abs(state.speed) <= BOAT_HANDLING.dockingSpeed ? dockedBoat(dock.id) : state;
}

export function toggleBoatAnchor(state: BoatState): BoatState {
  return state.mode === "docked" ? state : { ...state, mode: state.mode === "anchored" ? "sailing" : "anchored", speed: 0 };
}

/** Bounded substeps prevent a long frame skipping a thin pier or turning the hull into shore. */
export function stepBoat(state: BoatState, input: Readonly<{ throttle: number; turn: number; brake?: boolean }>, dt: number): { state: BoatState; blocked: boolean } {
  if (state.mode !== "sailing" || !Number.isFinite(dt) || dt <= 0) return { state, blocked: false };
  const span = Math.min(dt, 0.25), count = Math.ceil(span * 60), step = span / count;
  const throttle = Number.isFinite(input.throttle) ? Math.max(-1, Math.min(1, input.throttle)) : 0;
  const turn = Number.isFinite(input.turn) ? Math.max(-1, Math.min(1, input.turn)) : 0;
  let current = state, blocked = false;
  for (let i = 0; i < count; i++) {
    const drag = input.brake ? 4 : BOAT_HANDLING.drag;
    const speed = Math.max(-BOAT_HANDLING.reverseSpeed, Math.min(BOAT_HANDLING.maxSpeed, (current.speed + throttle * BOAT_HANDLING.acceleration * step) * Math.exp(-drag * step)));
    const turnAmount = turn * BOAT_HANDLING.turnRate * (0.2 + Math.min(1, Math.abs(speed) / 2)) * step * (speed < -0.1 ? -1 : 1);
    const yaw = Math.atan2(Math.sin(current.yaw + turnAmount), Math.cos(current.yaw + turnAmount));
    const next = { ...current, yaw, speed, x: current.x - Math.sin(yaw) * speed * step, z: current.z - Math.cos(yaw) * speed * step };
    if (boatFitsWater(next, yaw)) current = next;
    else { current = { ...current, speed: 0 }; blocked = true; }
  }
  return { state: current, blocked };
}
