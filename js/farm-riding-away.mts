// Riding away from the farm, wired (planning-docs/FARM_RIDING_PLAN.md): what
// the Market Square, the Cove and Windrush Downs each plug in so a rider can
// arrive on their horse, ride it about, tie it to a hitching rail and walk,
// take it back up — and see everyone else who is riding.
//
// The pieces are the farm's own: the ride sim through `farm-riding-controller`
// (cosmetic in the square and the Cove, piloted at the Downs), one horse as a
// `farm-horse-tether` (ridden or tied — off the farm it has no life of its
// own), the pets' bodies to draw it, and the saddle view's hands and reins.
// Other riders' horses are drawn under the bodies the visitors module already
// eases, from the `mount` their presence pose carries.
//
// A page hands in its horse (the farm document's pet row, from the server),
// its world and its hitching rails, and asks this module each tick where the
// rider is and what E would do.

import { findAnimal } from "./farm-catalog/animals.mjs";
import { createPetBodies } from "./farm-pet-bodies.mjs";
import { createRiderView } from "./farm-rider-view.mjs";
import { createRidingController } from "./farm-riding-controller.mjs";
import { createTetheredHorse } from "./farm-horse-tether.mjs";
import { rideClip, rideGait, type RideEvent, type RideMode, type RideProfile, type RideState, type RideWorld, type RideInput } from "./farm-ride.mjs";
import type { FarmDecorRow, FarmPet } from "./farm-layout.mjs";
import type { PetBody } from "./farm-pets.mjs";
import type { PresenceMount } from "./arcade-room-presence.mjs";
import type { VisitorPlacement } from "./arcade-room-visitors.mjs";

type ThreeNamespace = Record<string, any>;

/** How near a hitching rail a rider must be to tie up, and how near a tied horse to get back on. */
export const RAIL_REACH = 2.4;
export const TIED_REACH = 2.2;
/** The saddle's height as a share of a horse's (the visitors' seat for a rider). */
export const SEAT_SHARE = 0.78;

export type AwayRidingOptions = Readonly<{
  /** The rider's horse as the farm document holds it, or null when they came on foot. */
  horse: FarmPet | null;
  mode: RideMode;
  profile: (horse: FarmPet) => RideProfile;
  world: () => RideWorld;
  canStand: (point: Readonly<{ x: number; z: number }>) => boolean;
  /** The place's hitching rails. */
  rails: readonly FarmDecorRow[];
  /** False at the Downs: there is no getting down there. */
  canTie: boolean;
}>;

export type AwayRidingAction = Readonly<{ kind: "tie" | "mount"; prompt: string }>;

export type AwayRiding = Readonly<{
  hasHorse: () => boolean;
  mounted: () => boolean;
  horseId: () => string;
  horseName: () => string;
  /** Straight into the saddle at a pose (arriving through a gate). */
  arrive: (pose: Readonly<{ x: number; z: number; heading: number }>) => boolean;
  step: (dt: number, keys: ReadonlySet<string> | RideInput) => readonly RideEvent[];
  state: () => RideState | null;
  profile: () => RideProfile | null;
  eye: (time: number) => Readonly<{ x: number; y: number; z: number; fovKick: number }>;
  /** What E would do for a player at `pose`, or null. */
  action: (pose: Readonly<{ x: number; z: number }>) => AwayRidingAction | null;
  /** Do it: tie up (returns where the rider now stands) or get back on (returns the saddle's spot). */
  act: (pose: Readonly<{ x: number; z: number }>) => Readonly<{ x: number; z: number }> | null;
  /** Draw this frame: the rider's own horse, the hands and reins, and every other rider's horse. */
  draw: (dt: number, time: number, others: readonly VisitorPlacement[]) => void;
  /** What the rider's presence pose says they are sitting on. */
  presenceMount: () => PresenceMount | null;
  /** The visitors' seat height for a rider on `mount`. */
  seatFor: (mount: PresenceMount) => number;
  halt: () => void;
  /** Take the horse's state from a race. */
  setState: (state: RideState) => void;
}>;

function distanceToRail(rail: FarmDecorRow, point: Readonly<{ x: number; z: number }>): number {
  // The rail runs along the row's local x, 2.4 m long.
  const cosine = Math.cos(rail.rotationY);
  const sine = Math.sin(rail.rotationY);
  const dx = point.x - rail.x;
  const dz = point.z - rail.z;
  const along = dx * cosine - dz * sine;
  const across = dx * sine + dz * cosine;
  const clamped = Math.max(-1.2, Math.min(1.2, along));
  return Math.hypot(along - clamped, across);
}

