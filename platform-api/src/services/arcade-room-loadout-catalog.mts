// The personal arcade room's server-owned layout catalog: the trust boundary
// for where a player has put their cabinets.
//
// The room is a PLATFORM surface (`/room/`), not a cabinet, but its document is
// exactly the shape `game_loadouts` was built for — one JSON document per
// account, self-only writes, public reads — so it registers here under the
// `arcade-room` slug beside the four cabinet garages rather than growing a
// table and a route family of its own. `GET`/`PUT /games/arcade-room/garage`
// is the owner's path; `GET /games/arcade-room/loadout/:playerId` is what a
// visitor's browser reads to draw somebody else's room.
//
// UNLIKE THE CABINET GARAGES, THE PUBLIC READ IS THE WHOLE DOCUMENT. A car
// garage hides everything but the active car because an opponent only needs
// the one being driven. A room exists to be walked through, so the public
// loadout is the layout itself — there is nothing in it a visitor should not
// see, and no "active entry" to resolve to.
//
// WHAT IS VALIDATED, AND WHAT IS NOT. The server bounds the document (item
// count, id shapes, finite coordinates inside a generous box) and nothing more.
// It does not know the room's exact walls or the cabinets' footprints: the
// client already clamps every drag against those and refuses overlaps, and a
// mirror of the footprint table here would be a second copy to drift for a
// payload that touches no simulation and no economy. Cabinet ids are checked
// for NAMESPACE (`cabinet.<game>.<variant>`), the same rule as Shark Hall.
//
// THE EMPTY LAYOUT IS THE DEFAULT ON PURPOSE. A player with no row gets
// `items: []`, and the client's own normalizer fills in the starter cabinets at
// their starter positions. Keeping those coordinates out of this file means a
// starter-layout retune is a client change, not a two-repo deploy.

export const ARCADE_ROOM_GAME_SLUG = "arcade-room";

const LAYOUT_VERSION = 1;
/** Plenty for a room that seats two cabinets today; a bound, not a plan. */
const MAX_ITEMS = 32;
/** The room is 20×20; ±12 leaves margin for a wider room without accepting nonsense. */
const COORDINATE_LIMIT = 12;

const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
/** `cabinet.<game-slug>.<variant>` — the namespace every catalog cabinet id lives in. */
const CABINET_ID_PATTERN = /^cabinet\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value: any, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedNumber(value: any, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(Math.min(limit, Math.max(-limit, value)).toFixed(4));
}

/**
 * Rotation is kept on a single turn. A client that snaps by 15° and lets the
 * player spin a cabinet forty times would otherwise store an ever-growing
 * angle for the same facing.
 */
function normalizeRotation(value: any): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const turn = Math.PI * 2;
  const wrapped = ((value % turn) + turn) % turn;
  return Number(wrapped.toFixed(4));
}

export function defaultArcadeRoomGarage(): any {
  return { version: LAYOUT_VERSION, items: [] };
}

/**
 * Coerce any stored or submitted document into a layout.
 *
 * Run on the way IN and on the way OUT. An item that cannot be made valid is
 * DROPPED rather than failing the save: one malformed row must not cost the
 * player the rest of the room. Duplicate instance ids keep their first
 * occurrence, because the client keys everything by that id.
 */
export function normalizeArcadeRoomGarage(value: any): any {
  const input = value && typeof value === "object" ? value : {};
  const rawItems = Array.isArray(input.items) ? input.items.slice(0, MAX_ITEMS) : [];
  const seen = new Set<string>();
  const items: any[] = [];

  for (const raw of rawItems) {
    const source = raw && typeof raw === "object" ? raw : {};
    const instanceId = cleanText(source.instanceId, 40);
    const cabinetId = cleanText(source.cabinetId, 80);
    const x = boundedNumber(source.x, COORDINATE_LIMIT);
    const z = boundedNumber(source.z, COORDINATE_LIMIT);
    const rotationY = normalizeRotation(source.rotationY);
    if (!INSTANCE_ID_PATTERN.test(instanceId) || !CABINET_ID_PATTERN.test(cabinetId)) continue;
    if (x === null || z === null || rotationY === null) continue;
    if (seen.has(instanceId)) continue;
    seen.add(instanceId);
    // A hidden cabinet is still a placed cabinet — it keeps its spot and stays in the
    // document so the client never re-seeds it as a starter. Only a real `true` hides.
    items.push({ instanceId, cabinetId, x, z, rotationY, hidden: source.hidden === true });
  }

  return { version: LAYOUT_VERSION, items };
}

/** What a visitor draws: the layout itself. See the note at the top of this file. */
export function arcadeRoomLoadoutFromGarage(garage: any): any {
  return { layout: normalizeArcadeRoomGarage(garage) };
}

export const ARCADE_ROOM_LOADOUT_CATALOG = Object.freeze({
  // Both starter cabinets are granted to everyone; the day a cabinet has to be
  // earned, the owned-id test goes beside the namespace check above.
  requiresEntitlements: false,
  normalizeGarage: normalizeArcadeRoomGarage,
  loadoutFromGarage: arcadeRoomLoadoutFromGarage,
});
