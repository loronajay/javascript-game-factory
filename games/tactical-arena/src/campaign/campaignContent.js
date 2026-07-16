import {
  CAMPAIGN_PROGRESS_KEY,
  CLOD_MISSION_ID,
  NECROMANCER_MISSION_ID,
  WITCH_DOCTOR_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  VIRUS_MISSION_ID,
  PALADIN_MISSION_ID,
  MONK_MISSION_ID,
  BROTHERS_MISSION_ID,
  GARGOYLE_MISSION_ID,
  SNIPER_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  MINER_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  RONIN_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  VOID_CASTLE_ENEMY_TYPES,
  FINAL_BATTLE_MISSION_ID,
  FINAL_BATTLE_BOARD_SIZE,
  BROTHERS_UNIT_PACK,
  WANDERING_PARTY_SKIN_PACK,
  HASBEEN_MYSTIC_SKIN_PACK,
  HASBEEN_HEROES_FAT_TYPES,
  SHOWDOWN_FAT_TYPES,
  NOT_MY_KING_ENEMY_TYPES,
  VOIDWOOD_SKIN_REWARDS,
  WITCH_DOCTOR_BOARD_SIZE,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  MIN_CAMPAIGN_SQUAD_SIZE,
  MAX_CAMPAIGN_SQUAD_SIZE,
  MAX_CAMPAIGN_MISSIONS,
} from "./campaignConstants.js";
import { DEFAULT_SQUAD } from "../ui/squadModel.js";
import { OUT_OF_RETIREMENT_SKIN_REWARDS } from "../progression/unlocks.js";
import { computeCampaignGeometry, computeRegionBoxes } from "./campaignMap.js";

