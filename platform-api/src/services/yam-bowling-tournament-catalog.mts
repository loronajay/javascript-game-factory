// Rotating single-player Yam Bowling majors. The platform owns availability and
// prize odds; the cabinet receives an event document and can never name a prize.

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH_MS = Date.parse("2026-08-14T00:00:00.000Z");
const CYCLE_MS = 14 * DAY_MS;
const OPEN_MS = 4 * DAY_MS;

type TournamentRound = Readonly<{
  index: number;
  name: string;
  opponentSlug: string;
  venueSlug: string;
  modeId: "quick" | "classic";
  cpuLevelId: "competitive" | "pro" | "champion";
}>;

type TournamentTemplate = Readonly<{
  name: string;
  shortName: string;
  rounds: ReadonlyArray<TournamentRound>;
}>;

const TEMPLATES: ReadonlyArray<TournamentTemplate> = Object.freeze([
  Object.freeze({
    name: "Neon Crown Open",
    shortName: "Neon Crown",
    rounds: Object.freeze([
      Object.freeze({ index: 0, name: "Opening Round", opponentSlug: "lumi-vega", venueSlug: "neon-carnival", modeId: "quick", cpuLevelId: "competitive" }),
      Object.freeze({ index: 1, name: "Semifinal", opponentSlug: "carmen-blaze", venueSlug: "blue-circuit", modeId: "quick", cpuLevelId: "pro" }),
      Object.freeze({ index: 2, name: "Championship Final", opponentSlug: "reina-sato", venueSlug: "crimson-crown", modeId: "classic", cpuLevelId: "champion" }),
    ]),
  }),
  Object.freeze({
    name: "Cosmic Cup",
    shortName: "Cosmic Cup",
    rounds: Object.freeze([
      Object.freeze({ index: 0, name: "Opening Round", opponentSlug: "echo-sterling", venueSlug: "cosmic-bowl", modeId: "quick", cpuLevelId: "competitive" }),
      Object.freeze({ index: 1, name: "Semifinal", opponentSlug: "nyx-calder", venueSlug: "cosmic-bowl", modeId: "quick", cpuLevelId: "pro" }),
      Object.freeze({ index: 2, name: "Championship Final", opponentSlug: "scarlett-voss", venueSlug: "crimson-crown", modeId: "classic", cpuLevelId: "champion" }),
    ]),
  }),
  Object.freeze({
    name: "Royal Gold Invitational",
    shortName: "Royal Gold",
    rounds: Object.freeze([
      Object.freeze({ index: 0, name: "Opening Round", opponentSlug: "imani-cole", venueSlug: "liberty-lanes", modeId: "quick", cpuLevelId: "competitive" }),
      Object.freeze({ index: 1, name: "Semifinal", opponentSlug: "naomi-okafor", venueSlug: "royal-gold", modeId: "quick", cpuLevelId: "pro" }),
      Object.freeze({ index: 2, name: "Championship Final", opponentSlug: "reina-sato", venueSlug: "royal-gold", modeId: "classic", cpuLevelId: "champion" }),
    ]),
  }),
  Object.freeze({
    name: "Midnight Masters",
    shortName: "Midnight Masters",
    rounds: Object.freeze([
      Object.freeze({ index: 0, name: "Opening Round", opponentSlug: "sabrina-wilde", venueSlug: "sunset-strip", modeId: "quick", cpuLevelId: "competitive" }),
      Object.freeze({ index: 1, name: "Semifinal", opponentSlug: "rei-nakamura", venueSlug: "cosmic-bowl", modeId: "quick", cpuLevelId: "pro" }),
      Object.freeze({ index: 2, name: "Championship Final", opponentSlug: "reina-sato", venueSlug: "crimson-crown", modeId: "classic", cpuLevelId: "champion" }),
    ]),
  }),
]);

type EntitlementPrize = Readonly<{
  kind: "entitlement";
  entitlementId: string;
  itemId: string;
  name: string;
  tier: "rare" | "legendary";
  weight: number;
}>;
// The two spendable currencies. The union is written out rather than widened to
// `string` so a typo in a prize row is a compile error, not a prize that mints
// inventory no redemption path can ever spend.
type InventoryPrize =
  | Readonly<{
    kind: "inventory";
    itemId: "skin-voucher";
    quantity: 1;
    name: "Skin Voucher";
    tier: "legendary";
    weight: number;
  }>
  | Readonly<{
    kind: "inventory";
    itemId: "emote-voucher";
    quantity: 1;
    name: "Emote Voucher";
    tier: "rare";
    weight: number;
  }>;
type WeightedPrize = EntitlementPrize | InventoryPrize;

