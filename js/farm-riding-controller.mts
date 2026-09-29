// Riding, wired (planning-docs/FARM_RIDING_PLAN.md): the one piece every place
// a horse can go plugs in — the farm, the Market Square, the Cove, Windrush
// Downs. It holds who is mounted on what, steps the pure ride sim
// (`farm-ride.mts`) each tick from the held keys, puts the horse's body where
// the sim says (the pet sim's `ridden` state), and says where the rider's eyes
// are: in the saddle, over the horse's own neck and head, bobbing with the
// gait. The page keeps its own player pose and only asks this module where the
// rider is now.
//
// No THREE, no DOM: the page hands in its pet sim, its world and its camera.
// `mode` is the one switch between cosmetic riding and piloted riding.

import { NO_INPUT, createRideState, rideBlocked, rideClip, rideClipRate, rideGait, rideInputFromKeys, stepRide, type RideEvent, type RideGait, type RideInput, type RideMode, type RideProfile, type RideState, type RideWorld } from "./farm-ride.mjs";
import { forwardOf } from "./arcade-room-walker.mjs";
import type { RiddenPose } from "./farm-pets.mjs";

/** The slice of the pet sim riding uses. */
export type RidablePets = Readonly<{
  mount: (instanceId: string) => boolean;
  ride: (instanceId: string, pose: RiddenPose) => void;
  dismount: (instanceId: string) => boolean;
  find: (instanceId: string) => Readonly<{ instanceId: string; name: string; x: number; z: number; yaw: number; sizeMultiplier: number; speciesId: string }> | null;
}>;

export type RidingOptions = Readonly<{
  pets: RidablePets;
  mode: RideMode;
  /** The horse's numbers: fixed for cosmetic riding, the horse's own for piloted. */
  profile: (instanceId: string) => RideProfile;
  /** The world the horse rides in right now (solids, ground, water, fences). */
  world: () => RideWorld;
  /** True where the rider can stand once off (the page's own walker rules). */
  canStand: (point: Readonly<{ x: number; z: number }>) => boolean;
  /** The species' full height in metres (the horse's 1.65), before its size. */
  horseHeight: number;
}>;

export type RiderEye = Readonly<{ x: number; y: number; z: number; fovKick: number }>;

export type RidingController = Readonly<{
  mounted: () => string;
  state: () => RideState | null;
  gait: () => RideGait;
  profile: () => RideProfile | null;
  /** Get on a horse; false when it is not ridable or has no room to be ridden where it stands. */
  mount: (instanceId: string) => boolean;
  /** Get off beside the horse: the spot the rider stands on, or null when there is no room on either side. */
  dismount: () => Readonly<{ x: number; z: number }> | null;
  /** Put the rider straight into the saddle of a horse that arrives with them (a page load): no checks but the horse's own. */
  arrive: (instanceId: string, pose: Readonly<{ x: number; z: number; heading: number }>) => boolean;
  /** One fixed-timestep step from the held keys (or a given input); the events it raised. */
  step: (dt: number, keys: ReadonlySet<string> | RideInput) => readonly RideEvent[];
  /** Where the rider's eyes are this frame (the saddle, a stride's bob, a jump). */
  eye: (time: number) => RiderEye;
  /** Stop dead where it is (a panel opened, a gate being walked through). */
  halt: () => void;
  /** Take the horse's state from elsewhere (a race drives it while it runs). */
  setState: (state: RideState) => void;
}>;

/** The saddle sits this far behind the body's middle and this high up its withers, as shares of the horse. */
export const SADDLE_BACK = 0.22;
export const SADDLE_HEIGHT = 0.78;
/** Eyes above the saddle. */
export const RIDER_EYE = 0.85;
/** How far to each side the rider looks for a place to step down. */
export const DISMOUNT_REACH = 1.25;

const BOB: Readonly<Record<RideGait, Readonly<{ amplitude: number; rate: number }>>> = Object.freeze({
  idle: Object.freeze({ amplitude: 0.004, rate: 1.2 }),
  walk: Object.freeze({ amplitude: 0.025, rate: 3.2 }),
  trot: Object.freeze({ amplitude: 0.05, rate: 6.4 }),
  canter: Object.freeze({ amplitude: 0.06, rate: 5 }),
  gallop: Object.freeze({ amplitude: 0.075, rate: 7 }),
});

