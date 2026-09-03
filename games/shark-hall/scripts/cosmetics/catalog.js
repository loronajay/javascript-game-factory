// Every cosmetic in the cabinet, as data.
//
// PURE — no THREE, no DOM, no clock, no random — which is what lets the whole
// catalog be loaded, listed and validated under node. Nothing here builds a mesh
// or touches a material: `presentation` is a render PAYLOAD, and the render
// layer is the only thing that knows what to do with one.
//
// THE THREE RULES THIS FILE OBEYS, enforced by `tests/cosmetics.test.js`:
//
//   1. A cosmetic is presentation only. Not one entry may carry a radius, a
//      mass, a friction, a restitution or anything else the sim reads. A cloth
//      is a colour; it is never a faster cloth.
//   2. An item existing here says nothing about owning it. `source` records
//      where it will eventually come from and `inventory.js` decides. Today the
//      development inventory grants all of it, and that is one call in one file.
//   3. A preset is an item like any other, carrying slot assignments and no
//      behaviour — so `applyPreset` is four lines rather than a special case.
//
// A FINISH IS NOT A HEX CODE. Five browns that differ only in tint read as one
// wood, so every wood finish carries a `grainStyle` and its own stroke count and
// amplitude, and `render/textures.js` draws figured, straight, brushed and
// lacquered timber differently. The same goes for floors (`pattern`) and ball
// sets (a gilt number ring, a stripe width). If a category ever collapses into
// "the same thing in another colour", that is the bug.

import { BRASS_HALL, CASINO, CLASSIC, MIDNIGHT, NEON_RUN, TOURNAMENT } from "./ball-sets.js";

/** Where an item comes from. `development` is the only source honoured today. */
const DEV = Object.freeze({ kind: "development" });
const from = (kind, detail) => Object.freeze({ kind, detail });

/**
 * One catalog entry.
 *
 * `entitlement` is DERIVED rather than authored: anything that is not a
 * development item will one day need a server to confirm it, and deriving it
 * from the source means a new reward cannot forget to ask.
 */
function item({ id, type, name, rarity = "common", collection = null, source = DEV, presentation, tags = [], blurb = "" }) {
  return Object.freeze({
    id,
    type,
    name,
    rarity,
    collection,
    source,
    entitlement: source.kind !== "development",
    presentation: Object.freeze(presentation),
    tags: Object.freeze(tags),
    blurb,
  });
}

// ---------------------------------------------------------------------------
// Table — cloth
// ---------------------------------------------------------------------------
// `noise` is the per-pixel grain the felt canvas is dusted with and `sheen` is
// the material's specular intensity. NEITHER IS A FRICTION. Every colour here is
// a MID tone on purpose: a cloth albedo below the renderer's dielectric specular
// floor renders as grey slate whatever colour it claims to be — the cabinet
// shipped that bug once — so the test suite holds a luminance floor over this
// list.

const cloth = (id, name, color, { noise = 12, sheen = 0.16, weave = "worsted", rarity = "common", collection = "classic", blurb = "" } = {}) =>
  item({
    id: `table.cloth.${id}`,
    type: "table-cloth",
    name,
    rarity,
    collection,
    presentation: { color, noise, sheen, weave, repeat: [5, 3] },
    tags: ["cloth", weave],
    blurb,
  });

const CLOTHS = [
  cloth("shark-navy", "Shark Hall Navy", "#2a4666", { blurb: "The house cloth. Mid navy, so the pendant reads as light and not as glare." }),
  cloth("tournament-green", "Tournament Green", "#1e5b3c", { noise: 11, weave: "worsted", collection: "tournament" }),
  cloth("burgundy", "Burgundy", "#6c1f2d", { noise: 10, weave: "napped", collection: "classic" }),
  cloth("royal-blue", "Royal Blue", "#24618f", { noise: 9, weave: "worsted", collection: "tournament" }),
  cloth("charcoal", "Charcoal", "#34383d", { noise: 14, weave: "napped", collection: "after-hours" }),
  cloth("oxblood", "Oxblood", "#4a1f24", { noise: 12, weave: "napped", rarity: "uncommon", collection: "after-hours" }),
  cloth("teal-parlour", "Teal Parlour", "#1a6b6e", { noise: 11, rarity: "uncommon", collection: "parlour" }),
  cloth("plum-hall", "Plum Hall", "#4a2a5e", { noise: 12, weave: "napped", rarity: "rare", collection: "parlour" }),
  cloth("gold-dust", "Gold Dust", "#7d6a3a", { noise: 17, weave: "flecked", rarity: "epic", collection: "brass", blurb: "Sand-gold worsted, flecked. Loud under the lamp and unmistakable on camera." }),
];

// ---------------------------------------------------------------------------
// Table — wood finishes (rails and apron)
// ---------------------------------------------------------------------------
// ONE finish description, TWO catalog items: a rail and an apron. They are
// separate types because a table with contrasting rails and cabinet is a real
// table, and the two slots have to be able to disagree. The editor's "match
// rails" affordance is a UI convenience over that, not a third type.
//
// `grainStyle` is what stops these being seven browns — see the file header.

