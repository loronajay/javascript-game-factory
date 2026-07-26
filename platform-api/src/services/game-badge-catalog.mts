// Server-authoritative badge catalog for per-game player profiles.
//
// A badge is earned one of two ways, and the catalog says which:
//
//   derived  — implied by something the account already owns. The badge is computed
//              at read time from game_entitlements and is never stored. Nothing can
//              grant it but the underlying purchase, so it cannot be injected by a
//              tampered client, and it applies retroactively to anyone who already
//              owns the qualifying item.
//   awarded  — written to game_player_badges by a trusted server path (a tournament
//              result, a seasonal event). Nothing derives it; it exists because the
//              server put it there.
//
// Derived badges match on entitlement id, whose shapes are set by db/game-progress:
// `unit:<type>`, `skin:<unitType>:<skinSlug>`, `skin-pack:<packId>`.
//
// Icons are paths relative to the owning game's folder so the client can render one
// without a second lookup table.

export const BADGE_EARN_DERIVED = "derived";
export const BADGE_EARN_AWARDED = "awarded";

const GAME_BADGE_CATALOG = Object.freeze({
  "tactical-arena": Object.freeze([
    Object.freeze({
      id: "fuck-cancer-donor",
      label: "Fuck Cancer",
      description: "Donated to cancer research through the Fuck Cancer skin collection.",
      icon: "assets/player-badges/fuck-cancer.png",
      earn: BADGE_EARN_DERIVED,
      // Any single Fuck Cancer skin, or the pack itself, earns the badge.
      entitlementPatterns: Object.freeze([
        /^skin:[^:]+:fuck-cancer$/,
        /^skin-pack:fuck-cancer$/,
      ]),
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
    icon: badge.icon,
    earn: badge.earn,
    earnedAt: earnedAt || null,
    source: source || badge.earn,
  };
}

// Which derived badges a set of owned entitlement ids earns.
export function derivedBadgesForEntitlements(gameSlug: string, entitlementIds: readonly string[]): any[] {
  const ids = (Array.isArray(entitlementIds) ? entitlementIds : []).map((id) => String(id || ""));
  if (!ids.length) return [];
  return listGameBadgeCatalog(gameSlug)
    .filter((badge: any) => badge.earn === BADGE_EARN_DERIVED
      && (badge.entitlementPatterns || []).some((pattern: RegExp) => ids.some((id) => pattern.test(id))))
    .map((badge: any) => serializeBadge(badge, { source: BADGE_EARN_DERIVED }));
}