const EFFECT_PRIZES: ReadonlyArray<WeightedPrize> = [
  ["ball-trail:championship-gold", "Championship Gold Ball Trail"],
  ["ball-trail:bracket-fire", "Bracket Fire Ball Trail"],
  ["ball-trail:cosmic-ribbon", "Cosmic Ribbon Ball Trail"],
  ["ball-trail:royal-confetti", "Royal Confetti Ball Trail"],
  ["strike-burst:pin-crown", "Pin Crown Burst"],
  ["strike-burst:finals-fireworks", "Finals Fireworks Burst"],
  ["strike-burst:cosmic-cup", "Cosmic Cup Burst"],
  ["strike-burst:victory-ribbon", "Victory Ribbon Burst"],
].map(([entitlementId, name]) => Object.freeze({
  kind: "entitlement" as const,
  entitlementId,
  itemId: entitlementId,
  name,
  tier: "rare" as const,
  weight: 12,
}));
const PRIZES: ReadonlyArray<WeightedPrize> = Object.freeze([
  ...EFFECT_PRIZES,
  // An Emote Voucher rather than a named emote. Dropping one specific sticker
  // would mean re-rolling a prize the player already owns; a voucher is always
  // worth something while any of the thirty remain unowned, and it lets them
  // pick. Weighted high because it is the repeatable route into that pool —
  // the ladder pays only four across all thirty levels.
  Object.freeze({ kind: "inventory" as const, itemId: "emote-voucher" as const, quantity: 1 as const, name: "Emote Voucher" as const, tier: "rare" as const, weight: 14 }),
  Object.freeze({ kind: "entitlement" as const, entitlementId: "room:champion-room", itemId: "room:champion-room", name: "Champion's Room", tier: "legendary" as const, weight: 6 }),
  Object.freeze({ kind: "inventory" as const, itemId: "skin-voucher" as const, quantity: 1 as const, name: "Skin Voucher" as const, tier: "legendary" as const, weight: 3 }),
]);

function tournamentForCycle(cycleIndex: number) {
  const template = TEMPLATES[((cycleIndex % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length];
  const startsAtMs = EPOCH_MS + cycleIndex * CYCLE_MS;
  return Object.freeze({
    id: `yam-major-${String(cycleIndex).padStart(4, "0")}`,
    name: template.name,
    shortName: template.shortName,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(startsAtMs + OPEN_MS).toISOString(),
    rounds: template.rounds,
  });
}

function timestamp(value: unknown): number {
  const parsed = typeof value === "number" ? value : Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function getYamBowlingTournamentEvent(now: unknown = Date.now()): any {
  const nowMs = timestamp(now);
  if (nowMs < EPOCH_MS) return { status: "closed", event: tournamentForCycle(0) };
  const cycleIndex = Math.floor((nowMs - EPOCH_MS) / CYCLE_MS);
  const cycleStart = EPOCH_MS + cycleIndex * CYCLE_MS;
  const open = nowMs >= cycleStart && nowMs < cycleStart + OPEN_MS;
  return {
    status: open ? "open" : "closed",
    event: tournamentForCycle(open ? cycleIndex : cycleIndex + 1),
  };
}

function stableRoll(playerId: string, eventId: string): number {
  let hash = 2166136261;
  for (const character of `${playerId}:${eventId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash / 0x100000000;
}

function withoutWeight(prize: WeightedPrize): any {
  const { weight: _weight, ...result } = prize;
  return result;
}

export function selectYamBowlingTournamentPrize(params: any = {}): any {
  const owned = new Set(
    Array.isArray(params.ownedEntitlementIds)
      ? params.ownedEntitlementIds.filter((value: unknown) => typeof value === "string")
      : [],
  );
  const eligible = PRIZES.filter((prize) => prize.kind === "inventory" || !owned.has(prize.entitlementId));
  const fallback = PRIZES[PRIZES.length - 1];
  if (!eligible.length) return withoutWeight(fallback);
  const suppliedRoll = Number(params.roll);
  const roll = Number.isFinite(suppliedRoll)
    ? Math.max(0, Math.min(0.999999999, suppliedRoll))
    : stableRoll(String(params.playerId || ""), String(params.eventId || ""));
  const totalWeight = eligible.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = roll * totalWeight;
  for (const prize of eligible) {
    cursor -= prize.weight;
    if (cursor < 0) return withoutWeight(prize);
  }
  return withoutWeight(eligible[eligible.length - 1]);
}

export const YAM_BOWLING_TOURNAMENT_KIND = "yam-tournament-round";
export const YAM_BOWLING_TOURNAMENT_TITLE = Object.freeze({
  entitlementId: "title:yam-champion",
  kind: "title",
  itemId: "title:yam-champion",
  name: "Yam Champion",
  tier: "legendary",
});
