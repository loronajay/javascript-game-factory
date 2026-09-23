// The pet engine: where every animal on the farm is and what it is doing.
//
// Pure — no three.js, no DOM, no clock, no random of its own — and ticked at 60 Hz by
// the page's accumulator, so the same farm plays out the same way under node
// (the test walks it for minutes and asserts nobody leaves the field, enters
// a wall, or stands inside another animal). `farm-pet-bodies.mts` draws what
// this says and never decides anything.
//
// A PET IS A LITTLE STATE MACHINE: `idle` (standing, counting down to the next
// stroll) → `wander` (turning to and walking at a target it picked) → `idle`,
// with `attention` (turn to face the player and hold still) cutting in from
// outside. Attention is the hook for every later command — call, treat, sit
// interrupt into it and add their own states beside it, never inside bodies.
//
// PETS ROAM, THEY ARE NOT PLACED. A layout row has no position; `sync` gives a
// new row a free spot and keeps the spot of a row it already knows, so a rename
// or a save never teleports anybody.
//
// HABITAT DECIDES THE GROUND. A ground or air animal walks the field and keeps
// out of every solid thing and every pond; a water animal lives INSIDE a pond
// — its whole world is the ellipse inscribed in a pond row's box — and only a
// pond that moves out from under it makes `sync` find it a new one.
//
// A PET CAN BE CARRIED. `pickUp` puts a ground or air animal in the player's
// arms — the `carried` state rides the player's pose each tick, a hand's
// reach ahead and off the ground — and `putDown` sets it on a spot the caller
// asks for if a body of its size fits there. That spot may be INDOORS: the
// keep-out boxes only stop a pet from CHOOSING a building as a destination,
// and a pet that already stands inside one is free to wander what it can see
// of the inside. Wander targets are picked by line of sight (`canSee`), never
// through a wall, which is what makes a stall with its door shut a pen: the
// pet strolls the stall and never picks the field beyond the door.

import { findAnimal, type AnimalDefinition } from "./farm-catalog/animals.mjs";
import type { FarmLayout } from "./farm-layout.mjs";
import type { FloorObstacle, RoomBounds } from "./arcade-room-layout.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";

export type PetState = "idle" | "wander" | "attention" | "carried";

export type PetBody = Readonly<{
  instanceId: string;
  speciesId: string;
  name: string;
  x: number;
  z: number;
  /** Facing, the walker's convention: yaw 0 looks down −z. */
  yaw: number;
  /** Metres above the ground; air species hover, everyone else is 0. */
  hover: number;
  state: PetState;
  /** True on a tick the pet actually covered ground: what picks the walk clip. */
  moving: boolean;
}>;

type Pet = {
  instanceId: string;
  speciesId: string;
  name: string;
  species: AnimalDefinition;
  x: number;
  z: number;
  yaw: number;
  hover: number;
  state: PetState;
  moving: boolean;
  /** Seconds left in the current state. */
  timer: number;
  targetX: number;
  targetZ: number;
  /** Bob phase for air species. */
  phase: number;
};

export type PetSimOptions = Readonly<{
  bounds: RoomBounds;
  /** Uniform [0, 1); injected so a test can seed it. */
  random: () => number;
  /** Everything solid right now (the barn as walls, the doors when shut). */
  obstacles: () => readonly FloorObstacle[];
  /** Places a pet must not pick as a destination even if walkable (the barn's whole box), so animals stay outdoors. */
  keepOut?: () => readonly FloorObstacle[];
  /** The ponds: the boxes whose inscribed ellipses are where water species live. */
  water?: () => readonly FloorObstacle[];
}>;

