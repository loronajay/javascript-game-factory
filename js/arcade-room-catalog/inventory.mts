// Who owns what in the room catalog.
//
// EVERYTHING IS GRANTED IN THIS PHASE through one visible switch, the same
// seam Shark Hall's cosmetics use: `createRoomInventory({ grantAll: true })`.
// The LOCKED path is fully written underneath it — an un-owned surface falls
// back to the starter one and an un-owned decor item cannot be added — so the
// day a floor has to be earned or bought, the change is which ids the grant
// list carries, not a rewrite of the editor.

import { allDecorIds, findDecor } from "./decor.mjs";
import { DEFAULT_SURFACE_IDS, allSurfaceIds, findSurface, type SurfaceKind } from "./surfaces.mjs";

export type RoomInventory = Readonly<{
  /** True for a catalog id the player may use. Unknown ids are never owned. */
  owns: (id: string) => boolean;
  /** The surface to actually render for a requested id: itself when owned and known, else the starter. */
  resolveSurfaceId: (kind: SurfaceKind, id: string) => string;
  /** Add one server-confirmed durable grant to this live inventory. */
  grant: (id: string) => boolean;
  readonly grantAll: boolean;
}>;

export type RoomInventoryOptions = Readonly<{
  grantAll?: boolean;
  /** Explicit grants, used when `grantAll` is off. Starter items are always owned. */
  ownedIds?: readonly string[];
}>;

function isStarter(id: string): boolean {
  const decor = findDecor(id);
  if (decor) return decor.unlock.type === "starter";
  for (const kind of ["floor", "wall", "ceiling", "trim"] as const) {
    const surface = findSurface(kind, id);
    if (surface) return surface.unlock.type === "starter";
  }
  return false;
}

export function createRoomInventory(options: RoomInventoryOptions = {}): RoomInventory {
  const grantAll = options.grantAll === true;
  const known = new Set([...allSurfaceIds(), ...allDecorIds()]);
  const granted = new Set(options.ownedIds ?? []);
  const owns = (id: string): boolean => {
    if (!known.has(id)) return false;
    if (grantAll) return true;
    return isStarter(id) || granted.has(id);
  };
  return Object.freeze({
    grantAll,
    owns,
    grant: (id) => {
      if (!known.has(id)) return false;
      granted.add(id);
      return true;
    },
    resolveSurfaceId: (kind, id) => (owns(id) && findSurface(kind, id) ? id : DEFAULT_SURFACE_IDS[kind]),
  });
}