function isInput(value: ReadonlySet<string> | RideInput): value is RideInput {
  return typeof (value as RideInput).urge === "boolean";
}

export function createRidingController(options: RidingOptions): RidingController {
  let horseId = "";
  let ride: RideState | null = null;
  let profile: RideProfile | null = null;
  let size = 1;

  function place(): void {
    if (!ride || !profile) return;
    const gait = rideGait(ride.speed, profile);
    options.pets.ride(horseId, { x: ride.x, z: ride.z, yaw: ride.heading, y: ride.y, gait: rideClip(gait, ride.airborne), gaitRate: rideClipRate(ride.speed, gait) });
  }

  function begin(instanceId: string, pose: Readonly<{ x: number; z: number; heading: number }>, checkRoom: boolean): boolean {
    const horse = options.pets.find(instanceId);
    if (!horse) return false;
    const nextProfile = options.profile(instanceId);
    if (checkRoom && rideBlocked(pose, pose.heading, options.world())) return false;
    if (!options.pets.mount(instanceId)) return false;
    horseId = instanceId;
    profile = nextProfile;
    size = horse.sizeMultiplier || 1;
    const world = options.world();
    ride = createRideState({ x: pose.x, z: pose.z, heading: pose.heading, y: world.ground?.(pose) ?? 0 }, profile);
    place();
    return true;
  }

  return Object.freeze({
    mounted: () => horseId,
    state: () => ride,
    gait: () => (ride && profile ? rideGait(ride.speed, profile) : "idle"),
    profile: () => profile,
    mount(instanceId) {
      const horse = options.pets.find(instanceId);
      if (!horse || horseId) return false;
      return begin(instanceId, { x: horse.x, z: horse.z, heading: horse.yaw }, true);
    },
    arrive(instanceId, pose) {
      if (horseId) return false;
      return begin(instanceId, pose, false);
    },
    dismount() {
      if (!ride || !horseId) return null;
      const forward = forwardOf(ride.heading);
      const right = { x: -forward.z, z: forward.x };
      const spots = [-1, 1, -1.6, 1.6].map((side) => ({ x: ride!.x + right.x * DISMOUNT_REACH * side, z: ride!.z + right.z * DISMOUNT_REACH * side }));
      const behind = { x: ride.x - forward.x * 1.6, z: ride.z - forward.z * 1.6 };
      const spot = [...spots, behind].find((point) => options.canStand(point));
      if (!spot) return null;
      options.pets.dismount(horseId);
      horseId = "";
      ride = null;
      profile = null;
      return spot;
    },
    step(dt, keys) {
      if (!ride || !profile || !horseId) return [];
      // A horse sold, released or gone from the layout takes its rider off with it.
      if (!options.pets.find(horseId)) {
        horseId = "";
        ride = null;
        profile = null;
        return [];
      }
      const input = isInput(keys) ? keys : rideInputFromKeys(keys);
      const result = stepRide(ride, input, profile, options.world(), dt, options.mode);
      ride = result.state;
      place();
      return result.events;
    },
    eye(time) {
      if (!ride || !profile) return { x: 0, y: 0, z: 0, fovKick: 0 };
      const height = options.horseHeight * size;
      const forward = forwardOf(ride.heading);
      const gait = ride.airborne ? "idle" : rideGait(ride.speed, profile);
      const bob = BOB[gait];
      const lift = Math.abs(Math.sin(time * bob.rate)) * bob.amplitude * 2 - bob.amplitude;
      const gallopShare = Math.max(0, Math.min(1, (Math.abs(ride.speed) - profile.canterSpeed) / Math.max(1, profile.gallopSpeed - profile.canterSpeed)));
      return {
        x: ride.x - forward.x * SADDLE_BACK * height,
        y: ride.y + height * SADDLE_HEIGHT + RIDER_EYE + lift,
        z: ride.z - forward.z * SADDLE_BACK * height,
        fovKick: gallopShare * 6,
      };
    },
    halt() {
      if (!ride) return;
      ride = Object.freeze({ ...ride, speed: 0 });
      place();
    },
    setState(state) {
      if (!horseId) return;
      ride = state;
      place();
    },
  });
}

/** The held keys as a ride input with nothing pressed (a paused page). */
export const IDLE_RIDE_INPUT = NO_INPUT;
