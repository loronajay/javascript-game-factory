import { getInitialMp, getUnitType } from "../core/unitCatalog.js";
import { createUnit, findUnit } from "../core/state.js";
import { nextRandom } from "../core/rng.js";
import { isNegativeStatus } from "../rules/statuses.js";
import { ORTHOGONAL_DIRECTIONS, positionKey } from "../rules/movement.js";
import { DEFAULT_SQUAD, UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { STARTER_UNIT_TYPES, readUnlockProgress, writeUnlockProgress } from "../progression/unlocks.js";
import { enqueueUnitUnlockAnnouncements } from "../progression/announcements.js";
import { computeCampaignGeometry, computeRegionBoxes } from "./campaignMap.js";
import { getNicknamePref } from "../ui/nicknameModel.js";

export const CAMPAIGN_PROGRESS_KEY = "tacticalArenaCampaignProgressV1";
export const CLOD_MISSION_ID = "clod-trial";
export const NECROMANCER_MISSION_ID = "necromancer-rise";
export const WITCH_DOCTOR_MISSION_ID = "witch-doctor-swamp";
export const FATHER_TIME_MISSION_ID = "timeless-woods";
export const VIRUS_MISSION_ID = "virus-root";
export const PALADIN_MISSION_ID = "wandering-paladin";
export const MONK_MISSION_ID = "monk-temple-trial";
export const BROTHERS_MISSION_ID = "mechs-on-the-farm";
export const GARGOYLE_MISSION_ID = "gargoyle-inferno";
export const SNIPER_MISSION_ID = "sniper-highground";
export const WANDERING_PARTY_MISSION_ID = "wandering-party";
export const MINER_MISSION_ID = "dug-your-own-grave";
export const HASBEEN_HEROES_MISSION_ID = "hasbeen-heroes";
// The reward for The Wandering Party is a skin from this pack, not a unit unlock. The
// pack id is shared with the campaign skin-reward ledger in progression/unlocks.js.
export const WANDERING_PARTY_SKIN_PACK = "wandering";
// Has-Been Heroes rewards a Mystic skin the same way (see CAMPAIGN_SKIN_PACKS /
// HASBEEN_MYSTIC_SKIN_PACK_ID in progression/unlocks.js — keep the string in sync).
export const HASBEEN_MYSTIC_SKIN_PACK = "hasbeen-mystic";
// The four members of the touring fat squad, in the order they field on the board
// ("p2-<index>-<type>" ids follow this order). Their overworld/rage/defeat banter and
// the "bring the whole starter squad" bonus all read off this list.
export const HASBEEN_HEROES_FAT_TYPES = Object.freeze(["fat-knight", "fat-bowman", "fat-cleric", "fat-wizard"]);
// A spread 3×3 Ghoul lattice (spacing 2, not contiguous) fits with exactly 1 tile of
// clearance from the board edge on every side, so none of its own orthogonal fire gets
// clipped off-board. A separate fire border runs along the true map edge itself (all four
// sides, minus the spawn tile), closing the gap between the lattice's own fire and the
// board boundary so there's no ring left to walk around the whole thing on.
export const WITCH_DOCTOR_BOARD_SIZE = 9;
// Rain Dance may only be cast this many times over the whole mission. Without a cap,
// the Witch Doctor's 30 MP pool lets the CPU stall on Rain Dance every turn while the
// player is still crossing the Ghoul lattice (1 HP the first cast, then +1 more per cast
// once Rain Stance is active), fully undoing any ranged chip damage landed during the
// approach and turning the final 1v1 into a full-HP boss against a unit worn down by
// fire/Ghoul Bite — the opposite of the intended "race the heal" read. Capping casts at
// 3 (a 1+2+2 = 5 HP ceiling) keeps the heal-before-you-arrive telegraph (see
// witchDoctorFireWarningScript) without letting it fully negate approach damage.
export const WITCH_DOCTOR_HEAL_CAST_CAP = 3;
export const MIN_CAMPAIGN_SQUAD_SIZE = 1;
export const MAX_CAMPAIGN_SQUAD_SIZE = 4;
// The campaign map is capped for now so the journey stays surveyable at once;
// authored missions fill placeholder stops one at a time up to this count. Some
// painted landmarks intentionally stay node-less until a future unit needs them.
export const MAX_CAMPAIGN_MISSIONS = 20;

// Fully-authored, playable missions. Everything OTHER than the map graph lives here
// (squads, flavor copy, rewards); the mission's cell + trail wiring comes from
// CAMPAIGN_TRAIL below so this object never carries hand-placed map coordinates.
// Player-facing subtitle/description text stays in-world (no "Lesson:" framing) —
// the campaign doubles as a teaching tool but should read as a campaign, not a
// tutorial. The underlying tactical lesson each mission teaches is documented for
// dev/design reference in CAMPAIGN_MISSION_LESSONS.md instead.
const AUTHORED_MISSIONS = Object.freeze({
  [CLOD_MISSION_ID]: {
    id: CLOD_MISSION_ID,
    title: "Clod on the Ridge",
    subtitle: "A stone golem holds the high road",
    description: "Take two units into a half-HP duel against Clod and a Juggernaut. Magic damage cuts through defense; loose spacing keeps Thunderous Charge from ending the run.",
    unitType: "clod",
    requiredStars: 0,
    rewardUnits: Object.freeze(["clod"]),
    playerSlots: 2,
    defaultSquad: Object.freeze(["mystic", "magician"]),
    enemySquad: Object.freeze(["clod", "juggernaut"]),
    size: 11,
  },
  [NECROMANCER_MISSION_ID]: {
    id: NECROMANCER_MISSION_ID,
    title: "Necromancer's Gate",
    subtitle: "The old gate reeks of rot and rising dead",
    description: "Two units against a Necromancer and a Virus at the old gate. Physical damage slips past Dead Zone, spacing starves Spread, and a cure keeps permanent poison from becoming a losing clock.",
    unitType: "necromancer",
    requiredStars: 2,
    rewardUnits: Object.freeze(["necromancer"]),
    playerSlots: 2,
    enemySquad: Object.freeze(["necromancer", "virus"]),
    size: 13,
  },
  [WITCH_DOCTOR_MISSION_ID]: {
    id: WITCH_DOCTOR_MISSION_ID,
    title: "Cursed Swamp of the Witch Doctor",
    subtitle: "A cursed swamp, and something dancing at its heart",
    description: "Send the Archer alone into a solid Ghoul block pinned in the swamp's far corner. Orthogonal fire marks the only tiles that don't bite twice, Volley Shot reaches through blockers, and speed denies Black Death Dance.",
    unitType: "witch-doctor",
    requiredStars: 4,
    rewardUnits: Object.freeze(["witch-doctor"]),
    playerSlots: 1,
    // This mission's puzzle is specifically "use the Archer's Volley Shot to break a
    // body-blocked line," not "figure out which unit to bring" — squadLocked pins the
    // squad to the Archer so the mission always tests that exact lesson.
    defaultSquad: Object.freeze(["archer"]),
    squadLocked: true,
    enemySquad: Object.freeze(["witch-doctor"]),
    size: WITCH_DOCTOR_BOARD_SIZE,
  },
  [FATHER_TIME_MISSION_ID]: {
    id: FATHER_TIME_MISSION_ID,
    title: "Timeless Woods",
    subtitle: "Time bends strangely beneath these old trees",
    description: "Bring two chosen units into the old woods against Father Time and an Archer. Father Time will try to turn the Archer into a carry with Age, then threaten Rewind if he reaches RAGE.",
    unitType: "father-time",
    requiredStars: 6,
    rewardUnits: Object.freeze(["father-time"]),
    playerSlots: 2,
    enemySquad: Object.freeze(["father-time", "archer"]),
    size: 11,
  },
  [VIRUS_MISSION_ID]: {
    id: VIRUS_MISSION_ID,
    title: "Root of the Virus",
    subtitle: "The rot has a root, and it's spreading",
    description: "Lead your first full four-unit campaign squad into a straight duel against three Viruses and a Witch Doctor. Misfortune turns poison into a certainty, tight formations invite Spread, and Mystic's protection gives the rot something to argue with.",
    unitType: "virus",
    requiredStars: 8,
    rewardUnits: Object.freeze(["virus"]),
    playerSlots: 4,
    enemySquad: Object.freeze(["virus", "virus", "virus", "witch-doctor"]),
    size: 11,
    fullHp: true,
  },
  [PALADIN_MISSION_ID]: {
    id: PALADIN_MISSION_ID,
    title: "Wandering Paladin",
    subtitle: "A lone knight blocks the road, blade drawn in challenge",
    description: "A wandering Paladin blocks the road and offers honest terms: your strongest champion against his blade, one on one, no tricks. Win his respect and he'll march at your side from here on.",
    unitType: "paladin",
    requiredStars: 10,
    rewardUnits: Object.freeze(["paladin"]),
    playerSlots: 1,
    enemySquad: Object.freeze(["paladin"]),
    size: 5,
    fullHp: true,
  },
  [MONK_MISSION_ID]: {
    id: MONK_MISSION_ID,
    title: "Temple Trial of the Monk",
    subtitle: "Four Monks stand in the temple corner — only one is real",
    description: "Bring a full chosen squad into the temple corner trial. Four Monks appear, but only one is real; read the battle carefully and strike the true master.",
    unitType: "monk",
    requiredStars: 12,
    rewardUnits: Object.freeze(["monk"]),
    playerSlots: 4,
    enemySquad: Object.freeze(["monk", "monk", "monk", "monk"]),
    size: 9,
    fullHp: true,
  },
  // Mechs on the Farm (9×9): a standard full-HP 2v2 on the default corner blocks against
  // the feuding mech brothers, Big Brother and Little Brother. No board puzzle — the fight
  // IS the lesson (keep your two units apart so one Little Brother Flamethrower cone can't
  // scorch both; race the brothers' RAGE). A win unlocks BOTH brothers as playable units.
  // Owns an arguing-brothers opening, per-brother RAGE lines, and a make-up beat before the
  // results screen (brothersDefeatScript). Sits on the reserved farmland landmark that the
  // gargoyle mission's map test deliberately left node-less "for a future unit."
  [BROTHERS_MISSION_ID]: {
    id: BROTHERS_MISSION_ID,
    title: "Mechs on the Farm",
    subtitle: "Two feuding machines are tearing up the fields",
    description: "A pair of mech brothers are wrecking the old homestead over a squabble. Bring any two units into a standard duel. Keep them apart so a single Flamethrower cone can't scorch both, and finish the brothers before they hit RAGE.",
    unitType: "big-brother",
    requiredStars: 13,
    rewardUnits: Object.freeze(["big-brother", "little-brother"]),
    rewardLabel: "Big Brother and Little Brother",
    playerSlots: 2,
    enemySquad: Object.freeze(["big-brother", "little-brother"]),
    size: 9,
    fullHp: true,
  },
  [GARGOYLE_MISSION_ID]: {
    id: GARGOYLE_MISSION_ID,
    title: "Gargoyle's Inferno",
    subtitle: "A small ruin mouth opens into a furnace",
    description: "Send one chosen champion into a 9x9 duel with the Gargoyle. Every turn a random open space catches fire, Pyroclasm punishes careless lines, and a fast win can deny Volcanic Rage.",
    unitType: "gargoyle",
    requiredStars: 14,
    rewardUnits: Object.freeze(["gargoyle"]),
    playerSlots: 1,
    enemySquad: Object.freeze(["gargoyle"]),
    size: 9,
    fullHp: true,
  },
  [SNIPER_MISSION_ID]: {
    id: SNIPER_MISSION_ID,
    title: "The High Ground of the Sniper",
    subtitle: "A sharpshooter rules the plateau's flat cliffs",
    description: "Lock the Archer into a 2v2 across the high plateau against a Sniper and Clod. Cover walls block both sightlines, cliff-fire never burns out, and the enemy marksman owns the long lanes.",
    unitType: "sniper",
    requiredStars: 16,
    rewardUnits: Object.freeze(["sniper"]),
    playerSlots: 2,
    // Slot one is pinned to the Archer (the mission is an archer-vs-sniper duel); the
    // second slot stays a free pick so the player chooses who spots for her.
    lockedSlots: Object.freeze({ 0: "archer" }),
    defaultSquad: Object.freeze(["archer", "swordsman"]),
    enemySquad: Object.freeze(["sniper", "clod"]),
    size: 13,
    fullHp: true,
  },
  // The Wandering Party (13×13): a friendly, standard 4v4 duel with no puzzle and no
  // per-objective grading — a win is a flat 3 stars. Its reward is a SKIN, not a unit
  // (rewardUnits is empty; rewardSkinPack points at the "wandering" pack). The enemy
  // party wears the wandering skins (applied by the layout's skinFor). This mission owns
  // two flag-gated cutscenes: an overworld meeting BEFORE the brief, and a post-match
  // farewell AFTER the results screen that leads into the one-time skin reward pick.
  [WANDERING_PARTY_MISSION_ID]: {
    id: WANDERING_PARTY_MISSION_ID,
    title: "The Wandering Party",
    subtitle: "Four travelers offer a friendly wager",
    description: "A party of wanderers blocks the road with a grin and a challenge: beat them in a fair four-on-four and they will gift you a traveler's costume. Bring any squad you like.",
    unitType: "swordsman",
    requiredStars: 18,
    rewardUnits: Object.freeze([]),
    rewardLabel: "A traveler's costume",
    rewardSkinPack: WANDERING_PARTY_SKIN_PACK,
    playerSlots: 4,
    enemySquad: Object.freeze(["swordsman", "archer", "mystic", "magician"]),
    size: 13,
    fullHp: true,
  },
  [MINER_MISSION_ID]: {
    id: MINER_MISSION_ID,
    title: "Dug Your Own Grave",
    subtitle: "A sealed mine shaft leaves one champion below",
    description: "Send one chosen champion into a buried 9x9 duel with the Miner. The mine is sealed in tight, and every path has to be carved open under pressure.",
    unitType: "miner",
    requiredStars: 20,
    rewardUnits: Object.freeze(["miner"]),
    playerSlots: 1,
    enemySquad: Object.freeze(["miner"]),
    size: 9,
    fullHp: true,
  },
  // Has-Been Heroes (13×13): a plain full-HP 4v4 in a crowded market town — both parties
  // just passing through Highmarket and bumping shoulders. No board puzzle; the fat squad
  // fields as themselves. Like The Wandering Party, the reward is a SKIN not a unit
  // (rewardUnits empty; rewardSkinPack points at the Mystic "hasbeen-mystic" pack). It owns
  // two flag-gated cutscenes — an overworld meeting BEFORE the brief, and a post-match
  // "let's go shopping" beat AFTER results that leads into the one-time Mystic skin pick.
  // This is a story rite-of-passage: a later mission unlocks the fat squad outright.
  [HASBEEN_HEROES_MISSION_ID]: {
    id: HASBEEN_HEROES_MISSION_ID,
    title: "Has-Been Heroes",
    subtitle: "A worn-out party blocks the market road",
    description: "A tired band of travelers crosses your path in the crowded town of Highmarket. Beat all four of them in a fair four-on-four. Bring any squad — the old starter four have a little extra to prove here.",
    unitType: "fat-knight",
    requiredStars: 22,
    rewardUnits: Object.freeze([]),
    rewardLabel: "A new look for the Mystic",
    rewardSkinPack: HASBEEN_MYSTIC_SKIN_PACK,
    playerSlots: 4,
    enemySquad: Object.freeze([...HASBEEN_HEROES_FAT_TYPES]),
    size: 13,
    fullHp: true,
  },
});

// The overworld trail: index = traversal order, each entry pins a mission's grid
// cell {col,row} on the CAMPAIGN_GRID. The authored missions lead; the rest are
// charted-but-unbuilt placeholder stops so the active route is visible (as
// "coming soon" / "?" nodes) from day one. Cells wind across the grid so the
// path reads like a real map. Promoting a placeholder to a real mission is purely
// additive: give its id an AUTHORED_MISSIONS entry — the cell + trails already exist.
// The map's geography: named biome regions the trail passes through, in paint order
// (earlier = drawn first / underneath). Each region auto-sizes to the missions
// assigned to it, so the terrain is data-driven — no hand-placed landmark coords.
// `biome` keys the CSS terrain styling; `label` is the on-map place name.
export const CAMPAIGN_REGIONS = Object.freeze([
  Object.freeze({ id: "ridge", biome: "rock", label: "Stoneback Ridge" }),
  Object.freeze({ id: "barrow", biome: "burial", label: "The Old Gate" }),
  Object.freeze({ id: "mire", biome: "swamp", label: "Mirefen Swamp" }),
  Object.freeze({ id: "coast", biome: "water", label: "Tidewatch Coast" }),
  Object.freeze({ id: "plateau", biome: "plateau", label: "The High Cliffs" }),
  Object.freeze({ id: "farm", biome: "farm", label: "Meadowmill" }),
  Object.freeze({ id: "ashfall", biome: "volcanic", label: "Ashfall Caldera" }),
  Object.freeze({ id: "wood", biome: "forest", label: "Whisperwood" }),
  Object.freeze({ id: "town", biome: "town", label: "Highmarket" }),
  Object.freeze({ id: "frost", biome: "snow", label: "Frostcrown Peaks" }),
  Object.freeze({ id: "waste", biome: "ruins", label: "The Shattered Waste" }),
]);

// The overworld trail: index = traversal order. Each stop pins a grid cell, the
// region it sits in, and its own place name (`locationName`) shown on the map even
// while the mission itself is still gated. `blurb` seeds the placeholder's flavor +
// a hint at the challenge a real mission there might explore (a mission-idea backlog).
const CAMPAIGN_TRAIL = [
  { id: CLOD_MISSION_ID, cell: { col: 0, row: 4 }, point: { x: 9.5, y: 86.4 }, region: "ridge", locationName: "Stoneback Ridge" },
  { id: NECROMANCER_MISSION_ID, cell: { col: 1, row: 4 }, point: { x: 19.0, y: 76.5 }, region: "barrow", locationName: "The Old Gate" },
  { id: WITCH_DOCTOR_MISSION_ID, cell: { col: 2, row: 4 }, point: { x: 31.4, y: 86.2 }, region: "mire", locationName: "Mirefen Shallows",
    blurb: "Foul water swallows the causeway. Something chants in the reeds — a witch doctor's dance, they say, that turns your own curses against you." },
  { id: FATHER_TIME_MISSION_ID, cell: { col: 3, row: 4 }, point: { x: 21.3, y: 48.4 }, region: "wood", locationName: "Timeless Woods",
    blurb: "Ancient trees lean over a path where seconds fall like leaves. A clock-crowned keeper waits beside a patient archer." },
  { id: VIRUS_MISSION_ID, cell: { col: 4, row: 4 }, point: { x: 11.4, y: 44.7 }, region: "mire", locationName: "The Viral Root",
    blurb: "Where the swamp drains to the sea, the rot has roots. A poisonous squad waits in the black water." },
  { id: PALADIN_MISSION_ID, cell: { col: 5, row: 4 }, point: { x: 29.1, y: 34.2 }, region: "coast", locationName: "Tidewatch Harbor",
    blurb: "Salt wind and long sightlines. Whoever commands the piers commands the range." },
  { id: MONK_MISSION_ID, cell: { col: 6, row: 4 }, point: { x: 21.3, y: 20.5 }, region: "coast", locationName: "Temple Steps",
    blurb: "A silent temple waits above the tide. Four identical Monks guard the steps, but only one carries the true discipline." },
  { id: BROTHERS_MISSION_ID, cell: { col: 3, row: 1 }, point: { x: 46.2, y: 31.1 }, region: "farm", locationName: "Meadowmill Farm" },
  { id: GARGOYLE_MISSION_ID, cell: { col: 5, row: 3 }, point: { x: 51.9, y: 18.7 }, region: "ashfall", locationName: "Ashfall Flats",
    blurb: "A low ruin mouth exhales heat from beneath the flats. Something stone-winged waits in the old dark." },
  { id: SNIPER_MISSION_ID, cell: { col: 4, row: 3 }, point: { x: 63.3, y: 24.3 }, region: "plateau", locationName: "The High Cliffs",
    blurb: "Flat cliffs and long sightlines. Whoever holds the plateau's height holds every lane across it." },
  { id: WANDERING_PARTY_MISSION_ID, cell: { col: 3, row: 3 }, point: { x: 67.3, y: 37.0 }, region: "ashfall", locationName: "Cinderwood" },
  { id: MINER_MISSION_ID, cell: { col: 2, row: 3 }, point: { x: 56.2, y: 47.3 }, region: "wood", locationName: "Whisperwood Eaves" },
  { id: HASBEEN_HEROES_MISSION_ID, cell: { col: 1, row: 3 }, point: { x: 50.2, y: 58.2 }, region: "town", locationName: "Highmarket" },
  { id: "uncharted-14", cell: { col: 0, row: 3 }, point: { x: 57.9, y: 72.5 }, region: "wood", locationName: "Thornhollow",
    blurb: "Bramble walls and blind corners. Line of sight is a luxury you'll have to earn." },
  { id: "uncharted-15", cell: { col: 0, row: 2 }, point: { x: 71.2, y: 78.9 }, region: "frost", locationName: "Frostcrown Foothills",
    blurb: "The climb begins. Cold slows the blood and the boots — every step of movement counts double." },
  { id: "uncharted-16", cell: { col: 1, row: 2 }, point: { x: 84.5, y: 86.4 }, region: "frost", locationName: "Rimefang Pass",
    blurb: "A knife-edge pass walled by ice. Cover shatters; nowhere stays safe for long." },
  { id: "uncharted-17", cell: { col: 2, row: 2 }, point: { x: 74.9, y: 62.1 }, region: "frost", locationName: "The White Summit",
    blurb: "Above the clouds, a frostguard holds the peak. Bring warmth, or bring numbers." },
  { id: "uncharted-18", cell: { col: 3, row: 2 }, point: { x: 80.0, y: 47.2 }, region: "waste", locationName: "The Shattered Waste",
    blurb: "Beyond the peaks, a broken country of fallen towers where time itself runs strange." },
  { id: "uncharted-19", cell: { col: 4, row: 2 }, point: { x: 82.9, y: 30.3 }, region: "waste", locationName: "Ruins of Vael",
    blurb: "A dead capital picked clean by mages. A caster here bends magic and the years to spite you." },
  { id: "uncharted-20", cell: { col: 5, row: 2 }, point: { x: 86.8, y: 16.8 }, region: "waste", locationName: "The Iron Citadel",
    blurb: "The last gate. A crowned commander waits on the throne — end the campaign or serve it." },
];

// Extra visual branches on top of the linear spine, so the map reads as a network
// with forks rather than one snaking line. Purely cosmetic — unlock stays star-gated.
const CAMPAIGN_FORKS = [
  [WITCH_DOCTOR_MISSION_ID, MINER_MISSION_ID],
  ["uncharted-06", "uncharted-09"],
  [WANDERING_PARTY_MISSION_ID, "uncharted-18"],
];

function placeholderMission(stop, trailIndex) {
  // requiredStars climbs with distance along the trail so nearer stops reveal first
  // as the player banks stars; distant ones stay "?" until the map fills out.
  return {
    id: stop.id,
    title: stop.locationName,
    subtitle: "Campaign · coming soon",
    description: stop.blurb ?? "This stretch of the war map hasn't been charted yet. New campaigns are on the way.",
    comingSoon: true,
    requiredStars: 4 + (trailIndex - 2) * 2,
    rewardUnits: Object.freeze([]),
    playerSlots: 2,
    enemySquad: Object.freeze([]),
  };
}

function buildCampaignMissions() {
  const byId = new Map();
  CAMPAIGN_TRAIL.forEach((stop, index) => {
    const base = AUTHORED_MISSIONS[stop.id] ?? placeholderMission(stop, index);
    byId.set(stop.id, {
      ...base,
      id: stop.id,
      cell: { ...stop.cell },
      point: stop.point ? { ...stop.point } : null,
      connections: [],
      region: stop.region,
      locationName: stop.locationName,
    });
  });
  // Spine: every stop trails to the next one in traversal order.
  for (let i = 0; i < CAMPAIGN_TRAIL.length - 1; i += 1) {
    byId.get(CAMPAIGN_TRAIL[i].id).connections.push(CAMPAIGN_TRAIL[i + 1].id);
  }
  // Forks: extra branch trails.
  for (const [from, to] of CAMPAIGN_FORKS) {
    if (byId.has(from) && byId.has(to)) byId.get(from).connections.push(to);
  }
  return CAMPAIGN_TRAIL.map((stop) => {
    const mission = byId.get(stop.id);
    return Object.freeze({
      ...mission,
      cell: Object.freeze(mission.cell),
      point: mission.point ? Object.freeze(mission.point) : null,
      connections: Object.freeze(mission.connections),
    });
  });
}

export const CAMPAIGN_MISSIONS = Object.freeze(buildCampaignMissions().slice(0, MAX_CAMPAIGN_MISSIONS));

// Node positions, trail path geometry, and terrain region boxes are derived once
// from the mission graph + region metadata.
const CAMPAIGN_GEOMETRY = computeCampaignGeometry(CAMPAIGN_MISSIONS);
const CAMPAIGN_REGION_BOXES = computeRegionBoxes(CAMPAIGN_MISSIONS, CAMPAIGN_REGIONS);
const REGION_BIOME_BY_ID = new Map(CAMPAIGN_REGIONS.map((region) => [region.id, region.biome]));

function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function progressFallback() {
  return {
    completedMissions: [],
    missionStars: {},
    seenMapCutscenes: [],
    seenPostMatchCutscenes: [],
  };
}

export function normalizeCampaignProgress(value = {}) {
  const missionIds = new Set(CAMPAIGN_MISSIONS.map((mission) => mission.id));
  const completedMissions = uniqueStrings(value.completedMissions).filter((id) => missionIds.has(id));
  const seenMapCutscenes = uniqueStrings(value.seenMapCutscenes).filter((id) => missionIds.has(id));
  const seenPostMatchCutscenes = uniqueStrings(value.seenPostMatchCutscenes).filter((id) => missionIds.has(id));
  const missionStars = {};
  for (const mission of CAMPAIGN_MISSIONS) {
    const stars = Math.max(0, Math.min(3, Math.floor(Number(value.missionStars?.[mission.id]) || 0)));
    if (stars > 0) missionStars[mission.id] = stars;
  }
  for (const id of completedMissions) {
    missionStars[id] = Math.max(1, missionStars[id] ?? 0);
  }
  return { completedMissions, missionStars, seenMapCutscenes, seenPostMatchCutscenes };
}

export function readCampaignProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(CAMPAIGN_PROGRESS_KEY);
    if (!raw) return progressFallback();
    return normalizeCampaignProgress(JSON.parse(raw));
  } catch {
    return progressFallback();
  }
}

