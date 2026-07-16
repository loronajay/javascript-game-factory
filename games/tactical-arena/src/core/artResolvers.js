import { getArtForUnit } from "./unitCatalog.js";
import { canUseArt } from "../rules/arts.js";
import { validateOpenActivation } from "./commandValidation.js";
import { ERR, reject } from "./reducerResult.js";
import {
  resolveCover,
  resolveLockdown,
  resolveShieldBash,
  resolveSmokeBomb,
  resolveStunGun,
} from "./artResolvers/riotCopResolvers.js";
import {
  resolveKingCommand,
  resolveRecharge,
  resolveSelfDestruct,
} from "./artResolvers/commandResolvers.js";
import { resolveVoidGravity } from "./artResolvers/blackswordResolvers.js";
import {
  resolveFatWizardSurge,
  resolveFatWizardZap,
  resolveRelayPower,
  resolveStudy,
} from "./artResolvers/fatWizardResolvers.js";
import { resolveEnrich, resolvePetrify, resolveSourceShift } from "./artResolvers/treantResolvers.js";
import { resolvePoisonBurst, resolveSmog } from "./artResolvers/virusResolvers.js";
import { resolveQuake, resolveStoneThrow, resolveThunderousCharge } from "./artResolvers/clodResolvers.js";
import { resolveDarkPulse, resolveNemesisAutoPulse, resolveRealmTraversal } from "./artResolvers/nemesisResolvers.js";
import { resolveGreatFlood, resolveLandscaper, resolveWeather } from "./artResolvers/motherNatureResolvers.js";
import { resolveChallenge, resolveSelfBuff, resolveShuriken } from "./artResolvers/roninResolvers.js";
import { resolveForcePush, resolveForceTug, resolvePolarityShift } from "./artResolvers/bigBrotherResolvers.js";
import { resolveWitchDance } from "./artResolvers/witchDoctorResolvers.js";
import { resolveAge, resolveRewind, resolveTimeStretch } from "./artResolvers/fatherTimeResolvers.js";
import { resolveRocketPunch, resolveTetherGrab } from "./artResolvers/juggernautResolvers.js";
import { resolveFrontKick, resolveProtect } from "./artResolvers/monkResolvers.js";
import { resolveDarkEther, resolveDarkRush, resolveFart, resolveRushPath, resolveTargetedArt } from "./artResolvers/targetedArtResolvers.js";
import { resolveFlee, resolveNuke } from "./artResolvers/areaArtResolvers.js";
import { resolveSummonGhost, resolveSummonGhoul } from "./artResolvers/summonResolvers.js";
import { resolveBlastingCap, resolveBuildCover, resolveOreHarvest } from "./artResolvers/minerResolvers.js";
import { resolveAnoint, resolveCleanseAlly, resolveFocusPrayer, resolveHealAllies, resolveStatusCast, resolveTilePulse } from "./artResolvers/supportResolvers.js";
import { resolveCannonFire, resolveConeArt, resolveThrowCigar, resolveVolleyShot } from "./artResolvers/rangedArtResolvers.js";
import { resolveFlight, resolvePyroclasm, resolveVolcanicPyroclasmTick } from "./artResolvers/gargoyleResolvers.js";

export { resolveNemesisAutoPulse, resolveVolcanicPyroclasmTick };

