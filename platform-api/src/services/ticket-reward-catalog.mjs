import { calculateBattleshitsTicketReward } from "./battleshits-ticket-rewards.mjs";
import { calculateBirdDutyTicketReward } from "./bird-duty-ticket-rewards.mjs";
import { calculateCreatureBattlerTicketReward } from "./creature-battler-ticket-rewards.mjs";
import { calculateIlluminautsTicketReward } from "./illuminauts-ticket-rewards.mjs";
import { calculateLoversLostTicketReward } from "./lovers-lost-ticket-rewards.mjs";
import { calculateMiniHoopsTicketReward } from "./mini-hoops-ticket-rewards.mjs";
import { calculateMiniTacticsTicketReward } from "./mini-tactics-ticket-rewards.mjs";
import { calculatePuckdUpTicketReward } from "./puckd-up-ticket-rewards.mjs";
import { calculateSharkHallTicketReward } from "./shark-hall-ticket-rewards.mjs";
import { calculateSumoraiTicketReward } from "./sumorai-ticket-rewards.mjs";
const ZERO_REWARD = Object.freeze({
    repeatable: Object.freeze({ total: 0 }),
    achievements: Object.freeze([]),
    achievementTotal: 0,
    total: 0,
});
// This registry is the single platform extension point for cabinet payout
// formulas. Evaluators receive only server-normalized result data and newly
// inserted achievement ids; no client-provided ticket amount reaches them.
const REWARD_EVALUATORS = Object.freeze({
    "lovers-lost": calculateLoversLostTicketReward,
    battleshits: calculateBattleshitsTicketReward,
    sumorai: calculateSumoraiTicketReward,
    "mini-tactics": calculateMiniTacticsTicketReward,
    illuminauts: calculateIlluminautsTicketReward,
    "bird-duty": calculateBirdDutyTicketReward,
    "creature-battler": calculateCreatureBattlerTicketReward,
    "mini-hoops": calculateMiniHoopsTicketReward,
    "puckd-up": calculatePuckdUpTicketReward,
    "shark-hall": calculateSharkHallTicketReward,
});
export function evaluateTicketReward(gameSlug, input) {
    const slug = typeof gameSlug === "string" ? gameSlug.trim().toLowerCase() : "";
    return REWARD_EVALUATORS[slug]?.(input) ?? {
        repeatable: { ...ZERO_REWARD.repeatable },
        achievements: [],
        achievementTotal: 0,
        total: 0,
    };
}