export function writeCampaignProgress(storage, progress) {
  const normalized = normalizeCampaignProgress(progress);
  try {
    storage?.setItem?.(CAMPAIGN_PROGRESS_KEY, JSON.stringify(normalized));
  } catch {
    // Campaign progress is a convenience layer; storage failures should not break play.
  }
  return normalized;
}

export function resetCampaignProgress(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(CAMPAIGN_PROGRESS_KEY);
  } catch {
    // Best-effort reset.
  }
  return progressFallback();
}

// The wandering party's dialogue portraits wear their "wandering" skins — the skin is
// declared directly on each line (side/player/name too) since these cutscenes play on the
// overworld map with no live match units to read a skin off of.
const WANDERING_LINE = Object.freeze({ skin: "wandering", side: "right", player: 2 });

function volunteerType(selectedSquad) {
  return (Array.isArray(selectedSquad) ? selectedSquad : []).find((type) => UNIT_TYPE_KEYS.includes(type)) ?? "swordsman";
}

export function campaignMapCutsceneScript(missionId, selectedSquad = null, { phase = "full" } = {}) {
  if (missionId === MINER_MISSION_ID) {
    const type = volunteerType(selectedSquad);
    // The volunteer is the player's own champion, so honor the nickname they set for
    // that unit type (this cutscene runs on the map with no live unit to read).
    const name = getNicknamePref(type) ?? getUnitType(type).name;
    const preChoice = [
      {
        speaker: "swordsman",
        text: "No. Absolutely not. That is another hole.",
      },
      {
        speaker: "mystic",
        text: "It is more of a mine mouth. Technically different. Emotionally worse.",
      },
      {
        speaker: "archer",
        text: "Someone should check whether it opens onto the trail. One person, quick look, then back up.",
      },
    ];
    const postChoice = [
      {
        type,
        name,
        side: "left",
        player: 1,
        text: "I'll go. If it bends left, I will call back before--",
      },
      {
        speaker: "swordsman",
        text: "The entrance just sealed. The entrance definitely just sealed.",
      },
      {
        speaker: "mystic",
        text: "I cannot hear them through the stone. The wall is too thick.",
      },
    ];
    if (phase === "preChoice") return preChoice;
    if (phase === "postChoice") return postChoice;
    return [...preChoice, ...postChoice];
  }
  if (missionId === HASBEEN_HEROES_MISSION_ID) {
    // Overworld meeting in the crowded town: both parties just passing through. The fat
    // squad speaks on the right (player 2, their own art); your Swordsman + Mystic answer
    // on the left. One-time beat (gated by seenMapCutscenes).
    const fat = (type, text) => ({ speaker: type, side: "right", player: 2, text });
    return [
      fat("fat-knight", "Hold up. Hoooold up. I need a break. My feet have filed a formal complaint."),
      fat("fat-bowman", "You? A break? I have been on a break since the second castle. This is just how I walk now."),
      fat("fat-cleric", "Wherever we stop, I hope they have food. Real food. A whole cart of it, ideally."),
      fat("fat-wizard", "*hic* — has anyone... has anyone seen my staff? It was RIGHT here. It had a little... a little pointy bit."),
      fat("fat-knight", "Wait. New faces. You lot — where are you headed in such a hurry?"),
      { speaker: "swordsman", side: "left", text: "The castle. We have business with the king." },
      fat("fat-knight", "*straightens up* Oh no you're not. WE have a beef to settle with that king. You'll wait your turn."),
      { speaker: "mystic", side: "left", text: "A beef? What on earth did the king do to you four?" },
      fat("fat-wizard", "*hic* Banished us! Framed us for a terrible, TERRIBLE crime we did not commit. And the worst part is we're not even from this ti--"),
      fat("fat-knight", "That's ENOUGH out of you. *ahem.* The point is, there is no way you reach that castle before we do. Not a chance."),
      { speaker: "swordsman", side: "left", text: "We'll see about that." },
    ];
  }
  if (missionId === WANDERING_PARTY_MISSION_ID) {
    return [
      { ...WANDERING_LINE, type: "swordsman", name: "Wandering Swordsman",
        text: "Ho there, travelers! Easy — we mean no trouble. We are wanderers, same as you, just passing through Cinderwood." },
      { speaker: "swordsman", side: "left",
        text: "Wanderers, and yet you have the whole road blocked." },
      { ...WANDERING_LINE, type: "mystic", name: "Wandering Mystic",
        text: "Only for a moment. The road is long and dull. How about a friendly bout to pass the time? Four of us, four of you." },
      { ...WANDERING_LINE, type: "archer", name: "Wandering Archer",
        text: "Win, and we will gift you one of the costumes we have gathered on our travels. A little souvenir of the meeting." },
      { speaker: "swordsman", side: "left",
        text: "A new look and a good scrap? You have a deal." },
    ];
  }
  if (missionId === GARGOYLE_MISSION_ID) {
    return [
      {
        speaker: "swordsman",
        text: "That is not a cave. That is a doorway pretending to be a crack in the rocks.",
      },
      {
        speaker: "mystic",
        text: "Old ruins, small entrance, warm air coming out. Wonderful signs, all of them.",
      },
      {
        speaker: "archer",
        text: "It is too narrow for the whole party. Maybe one of us climbs in, takes a look, and climbs right back out.",
      },
      {
        speaker: "swordsman",
        text: "Right back out. That part feels important.",
      },
    ];
  }
  if (missionId !== PALADIN_MISSION_ID) return [];
  return [
    {
      speaker: "paladin",
      text: "Well met. I have been walking this map alone, and the road is better with a worthy party beside you.",
    },
    {
      speaker: "swordsman",
      text: "You want to join us?",
    },
    {
      speaker: "paladin",
      text: "Gladly, if your strongest ally can best me in a clean duel. One champion, one Paladin, no hard feelings.",
    },
  ];
}

