// What a cosmetic IS, before any of them exist.
//
// PURE, like `sim/`: no THREE, no DOM, no clock, no random. That is what lets
// the catalog be loaded and checked under node, and it is the reason the render
// layer can be handed a cosmetic configuration rather than a catalog.
//
// The three ideas here are deliberately separate and must stay that way:
//
//   TYPE       what kind of thing an item is        ("table-cloth")
//   SLOT       where an equipped item sits          (table.cloth)
//   OWNERSHIP  whether this account may equip it    (inventory.js)
//
// An item can exist in the catalog without being owned, and be owned without
// being equipped. Collapsing any two of those is how a cosmetic system ends up
// unable to ship a reward.

/** Everything a table cosmetic can be. */
export const TABLE_TYPES = Object.freeze([
  "table-cloth",
  "table-rail-finish",
  "table-apron-finish",
  "table-cushion",
  "table-hardware",
  "table-pocket-liner",
  "table-sight",
  "table-decal",
  "ball-set",
  "table-preset",
]);

/** Everything the room around the table can be. */
export const HALL_TYPES = Object.freeze([
  "hall-wall",
  "hall-floor",
  "hall-light",
  "hall-wall-art",
  "hall-cue-rack",
  "hall-trophy-shelf",
  "hall-accent-sign",
  "hall-furniture",
  "hall-rug",
  "hall-window",
  "hall-room-preset",
]);

/**
 * Things won rather than chosen.
 *
 * They render through the same path as any other prop, and they are a separate
 * list anyway. A championship display is not a piece of furniture that happens
 * to be shaped like a trophy: it is a claim about what the player did, and the
 * day it stops being dev-owned it has to be refused by a server rather than by
 * a dropdown. Keeping the types apart is what makes that a one-line change.
 */
export const AWARD_TYPES = Object.freeze(["trophy", "plaque", "framed-award", "championship-display"]);

export const COSMETIC_TYPES = Object.freeze([...TABLE_TYPES, ...HALL_TYPES, ...AWARD_TYPES]);

/** Presentation tier. Ordered, lowest first — the editor sorts on this. */
export const RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);

/**
 * Every way an item may eventually be unlocked.
 *
 * Only `development` is honoured today. The rest are here so a catalog entry
 * written now does not have to be rewritten when the circuit ships — the item
 * already says where it comes from, and only the inventory changes.
 */
export const UNLOCK_SOURCES = Object.freeze([
  "development",
  "founding",
  "circuit-first-clear",
  "circuit-champion",
  "circuit-mastery",
  "tournament-champion",
  "achievement",
  "online-rank",
  "season",
  "platform-event",
  "developer",
]);

/**
 * The table's slots.
 *
 * `required` is the whole reason this list is data. A required slot always holds
 * an item — there is no such thing as a table with no cloth — so normalization
 * falls back to the default rather than to null. An optional slot may genuinely
 * be empty, and `null` there means "nothing", not "broken".
 */
export const TABLE_SLOTS = Object.freeze([
  { key: "cloth", type: "table-cloth", name: "Cloth", required: true },
  { key: "rail", type: "table-rail-finish", name: "Rails", required: true },
  { key: "apron", type: "table-apron-finish", name: "Apron", required: true },
  { key: "cushion", type: "table-cushion", name: "Cushions", required: true },
  { key: "hardware", type: "table-hardware", name: "Hardware", required: true },
  { key: "pockets", type: "table-pocket-liner", name: "Pockets", required: true },
  { key: "sights", type: "table-sight", name: "Sights", required: true },
  { key: "decal", type: "table-decal", name: "Cloth decal", required: false },
  { key: "balls", type: "ball-set", name: "Ball set", required: true },
].map(Object.freeze));

/** The hall's slots. Two of everything the room has two of, so left and right differ. */
export const HALL_SLOTS = Object.freeze([
  { key: "walls", type: "hall-wall", name: "Walls", required: true },
  { key: "floor", type: "hall-floor", name: "Floor", required: true },
  { key: "hangingLight", type: "hall-light", name: "Hanging light", required: true },
  { key: "wallArtLeft", type: "hall-wall-art", name: "Wall art · left", required: false },
  { key: "wallArtRight", type: "hall-wall-art", name: "Wall art · right", required: false },
  { key: "cueRack", type: "hall-cue-rack", name: "Cue rack", required: false },
  { key: "trophyShelf", type: "hall-trophy-shelf", name: "Trophy shelf", required: false },
  { key: "accentSign", type: "hall-accent-sign", name: "Accent sign", required: false },
  { key: "furnitureLeft", type: "hall-furniture", name: "Furniture · left", required: false },
  { key: "furnitureRight", type: "hall-furniture", name: "Furniture · right", required: false },
  { key: "rug", type: "hall-rug", name: "Rug", required: false },
  { key: "window", type: "hall-window", name: "Window", required: false },
  // The two shelf positions an award may stand in. They accept FOUR types, which
  // is the only place in the model a slot is not one-to-one with a type — a
  // trophy and a plaque hang in the same place and are not the same thing.
  { key: "awardLeft", type: AWARD_TYPES, name: "Award · left", required: false },
  { key: "awardRight", type: AWARD_TYPES, name: "Award · right", required: false },
].map(Object.freeze));

export const DOMAINS = Object.freeze(["table", "hall"]);

/** The slot list for a domain. Unknown domain gives an empty list, never a throw. */
export function slotsFor(domain) {
  if (domain === "table") return TABLE_SLOTS;
  if (domain === "hall") return HALL_SLOTS;
  return [];
}

/** Every type a slot will accept, always as an array. */
export function typesFor(slot) {
  return Array.isArray(slot.type) ? slot.type : [slot.type];
}

/** Whether an item of `type` may sit in `slot`. The one compatibility rule. */
export function slotAccepts(slot, type) {
  return typesFor(slot).includes(type);
}

/** The preset type that drives a domain's slots. */
export function presetTypeFor(domain) {
  return domain === "table" ? "table-preset" : "hall-room-preset";
}