const WOOD_FINISHES = [
  { id: "dark-walnut", name: "Dark Walnut", rarity: "common", collection: "classic", grainStyle: "figured", strokes: 70, amplitude: 4, grain: ["#6b4026", "#432616", "#26150d"], ink: ["#a4663a", "#20110b"], roughness: 0.36, metalness: 0.05, clearcoat: 0.55 },
  { id: "mahogany", name: "Mahogany", rarity: "common", collection: "parlour", grainStyle: "ribbon", strokes: 54, amplitude: 7, grain: ["#8a3a26", "#5c2216", "#31110b"], ink: ["#c46b4a", "#210a06"], roughness: 0.3, metalness: 0.05, clearcoat: 0.72 },
  { id: "natural-oak", name: "Natural Oak", rarity: "common", collection: "parlour", grainStyle: "straight", strokes: 96, amplitude: 1.6, grain: ["#c79a5c", "#9a6c3a", "#6b4522"], ink: ["#e0b980", "#5a3a1e"], roughness: 0.44, metalness: 0.03, clearcoat: 0.3 },
  { id: "ebony", name: "Ebony", rarity: "uncommon", collection: "after-hours", grainStyle: "straight", strokes: 40, amplitude: 1, grain: ["#3a3330", "#211d1b", "#0f0d0c"], ink: ["#5c524c", "#080706"], roughness: 0.3, metalness: 0.06, clearcoat: 0.7 },
  { id: "black-lacquer", name: "Painted Black Lacquer", rarity: "uncommon", collection: "after-hours", grainStyle: "lacquer", strokes: 6, amplitude: 0, grain: ["#26282c", "#141619", "#0a0b0d"], ink: ["#3d4148", "#050506"], roughness: 0.08, metalness: 0.1, clearcoat: 1 },
  { id: "pale-ash", name: "Pale Ash", rarity: "rare", collection: "tournament", grainStyle: "straight", strokes: 110, amplitude: 2.2, grain: ["#d8c9ae", "#b6a487", "#8c7a5f"], ink: ["#efe4cd", "#7b6a51"], roughness: 0.46, metalness: 0.03, clearcoat: 0.35 },
  { id: "gunmetal", name: "Brushed Gunmetal", rarity: "rare", collection: "tournament", grainStyle: "brushed", strokes: 150, amplitude: 0.6, grain: ["#4a5158", "#31373d", "#1b1f23"], ink: ["#6d757d", "#12151a"], roughness: 0.26, metalness: 0.55, clearcoat: 0.45 },
];

const woodPresentation = (finish) => ({
  texture: "wood",
  grainStyle: finish.grainStyle,
  grain: finish.grain,
  ink: finish.ink,
  strokes: finish.strokes,
  amplitude: finish.amplitude,
  roughness: finish.roughness,
  metalness: finish.metalness,
  clearcoat: finish.clearcoat,
  clearcoatRoughness: 0.25,
  repeat: [2, 1],
});

const RAILS = WOOD_FINISHES.map((finish) =>
  item({
    id: `table.rail.${finish.id}`,
    type: "table-rail-finish",
    name: finish.name,
    rarity: finish.rarity,
    collection: finish.collection,
    presentation: woodPresentation(finish),
    tags: ["rail", "wood", finish.grainStyle],
  }));

const APRONS = WOOD_FINISHES.map((finish) =>
  item({
    id: `table.apron.${finish.id}`,
    type: "table-apron-finish",
    name: finish.name,
    rarity: finish.rarity,
    collection: finish.collection,
    // The apron is the cabinet body and the legs: the same timber, read at a
    // distance and out of the lamp, so it is drawn flatter on purpose.
    presentation: {
      ...woodPresentation(finish),
      roughness: Math.min(0.85, finish.roughness + 0.16),
      clearcoat: finish.clearcoat * 0.4,
      repeat: [3, 1],
    },
    tags: ["apron", "wood", finish.grainStyle],
  }));

// ---------------------------------------------------------------------------
// Table — cushions, hardware, pockets, sights
// ---------------------------------------------------------------------------
// The cushion entry is COLOUR ONLY, and that is the load-bearing fact about it.
// How a cushion plays — its restitution curve and its along-rail friction — lives
// in `sim/physics.js` and is identical on every table in the game. A rubber that
// threw a ball out at a different angle would be a cheat with a swatch on it.

const cushion = (id, name, color, { rarity = "common", collection = "classic", roughness = 0.95 } = {}) =>
  item({
    id: `table.cushion.${id}`,
    type: "table-cushion",
    name,
    rarity,
    collection,
    presentation: { color, roughness, sheen: 0.2 },
    tags: ["cushion"],
  });

const CUSHIONS = [
  cushion("navy", "Navy", "#1d3450"),
  cushion("burgundy", "Burgundy", "#4a161f"),
  cushion("forest", "Forest", "#14402b", { collection: "tournament" }),
  cushion("royal", "Royal", "#1b4570", { collection: "tournament" }),
  cushion("charcoal", "Charcoal", "#24282c", { rarity: "uncommon", collection: "after-hours" }),
  cushion("walnut-rubber", "Walnut", "#3a2418", { rarity: "uncommon", collection: "parlour" }),
  cushion("teal", "Teal", "#15494b", { rarity: "rare", collection: "parlour" }),
];