export function shouldShowCampaignMapCutscene(storage = defaultStorage(), missionId) {
  if (missionId === MINER_MISSION_ID) return true;
  return campaignMapCutsceneScript(missionId).length > 0 &&
    !readCampaignProgress(storage).seenMapCutscenes.includes(missionId);
}

export function markCampaignMapCutsceneSeen(storage = defaultStorage(), missionId) {
  const current = readCampaignProgress(storage);
  if (current.seenMapCutscenes.includes(missionId)) return current;
  return writeCampaignProgress(storage, {
    ...current,
    seenMapCutscenes: [...current.seenMapCutscenes, missionId],
  });
}

// Post-match cutscene: the beat that plays AFTER the results screen (once the player is
// forced back onto the map) and BEFORE the skin reward pick. Flag-gated by the same
// seen-list pattern the overworld map cutscene uses, but tracked separately per mission
// so the two cutscenes never burn each other's flag.
export function campaignPostMatchCutsceneScript(missionId) {
  if (missionId === HASBEEN_HEROES_MISSION_ID) {
    // The fat squad has trudged off; the party lingers in town. The Mystic pitches a
    // shopping trip, which leads straight into the one-time Mystic skin pick. One-time
    // beat (gated by seenPostMatchCutscenes).
    return [
      { speaker: "mystic", side: "left",
        text: "Well, since we're already in town... we simply have to go shopping. When will we be back in Highmarket, hm?" },
      { speaker: "swordsman", side: "left",
        text: "Mystic. We are being chased across a war map by four self-declared heroes." },
      { speaker: "mystic", side: "left",
        text: "Which is exactly why I deserve something nice. Just one little look. It'll be quick, I promise." },
    ];
  }
  if (missionId !== WANDERING_PARTY_MISSION_ID) return [];
  return [
    { ...WANDERING_LINE, type: "mystic", name: "Wandering Mystic",
      text: "Well fought! Truly. You have real skill — the road is safer with a party like yours walking it." },
    { speaker: "swordsman", side: "left",
      text: "You did not make it easy on us. Not for a moment." },
    { ...WANDERING_LINE, type: "swordsman", name: "Wandering Swordsman",
      text: "Ha! We have more wandering ahead of us, but a promise is a promise. Take a costume from our packs and wear it well." },
    { ...WANDERING_LINE, type: "archer", name: "Wandering Archer",
      text: "Safe travels, friends. Perhaps our roads will cross again someday." },
  ];
}

// The closing beat that plays AFTER the player actually picks a reward skin (not shown if
// the pick is declined). Currently only Has-Been Heroes uses it, for the Mystic's payoff
// line on her new look.
export function campaignRewardPickedScript(missionId) {
  if (missionId !== HASBEEN_HEROES_MISSION_ID) return [];
  return [
    { speaker: "mystic", side: "left",
      text: "Oh, I LOVE it. Don't you just love shopping? I feel like a whole new caster." },
    { speaker: "swordsman", side: "left",
      text: "...Can we go beat those has-beens to a castle now." },
  ];
}

export function shouldShowCampaignPostMatchCutscene(storage = defaultStorage(), missionId) {
  return campaignPostMatchCutsceneScript(missionId).length > 0 &&
    !readCampaignProgress(storage).seenPostMatchCutscenes.includes(missionId);
}

export function markCampaignPostMatchCutsceneSeen(storage = defaultStorage(), missionId) {
  const current = readCampaignProgress(storage);
  if (current.seenPostMatchCutscenes.includes(missionId)) return current;
  return writeCampaignProgress(storage, {
    ...current,
    seenPostMatchCutscenes: [...current.seenPostMatchCutscenes, missionId],
  });
}

export function totalCampaignStars(progress) {
  return Object.values(progress?.missionStars ?? {}).reduce((sum, stars) => sum + Math.max(0, Number(stars) || 0), 0);
}