const ART_RESOLVERS = new Map([
  ["footwork", resolveRushPath],
  ["stumble", resolveRushPath],
  // Blacksword: a straight-line HP-cost dash, a self crit-charge, and two condition-driven
  // true-damage bursts (Dark Tick = blinded enemies, Banish = enemies on dark tiles).
  ["dark-rush", resolveDarkRush],
  ["dark-ether", resolveDarkEther],
  ["void-gravity", resolveVoidGravity],
  ["dark-tick", resolvePoisonBurst],
  ["banish-dark", resolvePoisonBurst],
  ["fart", resolveFart],
  ["volley-shot", resolveVolleyShot],
  ["cannon-fire", resolveCannonFire],
  ["flamethrower", resolveConeArt],
  ["pray", resolveHealAllies],
  ["wish", resolveHealAllies],
  ["silence", resolveStatusCast],
  ["smoke-bomb", resolveStatusCast],
  ["headlamp", resolveStatusCast],
  ["flee", resolveFlee],
  ["dematerialize", resolveFlee],
  ["nuke", resolveNuke],
  ["dark-bomb", resolveNuke],
  ["summon-ghoul", resolveSummonGhoul],
  ["summon", resolveSummonGhost],
  ["beckon", resolveSummonGhost],
  ["build-cover", resolveBuildCover],
  ["shaft-prop", resolveBuildCover],
  ["throw-cigar", resolveThrowCigar],
  ["lightseeker", resolveTilePulse],
  ["darkseeker", resolveTilePulse],
  ["heavenseeker", resolveTilePulse],
  // Angel: a friendly-only buff cast and a white-tile team heal.
  ["anoint", resolveAnoint],
  ["elevate", resolveHealAllies],
  // Mystic: friendly-only single-target cleanse.
  ["purify", resolveCleanseAlly],
  // Witch Doctor dances: each fires a one-shot team/global effect then enters its
  // stance (the "Dancing Man" passive). One resolver branches on the art's data.
  ["rain-dance", resolveWitchDance],
  ["fire-dance", resolveWitchDance],
  ["spirit-dance", resolveWitchDance],
  ["misfortune-dance", resolveWitchDance],
  ["black-death-dance", resolveWitchDance],
  // Father Time: ally-OR-enemy utility casts + a revive.
  ["age", resolveAge],
  ["time-stretch", resolveTimeStretch],
  ["rewind", resolveRewind],
  ["second-helping", resolveRewind],
  // Juggernaut: line grab/strike, a self MP vent, and a self-sacrifice blast.
  ["tether-grab", resolveTetherGrab],
  ["rocket-punch", resolveRocketPunch],
  ["recharge", resolveRecharge],
  ["self-destruct", resolveSelfDestruct],
  // King: the four global commands all record the command and spend the activation; the
  // buff itself is a live fold (getCommandBuffStats), so the resolver stores no numbers.
  ["strike", resolveKingCommand],
  ["hold", resolveKingCommand],
  ["pursue", resolveKingCommand],
  ["higher-ground", resolveKingCommand],
  // Monk: fixed-power kick with conditional knockback, and an ally guard reposition.
  ["front-kick", resolveFrontKick],
  ["protect", resolveProtect],
  // Gargoyle: fly-then-blast reposition, and a self-centred line burst.
  ["flight", resolveFlight],
  ["pyroclasm", resolvePyroclasm],
  // Nemesis: all-ray first-contact magic and the move+Pulse next-turn setup.
  ["dark-pulse", resolveDarkPulse],
  ["realm-traversal", resolveRealmTraversal],
  // Virus: a self-centred blind cloud and the two poison detonations (Poison Tick + Explosion).
  ["smog", resolveSmog],
  ["poison-tick", resolvePoisonBurst],
  ["explosion", resolvePoisonBurst],
  // Clod: a self-centred quake (variable magic + MP refund on 3+ hits), a STR-
  // scaling boulder throw with a guaranteed slow/crit-stun, and the RAGE targeted blast.
  ["quake", resolveQuake],
  ["stone-throw", resolveStoneThrow],
  ["thunderous-charge", resolveThunderousCharge],
  // Fat Wizard: Study mark, Clumsy splash casts, and direct HP/MP transfer.
  ["zap", resolveFatWizardZap],
  ["study", resolveStudy],
  ["surge", resolveFatWizardSurge],
  ["relay-power", resolveRelayPower],
  // Fat Cleric: a random-value team heal, a negative-only ally cleanse, and a roll-or-
  // backfire single-ally heal.
  ["hope", resolveHealAllies],
  ["cleanse", resolveCleanseAlly],
  ["focus-prayer", resolveFocusPrayer],
  // Miner: ore economy and a small demolition charge.
  ["ore-harvest", resolveOreHarvest],
  ["ore-abundance", resolveOreHarvest],
  ["blasting-cap", resolveBlastingCap],
  // Big Brother: targeted true/status attack, ally+enemy shove aura, global restore swap.
  ["force-tug", resolveForceTug],
  ["force-push", resolveForcePush],
  ["polarity-shift", resolvePolarityShift],
  // Ronin: a self-buff (defend + next-turn buff), a mutual grudge mark, and a thrown finisher.
  ["patient-blade", resolveSelfBuff],
  ["broken-oath", resolveSelfBuff],
  ["challenge", resolveChallenge],
  ["shuriken", resolveShuriken],
  // Riot Cop: a stun/slow dart, a tile-targeted smoke cloud, a shield shove, an ally
  // swap-and-guard, and the RAGE self-centred Lockdown debuff.
  ["stun-gun", resolveStunGun],
  ["smoke-bomb-riot", resolveSmokeBomb],
  ["shield-bash", resolveShieldBash],
  ["cover", resolveCover],
  ["lockdown", resolveLockdown],
  // Treant: an ally power-transfer, a self HP/MP swap, and the RAGE petrify statue.
  // (Soul Sap is a plain targeted attack + MP-heal effect, so it uses resolveTargetedArt.)
  ["enrich", resolveEnrich],
  ["source-shift", resolveSourceShift],
  ["petrify", resolvePetrify],
  // Mother Nature: global weather activations, terrain push/control, and a board shuffle.
  ["blizzard", resolveWeather],
  ["spring-shower", resolveWeather],
  ["heatwave", resolveWeather],
  ["thunderstorm", resolveWeather],
  ["landscaper", resolveLandscaper],
  ["great-flood", resolveGreatFlood]
]);

export function useArt(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!canUseArt(state, result.unit, command.artId)) return reject(ERR.ART_NOT_AVAILABLE);
  const art = getArtForUnit(result.unit, command.artId);
  const resolver = ART_RESOLVERS.get(art.id) ?? resolveTargetedArt;
  return resolver(state, command, art);
}