export const CAMPAIGN_VALOR_REWARDS = Object.freeze({
  [CLOD_MISSION_ID]: 55,
  [NECROMANCER_MISSION_ID]: 60,
  [WITCH_DOCTOR_MISSION_ID]: 65,
  [FATHER_TIME_MISSION_ID]: 70,
  [VIRUS_MISSION_ID]: 75,
  [PALADIN_MISSION_ID]: 80,
  [MONK_MISSION_ID]: 90,
  [BROTHERS_MISSION_ID]: 105,
  [GARGOYLE_MISSION_ID]: 120,
  [SNIPER_MISSION_ID]: 135,
  [WANDERING_PARTY_MISSION_ID]: 150,
  [MINER_MISSION_ID]: 165,
  [HASBEEN_HEROES_MISSION_ID]: 180,
  [RONIN_MISSION_ID]: 195,
  [WRONG_PLACE_MISSION_ID]: 210,
  [OUT_OF_RETIREMENT_MISSION_ID]: 230,
  [VOIDWOOD_MISSION_ID]: 250,
  [SPIRIT_WOODS_MISSION_ID]: 270,
  [SHOWDOWN_MISSION_ID]: 295,
  [NOT_MY_KING_MISSION_ID]: 320,
  [VOID_CASTLE_MISSION_ID]: 350,
  [FINAL_BATTLE_MISSION_ID]: 405,
});

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
  // scorch both; race the brothers' RAGE). A win lets the player recruit ONE brother.
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
    rewardUnits: Object.freeze([]),
    rewardLabel: "Big Brother or Little Brother",
    rewardUnitChoicePack: BROTHERS_UNIT_PACK,
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
  [RONIN_MISSION_ID]: {
    id: RONIN_MISSION_ID,
    title: "Battle for the Bridge",
    subtitle: "A sworn protector bars the island bridge",
    description: "Choose one champion for a 9x9 duel across a narrow bridge against the Ronin. The weather turns strange every two turns, and his Final Draw can make even a winning blow dangerous.",
    unitType: "ronin",
    requiredStars: 24,
    rewardUnits: Object.freeze(["ronin"]),
    playerSlots: 1,
    enemySquad: Object.freeze(["ronin"]),
    size: 9,
    fullHp: true,
  },
  [WRONG_PLACE_MISSION_ID]: {
    id: WRONG_PLACE_MISSION_ID,
    title: "Wrong Place, Wrong Time",
    subtitle: "A burned-out town street, four riot shields, one bad assumption",
    description: "Your starter party is caught near a crime scene and forced into a 7x7 rage duel with four Riot Cops. Everyone is already seeing red, so control the stun guns and set up the Magician's nuke fast.",
    unitType: "riot-cop",
    requiredStars: 26,
    rewardUnits: Object.freeze(["riot-cop"]),
    playerSlots: 4,
    defaultSquad: Object.freeze([...DEFAULT_SQUAD]),
    squadLocked: true,
    enemySquad: Object.freeze(["riot-cop", "riot-cop", "riot-cop", "riot-cop"]),
    enemySkins: Object.freeze([null, "swat-team", "firefighter", "street-patrol"]),
    enemyNicknames: Object.freeze(["John", "Mara", "Brock", "Sunny"]),
    size: 7,
  },
  [OUT_OF_RETIREMENT_MISSION_ID]: {
    id: OUT_OF_RETIREMENT_MISSION_ID,
    title: "Out of Retirement",
    subtitle: "A beachside temple, two retirees, one worthy duel",
    description: "Angel and Paladin have been enjoying the island sun, but the road north needs Angel's help. Bring any two units into a hot-weather 2v2 duel against their summer-vibes forms.",
    unitType: "angel",
    requiredStars: 28,
    rewardUnits: Object.freeze(["angel"]),
    rewardSkins: OUT_OF_RETIREMENT_SKIN_REWARDS,
    rewardLabel: "Angel and two summer looks",
    playerSlots: 2,
    enemySquad: Object.freeze(["angel", "paladin"]),
    enemySkins: Object.freeze(["summer-vibes", "summer-vibes"]),
    size: 7,
    fullHp: true,
  },
  [VOIDWOOD_MISSION_ID]: {
    id: VOIDWOOD_MISSION_ID,
    title: "Voidwood Forest",
    subtitle: "An old guardian stirs beneath void-black branches",
    description: "Bring any four-unit squad into a 9x9 duel against a voidroot Treant, a void-dweller Angel, Witch Doctor, and Necromancer. Ghouls choke the forest floor, but no fire marks their edges this time.",
    unitType: "treant",
    requiredStars: 30,
    rewardUnits: Object.freeze(["treant"]),
    rewardSkins: VOIDWOOD_SKIN_REWARDS,
    rewardLabel: "Treant and the Voidroot Treant skin",
    playerSlots: 4,
    enemySquad: Object.freeze(["treant", "angel", "witch-doctor", "necromancer"]),
    enemySkins: Object.freeze(["voidroot", "void-dweller", "void-dweller", "void-dweller"]),
    size: 9,
    fullHp: true,
  },
  [SPIRIT_WOODS_MISSION_ID]: {
    id: SPIRIT_WOODS_MISSION_ID,
    title: "Spirit of the Woods",
    subtitle: "The forest itself answers the party's call",
    description: "Bring any four-unit squad into an 11x11 duel against Mother Nature, Treant, Clod, and a Gaia-protected Paladin. The old starter squad has a special stake in this fight.",
    unitType: "mother-nature",
    requiredStars: 32,
    requiresPreviousMissionsComplete: true,
    rewardUnits: Object.freeze(["mother-nature"]),
    playerSlots: 4,
    enemySquad: Object.freeze(["mother-nature", "treant", "clod", "paladin"]),
    enemySkins: Object.freeze([null, null, null, "gaia's-protector"]),
    size: 11,
    fullHp: true,
  },
  [SHOWDOWN_MISSION_ID]: {
    id: SHOWDOWN_MISSION_ID,
    title: "The Showdown",
    subtitle: "The pass freezes over as old rivals make their stand",
    description: "Bring any four-unit squad into a standard 11x11 duel against the fat party. The blizzard never lets up, and one clean Footwork through all four enemies can swing the whole pass.",
    unitType: "fat-knight",
    requiredStars: 0,
    requiresPreviousMissionsComplete: true,
    rewardUnits: Object.freeze([...SHOWDOWN_FAT_TYPES]),
    rewardLabel: "Fat Knight, Fat Wizard, Fat Cleric, and Fat Bowman",
    playerSlots: 4,
    enemySquad: Object.freeze([...SHOWDOWN_FAT_TYPES]),
    size: 11,
    fullHp: true,
  },
  [NOT_MY_KING_MISSION_ID]: {
    id: NOT_MY_KING_MISSION_ID,
    title: "Not My King",
    subtitle: "The crown answers with silence and fire",
    description: "Bring any four-unit squad into a 13x13 duel against the void-bound King, Angel, Gargoyle, and Father Time. The heatwave is permanent, every enemy wears a void skin, and the enemy squad moves first.",
    unitType: "king",
    requiredStars: 0,
    requiresPreviousMissionsComplete: true,
    rewardUnits: Object.freeze(["king"]),
    playerSlots: 4,
    enemySquad: Object.freeze([...NOT_MY_KING_ENEMY_TYPES]),
    enemySkins: Object.freeze(["void-dweller", "void-dweller", "void-dweller", "void-dweller"]),
    size: 13,
    fullHp: true,
  },
  // Void Ridden Castle (13×13): the throne room turns out to be the Summoner's trap. A
  // two-part battle — the first in the campaign. Beating the Summoner does not end it;
  // he splits into four and the fight becomes a find-the-real-one puzzle (see the
  // voidCastleTrial rule in turnEngine.js + missions/void-ridden-castle/ghosts.js). The
  // description deliberately does NOT mention the split or the ghost-name tell — both are
  // meant to land as surprises.
  // The Final Battle (11×11 → 5×5 → 11×11): the last stop on the trail, at the void gate
  // itself. A FIVE-stage battle — a confrontation, four mirror duels, then the 4v1 — driven
  // by missions/the-final-battle/stages.js. The description says none of that: the blackout
  // and what walks out of it are the mission. It only warns about the one thing a player
  // genuinely cannot recover from being surprised by (bring fighters — every one of them
  // will have to fight alone), and the King is filtered out of the picker entirely
  // (restrictedUnitTypes), since a non-combatant commander cannot be sent into a solo duel.
  [FINAL_BATTLE_MISSION_ID]: {
    id: FINAL_BATTLE_MISSION_ID,
    title: "The Final Battle",
    subtitle: "The gate is open, and it did not open from this side",
    description: "Bring any four to the void gate. Blacksword is waiting in the middle of it, and he has no intention of being reasoned with. Choose four who can each hold their own — before this is over, every one of them will stand alone.",
    unitType: "blacksword",
    requiredStars: 0,
    requiresPreviousMissionsComplete: true,
    rewardUnits: Object.freeze(["blacksword"]),
    playerSlots: 4,
    enemySquad: Object.freeze(["blacksword"]),
    enemySkins: Object.freeze(["void-dweller"]),
    // The King never draws a weapon. Every party member here has to survive a duel with
    // nobody to command, so he cannot be brought — the picker simply doesn't offer him.
    restrictedUnitTypes: Object.freeze(["king"]),
    size: FINAL_BATTLE_BOARD_SIZE,
    fullHp: true,
  },
  [VOID_CASTLE_MISSION_ID]: {
    id: VOID_CASTLE_MISSION_ID,
    title: "Void Ridden Castle",
    subtitle: "The throne room is not the throne room anymore",
    description: "Bring any four-unit squad into the castle. The Summoner has walled himself into the far corner behind Nemesis, and he chose this ground for a reason. Do not let Nemesis get desperate.",
    unitType: "summoner",
    requiredStars: 0,
    requiresPreviousMissionsComplete: true,
    rewardUnits: Object.freeze(["nemesis"]),
    rewardLabel: "Nemesis",
    playerSlots: 4,
    enemySquad: Object.freeze([...VOID_CASTLE_ENEMY_TYPES]),
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
  { id: CLOD_MISSION_ID, cell: { col: 0, row: 4 }, point: { x: 9.39, y: 88.44 }, region: "ridge", locationName: "Stoneback Ridge" },
  { id: NECROMANCER_MISSION_ID, cell: { col: 1, row: 4 }, point: { x: 19.04, y: 76.93 }, region: "barrow", locationName: "The Old Gate" },
  { id: WITCH_DOCTOR_MISSION_ID, cell: { col: 2, row: 4 }, point: { x: 30.87, y: 87.43 }, region: "mire", locationName: "Mirefen Shallows",
    blurb: "Foul water swallows the causeway. Something chants in the reeds — a witch doctor's dance, they say, that turns your own curses against you." },
  { id: FATHER_TIME_MISSION_ID, cell: { col: 3, row: 4 }, point: { x: 21.45, y: 48.65 }, region: "wood", locationName: "Timeless Woods",
    blurb: "Ancient trees lean over a path where seconds fall like leaves. A clock-crowned keeper waits beside a patient archer." },
  { id: VIRUS_MISSION_ID, cell: { col: 4, row: 4 }, point: { x: 11.23, y: 45.11 }, region: "mire", locationName: "The Viral Root",
    blurb: "Where the swamp drains to the sea, the rot has roots. A poisonous squad waits in the black water." },
  { id: PALADIN_MISSION_ID, cell: { col: 5, row: 4 }, point: { x: 28.72, y: 34.39 }, region: "coast", locationName: "Tidewatch Harbor",
    blurb: "Salt wind and long sightlines. Whoever commands the piers commands the range." },
  { id: MONK_MISSION_ID, cell: { col: 6, row: 4 }, point: { x: 21.33, y: 20.08 }, region: "coast", locationName: "Temple Steps",
    blurb: "A silent temple waits above the tide. Four identical Monks guard the steps, but only one carries the true discipline." },
  { id: BROTHERS_MISSION_ID, cell: { col: 3, row: 1 }, point: { x: 46.07, y: 30.76 }, region: "farm", locationName: "Meadowmill Farm" },
  { id: GARGOYLE_MISSION_ID, cell: { col: 5, row: 3 }, point: { x: 52.25, y: 18.22 }, region: "ashfall", locationName: "Ashfall Flats",
    blurb: "A low ruin mouth exhales heat from beneath the flats. Something stone-winged waits in the old dark." },
  { id: SNIPER_MISSION_ID, cell: { col: 4, row: 3 }, point: { x: 63.36, y: 24.68 }, region: "plateau", locationName: "The High Cliffs",
    blurb: "Flat cliffs and long sightlines. Whoever holds the plateau's height holds every lane across it." },
  { id: WANDERING_PARTY_MISSION_ID, cell: { col: 3, row: 3 }, point: { x: 66.98, y: 36.83 }, region: "ashfall", locationName: "Cinderwood" },
  { id: MINER_MISSION_ID, cell: { col: 2, row: 3 }, point: { x: 56.29, y: 46.73 }, region: "wood", locationName: "Whisperwood Eaves" },
  { id: HASBEEN_HEROES_MISSION_ID, cell: { col: 1, row: 3 }, point: { x: 50.09, y: 58.45 }, region: "town", locationName: "Highmarket" },
  { id: RONIN_MISSION_ID, cell: { col: 0, row: 3 }, point: { x: 56.13, y: 72.44 }, region: "wood", locationName: "Thornhollow Bridge",
    blurb: "Bramble walls and blind corners. Line of sight is a luxury you'll have to earn." },
  { id: WRONG_PLACE_MISSION_ID, cell: { col: 0, row: 2 }, point: { x: 68.55, y: 79.02 }, region: "town", locationName: "Frostcrown Foothills",
    blurb: "The climb begins. Cold slows the blood and the boots — every step of movement counts double." },
  { id: OUT_OF_RETIREMENT_MISSION_ID, cell: { col: 1, row: 2 }, point: { x: 85.73, y: 87.27 }, region: "coast", locationName: "Sunbreak Temple",
    blurb: "A deserted island beach curls around an ancient temple. Someone has been enjoying the quiet a little too much." },
  { id: VOIDWOOD_MISSION_ID, cell: { col: 2, row: 2 }, point: { x: 74.91, y: 63.78 }, region: "wood", locationName: "Voidwood Forest",
    blurb: "Void-black trees crowd the old trail. Something ancient waits where the summit marker used to sit." },
  { id: SPIRIT_WOODS_MISSION_ID, cell: { col: 6, row: 1 }, point: { x: 29.97, y: 56.93 }, region: "wood", locationName: "Spirit Grove",
    blurb: "A quiet forest node waits east of the Timeless Woods. The wind moves here even when the trees do not." },
  { id: SHOWDOWN_MISSION_ID, cell: { col: 3, row: 2 }, point: { x: 79.86, y: 45.19 }, region: "waste", locationName: "The Shattered Waste", requiredStars: 0, requiresPreviousMissionsComplete: true,
    blurb: "Beyond the peaks, a broken country of fallen towers where time itself runs strange." },
  { id: NOT_MY_KING_MISSION_ID, cell: { col: 5, row: 2 }, point: { x: 83.88, y: 30.8 }, region: "waste", locationName: "Ember Crown Rise", requiredStars: 0, requiresPreviousMissionsComplete: true,
    blurb: "A lower painted marker smolders above the shattered waste. The castle can wait; the crown has come to the road." },
  // The painted castle in the snowbound north-east. Its cell (6,0) finally gives the
  // declared-but-unused `frost` region a home, so Frostcrown Peaks reads on the map.
  { id: VOID_CASTLE_MISSION_ID, cell: { col: 6, row: 0 }, point: { x: 86.95, y: 19.13 }, region: "frost", locationName: "Highspire Castle", requiredStars: 0, requiresPreviousMissionsComplete: true,
    blurb: "The kingdom's seat, high in the snow. The walls are still standing. That is the only thing about it that still feels right." },
  // The last painted landmark on the map: the crystal cave in the far-east snowfield, held
  // node-less since the map art was drawn "for the Blacksword finale." This claims it, and
  // with it the trail is complete — every ring on the map is now a real stop.
  { id: FINAL_BATTLE_MISSION_ID, cell: { col: 6, row: 2 }, point: { x: 90.54, y: 45.2 }, region: "frost", locationName: "The Void Gate", requiredStars: 0, requiresPreviousMissionsComplete: true,
    blurb: "A wound of blue light in the rock. It is not a cave. Caves do not hum." },
];