export function getCampaignMission(missionId) {
  return CAMPAIGN_MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

export function campaignSquadSize(mission) {
  return Math.max(
    MIN_CAMPAIGN_SQUAD_SIZE,
    Math.min(MAX_CAMPAIGN_SQUAD_SIZE, Math.floor(Number(mission?.playerSlots) || MAX_CAMPAIGN_SQUAD_SIZE))
  );
}

export function normalizeCampaignSquad(selectedSquad = DEFAULT_SQUAD, missionOrSize = MAX_CAMPAIGN_SQUAD_SIZE) {
  const size = typeof missionOrSize === "number" ? missionOrSize : campaignSquadSize(missionOrSize);
  const targetSize = Math.max(MIN_CAMPAIGN_SQUAD_SIZE, Math.min(MAX_CAMPAIGN_SQUAD_SIZE, size));
  const out = [];
  for (const type of Array.isArray(selectedSquad) ? selectedSquad : []) {
    if (UNIT_TYPE_KEYS.includes(type) && !out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of DEFAULT_SQUAD) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of UNIT_TYPE_KEYS) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  return out;
}

export function getCampaignMap(storage = defaultStorage()) {
  const progress = readCampaignProgress(storage);
  const totalStars = totalCampaignStars(progress);
  const completed = new Set(progress.completedMissions);
  const nodes = CAMPAIGN_MISSIONS.map((mission) => {
    const stars = progress.missionStars[mission.id] ?? 0;
    const unlocked = totalStars >= mission.requiredStars;
    const complete = completed.has(mission.id);
    const status = !unlocked
      ? "locked"
      : mission.comingSoon
        ? "coming-soon"
        : complete
          ? "completed"
          : "available";
    const point = CAMPAIGN_GEOMETRY.positions[mission.id] ?? { x: 50, y: 50 };
    return {
      ...mission,
      stars,
      complete,
      locked: !unlocked,
      status,
      displayType: unlocked ? mission.unitType ?? null : null,
      biome: REGION_BIOME_BY_ID.get(mission.region) ?? null,
      // Position is a percent of the map canvas, derived from the mission's grid cell.
      position: { x: point.x, y: point.y },
    };
  });

  // A trail reads as "open" only when both of its endpoints are revealed, so locked
  // stretches of the map draw dim/dashed and the charted route glows.
  const statusById = new Map(nodes.map((node) => [node.id, node.status]));
  const edges = CAMPAIGN_GEOMETRY.edges.map((edge) => ({
    ...edge,
    status:
      statusById.get(edge.from) !== "locked" && statusById.get(edge.to) !== "locked"
        ? "open"
        : "locked",
  }));

  return {
    totalStars,
    progress,
    grid: CAMPAIGN_GEOMETRY.grid,
    nodes,
    edges,
    regions: CAMPAIGN_REGION_BOXES,
  };
}

// Pins a mission's `lockedSlots` (e.g. {0:"archer"}) onto a chosen squad regardless of
// what the UI sent — the locked type is forced into its slot and pulled out of any other
// slot so it can't duplicate. A defensive belt to the menu's per-slot lock; the actual
// slot-index fill still happens in normalizeCampaignSquad afterward.
export function applyLockedSlots(squad, mission) {
  const lockedSlots = mission?.lockedSlots;
  if (!lockedSlots) return squad;
  const out = [...(Array.isArray(squad) ? squad : [])];
  for (const [indexKey, type] of Object.entries(lockedSlots)) {
    const index = Number(indexKey);
    for (let i = 0; i < out.length; i += 1) {
      if (i !== index && out[i] === type) out[i] = null;
    }
    out[index] = type;
  }
  return out;
}

export function createCampaignMatchConfig(missionId = CLOD_MISSION_ID, selectedSquad = null, selectedSkins = null) {
  const mission = getCampaignMission(missionId);
  if (!mission || mission.comingSoon) throw new Error(`Campaign mission is not playable: ${missionId}`);
  // squadLocked missions test a specific unit's kit, not squad choice — the authored
  // defaultSquad always wins, even if a caller (or a stale UI selection) passes something
  // else in.
  const playerSquad = mission.squadLocked
    ? normalizeCampaignSquad(mission.defaultSquad ?? DEFAULT_SQUAD, mission)
    : normalizeCampaignSquad(
        applyLockedSlots(selectedSquad ?? mission.defaultSquad ?? DEFAULT_SQUAD, mission),
        mission,
      );
  return {
    mode: "campaign",
    campaignMissionId: mission.id,
    difficulty: "normal",
    size: mission.size ?? 11,
    playerCount: 2,
    squads: {
      1: playerSquad,
      2: [...mission.enemySquad],
    },
    // Skins are chosen by the player keyed by unit TYPE (see menuFlow.js), matched
    // back onto the normalized squad's slot order here for buildRoster.
    skins: {
      1: playerSquad.map((type) => selectedSkins?.[type] ?? null),
    },
    // The enemy squad is scripted, not a real local player — it must never inherit
    // the player's own local nickname preferences (buildRoster's default fallback
    // applies per-type, so an enemy Swordsman would otherwise wear the same
    // nickname as the player's own Swordsman).
    nicknames: {
      1: playerSquad.map((type) => getNicknamePref(type)),
      2: mission.enemySquad.map(() => null),
    },
    teamNames: {
      1: "Player Vanguard",
      2: mission.id === WANDERING_PARTY_MISSION_ID
        ? "The Wanderers"
        : mission.id === HASBEEN_HEROES_MISSION_ID
        ? "The Has-Beens"
        : mission.id === MINER_MISSION_ID
        ? "Buried Claim"
        : mission.id === SNIPER_MISSION_ID
        ? "The High Guard"
        : mission.id === FATHER_TIME_MISSION_ID
        ? "Timeless Court"
        : mission.id === VIRUS_MISSION_ID
        ? "Viral Root"
        : mission.id === PALADIN_MISSION_ID
        ? "Wandering Paladin"
        : mission.id === MONK_MISSION_ID
        ? "Temple Monks"
        : mission.id === GARGOYLE_MISSION_ID
        ? "Ashfall Guardian"
        : mission.id === BROTHERS_MISSION_ID
        ? "The Brothers"
        : mission.id === WITCH_DOCTOR_MISSION_ID
        ? "Swamp Coven"
        : mission.id === NECROMANCER_MISSION_ID
          ? "Gatekeepers"
          : "Ridge Guard",
    },
  };
}

// The swamp lattice: a SPREAD 3×3 Ghoul grid, spacing 2 (x,y each in {2,4,6}) — close enough
// that every gap between Ghouls is covered by either a Ghoul's orthogonal fire or another
// Ghoul's diagonal Bite range (Chebyshev 1), so nothing inside the lattice's own footprint is
// free to walk except a Ghoul's own tile once it's dead. Spacing 2 (not the old spacing-4
// lattice) is what closes the "avenue" loophole those wider gaps used to leave open. The
// lattice's own top-right slot is left empty for the Witch Doctor rather than a ninth Ghoul.
const WITCH_DOCTOR_LATTICE_VALUES = Object.freeze([2, 4, 6]);
const WITCH_DOCTOR_SLOT = Object.freeze({ x: 6, y: 2 }); // top-right of the lattice
const WITCH_DOCTOR_SPAWN = Object.freeze({ x: 0, y: WITCH_DOCTOR_BOARD_SIZE - 1 });
const WITCH_DOCTOR_GHOUL_POSITIONS = Object.freeze(
  WITCH_DOCTOR_LATTICE_VALUES.flatMap((y) => WITCH_DOCTOR_LATTICE_VALUES.map((x) => ({ x, y })))
    .filter((p) => !(p.x === WITCH_DOCTOR_SLOT.x && p.y === WITCH_DOCTOR_SLOT.y))
    .map((p) => Object.freeze(p))
);
const WITCH_DOCTOR_GHOUL_POSITION_KEYS = new Set(WITCH_DOCTOR_GHOUL_POSITIONS.map(positionKey));
const MONK_TRIAL_POSITIONS = Object.freeze([
  Object.freeze({ x: 7, y: 0 }),
  Object.freeze({ x: 8, y: 1 }),
  Object.freeze({ x: 8, y: 0 }),
  Object.freeze({ x: 7, y: 1 }),
]);
const MONK_TRIAL_CENTER_POSITION = Object.freeze({ x: 4, y: 4 });
const MONK_TRIAL_ALERT_POSITION = Object.freeze({ x: 8, y: 0 });
const MONK_TRIAL_FAKE_ART_SETS = Object.freeze([
  Object.freeze({ "front-kick": "Lotus Uppercut", protect: "Mirror Palm" }),
  Object.freeze({ "front-kick": "Temple Sweep", protect: "Still Water Guard" }),
  Object.freeze({ "front-kick": "Cloudbreaker Kick", protect: "Incense Veil" }),
]);

// Fire has two unioned sources:
// 1. Each Ghoul's four ORTHOGONAL neighbours, clipped to the board and excluding any tile
//    that's itself a Ghoul position (spacing 2 means that never actually happens here, but
//    the guard stays cheap insurance against a future spacing change). This lattice fire only
//    reaches 1 tile past the outermost Ghouls, so on its own it leaves the true board edge
//    open — a gap the old spacing-4 layout let a player walk clean around.
// 2. A full 1-tile fire border along the true edges of the map itself (all four sides),
//    minus the player's spawn tile. This is what actually stops the edge-creep: the lattice
//    is positioned with exactly 1 tile of clearance from the board edge, so its own outward
//    fire sits immediately adjacent to this border with no safe ring left between them.
function ghoulOrthogonalFireKeys() {
  const keys = new Set();
  for (const ghoul of WITCH_DOCTOR_GHOUL_POSITIONS) {
    for (const dir of ORTHOGONAL_DIRECTIONS) {
      const p = { x: ghoul.x + dir.x, y: ghoul.y + dir.y };
      if (p.x < 0 || p.y < 0 || p.x >= WITCH_DOCTOR_BOARD_SIZE || p.y >= WITCH_DOCTOR_BOARD_SIZE) continue;
      if (WITCH_DOCTOR_GHOUL_POSITION_KEYS.has(positionKey(p))) continue;
      keys.add(positionKey(p));
    }
  }
  return keys;
}

function mapBorderFireKeys() {
  const keys = new Set();
  const max = WITCH_DOCTOR_BOARD_SIZE - 1;
  const spawnKey = positionKey(WITCH_DOCTOR_SPAWN);
  for (let x = 0; x <= max; x += 1) {
    for (const y of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  for (let y = 0; y <= max; y += 1) {
    for (const x of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  return keys;
}

const WITCH_DOCTOR_FIRE_POSITIONS = Object.freeze(
  [...new Set([...ghoulOrthogonalFireKeys(), ...mapBorderFireKeys()])].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return Object.freeze({ x, y });
  })
);

function createCampaignGhoul(index, position) {
  return {
    ...createUnit({
      id: `p2-swamp-ghoul-${index}`,
      player: 2,
      team: 2,
      type: "ghoul",
      x: position.x,
      y: position.y,
      hp: 5,
      mp: 0,
    }),
    spent: true,
    summonerId: null,
  };
}

function shuffledMonkTrialPositions(rngState) {
  let state = rngState;
  const positions = MONK_TRIAL_POSITIONS.map((position) => ({ ...position }));
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const roll = nextRandom(state);
    state = roll.state;
    const swap = Math.floor(roll.value * (index + 1));
    [positions[index], positions[swap]] = [positions[swap], positions[index]];
  }
  return { positions, rngState: state };
}

function prepareMonkTrial(match, units) {
  const monks = units.filter((unit) => unit.player === 2 && unit.type === "monk");
  if (monks.length !== 4) return { units, rngState: match.rngState, missionRules: null };
  const realRoll = nextRandom(match.rngState);
  const realIndex = Math.min(monks.length - 1, Math.floor(realRoll.value * monks.length));
  const shuffled = shuffledMonkTrialPositions(realRoll.state);
  const realMonkId = monks[realIndex].id;
  let fakeIndex = 0;
  const positionByMonkId = new Map(monks.map((unit, index) => [unit.id, shuffled.positions[index]]));
  const finalPositions = Object.fromEntries(monks.map((unit) => {
    const position = positionByMonkId.get(unit.id) ?? unit.position;
    return [unit.id, { x: position.x, y: position.y }];
  }));
  const prepared = units.map((unit) => {
    if (unit.player === 1) return { ...unit, introHidden: true };
    if (unit.player !== 2 || unit.type !== "monk") return unit;
    const real = unit.id === realMonkId;
    const fakeArtNames = real ? null : MONK_TRIAL_FAKE_ART_SETS[fakeIndex++ % MONK_TRIAL_FAKE_ART_SETS.length];
    return {
      ...unit,
      position: real ? { ...MONK_TRIAL_CENTER_POSITION } : (positionByMonkId.get(unit.id) ?? unit.position),
      introHidden: !real,
      trialIntroAlert: false,
      trialRealMonk: real,
      trialFakeMonk: !real,
      ...(fakeArtNames ? { fakeArtNames: { ...fakeArtNames } } : {}),
    };
  });
  return {
    units: prepared,
    rngState: shuffled.rngState,
    missionRules: { monkTrial: { realMonkId, finalPositions, introComplete: false } },
  };
}

export function applyMonkTrialIntroBeat(state, beat) {
  if (!state?.missionRules?.monkTrial) return state;
  if (beat === "monkIntroRevealAndMove") {
    const realMonkId = state.missionRules.monkTrial.realMonkId;
    return {
      ...state,
      units: state.units.map((unit) => {
        if (unit.player === 1) return { ...unit, introHidden: false };
        if (unit.id === realMonkId) {
          return {
            ...unit,
            position: { ...MONK_TRIAL_ALERT_POSITION },
            introHidden: false,
            trialIntroAlert: true,
          };
        }
        return unit;
      }),
    };
  }
  if (beat === "monkIntroSplitShuffle" || beat === "monkIntroComplete") {
    const finalPositions = state.missionRules.monkTrial.finalPositions ?? {};
    return {
      ...state,
      missionRules: {
        ...state.missionRules,
        monkTrial: {
          ...state.missionRules.monkTrial,
          introComplete: true,
        },
      },
      units: state.units.map((unit) => {
        const finalPosition = finalPositions[unit.id];
        return {
          ...unit,
          ...(finalPosition ? { position: { ...finalPosition } } : {}),
          introHidden: false,
          trialIntroAlert: false,
        };
      }),
    };
  }
  return state;
}

// The High Ground plateau (13×13): destructible cover walls (hp 1) and permanent
// cliff-fire tiles spread across the whole board, not clustered into one lane — the
// plateau should read as a contested field with patterned cover and hazards in every quadrant.
// Walls block both physical and magic sightlines (isWallBetween) and are the
// "destroy a wall" objective's targets; the permanent fire never burns out, so
// "avoid fire damage" is a full-match route constraint. Neither set sits on or beside
// a spawn tile (see SNIPER_MISSION_ID's standard-formation layout below).
const SNIPER_WALL_POSITIONS = Object.freeze([
  Object.freeze({ x: 3, y: 10 }),
  Object.freeze({ x: 4, y: 9 }),
  Object.freeze({ x: 3, y: 8 }),
  Object.freeze({ x: 9, y: 3 }),
  Object.freeze({ x: 10, y: 3 }),
  Object.freeze({ x: 9, y: 4 }),
  Object.freeze({ x: 5, y: 6 }),
  Object.freeze({ x: 6, y: 6 }),
  Object.freeze({ x: 7, y: 6 }),
]);
const SNIPER_FIRE_POSITIONS = Object.freeze([
  Object.freeze({ x: 2, y: 7 }),
  Object.freeze({ x: 3, y: 7 }),
  Object.freeze({ x: 4, y: 7 }),
  Object.freeze({ x: 8, y: 5 }),
  Object.freeze({ x: 9, y: 5 }),
  Object.freeze({ x: 10, y: 5 }),
  Object.freeze({ x: 5, y: 10 }),
  Object.freeze({ x: 6, y: 10 }),
  Object.freeze({ x: 7, y: 10 }),
  Object.freeze({ x: 5, y: 2 }),
  Object.freeze({ x: 6, y: 2 }),
  Object.freeze({ x: 7, y: 2 }),
]);

const MINER_PLAYER_SPAWN = Object.freeze({ x: 0, y: 8 });
const MINER_ENEMY_SPAWN = Object.freeze({ x: 8, y: 0 });

function minerWallObjects() {
  const walls = {};
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const spawn =
        (x === MINER_PLAYER_SPAWN.x && y === MINER_PLAYER_SPAWN.y) ||
        (x === MINER_ENEMY_SPAWN.x && y === MINER_ENEMY_SPAWN.y);
      if (!spawn) walls[positionKey({ x, y })] = { kind: "wall", hp: 1 };
    }
  }
  return walls;
}

