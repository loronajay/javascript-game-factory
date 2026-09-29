// The herd: where every head of livestock is and what it is doing.
//
// Pure — no three.js, no DOM, no clock, no random of its own — and ticked at
// 60 Hz beside the pet sim, so a test can walk a herd for minutes under node
// and assert nobody leaves its home or walks through a rail. The bodies are
// the pets' own (`farm-pet-bodies.mts` with livestock options): this module
// hands them the same pose shape the pet sim does, and decides nothing about
// how anything looks.
//
// LIVESTOCK LIVE IN A HOME, PETS ROAM. An animal with a home
// (`farm-livestock-housing.mts`) is kept inside its box: in a pen or on the
// barn floor it strolls from spot to spot inside it, in a stable stall it
// stands in its place and turns now and then. An animal with no home (its
// pen was taken down, or it was bought before there was room) roams the open
// field like a pet until it is given one. The steering vocabulary — forward,
// turn toward, the walker's obstacle test — is the pet sim's, imported.

import { findLivestockSpecies, type LivestockSpecies } from "./farm-catalog/livestock.mjs";
import type { FloorObstacle, RoomBounds } from "./arcade-room-layout.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";
import { pondAt, type PondRegion } from "./farm-pond.mjs";
import { ATTENTION_SECONDS, PLAYER_CLEARANCE, petForward, turnToward, wrapAngle, yawToward, type PetBody } from "./farm-pets.mjs";
import { homeToWorld, insideHome, type LivestockHome } from "./farm-livestock-housing.mjs";

/** One animal as the sim is told about it: who it is and where it lives. */
export type HerdEntry = Readonly<{
  id: string;
  speciesId: string;
  /** What the tag over its head says. */
  name: string;
  coatId: string;
  /** Its size against a grown one (a young one is smaller). */
  sizeMultiplier: number;
  homeId: string | null;
}>;

export type HerdSimOptions = Readonly<{
  bounds: RoomBounds;
  random: () => number;
  obstacles: () => readonly FloorObstacle[];
  /** Buildings' boxes: a homeless animal never picks a stroll into one. */
  keepOut?: () => readonly FloorObstacle[];
  water?: () => readonly PondRegion[];
  homes: () => readonly LivestockHome[];
}>;

export type HerdSim = Readonly<{
  /** The poses the bodies draw: the pet sim's shape, the coat as its palette. */
  animals: () => readonly PetBody[];
  sync: (entries: readonly HerdEntry[]) => void;
  tick: (dt: number, player: Readonly<{ x: number; z: number }>) => void;
  attention: (id: string) => boolean;
  find: (id: string) => PetBody | null;
}>;

const IDLE_SECONDS = Object.freeze({ min: 2.5, max: 8 });
/** A stall's animal turns its head end round this often. */
const STALL_TURN_SECONDS = Object.freeze({ min: 6, max: 16 });
const ARRIVE_DISTANCE = 0.25;
const WANDER_RANGE = Object.freeze({ min: 0.8, max: 7 });
const TARGET_TRIES = 12;
const SPAWN_TRIES = 30;
const WALK_CONE = 0.6;
const FEELERS = Object.freeze([0, 0.5, -0.5, 1, -1]);
/** A body is tested against walls at this share of its radius: a cow's rump may brush a rail, it never crosses it. */
const SOLID_SHARE = 0.7;
/** How far into its home's box a body keeps, as a share of its radius. */
const HOME_SHARE = 0.8;
const GIVE_UP_SECONDS = 20;

type Animal = {
  id: string;
  speciesId: string;
  species: LivestockSpecies;
  name: string;
  coatId: string;
  sizeMultiplier: number;
  radius: number;
  homeId: string | null;
  x: number;
  z: number;
  yaw: number;
  state: "idle" | "wander" | "attention";
  moving: boolean;
  timer: number;
  targetX: number;
  targetZ: number;
  /** A stall's animal's resting yaw: it faces one of the stall's two long ways. */
  restYaw: number;
};