const hardware = (id, name, color, { metalness = 0.88, roughness = 0.28, rarity = "common", collection = "classic" } = {}) =>
  item({
    id: `table.hardware.${id}`,
    type: "table-hardware",
    name,
    rarity,
    collection,
    presentation: { color, metalness, roughness },
    tags: ["hardware", "metal"],
  });

const HARDWARE = [
  hardware("brass", "Brass", "#c79a4f", { collection: "brass" }),
  hardware("chrome", "Chrome", "#d8dde2", { metalness: 0.95, roughness: 0.12, collection: "tournament" }),
  hardware("black-steel", "Black Steel", "#2a2d31", { metalness: 0.9, roughness: 0.34, collection: "after-hours" }),
  hardware("copper", "Copper", "#b06a3a", { metalness: 0.9, roughness: 0.3, rarity: "uncommon", collection: "brass" }),
  hardware("gunmetal", "Gunmetal", "#5a6068", { metalness: 0.85, roughness: 0.4, rarity: "rare", collection: "tournament" }),
];

const pockets = (id, name, { liner, mouth = "#050505", roughness = 0.96, rarity = "common", collection = "classic" }) =>
  item({
    id: `table.pockets.${id}`,
    type: "table-pocket-liner",
    name,
    rarity,
    collection,
    presentation: { liner, mouth, roughness },
    tags: ["pockets", "leather"],
  });

const POCKET_LINERS = [
  pockets("black-leather", "Black Leather", { liner: "#11100f" }),
  pockets("brown-leather", "Brown Leather", { liner: "#6b4a2c", collection: "parlour" }),
  pockets("burgundy-leather", "Burgundy Leather", { liner: "#3f151a", collection: "after-hours" }),
  pockets("green-baize", "Green Baize", { liner: "#1a4a30", roughness: 1, rarity: "uncommon", collection: "tournament" }),
  pockets("brass-ring", "Brass Ring", { liner: "#8a6a34", mouth: "#080604", roughness: 0.5, rarity: "rare", collection: "brass" }),
];

const sight = (id, name, { shape, color, metalness = 0.88, roughness = 0.28, rarity = "common", collection = "classic" }) =>
  item({
    id: `table.sights.${id}`,
    type: "table-sight",
    name,
    rarity,
    collection,
    // `shape` swaps the little decorative geometry on the rail cap and nothing
    // else. The SIX-AND-FOUR sight POSITIONS are a property of the table, not of
    // this item: a sight that could move would be an aiming aid, not a cosmetic.
    presentation: { shape, color, metalness, roughness },
    tags: ["sights", shape],
  });

const SIGHTS = [
  sight("brass-diamond", "Brass Diamonds", { shape: "diamond", color: "#c79a4f", collection: "brass" }),
  sight("white-diamond", "White Diamonds", { shape: "diamond", color: "#f0ece2", metalness: 0.05, roughness: 0.35, collection: "classic" }),
  sight("minimal-dot", "Minimal Dots", { shape: "circle", color: "#b9bec6", metalness: 0.5, roughness: 0.3, collection: "tournament" }),
  sight("card-suits", "Card Suits", { shape: "suits", color: "#d8c08a", metalness: 0.7, roughness: 0.3, rarity: "uncommon", collection: "parlour" }),
  sight("black-diamond", "Black Diamonds", { shape: "diamond", color: "#171719", metalness: 0.3, roughness: 0.42, rarity: "uncommon", collection: "after-hours" }),
  sight("chrome-bar", "Chrome Bars", { shape: "bar", color: "#d8dde2", metalness: 0.95, roughness: 0.12, rarity: "rare", collection: "tournament" }),
];

// ---------------------------------------------------------------------------
// Table — decals
// ---------------------------------------------------------------------------
// A decal lands in a ZONE, not at a position the player drags. The two zones are
// the centre of the long apron and the centre of the short apron — the two
// places a real table carries a maker's plate — and `span` is how wide the mark
// is in metres. Free placement is deliberately not the starting point: it turns
// a two-click choice into a layout tool, and every table then needs a rescue
// button for the player who parked their crest inside a pocket.

const decal = (id, name, presentation, { rarity = "common", collection = "classic", source = DEV, blurb = "" } = {}) =>
  item({ id: `table.decal.${id}`, type: "table-decal", name, rarity, collection, source, presentation, tags: ["decal", presentation.zone], blurb });

