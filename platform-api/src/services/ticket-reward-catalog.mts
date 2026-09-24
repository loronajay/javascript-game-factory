import { calculateBattleshitsTicketReward } from "./battleshits-ticket-rewards.mjs";
import { calculateBirdDutyTicketReward } from "./bird-duty-ticket-rewards.mjs";
import { calculateIlluminautsTicketReward } from "./illuminauts-ticket-rewards.mjs";
import { calculateLoversLostTicketReward } from "./lovers-lost-ticket-rewards.mjs";
import { calculateMiniTacticsTicketReward } from "./mini-tactics-ticket-rewards.mjs";
import { calculateSumoraiTicketReward } from "./sumorai-ticket-rewards.mjs";

export interface TicketRewardBreakdown {
  repeatable: { total: number; [key: string]: number };
  achievements: Array<{ id: string; amount: number }>;
  achievementTotal: number;
  total: number;
}

const ZERO_REWARD: TicketRewardBreakdown = Object.freeze({
  repeatable: Object.freeze({ total: 0 }),
  achievements: Object.freeze([]) as unknown as Array<{ id: string; amount: number }>,
  achievementTotal: 0,
  total: 0,
});

// This registry is the single platform extension point for cabinet payout
// formulas. Evaluators receive only server-normalized result data and newly
// inserted achievement ids; no client-provided ticket amount reaches them.
const REWARD_EVALUATORS: Readonly<Record<string, (input: any) => TicketRewardBreakdown>> = Object.freeze({
  "lovers-lost": calculateLoversLostTicketReward,
  battleshits: calculateBattleshitsTicketReward,
  sumorai: calculateSumoraiTicketReward,
  "mini-tactics": calculateMiniTacticsTicketReward,
  illuminauts: calculateIlluminautsTicketReward,
  "bird-duty": calculateBirdDutyTicketReward,
});

export function evaluateTicketReward(gameSlug: unknown, input: any): TicketRewardBreakdown {
  const slug = typeof gameSlug === "string" ? gameSlug.trim().toLowerCase() : "";
  return REWARD_EVALUATORS[slug]?.(input) ?? {
    repeatable: { ...ZERO_REWARD.repeatable },
    achievements: [],
    achievementTotal: 0,
    total: 0,
  };
}
