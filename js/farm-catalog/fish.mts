// The Cove's fish and tackle, as data. PURE — no THREE, no DOM, no storage.
//
// Every fish in Quaternius's Ultimate Fish pack (CC0, farm/assets/fishing/) is
// a species here: where in the Cove it lives, how rare it is, how heavy it
// runs, how it fights and what an average one is worth. What any ONE fish is —
// its weight, length, size class, grade and colour — is a specimen
// (farm-fish.mts), rolled by the server when it bites.
//
// The server holds its own copy of these rows (platform-api/src/services/
// farm-fish-catalog.mts), because it is the server that rolls a specimen and
// pays for it; platform-api/tests/farm-fishing.test.mjs holds the two equal.
//
// THE COVE (planning-docs/FARM_FISHING_PLAN.md §3) is three waters:
//   lagoon  the freshwater lagoon west of the spit — calm, shallow, near shore
//   reef    the reef shelf on the sea side, reached from the docks
//   deep    the drop-off past the long dock's end, a strong cast out
// A species is only ever caught in its own zones.

export const FISH_ZONES = Object.freeze(["lagoon", "reef", "deep", "grotto", "volcanic", "cedar-creek", "estate-lake"] as const);
export type FishZone = (typeof FISH_ZONES)[number];

export const FISH_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"] as const);
export type FishRarity = (typeof FISH_RARITIES)[number];

/**
 * How a fish pulls on the line (farm-fishing.mts):
 *   darter    sudden short sprints
 *   diver     long steady runs downward
 *   thrasher  jittery spikes of tension
 *   sulker    heavy and slow, little pull but a lot of stamina
 *   leaper    jumps; bow the rod as it leaps or the tension spikes
 */
export const FIGHT_STYLES = Object.freeze(["darter", "diver", "thrasher", "sulker", "leaper"] as const);
export type FightStyle = (typeof FIGHT_STYLES)[number];

export type FishSpecies = Readonly<{
  id: string;
  title: string;
  /** The GLB in farm/assets/fishing/. */
  file: string;
  appearance?: Readonly<{ colors: Readonly<{ main: string; light: string; fins: string; dark: string }>; width: number; height: number }>;
  rarity: FishRarity;
  zones: readonly FishZone[];
  /** The lightest, an average, and the heaviest one ever caught, in kilograms. */
  weightKg: Readonly<{ min: number; avg: number; max: number }>;
  /** Nose to tail at average weight, in metres. A specimen's length follows its weight (the cube law). */
  lengthM: number;
  fight: FightStyle;
  /** How hard an average one pulls, 0..1 (the rarity adds to it). */
  strength: number;
  /** Tickets for an average, Normal-grade, ordinary-coloured one at the Fishmonger. */
  value: number;
  /** A line for the Fishdex. */
  blurb: string;
}>;

