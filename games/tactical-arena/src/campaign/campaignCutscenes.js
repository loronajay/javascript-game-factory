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
  FINAL_BATTLE_MISSION_ID,
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
import { getUnitType } from "../core/unitCatalog.js";
import { getNicknamePref } from "../ui/nicknameModel.js";
import { UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { readCampaignProgress, writeCampaignProgress, defaultStorage } from "./campaignProgress.js";
import { riotCopLine } from "./missions/sharedDialogue.js";
import { roninDefeatScript } from "./missions/battle-for-the-bridge/dialogue.js";
import { wrongPlaceDefeatScript } from "./missions/wrong-place-wrong-time/dialogue.js";

// The wandering party's dialogue portraits wear their "wandering" skins — the skin is
// declared directly on each line (side/player/name too) since these cutscenes play on the
// overworld map with no live match units to read a skin off of.
const WANDERING_LINE = Object.freeze({ skin: "wandering", side: "right", player: 2 });
function narration(text, extra = {}) {
  return { narration: true, side: "left", text, ...extra };
}

function volunteerType(selectedSquad) {
  return (Array.isArray(selectedSquad) ? selectedSquad : []).find((type) => UNIT_TYPE_KEYS.includes(type)) ?? "swordsman";
}

export function campaignMapCutsceneScript(missionId, selectedSquad = null, { phase = "full" } = {}) {
  // The Final Battle — the walk up to the gate. The Summoner and Nemesis come this far and
  // no further, on purpose: their fight is on the other side, and the party has to be the
  // ones who do this. It also quietly does the job of telling the player that the two of
  // them are still around, so the ending doesn't have to introduce them from nowhere.
  if (missionId === FINAL_BATTLE_MISSION_ID) {
    return [
      narration("The ice thins. Under it, the rock begins to glow — a blue that has never been in a sky."),
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "This is as far as we come." },
      { speaker: "swordsman", side: "left",
        text: "You've been walking behind us for three hundred miles to stop at the door?" },
      { speaker: "nemesis", side: "right", player: 2,
        text: "If we step through that light, he stops being a thing that ran from the void and starts being a thing that RULES it. He would not fight you. He would simply be home." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "He has to be beaten HERE. On your stone, under your sky, with your feet on the ground he is standing on. That was always going to be your half of this." },
      { speaker: "mystic", side: "left",
        text: "Then we'll take our half." },
      narration("Ahead, in the hollow of the crystal, something that is not the light is waiting to be looked at."),
    ];
  }
  // Void Ridden Castle — the pre-mission brief. The party walks into the throne room they
  // fought all campaign to reach and it is subtly, unbearably wrong. The Summoner is
  // already there; the trap already closed behind them. The party's offer of an alliance
  // against Blacksword is genuine, and it is refused — which is precisely why the offer
  // gets accepted in the post-match scene instead, once the Summoner has been broken.
  if (missionId === VOID_CASTLE_MISSION_ID) {
    return [
      { speaker: "king", side: "left",
        text: "The doors are as I left them. The banners are as I left them." },
      { speaker: "king", side: "left",
        text: "And I have never once been cold in this room." },
      narration("The throne room holds its shape, and nothing else. Sound arrives a half-beat late. The light falls without warming anything it lands on."),
      { speaker: "mystic", side: "left",
        text: "This is not a room. It is something wearing the memory of one." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "It is a very good likeness. I studied it for a long while before I built it." },
      { speaker: "swordsman", side: "left",
        text: "He was here. He was here the entire climb." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "You did not fight your way to me. You were walked here. Every road you took, I left open." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "The strongest warriors this land has, gathered into one room of my choosing. Do you understand how rarely that happens? I did not want to hunt you one at a time." },
      { speaker: "mystic", side: "left",
        text: "Then hear us before you close it. We know about Blacksword." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "..." },
      { speaker: "swordsman", side: "left",
        text: "We know he is stronger than you. We know he is stronger than both of you. And we know he is not finished." },
      { speaker: "mystic", side: "left",
        text: "You do not have to spend us. Spend him. Take the help." },
      { speaker: "nemesis", side: "right", player: 2,
        text: "Help. From mortals." },
      { speaker: "nemesis", side: "right", player: 2,
        text: "We will not be given your strength. We will take it. Every one of you goes into the void, and what you were becomes what we are — and that will be enough to end Blacksword without a single favor owed to your kind." },
      { speaker: "king", side: "left",
        text: "I would rather stand beside you than bury you. I have said so plainly, and I will say it once more." },
      { speaker: "king", side: "left",
        text: "But make no mistake about what happens if you refuse. We will put you both down and go to Blacksword ourselves." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "A foolish endeavour. Both halves of it." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "Come, then. Let us find out which of us was wrong." },
    ];
  }
  if (missionId === NOT_MY_KING_MISSION_ID) {
    return [
      { speaker: "treant", side: "left",
        text: "My king, why are you here?" },
      { speaker: "king", skin: "void-dweller", side: "right", player: 2,
        text: "Your king is no more." },
      { speaker: "treant", side: "left",
        text: "!" },
      { speaker: "mystic", side: "left",
        text: "I have heard the void magic say the same thing about Treant." },
      { speaker: "swordsman", side: "left",
        text: "It might be a trap!" },
      narration("A giant inferno blazes over the land."),
      { speaker: "mystic", side: "left",
        text: "The snow... all of it is gone. Nothing but embers and flames." },
      { speaker: "swordsman", side: "left",
        text: "Everyone ready yourselves!" },
    ];
  }
  if (missionId === SHOWDOWN_MISSION_ID) {
    return [
      { speaker: "mother-nature", side: "left",
        text: "I will calm the storm enough for you to cross the pass." },
      { speaker: "mother-nature", side: "left",
        text: "But I cannot go farther. The void spread is clawing at my forest, and I must return to protect it." },
      { speaker: "mystic", side: "left",
        text: "Then we carry on from here. Thank you, Mother Nature." },
      { speaker: "swordsman", side: "left",
        text: "The path is opening. Move before the wind changes its mind." },
      { speaker: "fat-cleric", side: "right", player: 2,
        text: "I cannot feel my toes. I miss feeling my toes. I miss snacks more, but the toes are up there." },
      { speaker: "fat-bowman", side: "right", player: 2,
        text: "If I freeze to death on this pass, bury me somewhere warm. Or near a bakery." },
      { speaker: "fat-wizard", side: "right", player: 2,
        text: "*hic* I told you we should have taken the tavern road. Taverns have walls. And chairs. And mistakes." },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "Quit whining. We are almost-- hey wait a minute look. It's those wannabes!" },
      { speaker: "mystic", side: "left",
        text: "Wannabes?" },
      { speaker: "fat-wizard", side: "right", player: 2,
        text: "We gotta stop these guys, they're going to ruin everything!" },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "Yeah. And we owe these guys a little payback anyways." },
      { speaker: "mystic", side: "left",
        text: "We can't all fit on the pass. We need to make a squad." },
    ];
  }
  if (missionId === SPIRIT_WOODS_MISSION_ID) {
    return [
      { speaker: "swordsman", side: "left",
        text: "Is anyone there?" },
      narration("A gust of wind answers through the branches."),
      { speaker: "mystic", side: "left",
        text: "That was not ordinary wind. Something is awake here." },
      { speaker: "archer", side: "left",
        text: "Then we should get ready before it decides whether we are welcome." },
    ];
  }
  if (missionId === VOIDWOOD_MISSION_ID) {
    return [
      { speaker: "treant", skin: "voidroot", side: "right", player: 2,
        text: "Who wakes me beneath these blackened boughs?" },
      { speaker: "swordsman", side: "left",
        text: "We are seeking the wisdom of the Treant." },
      { speaker: "mystic", side: "left",
        text: "The forest is sick. If anyone remembers how it began, it should be you." },
      { speaker: "treant", skin: "voidroot", side: "right", player: 2,
        text: "The real Treant has been gone since long ago. I am what remains." },
      { speaker: "archer", side: "left",
        text: "Gone? What happened here?" },
      { speaker: "necromancer", skin: "void-dweller", side: "right", player: 2,
        text: "The forest belongs to the void now. You should never have come." },
      { speaker: "angel", skin: "void-dweller", side: "right", player: 2,
        text: "We are going to take you somewhere no one will ever see or hear from you again." },
    ];
  }
  if (missionId === WRONG_PLACE_MISSION_ID) {
    return [
      riotCopLine(0, "You there -- halt!"),
      { speaker: "mystic", side: "left", text: "Us?" },
      riotCopLine(1, "Do not move. You are under arrest!"),
      { speaker: "swordsman", side: "left", text: "Under arrest for what? We just got here." },
      riotCopLine(2, "Tell it to the station after you drop the weapons."),
    ];
  }
  if (missionId === OUT_OF_RETIREMENT_MISSION_ID) {
    return [
      { speaker: "angel", skin: "summer-vibes", side: "right", player: 2,
        text: "If this is about the tide schedule, I am officially retired from tide schedules." },
      { speaker: "paladin", skin: "summer-vibes", side: "right", player: 2,
        text: "And I am retired from standing up before the ice in my drink melts." },
      { speaker: "swordsman", side: "left",
        text: "We need Angel's help. We are heading north to face the king." },
      { speaker: "mystic", side: "left",
        text: "You know the old routes, the wards, the things people forget until it is too late." },
      { speaker: "angel", skin: "summer-vibes", side: "right", player: 2,
        text: "I have been out of the loop and prefer it that way." },
      { speaker: "angel", skin: "summer-vibes", side: "right", player: 2,
        text: "Still... if you can prove you are worth helping, I will help. Two of you, two of us. A proper little duel." },
      { speaker: "paladin", skin: "summer-vibes", side: "right", player: 2,
        text: "Make it quick. My nap and my drink are both in danger." },
    ];
  }
  if (missionId === RONIN_MISSION_ID) {
    const type = volunteerType(selectedSquad);
    const name = getNicknamePref(type) ?? getUnitType(type).name;
    const preChoice = [
      {
        speaker: "mystic",
        text: "Careful crossing the bridge. The weather is odd around here -- snow on warm stone, thunder with no clouds.",
      },
      {
        speaker: "ronin",
        side: "right",
        player: 2,
        text: "Stop. No one crosses to the island without my leave.",
      },
      {
        speaker: "swordsman",
        text: "We do not have time for another roadblock.",
      },
      {
        speaker: "ronin",
        side: "right",
        player: 2,
        text: "I am the protector of this island. My life was spared for this duty, and a debt repaid becomes an oath.",
      },
      {
        speaker: "ronin",
        side: "right",
        player: 2,
        text: "I am sworn to protect this island with my life.",
      },
      {
        speaker: "swordsman",
        text: "Then move, or we cross through you.",
      },
      {
        speaker: "ronin",
        side: "right",
        player: 2,
        text: "*draws his blade*",
      },
      {
        speaker: "mystic",
        text: "There is barely room on the bridge for a full party fight. This should be one on one.",
      },
    ];
    const postChoice = [
      {
        type,
        name,
        side: "left",
        player: 1,
        text: "I'll handle the Ronin. Everyone else, step back.",
      },
    ];
    if (phase === "preChoice") return preChoice;
    if (phase === "postChoice") return postChoice;
    return [...preChoice, ...postChoice];
  }
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
      { speaker: "swordsman", side: "left", text: "The castle. The rumor says the king has a sorcerer helping him drag the void into the world, and every road is starting to point that way." },
      fat("fat-knight", "*straightens up* Oh no you're not. WE have a beef to settle with that king. You'll wait your turn."),
      { speaker: "mystic", side: "left", text: "A beef? What on earth did the king do to you four?" },
      fat("fat-wizard", "*hic* Banished us! Framed us for a terrible, TERRIBLE crime we did not commit."),
      fat("fat-knight", "That's ENOUGH. *ahem.* The point is, there is no way you reach that castle before we do. Not a chance."),
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
        text: "Only for a moment. The road is long, the weather is strange, and everyone could use proof their blades still answer. Four of us, four of you." },
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
        text: "That is not a cave. That is a doorway pretending to be a crack in the rocks, right where the northern road bends off the map.",
      },
      {
        speaker: "mystic",
        text: "Old ruins, small entrance, warm air coming out. The trail keeps offering invitations that feel like warnings.",
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
      text: "Well met. The road north is filling with frightened travelers and rumors of a royal sorcerer. It is better with a worthy party beside you.",
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
  if (missionId === MINER_MISSION_ID || missionId === RONIN_MISSION_ID) return true;
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
// The ending. It has four jobs, in this order, and it fails if it does them out of order:
// send the void beings home, let the party be people for a moment, pay off the journey
// WITHOUT a victory speech, and only then talk to the player about what is next. The
// player-facing beats are narration cards rather than a character selling features —
// a Swordsman recommending online matchmaking is where this would have gone corny.
function finalBattleEndingScript() {
  return [
    { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
      text: "It is closing. Slowly — but it is closing, and it will not open again from this side for a very long time." },
    { speaker: "nemesis", side: "right", player: 2,
      text: "He went through it bleeding. Everything he took from this world, he left on that rock." },
    { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
      text: "Which makes now the only hour in a thousand years that he can be caught. So this is where we leave you." },
    { speaker: "mystic", side: "left",
      text: "You're going after him. Into the void. The two of you." },
    { speaker: "nemesis", side: "right", player: 2,
      text: "We were losing to him at full strength, apart. He is not at full strength. We are not apart." },
    { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
      text: "Weakened, in our realm, with both of us waiting — yes. We can hold him there. That is not a boast. It is the first honest arithmetic I have done in a century." },
    { speaker: "swordsman", side: "left",
      text: "And afterward? When he's held?" },
    { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
      text: "Afterward, Nemesis and I have an argument to get back to." },
    { speaker: "nemesis", side: "right", player: 2,
      text: "A long one." },
    { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
      text: "Guardians. I have never said this to anything living. Thank you." },
    narration("The two of them step into the blue light without looking back, and the gate folds shut behind them like a held breath finally let go."),
    narration("The humming stops. It is very, very quiet in the crystal cave."),
    { speaker: "mystic", side: "left",
      text: "...Is that it? That's it. That's the whole thing." },
    { speaker: "swordsman", side: "left",
      text: "Don't say it like that. You'll jinx the walk home." },
    { speaker: "mystic", side: "left",
      text: "I'm not celebrating. I'm just standing here noticing that nothing is trying to kill us. Give me a minute with it. It's been a while." },
    { speaker: "swordsman", side: "left",
      text: "Take the minute. We earned the minute." },
    narration("A ridge, a farm, a bridge, a market, a swamp, a castle. Every stone of it walked, and every one of them still standing at the end of it."),
    narration("The war for the earth is over. What is left is the part nobody writes songs about: the road home, and whatever you decide to do with the peace."),
    // The one place the game talks to the player as the player. Kept to narration cards, kept
    // short, and kept until after the story has actually landed.
    narration("Every fighter on this continent now answers to you — the whole roster is unlocked, and there is nothing left in the campaign to earn them with."),
    narration("So take them somewhere that fights back. ONLINE VERSUS puts your four against a real opponent's four, and a mirror match out there is a very different animal than a mirror match in the dark."),
    narration("And when you want them to look the part: a skin store is coming. Your roster has earned the right to be seen."),
    narration("Thank you for playing Tactical Arena."),
  ];
}

export function campaignPostMatchCutsceneScript(missionId) {
  if (missionId === FINAL_BATTLE_MISSION_ID) return finalBattleEndingScript();
  // Void Ridden Castle — the alliance. The Summoner does not have a change of heart; he
  // has a change of arithmetic. Beating him cost him the one thing he was holding in
  // reserve for Blacksword, and the party is now the only asset he has left. This is also
  // the scene that hands the campaign its final destination.
  if (missionId === VOID_CASTLE_MISSION_ID) {
    return [
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "Do you have any idea what you have just done." },
      { speaker: "swordsman", side: "left",
        text: "Won." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "You have spent me. Everything I had been saving, I spent on you — on a room full of people who were never the enemy." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "I cannot meet Blacksword like this. Not now. Not as I am. And he is still coming." },
      { speaker: "nemesis", side: "right", player: 2,
        text: "Then we are finished. Both of us, and everything under us." },
      { speaker: "mystic", side: "left",
        text: "Or you stop counting yourself as one and start counting us." },
      { speaker: "swordsman", side: "left",
        text: "This is what we came here to offer. It is still on the table. It has been on the table the whole time." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "..." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "Then take it. I will fight beside you. I have nothing else left to be." },
      { speaker: "king", side: "left",
        text: "Where is he?" },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "South. A cave of crystal, deep in the ice. A spiritual site — the oldest one left standing." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "That is why he chose it. Once he begins drinking it down with void magic, every hour we wait makes him harder to end." },
      { speaker: "summoner", skin: "void-dweller", side: "right", player: 2,
        text: "Understand me. This will not resemble anything you have fought. Not me. Not Nemesis. Not the crown. He is not a battle you win by being brave in." },
      { speaker: "mystic", side: "left",
        text: "Then we go now, and we go together, and we do not go brave. We go ready." },
      { speaker: "swordsman", side: "left",
        text: "South. To the ice." },
    ];
  }
  if (missionId === NOT_MY_KING_MISSION_ID) {
    return [
      { speaker: "fat-wizard", side: "left",
        text: "*hic* Your Majesty... I owe you an apology. The gate, the panic, the rumor. I made the whole mess louder than it had to be." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "The rumor was not what took me. The void gate let in another entity: Nemesis." },
      { speaker: "fat-wizard", side: "left",
        text: "*hic* The cloaked figure. It was Nemesis. Not the king, and not... well, not only my terrible judgment." },
      { speaker: "mystic", side: "left",
        text: "Nemesis came through the same gate as the Summoner?" },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "Nemesis and the Summoner had been locked in battle for thousands of years, each fighting for control of the void." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "Then a third entity appeared. Blacksword. Far too powerful for either of them, and stronger still inside the void." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "Nemesis and the Summoner seized their chance. They escaped through the opened gate with a plan to draw Blacksword out of his realm, where he would be less powerful." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "I saw Blacksword ascend from the gate with my own eyes. Then everything went black, and I remember nothing after." },
      { speaker: "treant", side: "left",
        text: "So Nemesis and the Summoner mean to pause their eternal war and combine forces against him." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "Yes. Blacksword was already trying to bring Earth to the void. He began by targeting Earth's spiritual sites." },
      { speaker: "swordsman", side: "left",
        text: "Then we help stop Blacksword somehow, but we do not work directly with Nemesis or the Summoner." },
      { speaker: "mystic", side: "left",
        text: "A careful alliance at a distance. I dislike it, which probably means it is the only sane option." },
      { speaker: "king", type: "king", skin: null, side: "right", player: 2,
        text: "Return with me to the castle. We will make a plan inside the kingdom walls." },
      { speaker: "swordsman", side: "left",
        text: "Then to the castle. Together." },
    ];
  }
  if (missionId === SHOWDOWN_MISSION_ID) {
    return [
      { speaker: "mystic", side: "left",
        text: "Start from the beginning. What actually happened to you four?" },
      { speaker: "fat-wizard", side: "right", player: 2,
        text: "*hic* I opened the void gate. Accidentally. While experimenting. Also accidentally drunk." },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "A cloaked figure came out of it and beat him half to pieces. Buildings came down in the fight." },
      { speaker: "fat-bowman", side: "right", player: 2,
        text: "Then the figure left through another void gate. All anyone saw was our wizard standing in the wreckage." },
      { speaker: "fat-cleric", side: "right", player: 2,
        text: "We tried to tell them he would never destroy the kingdom on purpose. They banished all of us anyway." },
      { speaker: "fat-wizard", side: "right", player: 2,
        text: "And I started a drunken rumor in a tavern that it was the king's fault. By morning, shame had already sobered me up." },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "So we swore we would return, set the record straight, and let him take responsibility for the rumor." },
      { speaker: "fat-bowman", side: "right", player: 2,
        text: "The road back was not exactly quiet. Void things, ambushes, bad weather, worse inns." },
      { speaker: "fat-cleric", side: "right", player: 2,
        text: "But now that we have made it to the pass, we cannot turn back." },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "Let us come with you. We clear the king's name, and the wizard tells the truth." },
      { speaker: "swordsman", side: "left",
        text: "Then we go together. No more rumors. No more running." },
      { speaker: "mystic", side: "left",
        text: "And no more calling us wannabes." },
      { speaker: "fat-knight", side: "right", player: 2,
        text: "...Fair." },
    ];
  }
  if (missionId === SPIRIT_WOODS_MISSION_ID) {
    return [
      { speaker: "mother-nature", side: "right", player: 2,
        text: "You fought as though the forest mattered to you." },
      { speaker: "mystic", side: "left",
        text: "The void spreads through roots, stone, and snow. We need more than a path through the pass; we need a way to stop it." },
      { speaker: "mother-nature", side: "right", player: 2,
        text: "Then this is no small human quarrel. Take me to the pass, and I will calm the storm." },
      { speaker: "swordsman", side: "left",
        text: "Then we can reach the king." },
      { speaker: "mother-nature", side: "right", player: 2,
        text: "Yes. And after that, you will show me where the void has taken root." },
    ];
  }
  if (missionId === VOIDWOOD_MISSION_ID) {
    return [
      { speaker: "swordsman", side: "left",
        text: "You were taken hostage by the void. The forest has almost entirely been infected by void magic." },
      { speaker: "treant", side: "right", player: 2,
        text: "Then I slept while my roots were used to poison everything I was meant to protect." },
      { speaker: "treant", side: "right", player: 2,
        text: "I am ashamed I let it grow this bad. Whoever is responsible will answer for it." },
      { speaker: "mystic", side: "left",
        text: "It might be the king." },
      { speaker: "treant", side: "right", player: 2,
        text: "The king and I go way back. I would be shocked if this was truly his doing." },
      { speaker: "treant", side: "right", player: 2,
        text: "Nevertheless, I would like to pay a visit to my old friend." },
    ];
  }
  if (missionId === WRONG_PLACE_MISSION_ID) return wrongPlaceDefeatScript();
  if (missionId === RONIN_MISSION_ID) return roninDefeatScript();
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
