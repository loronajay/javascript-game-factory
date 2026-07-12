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
export const RONIN_MISSION_ID = "battle-for-the-bridge";
export const WRONG_PLACE_MISSION_ID = "wrong-place-wrong-time";
export const OUT_OF_RETIREMENT_MISSION_ID = "out-of-retirement";
export const VOIDWOOD_MISSION_ID = "voidwood-forest";
export const SPIRIT_WOODS_MISSION_ID = "spirit-of-the-woods";
export const SHOWDOWN_MISSION_ID = "the-showdown";
export const NOT_MY_KING_MISSION_ID = "not-my-king";
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
export const SHOWDOWN_FAT_TYPES = Object.freeze(["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"]);
export const NOT_MY_KING_ENEMY_TYPES = Object.freeze(["king", "angel", "gargoyle", "father-time"]);
export const VOIDWOOD_SKIN_REWARDS = Object.freeze([
  Object.freeze({ type: "treant", slug: "voidroot" }),
]);
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