// Each campaign mission owns a spawn layout: hardcoded coordinates for the fixed
// enemy pieces (their ids are deterministic), plus a slot-index fallback that places
// whatever units the player drafted (the squad is player-chosen, so player ids are not
// known ahead of time). Keyed by mission id so a new mission only adds a table entry.
const CAMPAIGN_LAYOUTS = Object.freeze({
  [CLOD_MISSION_ID]: {
    positions: {
      "p1-0-mystic": { x: 2, y: 6 },
      "p1-1-magician": { x: 2, y: 4 },
      "p2-0-clod": { x: 7, y: 5 },
      "p2-1-juggernaut": { x: 8, y: 7 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 6 } : { x: 2, y: 4 })
        : (unit.id.includes("-0-") ? { x: 7, y: 5 } : { x: 8, y: 7 }),
  },
  // Necromancer's Gate (13×13): the Necromancer holds the backline; the Virus sits
  // forward enough to threaten but stays focusable; the player's two units spawn in the
  // opposite corner, spread one tile apart with a clean approach outside turn-one Cough
  // range (Virus range 5, opening distance 6).
  [NECROMANCER_MISSION_ID]: {
    positions: {
      "p2-0-necromancer": { x: 10, y: 2 },
      "p2-1-virus": { x: 8, y: 5 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 4, y: 9 } : { x: 2, y: 10 })
        : (unit.id.includes("-0-") ? { x: 10, y: 2 } : { x: 8, y: 5 }),
  },
  // Cursed Swamp (9x9): the Archer starts in the bottom-left corner, boxed in by the map-edge
  // fire border on two sides, and pushes toward the Witch Doctor standing in the spread
  // lattice's own vacated top-right slot (see WITCH_DOCTOR_GHOUL_POSITIONS + the fire-source
  // comment above it).
  [WITCH_DOCTOR_MISSION_ID]: {
    positions: {
      "p2-0-witch-doctor": { ...WITCH_DOCTOR_SLOT },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...WITCH_DOCTOR_SPAWN }
        : { ...WITCH_DOCTOR_SLOT },
    extraUnits: () => WITCH_DOCTOR_GHOUL_POSITIONS.map((position, index) => createCampaignGhoul(index, position)),
    tileObjects: () => Object.fromEntries(
      WITCH_DOCTOR_FIRE_POSITIONS.map((position) => [positionKey(position), { kind: "fire", permanent: true }])
    ),
  },
  // Timeless Woods (11x11): normal corner placement. The default match builder already
  // creates the intended two-slot corner blocks, so this layout only gives the mission
  // deterministic half-HP starts and stable enemy ids for dialogue/objectives.
  [FATHER_TIME_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
  },
  // Root of the Virus (11x11): a normal corner-spawn 4v4 duel. Only HP prep differs
  // from earlier campaign lessons: this is the first official full-HP squad match.
  [VIRUS_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
  },
  // Wandering Paladin (5x5): a clean 1v1. The player's chosen champion starts in
  // the near corner; the Paladin waits in the opposite corner on a default light
  // tile so Lightseeker is immediately legible if the player also stands in light.
  [PALADIN_MISSION_ID]: {
    positions: {
      "p2-0-paladin": { x: 4, y: 0 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { x: 0, y: 4 }
        : { x: 4, y: 0 },
    fullHp: true,
  },
  // Temple Trial (9x9): the player's full squad starts in the near corner. The
  // four enemy Monks are shuffled into the far corner after one is randomly marked
  // real; only the real Monk sustains the trial.
  [MONK_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    prepareTrial: prepareMonkTrial,
  },
  // Gargoyle's Inferno (9x9): a clean corner duel with a mission rule that adds one
  // temporary fire tile at every turn rollover while the Gargoyle lives.
  [GARGOYLE_MISSION_ID]: {
    positions: {
      "p2-0-gargoyle": { x: 8, y: 0 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { x: 0, y: 8 }
        : { x: 8, y: 0 },
    fullHp: true,
    missionRules: () => ({ randomFire: { sourceId: "p2-0-gargoyle", turnsLeft: 3 } }),
  },
  // The High Ground of the Sniper (13×13): a full-HP 2v2 on the STANDARD corner
  // formation — the Archer (pinned to slot one) and her chosen ally spawn in the
  // player's usual corner block, the enemy Sniper and Clod spawn in theirs, same as
  // every other default-formation mission. Cover walls + permanent cliff-fire are
  // patterned across the whole board (see SNIPER_WALL/FIRE_POSITIONS above).
  [SNIPER_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    tileObjects: () => ({
      ...Object.fromEntries(SNIPER_WALL_POSITIONS.map((position) => [positionKey(position), { kind: "wall", hp: 1 }])),
      ...Object.fromEntries(SNIPER_FIRE_POSITIONS.map((position) => [positionKey(position), { kind: "fire", permanent: true }])),
    }),
  },
  // Mechs on the Farm (9×9): a standard full-HP 2v2 on the default corner blocks — no
  // walls, fire, or trial. The brothers field as themselves in the opposite corner. The
  // deterministic ids (p2-0-big-brother / p2-1-little-brother) back the dialogue + grading.
  [BROTHERS_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
  },
  // The Wandering Party (13×13): a plain full-HP 4v4 on the default corner blocks. The
  // only twist is skinFor, which paints the enemy party in its "wandering" skins so the
  // travelers read as the costumed party the cutscenes describe (board sprites + any
  // dialogue portrait that reads a live unit's skin). skinFor bypasses the account
  // unlock gate on purpose — the player has not earned these skins yet, they are just
  // seeing the wanderers wear them.
  [WANDERING_PARTY_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    skinFor: (unit) => (unit.player === 2 ? "wandering" : unit.skin ?? null),
  },
  [MINER_MISSION_ID]: {
    positions: {
      "p2-0-miner": { ...MINER_ENEMY_SPAWN },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...MINER_PLAYER_SPAWN }
        : { ...MINER_ENEMY_SPAWN },
    fullHp: true,
    tileObjects: minerWallObjects,
  },
  // Has-Been Heroes (13×13): a 4v4 on the default corner blocks — no walls, no fire, no
  // trial. The fat squad fields as itself in the opposite corner, worn down to 20 HP
  // apiece (per the mission's "worn-out"/"a little extra to prove" framing) while the
  // player's squad stays at full HP.
  [HASBEEN_HEROES_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    hpFor: (unit, maxHp) => (unit.player === 2 ? Math.min(20, maxHp) : maxHp),
  },
});

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID) {
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return match;
  const tileObjects = {
    ...(match.tileObjects ?? {}),
    ...(layout.tileObjects?.() ?? {}),
  };
  const units = match.units.map((unit) => {
    const definition = getUnitType(unit.type);
    const maxHp = definition.stats.maxHp;
    return {
      ...unit,
      position: { ...(layout.positions[unit.id] ?? layout.fallback(unit)) },
      hp: layout.hpFor
        ? layout.hpFor(unit, maxHp)
        : layout.fullHp
        ? maxHp
        : Math.ceil(maxHp / 2),
      mp: getInitialMp(definition),
      spent: false,
      defending: false,
      ...(layout.skinFor ? { skin: layout.skinFor(unit) } : {}),
    };
  });
  const trial = layout.prepareTrial?.(match, units) ?? { units, rngState: match.rngState, missionRules: null };
  return {
    ...match,
    currentPlayer: 1,
    activation: null,
    ...(missionId === FATHER_TIME_MISSION_ID
      ? { aiProfile: { fatherTimeCarry: { sourceId: "p2-0-father-time", targetId: "p2-1-archer" } } }
      : missionId === VIRUS_MISSION_ID
      ? { aiProfile: { virusMisfortune: { sourceId: "p2-3-witch-doctor" } } }
      : missionId === MONK_MISSION_ID
      ? { aiProfile: { monkTrialArts: true } }
      : {}),
    tileObjects,
    rngState: trial.rngState,
    ...(trial.missionRules || layout.missionRules
      ? { missionRules: { ...(layout.missionRules?.(match) ?? {}), ...(trial.missionRules ?? {}) } }
      : {}),
    units: [...trial.units, ...(layout.extraUnits?.(match) ?? [])],
  };
}

export function evaluateCampaignMission(missionId, state, meta = {}) {
  const mission = getCampaignMission(missionId);
  const victory = state?.winner === 1;
  const playerUnits = (state?.units ?? []).filter((unit) => unit.player === 1);
  const enemyUnits = (state?.units ?? []).filter((unit) => unit.player === 2);
  const survivingPlayerUnits = playerUnits.filter((unit) => unit.hp > 0).length;
  const allSurvived = victory && survivingPlayerUnits === playerUnits.length;

  // Base objectives shared by every mission; the third star + the bonus are the
  // mission's signature lesson. Only two missions exist, so branch rather than build a
  // premature objective DSL (see MISSION_2 plan's implementation notes).
  const complete = { id: "complete", label: "Complete the mission", earned: victory };
  const survive = { id: "survive", label: "Keep both chosen units alive", earned: allSurvived };

  let objectives;
  let bonusObjectives;
  let extra;
  if (missionId === NECROMANCER_MISSION_ID) {
    const cleanseUsed = Boolean(meta.cleanseUsed);
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    objectives = [
      complete,
      survive,
      { id: "cleansed", label: "Win after curing a status with a cleanse", earned: victory && cleanseUsed },
    ];
    bonusObjectives = [
      { id: "spread", label: "Bonus: never let a status spread between your units", earned: victory && spreadHitCount === 0 },
    ];
    extra = {
      cleanseUsed,
      spreadHitCount,
      necromancerDefeated: Boolean((enemyUnits.find((unit) => unit.type === "necromancer") ?? { hp: 0 }).hp <= 0),
    };
  } else if (missionId === WITCH_DOCTOR_MISSION_ID) {
    const ghoulsDefeatedCount = Math.max(0, Math.floor(Number(meta.ghoulsDefeatedCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const ghoulBiteTakenCount = Math.max(0, Math.floor(Number(meta.ghoulBiteTakenCount) || 0));
    const blackDeathDanceUsed = Boolean(meta.blackDeathDanceUsed);
    const witchDoctor = enemyUnits.find((unit) => unit.type === "witch-doctor") ?? null;
    objectives = [
      complete,
      { id: "ghoulCleared", label: "Defeat at least one Ghoul", earned: victory && ghoulsDefeatedCount >= 1 },
      { id: "unscathed", label: "Avoid fire damage and Ghoul Bite hits", earned: victory && fireDamageTakenCount === 0 && ghoulBiteTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "noBlackDeath", label: "Bonus: win before Black Death Dance resolves", earned: victory && !blackDeathDanceUsed },
    ];
    extra = {
      witchDoctorDefeated: Boolean(witchDoctor && witchDoctor.hp <= 0),
      ghoulsDefeatedCount,
      fireDamageTakenCount,
      ghoulBiteTakenCount,
      blackDeathDanceUsed,
    };
  } else if (missionId === FATHER_TIME_MISSION_ID) {
    const archer = enemyUnits.find((unit) => unit.type === "archer") ?? null;
    const archerDefeatedBeforeFatherTime = Boolean(meta.archerDefeatedBeforeFatherTime);
    const archerBlinded = Boolean(meta.archerBlinded) ||
      Boolean(archer?.statuses?.some((status) => status.type === "blind"));
    const rewindUsed = Boolean(meta.rewindUsed);
    const fatherTime = enemyUnits.find((unit) => unit.type === "father-time") ?? null;
    objectives = [
      { id: "survive", label: "Lose no units", earned: allSurvived },
      { id: "archerFirst", label: "Defeat the Archer before Father Time", earned: victory && archerDefeatedBeforeFatherTime },
      { id: "noRewind", label: "Prevent Rewind from happening", earned: victory && !rewindUsed },
    ];
    bonusObjectives = [
      { id: "blindArcher", label: "Bonus: blind the Archer", earned: victory && archerBlinded },
    ];
    extra = {
      fatherTimeDefeated: Boolean(fatherTime && fatherTime.hp <= 0),
      archerDefeated: Boolean(archer && archer.hp <= 0),
      archerDefeatedBeforeFatherTime,
      archerBlinded,
      rewindUsed,
    };
  } else if (missionId === VIRUS_MISSION_ID) {
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    const draftedMystic = playerUnits.some((unit) => unit.type === "mystic");
    const draftedWitchDoctor = playerUnits.some((unit) => unit.type === "witch-doctor");
    const virusesDefeated = enemyUnits.filter((unit) => unit.type === "virus" && unit.hp <= 0).length;
    const witchDoctor = enemyUnits.find((unit) => unit.type === "witch-doctor") ?? null;
    objectives = [
      complete,
      { id: "noSpread", label: "Prevent Virus Spread from happening", earned: victory && spreadHitCount === 0 },
      { id: "draftMystic", label: "Draft Mystic into your squad", earned: victory && draftedMystic },
    ];
    bonusObjectives = [
      { id: "mysticWitchDoctor", label: "Bonus: win with Mystic and Witch Doctor together", earned: victory && draftedMystic && draftedWitchDoctor },
    ];
    extra = {
      spreadHitCount,
      draftedMystic,
      draftedWitchDoctor,
      virusesDefeated,
      witchDoctorDefeated: Boolean(witchDoctor && witchDoctor.hp <= 0),
    };
  } else if (missionId === PALADIN_MISSION_ID) {
    const paladinLightseekerDamageTakenCount = Math.max(0, Math.floor(Number(meta.paladinLightseekerDamageTakenCount) || 0));
    const paladinStatusAttempted = Boolean(meta.paladinStatusAttempted);
    const duelist = playerUnits[0] ?? null;
    const draftedMelee = Boolean(duelist && getUnitType(duelist.type).classType === "melee");
    const paladin = enemyUnits.find((unit) => unit.type === "paladin") ?? null;
    objectives = [
      complete,
      { id: "noLightseeker", label: "Avoid Lightseeker damage", earned: victory && paladinLightseekerDamageTakenCount === 0 },
      { id: "noStatus", label: "Do not try status effects on the Paladin", earned: victory && !paladinStatusAttempted },
    ];
    bonusObjectives = [
      { id: "meleeDuel", label: "Bonus: win the challenge with a melee unit", earned: victory && draftedMelee },
    ];
    extra = {
      paladinDefeated: Boolean(paladin && paladin.hp <= 0),
      paladinLightseekerDamageTakenCount,
      paladinStatusAttempted,
      draftedMelee,
    };
  } else if (missionId === MONK_MISSION_ID) {
    const monkBlindAttempted = Boolean(meta.monkBlindAttempted);
    const monkFakeKilledBeforeReal = Boolean(meta.monkFakeKilledBeforeReal);
    const realMonk = enemyUnits.find((unit) => unit.trialRealMonk) ??
      enemyUnits.find((unit) => unit.id === state?.missionRules?.monkTrial?.realMonkId) ??
      null;
    const fakeMonksDefeated = enemyUnits.filter((unit) => unit.trialFakeMonk && unit.hp <= 0).length;
    objectives = [
      complete,
      { id: "survive", label: "Lose no party members", earned: allSurvived },
      { id: "noBlind", label: "Do not try to blind any Monk", earned: victory && !monkBlindAttempted },
    ];
    bonusObjectives = [
      { id: "realFirst", label: "Bonus: defeat the real Monk before any fake Monk", earned: victory && !monkFakeKilledBeforeReal },
    ];
    extra = {
      realMonkDefeated: Boolean(realMonk && realMonk.hp <= 0),
      fakeMonksDefeated,
      monkBlindAttempted,
      monkFakeKilledBeforeReal,
    };
  } else if (missionId === GARGOYLE_MISSION_ID) {
    const gargoylePyroclasmDamageTakenCount = Math.max(0, Math.floor(Number(meta.gargoylePyroclasmDamageTakenCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const gargoyleEnteredRage = Boolean(meta.gargoyleEnteredRage);
    const gargoyle = enemyUnits.find((unit) => unit.type === "gargoyle") ?? null;
    objectives = [
      complete,
      { id: "noPyroclasm", label: "Avoid Pyroclasm damage", earned: victory && gargoylePyroclasmDamageTakenCount === 0 },
      { id: "noFire", label: "Avoid fire space damage", earned: victory && fireDamageTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "preRageKill", label: "Bonus: defeat the Gargoyle before Volcanic Rage", earned: victory && !gargoyleEnteredRage },
    ];
    extra = {
      gargoyleDefeated: Boolean(gargoyle && gargoyle.hp <= 0),
      gargoylePyroclasmDamageTakenCount,
      fireDamageTakenCount,
      gargoyleEnteredRage,
    };
  } else if (missionId === WANDERING_PARTY_MISSION_ID) {
    // A friendly duel with no puzzle: winning is the whole objective. All three stars are
    // tied to the win so a victory is a flat 3/3, and there is no bonus objective.
    objectives = [
      { id: "complete", label: "Win the friendly challenge", earned: victory },
      { id: "bestParty", label: "Best all four wanderers", earned: victory },
      { id: "costume", label: "Earn the traveler's costume", earned: victory },
    ];
    bonusObjectives = [];
    extra = { rewardSkinPack: mission?.rewardSkinPack ?? WANDERING_PARTY_SKIN_PACK };
  } else if (missionId === HASBEEN_HEROES_MISSION_ID) {
    // Win / take no Fart displacement (blocked-shove) true damage / keep everyone alive.
    // Bonus: field the original starter four (Swordsman, Archer, Mystic, Magician).
    const fartDisplacementDamageTakenCount = Math.max(0, Math.floor(Number(meta.fartDisplacementDamageTakenCount) || 0));
    const playerTypes = new Set(playerUnits.map((unit) => unit.type));
    const broughtStarterSquad = STARTER_UNIT_TYPES.every((type) => playerTypes.has(type));
    objectives = [
      complete,
      { id: "noFartShove", label: "Take no Fart displacement damage", earned: victory && fartDisplacementDamageTakenCount === 0 },
      survive,
    ];
    bonusObjectives = [
      { id: "starterSquad", label: "Bonus: bring the original starter four", earned: victory && broughtStarterSquad },
    ];
    extra = {
      fartDisplacementDamageTakenCount,
      broughtStarterSquad,
      rewardSkinPack: mission?.rewardSkinPack ?? HASBEEN_MYSTIC_SKIN_PACK,
      fatSquadDefeated: enemyUnits.filter((unit) => HASBEEN_HEROES_FAT_TYPES.includes(unit.type) && unit.hp <= 0).length,
    };
  } else if (missionId === SNIPER_MISSION_ID) {
    const wallDestroyedCount = Math.max(0, Math.floor(Number(meta.wallDestroyedCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const sniper = enemyUnits.find((unit) => unit.type === "sniper") ?? null;
    const sniperBlinded = Boolean(meta.sniperBlinded) ||
      Boolean(sniper?.statuses?.some((status) => status.type === "blind"));
    objectives = [
      complete,
      { id: "wallBreak", label: "Destroy a wall tile", earned: victory && wallDestroyedCount >= 1 },
      { id: "noFire", label: "Avoid fire damage", earned: victory && fireDamageTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "blindSniper", label: "Bonus: blind the Sniper", earned: victory && sniperBlinded },
    ];
    extra = {
      sniperDefeated: Boolean(sniper && sniper.hp <= 0),
      wallDestroyedCount,
      fireDamageTakenCount,
      sniperBlinded,
    };
  } else if (missionId === MINER_MISSION_ID) {
    const minerBlastingCapSplashTakenCount = Math.max(0, Math.floor(Number(meta.minerBlastingCapSplashTakenCount) || 0));
    const minerEnteredRage = Boolean(meta.minerEnteredRage);
    const draftedSniper = playerUnits.some((unit) => unit.type === "sniper");
    const miner = enemyUnits.find((unit) => unit.type === "miner") ?? null;
    objectives = [
      complete,
      { id: "noBlastingCapSplash", label: "Avoid Blasting Cap splash damage", earned: victory && minerBlastingCapSplashTakenCount === 0 },
      { id: "preRageKill", label: "Defeat the Miner before Diamond Harvester", earned: victory && !minerEnteredRage },
    ];
    bonusObjectives = [
      { id: "sniperDuelist", label: "Bonus: bring the Sniper to the duel", earned: victory && draftedSniper },
    ];
    extra = {
      minerDefeated: Boolean(miner && miner.hp <= 0),
      minerBlastingCapSplashTakenCount,
      minerEnteredRage,
      draftedSniper,
    };
  } else if (missionId === BROTHERS_MISSION_ID) {
    // Win / never let one Flamethrower cone catch both your units / kill both before RAGE.
    // Bonus: lose no units. flamethrowerBothHitCount counts single casts (the active ART or
    // the Flamespitter free cone) that damaged two of the player's units at once.
    const flamethrowerBothHitCount = Math.max(0, Math.floor(Number(meta.flamethrowerBothHitCount) || 0));
    const brothersEnteredRage = Boolean(meta.brothersEnteredRage);
    const bigBrother = enemyUnits.find((unit) => unit.type === "big-brother") ?? null;
    const littleBrother = enemyUnits.find((unit) => unit.type === "little-brother") ?? null;
    objectives = [
      complete,
      { id: "noDoubleFlame", label: "Never let Flamethrower catch both your units at once", earned: victory && flamethrowerBothHitCount === 0 },
      { id: "preRageKill", label: "Defeat both brothers before either RAGES", earned: victory && !brothersEnteredRage },
    ];
    bonusObjectives = [
      { id: "survive", label: "Bonus: lose no units", earned: allSurvived },
    ];
    extra = {
      bigBrotherDefeated: Boolean(bigBrother && bigBrother.hp <= 0),
      littleBrotherDefeated: Boolean(littleBrother && littleBrother.hp <= 0),
      flamethrowerBothHitCount,
      brothersEnteredRage,
    };
  } else {
    const clodChargeHitCount = Math.max(0, Math.floor(Number(meta.clodChargeHitCount) || 0));
    const chargeDefended = Boolean(meta.chargeDefended);
    const clod = enemyUnits.find((unit) => unit.type === "clod") ?? null;
    objectives = [
      complete,
      survive,
      { id: "spacing", label: "Have Clod only hit one unit with Thunderous Charge", earned: victory && clodChargeHitCount <= 1 },
    ];
    bonusObjectives = [
      { id: "brace", label: "Bonus: defend against Thunderous Charge", earned: victory && chargeDefended },
    ];
    extra = {
      clodDefeated: Boolean(clod && clod.hp <= 0),
      clodChargeHitCount,
      chargeDefended,
    };
  }

  const earnedObjectiveStars = objectives.filter((objective) => objective.earned).length;
  const earnedBonusStars = bonusObjectives.filter((objective) => objective.earned).length;
  const stars = Math.min(3, earnedObjectiveStars + earnedBonusStars);
  return {
    missionId,
    missionTitle: mission?.title ?? "Campaign Mission",
    victory,
    stars,
    grade: stars === 3 ? "S" : stars === 2 ? "A" : stars === 1 ? "B" : "C",
    objectives,
    bonusObjectives,
    earnedBonusStars,
    rewardUnits: victory ? [...(mission?.rewardUnits ?? [])] : [],
    survivingPlayerUnits,
    totalPlayerUnits: playerUnits.length,
    playerHpRemaining: playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    enemyHpRemaining: enemyUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    ...extra,
  };
}

export function completeCampaignMission(storage = defaultStorage(), missionId, state, meta = {}) {
  const evaluation = evaluateCampaignMission(missionId, state, meta);
  const current = readCampaignProgress(storage);
  if (!evaluation.victory) {
    return { ...evaluation, progress: current, newRewardUnits: [] };
  }

  const completedMissions = new Set(current.completedMissions);
  completedMissions.add(missionId);
  const previousStars = current.missionStars[missionId] ?? 0;
  const progress = writeCampaignProgress(storage, {
    ...current,
    completedMissions: [...completedMissions],
    missionStars: {
      ...current.missionStars,
      [missionId]: Math.max(previousStars, evaluation.stars),
    },
  });

  const unlockProgress = readUnlockProgress(storage);
  const existing = new Set(unlockProgress.unlockedUnits);
  const newRewardUnits = evaluation.rewardUnits.filter((type) => !existing.has(type));
  writeUnlockProgress(storage, {
    ...unlockProgress,
    unlockedUnits: [...existing, ...evaluation.rewardUnits],
  });
  enqueueUnitUnlockAnnouncements(storage, newRewardUnits);

  return { ...evaluation, progress, newRewardUnits };
}

export function clodMissionOpeningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  const clod = findUnit(state, "p2-0-clod");
  if (!speaker) return [];
  return [
    {
      speakerId: clod?.id,
      text: "This ridge belongs to Clod. Step closer, and the stones will remember you.",
    },
    {
      speakerId: speaker.id,
      text: "Big words for a pile of rocks. We came for the ridge, and we are not leaving empty-handed.",
    },
    {
      speaker: "swordsman",
      text: "Stay spread out. If Clod drops into RAGE, Thunderous Charge punishes anyone standing shoulder to shoulder.",
    },
  ];
}

export function shouldShowClodRageWarning(state, { warningShown = false, chargeUsed = false } = {}) {
  if (warningShown || chargeUsed || state?.phase !== "playing") return false;
  const clod = findUnit(state, "p2-0-clod");
  return Boolean(clod && clod.hp > 0 && clod.hp <= 5);
}

export function clodRageWarningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  if (!speaker) return [];
  const clod = findUnit(state, "p2-0-clod");
  return [
    {
      speakerId: speaker.id,
      text: "Spread out. Clod is in RAGE now, and that charge is coming.",
    },
    {
      speakerId: clod?.id,
      text: "The ridge shakes under Clod's feet. Thunderous Charge is online.",
    },
  ];
}

// --- Mission 2: Necromancer's Gate dialogue -----------------------------------
// The hints let a player derive "physical + spacing + a cure" without naming the
// intended Mystic + Swordsman pairing outright.

function firstLivingPlayerUnit(state) {
  return (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0) ?? null;
}

export function necromancerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  const virus = findUnit(state, "p2-1-virus");
  return [
    {
      speakerId: necromancer?.id,
      text: "The gate drinks magic before it ever lands. Bring spells if you like — they will die quietly at my wall.",
    },
    {
      speakerId: virus?.id,
      text: "And keep your friends close together. Whatever I give one of you, I will happily share with the rest.",
    },
    {
      speakerId: speaker.id,
      text: "Something here punishes crowding, and a curse could hurt worse than any blade. Steel over sorcery — and whatever can lift a curse may matter more than raw damage this time.",
    },
  ];
}

export function shouldShowNecromancerStatusWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function necromancerStatusWarningScript(state) {
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  const speaker = afflicted ?? firstLivingPlayerUnit(state);
  const virus = findUnit(state, "p2-1-virus");
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "It takes hold. Stand shoulder to shoulder and it will leap to whoever is nearest.",
    },
    {
      speakerId: speaker.id,
      text: "Break apart so it can't jump, and cure it before it stacks. Left alone, this rot only gets worse.",
    },
  ];
}

export function shouldShowNecromancerSummonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
}

export function necromancerSummonWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ghoul = (state?.units ?? []).find((unit) => unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
  if (!speaker) return [];
  return [
    {
      speakerId: ghoul?.id,
      text: "A ghoul claws its way up from the stones.",
    },
    {
      speakerId: speaker.id,
      text: "The ghoul isn't the win — the caster is. But it'll gnaw at anyone who lingers beside it, so don't camp next to it.",
    },
  ];
}

export function shouldShowNecromancerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const necromancer = findUnit(state, "p2-0-necromancer");
  return Boolean(necromancer && necromancer.hp > 0 && necromancer.hp <= 5);
}

export function necromancerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  return [
    {
      speakerId: necromancer?.id,
      text: "Cornered, am I? Then the gate's shadow spreads — and my bomb reaches farther than it did.",
    },
    {
      speakerId: speaker.id,
      text: "Its aura just widened and Dark Bomb will catch more ground now. Don't dawdle in the dark — finish it.",
    },
  ];
}

// --- Mission 3: Cursed Swamp dialogue ----------------------------------------
// These hints point at the level's actual lesson: body-blocked physical shots,
// fire lanes, Ghoul proximity, and the Witch Doctor's RAGE dance.

export function witchDoctorMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Careful where you step. The flame and I go way back, and the swamp remembers its friends.",
    },
    {
      speakerId: speaker.id,
      text: "Those things are standing shoulder to shoulder. A straight shot will not always find a straight line.",
    },
  ];
}

export function shouldShowWitchDoctorFireWarning(state, { warningShown = false, fireDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(fireDamageTakenCount) || 0)) > 0;
}