export type PetSim = Readonly<{
  pets: () => readonly PetBody[];
  /** Match the bodies to the layout's rows: new rows spawn, gone rows leave, known rows keep their spot. */
  sync: (layout: FarmLayout) => void;
  /** The player's pose; `yaw` is what a carried pet rides along. */
  tick: (dt: number, player: Readonly<{ x: number; z: number; yaw?: number }>) => void;
  /** Make a pet turn to the player and hold still for a moment; false if no such pet. */
  attention: (instanceId: string) => boolean;
  /** Lift a pet into the player's arms; false for a swimmer (it stays in its pond) or a pet that is not there. */
  pickUp: (instanceId: string) => boolean;
  /** Set a carried pet down at `spot`, facing `yaw`; false (and still carried) when a body its size does not fit there. */
  putDown: (instanceId: string, spot: Readonly<{ x: number; z: number; yaw: number }>) => boolean;
  /** True when a pet of this species could stand at the spot right now: inside the field, out of every solid, clear of the others. */
  canStand: (speciesId: string, spot: Readonly<{ x: number; z: number }>) => boolean;
  /** The pet in the player's arms, if any. */
  carried: () => PetBody | null;
  find: (instanceId: string) => PetBody | null;
}>;

export const ATTENTION_SECONDS = 3;
/** How close a pet will come to the player before it stops or turns away. */
export const PLAYER_CLEARANCE = 1.1;
/** A carried pet rides this far ahead of the player and this far off the ground (its feet). */
export const CARRY_REACH = 0.75;
export const CARRY_HEIGHT = 0.62;
const IDLE_SECONDS = Object.freeze({ min: 1.5, max: 5 });
const ARRIVE_DISTANCE = 0.3;
const WANDER_RANGE = Object.freeze({ min: 1, max: 9 });
/** How finely a line of sight is sampled for walls, in metres. */
const SIGHT_STEP = 0.25;
const TARGET_TRIES = 12;
const SPAWN_TRIES = 40;
/** How far off its heading a pet may be and still walk (it turns while it walks past this). */
const WALK_CONE = 0.6;
const FEELERS = Object.freeze([0, 0.55, -0.55, 1.1, -1.1]);
const BOB_RATE = 2.2;
const BOB_HEIGHT = 0.12;
/** Water species stay this far, in ellipse fraction, inside the bank so a fin never crosses the shore. */
const WATER_MARGIN = 0.08;

