import { validateTacticalArenaPublicClaim } from "./tactical-arena-reward-catalog.mjs";
import {
  YAM_BOWLING_CIRCUIT_CLAIM_KIND,
  validateYamBowlingPublicClaim,
} from "./yam-bowling-reward-catalog.mjs";

// Claim vocabulary is a per-game server contract. Keeping kind registration beside the
// validator prevents one cabinet from borrowing another cabinet's mutation branches, while
// the public/premium split keeps paid Tactical Arena fulfillment server-only.
const CLAIM_POLICIES = Object.freeze({
  "tactical-arena": Object.freeze({
    publicKinds: new Set([
      "campaign-valor",
      "campaign-progress",
      "campaign-skin-choice",
      "campaign-unit-choice",
      "tutorial-complete",
      "tutorial-valor",
      "tutorial-unit-reward",
      "tutorial-skin-choice",
    ]),
    premiumKinds: new Set([
      "premium-skin-purchase",
      "premium-unit-purchase",
      "premium-consumable-purchase",
    ]),
    validatePublicClaim: validateTacticalArenaPublicClaim,
  }),
  "yam-bowling": Object.freeze({
    publicKinds: new Set([YAM_BOWLING_CIRCUIT_CLAIM_KIND]),
    premiumKinds: new Set<string>(),
    validatePublicClaim: validateYamBowlingPublicClaim,
  }),
});

type RegisteredGameSlug = keyof typeof CLAIM_POLICIES;

function cleanText(value: any, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function policyFor(gameSlug: any): (typeof CLAIM_POLICIES)[RegisteredGameSlug] | null {
  const slug = cleanText(gameSlug, 60) as RegisteredGameSlug;
  return CLAIM_POLICIES[slug] || null;
}

export function isPremiumGameClaimKind(gameSlug: any, kind: any): boolean {
  return policyFor(gameSlug)?.premiumKinds.has(cleanText(kind, 80)) || false;
}

export function isPublicGameClaimKind(gameSlug: any, kind: any): boolean {
  return policyFor(gameSlug)?.publicKinds.has(cleanText(kind, 80)) || false;
}

export function isRegisteredGameClaimKind(gameSlug: any, kind: any): boolean {
  return isPublicGameClaimKind(gameSlug, kind) || isPremiumGameClaimKind(gameSlug, kind);
}

export function validatePublicGameClaim(params: any = {}): any {
  const policy = policyFor(params.gameSlug);
  if (!policy || !policy.publicKinds.has(cleanText(params.kind, 80))) {
    return { ok: false, statusCode: 400, error: "invalid_claim" };
  }
  return policy.validatePublicClaim(params);
}
