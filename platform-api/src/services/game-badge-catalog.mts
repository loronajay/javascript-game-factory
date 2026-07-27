// Server-authoritative badge catalog for per-game player profiles.
//
// A badge is earned one of two ways, and the catalog says which:
//
//   derived  — implied by something the account already owns. The badge is computed
//              at read time from game_entitlements and is never stored. Nothing can
//              grant it but the underlying purchase, so it cannot be injected by a
//              tampered client, and it applies retroactively to anyone who already
//              owns the qualifying item. Derived rules must be MONOTONIC: owning more
//              can earn a badge, but nothing a player does may take one away.
//   awarded  — written to game_player_badges by a trusted server path and permanent
//              once written. A badge whose qualifying fact can be undone (campaign
//              progress is resettable) has to be awarded rather than derived, or a
//              reset would silently revoke it.
//
// Derived badges match on entitlement id, whose shapes are set by db/game-progress:
// `unit:<type>`, `skin:<unitType>:<skinSlug>`, `skin-pack:<packId>`.
//
// `art` names an entry in the game's generated badge manifest
// (games/<slug>/src/ui/badgeManifest.generated.js). The client resolves the image from
// that manifest; `icon` is the same asset as a game-relative path for any consumer that
// has no manifest. Both come from one source, so they cannot drift.

export const BADGE_EARN_DERIVED = "derived";
export const BADGE_EARN_AWARDED = "awarded";

const BADGE_ART_ROOT = "assets/player-badges";

// How many skins each pack had when its badge shipped. Owning that many is what a pack
// purchase looks like in the data for anyone who bought it BEFORE fulfillment started
// stamping the `skin-pack:<id>` entitlement (services/payments).
//
// Never raise one of these when a pack grows: the threshold exists so that adding a skin to
// a pack cannot un-earn a badge somebody already displays.
const PACK_SIZE_AT_BADGE_LAUNCH = Object.freeze({
  "blood-moon": 30,
  "void-dweller": 10,
});

// A "owns the whole pack" derived rule, which is what a pack-only collection badge means.
function packCollectionRule(packId: string): any {
  return {
    entitlementPatterns: Object.freeze([new RegExp(`^skin-pack:${packId}$`)]),
    entitlementCount: Object.freeze({
      pattern: new RegExp(`^skin:[^:]+:${packId}$`),
      min: (PACK_SIZE_AT_BADGE_LAUNCH as any)[packId],
    }),
  };
}


// Ladder ascent badges.
//
// AWARDED rather than derived, and qualified on the PEAK rating rather than the
// current one. "Reached Gold" is a high-water mark: deriving it from the live rating
// would revoke the badge on a losing streak, which the monotonic rule above forbids.
// db/ratings + db/ranked-match maintain game_ratings.peak_rating as a running max.
//
// These minimums MUST equal RANK_TIERS in db/ranked-elo. They are duplicated rather
// than imported because services must not depend on db (db already imports services,
// and a cycle would be worse than a duplicated number). A test asserts they match.
export const LADDER_BADGE_TIER_MINIMUMS = Object.freeze({
  gold: 1400,
  platinum: 1600,
  diamond: 1800,
  master: 2000,
  grandmaster: 2200,
});

function ladderBadge(id: string, label: string, art: string, tierId: string, description: string): any {
  const min = (LADDER_BADGE_TIER_MINIMUMS as any)[tierId];
  return Object.freeze({
    id,
    label,
    description,
    art,
    earn: BADGE_EARN_AWARDED,
    tierId,
    autoAward: (facts: any) => Number(facts?.peakRating || 0) >= min,
    awardableUntil: null,
  });
}

// How many skins make a collector. Lowering this later is safe; RAISING it would
// un-earn the badge for anyone between the old and new value, so treat it as fixed.
export const SKIN_COLLECTOR_MINIMUM = 15;

