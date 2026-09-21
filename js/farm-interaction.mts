// What the player can reach on the farm, as pure rules.
//
// Four targets: a door (a building's or a gate's, worked from either side, so
// there is no "in front" test — only distance and facing), a ladder (taken
// hold of at its foot or, standing on the platform it reaches, at its top),
// a seat (sat on where the player comes at it) and a pet (a body with a pose,
// through the room's own reach rule). The composition root asks these every
// tick and turns the answer into a prompt and an E handler; nothing here
// knows about THREE, the DOM or who is asking.

import { BARN, seatPoint } from "./farm-scene.mjs";
import { LEVEL_TOLERANCE, type FarmLadder, type FarmSeat } from "./farm-body.mjs";
import { findVisitorInReach } from "./arcade-room-interaction.mjs";

export type FarmPlayerPose = Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>;
/** A pose with the height of the feet, for the targets that have a level. */
export type FarmBodyPose = FarmPlayerPose & Readonly<{ y: number }>;
export type DoorTarget = Readonly<{ x: number; z: number }>;

export const DOOR_FACING_THRESHOLD = 0.35;
/** Inside this distance the player is AT the door and facing no longer matters — a thin door plane makes the dot meaningless up close. */
export const DOOR_TOUCH_DISTANCE = 0.9;
/** How far from a ladder's foot or top the player may stand to take hold of it. */
export const LADDER_REACH = 1.4;
/** How far from the nearest point of a seat the player may stand to sit on it. */
export const SEAT_REACH = 1.3;
const FACING_THRESHOLD = 0.3;

function facingToward(player: FarmPlayerPose, target: Readonly<{ x: number; z: number }>): number {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return 1;
  const forwardLength = Math.hypot(player.forward.x, player.forward.z) || 1;
  return (player.forward.x * dx + player.forward.z * dz) / (distance * forwardLength);
}

/** True when the player stands within reach of the door's centre and is looking toward it, inside or out. */
export function canWorkDoor(player: FarmPlayerPose, door: DoorTarget, reach = BARN.doorReach): boolean {
  const distance = Math.hypot(door.x - player.x, door.z - player.z);
  if (distance > reach) return false;
  if (distance <= DOOR_TOUCH_DISTANCE) return true;
  return facingToward(player, door) >= DOOR_FACING_THRESHOLD;
}

export const canWorkBarnDoor = canWorkDoor;

/** "Press E to open the barn doors", "Press E to close the gate": the door's own label. */
export function getDoorPrompt(doorsOpen: boolean, door: Readonly<{ title: string; leaves: 1 | 2; label?: string }> = { title: "Barn", leaves: 2 }): string {
  const label = door.label ?? `${door.title.toLowerCase()} ${door.leaves === 2 ? "doors" : "door"}`;
  return `Press E to ${doorsOpen ? "close" : "open"} the ${label}`;
}

export function getBarnDoorPrompt(doorsOpen: boolean): string {
  return getDoorPrompt(doorsOpen);
}

export type LadderInReach = Readonly<{ ladder: FarmLadder; fromTop: boolean }>;

/**
 * The ladder the player can take hold of: standing near its foot at the
 * bottom level, or near its top on the platform it reaches, and looking at
 * it. The nearest one wins.
 */
export function findLadderInReach(ladders: readonly FarmLadder[], player: FarmBodyPose): LadderInReach | null {
  let best: LadderInReach | null = null;
  let bestDistance = Infinity;
  for (const ladder of ladders) {
    for (const fromTop of [false, true]) {
      const level = fromTop ? ladder.top : ladder.bottom;
      if (Math.abs(player.y - level) > LEVEL_TOLERANCE) continue;
      const spot = fromTop ? ladder.exit : ladder.foot;
      const distance = Math.hypot(spot.x - player.x, spot.z - player.z);
      if (distance > LADDER_REACH) continue;
      // From the right side of it: the climbing face at the foot, the platform side at the top — never through the rungs from behind.
      if ((player.x - ladder.x) * (spot.x - ladder.x) + (player.z - ladder.z) * (spot.z - ladder.z) <= 0) continue;
      if (facingToward(player, ladder) < FACING_THRESHOLD) continue;
      if (distance < bestDistance) {
        best = { ladder, fromTop };
        bestDistance = distance;
      }
    }
  }
  return best;
}

