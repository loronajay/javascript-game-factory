import { calculateLoversLostTicketReward } from "./lovers-lost-ticket-rewards.mjs";
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