export function witchDoctorFireWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "The swamp burns anyone careless, but he barely flinches. The fire is not hurting both sides equally.",
    },
    {
      speakerId: witchDoctor?.id,
      text: "Old friends do not bite.",
    },
  ];
}

export function shouldShowWitchDoctorBlockedShotWarning(state, { warningShown = false, blockedShotQueued = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Boolean(blockedShotQueued);
}

export function witchDoctorBlockedShotWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "An arrow does not turn corners. A wider spread might not care what is standing in the way.",
    },
  ];
}

export function shouldShowWitchDoctorGhoulWarning(state, { warningShown = false, ghoulBiteTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(ghoulBiteTakenCount) || 0)) > 0;
}

export function witchDoctorGhoulWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "They get meaner up close. Keep distance unless you are ready to pay for the tile.",
    },
  ];
}

export function shouldShowWitchDoctorRageWarning(state, { warningShown = false, blackDeathDanceUsed = false } = {}) {
  if (warningShown || blackDeathDanceUsed || state?.phase !== "playing") return false;
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return Boolean(witchDoctor && witchDoctor.hp > 0 && witchDoctor.hp <= 5);
}

export function witchDoctorRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Now the swamp dances with me. One more step and everything goes dark.",
    },
    {
      speakerId: speaker.id,
      text: "Black Death is coming if this drags on. Finish the duel before he gets another dance.",
    },
  ];
}

