// The farm's fixed geometry as DATA — where the field ends, where the player
// arrives, how a barn is built — and the one place the layout's decor rows
// become the solid things the walker and the pet sim collide with.
//
// Pure — no THREE, no DOM. `farm-world.mts` draws the rows; `farmObstacles()`
// turns them into the `FloorObstacle` shape the room's placement and walking
// share, so one list says what is solid. Nothing on the field is fixed any
// more: the barn, the fence and the trees are catalog rows on the layout
// (`STARTER_FARM_DECOR` seeds them) and this file keeps only the bounds, the
// spawn and how a building's SHELL becomes walls.
//
// EVERY BUILDING IS ENTERABLE. `shellWalls` (in `farm-shell.mts`) is the one
// description of a building's walls: the builders in `farm-props-buildings.mts`
// draw exactly these boxes and `buildingObstacles` hands the same boxes to the
// walker, so a doorway the eye sees is a doorway the body fits through.
//
// EVERYTHING INSIDE IS SOLID TOO. `farm-fixtures.mts` lists what stands in a
// building (and the seat on a bench) the same way, and this file turns those
// into obstacles WITH A HEIGHT (`FarmObstacle`), platforms the body can stand
// on, ladders it can climb and seats it can sit on — all on the field, in
// world space, for `farm-body.mts` and the interaction rules to read.