/** How much each rarity is worth in Fishing XP, before size and grade. */
export const RARITY_XP: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 10, uncommon: 18, rare: 35, epic: 70, legendary: 150 });
/** How hard a rarity fights on top of its species' own pull. */
export const RARITY_STRENGTH: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 0, uncommon: 0.06, rare: 0.12, epic: 0.2, legendary: 0.3 });
export const RARITY_TITLES: Readonly<Record<FishRarity, string>> = Object.freeze({ common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" });
export const RARITY_COLORS: Readonly<Record<FishRarity, string>> = Object.freeze({ common: "#9aa3ad", uncommon: "#4caf50", rare: "#3d8bfd", epic: "#a855f7", legendary: "#f59e0b" });
export const ZONE_TITLES: Readonly<Record<FishZone, string>> = Object.freeze({ lagoon: "The Lagoon", reef: "The Reef Shelf", deep: "The Deep", grotto: "Fernfall Grotto", volcanic: "Emberglass Lagoon", "cedar-creek": "Cedar Creek", "estate-lake": "Sunwater Private Lake" });

const fish = (
  key: string,
  title: string,
  rarity: FishRarity,
  zones: readonly FishZone[],
  weightKg: readonly [number, number, number],
  lengthM: number,
  fight: FightStyle,
  strength: number,
  value: number,
  blurb: string,
  look?: Readonly<{ file: string; colors: Readonly<{ main: string; light: string; fins: string; dark: string }>; width: number; height: number }>,
): FishSpecies => Object.freeze({
  id: `fish.${key}`,
  title,
  file: look?.file ?? `${key}.glb`,
  ...(look ? { appearance: Object.freeze({ colors: Object.freeze(look.colors), width: look.width, height: look.height }) } : {}),
  rarity,
  zones: Object.freeze([...zones]),
  weightKg: Object.freeze({ min: weightKg[0], avg: weightKg[1], max: weightKg[2] }),
  lengthM,
  fight,
  strength,
  value,
  blurb,
});

export const FISH_CATALOG: readonly FishSpecies[] = Object.freeze([
  // Common
  fish("goldfish", "Goldfish", "common", ["lagoon", "cedar-creek"], [0.05, 0.2, 0.9], 0.18, "darter", 0.12, 3, "Somebody let one go years ago. Now there are thousands."),
  fish("tetra", "Tetra", "common", ["lagoon"], [0.02, 0.06, 0.2], 0.09, "darter", 0.08, 2, "Small, quick, and always in a crowd."),
  fish("armored-catfish", "Armored Catfish", "common", ["lagoon", "cedar-creek"], [0.3, 1.2, 4], 0.45, "sulker", 0.22, 4, "Hoovers the lagoon floor clean and minds its own business."),
  fish("cardinal-fish", "Cardinal Fish", "common", ["reef"], [0.03, 0.1, 0.3], 0.1, "darter", 0.1, 2, "Big eyes for a small fish. It hides by day."),
  fish("butterfly-fish", "Butterfly Fish", "common", ["reef"], [0.1, 0.35, 1], 0.18, "leaper", 0.14, 3, "Flits between the coral heads in pairs."),
  fish("tang", "Tang", "common", ["reef"], [0.2, 0.6, 1.6], 0.25, "darter", 0.16, 3, "Grazes the reef shelf all day long."),
  fish("cowfish", "Cowfish", "common", ["reef"], [0.2, 0.7, 2], 0.3, "sulker", 0.14, 4, "A box with horns and a very slow idea of swimming."),
  fish("flatfish", "Flatfish", "common", ["reef", "deep"], [0.4, 1.5, 6], 0.4, "sulker", 0.2, 4, "Both eyes on one side, and the sand on the other."),
  // Uncommon
  fish("blue-goldfish", "Blue Goldfish", "uncommon", ["lagoon", "estate-lake"], [0.05, 0.25, 1], 0.19, "darter", 0.14, 6, "A goldfish that is not gold. Nobody knows why."),
  fish("betta", "Betta", "uncommon", ["lagoon"], [0.01, 0.04, 0.12], 0.07, "thrasher", 0.12, 7, "All fins and temper."),
  fish("piranha", "Piranha", "uncommon", ["lagoon"], [0.3, 1.2, 3.5], 0.3, "thrasher", 0.3, 8, "Mind your fingers when you take the hook out."),
  fish("clownfish", "Clownfish", "uncommon", ["reef"], [0.05, 0.15, 0.4], 0.11, "darter", 0.12, 6, "Never strays far from its anemone."),
  fish("yellow-tang", "Yellow Tang", "uncommon", ["reef"], [0.1, 0.35, 0.9], 0.2, "darter", 0.14, 6, "A splash of yellow you can see from the dock."),
  fish("blue-tang", "Blue Tang", "uncommon", ["reef"], [0.2, 0.6, 1.6], 0.28, "darter", 0.16, 7, "Forgets where it was going, then gets there fast."),
  fish("puffer", "Puffer", "uncommon", ["reef"], [0.3, 1, 3], 0.3, "sulker", 0.16, 8, "Puffs up the moment it leaves the water. Handle with care."),
  fish("royal-gramma", "Royal Gramma", "uncommon", ["reef"], [0.02, 0.06, 0.15], 0.08, "darter", 0.1, 6, "Half violet, half gold, all attitude."),
  fish("red-snapper", "Red Snapper", "uncommon", ["reef", "deep"], [1, 4, 15], 0.6, "diver", 0.36, 9, "A proper fish supper, if you can land it."),
  fish("turbot", "Turbot", "uncommon", ["deep"], [1, 5, 25], 0.6, "sulker", 0.34, 9, "A flat, heavy slab that sits on the bottom and refuses."),
  // Rare
  fish("koi", "Koi", "rare", ["lagoon", "cedar-creek"], [1, 4, 20], 0.6, "sulker", 0.3, 18, "The lagoon's old gentlemen. Some are older than the farm."),
  fish("zebra-clown-fish", "Zebra Clownfish", "rare", ["reef"], [0.06, 0.18, 0.45], 0.12, "darter", 0.14, 16, "A clownfish that went to a different tailor."),
  fish("moorish-idol", "Moorish Idol", "rare", ["reef"], [0.2, 0.5, 1.2], 0.22, "leaper", 0.2, 17, "Trails a long white banner wherever it goes."),
  fish("parrot-fish", "Parrot Fish", "rare", ["reef"], [1, 4, 20], 0.6, "diver", 0.36, 20, "Crunches coral for breakfast and makes the beach sand."),
  fish("lionfish", "Lionfish", "rare", ["reef"], [0.3, 1, 2.5], 0.35, "thrasher", 0.26, 18, "Every spine is a warning."),
  fish("coral-grouper", "Coral Grouper", "rare", ["reef", "deep"], [2, 8, 30], 0.75, "diver", 0.44, 22, "Lurks under the ledge and swallows what swims past."),
  fish("tuna", "Tuna", "rare", ["deep"], [20, 80, 400], 1.6, "diver", 0.58, 25, "Built like a torpedo and never stops swimming."),
  // Epic
  fish("flower-horn", "Flower Horn", "epic", ["lagoon", "estate-lake"], [0.3, 1, 3], 0.3, "thrasher", 0.3, 50, "A lucky fish, they say. The bump is where the luck is kept."),
  fish("mandarin-fish", "Mandarin Fish", "epic", ["reef"], [0.02, 0.06, 0.15], 0.07, "darter", 0.14, 48, "Painted by someone who had every colour and used them all."),
  fish("black-lion-fish", "Black Lionfish", "epic", ["reef"], [0.4, 1.2, 3], 0.38, "thrasher", 0.3, 55, "A lionfish in mourning dress. Twice the spines, twice the bad mood."),
  fish("humphead", "Humphead", "epic", ["reef"], [20, 70, 190], 1.5, "sulker", 0.6, 60, "The biggest wrasse on the reef, and it knows it."),
  fish("swordfish", "Swordfish", "epic", ["deep"], [40, 150, 650], 2.8, "leaper", 0.7, 70, "Comes up out of the Deep like a thrown spear."),
  fish("sunfish", "Sunfish", "epic", ["deep"], [150, 600, 2300], 2.2, "sulker", 0.72, 75, "A whole fish's head with the rest of the fish forgotten."),
  fish("blobfish", "Blobfish", "epic", ["deep"], [1, 3, 9], 0.35, "sulker", 0.3, 65, "Handsome enough at the bottom. It's the trip up that does it."),
  // Legendary
  fish("anglerfish", "Anglerfish", "legendary", ["deep"], [2, 10, 50], 0.7, "thrasher", 0.5, 220, "Its light is the last thing most fish ever see."),
  fish("goblin-shark", "Goblin Shark", "legendary", ["deep"], [50, 180, 700], 3, "diver", 0.7, 260, "A living fossil with a jaw that shoots forward. Nobody has a good photo."),
  fish("shark", "Shark", "legendary", ["deep"], [80, 300, 1100], 3.5, "diver", 0.75, 300, "The Cove's oldest story, and it is true."),
  // The western waterfall and eastern volcanic lagoon.
  fish("jade-barb", "Jade Barb", "common", ["grotto"], [0.03, 0.12, 0.5], 0.14, "darter", 0.16, 5, "Emerald scales flash in the sunlit waterfall pools.", {"file": "tetra.glb", "colors": {"main": "#3eae76", "light": "#cceec8", "fins": "#d7bb44", "dark": "#283840"}, "width": 0.9, "height": 1.15}),
  fish("glass-tetra", "Glass Tetra", "common", ["grotto", "cedar-creek"], [0.01, 0.04, 0.14], 0.08, "darter", 0.1, 4, "A pale blue shimmer that disappears against the falling water.", {"file": "tetra.glb", "colors": {"main": "#9bd9df", "light": "#e5ffff", "fins": "#6e9ec8", "dark": "#283840"}, "width": 0.65, "height": 0.8}),
  fish("orchid-betta", "Orchid Betta", "uncommon", ["grotto"], [0.01, 0.05, 0.16], 0.09, "thrasher", 0.2, 10, "Violet fins spread like a flower in the quiet side pools.", {"file": "betta.glb", "colors": {"main": "#9747b3", "light": "#e6a8df", "fins": "#6245b8", "dark": "#283840"}, "width": 0.9, "height": 1.2}),
  fish("scarlet-discus", "Scarlet Discus", "uncommon", ["grotto"], [0.15, 0.6, 1.8], 0.22, "sulker", 0.25, 12, "Round and bright as a fallen tropical blossom.", {"file": "tang.glb", "colors": {"main": "#c74948", "light": "#f7b25b", "fins": "#b22255", "dark": "#283840"}, "width": 0.7, "height": 1.4}),
  fish("moon-koi", "Moon Koi", "rare", ["grotto", "estate-lake"], [1, 5, 24], 0.75, "sulker", 0.4, 26, "Silver-white koi gather where moonlight touches the falls.", {"file": "koi.glb", "colors": {"main": "#d9e8e8", "light": "#fff6d7", "fins": "#87b2c4", "dark": "#283840"}, "width": 1.1, "height": 0.9}),
  fish("mossback-pleco", "Mossback Pleco", "rare", ["grotto"], [0.5, 2.5, 10], 0.65, "sulker", 0.42, 28, "An armored resident of the rocks behind the waterfall.", {"file": "armored-catfish.glb", "colors": {"main": "#425f3f", "light": "#a6b584", "fins": "#596844", "dark": "#283840"}, "width": 1.15, "height": 0.8}),
  fish("rainbow-arowana", "Rainbow Arowana", "epic", ["grotto", "cedar-creek"], [2, 8, 30], 1.15, "leaper", 0.62, 80, "Its long turquoise body breaks the pool in sudden leaps.", {"file": "red-snapper.glb", "colors": {"main": "#57b9aa", "light": "#ead7d4", "fins": "#cb78b9", "dark": "#283840"}, "width": 0.62, "height": 0.7}),
  fish("royal-arapaima", "Royal Arapaima", "legendary", ["grotto", "estate-lake"], [30, 110, 260], 2.6, "diver", 0.78, 280, "The waterfall guardian: green armor and crimson fins.", {"file": "tuna.glb", "colors": {"main": "#4b7962", "light": "#b4bc86", "fins": "#b64751", "dark": "#283840"}, "width": 0.8, "height": 0.85}),
  fish("ember-clownfish", "Ember Clownfish", "common", ["volcanic"], [0.05, 0.18, 0.5], 0.14, "darter", 0.18, 6, "Copper-orange fish shelter in the warm basalt pools.", {"file": "clownfish.glb", "colors": {"main": "#db6338", "light": "#ffe2ab", "fins": "#6d3445", "dark": "#302940"}, "width": 1, "height": 1.1}),
  fish("sapphire-butterfly", "Sapphire Butterflyfish", "common", ["volcanic"], [0.1, 0.4, 1.2], 0.23, "leaper", 0.22, 7, "Deep blue wings flicker over the lagoon coral.", {"file": "butterfly-fish.glb", "colors": {"main": "#3978bb", "light": "#b4e5ee", "fins": "#5f49ac", "dark": "#302940"}, "width": 0.85, "height": 1.1}),
  fish("sunset-tang", "Sunset Tang", "uncommon", ["volcanic"], [0.2, 0.8, 2.2], 0.32, "darter", 0.28, 14, "Pink, gold and violet, like the sky above the headland.", {"file": "tang.glb", "colors": {"main": "#d96f7b", "light": "#ffd08b", "fins": "#8b529d", "dark": "#302940"}, "width": 1, "height": 1.1}),
  fish("ember-puffer", "Ember Puffer", "uncommon", ["volcanic"], [0.4, 1.5, 5], 0.4, "sulker", 0.32, 16, "A round little furnace with a surprisingly stubborn pull.", {"file": "puffer.glb", "colors": {"main": "#8d5147", "light": "#eac686", "fins": "#c97648", "dark": "#302940"}, "width": 1.2, "height": 1.05}),
  fish("violet-lionfish", "Violet Lionfish", "rare", ["volcanic"], [0.4, 1.5, 4], 0.48, "thrasher", 0.4, 30, "Orchid spines sway above the black volcanic stone.", {"file": "lionfish.glb", "colors": {"main": "#8550a8", "light": "#ead0ec", "fins": "#4f478c", "dark": "#302940"}, "width": 0.85, "height": 1.15}),
  fish("ghost-flounder", "Ghost Flounder", "rare", ["volcanic"], [1, 4, 18], 0.75, "sulker", 0.45, 34, "A pale, broad silhouette gliding over dark sand.", {"file": "flatfish.glb", "colors": {"main": "#829da8", "light": "#d3ebe3", "fins": "#5b7f8c", "dark": "#302940"}, "width": 1.4, "height": 0.65}),
  fish("opal-grouper", "Opal Grouper", "epic", ["volcanic"], [4, 18, 70], 1.2, "diver", 0.65, 95, "Green and lilac gleam on a heavy reef hunter.", {"file": "coral-grouper.glb", "colors": {"main": "#498d96", "light": "#d8cfe7", "fins": "#b679be", "dark": "#302940"}, "width": 1.2, "height": 1.1}),
  fish("dusk-sailfish", "Dusk Sailfish", "legendary", ["volcanic"], [25, 90, 220], 2.7, "leaper", 0.82, 310, "The lagoon legend launches like a violet spear at dusk.", {"file": "swordfish.glb", "colors": {"main": "#404d87", "light": "#a9bfe1", "fins": "#b66a9f", "dark": "#302940"}, "width": 0.78, "height": 1.25}),
  // Private property waters.
  fish("amber-chub", "Amber Chub", "common", ["cedar-creek"], [0.05, 0.25, 1], 0.22, "darter", 0.16, 5, "Small golden shoals gather beneath the cedar roots.", {"file": "tetra.glb", "colors": {"main": "#a8944c", "light": "#f2e1ad", "fins": "#cd8e42", "dark": "#35473e"}, "width": 1, "height": 0.85}),
  fish("cedar-trout", "Cedar Trout", "rare", ["cedar-creek"], [0.3, 1.6, 7], 0.48, "leaper", 0.36, 23, "Copper fins flash in the cool woodland stream.", {"file": "red-snapper.glb", "colors": {"main": "#567e68", "light": "#dcd4ad", "fins": "#d17a4d", "dark": "#35473e"}, "width": 0.8, "height": 0.8}),
  fish("golden-perch", "Golden Perch", "common", ["estate-lake"], [0.1, 0.6, 2.5], 0.29, "thrasher", 0.23, 6, "A sunny little fighter from the estate shallows.", {"file": "tang.glb", "colors": {"main": "#b4a647", "light": "#e8db8e", "fins": "#9d6e37", "dark": "#35473e"}, "width": 0.85, "height": 0.9}),
  fish("pearl-carp", "Pearl Carp", "rare", ["estate-lake"], [1, 6, 28], 0.8, "sulker", 0.42, 30, "Ivory and jade scales shimmer like the lake at dawn.", {"file": "koi.glb", "colors": {"main": "#bacbc5", "light": "#fff0d9", "fins": "#6bafb4", "dark": "#35473e"}, "width": 1.1, "height": 1.05}),
]);

const BY_ID = new Map(FISH_CATALOG.map((entry) => [entry.id, entry]));

export function findFishSpecies(id: unknown): FishSpecies | undefined {
  return typeof id === "string" ? BY_ID.get(id) : undefined;
}

export function fishInZone(zone: FishZone): FishSpecies[] {
  return FISH_CATALOG.filter((entry) => entry.zones.includes(zone));
}

// ---------------------------------------------------------------- tackle

export type FishingRod = Readonly<{
  id: string;
  title: string;
  file: string;
  /** Fishing level needed to buy it. */
  minLevel: number;
  /** Tickets at Bait & Tackle; the first rod is given. */
  price: number;
  /** The line's breaking point on the tension gauge, and how wide the safe band is (farm-fishing.mts). */
  line: number;
  /** How far a full cast goes, in metres. */
  castRange: number;
  /** Reel speed, metres of line a second. */
  reel: number;
  blurb: string;
}>;

const rod = (level: number, spec: Omit<FishingRod, "id" | "file">): FishingRod =>
  Object.freeze({ id: `rod.${level}`, file: `fishing-rod-lvl${level}.glb`, ...spec });

export const FISHING_RODS: readonly FishingRod[] = Object.freeze([
  rod(1, { title: "Willow Stick", minLevel: 1, price: 0, line: 1, castRange: 11, reel: 1.2, blurb: "A stick, a string, a hook. Everyone starts here." }),
  rod(2, { title: "Bamboo Cane", minLevel: 5, price: 250, line: 1.18, castRange: 14, reel: 1.45, blurb: "Springy and forgiving. Casts to the reef shelf." }),
  rod(3, { title: "Carbon Rod", minLevel: 12, price: 900, line: 1.36, castRange: 17, reel: 1.7, blurb: "Light, stiff and strong. A serious angler's rod." }),
  rod(4, { title: "Gilded Rod", minLevel: 25, price: 2500, line: 1.56, castRange: 21, reel: 2, blurb: "Reaches the Deep, and holds what lives there." }),
  rod(5, { title: "Pro Reel", minLevel: 40, price: 6000, line: 1.8, castRange: 24, reel: 2.4, blurb: "A proper reel on a proper rod. Sharks beware." }),
]);

export const STARTER_ROD_ID = "rod.1";

export function findFishingRod(id: unknown): FishingRod | undefined {
  return FISHING_RODS.find((entry) => entry.id === id);
}

export type FishingLure = Readonly<{
  id: string;
  title: string;
  file: string;
  minLevel: number;
  price: number;
  /** Multipliers on the rarity weights of a bite (1 when absent). */
  rarity: Readonly<Partial<Record<FishRarity, number>>>;
  /** Species this lure is especially good for: their weight is doubled. */
  favors: readonly string[];
  blurb: string;
}>;

const lure = (index: number, spec: Omit<FishingLure, "id" | "file">): FishingLure =>
  Object.freeze({ id: `lure.${index}`, file: `lure-${index}.glb`, ...spec, favors: Object.freeze([...spec.favors]) });

/**
 * Lures are kept (a snapped line loses the lure on it); worms are spent one a
 * cast. A cast with neither is refused. Each lure tilts a bite toward a group
 * of fish, never toward one.
 */
export const FISHING_LURES: readonly FishingLure[] = Object.freeze([
  lure(1, { title: "Green Minnow", minLevel: 3, price: 60, rarity: { uncommon: 1.5 }, favors: ["fish.blue-goldfish", "fish.betta", "fish.piranha", "fish.koi", "fish.jade-barb", "fish.glass-tetra", "fish.orchid-betta", "fish.moon-koi"], blurb: "Looks like breakfast to anything in the lagoon." }),
  lure(5, { title: "Sunny Spinner", minLevel: 8, price: 140, rarity: { uncommon: 1.3, rare: 1.2 }, favors: ["fish.yellow-tang", "fish.blue-tang", "fish.clownfish", "fish.royal-gramma", "fish.ember-clownfish", "fish.sapphire-butterfly", "fish.sunset-tang"], blurb: "Flashes blue and yellow over the reef." }),
  lure(3, { title: "Zebra Jerkbait", minLevel: 14, price: 260, rarity: { rare: 1.3 }, favors: ["fish.zebra-clown-fish", "fish.lionfish", "fish.moorish-idol", "fish.black-lion-fish", "fish.violet-lionfish"], blurb: "Striped fish chase stripes." }),
  lure(2, { title: "Redhead Crank", minLevel: 22, price: 420, rarity: { rare: 1.5, epic: 1.3 }, favors: ["fish.red-snapper", "fish.coral-grouper", "fish.parrot-fish", "fish.opal-grouper", "fish.mossback-pleco"], blurb: "Dives deep and wobbles slow. The big reef fish can't resist it." }),
  lure(4, { title: "Rainbow Crank", minLevel: 30, price: 700, rarity: { epic: 1.6, legendary: 1.3 }, favors: ["fish.mandarin-fish", "fish.flower-horn", "fish.humphead", "fish.rainbow-arowana"], blurb: "Every colour at once. Rare fish take it personally." }),
  lure(6, { title: "Carnival Popper", minLevel: 42, price: 1200, rarity: { epic: 1.5, legendary: 1.8 }, favors: ["fish.swordfish", "fish.tuna", "fish.anglerfish", "fish.goblin-shark", "fish.shark", "fish.royal-arapaima", "fish.dusk-sailfish"], blurb: "Pops and splashes on the Deep's surface like something hurt." }),
]);

export function findFishingLure(id: unknown): FishingLure | undefined {
  return FISHING_LURES.find((entry) => entry.id === id);
}

/** Worms: a bait, spent one a cast. Bought by the tub; a new angler is given some. */
export const WORM_ID = "bait.worm";
export const WORM_TUB = Object.freeze({ count: 10, price: 8 });
export const STARTER_WORMS = 20;
export const MAX_WORMS = 200;
export const MAX_LURES_EACH = 9;

/** How many fish the creel holds before the angler must sell, cook or release some. */
export const CREEL_CAPACITY = 40;

/** The Fishing level each water opens at: the Lagoon from the start, the reef shelf soon, the Deep once an angler can hold what lives there. */
export const ZONE_MIN_LEVEL: Readonly<Record<FishZone, number>> = Object.freeze({ lagoon: 1, reef: 3, deep: 15, grotto: 8, volcanic: 20, "cedar-creek": 1, "estate-lake": 1 });

/** Old Pike's fee to mount a fish on a plaque, and how many a player may keep mounted at once. */
export const MOUNT_FEE = 25;
export const MAX_MOUNTED_FISH = 30;
