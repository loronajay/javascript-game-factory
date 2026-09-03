// What is equipped, and what happens to a slot that no longer makes sense.
//
// PURE. Ids in, ids out, plus one function that turns ids into the render
// payload the scene wants. Nothing here reads storage, a network or a clock —
// `store/cosmetics-store.js` owns all three, which is what lets every rule about
// migration and fallback be a unit test.
//
// THREE SHAPES, and keeping them apart is the whole design:
//
//   LOADOUT  one table and one hall, as slot → item id.
//   GARAGE   several named loadouts plus which one is active. This is the
//            document the Factory stores.
//   RESOLVED slot → presentation payload. What the renderer is handed. It
//            contains no ids at all, so the render layer cannot look one up and
//            quietly grow a dependency on the catalog.
//
// EVERY ID READ BACK IS UNTRUSTED. It may name an item this build removed, an
// item that moved to another slot, or an item the account does not own. So
// `normalizeLoadout` is not a formality: a required slot always ends up holding
// something (there is no table without cloth), an optional slot falls back to
// empty, and neither case throws. A cabinet that fails to boot because a cosmetic
// was renamed is a cabinet that cannot ever rename a cosmetic.

import { findItem } from "./catalog.js";
import { DEVELOPMENT_INVENTORY } from "./inventory.js";
import { HALL_SLOTS, TABLE_SLOTS, slotAccepts, slotsFor } from "./types.js";

/** Bumped only when the stored shape changes in a way normalization cannot absorb. */
export const LOADOUT_VERSION = 1;

/** How many saved tables one account may keep. A picker, not a warehouse. */
export const MAX_SAVED_LOADOUTS = 8;

const NAME_LIMIT = 40;

/**
 * The table and hall the cabinet ships with.
 *
 * These ids must exist in the catalog — `tests/cosmetics.test.js` checks it —
 * because they are the floor every fallback lands on. Removing one without
 * repointing this object is how a cabinet boots with no cloth.
 */
export const DEFAULT_LOADOUT = Object.freeze({
  version: LOADOUT_VERSION,
  table: Object.freeze({
    cloth: "table.cloth.shark-navy",
    rail: "table.rail.dark-walnut",
    apron: "table.apron.dark-walnut",
    cushion: "table.cushion.navy",
    hardware: "table.hardware.brass",
    pockets: "table.pockets.black-leather",
    sights: "table.sights.brass-diamond",
    decal: null,
    balls: "balls.classic",
  }),
  hall: Object.freeze({
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
  }),
});

const isObject = (value) => Boolean(value) && typeof value === "object";

/** A deep-enough copy: every value in a loadout is a string or null. */
const copySlots = (slots) => ({ ...slots });

/** The default loadout, as a mutable copy. Never hand the frozen one out. */
export function defaultLoadout() {
  return {
    version: LOADOUT_VERSION,
    table: copySlots(DEFAULT_LOADOUT.table),
    hall: copySlots(DEFAULT_LOADOUT.hall),
  };
}

/**
 * Resolve one slot's stored id to something usable.
 *
 * The four ways an id fails are the four reasons this function exists: it is not
 * a string, it names nothing, it names an item of the wrong type for the slot,
 * or it names an item the account does not own. All four land on the same
 * answer — the default for a required slot, empty for an optional one — because
 * the player does not care which of the four happened and the table has to draw.
 */
function resolveSlotId(domain, slot, raw, isOwned) {
  const fallback = DEFAULT_LOADOUT[domain][slot.key] ?? null;
  if (raw === null || raw === undefined) return slot.required ? fallback : null;
  if (typeof raw !== "string") return slot.required ? fallback : null;

  const item = findItem(raw);
  if (!item || !slotAccepts(slot, item.type) || !isOwned(raw)) {
    return slot.required ? fallback : null;
  }
  return raw;
}

/**
 * Coerce anything into a usable loadout.
 *
 * @param isOwned the ownership seam. Defaults to the development grant, so the
 *   cabinet behaves today exactly as the brief asks; hand in a real inventory
 *   and unowned ids fall back instead of equipping.
 */
export function normalizeLoadout(raw, { isOwned = DEVELOPMENT_INVENTORY.isOwned.bind(DEVELOPMENT_INVENTORY) } = {}) {
  const input = isObject(raw) ? raw : {};
  const out = { version: LOADOUT_VERSION, table: {}, hall: {} };
  for (const domain of ["table", "hall"]) {
    const stored = isObject(input[domain]) ? input[domain] : {};
    for (const slot of slotsFor(domain)) {
      out[domain][slot.key] = resolveSlotId(domain, slot, stored[slot.key], isOwned);
    }
  }
  return out;
}

