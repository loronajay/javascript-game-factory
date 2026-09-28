// What a settled cabinet result puts in a player's collection, beyond tickets.
//
// POST /games/:slug/results settles tickets for every registered cabinet
// (services/game-result-catalog). A few results are ALSO worth a thing — a
// Barnyard Dash Grand Prix won puts that cup's trophy on the player's farm —
// and this registry says which. The grant is written in the same transaction
// as the ticket settlement and only when the result was not fenced, so a
// forged result that pays nothing also wins nothing. A grant is an ordinary
// `game_entitlements` row: idempotent by its key, so winning a cup twice is
// one trophy, and the farm admits it exactly the way it admits a purchase.

import { barnyardTrophyId } from "./pet-games-prize-catalog.mjs";

export interface ResultGrant {
  /** The game whose collection the item joins (the farm, for a trophy). */
  gameSlug: string;
  entitlementId: string;
  kind: "catalog-item";
  source: string;
}

type GrantRule = (result: any) => ResultGrant[];

const GRANT_RULES: Readonly<Record<string, GrantRule>> = Object.freeze({
  "barnyard-dash": (result) => (result?.mode === "cup" && result.finalPlace === 1 && result.cupId && result.level
    ? [{ gameSlug: "farm", entitlementId: barnyardTrophyId(result.cupId, result.level), kind: "catalog-item", source: "pet-games-cup" }]
    : []),
});

export function resultGrants(gameSlug: unknown, result: unknown): ResultGrant[] {
  const slug = typeof gameSlug === "string" ? gameSlug.trim().toLowerCase() : "";
  return GRANT_RULES[slug]?.(result) ?? [];
}