// --- Mission 4: Timeless Woods dialogue --------------------------------------
// Father Time's enemy plan is intentionally readable: make the Archer bigger with
// Age, then threaten Rewind once RAGE unlocks.

export function fatherTimeMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const fatherTime = findUnit(state, "p2-0-father-time");
  const archer = findUnit(state, "p2-1-archer");
  return [
    {
      speakerId: fatherTime?.id,
      text: "The woods remember every arrow ever loosed here. Mine has not been fired yet.",
    },
    {
      speakerId: archer?.id,
      text: "Give me a little time, old man, and I will make one shot count for all of them.",
    },
    {
      speakerId: speaker.id,
      text: "Watch the buffs. Age can stack +1 STR or +1 DEF on an ally, or drain one of ours, and it lasts until Father Time falls.",
    },
    {
      speaker: "swordsman",
      text: "If Father Time drops into RAGE, Rewind can revive a fallen ally nearby. Decide whether to break the Archer first or end the clock.",
    },
  ];
}

export function shouldShowFatherTimeRageWarning(state, { warningShown = false, rewindUsed = false } = {}) {
  if (warningShown || rewindUsed || state?.phase !== "playing") return false;
  const fatherTime = findUnit(state, "p2-0-father-time");
  return Boolean(fatherTime && fatherTime.hp > 0 && fatherTime.hp <= 5);
}

export function fatherTimeRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const fatherTime = findUnit(state, "p2-0-father-time");
  return [
    {
      speakerId: fatherTime?.id,
      text: "A broken hour is still an hour. RAGE opens the way backward.",
    },
    {
      speakerId: speaker.id,
      text: "Rewind is live now. If the Archer falls while Father Time survives, he can bring her back.",
    },
  ];
}

// --- Mission 5: Root of the Virus dialogue ------------------------------------
// A normal duel with a nasty status engine: the opening sells the opposing squad,
// then two small beats react to the first poison and the player's first status hit.

export function virusMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const witchDoctor = findUnit(state, "p2-3-witch-doctor");
  const virus = findUnit(state, "p2-0-virus");
  return [
    {
      speakerId: witchDoctor?.id,
      text: "The root is awake. Every little virus in this marsh knows the dance.",
    },
    {
      speakerId: virus?.id,
      text: "One cough, one curse, one careless huddle. That is all it takes.",
    },
    {
      speakerId: speaker.id,
      text: "Then we keep our spacing, watch the poison, and make the root taste its own medicine.",
    },
  ];
}

export function shouldShowVirusPoisonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some((status) => status.type === "poison"));
}

export function virusPoisonWarningScript(state) {
  const poisoned = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some((status) => status.type === "poison"));
  const speaker = poisoned ?? firstLivingPlayerUnit(state);
  const virus = (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "virus" && unit.hp > 0);
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "There it is. Let it bloom, and it will not stay lonely.",
    },
    {
      speakerId: speaker.id,
      text: "Poisoned. Break apart before Spread carries it through the line.",
    },
  ];
}

export function shouldShowVirusEnemyStatusTaunt(state, { warningShown = false, playerAfflictedEnemyStatus = false } = {}) {
  if (warningShown || !playerAfflictedEnemyStatus || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function virusEnemyStatusTauntScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 2 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "A taste of your own medicine.",
    },
    {
      speakerId: afflicted?.id,
      text: "The root does not like bitter flavors.",
    },
  ];
}

// --- Mission 6: Wandering Paladin dialogue ------------------------------------
// The map cutscene introduces the traveler; these in-battle beats react to the
// Paladin's kit as the duel unfolds.

export function paladinMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const paladin = findUnit(state, "p2-0-paladin");
  return [
    {
      speakerId: paladin?.id,
      text: "One champion against one Paladin. Win, and I join your march as gladly as I drew my blade.",
    },
    {
      speakerId: speaker.id,
      text: "Then let's find out if worthy travels both ways.",
    },
  ];
}

export function shouldShowPaladinLightseekerWarning(state, { warningShown = false, lightseekerDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(lightseekerDamageTakenCount) || 0)) > 0;
}

export function paladinLightseekerWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "Lightseeker finds anyone standing where the light approves. Convenient, is it not?",
    },
    {
      speakerId: speaker.id,
      text: "Light spaces are not just decoration. Step off them or make him pay before he casts again.",
    },
  ];
}

export function shouldShowPaladinStatusTaunt(state, { warningShown = false, statusAttempted = false } = {}) {
  if (warningShown || !statusAttempted || state?.phase !== "playing") return false;
  const paladin = findUnit(state, "p2-0-paladin");
  return Boolean(paladin && paladin.hp > 0);
}

export function paladinStatusTauntScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "Chosen protects me from little status tricks. Poison, silence, blind, slow, stun -- all very dramatic, all wasted.",
    },
    {
      speakerId: speaker.id,
      text: "Fine. No shortcuts. We beat him straight up.",
    },
  ];
}

export function shouldShowPaladinRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const paladin = findUnit(state, "p2-0-paladin");
  return Boolean(paladin && paladin.hp > 0 && paladin.hp <= 5);
}