/** Equip one item, or clear a slot with `null`. Returns a NEW loadout; never mutates. */
export function equip(loadout, domain, slotKey, itemId, options = {}) {
  const slot = slotsFor(domain).find((entry) => entry.key === slotKey);
  if (!slot) return normalizeLoadout(loadout, options);
  const next = normalizeLoadout(loadout, options);
  next[domain] = { ...next[domain], [slotKey]: resolveSlotId(domain, slot, itemId, () => true) };
  // Re-normalized so an unowned id handed in here is refused the same way one
  // read back from storage is. There is no second door into a slot.
  return normalizeLoadout(next, options);
}

/**
 * Apply a preset over a loadout.
 *
 * A preset is data — `{ slots }` on an ordinary catalog item — so this copies
 * its assignments into the matching domain and re-normalizes. Slots the preset
 * does not mention are LEFT ALONE, which is what makes a table preset safe to
 * apply without wiping the room. An unknown or non-preset id changes nothing.
 */
export function applyPreset(loadout, presetId, options = {}) {
  const preset = findItem(presetId);
  const domain = preset?.type === "table-preset" ? "table" : preset?.type === "hall-room-preset" ? "hall" : null;
  if (!domain || !isObject(preset.slots)) return normalizeLoadout(loadout, options);

  const next = normalizeLoadout(loadout, options);
  const merged = { ...next[domain] };
  for (const slot of slotsFor(domain)) {
    if (Object.hasOwn(preset.slots, slot.key)) merged[slot.key] = preset.slots[slot.key];
  }
  next[domain] = merged;
  return normalizeLoadout(next, options);
}

/** Whether two loadouts equip exactly the same things. The editor's dirty check. */
export function loadoutsEqual(a, b) {
  const left = normalizeLoadout(a);
  const right = normalizeLoadout(b);
  for (const domain of ["table", "hall"]) {
    for (const slot of slotsFor(domain)) {
      if (left[domain][slot.key] !== right[domain][slot.key]) return false;
    }
  }
  return true;
}

/**
 * Slot ids to render payloads.
 *
 * THE RENDERER'S WHOLE CONTRACT. It gets colours, textures and shapes, and no
 * item ids — so `render/` can never look an id up, and a cosmetic that reaches
 * the scene has already been through ownership and compatibility. The two
 * domains are separate objects sharing nothing, which is the structural half of
 * "a hall cosmetic cannot touch the table".
 */
export function resolveLoadout(loadout, options = {}) {
  const normalized = normalizeLoadout(loadout, options);
  const out = { table: {}, hall: {} };
  for (const domain of ["table", "hall"]) {
    for (const slot of slotsFor(domain)) {
      out[domain][slot.key] = findItem(normalized[domain][slot.key])?.presentation ?? null;
    }
  }
  return out;
}

/** The equipped item for one slot, or null. What the editor ticks in the tray. */
export function equippedItem(loadout, domain, slotKey) {
  return findItem(normalizeLoadout(loadout)[domain]?.[slotKey]);
}

// ---------------------------------------------------------------------------
// The garage: several saved loadouts, and which one is live
// ---------------------------------------------------------------------------
// This is the document the Factory stores. It is a whole-document write rather
// than a patch for the same reason Speed Demon's garage is: the client owns the
// shape — the ids, the order, which entry is active — and merging two versions
// of that field by field is a source of silent divergence for no gain.

const cleanName = (value, fallback) => {
  const text = typeof value === "string" ? value.trim().slice(0, NAME_LIMIT) : "";
  return text || fallback;
};

const cleanId = (value) => (typeof value === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(value) ? value : "");

/** A fresh garage holding one table: the house default. */
export function defaultGarage() {
  return {
    version: LOADOUT_VERSION,
    activeId: "house",
    entries: [{ id: "house", name: "House Table", ...defaultLoadout() }],
  };
}

/**
 * Coerce anything into a usable garage.
 *
 * A garage with no entries becomes the default one rather than an empty picker,
 * duplicate ids are re-keyed rather than dropped (two entries with the same id
 * is a bug, but losing a player's saved table over it is worse), and an
 * `activeId` naming nothing falls to the first entry.
 */