export function getLadderPrompt(fromTop: boolean): string {
  return fromTop ? "Press E to climb down the ladder" : "Press E to climb the ladder";
}

export const CLIMBING_PROMPT = "W and S to climb · E to let go";

export type SeatInReach = Readonly<{ seat: FarmSeat; point: Readonly<{ x: number; z: number }> }>;

/** The seat the player can sit on: at its level, close to its nearest spot, and looking at it. */
export function findSeatInReach(seats: readonly FarmSeat[], player: FarmBodyPose): SeatInReach | null {
  let best: SeatInReach | null = null;
  let bestDistance = Infinity;
  for (const seat of seats) {
    if (Math.abs(player.y - seat.bottom) > LEVEL_TOLERANCE) continue;
    const point = seatPoint(seat, player);
    const distance = Math.hypot(point.x - player.x, point.z - player.z);
    if (distance > SEAT_REACH) continue;
    if (facingToward(player, point) < FACING_THRESHOLD) continue;
    if (distance < bestDistance) {
      best = { seat, point };
      bestDistance = distance;
    }
  }
  return best;
}

export const SEAT_PROMPT = "Press E to sit down";
export const SEATED_PROMPT = "Press E to stand up";

/** Pets are bodies with a pose; the nearest one in reach is the one E strokes. */
export function findPetInReach<T extends Readonly<{ pose: Readonly<{ x: number; z: number }> }>>(pets: readonly T[], player: FarmPlayerPose, reach = 2.2): T | null {
  return findVisitorInReach(player, pets, { radius: reach, facingThreshold: 0.4 });
}

export function getPetPrompt(name: string): string {
  return `Press E to pet ${name}`;
}

/** How far ahead of the player a carried pet is set down: its own radius past the arm's reach, so it never lands on the player's feet. */
export const PUT_DOWN_REACH = 0.9;

/** Where a carried pet would be set down: straight ahead of the player, at the reach plus the pet's own radius, facing away. */
export function putDownSpot(player: FarmPlayerPose & Readonly<{ yaw: number }>, radius: number): Readonly<{ x: number; z: number; yaw: number }> {
  const length = Math.hypot(player.forward.x, player.forward.z) || 1;
  const reach = PUT_DOWN_REACH + radius;
  return { x: player.x + (player.forward.x / length) * reach, z: player.z + (player.forward.z / length) * reach, yaw: player.yaw };
}

export function getPickUpPrompt(name: string): string {
  return `Press E to pick up ${name}`;
}

/** While carrying: E sets the pet down where the player looks, or says why it cannot. */
export function getPutDownPrompt(name: string, fits: boolean, onGround = true): string {
  if (!onGround) return `Come down to the ground to put ${name} down`;
  return fits ? `Press E to put ${name} down` : `No room here to put ${name} down`;
}

/** How much further ahead E will look for a spot when the nearest one is taken: through a doorway, over a sill. */
export const PUT_DOWN_EXTRA = Object.freeze([0, 0.3, 0.6, 0.9]);

/** The first spot ahead of the player, from the reach outward, that `fits`; null when none does. */
export function findPutDownSpot(player: FarmPlayerPose & Readonly<{ yaw: number }>, radius: number, fits: (spot: Readonly<{ x: number; z: number }>) => boolean): Readonly<{ x: number; z: number; yaw: number }> | null {
  for (const extra of PUT_DOWN_EXTRA) {
    const spot = putDownSpot(player, radius + extra);
    if (fits(spot)) return spot;
  }
  return null;
}