const DECALS = [
  decal("house-script", "House Script", { kind: "text", text: "SHARK HALL", zone: "apron-long", color: "#cbb489", alpha: 0.92, span: 0.86 }),
  decal("eight-roundel", "Eight Roundel", { kind: "roundel", text: "8", zone: "apron-short", color: "#e8dcc0", alpha: 0.95, span: 0.24 }),
  decal("shark-fin", "Shark Fin", { kind: "fin", zone: "apron-long", color: "#9fb6cc", alpha: 0.9, span: 0.5 }, { collection: "classic" }),
  decal("diamond-run", "Diamond Run", { kind: "diamond-row", zone: "apron-long", color: "#dfe6ee", alpha: 0.85, span: 0.72 }, { rarity: "uncommon", collection: "tournament" }),
  decal("card-suits", "Card Suits", { kind: "suits", zone: "apron-short", color: "#d8c08a", alpha: 0.92, span: 0.32 }, { rarity: "uncommon", collection: "parlour" }),
  decal("brass-plate", "Brass Nameplate", { kind: "plate", text: "SHARK HALL · EST. 8", zone: "apron-long", color: "#e0c070", alpha: 1, span: 0.78 }, { rarity: "rare", collection: "brass" }),
  decal("circuit-laurel", "Circuit Laurel", { kind: "laurel", zone: "apron-short", color: "#d8ae5a", alpha: 0.95, span: 0.3 }, {
    rarity: "epic",
    collection: "tournament",
    source: from("circuit-champion", "Win the Shark Hall circuit"),
    blurb: "Laurels on the foot apron. Earned, once the circuit exists.",
  }),
  decal("founders-seal", "Founder's Seal", { kind: "seal", zone: "apron-short", color: "#e2c98e", alpha: 0.95, span: 0.28 }, {
    rarity: "legendary",
    collection: "founding",
    source: from("founding", "Founding player"),
  }),
];

// ---------------------------------------------------------------------------
// Table — ball sets
// ---------------------------------------------------------------------------
// The presentation IS the palette from `ball-sets.js`, measured readability
// block and all. Nothing is re-declared here, so a set cannot be listed with one
// palette and validated against another.

const ballSet = (id, name, set, { rarity = "common", collection = "classic", source = DEV, blurb = "" } = {}) =>
  item({ id: `balls.${id}`, type: "ball-set", name, rarity, collection, source, presentation: set, tags: ["balls"], blurb });

const BALL_SET_ITEMS = [
  ballSet("classic", "Classic", CLASSIC, { blurb: "The set the hall racks by default." }),
  ballSet("casino", "Casino", CASINO, { collection: "parlour", blurb: "Chip colours with a gilt ring around every number." }),
  ballSet("midnight", "Midnight", MIDNIGHT, { rarity: "uncommon", collection: "after-hours" }),
  ballSet("brass-hall", "Brass Hall", BRASS_HALL, { rarity: "uncommon", collection: "brass" }),
  ballSet("tournament", "Tournament", TOURNAMENT, { rarity: "rare", collection: "tournament" }),
  ballSet("neon-run", "Neon", NEON_RUN, { rarity: "epic", collection: "parlour", blurb: "Loud, and still legal: every band clears the readability floor." }),
];

// ---------------------------------------------------------------------------
// Hall
// ---------------------------------------------------------------------------

const wall = (id, name, color, sideColor, { rarity = "common", collection = "classic", roughness = 0.96 } = {}) =>
  item({ id: `hall.wall.${id}`, type: "hall-wall", name, rarity, collection, presentation: { color, sideColor, roughness }, tags: ["wall"] });

const WALLS = [
  wall("charcoal", "Charcoal Panel", "#17181b", "#121316"),
  wall("walnut-panel", "Walnut Panelling", "#2b1d14", "#20150e", { collection: "parlour" }),
  wall("oxblood-panel", "Oxblood Panelling", "#2a1417", "#1e0f12", { rarity: "uncommon", collection: "after-hours" }),
  wall("forest-panel", "Forest Panelling", "#14231c", "#0f1a15", { rarity: "uncommon", collection: "tournament" }),
  wall("smoke-plaster", "Smoke Plaster", "#2c2b28", "#232220", { rarity: "rare", collection: "after-hours", roughness: 1 }),
  wall("midnight-blue", "Midnight Blue", "#141a26", "#0f141d", { rarity: "rare", collection: "classic" }),
];

const floor = (id, name, { pattern, colors, repeat = [8, 8], roughness = 0.9, rarity = "common", collection = "classic" }) =>
  item({ id: `hall.floor.${id}`, type: "hall-floor", name, rarity, collection, presentation: { pattern, colors, repeat, roughness }, tags: ["floor", pattern] });

const FLOORS = [
  floor("parquet-dark", "Dark Parquet", { pattern: "parquet", colors: ["#1d1713", "#291f18", "#231b15"] }),
  floor("parquet-honey", "Honey Parquet", { pattern: "parquet", colors: ["#2e2318", "#4a3722", "#3c2c1b"], collection: "parlour" }),
  floor("checker-tile", "Checker Tile", { pattern: "checker", colors: ["#1a1a1c", "#2e2e31", "#141416"], repeat: [10, 10], roughness: 0.55, rarity: "uncommon", collection: "after-hours" }),
  floor("boards-walnut", "Wide Boards", { pattern: "boards", colors: ["#241a13", "#33241a", "#1b130d"], repeat: [6, 6], rarity: "uncommon", collection: "classic" }),
  floor("poured-concrete", "Poured Concrete", { pattern: "concrete", colors: ["#26262a", "#2e2e33", "#1f1f23"], repeat: [4, 4], roughness: 0.98, rarity: "rare", collection: "tournament" }),
];