// Extra visual branches on top of the linear spine, so the map reads as a network
// with forks rather than one snaking line. Purely cosmetic — unlock stays star-gated.
const CAMPAIGN_FORKS = [
  [WITCH_DOCTOR_MISSION_ID, MINER_MISSION_ID],
  ["uncharted-06", "uncharted-09"],
  [FATHER_TIME_MISSION_ID, SPIRIT_WOODS_MISSION_ID],
  [WANDERING_PARTY_MISSION_ID, SHOWDOWN_MISSION_ID],
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
    requiredStars: Number.isFinite(stop.requiredStars) ? stop.requiredStars : 4 + (trailIndex - 2) * 2,
    requiresPreviousMissionsComplete: Boolean(stop.requiresPreviousMissionsComplete),
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
      valorReward: CAMPAIGN_VALOR_REWARDS[stop.id] ?? 75,
      requiresPreviousMissionsComplete: Boolean(stop.requiresPreviousMissionsComplete ?? base.requiresPreviousMissionsComplete),
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
export const CAMPAIGN_GEOMETRY = computeCampaignGeometry(CAMPAIGN_MISSIONS);
export const CAMPAIGN_REGION_BOXES = computeRegionBoxes(CAMPAIGN_MISSIONS, CAMPAIGN_REGIONS);
export const REGION_BIOME_BY_ID = new Map(CAMPAIGN_REGIONS.map((region) => [region.id, region.biome]));
