// Void Ridden Castle — the phase-2 Soul Shuffle partition.
//
// The puzzle: four identical Summoners, one real. The tell is NOT what the Summoners
// themselves call their ARTS (all four say "Summon" / "Dematerialize") — it is what
// their GHOSTS say. A ghost called up by the real Summoner speaks its ART names
// truthfully; a ghost called up by a decoy speaks a corrupted name for the same ART.
// So the player has to recognise the real roster's ART names on units that are not
// theirs, then trace the liar back to the Summoner who called it. Nothing in the
// dialogue spells this out on purpose.
//
// Every summonable type is partitioned into four DISJOINT pools, one per Summoner — no
// two Summoners can ever call the same unit. "Summonable" is the whole roster minus the
// Ghoul (itself a summon), the Summoner (excludeSelf), and the two COMMANDERS: the King
// and Mother Nature both carry `actsFirst`, and a ghost that must be commanded before
// anything else on its side would seize the enemy's activation order for the one turn it
// exists. getSoulShuffleChoices gates them off every summon in the game, not just here.
// That leaves 27 types, so three pools hold seven and one holds six.
//
// Two things fall out of the partition:
//   1. Each decoy only needs fake names for the handful of types it can actually call, so
//      the fake-name tables below stay small and hand-authorable.
//   2. Because a fake table is only ever consulted for a ghost from its own pool, ART
//      ids can safely repeat across tables (Big Brother and Juggernaut both have
//      `recharge`, and they sit in different pools).
// The pools are themed rather than strictly balanced — the flavor is that each copy of
// the Summoner reaches into a different corner of the void.
//
// VOID_CASTLE_GHOST_POOLS[i] pairs with VOID_CASTLE_GHOST_FAKE_NAMES[i]; index 0 is the
// real Summoner's pool and carries no fake table (its ghosts tell the truth).

// The real Summoner — the rangers, the healers, the odd ones out. Truthful ghosts.
const REAL_POOL = Object.freeze([
  "archer",
  "mystic",
  "sniper",
  "angel",
  "miner",
  "little-brother",
  "fat-bowman",
]);

// Decoy A — "the blades": everything that closes the distance and swings.
const BLADES_POOL = Object.freeze([
  "swordsman",
  "monk",
  "ronin",
  "blacksword",
  "fat-knight",
  "paladin",
  "big-brother",
]);

const BLADES_FAKE_NAMES = Object.freeze({
  // swordsman
  footwork: "Ghost Stride",
  moonstrike: "Duskcut",
  "mage-killer": "Spellbane",
  "life-sap": "Bloodpull",
  // monk
  "front-kick": "Palm Strike",
  protect: "Shieldbrother",
  // ronin
  "patient-blade": "Still Blade",
  "flashing-steel": "Mirror Edge",
  "broken-oath": "Broken Vow",
  challenge: "Provoke",
  shuriken: "Throwing Star",
  // blacksword
  "dark-rush": "Night Charge",
  "dark-ether": "Black Vapor",
  "void-gravity": "Abyssal Pull",
  "dark-tick": "Gloom Pulse",
  "banish-dark": "Oblivion",
  // fat-knight
  stumble: "Lumber",
  fart: "Gust",
  // paladin
  lightseeker: "Sunseeker",
  darkseeker: "Gloomseeker",
  // big-brother
  "force-tug": "Magnet Pull",
  "force-push": "Magnet Shove",
  "polarity-shift": "Reverse Poles",
  recharge: "Refuel",
});

// Decoy B — "the bulwark": the heavy bodies and the things that outlast you.
const BULWARK_POOL = Object.freeze([
  "clod",
  "gargoyle",
  "treant",
  "riot-cop",
  "juggernaut",
  "fat-cleric",
  "father-time",
]);

const BULWARK_FAKE_NAMES = Object.freeze({
  // clod
  quake: "Tremor",
  "stone-throw": "Boulder Toss",
  "thunderous-charge": "Avalanche Rush",
  // gargoyle
  flight: "Glide",
  pyroclasm: "Ashfall",
  // treant
  enrich: "Nourish",
  "source-shift": "Sap Shift",
  "soul-sap": "Root Drain",
  petrify: "Bark Skin",
  // riot-cop
  "stun-gun": "Taser",
  "smoke-bomb-riot": "Gas Canister",
  "shield-bash": "Riot Slam",
  cover: "Escort",
  lockdown: "Curfew",
  // juggernaut
  "tether-grab": "Chain Hook",
  "rocket-punch": "Piston Blow",
  recharge: "Refuel",
  "self-destruct": "Meltdown",
  // fat-cleric
  hope: "Comfort",
  cleanse: "Purge",
  "focus-prayer": "Fervent Prayer",
  // father-time
  age: "Wither Years",
  "time-stretch": "Slow Hand",
  rewind: "Turn Back",
});

// Decoy C — "the arcane": the casters and the rot. Six, not seven — Mother Nature would
// have sat here, but she is a commander and can never be summoned (see the header).
const ARCANE_POOL = Object.freeze([
  "magician",
  "nemesis",
  "virus",
  "witch-doctor",
  "necromancer",
  "fat-wizard",
]);

const ARCANE_FAKE_NAMES = Object.freeze({
  // magician
  spark: "Arc Bolt",
  flee: "Blink",
  banish: "Exile",
  nuke: "Cataclysm",
  // nemesis
  "dark-pulse": "Void Scatter",
  "realm-traversal": "Realm Walk",
  // virus
  cough: "Contagion",
  "poison-tick": "Plague Pulse",
  smog: "Miasma",
  explosion: "Rupture",
  // witch-doctor
  "rain-dance": "Storm Step",
  "fire-dance": "Ember Step",
  "spirit-dance": "Soul Step",
  "misfortune-dance": "Hex Step",
  "black-death-dance": "Plague Step",
  // necromancer
  wither: "Rot",
  "dark-bomb": "Grave Burst",
  "summon-ghoul": "Raise Dead",
  // fat-wizard
  zap: "Jolt!",
  study: "Appraise",
  surge: "Mend",
  "relay-power": "Share Power",
});

// Index 0 is always the real Summoner. prepareVoidCastleTrial shuffles which of the four
// board slots gets index 0, so the pools themselves stay a fixed, testable partition.
export const VOID_CASTLE_GHOST_POOLS = Object.freeze([
  REAL_POOL,
  BLADES_POOL,
  BULWARK_POOL,
  ARCANE_POOL,
]);

export const VOID_CASTLE_GHOST_FAKE_NAMES = Object.freeze([
  null,
  BLADES_FAKE_NAMES,
  BULWARK_FAKE_NAMES,
  ARCANE_FAKE_NAMES,
]);