export function createAwayRiding(THREE: ThreeNamespace, scene: any, options: AwayRidingOptions): AwayRiding {
  const species = findAnimal(options.horse?.speciesId);
  const horse = options.horse && species?.ridable ? options.horse : null;
  const size = horse?.profile?.size.current ?? 1;
  const tether = createTetheredHorse(horse && species ? {
    instanceId: horse.instanceId,
    speciesId: horse.speciesId,
    name: horse.name,
    paletteId: horse.profile?.paletteId ?? "standard",
    sizeMultiplier: size,
    radius: species.radius * size,
  } : null);
  const bodies = createPetBodies(THREE, scene);
  const riderView = createRiderView(THREE, scene);
  const riding = createRidingController({
    pets: tether,
    mode: options.mode,
    profile: () => (horse ? options.profile(horse) : options.profile(options.horse!)),
    world: options.world,
    canStand: options.canStand,
    horseHeight: species?.height ?? 1.65,
  });
  const height = (species?.height ?? 1.65) * size;

  function tiedPose(): Readonly<{ x: number; z: number }> | null {
    const found = horse && tether.state() === "tied" ? tether.find(horse.instanceId) : null;
    return found ? { x: found.x, z: found.z } : null;
  }

  function action(pose: Readonly<{ x: number; z: number }>): AwayRidingAction | null {
    if (!horse) return null;
    if (riding.mounted()) {
      if (!options.canTie) return null;
      const near = options.rails.some((rail) => distanceToRail(rail, pose) <= RAIL_REACH);
      return near ? { kind: "tie", prompt: `Press E to tie ${horse.name} to the hitching rail and get down` } : null;
    }
    const tied = tiedPose();
    return tied && Math.hypot(tied.x - pose.x, tied.z - pose.z) <= TIED_REACH ? { kind: "mount", prompt: `Press E to untie ${horse.name} and ride` } : null;
  }

  return Object.freeze({
    hasHorse: () => Boolean(horse),
    mounted: () => Boolean(riding.mounted()),
    horseId: () => horse?.instanceId ?? "",
    horseName: () => horse?.name ?? "",
    arrive(pose) {
      if (!horse) return false;
      tether.tie({ x: pose.x, z: pose.z, yaw: pose.heading });
      const ok = riding.arrive(horse.instanceId, pose);
      if (ok) bodies.setTagVisible(horse.instanceId, false);
      return ok;
    },
    step: (dt, keys) => riding.step(dt, keys),
    state: () => riding.state(),
    profile: () => riding.profile(),
    eye: (time) => riding.eye(time),
    action,
    act(pose) {
      const next = action(pose);
      if (!next || !horse) return null;
      if (next.kind === "tie") {
        const spot = riding.dismount();
        if (spot) bodies.setTagVisible(horse.instanceId, true);
        return spot;
      }
      const found = tether.find(horse.instanceId);
      if (!found) return null;
      const ok = riding.arrive(horse.instanceId, { x: found.x, z: found.z, heading: found.yaw });
      if (!ok) return null;
      bodies.setTagVisible(horse.instanceId, false);
      return { x: found.x, z: found.z };
    },
    draw(dt, time, others) {
      const ride = riding.state();
      const theirs: PetBody[] = [];
      for (const placement of others) {
        const mount = placement.member.pose.mount;
        const kind = mount ? findAnimal(mount.speciesId) : undefined;
        if (!mount || !kind) continue;
        theirs.push(Object.freeze({
          instanceId: `mount-${placement.clientId}`,
          speciesId: mount.speciesId,
          name: "",
          x: placement.x,
          z: placement.z,
          yaw: placement.yaw,
          hover: mount.y,
          sizeMultiplier: mount.size,
          paletteId: mount.paletteId,
          radius: kind.radius * mount.size,
          state: "ridden",
          moving: mount.gait !== "idle",
          pace: 1,
          gait: mount.gait,
          gaitRate: 1,
        }));
      }
      bodies.sync([...tether.bodies(), ...theirs], dt);
      for (const body of theirs) bodies.setTagVisible(body.instanceId, false);
      riderView.update(ride ? {
        eye: riding.eye(time),
        horse: { x: ride.x, z: ride.z, y: ride.y, heading: ride.heading, height },
        reach: Math.min(1, Math.abs(ride.speed) / 6),
      } : null);
    },
    presenceMount() {
      const ride = riding.state();
      const profile = riding.profile();
      if (!horse || !ride || !profile) return null;
      const gait = rideGait(ride.speed, profile);
      return Object.freeze({ speciesId: horse.speciesId, paletteId: horse.profile?.paletteId ?? "standard", gait: rideClip(gait, ride.airborne), y: Number(ride.y.toFixed(2)), size });
    },
    seatFor: (mount) => (findAnimal(mount.speciesId)?.height ?? 1.65) * mount.size * SEAT_SHARE + mount.y - 0.1,
    halt: () => riding.halt(),
    setState: (state) => riding.setState(state),
  });
}