/** True when the point is inside the ellipse inscribed in the box, shrunk by `margin` metres. */
export function insideWaterRegion(point: Readonly<{ x: number; z: number }>, region: FloorObstacle, margin = 0): boolean {
  const dx = point.x - region.x;
  const dz = point.z - region.z;
  const cosine = Math.cos(region.rotationY);
  const sine = Math.sin(region.rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  const radiusX = region.footprint.width / 2 - margin;
  const radiusZ = region.footprint.depth / 2 - margin;
  if (radiusX <= 0 || radiusZ <= 0) return false;
  return (localX * localX) / (radiusX * radiusX) + (localZ * localZ) / (radiusZ * radiusZ) <= (1 - WATER_MARGIN) * (1 - WATER_MARGIN);
}

export function petForward(yaw: number): Readonly<{ x: number; z: number }> {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function yawToward(from: Readonly<{ x: number; z: number }>, to: Readonly<{ x: number; z: number }>): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function turnToward(yaw: number, target: number, rate: number, dt: number): number {
  const delta = wrapAngle(target - yaw);
  const step = rate * dt;
  return Math.abs(delta) <= step ? target : yaw + Math.sign(delta) * step;
}

export function createPetSim(options: PetSimOptions): PetSim {
  const { bounds, random, obstacles } = options;
  const keepOut = options.keepOut ?? (() => []);
  const water = options.water ?? (() => []);
  const pets: Pet[] = [];
  const halfWidth = bounds.width / 2 - bounds.wallInset;
  const halfDepth = bounds.depth / 2 - bounds.wallInset;

  function inField(x: number, z: number, margin: number): boolean {
    return Math.abs(x) <= halfWidth - margin && Math.abs(z) <= halfDepth - margin;
  }

  function blockedBySolid(x: number, z: number, radius: number): boolean {
    const point = { x, z };
    return obstacles().some((obstacle) => obstacleBlocks(point, obstacle, radius));
  }

  function blockedByKeepOut(x: number, z: number, radius: number): boolean {
    const point = { x, z };
    return keepOut().some((box) => obstacleBlocks(point, box, radius));
  }

  function blockedByPet(x: number, z: number, self: Pet | null, radius: number): boolean {
    return pets.some((other) => other !== self && other.state !== "carried" && Math.hypot(other.x - x, other.z - z) < other.species.radius + radius);
  }

  /** True when nothing solid stands between the pet and the target: the segment is sampled every `SIGHT_STEP` at the pet's own radius. */
  function canSee(pet: Pet, target: Readonly<{ x: number; z: number }>): boolean {
    const dx = target.x - pet.x;
    const dz = target.z - pet.z;
    const distance = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(distance / SIGHT_STEP));
    const solids = obstacles();
    for (let index = 1; index <= steps; index += 1) {
      const point = { x: pet.x + dx * (index / steps), z: pet.z + dz * (index / steps) };
      if (solids.some((obstacle) => obstacleBlocks(point, obstacle, pet.species.radius * 0.6))) return false;
    }
    return true;
  }

  function blockedByPlayer(x: number, z: number, player: Readonly<{ x: number; z: number }>, radius: number): boolean {
    return Math.hypot(player.x - x, player.z - z) < PLAYER_CLEARANCE + radius * 0.5;
  }

  function inWater(x: number, z: number, radius: number): boolean {
    const point = { x, z };
    return water().some((region) => insideWaterRegion(point, region, radius));
  }

  /**
   * A spot the pet may stand on. On land: inside the field, out of every solid, out of
   * the keep-out boxes, clear of the others. In water: inside a pond, clear of the others.
   */
  function standable(x: number, z: number, self: Pet | null, species: AnimalDefinition): boolean {
    const radius = species.radius;
    if (species.habitat === "water") return inWater(x, z, radius) && !blockedByPet(x, z, self, radius);
    return inField(x, z, radius) && !blockedBySolid(x, z, radius) && !blockedByKeepOut(x, z, radius) && !blockedByPet(x, z, self, radius);
  }

  /** Player placement may deliberately put a ground/air pet inside a building; swimmers still require actual water. */
  function placeable(x: number, z: number, self: Pet | null, species: AnimalDefinition): boolean {
    const radius = species.radius;
    if (species.habitat === "water") return inWater(x, z, radius) && !blockedByPet(x, z, self, radius);
    return inField(x, z, radius) && !blockedBySolid(x, z, radius) && !blockedByPet(x, z, self, radius);
  }

  function spawnSpot(species: AnimalDefinition): Readonly<{ x: number; z: number }> {
    if (species.habitat === "water") {
      const ponds = water();
      for (let attempt = 0; attempt < SPAWN_TRIES && ponds.length > 0; attempt += 1) {
        const pond = ponds[Math.min(ponds.length - 1, Math.floor(random() * ponds.length))];
        const x = pond.x + (random() * 2 - 1) * pond.footprint.width / 2;
        const z = pond.z + (random() * 2 - 1) * pond.footprint.depth / 2;
        if (standable(x, z, null, species)) return { x, z };
      }
      // No room in any pond: the middle of the first one, or the field's centre if there is none.
      return ponds[0] ? { x: ponds[0].x, z: ponds[0].z } : { x: 0, z: 0 };
    }
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt += 1) {
      const x = (random() * 2 - 1) * (halfWidth - species.radius - 1);
      const z = (random() * 2 - 1) * (halfDepth - species.radius - 1);
      if (standable(x, z, null, species)) return { x, z };
    }
    // A crowded field: the middle of the south half is always open ground.
    return { x: (random() - 0.5) * 4, z: halfDepth * 0.5 };
  }

  /** A ground pet that stands inside a building's box was put there; the box is its room now, not a place to keep out of. */
  function indoors(pet: Pet): boolean {
    return pet.species.habitat !== "water" && blockedByKeepOut(pet.x, pet.z, 0);
  }

  function pickTarget(pet: Pet): boolean {
    const inside = indoors(pet);
    for (let attempt = 0; attempt < TARGET_TRIES; attempt += 1) {
      // An indoor pet strolls short distances: its room is small.
      const min = inside ? 0.4 : WANDER_RANGE.min;
      const max = inside ? 3 : WANDER_RANGE.max;
      const range = min + random() * (max - min);
      const angle = random() * Math.PI * 2;
      const x = pet.x + Math.cos(angle) * range;
      const z = pet.z + Math.sin(angle) * range;
      if (pet.species.habitat === "water") {
        if (!standable(x, z, pet, pet.species)) continue;
      } else {
        if (!inField(x, z, pet.species.radius) || blockedBySolid(x, z, pet.species.radius) || blockedByPet(x, z, pet, pet.species.radius)) continue;
        if (!inside && blockedByKeepOut(x, z, pet.species.radius)) continue;
        if (!canSee(pet, { x, z })) continue;
      }
      pet.targetX = x;
      pet.targetZ = z;
      return true;
    }
    return false;
  }

  /** Where a carried pet sits: a hand's reach ahead of the player, facing the way the player faces. */
  function carryPose(player: Readonly<{ x: number; z: number; yaw?: number }>): Readonly<{ x: number; z: number; yaw: number }> {
    const yaw = player.yaw ?? 0;
    const forward = petForward(yaw);
    return { x: player.x + forward.x * CARRY_REACH, z: player.z + forward.z * CARRY_REACH, yaw };
  }

  function startIdle(pet: Pet): void {
    pet.state = "idle";
    pet.timer = IDLE_SECONDS.min + random() * (IDLE_SECONDS.max - IDLE_SECONDS.min);
  }

  /** One step along the heading if the ground there is free, else along the first free feeler; false if nowhere to go. */
  function stepAlong(pet: Pet, heading: number, distance: number, player: Readonly<{ x: number; z: number }>): boolean {
    for (const feeler of FEELERS) {
      const direction = petForward(heading + feeler);
      const x = pet.x + direction.x * distance;
      const z = pet.z + direction.z * distance;
      if (pet.species.habitat === "water") {
        if (!inWater(x, z, pet.species.radius)) continue;
      } else {
        if (!inField(x, z, pet.species.radius)) continue;
        if (blockedBySolid(x, z, pet.species.radius)) continue;
      }
      if (blockedByPet(x, z, pet, pet.species.radius)) continue;
      if (blockedByPlayer(x, z, player, pet.species.radius)) continue;
      pet.x = x;
      pet.z = z;
      return true;
    }
    return false;
  }

  function tickPet(pet: Pet, dt: number, player: Readonly<{ x: number; z: number; yaw?: number }>): void {
    pet.moving = false;
    const { species } = pet;
    if (pet.state === "carried") {
      const pose = carryPose(player);
      pet.x = pose.x;
      pet.z = pose.z;
      pet.yaw = pose.yaw;
      pet.hover = CARRY_HEIGHT + (species.habitat === "air" ? 0.2 : 0);
      return;
    }
    if (pet.state === "attention") {
      pet.yaw = turnToward(pet.yaw, yawToward(pet, player), species.turnRate * 1.5, dt);
      pet.timer -= dt;
      if (pet.timer <= 0) startIdle(pet);
    } else if (pet.state === "idle") {
      pet.timer -= dt;
      if (pet.timer <= 0) {
        if (pickTarget(pet)) {
          pet.state = "wander";
          pet.timer = 0;
        } else {
          startIdle(pet);
        }
      }
    } else {
      const target = { x: pet.targetX, z: pet.targetZ };
      const remaining = Math.hypot(target.x - pet.x, target.z - pet.z);
      if (remaining <= ARRIVE_DISTANCE) {
        startIdle(pet);
      } else {
        const wanted = yawToward(pet, target);
        pet.yaw = turnToward(pet.yaw, wanted, species.turnRate, dt);
        if (Math.abs(wrapAngle(wanted - pet.yaw)) <= WALK_CONE) {
          const distance = Math.min(species.walkSpeed * dt, remaining);
          if (stepAlong(pet, pet.yaw, distance, player)) {
            pet.moving = true;
          } else {
            // Boxed in: give the stroll up rather than push at the wall.
            startIdle(pet);
          }
        }
        // A stroll that drags on (a target behind something) is abandoned.
        pet.timer += dt;
        if (pet.timer > 20) startIdle(pet);
      }
    }
    if (species.habitat === "air") {
      pet.phase += dt * BOB_RATE;
      pet.hover = species.hoverHeight + Math.sin(pet.phase) * BOB_HEIGHT;
    } else if (species.habitat === "water") {
      // A slower, shallower bob: a body riding the surface.
      pet.phase += dt * BOB_RATE * 0.5;
      pet.hover = species.hoverHeight + Math.sin(pet.phase) * BOB_HEIGHT * 0.4;
    }
  }

  return Object.freeze({
    pets: () => pets.map((pet) => ({
      instanceId: pet.instanceId,
      speciesId: pet.speciesId,
      name: pet.name,
      x: pet.x,
      z: pet.z,
      yaw: pet.yaw,
      hover: pet.hover,
      state: pet.state,
      moving: pet.moving,
    })),
    sync(layout) {
      const rows = new Map(layout.pets.map((row) => [row.instanceId, row]));
      for (let index = pets.length - 1; index >= 0; index -= 1) {
        const row = rows.get(pets[index].instanceId);
        if (!row || row.speciesId !== pets[index].speciesId) pets.splice(index, 1);
        else pets[index].name = row.name;
      }
      // A pond that moved or went while a swimmer was in it: find the swimmer new water.
      for (const pet of pets) {
        if (pet.state === "carried" || pet.species.habitat !== "water" || inWater(pet.x, pet.z, pet.species.radius)) continue;
        const spot = spawnSpot(pet.species);
        pet.x = spot.x;
        pet.z = spot.z;
        pet.targetX = spot.x;
        pet.targetZ = spot.z;
        startIdle(pet);
      }
      for (const row of layout.pets) {
        if (pets.some((pet) => pet.instanceId === row.instanceId)) continue;
        const species = findAnimal(row.speciesId);
        if (!species) continue;
        const spot = spawnSpot(species);
        const pet: Pet = {
          instanceId: row.instanceId,
          speciesId: row.speciesId,
          name: row.name,
          species,
          x: spot.x,
          z: spot.z,
          yaw: random() * Math.PI * 2,
          hover: species.habitat === "ground" ? 0 : species.hoverHeight,
          state: "idle",
          moving: false,
          timer: 0,
          targetX: spot.x,
          targetZ: spot.z,
          phase: random() * Math.PI * 2,
        };
        startIdle(pet);
        pets.push(pet);
      }
    },
    tick(dt, player) {
      for (const pet of pets) tickPet(pet, dt, player);
    },
    pickUp(instanceId) {
      const pet = pets.find((candidate) => candidate.instanceId === instanceId);
      if (!pet || pet.state === "carried") return false;
      pet.state = "carried";
      pet.moving = false;
      pet.timer = 0;
      return true;
    },
    putDown(instanceId, spot) {
      const pet = pets.find((candidate) => candidate.instanceId === instanceId);
      if (!pet || pet.state !== "carried") return false;
      if (!placeable(spot.x, spot.z, pet, pet.species)) return false;
      pet.x = spot.x;
      pet.z = spot.z;
      pet.yaw = spot.yaw;
      pet.targetX = spot.x;
      pet.targetZ = spot.z;
      pet.hover = pet.species.habitat === "ground" ? 0 : pet.species.hoverHeight;
      startIdle(pet);
      return true;
    },
    canStand(speciesId, spot) {
      const species = findAnimal(speciesId);
      return Boolean(species && placeable(spot.x, spot.z, null, species));
    },
    carried() {
      const pet = pets.find((candidate) => candidate.state === "carried");
      return pet ? { instanceId: pet.instanceId, speciesId: pet.speciesId, name: pet.name, x: pet.x, z: pet.z, yaw: pet.yaw, hover: pet.hover, state: pet.state, moving: pet.moving } : null;
    },
    attention(instanceId) {
      const pet = pets.find((candidate) => candidate.instanceId === instanceId);
      if (!pet) return false;
      pet.state = "attention";
      pet.timer = ATTENTION_SECONDS;
      pet.moving = false;
      return true;
    },
    find(instanceId) {
      const pet = pets.find((candidate) => candidate.instanceId === instanceId);
      return pet ? { instanceId: pet.instanceId, speciesId: pet.speciesId, name: pet.name, x: pet.x, z: pet.z, yaw: pet.yaw, hover: pet.hover, state: pet.state, moving: pet.moving } : null;
    },
  });
}