import { FARM_BOUNDS, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";
import { farmDecorFootprint, findFarmDecor, type BuildingShell, type FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import { buildingLocalToWorld, roundFace, shellWalls, type ShellWall } from "./farm-shell.mjs";
import { farmFixtures, fixtureDoorPose, fixtureLocalToItem, ladderExit, ladderFoot, type FarmFixture } from "./farm-fixtures.mjs";
import type { FarmLadder, FarmObstacle, FarmPlatform, FarmSeat } from "./farm-body.mjs";
import type { FloorObstacle, RoomBounds } from "./arcade-room-layout.mjs";
import { aquaticBase, homePond, pondRegions, type PondRegion } from "./farm-pond.mjs";

export { buildingLocalToWorld, roundFace, shellWalls, type ShellWall };
export const barnLocalToWorld = buildingLocalToWorld;

type Pose = Readonly<{ x: number; z: number; rotationY: number }>;
type Building = Readonly<{ footprint: Readonly<{ width: number; depth: number }>; shell: BuildingShell | null }>;


/** The gate is in the middle of the south fence; the player spawns just inside it looking north. */
export const FARM_SPAWN: Readonly<{ x: number; z: number; yaw: number }> = Object.freeze({ x: 0, z: FARM_BOUNDS.depth / 2 - 2.2, yaw: 0 });
export const GATE_WIDTH = 2.4;

/** Eye height while walking: the room's, so the two spaces feel like the same body. */
export const EYE_HEIGHT = 1.68;

export function farmBounds(): RoomBounds {
  return FARM_BOUNDS;
}

/**
 * The barn's shell, in its own frame — kept as the named constant the barn
 * builder and the door tests read. It is the catalog's barn row, not a second
 * source: `width`/`depth` are its footprint and the rest is its `shell`.
 */
const BARN_DEFINITION = findFarmDecor("decor.building.barn")!;
export const BARN = Object.freeze({
  width: BARN_DEFINITION.footprint.width,
  depth: BARN_DEFINITION.footprint.depth,
  wallThickness: BARN_DEFINITION.shell!.wallThickness,
  wallHeight: BARN_DEFINITION.shell!.wallHeight,
  /** The roof's rise above the wall top, and the overhang past the walls. Steep enough to stand on the loft under it. */
  roofRise: 2.6,
  roofOverhang: 0.4,
  doorWidth: BARN_DEFINITION.shell!.door!.width,
  doorHeight: BARN_DEFINITION.shell!.door!.height,
  /** Metres the player must stand within of the door's centre to work it. */
  doorReach: BARN_DEFINITION.shell!.door!.reach,
});

/** A building's walls on the field, as the obstacles the walker and the pet sim read. A wall is as tall as the sky: nothing walks over it from a loft. */
export function buildingObstacles(building: Building, row: Pose, doorsOpen: boolean, prefix: string): FarmObstacle[] {
  return shellWalls(building, doorsOpen).map((wall) => {
    const world = buildingLocalToWorld(row, wall);
    return { instanceId: `${prefix}-${wall.name}`, x: world.x, z: world.z, rotationY: row.rotationY + wall.rotationY, footprint: { width: wall.length, depth: wall.thickness }, bottom: 0, top: Infinity };
  });
}

/** The id a fixture's obstacle carries on the field, and — for a door — the id its open state is kept under. */
function fixtureId(prefix: string, entry: FarmFixture): string {
  return `${prefix}-${entry.name}`;
}

/** A fixture's box on the field. A door's box stands where its leaf does: shut across its opening, or swung open on its hinge. */
function fixtureBox(row: Pose, entry: FarmFixture, prefix: string, open: boolean): FarmObstacle {
  const local = entry.kind === "door" ? fixtureDoorPose(entry, open) : entry;
  const world = buildingLocalToWorld(row, local);
  return { instanceId: fixtureId(prefix, entry), x: world.x, z: world.z, rotationY: row.rotationY + local.rotationY, footprint: { width: entry.width, depth: entry.depth }, bottom: entry.bottom, top: entry.top };
}

const NO_DOORS: ReadonlySet<string> = new Set<string>();

/** Every fixture of a row as a solid on the field — furniture, lofts, ladders, seats, rails, doors; each blocks a body whose span crosses its own. */
export function fixtureObstacles(definition: FarmDecorDefinition, row: Pose, prefix: string, openDoors: ReadonlySet<string> = NO_DOORS): FarmObstacle[] {
  return farmFixtures(definition).map((entry) => fixtureBox(row, entry, prefix, openDoors.has(fixtureId(prefix, entry))));
}

/** The barn as walls: the generic shell walls for the catalog's barn row. */
export function barnObstacles(row: Pose, doorsOpen: boolean, prefix = "barn"): FarmObstacle[] {
  return buildingObstacles(BARN_DEFINITION, row, doorsOpen, prefix);
}

/** Where a building's door is on the field, and the direction it faces (out of the building), or null when it has none. */
export function buildingDoor(building: Building, row: Pose): Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }> | null {
  const shell = building.shell;
  if (!shell?.door) return null;
  const localZ = shell.kind === "round" ? roundFace(shell, building.footprint, 0).apothem : building.footprint.depth / 2;
  const centre = buildingLocalToWorld(row, { x: 0, z: localZ });
  const outward = buildingLocalToWorld(row, { x: 0, z: 1 });
  return { x: centre.x, z: centre.z, forward: { x: outward.x - row.x, z: outward.z - row.z } };
}

/** The barn's door: the generic door for the catalog's barn row. */
export function barnDoor(row: Pose): Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }> {
  return buildingDoor(BARN_DEFINITION, row)!;
}

export type FarmObstacleState = Readonly<{
  /** The doors standing open right now, by door id: a building's or a gate's is its instance id, a fixture door's is `<instanceId>-<name>`. */
  openDoors: ReadonlySet<string>;
}>;

const NO_OPEN_DOORS: FarmObstacleState = Object.freeze({ openDoors: new Set<string>() });

/** The box a row covers on the ground, with the catalog's footprint (a fence's is its length). As tall as the sky: nothing is walked over. */
export function decorRowBox(item: FarmDecorRow): FarmObstacle | null {
  const definition = findFarmDecor(item.itemId);
  if (!definition) return null;
  return { instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint: farmDecorFootprint(definition, item), bottom: 0, top: Infinity };
}

/**
 * Everything solid on the field, in the shape the walker and the pet sim read,
 * each with the heights it spans. A building with doors is its walls, not a
 * box, so the player can go inside, and what stands inside it is solid too;
 * everything else solid is its footprint plus its fixtures. Flower beds take
 * no space; a gate takes space only while it is shut; a door fixture takes
 * space wherever its leaf stands, shut or swung open.
 */