const GAME_BADGE_CATALOG = Object.freeze({
  "tactical-arena": Object.freeze([
    Object.freeze({
      id: "og-commander",
      label: "OG Commander",
      description: "Fought in the Tactical Arena's opening days — ranked ladder or full campaign.",
      art: "og-commander",
      earn: BADGE_EARN_AWARDED,
      // Awarded (not derived) on purpose: campaign progress can be reset, and an OG
      // badge that vanishes when a player replays the campaign is a bug, not a rule.
      // The server writes the row the first time it sees the player qualify.
      autoAward: (facts: any) => Boolean(facts?.playedRanked || facts?.campaignComplete),
      // null = still earnable. Set an ISO timestamp to close the founding window; anyone
      // who already earned it keeps it, because the row is already written.
      awardableUntil: null,
    }),
    // Pack purchase only: a single skin off either pack does not earn its badge.
    Object.freeze({
      id: "blood-moon-collector",
      label: "Blood Moon",
      description: "Owns the complete Blood Moon skin collection.",
      art: "blood-moon",
      earn: BADGE_EARN_DERIVED,
      ...packCollectionRule("blood-moon"),
    }),
    Object.freeze({
      id: "void-dweller-collector",
      label: "Void Dweller",
      description: "Owns the complete Void Dweller skin collection.",
      art: "void-dweller",
      earn: BADGE_EARN_DERIVED,
      ...packCollectionRule("void-dweller"),
    }),
    Object.freeze({
      id: "fuck-cancer-donor",
      label: "Fuck Cancer",
      description: "Donated to cancer research through the Fuck Cancer skin collection.",
      art: "fuck-cancer",
      earn: BADGE_EARN_DERIVED,
      // Any single Fuck Cancer skin, or the pack itself, earns the badge — every one of
      // them is a donation.
      entitlementPatterns: Object.freeze([
        /^skin:[^:]+:fuck-cancer$/,
        /^skin-pack:fuck-cancer$/,
      ]),
    }),
    ladderBadge("ladder-climber", "Ladder Climber", "ladder-climber", "gold",
      "Climbed to Gold on the ranked ladder."),
    ladderBadge("platinum-ascent", "Platinum Ascent", "platinum-ascent", "platinum",
      "Climbed to Platinum on the ranked ladder."),
    ladderBadge("diamond-ascent", "Diamond Ascent", "diamond-ascent", "diamond",
      "Climbed to Diamond on the ranked ladder."),
    ladderBadge("master-ascent", "Master Ascent", "master-ascent", "master",
      "Climbed to Master on the ranked ladder."),
    ladderBadge("ladder-conqueror", "Ladder Conqueror", "ladder-conqueror", "grandmaster",
      "Reached Grandmaster — the top of the ranked ladder."),
    // Derived: owning skins is monotonic, so it recomputes safely and applies
    // retroactively to anyone who already has a collection. Counts every owned skin,
    // however it was bought — individually, in a pack, or granted by a consumable.
    Object.freeze({
      id: "skin-collector",
      label: "Skin Collector",
      description: `Owns ${SKIN_COLLECTOR_MINIMUM} or more skins.`,
      art: "skin-collector",
      earn: BADGE_EARN_DERIVED,
      entitlementCount: Object.freeze({
        pattern: /^skin:[^:]+:[^:]+$/,
        min: SKIN_COLLECTOR_MINIMUM,
      }),
    }),
  ]),
});

export function listGameBadgeCatalog(gameSlug: string): readonly any[] {
  return (GAME_BADGE_CATALOG as any)[gameSlug] || [];
}

export function findGameBadge(gameSlug: string, badgeId: string): any {
  return listGameBadgeCatalog(gameSlug).find((badge: any) => badge.id === badgeId) || null;
}

// A badge id that a trusted server path is allowed to write to game_player_badges.
// Derived badges are excluded on purpose: writing one would create a second, weaker
// source of truth for something the entitlement already proves.
export function isAwardableGameBadge(gameSlug: string, badgeId: string): boolean {
  return findGameBadge(gameSlug, badgeId)?.earn === BADGE_EARN_AWARDED;
}

// The public shape a profile renders. `earnedAt` is null for derived badges — the
// entitlement's own purchase date is the honest answer and isn't loaded here.
export function serializeBadge(badge: any, { earnedAt = null, source = "" } = {}): any {
  if (!badge) return null;
  return {
    badgeId: badge.id,
    label: badge.label,
    description: badge.description,
    art: badge.art,
    icon: `${BADGE_ART_ROOT}/${badge.art}.webp`,
    earn: badge.earn,
    earnedAt: earnedAt || null,
    source: source || badge.earn,
  };
}

function matchesEntitlements(badge: any, ids: readonly string[]): boolean {
  if ((badge.entitlementPatterns || []).some((pattern: RegExp) => ids.some((id) => pattern.test(id)))) {
    return true;
  }
  const count = badge.entitlementCount;
  if (!count) return false;
  return ids.filter((id) => count.pattern.test(id)).length >= count.min;
}

// Which derived badges a set of owned entitlement ids earns.
export function derivedBadgesForEntitlements(gameSlug: string, entitlementIds: readonly string[]): any[] {
  const ids = (Array.isArray(entitlementIds) ? entitlementIds : []).map((id) => String(id || ""));
  if (!ids.length) return [];
  return listGameBadgeCatalog(gameSlug)
    .filter((badge: any) => badge.earn === BADGE_EARN_DERIVED && matchesEntitlements(badge, ids))
    .map((badge: any) => serializeBadge(badge, { source: BADGE_EARN_DERIVED }));
}

// Awarded badges the server should write for a player right now, given what it knows
// about them. `facts` is assembled by db/game-social/game-badges from tables the player
// cannot write directly (ranked results, campaign completion).
export function autoAwardableGameBadges(gameSlug: string, facts: any, now: Date = new Date()): any[] {
  return listGameBadgeCatalog(gameSlug).filter((badge: any) => {
    if (badge.earn !== BADGE_EARN_AWARDED || typeof badge.autoAward !== "function") return false;
    if (badge.awardableUntil && new Date(badge.awardableUntil) < now) return false;
    return badge.autoAward(facts);
  });
}
