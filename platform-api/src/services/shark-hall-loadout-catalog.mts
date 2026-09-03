// Shark Hall's server-owned loadout catalog: the trust boundary for a player's
// saved tables.
//
// The cabinet owns the art — nine cloths, seven timbers, six ball sets, the
// names, the swatches — and this registry owns what may be PERSISTED under the
// account and read back publicly. It is registered in `db/game-loadouts.mts`
// beside Speed Demon's and Yam Bowling's, and it reuses the same
// `game_loadouts` row: one table, generic on `game_slug`, three cabinets.
//
// WHY THIS VALIDATES SHAPE AND NAMESPACE RATHER THAN AN ITEM LIST.
//
// Speed Demon's catalog knows its whole roster because a livery is numbers with
// bounds — a band position outside 0..1 is a defect wherever it came from. Shark
// Hall's cosmetics are opaque ids whose meaning lives entirely in the cabinet's
// `scripts/cosmetics/catalog.js`, and mirroring that list here would create a
// second copy to drift, for a payload with no exploit in it: every one of these
// items is presentation, none of them touches the simulation, and the client
// already refuses to equip an id it does not recognise (`normalizeLoadout`).
//
// So the rule enforced here is the one that is genuinely server-side:
//
//   * the document has a known shape, a bounded number of entries, and bounded
//     strings — nobody parks a megabyte of JSON in an account row;
//   * every id is well formed AND IN THE NAMESPACE ITS SLOT REQUIRES, so a
//     cloth id cannot be stored in the ball-set slot and no free-form string
//     can reach a slot at all.
//
// That is a real compatibility check without a mirror. The day cosmetics are
// EARNED rather than granted, this is where the entitlement check goes:
// `requiresEntitlements: true` plus an owned-id test in `slotId`, exactly the
// way Yam Bowling does it. Nothing else in the stack changes.

export const SHARK_HALL_GAME_SLUG = "shark-hall";

/** Matches the cabinet's `MAX_SAVED_LOADOUTS`. A picker, not a warehouse. */
const MAX_ENTRIES = 8;
const NAME_LIMIT = 40;
const LOADOUT_VERSION = 1;

/**
 * Slot to id namespace. This IS the compatibility rule — the cabinet's slot
 * types expressed as the id prefixes they produce, which is the part of the
 * catalog that is a naming convention rather than a content list.
 */
const TABLE_SLOTS: Readonly<Record<string, string>> = Object.freeze({
  cloth: "table.cloth.",
  rail: "table.rail.",
  apron: "table.apron.",
  cushion: "table.cushion.",
  hardware: "table.hardware.",
  pockets: "table.pockets.",
  sights: "table.sights.",
  decal: "table.decal.",
  balls: "balls.",
});

const HALL_SLOTS: Readonly<Record<string, string>> = Object.freeze({
  walls: "hall.wall.",
  floor: "hall.floor.",
  hangingLight: "hall.light.",
  wallArtLeft: "hall.wall-art.",
  wallArtRight: "hall.wall-art.",
  cueRack: "hall.cue-rack.",
  trophyShelf: "hall.trophy-shelf.",
  accentSign: "hall.accent-sign.",
  furnitureLeft: "hall.furniture.",
  furnitureRight: "hall.furniture.",
  rug: "hall.rug.",
  window: "hall.window.",
  awardLeft: "award.",
  awardRight: "award.",
});

/**
 * The house table.
 *
 * A player who has never opened the editor has no row, and that is not an
 * error — they get this, which is exactly what their own client is drawing.
 */
const DEFAULT_TABLE: Readonly<Record<string, string | null>> = Object.freeze({
  cloth: "table.cloth.shark-navy",
  rail: "table.rail.dark-walnut",
  apron: "table.apron.dark-walnut",
  cushion: "table.cushion.navy",
  hardware: "table.hardware.brass",
  pockets: "table.pockets.black-leather",
  sights: "table.sights.brass-diamond",
  decal: null,
  balls: "balls.classic",
});