const light = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.light.${id}`, type: "hall-light", name, rarity, collection, presentation, tags: ["light"] });

// `intensity` is candela on the one shadow-casting lamp over the table. The
// renderer CLAMPS it into a playable band: a fixture nobody can see the cloth
// under is not a cosmetic, it is a broken table.
const LIGHTS = [
  light("brass-triple", "Brass Triple", { warm: "#ffdfac", intensity: 30, shade: "#2b2d31", shadeMetal: 0.58, bar: "#242629", bulb: "#ffe0a8", count: 3, shadeSpan: 0.25 }),
  light("black-cone-triple", "Black Cones", { warm: "#ffe6c2", intensity: 32, shade: "#141518", shadeMetal: 0.4, bar: "#101113", bulb: "#fff0cf", count: 3, shadeSpan: 0.23 }, { collection: "after-hours" }),
  light("green-shade-triple", "Green Shades", { warm: "#fff0cc", intensity: 31, shade: "#13341f", shadeMetal: 0.35, bar: "#1c2a20", bulb: "#fff2d4", count: 3, shadeSpan: 0.26 }, { rarity: "uncommon", collection: "parlour" }),
  light("single-dome", "Single Dome", { warm: "#ffd79a", intensity: 34, shade: "#3a2a1a", shadeMetal: 0.5, bar: "#2a1e12", bulb: "#ffdda0", count: 1, shadeSpan: 0.44 }, { rarity: "uncommon", collection: "classic" }),
  light("cool-tournament", "Tournament Bar", { warm: "#e8f0ff", intensity: 36, shade: "#c9ced6", shadeMetal: 0.8, bar: "#9aa1ab", bulb: "#f2f7ff", count: 3, shadeSpan: 0.2 }, { rarity: "rare", collection: "tournament" }),
];

const art = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.wall-art.${id}`, type: "hall-wall-art", name, rarity, collection, presentation, tags: ["art"] });

const WALL_ART = [
  art("abstract-trio", "Abstract Trio", { frame: "#2d2118", art: ["#223243", "#3f2c22", "#1f3128"], count: 3, span: [0.93, 0.66] }),
  art("portrait-row", "Portrait Row", { frame: "#3a2a18", art: ["#3a2f28", "#2b241f", "#332a22"], count: 3, span: [0.6, 0.84] }, { collection: "parlour" }),
  art("felt-pennants", "Felt Pennants", { frame: "#1a1a1c", art: ["#6c1f2d", "#1e5b3c", "#24618f"], count: 3, span: [0.8, 0.5] }, { rarity: "uncommon", collection: "classic" }),
  art("hall-photos", "Hall Photographs", { frame: "#c79a4f", art: ["#2a2622", "#242019", "#1f1c17"], count: 3, span: [0.7, 0.7] }, { rarity: "uncommon", collection: "brass" }),
  art("neon-panels", "Neon Panels", { frame: "#101216", art: ["#1fa8e8", "#ff2d6a", "#20d17a"], count: 3, span: [0.9, 0.4], emissive: 0.55 }, { rarity: "rare", collection: "parlour" }),
];

const cueRack = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.cue-rack.${id}`, type: "hall-cue-rack", name, rarity, collection, presentation, tags: ["cue-rack"] });

const CUE_RACKS = [
  cueRack("walnut", "Walnut Rack", { wood: "#3a2418", metal: "#c79a4f", cues: ["#c9a06a", "#8d5f33", "#c9a06a", "#6b4423", "#a97b47", "#8d5f33"] }),
  cueRack("ebony", "Ebony Rack", { wood: "#1b1715", metal: "#8f949b", cues: ["#4a4a4c", "#2d2d2f", "#5c5c5f", "#3a3a3c", "#4a4a4c", "#2d2d2f"] }, { collection: "after-hours" }),
  cueRack("brass-wall", "Brass Wall Rack", { wood: "#241a12", metal: "#d8ab5c", cues: ["#d8b57e", "#a97b47", "#d8b57e", "#8d5f33", "#c9a06a", "#a97b47"] }, { rarity: "uncommon", collection: "brass" }),
  cueRack("glass-case", "Glass Case", { wood: "#c9ced6", metal: "#e6ebf1", cues: ["#e0e6ec", "#c9a06a", "#e0e6ec", "#8d5f33", "#c9ced6", "#a97b47"], glass: true }, { rarity: "rare", collection: "tournament" }),
];

const shelf = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.trophy-shelf.${id}`, type: "hall-trophy-shelf", name, rarity, collection, presentation, tags: ["shelf"] });

const TROPHY_SHELVES = [
  shelf("classic-walnut", "Walnut Shelf", { wood: "#3a2418", metal: "#c79a4f", tiers: 2 }),
  shelf("brass-tier", "Brass Tier", { wood: "#241a12", metal: "#d8ab5c", tiers: 3 }, { rarity: "uncommon", collection: "brass" }),
  shelf("glass-shelf", "Glass Shelf", { wood: "#b9c0c8", metal: "#e6ebf1", tiers: 2, glass: true }, { rarity: "rare", collection: "tournament" }),
];

