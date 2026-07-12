import {
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
  MINER_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  RONIN_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
} from "./campaignConstants.js";
import { clodMissionOpeningScript } from "./missions/clod-trial/dialogue.js";
import { necromancerMissionOpeningScript } from "./missions/necromancer-rise/dialogue.js";
import { witchDoctorMissionOpeningScript } from "./missions/witch-doctor-swamp/dialogue.js";
import { fatherTimeMissionOpeningScript } from "./missions/timeless-woods/dialogue.js";
import { virusMissionOpeningScript } from "./missions/virus-root/dialogue.js";
import { paladinMissionOpeningScript } from "./missions/wandering-paladin/dialogue.js";
import { monkMissionOpeningScript } from "./missions/monk-temple-trial/dialogue.js";
import { outOfRetirementMissionOpeningScript } from "./missions/out-of-retirement/dialogue.js";
import { brothersMissionOpeningScript } from "./missions/mechs-on-the-farm/dialogue.js";
import { gargoyleMissionOpeningScript } from "./missions/gargoyle-inferno/dialogue.js";
import { sniperMissionOpeningScript } from "./missions/sniper-highground/dialogue.js";
import { minerMissionOpeningScript } from "./missions/dug-your-own-grave/dialogue.js";
import { hasbeenHeroesMissionOpeningScript } from "./missions/hasbeen-heroes/dialogue.js";
import { showdownMissionOpeningScript } from "./missions/the-showdown/dialogue.js";
import { notMyKingMissionOpeningScript } from "./missions/not-my-king/dialogue.js";
import { roninMissionOpeningScript } from "./missions/battle-for-the-bridge/dialogue.js";
import { wrongPlaceMissionOpeningScript } from "./missions/wrong-place-wrong-time/dialogue.js";
import { spiritWoodsMissionOpeningScript } from "./missions/spirit-of-the-woods/dialogue.js";
import { voidwoodMissionOpeningScript } from "./missions/voidwood-forest/dialogue.js";

export * from "./missions/sharedDialogue.js";
export * from "./missions/clod-trial/dialogue.js";
export * from "./missions/necromancer-rise/dialogue.js";
export * from "./missions/witch-doctor-swamp/dialogue.js";
export * from "./missions/timeless-woods/dialogue.js";
export * from "./missions/virus-root/dialogue.js";
export * from "./missions/wandering-paladin/dialogue.js";
export * from "./missions/monk-temple-trial/dialogue.js";
export * from "./missions/out-of-retirement/dialogue.js";
export * from "./missions/mechs-on-the-farm/dialogue.js";
export * from "./missions/gargoyle-inferno/dialogue.js";
export * from "./missions/sniper-highground/dialogue.js";
export * from "./missions/dug-your-own-grave/dialogue.js";
export * from "./missions/hasbeen-heroes/dialogue.js";
export * from "./missions/the-showdown/dialogue.js";
export * from "./missions/not-my-king/dialogue.js";
export * from "./missions/battle-for-the-bridge/dialogue.js";
export * from "./missions/wrong-place-wrong-time/dialogue.js";
export * from "./missions/spirit-of-the-woods/dialogue.js";
export * from "./missions/voidwood-forest/dialogue.js";

// Dispatcher so the match code can ask for a mission opening through the public campaign API.
export function campaignOpeningScript(missionId, state) {
  if (missionId === NOT_MY_KING_MISSION_ID) return notMyKingMissionOpeningScript(state);
  if (missionId === SHOWDOWN_MISSION_ID) return showdownMissionOpeningScript(state);
  if (missionId === SPIRIT_WOODS_MISSION_ID) return spiritWoodsMissionOpeningScript(state);
  if (missionId === VOIDWOOD_MISSION_ID) return voidwoodMissionOpeningScript(state);
  if (missionId === OUT_OF_RETIREMENT_MISSION_ID) return outOfRetirementMissionOpeningScript(state);
  if (missionId === WRONG_PLACE_MISSION_ID) return wrongPlaceMissionOpeningScript(state);
  if (missionId === RONIN_MISSION_ID) return roninMissionOpeningScript(state);
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