export function paladinRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "RAGE opens Heaven's Realm. Brace yourself -- I am about to bring the heat.",
    },
    {
      speakerId: speaker.id,
      text: "Now he hits light AND dark tiles -- Darkseeker reaches the whole board. There is no safe tile. Rush him down fast.",
    },
  ];
}

export function paladinDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin") ?? (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "paladin");
  return [
    {
      speakerId: paladin?.id,
      speaker: "paladin",
      text: "Enough. You are worthy, and a vow is a vow. I will join you.",
    },
    ...(speaker ? [{
      speakerId: speaker.id,
      text: "Welcome to the party.",
    }] : []),
  ];
}

// --- Mission 7: Temple Trial dialogue -----------------------------------------
// The combat board stages the trick in the opening: one centered Monk greets the
// party, then line actions reveal the squad, move the Monk to the corner, and split
// the four bodies into their shuffled combat positions.

export function monkMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const realMonk = (state?.units ?? []).find((unit) => unit.trialRealMonk) ??
    (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "monk");
  if (!speaker) return [];
  return [
    {
      speaker: "monk",
      text: "The temple is quiet. Too quiet. I sense a disturbance of my peace.",
      afterAction: "monkIntroRevealAndMove",
    },
    {
      speakerId: speaker.id,
      text: "That would be us.",
    },
    {
      speakerId: realMonk?.id,
      text: "! Then prove you are worthy to enter. Find the real Monk, or leave the temple path.",
      afterAction: "monkIntroSplitShuffle",
    },
    {
      speaker: "swordsman",
      text: "Four of him. Of course there are four of him.",
    },
    {
      speaker: "swordsman",
      text: "This is a test of combat knowledge as much as combat strength. Watch closely once the trial begins.",
    },
  ];
}

// --- Mission 7.5: Mechs on the Farm dialogue ----------------------------------
// The mech brothers are mid-argument when the party arrives. The party's attempt to
// mediate makes both of them turn on the strangers instead, calling a temporary truce.
// Each brother gets its own one-time RAGE line; a make-up beat plays after the win,
// before the results screen (mirrors paladinDefeatScript / minerDefeatScript).

function brotherUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}

export function brothersMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const big = brotherUnit(state, "big-brother");
  const little = brotherUnit(state, "little-brother");
  return [
    { speakerId: big?.id, text: "You NEVER hold your lane, Little Brother. I said the west field was MINE. West. Field." },
    { speakerId: little?.id, text: "Because you hog the whole farm, Big Brother! Your dumb magnet yanks every shot I take off target!" },
    { speakerId: big?.id, text: "Oh, here we go. It is ALWAYS the magnet with you." },
    { speakerId: speaker.id, text: "Hey -- hey! Easy, both of you. Maybe just... take turns? Talk it out before you flatten the whole farm?" },
    { speakerId: little?.id, text: "...Who asked YOU?" },
    { speakerId: big?.id, text: "Stay out of it. This is a BROTHER thing. You would not get it." },
    { speakerId: little?.id, text: "Truce, Big Brother. Just till we scrap these nosy strangers." },
    { speakerId: big?.id, text: "Agreed. Strangers first. Then I win the argument." },
  ];
}

export function shouldShowBrothersRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  const unit = brotherUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

const BROTHERS_RAGE_LINES = Object.freeze({
  "big-brother": "ROGUE MECH ONLINE! No more holding back -- MY magnet, MY field, MY rules!",
  "little-brother": "Flamespitter's lit! Everybody's getting toasted -- and you two are first!",
});

export function brothersRageWarningScript(state, type) {
  const unit = brotherUnit(state, type);
  const text = BROTHERS_RAGE_LINES[type];
  if (!unit || !text) return [];
  return [{ speakerId: unit.id, text }];
}

export function brothersDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const big = brotherUnit(state, "big-brother");
  const little = brotherUnit(state, "little-brother");
  return [
    { speakerId: big?.id, speaker: "big-brother", text: "*sparks* ...ow. Okay. Okay, we lost. Little Brother, you still running?" },
    { speakerId: little?.id, speaker: "little-brother", text: "Barely. ...Big Brother, I'm sorry I yelled about the magnet. You held the west field good. Real good." },
    { speakerId: big?.id, speaker: "big-brother", text: "...And I hogged the whole farm. Split it down the middle? You take the fields, I take the barn." },
    { speakerId: little?.id, speaker: "little-brother", text: "Deal. DEAL! ...We really did wreck the place, huh." },
    ...(speaker ? [{ speakerId: speaker.id, text: "There it is. Come on -- help us mend these fences, and we could use two mechs who actually get along." }] : []),
  ];
}

// --- Mission 8: Gargoyle's Inferno dialogue -----------------------------------
// The map cutscene gets the party into the ruin; the battle script reveals the
// guardian and the one-shot RAGE warning rides before Volcanic Rage's free Pyroclasm.

export function gargoyleMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  return [
    {
      speakerId: gargoyle?.id,
      text: "You should never have entered my ruins. Stone remembers trespass, and flame remembers flesh.",
    },
    {
      speakerId: speaker.id,
      text: "Good. A talking statue in a tiny murder basement. That is about what I expected.",
    },
    {
      speakerId: gargoyle?.id,
      text: "You will be trapped in flame forever. My fire will crisp you up until even your shadow begs to leave.",
    },
    {
      speakerId: speaker.id,
      text: "Then I had better make this quick.",
    },
  ];
}

export function shouldShowGargoyleRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  return Boolean(gargoyle && gargoyle.hp > 0 && gargoyle.hp <= 5);
}

export function gargoyleRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  if (!speaker) return [];
  return [
    {
      speakerId: gargoyle?.id,
      text: "ARRRRGH! The inferno wakes with me!",
    },
    {
      speakerId: speaker.id,
      text: "Volcanic Rage. Pyroclasm is about to erupt for free -- move if you can, end it if you cannot.",
    },
  ];
}

// --- Mission 9: The High Ground of the Sniper dialogue ------------------------
// Standard duel banter: the enemy marksman lords the high cliffs, Clod holds the low
// road, and the Archer answers. The one mid-battle beat reminds the player the cliff
// fire is permanent so it reads as terrain to route around, not a passing hazard.

export function sniperMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const sniper = findUnit(state, "p2-0-sniper");
  const clod = findUnit(state, "p2-1-clod");
  return [
    {
      speakerId: sniper?.id,
      text: "I can see the whole plateau from up here. You picked a bad hill to climb.",
    },
    {
      speakerId: clod?.id,
      text: "Clod holds the low road. The sniper holds the high one. You hold nothing.",
    },
    {
      speakerId: speaker.id,
      text: "High ground cuts both ways. Break their cover, mind the flame, and I'll put a shaft through that scope.",
    },
  ];
}

export function shouldShowSniperFireWarning(state, { warningShown = false, fireDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(fireDamageTakenCount) || 0)) > 0;
}

export function sniperFireWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "These fires don't burn out -- they're part of the cliffs. Route around them, not through them.",
    },
  ];
}

// --- Mission 11: Dug Your Own Grave dialogue ----------------------------------
// The overworld beat handles the volunteer getting sealed in; the battle dialogue
// stays coy about the best unit choice and lets the board reveal the digging puzzle.

export function minerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const miner = findUnit(state, "p2-0-miner");
  return [
    {
      speakerId: miner?.id,
      text: "You are stuck down here unless I show you the way out. Trouble is, I do not trust boots I did not invite.",
    },
    {
      speakerId: speaker.id,
      text: "Then we settle this quickly, and you can decide how much you like fresh air.",
    },
  ];
}

export function shouldShowMinerBlastingCapSplashWarning(state, { warningShown = false, minerBlastingCapSplashTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(minerBlastingCapSplashTakenCount) || 0)) > 0;
}

export function minerBlastingCapSplashWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner");
  if (!speaker) return [];
  return [
    {
      speakerId: miner?.id,
      text: "Blasting caps have a sense of humor in tight tunnels.",
    },
    {
      speakerId: speaker.id,
      text: "The echo hits almost as hard as the blast.",
    },
  ];
}

export function shouldShowMinerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const miner = findUnit(state, "p2-0-miner");
  return Boolean(miner && miner.hp > 0 && miner.hp <= 5);
}

export function minerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner");
  if (!speaker) return [];
  return [
    {
      speakerId: miner?.id,
      text: "Diamonds in the dark. Ore in the walls. I can hear every glittering vein singing.",
    },
    {
      speakerId: speaker.id,
      text: "He just found a second wind. End this before the mine starts answering him.",
    },
  ];
}

export function minerDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner") ?? (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "miner");
  return [
    {
      speakerId: miner?.id,
      speaker: "miner",
      text: "All right. Pickaxe down. I will get you out of here.",
    },
    ...(speaker ? [{
      speakerId: speaker.id,
      text: "You know the way?",
    }] : []),
    {
      speakerId: miner?.id,
      speaker: "miner",
      text: "I dug half of it. Besides, I could use some air.",
    },
  ];
}

// --- Mission 12: Has-Been Heroes dialogue -------------------------------------
// A friendly town brawl. The opening lets all four fat members chime in; each has a
// one-time RAGE popup (progression is NOT gated on it — the player is meant to avoid
// letting them rage); the completion beat plays before the results screen.

function fatSquadUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}

export function hasbeenHeroesMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return unit ? { speakerId: unit.id, text } : null;
  };
  return [
    line("fat-knight", "Fine, FINE, we do this the hard way. Nobody gets past ME."),
    line("fat-bowman", "Can we make it quick? I have a nap scheduled."),
    line("fat-cleric", "Beat them fast so we can find a tavern. I am running dangerously low on snacks."),
    line("fat-wizard", "*hic* I found my staff! It was in my other... my other hand. Okay. Magic time."),
    { speakerId: speaker.id, text: "Watch the big one's Fart — if he shoves you into a wall or a body, it hurts. Keep room behind you." },
  ].filter(Boolean);
}

export function shouldShowHasbeenFatRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  const unit = fatSquadUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

const HASBEEN_FAT_RAGE_LINES = Object.freeze({
  "fat-knight": "RAAAGH! Okay, NOW I'm awake! You woke the knight!",
  "fat-bowman": "Nap's cancelled. You are going to regret cancelling my nap.",
  "fat-cleric": "So... hungry... anger is a food group now, right? RIGHT?",
  "fat-wizard": "*hic* Everything's spinning and I am FURIOUS about it!",
});

export function hasbeenFatRageWarningScript(state, type) {
  const unit = fatSquadUnit(state, type);
  const text = HASBEEN_FAT_RAGE_LINES[type];
  if (!unit || !text) return [];
  return [{ speakerId: unit.id, text }];
}

export function hasbeenHeroesDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return { speakerId: unit?.id, speaker: type, text };
  };
  return [
    line("fat-knight", "*panting* This... this isn't over. You haven't seen the last of us."),
    line("fat-cleric", "Soooo hungry... did we win? We didn't win, did we..."),
    line("fat-bowman", "I'm going back to my nap. Do NOT follow us."),
    line("fat-wizard", "*hic* Great job everyone. To the next castle. Or... a tavern. Tavern first."),
    ...(speaker ? [{ speakerId: speaker.id, text: "...I almost feel bad for them. Almost." }] : []),
  ];
}

// Dispatcher so the match seam can ask for a mission's opening without a per-mission
// branch of its own.
export function campaignOpeningScript(missionId, state) {
  if (missionId === HASBEEN_HEROES_MISSION_ID) return hasbeenHeroesMissionOpeningScript(state);
  if (missionId === MINER_MISSION_ID) return minerMissionOpeningScript(state);
  if (missionId === SNIPER_MISSION_ID) return sniperMissionOpeningScript(state);
  if (missionId === GARGOYLE_MISSION_ID) return gargoyleMissionOpeningScript(state);
  if (missionId === BROTHERS_MISSION_ID) return brothersMissionOpeningScript(state);
  if (missionId === MONK_MISSION_ID) return monkMissionOpeningScript(state);
  if (missionId === PALADIN_MISSION_ID) return paladinMissionOpeningScript(state);
  if (missionId === VIRUS_MISSION_ID) return virusMissionOpeningScript(state);
  if (missionId === FATHER_TIME_MISSION_ID) return fatherTimeMissionOpeningScript(state);
  if (missionId === WITCH_DOCTOR_MISSION_ID) return witchDoctorMissionOpeningScript(state);
  if (missionId === NECROMANCER_MISSION_ID) return necromancerMissionOpeningScript(state);
  if (missionId === CLOD_MISSION_ID) return clodMissionOpeningScript(state);
  return [];
}