export function normalizeGarage(raw, options = {}) {
  const input = isObject(raw) ? raw : {};
  const seen = new Set();
  const entries = (Array.isArray(input.entries) ? input.entries : [])
    .slice(0, MAX_SAVED_LOADOUTS)
    .map((entry, index) => {
      const source = isObject(entry) ? entry : {};
      let id = cleanId(source.id) || `table-${index + 1}`;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      const loadout = normalizeLoadout(source, options);
      return { id, name: cleanName(source.name, `Table ${index + 1}`), ...loadout };
    });

  if (!entries.length) return defaultGarage();
  const activeId = entries.some((entry) => entry.id === input.activeId) ? input.activeId : entries[0].id;
  return { version: LOADOUT_VERSION, activeId, entries };
}

/** The loadout in play. Always a real loadout, even for a garage that made no sense. */
export function activeLoadout(garage, options = {}) {
  const normalized = normalizeGarage(garage, options);
  const entry = normalized.entries.find((candidate) => candidate.id === normalized.activeId) ?? normalized.entries[0];
  return { version: LOADOUT_VERSION, table: copySlots(entry.table), hall: copySlots(entry.hall) };
}

/** The active entry's name and id, for the editor's header. */
export function activeEntry(garage, options = {}) {
  const normalized = normalizeGarage(garage, options);
  return normalized.entries.find((entry) => entry.id === normalized.activeId) ?? normalized.entries[0];
}

/** Write a loadout back into the active entry. Returns a new garage. */
export function withActiveLoadout(garage, loadout, options = {}) {
  const normalized = normalizeGarage(garage, options);
  const next = normalizeLoadout(loadout, options);
  return {
    ...normalized,
    entries: normalized.entries.map((entry) =>
      entry.id === normalized.activeId ? { id: entry.id, name: entry.name, ...next } : entry),
  };
}

/** Switch which saved table is live. An unknown id is ignored, not an error. */
export function selectEntry(garage, entryId, options = {}) {
  const normalized = normalizeGarage(garage, options);
  if (!normalized.entries.some((entry) => entry.id === entryId)) return normalized;
  return { ...normalized, activeId: entryId };
}

/**
 * Save a loadout as a NEW entry and make it active.
 *
 * At the cap the oldest non-active entry is not silently evicted — the caller is
 * told no, by getting the garage back unchanged. Deleting somebody's saved table
 * to make room for another is not a decision this module gets to make.
 */
export function addEntry(garage, { name, loadout } = {}, options = {}) {
  const normalized = normalizeGarage(garage, options);
  if (normalized.entries.length >= MAX_SAVED_LOADOUTS) return normalized;

  const taken = new Set(normalized.entries.map((entry) => entry.id));
  let id = `table-${normalized.entries.length + 1}`;
  let suffix = normalized.entries.length + 1;
  while (taken.has(id)) id = `table-${++suffix}`;

  const entry = { id, name: cleanName(name, `Table ${normalized.entries.length + 1}`), ...normalizeLoadout(loadout, options) };
  return { ...normalized, activeId: id, entries: [...normalized.entries, entry] };
}

/** Rename one saved table. */
export function renameEntry(garage, entryId, name, options = {}) {
  const normalized = normalizeGarage(garage, options);
  return {
    ...normalized,
    entries: normalized.entries.map((entry) =>
      entry.id === entryId ? { ...entry, name: cleanName(name, entry.name) } : entry),
  };
}

/** Delete one saved table. The last one is never deletable: a garage always has a table. */
export function removeEntry(garage, entryId, options = {}) {
  const normalized = normalizeGarage(garage, options);
  if (normalized.entries.length <= 1) return normalized;
  const entries = normalized.entries.filter((entry) => entry.id !== entryId);
  if (entries.length === normalized.entries.length) return normalized;
  const activeId = entries.some((entry) => entry.id === normalized.activeId) ? normalized.activeId : entries[0].id;
  return { ...normalized, activeId, entries };
}

/** The garage as plain JSON, for the wire. Nothing but ids, names and a version. */
export function serializeGarage(garage, options = {}) {
  const normalized = normalizeGarage(garage, options);
  return {
    version: LOADOUT_VERSION,
    activeId: normalized.activeId,
    entries: normalized.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      table: copySlots(entry.table),
      hall: copySlots(entry.hall),
    })),
  };
}

/** Both slot lists, for anything that walks every slot in the model. */
export const ALL_SLOTS = Object.freeze({ table: TABLE_SLOTS, hall: HALL_SLOTS });
