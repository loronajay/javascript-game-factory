import { UNIT_TYPES } from "../core/unitCatalog.js";
import { isProgressSkinUnlocked } from "../progression/unlocks.js";
import { SKIN_MANIFEST } from "./skinManifest.generated.js";

export const BASE_SKIN_SLUG = null;
export const SKIN_PREF_STORAGE_KEY = "tactical-arena.skinPrefs";
export const SUMMER_VIBES_SKIN_SLUG = "summer-vibes";
export const SKIN_STATUS = Object.freeze({
  UNLOCKED: "unlocked",
  LOCKED: "locked"
});

export const SKIN_RARITIES = Object.freeze({
  COMMON: "common",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
  LEGENDARY_PLUS: "legendary+"
});

const SKIN_PRICE_BY_RARITY = Object.freeze({
  [SKIN_RARITIES.COMMON]: 99,
  [SKIN_RARITIES.RARE]: 199,
  [SKIN_RARITIES.EPIC]: 299,
  [SKIN_RARITIES.LEGENDARY]: 399,
  [SKIN_RARITIES.LEGENDARY_PLUS]: 499,
});

export const CANCER_RESEARCH_DONATION_NOTE = "All proceeds for this skin will be donated for cancer research.";

function skinName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectionDescription(slug) {
  return slug === SUMMER_VIBES_SKIN_SLUG
    ? "Launch collection beach-day looks for the original roster."
    : "";
}

function skuPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function skinKey(type, slug) {
  return `${type}:${slug}`;
}

function pack(id, name) {
  return { packId: id, packName: name };
}

function meta(rarity, extra = {}) {
  return Object.freeze({ rarity, ...extra });
}

const PACK = Object.freeze({
  ARCANE: pack("arcane", "Arcane Pack"),
  BLOOD_MOON: pack("blood-moon", "Blood Moon Pack"),
  DESERT_WARRIORS: pack("desert-warriors", "Desert Warriors Pack"),
  GEISHA: pack("geisha", "Geisha Pack"),
  GRIM_REAPER: pack("grim-reaper", "Grim Reaper Pack"),
  HALLOWEEN: pack("halloween", "Halloween Pack"),
  INFERNAL: pack("infernal", "Infernal Pack"),
  MEDIEVAL: pack("medieval", "Medieval Pack"),
  RIOT_COP: pack("riot-cop", "Riot Cop Pack"),
  SOUTHERN_KINGDOM: pack("southern-kingdom", "Southern Kingdom Pack"),
  SUMMER_VIBES: pack("summer-vibes", "Summer Vibes Pack"),
  VOID_DWELLER: pack("void-dweller", "Void Dweller Pack"),
  FUCK_CANCER: pack("fuck-cancer", "Fuck Cancer Charity Pack"),
});

const FUCK_CANCER_SKIN_METADATA = meta(SKIN_RARITIES.LEGENDARY, {
  ...PACK.FUCK_CANCER,
  donationNote: CANCER_RESEARCH_DONATION_NOTE,
});

const FUCK_CANCER_SKIN_METADATA_ENTRIES = Object.freeze(Object.fromEntries(
  Object.values(UNIT_TYPES)
    .filter((unit) => !unit.summon)
    .map((unit) => [skinKey(unit.id, "fuck-cancer"), FUCK_CANCER_SKIN_METADATA])
));