const DEFAULT_HALL: Readonly<Record<string, string | null>> = Object.freeze({
  walls: "hall.wall.charcoal",
  floor: "hall.floor.parquet-dark",
  hangingLight: "hall.light.brass-triple",
  wallArtLeft: "hall.wall-art.abstract-trio",
  wallArtRight: null,
  cueRack: "hall.cue-rack.walnut",
  trophyShelf: null,
  accentSign: null,
  furnitureLeft: null,
  furnitureRight: null,
  rug: null,
  window: null,
  awardLeft: null,
  awardRight: null,
});

/** An id is dot-separated lowercase segments and nothing else. No paths, no spaces, no HTML. */
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ENTRY_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

function cleanText(value: any, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * One slot's id, or the default.
 *
 * An id that is malformed, or correct-looking but in another slot's namespace,
 * is DROPPED rather than refused: the write still succeeds and the slot falls
 * back. A save that fails wholesale because one cosmetic was renamed between
 * builds loses the player's other eleven choices for no benefit.
 */
function slotId(raw: any, prefix: string, fallback: string | null): string | null {
  if (raw === null || raw === undefined) return fallback === null ? null : fallback;
  const id = cleanText(raw, 80);
  if (!id || !ID_PATTERN.test(id) || !id.startsWith(prefix)) return fallback;
  return id;
}

function normalizeDomain(
  raw: any,
  slots: Readonly<Record<string, string>>,
  defaults: Readonly<Record<string, string | null>>,
): Record<string, string | null> {
  const input = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, string | null> = {};
  for (const [key, prefix] of Object.entries(slots)) {
    // A key absent from the document takes the default; a key present but
    // unusable takes the default too. Required-ness lives in the cabinet, and
    // the defaults table above is how it is expressed here.
    out[key] = slotId(Object.hasOwn(input, key) ? input[key] : undefined, prefix, defaults[key] ?? null);
  }
  return out;
}

export function defaultSharkHallGarage(): any {
  return {
    version: LOADOUT_VERSION,
    activeId: "house",
    entries: [{ id: "house", name: "House Table", table: { ...DEFAULT_TABLE }, hall: { ...DEFAULT_HALL } }],
  };
}

/**
 * Coerce any stored or submitted document into a garage.
 *
 * Run on the way IN and on the way OUT — a row written by an older build, or by
 * a namespace that has since been tightened, must not hand a client something it
 * would refuse to draw.
 */
export function normalizeSharkHallGarage(value: any): any {
  const input = value && typeof value === "object" ? value : {};
  const rawEntries = Array.isArray(input.entries) ? input.entries.slice(0, MAX_ENTRIES) : [];
  const seen = new Set<string>();

  const entries = rawEntries.map((entry: any, index: number) => {
    const source = entry && typeof entry === "object" ? entry : {};
    const candidate = cleanText(source.id, 40);
    let id = ENTRY_ID_PATTERN.test(candidate) ? candidate : `table-${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return {
      id,
      name: cleanText(source.name, NAME_LIMIT) || `Table ${index + 1}`,
      table: normalizeDomain(source.table, TABLE_SLOTS, DEFAULT_TABLE),
      hall: normalizeDomain(source.hall, HALL_SLOTS, DEFAULT_HALL),
    };
  });

  if (!entries.length) return defaultSharkHallGarage();
  const activeId = entries.some((entry: any) => entry.id === input.activeId) ? input.activeId : entries[0].id;
  return { version: LOADOUT_VERSION, activeId, entries };
}

/**
 * What one player's table looks like, for anyone else to draw.
 *
 * The active entry only — never the whole garage. An opponent needs the table
 * they are standing at; they have no business knowing how many tables you have
 * saved or what you called them. Same privacy split as the car garage.
 */
export function sharkHallLoadoutFromGarage(garage: any): any {
  const normalized = normalizeSharkHallGarage(garage);
  const entry =
    normalized.entries.find((candidate: any) => candidate.id === normalized.activeId) ?? normalized.entries[0];
  return { table: { ...entry.table }, hall: { ...entry.hall } };
}

export const SHARK_HALL_LOADOUT_CATALOG = Object.freeze({
  // Every cosmetic is development-granted in this phase, so there is nothing to
  // check an entitlement against yet. This flag is the switch, and the owned-id
  // test belongs in `slotId` beside the namespace check when it is thrown.
  requiresEntitlements: false,
  normalizeGarage: normalizeSharkHallGarage,
  loadoutFromGarage: sharkHallLoadoutFromGarage,
});