export function farmObstacles(layout: Readonly<{ decor: readonly FarmDecorRow[] }>, state: FarmObstacleState = NO_OPEN_DOORS): FarmObstacle[] {
  const ponds = pondRegions(layout);
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition || !definition.solid) return [];
    const fixtures = fixtureObstacles(definition, item, item.instanceId, state.openDoors);
    if (definition.shell) return [...buildingObstacles(definition, item, state.openDoors.has(item.instanceId), item.instanceId), ...fixtures];
    if (definition.gate && state.openDoors.has(item.instanceId)) return fixtures;
    // An aquatic dwelling stands on the pond bed, so its box starts down there: a wader on the bed walks into it, not through it.
    if (definition.aquatic) return [{ ...decorRowBox(item)!, bottom: decorBaseHeight(item, ponds) }, ...fixtures];
    return [decorRowBox(item)!, ...fixtures];
  });
}

/** How high a placed row's base stands: 0 on the field, the bed for an aquatic dwelling in a pond. */
export function decorBaseHeight(item: FarmDecorRow, ponds: readonly PondRegion[] = []): number {
  const definition = findFarmDecor(item.itemId);
  if (!definition?.aquatic) return 0;
  const pond = homePond(ponds, item);
  return pond ? aquaticBase(decorRowBox(item)!, pond) : 0;
}

/** Every floor a body can stand on above the ground: the lofts and catwalks of the buildings on the field. */
export function farmPlatforms(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): FarmPlatform[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition) return [];
    return farmFixtures(definition).filter((entry) => entry.kind === "platform").map((entry) => {
      const world = buildingLocalToWorld(item, entry);
      return { id: `${item.instanceId}-${entry.name}`, x: world.x, z: world.z, rotationY: item.rotationY + entry.rotationY, width: entry.width, depth: entry.depth, top: entry.top };
    });
  });
}

/** Every ladder on the field, with where a climber stands at its foot and where it steps off at the top. */
export function farmLadders(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): FarmLadder[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition) return [];
    const fixtures = farmFixtures(definition);
    return fixtures.filter((entry) => entry.kind === "ladder").flatMap((entry) => {
      const platform = fixtures.find((candidate) => candidate.kind === "platform" && candidate.name === entry.climbsTo);
      if (!platform) return [];
      const centre = buildingLocalToWorld(item, entry);
      return [{
        id: `${item.instanceId}-${entry.name}`,
        x: centre.x,
        z: centre.z,
        bottom: entry.bottom,
        top: platform.top,
        foot: buildingLocalToWorld(item, ladderFoot(entry)),
        exit: buildingLocalToWorld(item, ladderExit(entry, platform)),
      }];
    });
  });
}

/** Every seat on the field: the benches, the stools, the gazebo's ring. */
export function farmSeats(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): FarmSeat[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition) return [];
    return farmFixtures(definition).filter((entry) => entry.kind === "seat").map((entry) => {
      const world = buildingLocalToWorld(item, entry);
      return { id: `${item.instanceId}-${entry.name}`, x: world.x, z: world.z, rotationY: item.rotationY + entry.rotationY, width: entry.width, depth: entry.depth, bottom: entry.bottom, top: entry.top };
    });
  });
}

/** Where on a seat a body sits: the nearest spot along the seat to `point`, kept a little in from its ends. */
export function seatPoint(seat: FarmSeat, point: Readonly<{ x: number; z: number }>): Readonly<{ x: number; z: number }> {
  const cosine = Math.cos(seat.rotationY);
  const sine = Math.sin(seat.rotationY);
  const localX = (point.x - seat.x) * cosine - (point.z - seat.z) * sine;
  const limit = Math.max(0, seat.width / 2 - 0.3);
  const along = Math.min(limit, Math.max(-limit, localX));
  return { x: seat.x + along * cosine, z: seat.z - along * sine };
}

/** The boxes ground animals keep their destinations out of: buildings (as their whole outer box), ponds, and the dwellings in them. */
export function keepOutBoxes(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): FloorObstacle[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition || !definition.keepOut) return [];
    return [decorRowBox(item)!];
  });
}

/** The water: every pond's box and depth. The pond is the ellipse inscribed in the box, dug by `farm-pond.mts`'s profile. */
export function waterRegions(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): PondRegion[] {
  return pondRegions(layout);
}

