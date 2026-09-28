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
export const FISH_ZONES = Object.freeze(["lagoon", "reef", "deep"]);
export const FISH_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);
/**
 * How a fish pulls on the line (farm-fishing.mts):
 *   darter    sudden short sprints
 *   diver     long steady runs downward
 *   thrasher  jittery spikes of tension
 *   sulker    heavy and slow, little pull but a lot of stamina
 *   leaper    jumps; bow the rod as it leaps or the tension spikes
 */
export const FIGHT_STYLES = Object.freeze(["darter", "diver", "thrasher", "sulker", "leaper"]);
/** How much each rarity is worth in Fishing XP, before size and grade. */
export const RARITY_XP = Object.freeze({ common: 10, uncommon: 18, rare: 35, epic: 70, legendary: 150 });
/** How hard a rarity fights on top of its species' own pull. */
export const RARITY_STRENGTH = Object.freeze({ common: 0, uncommon: 0.06, rare: 0.12, epic: 0.2, legendary: 0.3 });
export const RARITY_TITLES = Object.freeze({ common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" });
export const RARITY_COLORS = Object.freeze({ common: "#9aa3ad", uncommon: "#4caf50", rare: "#3d8bfd", epic: "#a855f7", legendary: "#f59e0b" });
export const ZONE_TITLES = Object.freeze({ lagoon: "The Lagoon", reef: "The Reef Shelf", deep: "The Deep" });
const fish = (key, title, rarity, zones, weightKg, lengthM, fight, strength, value, blurb) => Object.freeze({
    id: `fish.${key}`,
    title,
    file: `${key}.glb`,
    rarity,
    zones: Object.freeze([...zones]),
    weightKg: Object.freeze({ min: weightKg[0], avg: weightKg[1], max: weightKg[2] }),
    lengthM,
    fight,
    strength,
    value,
    blurb,
});
export const FISH_CATALOG = Object.freeze([
    // Common
    fish("goldfish", "Goldfish", "common", ["lagoon"], [0.05, 0.2, 0.9], 0.18, "darter", 0.12, 3, "Somebody let one go years ago. Now there are thousands."),
    fish("tetra", "Tetra", "common", ["lagoon"], [0.02, 0.06, 0.2], 0.09, "darter", 0.08, 2, "Small, quick, and always in a crowd."),
    fish("armored-catfish", "Armored Catfish", "common", ["lagoon"], [0.3, 1.2, 4], 0.45, "sulker", 0.22, 4, "Hoovers the lagoon floor clean and minds its own business."),
    fish("cardinal-fish", "Cardinal Fish", "common", ["reef"], [0.03, 0.1, 0.3], 0.1, "darter", 0.1, 2, "Big eyes for a small fish. It hides by day."),
    fish("butterfly-fish", "Butterfly Fish", "common", ["reef"], [0.1, 0.35, 1], 0.18, "leaper", 0.14, 3, "Flits between the coral heads in pairs."),
    fish("tang", "Tang", "common", ["reef"], [0.2, 0.6, 1.6], 0.25, "darter", 0.16, 3, "Grazes the reef shelf all day long."),
    fish("cowfish", "Cowfish", "common", ["reef"], [0.2, 0.7, 2], 0.3, "sulker", 0.14, 4, "A box with horns and a very slow idea of swimming."),
    fish("flatfish", "Flatfish", "common", ["reef", "deep"], [0.4, 1.5, 6], 0.4, "sulker", 0.2, 4, "Both eyes on one side, and the sand on the other."),
    // Uncommon
    fish("blue-goldfish", "Blue Goldfish", "uncommon", ["lagoon"], [0.05, 0.25, 1], 0.19, "darter", 0.14, 6, "A goldfish that is not gold. Nobody knows why."),
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
    fish("koi", "Koi", "rare", ["lagoon"], [1, 4, 20], 0.6, "sulker", 0.3, 18, "The lagoon's old gentlemen. Some are older than the farm."),
    fish("zebra-clown-fish", "Zebra Clownfish", "rare", ["reef"], [0.06, 0.18, 0.45], 0.12, "darter", 0.14, 16, "A clownfish that went to a different tailor."),
    fish("moorish-idol", "Moorish Idol", "rare", ["reef"], [0.2, 0.5, 1.2], 0.22, "leaper", 0.2, 17, "Trails a long white banner wherever it goes."),
    fish("parrot-fish", "Parrot Fish", "rare", ["reef"], [1, 4, 20], 0.6, "diver", 0.36, 20, "Crunches coral for breakfast and makes the beach sand."),
    fish("lionfish", "Lionfish", "rare", ["reef"], [0.3, 1, 2.5], 0.35, "thrasher", 0.26, 18, "Every spine is a warning."),
    fish("coral-grouper", "Coral Grouper", "rare", ["reef", "deep"], [2, 8, 30], 0.75, "diver", 0.44, 22, "Lurks under the ledge and swallows what swims past."),
    fish("tuna", "Tuna", "rare", ["deep"], [20, 80, 400], 1.6, "diver", 0.58, 25, "Built like a torpedo and never stops swimming."),
    // Epic
    fish("flower-horn", "Flower Horn", "epic", ["lagoon"], [0.3, 1, 3], 0.3, "thrasher", 0.3, 50, "A lucky fish, they say. The bump is where the luck is kept."),
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
]);
const BY_ID = new Map(FISH_CATALOG.map((entry) => [entry.id, entry]));
export function findFishSpecies(id) {
    return typeof id === "string" ? BY_ID.get(id) : undefined;
}
export function fishInZone(zone) {
    return FISH_CATALOG.filter((entry) => entry.zones.includes(zone));
}
const rod = (level, spec) => Object.freeze({ id: `rod.${level}`, file: `fishing-rod-lvl${level}.glb`, ...spec });
export const FISHING_RODS = Object.freeze([
    rod(1, { title: "Willow Stick", minLevel: 1, price: 0, line: 1, castRange: 11, reel: 1.2, blurb: "A stick, a string, a hook. Everyone starts here." }),
    rod(2, { title: "Bamboo Cane", minLevel: 5, price: 250, line: 1.18, castRange: 14, reel: 1.45, blurb: "Springy and forgiving. Casts to the reef shelf." }),
    rod(3, { title: "Carbon Rod", minLevel: 12, price: 900, line: 1.36, castRange: 17, reel: 1.7, blurb: "Light, stiff and strong. A serious angler's rod." }),
    rod(4, { title: "Gilded Rod", minLevel: 25, price: 2500, line: 1.56, castRange: 21, reel: 2, blurb: "Reaches the Deep, and holds what lives there." }),
    rod(5, { title: "Pro Reel", minLevel: 40, price: 6000, line: 1.8, castRange: 24, reel: 2.4, blurb: "A proper reel on a proper rod. Sharks beware." }),
]);
export const STARTER_ROD_ID = "rod.1";
export function findFishingRod(id) {
    return FISHING_RODS.find((entry) => entry.id === id);
}
const lure = (index, spec) => Object.freeze({ id: `lure.${index}`, file: `lure-${index}.glb`, ...spec, favors: Object.freeze([...spec.favors]) });
/**
 * Lures are kept (a snapped line loses the lure on it); worms are spent one a
 * cast. A cast with neither is refused. Each lure tilts a bite toward a group
 * of fish, never toward one.
 */
export const FISHING_LURES = Object.freeze([
    lure(1, { title: "Green Minnow", minLevel: 3, price: 60, rarity: { uncommon: 1.5 }, favors: ["fish.blue-goldfish", "fish.betta", "fish.piranha", "fish.koi"], blurb: "Looks like breakfast to anything in the lagoon." }),
    lure(5, { title: "Sunny Spinner", minLevel: 8, price: 140, rarity: { uncommon: 1.3, rare: 1.2 }, favors: ["fish.yellow-tang", "fish.blue-tang", "fish.clownfish", "fish.royal-gramma"], blurb: "Flashes blue and yellow over the reef." }),
    lure(3, { title: "Zebra Jerkbait", minLevel: 14, price: 260, rarity: { rare: 1.3 }, favors: ["fish.zebra-clown-fish", "fish.lionfish", "fish.moorish-idol", "fish.black-lion-fish"], blurb: "Striped fish chase stripes." }),
    lure(2, { title: "Redhead Crank", minLevel: 22, price: 420, rarity: { rare: 1.5, epic: 1.3 }, favors: ["fish.red-snapper", "fish.coral-grouper", "fish.parrot-fish"], blurb: "Dives deep and wobbles slow. The big reef fish can't resist it." }),
    lure(4, { title: "Rainbow Crank", minLevel: 30, price: 700, rarity: { epic: 1.6, legendary: 1.3 }, favors: ["fish.mandarin-fish", "fish.flower-horn", "fish.humphead"], blurb: "Every colour at once. Rare fish take it personally." }),
    lure(6, { title: "Carnival Popper", minLevel: 42, price: 1200, rarity: { epic: 1.5, legendary: 1.8 }, favors: ["fish.swordfish", "fish.tuna", "fish.anglerfish", "fish.goblin-shark", "fish.shark"], blurb: "Pops and splashes on the Deep's surface like something hurt." }),
]);
export function findFishingLure(id) {
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
export const ZONE_MIN_LEVEL = Object.freeze({ lagoon: 1, reef: 3, deep: 15 });
/** Old Pike's fee to mount a fish on a plaque, and how many a player may keep mounted at once. */
export const MOUNT_FEE = 25;
export const MAX_MOUNTED_FISH = 30;