export function createHerdSim(options: HerdSimOptions): HerdSim {
  const { bounds, random, obstacles } = options;
  const keepOut = options.keepOut ?? (() => []);
  const water = options.water ?? (() => []);
  const herd: Animal[] = [];
  const halfWidth = bounds.width / 2 - bounds.wallInset;
  const halfDepth = bounds.depth / 2 - bounds.wallInset;

  function homeOf(animal: Animal): LivestockHome | null {
    return animal.homeId ? options.homes().find((entry) => entry.id === animal.homeId) ?? null : null;
  }

  function blockedBySolid(x: number, z: number, radius: number): boolean {
    const point = { x, z };
    return obstacles().some((obstacle) => obstacleBlocks(point, obstacle, radius * SOLID_SHARE));
  }

  function blockedByOther(x: number, z: number, self: Animal | null, radius: number): boolean {
    return herd.some((other) => other !== self && Math.hypot(other.x - x, other.z - z) < (other.radius + radius) * 0.85);
  }

  function inField(x: number, z: number, margin: number): boolean {
    return Math.abs(x) <= halfWidth - margin && Math.abs(z) <= halfDepth - margin;
  }

  /** Where this animal may stand: inside its home if it has one, else on the open field. */
  function allowed(animal: Animal, x: number, z: number, home: LivestockHome | null): boolean {
    if (home) return insideHome(home, { x, z }, animal.radius * HOME_SHARE) && !blockedBySolid(x, z, animal.radius);
    const point = { x, z };
    if (!inField(x, z, animal.radius)) return false;
    if (pondAt(water(), point, animal.radius * 0.6)) return false;
    if (keepOut().some((box) => obstacleBlocks(point, box, animal.radius))) return false;
    return !blockedBySolid(x, z, animal.radius);
  }

  function place(animal: Animal): void {
    const home = homeOf(animal);
    animal.state = "idle";
    animal.moving = false;
    if (home && !home.roam) {
      // A stall: in the middle of it, facing along it.
      const centre = homeToWorld(home, { x: 0, z: 0 });
      animal.x = centre.x;
      animal.z = centre.z;
      animal.restYaw = home.rotationY + (home.width >= home.depth ? Math.PI / 2 : 0) + (random() < 0.5 ? Math.PI : 0);
      animal.yaw = animal.restYaw;
      animal.timer = STALL_TURN_SECONDS.min + random() * (STALL_TURN_SECONDS.max - STALL_TURN_SECONDS.min);
      return;
    }
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt += 1) {
      const spot = home
        ? homeToWorld(home, { x: (random() - 0.5) * home.width, z: (random() - 0.5) * home.depth })
        : { x: (random() * 2 - 1) * (halfWidth - animal.radius - 1), z: (random() * 2 - 1) * (halfDepth - animal.radius - 1) };
      if (!allowed(animal, spot.x, spot.z, home) || blockedByOther(spot.x, spot.z, animal, animal.radius)) continue;
      animal.x = spot.x;
      animal.z = spot.z;
      animal.yaw = random() * Math.PI * 2;
      startIdle(animal);
      return;
    }
    // A crowded home: its middle, shoulder to shoulder with whoever is there.
    const fallback = home ? homeToWorld(home, { x: 0, z: 0 }) : { x: (random() - 0.5) * 4, z: halfDepth * 0.5 };
    animal.x = fallback.x;
    animal.z = fallback.z;
    startIdle(animal);
  }

  function startIdle(animal: Animal): void {
    animal.state = "idle";
    animal.timer = IDLE_SECONDS.min + random() * (IDLE_SECONDS.max - IDLE_SECONDS.min);
  }

  function pickTarget(animal: Animal, home: LivestockHome | null): boolean {
    for (let attempt = 0; attempt < TARGET_TRIES; attempt += 1) {
      const spot = home
        ? homeToWorld(home, { x: (random() - 0.5) * home.width, z: (random() - 0.5) * home.depth })
        : (() => {
            const range = WANDER_RANGE.min + random() * (WANDER_RANGE.max - WANDER_RANGE.min);
            const angle = random() * Math.PI * 2;
            return { x: animal.x + Math.cos(angle) * range, z: animal.z + Math.sin(angle) * range };
          })();
      if (Math.hypot(spot.x - animal.x, spot.z - animal.z) < ARRIVE_DISTANCE * 2) continue;
      if (!allowed(animal, spot.x, spot.z, home) || blockedByOther(spot.x, spot.z, animal, animal.radius)) continue;
      animal.targetX = spot.x;
      animal.targetZ = spot.z;
      return true;
    }
    return false;
  }

  function stepAlong(animal: Animal, heading: number, distance: number, home: LivestockHome | null, player: Readonly<{ x: number; z: number }>): boolean {
    for (const feeler of FEELERS) {
      const direction = petForward(heading + feeler);
      const x = animal.x + direction.x * distance;
      const z = animal.z + direction.z * distance;
      if (!allowed(animal, x, z, home)) continue;
      if (blockedByOther(x, z, animal, animal.radius)) continue;
      if (Math.hypot(player.x - x, player.z - z) < PLAYER_CLEARANCE * 0.7 + animal.radius * 0.5) continue;
      animal.x = x;
      animal.z = z;
      return true;
    }
    return false;
  }

  function tickAnimal(animal: Animal, dt: number, player: Readonly<{ x: number; z: number }>): void {
    animal.moving = false;
    const { species } = animal;
    const home = homeOf(animal);
    if (animal.state === "attention") {
      animal.yaw = turnToward(animal.yaw, yawToward(animal, player), species.turnRate * 1.5, dt);
      animal.timer -= dt;
      if (animal.timer <= 0) startIdle(animal);
      return;
    }
    if (home && !home.roam) {
      // A stall: settle back to the resting way, and every so often face the other way.
      animal.yaw = turnToward(animal.yaw, animal.restYaw, species.turnRate * 0.5, dt);
      animal.timer -= dt;
      if (animal.timer <= 0) {
        animal.restYaw = wrapAngle(animal.restYaw + Math.PI);
        animal.timer = STALL_TURN_SECONDS.min + random() * (STALL_TURN_SECONDS.max - STALL_TURN_SECONDS.min);
      }
      return;
    }
    if (animal.state === "idle") {
      animal.timer -= dt;
      if (animal.timer > 0) return;
      if (pickTarget(animal, home)) {
        animal.state = "wander";
        animal.timer = 0;
      } else startIdle(animal);
      return;
    }
    const remaining = Math.hypot(animal.targetX - animal.x, animal.targetZ - animal.z);
    if (remaining <= ARRIVE_DISTANCE) {
      startIdle(animal);
      return;
    }
    const wanted = yawToward(animal, { x: animal.targetX, z: animal.targetZ });
    animal.yaw = turnToward(animal.yaw, wanted, species.turnRate, dt);
    if (Math.abs(wrapAngle(wanted - animal.yaw)) <= WALK_CONE) {
      const pace = 0.75 + 0.25 * animal.sizeMultiplier;
      if (stepAlong(animal, animal.yaw, Math.min(species.walkSpeed * pace * dt, remaining), home, player)) animal.moving = true;
      else startIdle(animal);
    }
    animal.timer += dt;
    if (animal.timer > GIVE_UP_SECONDS) startIdle(animal);
  }

  function view(animal: Animal): PetBody {
    return {
      instanceId: animal.id,
      speciesId: animal.speciesId,
      name: animal.name,
      x: animal.x,
      z: animal.z,
      yaw: animal.yaw,
      hover: 0,
      sizeMultiplier: animal.sizeMultiplier,
      paletteId: animal.coatId,
      radius: animal.radius,
      state: animal.state === "wander" ? "wander" : animal.state === "attention" ? "attention" : "idle",
      moving: animal.moving,
      pace: 0.75 + 0.25 * animal.sizeMultiplier,
    };
  }

  return Object.freeze({
    animals: () => herd.map(view),
    sync(entries) {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      for (let index = herd.length - 1; index >= 0; index -= 1) {
        const animal = herd[index]!;
        const entry = byId.get(animal.id);
        if (!entry || entry.speciesId !== animal.speciesId) {
          herd.splice(index, 1);
          continue;
        }
        const moved = entry.homeId !== animal.homeId;
        animal.name = entry.name;
        animal.coatId = entry.coatId;
        animal.sizeMultiplier = entry.sizeMultiplier;
        animal.radius = animal.species.radius * entry.sizeMultiplier;
        animal.homeId = entry.homeId;
        // A new home, or a home that moved out from under it (the pen was carried in build mode): put it back in.
        const home = homeOf(animal);
        const stray = home ? !insideHome(home, animal, 0) : !inField(animal.x, animal.z, 0);
        if (moved || stray) place(animal);
      }
      for (const entry of entries) {
        if (herd.some((animal) => animal.id === entry.id)) continue;
        const species = findLivestockSpecies(entry.speciesId);
        if (!species) continue;
        const animal: Animal = {
          id: entry.id,
          speciesId: species.id,
          species,
          name: entry.name,
          coatId: entry.coatId,
          sizeMultiplier: entry.sizeMultiplier,
          radius: species.radius * entry.sizeMultiplier,
          homeId: entry.homeId,
          x: 0,
          z: 0,
          yaw: 0,
          state: "idle",
          moving: false,
          timer: 0,
          targetX: 0,
          targetZ: 0,
          restYaw: 0,
        };
        herd.push(animal);
        place(animal);
      }
    },
    tick(dt, player) {
      for (const animal of herd) tickAnimal(animal, dt, player);
    },
    attention(id) {
      const animal = herd.find((entry) => entry.id === id);
      if (!animal) return false;
      animal.state = "attention";
      animal.timer = ATTENTION_SECONDS;
      animal.moving = false;
      return true;
    },
    find(id) {
      const animal = herd.find((entry) => entry.id === id);
      return animal ? view(animal) : null;
    },
  });
}