const AUTHORED_SKIN_METADATA = Object.freeze({
  [skinKey("swordsman", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("swordsman", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("swordsman", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("swordsman", "enchanted")]: meta(SKIN_RARITIES.RARE, { availabilityNote: "Halloween exclusive" }),
  [skinKey("swordsman", "pumpkin-knight")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("swordsman", "medieval")]: meta(SKIN_RARITIES.RARE, PACK.MEDIEVAL),
  [skinKey("swordsman", "grim-reaper")]: meta(SKIN_RARITIES.EPIC, PACK.GRIM_REAPER),
  [skinKey("swordsman", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("swordsman", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),

  [skinKey("paladin", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("paladin", "count")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("paladin", "gaia's-protector")]: meta(SKIN_RARITIES.RARE),
  [skinKey("paladin", "reef-guardian")]: meta(SKIN_RARITIES.RARE),
  [skinKey("paladin", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("paladin", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("paladin", "crusader")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("paladin", "galactic-guardian")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("monk", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("monk", "desert-temple")]: meta(SKIN_RARITIES.RARE, PACK.DESERT_WARRIORS),
  [skinKey("monk", "mummy")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("monk", "jade-dragon")]: meta(SKIN_RARITIES.RARE),
  [skinKey("monk", "blue-lightning")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("monk", "artist")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("monk", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("monk", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("fat-knight", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("fat-knight", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-knight", "tattered")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-knight", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("fat-knight", "franken-fatigue")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("fat-knight", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("fat-knight", "gothic-warrior")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-knight", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),

  [skinKey("blacksword", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("blacksword", "judicator")]: meta(SKIN_RARITIES.RARE),
  [skinKey("blacksword", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("blacksword", "blood-knight")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("blacksword", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("blacksword", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),
  [skinKey("blacksword", "apprentice")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("ronin", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("ronin", "armored")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("ronin", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("ronin", "eastern-vampire")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("ronin", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("ronin", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("archer", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("archer", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("archer", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("archer", "desert-warrior")]: meta(SKIN_RARITIES.RARE, PACK.DESERT_WARRIORS),
  [skinKey("archer", "masquerade")]: meta(SKIN_RARITIES.RARE),
  [skinKey("archer", "kitty-kat")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("archer", "nature-guardian")]: meta(SKIN_RARITIES.RARE),
  [skinKey("archer", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("archer", "black-widow")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("archer", "vampire")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("archer", "vampire-slayer")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("archer", "floral")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("archer", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("archer", "blood-rose")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("archer", "geisha")]: meta(SKIN_RARITIES.LEGENDARY, PACK.GEISHA),
  [skinKey("archer", "scarlet-rose")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("archer", "velvet")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("sniper", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("sniper", "swamp-combat")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("sniper", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("sniper", "spooky-ops")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("sniper", "medieval")]: meta(SKIN_RARITIES.RARE, PACK.MEDIEVAL),
  [skinKey("sniper", "desert-ops")]: meta(SKIN_RARITIES.RARE, PACK.DESERT_WARRIORS),
  [skinKey("sniper", "grim-reaper")]: meta(SKIN_RARITIES.EPIC, PACK.GRIM_REAPER),
  [skinKey("sniper", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),

  [skinKey("angel", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("angel", "devilish")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("angel", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("angel", "fallen")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("angel", "raging-storm")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("angel", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("angel", "dragonslayer")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("angel", "sol")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("angel", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("fat-bowman", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("fat-bowman", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-bowman", "tattered")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-bowman", "kitty-kat")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("fat-bowman", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("fat-bowman", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("fat-bowman", "enchanted")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-bowman", "gothic-warrior")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-bowman", "geisha")]: meta(SKIN_RARITIES.LEGENDARY, PACK.GEISHA),
  [skinKey("fat-bowman", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("fat-bowman", "violet")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("fat-bowman", "scarlet-rose")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("miner", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("miner", "gold-rush")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("miner", "jade prospector")]: meta(SKIN_RARITIES.RARE),
  [skinKey("miner", "shipwreck-scavenger")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("miner", "steampunk-engineer")]: meta(SKIN_RARITIES.RARE),
  [skinKey("miner", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("miner", "firefighter")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("miner", "ruin-digger")]: meta(SKIN_RARITIES.EPIC),

  [skinKey("little-brother", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("little-brother", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("little-brother", "arctic-ops")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("little-brother", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("little-brother", "crusader-mech")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("little-brother", "galaxy-defender")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("mystic", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("mystic", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("mystic", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("mystic", "candy-witch")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("mystic", "lunar-goddess")]: meta(SKIN_RARITIES.RARE),
  [skinKey("mystic", "sun-goddess")]: meta(SKIN_RARITIES.RARE),
  [skinKey("mystic", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("mystic", "enlightened")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mystic", "floral")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mystic", "star-princess")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mystic", "moon-guardian")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mystic", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("mystic", "nirvana")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("mystic", "ruby")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("mystic", "geisha")]: meta(SKIN_RARITIES.LEGENDARY, PACK.GEISHA),
  [skinKey("mystic", "discord-kitten")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),
  [skinKey("mystic", "heartbreaker")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("witch-doctor", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("witch-doctor", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("witch-doctor", "black-mage")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("witch-doctor", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("witch-doctor", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("ghoul", "summer-vibes")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("ghoul", "arcane")]: meta(SKIN_RARITIES.RARE),
  [skinKey("ghoul", "trick-or-treat")]: meta(SKIN_RARITIES.RARE),
  [skinKey("ghoul", "blood-moon")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("ghoul", "fuck-cancer")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("ghoul", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("father-time", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("father-time", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("father-time", "steampunk-wizard")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("father-time", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("father-time", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("king", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("king", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("king", "pumpkin")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("king", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("king", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("fat-cleric", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("fat-cleric", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-cleric", "tattered")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-cleric", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("fat-cleric", "sweet-bliss-angel")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("fat-cleric", "sun-goddess")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-cleric", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("fat-cleric", "gothic-warrior")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-cleric", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("fat-cleric", "nirvana")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("fat-cleric", "mystic-cosplay")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("mother-nature", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("mother-nature", "desert-oasis")]: meta(SKIN_RARITIES.RARE, PACK.DESERT_WARRIORS),
  [skinKey("mother-nature", "autumn-witch")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("mother-nature", "autumn-spirit")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mother-nature", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("mother-nature", "gaia-elemental")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mother-nature", "everfrost")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("mother-nature", "black-widow")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("mother-nature", "blood-rose")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("mother-nature", "geisha")]: meta(SKIN_RARITIES.LEGENDARY, PACK.GEISHA),
  [skinKey("mother-nature", "bronze-witch")]: meta(SKIN_RARITIES.LEGENDARY_PLUS, { availabilityNote: "Halloween exclusive" }),
  [skinKey("mother-nature", "discord-kitten")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),
  [skinKey("mother-nature", "discord-kitten-(alt.)")]: meta(SKIN_RARITIES.LEGENDARY_PLUS),

  [skinKey("magician", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("magician", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("magician", "ghostly")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("magician", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("magician", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("magician", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),

  [skinKey("necromancer", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("necromancer", "trick-or-treat")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("necromancer", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("necromancer", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("necromancer", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("nemesis", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("nemesis", "spooky")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("nemesis", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("nemesis", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("nemesis", "infernal")]: meta(SKIN_RARITIES.EPIC, PACK.INFERNAL),

  [skinKey("virus", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("virus", "jack-o-lantern")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("virus", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("virus", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),

  [skinKey("fat-wizard", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("fat-wizard", "wandering")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-wizard", "tattered")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("fat-wizard", "black-mage")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("fat-wizard", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("fat-wizard", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("fat-wizard", "fire-mage")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-wizard", "gothic-warrior")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-wizard", "ice-mage")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-wizard", "lightning-mage")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-wizard", "poison-mage")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("fat-wizard", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("fat-wizard", "void-magic")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("summoner", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("summoner", "frostbitten")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("summoner", "ascended")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("summoner", "hellfire")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("summoner", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("juggernaut", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("juggernaut", "bio-mech")]: meta(SKIN_RARITIES.COMMON),
  [skinKey("juggernaut", "pumpkin-mech")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("juggernaut", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("juggernaut", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("juggernaut", "holy-mech")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("gargoyle", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("gargoyle", "dragon")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("gargoyle", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("gargoyle", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("gargoyle", "runic-flame")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("gargoyle", "southern-kingdom")]: meta(SKIN_RARITIES.EPIC, PACK.SOUTHERN_KINGDOM),
  [skinKey("gargoyle", "holy-guardian")]: meta(SKIN_RARITIES.LEGENDARY),
  [skinKey("gargoyle", "void-dweller")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  [skinKey("clod", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("clod", "scarecrow")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("clod", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("clod", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("clod", "infernal")]: meta(SKIN_RARITIES.EPIC, PACK.INFERNAL),

  [skinKey("big-brother", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("big-brother", "junkyard-king")]: meta(SKIN_RARITIES.RARE),
  [skinKey("big-brother", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("big-brother", "fire-rescue")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("big-brother", "hell-mech")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("big-brother", "ruin-scavenger")]: meta(SKIN_RARITIES.EPIC),

  [skinKey("riot-cop", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("riot-cop", "transylvanian-guard")]: meta(SKIN_RARITIES.RARE, PACK.HALLOWEEN),
  [skinKey("riot-cop", "firefighter")]: meta(SKIN_RARITIES.EPIC, PACK.RIOT_COP),
  [skinKey("riot-cop", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("riot-cop", "street-patrol")]: meta(SKIN_RARITIES.EPIC, PACK.RIOT_COP),
  [skinKey("riot-cop", "swat-team")]: meta(SKIN_RARITIES.EPIC, PACK.RIOT_COP),
  [skinKey("riot-cop", "snow-patrol")]: meta(SKIN_RARITIES.EPIC, PACK.RIOT_COP),
  [skinKey("riot-cop", "neon-squad")]: meta(SKIN_RARITIES.LEGENDARY),

  [skinKey("treant", "summer-vibes")]: meta(SKIN_RARITIES.COMMON, PACK.SUMMER_VIBES),
  [skinKey("treant", "arcane")]: meta(SKIN_RARITIES.RARE, PACK.ARCANE),
  [skinKey("treant", "sapling")]: meta(SKIN_RARITIES.RARE),
  [skinKey("treant", "blood-moon")]: meta(SKIN_RARITIES.EPIC, PACK.BLOOD_MOON),
  [skinKey("treant", "rotting")]: meta(SKIN_RARITIES.EPIC),
  [skinKey("treant", "voidroot")]: meta(SKIN_RARITIES.LEGENDARY, PACK.VOID_DWELLER),

  ...FUCK_CANCER_SKIN_METADATA_ENTRIES,
});

function skinMetadata(entry) {
  return AUTHORED_SKIN_METADATA[skinKey(entry.type, entry.slug)] ?? meta(
    entry.slug === SUMMER_VIBES_SKIN_SLUG ? SKIN_RARITIES.COMMON : SKIN_RARITIES.RARE
  );
}

function sortSkinEntries(left, right) {
  if (left.slug === SUMMER_VIBES_SKIN_SLUG && right.slug !== SUMMER_VIBES_SKIN_SLUG) return -1;
  if (right.slug === SUMMER_VIBES_SKIN_SLUG && left.slug !== SUMMER_VIBES_SKIN_SLUG) return 1;
  return left.slug.localeCompare(right.slug) || left.file.localeCompare(right.file);
}

const collectionSlugs = [...new Set(SKIN_MANIFEST.map((entry) => entry.slug))].sort((left, right) => {
  if (left === SUMMER_VIBES_SKIN_SLUG && right !== SUMMER_VIBES_SKIN_SLUG) return -1;
  if (right === SUMMER_VIBES_SKIN_SLUG && left !== SUMMER_VIBES_SKIN_SLUG) return 1;
  return left.localeCompare(right);
});

export const SKIN_COLLECTIONS = Object.freeze(collectionSlugs.map((slug) => Object.freeze({
  slug,
  name: skinName(slug),
  description: collectionDescription(slug)
})));

function skin(entry, { status = SKIN_STATUS.UNLOCKED } = {}) {
  const collection = SKIN_COLLECTIONS.find((item) => item.slug === entry.slug);
  const src = `assets/units/skins/${entry.type}/${entry.file}`;
  const metadata = skinMetadata(entry);
  const rarity = metadata.rarity;
  const id = `skin:${entry.type}:${entry.slug}`;
  const sku = `ta.skin.${skuPart(entry.type)}.${skuPart(entry.slug)}`;
  return Object.freeze({
    id,
    unitType: entry.type,
    slug: entry.slug,
    name: collection?.name ?? skinName(entry.slug),
    collection: metadata.packId ?? entry.slug,
    collectionName: metadata.packName ?? collection?.name ?? skinName(entry.slug),
    rarity,
    packId: metadata.packId ?? null,
    packName: metadata.packName ?? null,
    availabilityNote: metadata.availabilityNote ?? null,
    donationNote: metadata.donationNote ?? null,
    sku,
    entitlementId: id,
    price: Object.freeze({
      kind: "premium",
      sku,
      currency: "USD",
      cents: SKIN_PRICE_BY_RARITY[rarity],
    }),
    status,
    unlocked: status === SKIN_STATUS.UNLOCKED,
    portraitSrc: src,
    boardSrc: src,
    board: Object.freeze({ w: 600, h: 600 })
  });
}

// The manifest enumerates every painted skin so galleries can show a visible but
// locked collection. getUnitSkins overlays account progress onto these base
// entries at read time.
export const SKINS_BY_UNIT = Object.freeze(Object.fromEntries(
  Object.keys(UNIT_TYPES).map((type) => {
    const entries = SKIN_MANIFEST
      .filter((entry) => entry.type === type)
      .sort(sortSkinEntries);
    return [type, Object.freeze(entries.map((entry) => skin(entry, { status: SKIN_STATUS.LOCKED })))];
  })
));

export function getUnitSkins(typeOrDef, storage = globalThis.localStorage) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const skins = SKINS_BY_UNIT[type] ?? Object.freeze([]);
  return Object.freeze(skins.map((entry) => {
    const unlocked = isProgressSkinUnlocked(type, entry.slug, storage);
    if (entry.unlocked === unlocked) return entry;
    return Object.freeze({
      ...entry,
      status: unlocked ? SKIN_STATUS.UNLOCKED : SKIN_STATUS.LOCKED,
      unlocked,
    });
  }));
}

export function getSkin(typeOrDef, slug, storage = globalThis.localStorage) {
  if (!slug) return null;
  return getUnitSkins(typeOrDef, storage).find((entry) => entry.slug === slug) ?? null;
}

export function isSkinUnlocked(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  return Boolean(entry?.unlocked);
}

export function normalizeSkinSlug(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, typeof slug === "string" ? slug.trim() : slug, storage);
  return entry?.unlocked ? entry.slug : BASE_SKIN_SLUG;
}

export function skinAssetPath(typeOrDef, slug, kind = "portrait", storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  if (!entry) return null;
  return kind === "board" ? entry.boardSrc : entry.portraitSrc;
}

export function normalizeSkinLoadout(composition, skins, storage = globalThis.localStorage) {
  const raw = Array.isArray(skins) ? skins : null;
  return composition.map((type, index) => {
    if (raw && index in raw) return normalizeSkinSlug(type, raw[index], storage);
    return getSkinPref(type, storage);
  });
}

export function skinLabel(typeOrDef, slug, storage = globalThis.localStorage) {
  const entry = getSkin(typeOrDef, slug, storage);
  return entry?.name ?? "Classic";
}

export function loadSkinPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SKIN_PREF_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const prefs = {};
    for (const [type, slug] of Object.entries(parsed)) {
      const clean = normalizeSkinSlug(type, slug, storage);
      if (clean) prefs[type] = clean;
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveSkinPref(type, slug, storage = globalThis.localStorage) {
  if (!type) return;
  try {
    const prefs = loadSkinPrefs(storage);
    const clean = normalizeSkinSlug(type, slug, storage);
    if (clean) prefs[type] = clean;
    else delete prefs[type];
    storage?.setItem(SKIN_PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable means the cosmetic default simply will not persist.
  }
}

export function getSkinPref(type, storage = globalThis.localStorage) {
  if (!type) return BASE_SKIN_SLUG;
  return loadSkinPrefs(storage)[type] ?? BASE_SKIN_SLUG;
}