/**
 * A door E works: a building's, a gate's, or a door fixture inside a building
 * (a stall's half-door). `doorId` is the id its open state and its swinging
 * model are kept under — the row's instance id for a building or a gate,
 * `<instanceId>-<fixture>` for a fixture door — and `instanceId` is always
 * the layout row it stands on. `label` is what the prompt calls it ("barn
 * doors", "shed door", "gate", "stall door").
 */
export type DoorRow = Readonly<{ doorId: string; instanceId: string; title: string; label: string; leaves: 1 | 2; reach: number; door: ReturnType<typeof barnDoor> }>;

/** Everything the ground cover keeps off: every placed box but the fences (a tuft under a fence rail is fine; one through a floor is not). */
export function groundCoverExclusions(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): FloorObstacle[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition || definition.category === "fence") return [];
    return [decorRowBox(item)!];
  });
}

/** The door fixtures of a row as doors E works, each at its shut leaf, facing the fixture's local +z. */
function fixtureDoorRows(definition: FarmDecorDefinition, item: FarmDecorRow): DoorRow[] {
  return farmFixtures(definition).filter((entry) => entry.kind === "door" && entry.door).map((entry) => {
    const centre = buildingLocalToWorld(item, entry);
    const ahead = buildingLocalToWorld(item, fixtureLocalToItem(entry, { x: 0, z: 1 }));
    const door = { x: centre.x, z: centre.z, forward: { x: ahead.x - centre.x, z: ahead.z - centre.z } };
    return { doorId: fixtureId(item.instanceId, entry), instanceId: item.instanceId, title: definition.title, label: entry.door!.label, leaves: 1 as const, reach: entry.door!.reach, door };
  });
}

/** Every door on the field — a building's, a gate's, and every door fixture inside a building after the building's own: where it is, how far off it is worked, and what to call it. */
export function doorRows(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): readonly DoorRow[] {
  const rows: DoorRow[] = [];
  for (const item of layout.decor) {
    const definition = findFarmDecor(item.itemId);
    if (!definition) continue;
    if (definition.gate) {
      const outward = buildingLocalToWorld(item, { x: 0, z: 1 });
      const door = { x: item.x, z: item.z, forward: { x: outward.x - item.x, z: outward.z - item.z } };
      rows.push({ doorId: item.instanceId, instanceId: item.instanceId, title: definition.title, label: definition.title.toLowerCase(), leaves: 1, reach: definition.gate.reach, door });
      continue;
    }
    const door = buildingDoor(definition, item);
    if (door) {
      const leaves = definition.shell!.door!.leaves;
      rows.push({ doorId: item.instanceId, instanceId: item.instanceId, title: definition.title, label: `${definition.title.toLowerCase()} ${leaves === 2 ? "doors" : "door"}`, leaves, reach: definition.shell!.door!.reach, door });
    }
    rows.push(...fixtureDoorRows(definition, item));
  }
  return rows;
}

/** The door nearest to hand of those the player can work right now, or null. */
export function nearestDoor(rows: readonly DoorRow[], player: Readonly<{ x: number; z: number }>, canWork: (row: DoorRow) => boolean): DoorRow | null {
  let best: DoorRow | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    if (!canWork(row)) continue;
    const distance = Math.hypot(row.door.x - player.x, row.door.z - player.z);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

/** The first barn on the field, if any (headless checks and the door prompt lean on it). */
export function findBarn(layout: FarmLayout): FarmDecorRow | undefined {
  return layout.decor.find((item) => findFarmDecor(item.itemId)?.shell?.door);
}

/** True when a point is inside the field minus the fence inset. */
export function insideField(point: Readonly<{ x: number; z: number }>, bounds: RoomBounds = FARM_BOUNDS, margin = 0): boolean {
  const halfWidth = bounds.width / 2 - bounds.wallInset - margin;
  const halfDepth = bounds.depth / 2 - bounds.wallInset - margin;
  return Math.abs(point.x) <= halfWidth && Math.abs(point.z) <= halfDepth;
}