const sign = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.accent-sign.${id}`, type: "hall-accent-sign", name, rarity, collection, presentation, tags: ["sign", "neon"] });

const SIGNS = [
  sign("eight-ball", "8 BALL", { text: "8 BALL", color: "#ff5a7a", glow: 0.9, backing: "#141014" }),
  sign("open-late", "OPEN LATE", { text: "OPEN LATE", color: "#ffcf6a", glow: 0.85, backing: "#161310" }, { collection: "after-hours" }),
  sign("shark-hall", "SHARK HALL", { text: "SHARK HALL", color: "#7ad3ff", glow: 0.95, backing: "#101418" }, { rarity: "uncommon", collection: "classic" }),
  sign("no-gambling", "NO GAMBLING", { text: "NO GAMBLING", color: "#8affc0", glow: 0.7, backing: "#101613" }, { rarity: "uncommon", collection: "parlour" }),
  sign("house-rules", "HOUSE RULES", { text: "HOUSE RULES", color: "#e0b0ff", glow: 0.8, backing: "#151018" }, { rarity: "rare", collection: "parlour" }),
];

const furniture = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.furniture.${id}`, type: "hall-furniture", name, rarity, collection, presentation, tags: ["furniture", presentation.kind] });

const FURNITURE = [
  furniture("bar-stool", "Bar Stool", { kind: "stool", wood: "#2e1f14", upholstery: "#4a161f", metal: "#8f949b" }),
  furniture("wing-chair", "Wing Chair", { kind: "chair", wood: "#241a12", upholstery: "#2a3a52", metal: "#c79a4f" }, { collection: "parlour" }),
  furniture("side-table", "Side Table", { kind: "table", wood: "#3a2418", upholstery: "#3a2418", metal: "#c79a4f" }),
  furniture("player-bench", "Player Bench", { kind: "bench", wood: "#1f1a16", upholstery: "#14402b", metal: "#8f949b" }, { rarity: "uncommon", collection: "tournament" }),
  furniture("brass-cabinet", "Brass Cabinet", { kind: "cabinet", wood: "#2b1d14", upholstery: "#6b4a2c", metal: "#d8ab5c" }, { rarity: "rare", collection: "brass" }),
];

