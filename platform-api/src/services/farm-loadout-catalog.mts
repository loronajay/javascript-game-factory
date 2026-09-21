// The farm's server-owned layout catalog: the trust boundary for what lives on
// a player's farm.
//
// The farm (`/farm/`) is the arcade room's sibling — a second personal 3D
// space — and its document rides the same way: one JSON row per account on
// `game_loadouts` under the `farm` slug, self-only writes, public reads.
// `GET`/`PUT /games/farm/garage` for the owner, `GET /games/farm/loadout/:id`
// for a visitor. No new table, no new route.
//
// THE PUBLIC READ IS THE WHOLE DOCUMENT, like the room: a farm exists to be
// walked through, and nothing in it is private.
//
// WHAT IS VALIDATED, AND WHAT IS NOT — the room's policy exactly. Ids are
// checked for NAMESPACE (`ground.<name>`, `pet.<species>`,
// `decor.<category>.<variant>`), counts and numbers are bounded, text is made
// printable, and the client's catalogs decide what an id means. A species this
// server has never heard of but that fits the pattern is stored; the client's
// normalizer drops it. That keeps a new animal a client-only change.
//
// PETS ARE NOT PLACED. A pet row is an id, a species and a name — no
// coordinates — because the client's sim gives every pet a spot when the farm
// loads and it wanders from there. If a later slice pins pets (a doghouse), the
// position joins the row here with the same bounded-number treatment `decor`
// already gets.
//
// `decor` IS THE FIELD. Version 2 (build mode) places fences, buildings,
// plants, ponds and props as rows bounded like the room's, and the key is
// emitted only when the client sent one — the same absent-vs-empty rule the
// room follows: an absent list means the client's starter field, an empty one
// a deliberately cleared field. A version-1 document (before build mode) is
// stored as sent and migrated by the client's normalizer, which seeds the
// starter field for it.

export const FARM_GAME_SLUG = "farm";

const LAYOUT_VERSIONS = new Set([1, 2]);
const LAYOUT_VERSION = 2;
/** The client caps adoption at 12; the server allows a little headroom so a later raise is a client change. */
export const FARM_MAX_PETS = 24;
/** Fences, ponds and plants to come; a bound, not a plan. */
const MAX_DECOR = 160;
/** The field is 28 m; ±16 leaves margin for a wider farm without accepting nonsense. */
const COORDINATE_LIMIT = 16;
const LENGTH_LIMIT = 30;
const SCALE_LIMIT = 5;
const NAME_LIMIT = 20;
const INSTANCE_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
const GROUND_ID_PATTERN = /^ground\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPECIES_ID_PATTERN = /^pet\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECOR_ID_PATTERN = /^decor\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

function cleanText(value: any, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Printable single-line text with markup characters removed: a pet's name is shown over its head to every visitor. */
function cleanName(value: any, maxLength: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function boundedNumber(value: any, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(Math.min(limit, Math.max(-limit, value)).toFixed(4));
}

function normalizeRotation(value: any): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const turn = Math.PI * 2;
  const wrapped = ((value % turn) + turn) % turn;
  return Number(wrapped.toFixed(4));
}

export function defaultFarmGarage(): any {
  // "" for the ground means "the client's starter meadow"; no `decor` key means its starter field.
  return { version: LAYOUT_VERSION, ground: "", pets: [] };
}

function normalizePetRow(raw: any): any | null {
  const source = raw && typeof raw === "object" ? raw : {};
  const instanceId = cleanText(source.instanceId, 40);
  const speciesId = cleanText(source.speciesId, 80);
  if (!INSTANCE_ID_PATTERN.test(instanceId) || !SPECIES_ID_PATTERN.test(speciesId)) return null;
  return { instanceId, speciesId, name: cleanName(source.name, NAME_LIMIT) };
}

/** A placed item: the room's decor row shape, bounded the same way. Optional finish fields pass through when well-formed. */
function normalizeDecorRow(raw: any): any | null {
  const source = raw && typeof raw === "object" ? raw : {};
  const instanceId = cleanText(source.instanceId, 40);
  const itemId = cleanText(source.itemId, 80);
  const x = boundedNumber(source.x, COORDINATE_LIMIT);
  const z = boundedNumber(source.z, COORDINATE_LIMIT);
  const rotationY = normalizeRotation(source.rotationY);
  if (!INSTANCE_ID_PATTERN.test(instanceId) || !DECOR_ID_PATTERN.test(itemId)) return null;
  if (x === null || z === null || rotationY === null) return null;
  const row: any = { instanceId, itemId, x, z, rotationY };
  const length = boundedNumber(source.length, LENGTH_LIMIT);
  if (length !== null && length > 0) row.length = length;
  const scale = boundedNumber(source.scale, SCALE_LIMIT);
  if (scale !== null && scale > 0) row.scale = scale;
  const color = cleanText(source.color, 7).toLowerCase();
  if (HEX_COLOR.test(color)) row.color = color;
  return row;
}

export function normalizeFarmGarage(value: any): any {
  const input = value && typeof value === "object" ? value : {};
  const seen = new Set<string>();
  const pets: any[] = [];
  for (const raw of Array.isArray(input.pets) ? input.pets.slice(0, FARM_MAX_PETS + 10) : []) {
    const row = normalizePetRow(raw);
    if (!row || seen.has(row.instanceId)) continue;
    seen.add(row.instanceId);
    pets.push(row);
    if (pets.length >= FARM_MAX_PETS) break;
  }
  const submittedGround = cleanText(input.ground, 80);
  const garage: any = {
    version: LAYOUT_VERSIONS.has(input.version) ? input.version : LAYOUT_VERSION,
    ground: GROUND_ID_PATTERN.test(submittedGround) ? submittedGround : "",
    pets,
  };
  if (Array.isArray(input.decor)) {
    const decor: any[] = [];
    for (const raw of input.decor.slice(0, MAX_DECOR)) {
      const row = normalizeDecorRow(raw);
      if (!row || seen.has(row.instanceId)) continue;
      seen.add(row.instanceId);
      decor.push(row);
    }
    garage.decor = decor;
  }
  return garage;
}

/** What a visitor draws: the layout itself. */
export function farmLoadoutFromGarage(garage: any): any {
  return { layout: normalizeFarmGarage(garage) };
}

export const FARM_LOADOUT_CATALOG = Object.freeze({
  // Every ground and species is granted in this phase; the day one has to be
  // earned, the owned-id test goes beside the namespace check above.
  requiresEntitlements: false,
  normalizeGarage: normalizeFarmGarage,
  loadoutFromGarage: farmLoadoutFromGarage,
});
