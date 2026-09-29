// One horse away from its farm (planning-docs/FARM_RIDING_PLAN.md): the horse
// a rider brought to the Market Square, the Cove or Windrush Downs. Off the
// farm a horse has no life of its own — it is either being ridden or tied to a
// hitching rail, standing where it was left — so this is the whole of its sim:
// the pet sim's riding surface (`mount`/`ride`/`dismount`/`find`) over one
// horse, and its pose as a body to draw. Pure; no THREE, no DOM.

import type { PetBody, RiddenPose } from "./farm-pets.mjs";
import type { RidablePets } from "./farm-riding-controller.mjs";

export type TetheredHorseRow = Readonly<{ instanceId: string; speciesId: string; name: string; paletteId: string; sizeMultiplier: number; radius: number }>;

export type TetheredHorse = RidablePets & Readonly<{
  /** Ridden, tied, or not here at all. */
  state: () => "ridden" | "tied" | "none";
  row: () => TetheredHorseRow | null;
  /** The horse as the pet bodies draw it (empty when there is none). */
  bodies: () => readonly PetBody[];
  /** Stand it at a spot, tied (a page that arrives on foot beside it). */
  tie: (pose: Readonly<{ x: number; z: number; yaw: number }>) => void;
}>;

export function createTetheredHorse(horse: TetheredHorseRow | null): TetheredHorse {
  let state: "ridden" | "tied" | "none" = horse ? "tied" : "none";
  let pose: RiddenPose = Object.freeze({ x: 0, z: 0, yaw: 0, y: 0, gait: "idle", gaitRate: 1 });

  const view = (): PetBody | null => (horse && state !== "none" ? Object.freeze({
    instanceId: horse.instanceId,
    speciesId: horse.speciesId,
    name: horse.name,
    x: pose.x,
    z: pose.z,
    yaw: pose.yaw,
    hover: pose.y,
    sizeMultiplier: horse.sizeMultiplier,
    paletteId: horse.paletteId,
    radius: horse.radius,
    state: state === "ridden" ? "ridden" : "idle",
    moving: state === "ridden" && pose.gait !== "idle",
    pace: 1,
    ...(state === "ridden" ? { gait: pose.gait, gaitRate: pose.gaitRate } : {}),
  }) : null);

  return Object.freeze({
    state: () => state,
    row: () => horse,
    bodies: () => {
      const body = view();
      return body ? [body] : [];
    },
    tie(next) {
      if (!horse) return;
      state = "tied";
      pose = Object.freeze({ x: next.x, z: next.z, yaw: next.yaw, y: 0, gait: "idle", gaitRate: 1 });
    },
    mount(instanceId) {
      if (!horse || instanceId !== horse.instanceId || state !== "tied") return false;
      state = "ridden";
      return true;
    },
    ride(instanceId, next) {
      if (!horse || instanceId !== horse.instanceId || state !== "ridden") return;
      pose = next;
    },
    dismount(instanceId) {
      if (!horse || instanceId !== horse.instanceId || state !== "ridden") return false;
      state = "tied";
      pose = Object.freeze({ ...pose, y: 0, gait: "idle", gaitRate: 1 });
      return true;
    },
    find(instanceId) {
      if (!horse || instanceId !== horse.instanceId || state === "none") return null;
      return Object.freeze({ instanceId: horse.instanceId, name: horse.name, x: pose.x, z: pose.z, yaw: pose.yaw, sizeMultiplier: horse.sizeMultiplier, speciesId: horse.speciesId });
    },
  });
}