const rug = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.rug.${id}`, type: "hall-rug", name, rarity, collection, presentation, tags: ["rug"] });

const RUGS = [
  rug("persian-red", "Persian Red", { color: "#5a1f22", border: "#8a6a34", span: [3.2, 2.2] }),
  rug("runner-navy", "Navy Runner", { color: "#1d2a40", border: "#c79a4f", span: [4.2, 1.2] }),
  rug("geometric-green", "Geometric Green", { color: "#1a3a2a", border: "#c9b07a", span: [3, 2.4] }, { rarity: "uncommon", collection: "tournament" }),
  rug("worn-tan", "Worn Tan", { color: "#4a3a26", border: "#6b5636", span: [3.4, 2.4] }, { rarity: "uncommon", collection: "parlour" }),
  rug("black-diamond", "Black Diamond", { color: "#16161a", border: "#4a4a52", span: [3.6, 2.6] }, { rarity: "rare", collection: "after-hours" }),
];

const windowItem = (id, name, presentation, { rarity = "common", collection = "classic" } = {}) =>
  item({ id: `hall.window.${id}`, type: "hall-window", name, rarity, collection, presentation, tags: ["window"] });

const WINDOWS = [
  windowItem("shuttered", "Shuttered", { frame: "#241a12", glass: "#28313f", blinds: true, glow: 0.25 }),
  windowItem("rain-glass", "Rain Glass", { frame: "#1c1c20", glass: "#3a4a5e", blinds: false, glow: 0.4 }, { collection: "after-hours" }),
  windowItem("street-blinds", "Street Blinds", { frame: "#2c2c30", glass: "#4a5468", blinds: true, glow: 0.55 }, { rarity: "uncommon", collection: "classic" }),
  windowItem("stained-glass", "Stained Glass", { frame: "#3a2a18", glass: "#6a3a5e", blinds: false, glow: 0.7 }, { rarity: "rare", collection: "parlour" }),
];

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------
// Four types, one rendering path, and NOT ONE development source among them.
// They are reachable today only because the development inventory grants the
// whole catalog; the moment ownership is real, every entry here is refused
// unless a server says otherwise. That is exactly why they are not
// `hall-furniture` items that happen to be trophy-shaped.

const award = (id, type, name, presentation, source, { rarity = "epic", collection = "trophies" } = {}) =>
  item({ id: `award.${id}`, type, name, rarity, collection, source, presentation, tags: ["award", type] });

const AWARDS = [
  award("trophy.house-cup", "trophy", "House Cup", { form: "cup", metal: "#c79a4f", accent: "#8a6a34", plate: "#3a2418", label: "HOUSE CUP" }, from("circuit-champion", "Win a circuit season")),
  award("trophy.circuit-champion", "trophy", "Circuit Champion", { form: "cup", metal: "#e0c070", accent: "#9a7a3a", plate: "#241a12", label: "CHAMPION" }, from("tournament-champion", "Win a Shark Hall tournament"), { rarity: "legendary" }),
  award("plaque.first-clear", "plaque", "First Clear", { form: "plaque", metal: "#b9c0c8", accent: "#6a7078", plate: "#2b1d14", label: "FIRST CLEAR" }, from("circuit-first-clear", "Clear the circuit once"), { rarity: "rare" }),
  award("plaque.founding-member", "plaque", "Founding Member", { form: "plaque", metal: "#d8ab5c", accent: "#8a6a34", plate: "#1b1512", label: "FOUNDING" }, from("founding", "Founding player"), { rarity: "legendary" }),
  award("framed.perfect-rack", "framed-award", "Perfect Rack", { form: "frame", metal: "#c9a06a", accent: "#6b4423", plate: "#141210", label: "PERFECT RACK" }, from("achievement", "Run a rack from the break"), { rarity: "rare" }),
  award("championship.season-one", "championship-display", "Season One", { form: "case", metal: "#e0c070", accent: "#3a2418", plate: "#0f0d0c", label: "SEASON ONE" }, from("season", "Season one placement"), { rarity: "legendary" }),
];

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
// A preset is A CATALOG ITEM WITH SLOT ASSIGNMENTS, not a second model. It has
// no presentation of its own — nothing renders a preset — and `loadout.js`
// applies it by copying its `slots` over the equipped ones. That is the whole
// mechanism, and it is why adding a preset is adding a row here.

const preset = (id, type, name, slots, { rarity = "common", collection = null, source = DEV, blurb = "" } = {}) =>
  Object.freeze({
    id,
    type,
    name,
    rarity,
    collection,
    source,
    entitlement: source.kind !== "development",
    presentation: null,
    slots: Object.freeze({ ...slots }),
    tags: Object.freeze(["preset"]),
    blurb,
  });

const TABLE_PRESETS = [
  preset("preset.table.shark-hall-classic", "table-preset", "Shark Hall Classic", {
    cloth: "table.cloth.shark-navy",
    rail: "table.rail.dark-walnut",
    apron: "table.apron.dark-walnut",
    cushion: "table.cushion.navy",
    hardware: "table.hardware.brass",
    pockets: "table.pockets.black-leather",
    sights: "table.sights.brass-diamond",
    decal: "table.decal.house-script",
    balls: "balls.classic",
  }, { blurb: "The table as the hall keeps it." }),
  preset("preset.table.rusty-rail", "table-preset", "Rusty Rail", {
    cloth: "table.cloth.oxblood",
    rail: "table.rail.gunmetal",
    apron: "table.apron.mahogany",
    cushion: "table.cushion.walnut-rubber",
    hardware: "table.hardware.copper",
    pockets: "table.pockets.brown-leather",
    sights: "table.sights.black-diamond",
    decal: "table.decal.shark-fin",
    balls: "balls.brass-hall",
  }, { rarity: "uncommon", collection: "after-hours", blurb: "Brushed steel over old mahogany. Every rail in the room has a story." }),
  preset("preset.table.midnight", "table-preset", "Midnight", {
    cloth: "table.cloth.charcoal",
    rail: "table.rail.ebony",
    apron: "table.apron.black-lacquer",
    cushion: "table.cushion.charcoal",
    hardware: "table.hardware.black-steel",
    pockets: "table.pockets.burgundy-leather",
    sights: "table.sights.minimal-dot",
    decal: "table.decal.eight-roundel",
    balls: "balls.midnight",
  }, { rarity: "uncommon", collection: "after-hours" }),
  preset("preset.table.casino", "table-preset", "Casino", {
    cloth: "table.cloth.burgundy",
    rail: "table.rail.mahogany",
    apron: "table.apron.mahogany",
    cushion: "table.cushion.burgundy",
    hardware: "table.hardware.brass",
    pockets: "table.pockets.brown-leather",
    sights: "table.sights.card-suits",
    decal: "table.decal.card-suits",
    balls: "balls.casino",
  }, { rarity: "rare", collection: "parlour" }),
  preset("preset.table.tournament-traditional", "table-preset", "Tournament Traditional", {
    cloth: "table.cloth.tournament-green",
    rail: "table.rail.natural-oak",
    apron: "table.apron.natural-oak",
    cushion: "table.cushion.forest",
    hardware: "table.hardware.chrome",
    pockets: "table.pockets.green-baize",
    sights: "table.sights.white-diamond",
    decal: "table.decal.diamond-run",
    balls: "balls.tournament",
  }, { rarity: "rare", collection: "tournament" }),
  preset("preset.table.brass-parlour", "table-preset", "Brass Parlour", {
    cloth: "table.cloth.gold-dust",
    rail: "table.rail.black-lacquer",
    apron: "table.apron.black-lacquer",
    cushion: "table.cushion.walnut-rubber",
    hardware: "table.hardware.copper",
    pockets: "table.pockets.brass-ring",
    sights: "table.sights.brass-diamond",
    decal: "table.decal.brass-plate",
    balls: "balls.brass-hall",
  }, { rarity: "epic", collection: "brass" }),
];

const HALL_PRESETS = [
  preset("preset.hall.house", "hall-room-preset", "House Hall", {
    walls: "hall.wall.charcoal",
    floor: "hall.floor.parquet-dark",
    hangingLight: "hall.light.brass-triple",
    wallArtLeft: "hall.wall-art.abstract-trio",
    wallArtRight: null,
    cueRack: "hall.cue-rack.walnut",
    trophyShelf: "hall.trophy-shelf.classic-walnut",
    accentSign: null,
    furnitureLeft: "hall.furniture.bar-stool",
    furnitureRight: null,
    rug: null,
    window: "hall.window.shuttered",
    awardLeft: null,
    awardRight: null,
  }),
  preset("preset.hall.after-hours", "hall-room-preset", "After Hours", {
    walls: "hall.wall.oxblood-panel",
    floor: "hall.floor.checker-tile",
    hangingLight: "hall.light.black-cone-triple",
    wallArtLeft: "hall.wall-art.neon-panels",
    wallArtRight: null,
    cueRack: "hall.cue-rack.ebony",
    trophyShelf: null,
    accentSign: "hall.accent-sign.open-late",
    furnitureLeft: "hall.furniture.bar-stool",
    furnitureRight: "hall.furniture.side-table",
    rug: "hall.rug.black-diamond",
    window: "hall.window.rain-glass",
    awardLeft: null,
    awardRight: null,
  }, { rarity: "uncommon", collection: "after-hours" }),
  preset("preset.hall.smoky-parlour", "hall-room-preset", "Smoky Parlour", {
    walls: "hall.wall.walnut-panel",
    floor: "hall.floor.parquet-honey",
    hangingLight: "hall.light.green-shade-triple",
    wallArtLeft: "hall.wall-art.portrait-row",
    wallArtRight: "hall.wall-art.felt-pennants",
    cueRack: "hall.cue-rack.brass-wall",
    trophyShelf: "hall.trophy-shelf.brass-tier",
    accentSign: "hall.accent-sign.no-gambling",
    furnitureLeft: "hall.furniture.wing-chair",
    furnitureRight: "hall.furniture.side-table",
    rug: "hall.rug.worn-tan",
    window: "hall.window.stained-glass",
    awardLeft: null,
    awardRight: null,
  }, { rarity: "rare", collection: "parlour" }),
  preset("preset.hall.championship", "hall-room-preset", "Championship Room", {
    walls: "hall.wall.forest-panel",
    floor: "hall.floor.poured-concrete",
    hangingLight: "hall.light.cool-tournament",
    wallArtLeft: "hall.wall-art.hall-photos",
    wallArtRight: "hall.wall-art.hall-photos",
    cueRack: "hall.cue-rack.glass-case",
    trophyShelf: "hall.trophy-shelf.glass-shelf",
    accentSign: "hall.accent-sign.shark-hall",
    furnitureLeft: "hall.furniture.player-bench",
    furnitureRight: "hall.furniture.player-bench",
    rug: "hall.rug.geometric-green",
    window: "hall.window.street-blinds",
    awardLeft: "award.trophy.circuit-champion",
    awardRight: "award.championship.season-one",
  }, { rarity: "epic", collection: "tournament" }),
];

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/** Every cosmetic in the cabinet, in one list. Frozen — nothing may edit the catalog. */
export const CATALOG = Object.freeze([
  ...CLOTHS,
  ...RAILS,
  ...APRONS,
  ...CUSHIONS,
  ...HARDWARE,
  ...POCKET_LINERS,
  ...SIGHTS,
  ...DECALS,
  ...BALL_SET_ITEMS,
  ...WALLS,
  ...FLOORS,
  ...LIGHTS,
  ...WALL_ART,
  ...CUE_RACKS,
  ...TROPHY_SHELVES,
  ...SIGNS,
  ...FURNITURE,
  ...RUGS,
  ...WINDOWS,
  ...AWARDS,
  ...TABLE_PRESETS,
  ...HALL_PRESETS,
]);

const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));

/** One item, or null. NEVER THROWS: an id read back from storage is untrusted. */
export function findItem(id) {
  return (id && BY_ID.get(id)) || null;
}

/** Every item of a type (or of any of several), in catalog order. */
export function itemsOfType(type) {
  const types = Array.isArray(type) ? type : [type];
  return CATALOG.filter((entry) => types.includes(entry.type));
}

/** Every item a slot will accept — the editor's tray for one category. */
export function itemsForSlot(slot) {
  return itemsOfType(slot.type);
}

/** Every preset of a preset type. */
export function presetsOfType(type) {
  return CATALOG.filter((entry) => entry.type === type);
}

/** Every id in the catalog. The development inventory is built straight off this. */
export function allItemIds() {
  return CATALOG.map((entry) => entry.id);
}
