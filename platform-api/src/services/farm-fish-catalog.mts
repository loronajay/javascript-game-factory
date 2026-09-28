// The Cove's fish, server side: the species and tackle, the specimen maths, the
// bite odds, the shadows and the Cove's waters. It mirrors four pure browser
// modules — js/farm-catalog/fish.mts, js/farm-fish.mts, js/farm-cove.mts and
// the fight's floor from js/farm-fishing.mts — because this is where a fish is
// decided: the server rolls every bite (species, rank, colour), measures it,
// prices it and pays its XP, and holds every cast to the Cove's shape and its
// shadows. tests/farm-fishing.test.mjs holds the two copies equal.

import { createHmac } from "node:crypto";
import { farmSeedFor, farmSeededRandom } from "./farm-seeded-random.mjs";

// ---------------------------------------------------------------- species and tackle

export const FISH_ZONES = Object.freeze(["lagoon", "reef", "deep"] as const);
export type FishZone = (typeof FISH_ZONES)[number];
export const FISH_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"] as const);
export type FishRarity = (typeof FISH_RARITIES)[number];
export type FightStyle = "darter" | "diver" | "thrasher" | "sulker" | "leaper";

export type FishRule = Readonly<{
  id: string;
  rarity: FishRarity;
  zones: readonly FishZone[];
  weightKg: Readonly<{ min: number; avg: number; max: number }>;
  lengthM: number;
  fight: FightStyle;
  strength: number;
  value: number;
}>;

export const RARITY_XP: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 10, uncommon: 18, rare: 35, epic: 70, legendary: 150 });
export const RARITY_STRENGTH: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 0, uncommon: 0.06, rare: 0.12, epic: 0.2, legendary: 0.3 });

const rule = (key: string, rarity: FishRarity, zones: readonly FishZone[], weight: readonly [number, number, number], lengthM: number, fight: FightStyle, strength: number, value: number): FishRule =>
  Object.freeze({ id: `fish.${key}`, rarity, zones: Object.freeze([...zones]), weightKg: Object.freeze({ min: weight[0], avg: weight[1], max: weight[2] }), lengthM, fight, strength, value });

export const FARM_FISH_RULES: readonly FishRule[] = Object.freeze([
  rule("goldfish", "common", ["lagoon"], [0.05, 0.2, 0.9], 0.18, "darter", 0.12, 3),
  rule("tetra", "common", ["lagoon"], [0.02, 0.06, 0.2], 0.09, "darter", 0.08, 2),
  rule("armored-catfish", "common", ["lagoon"], [0.3, 1.2, 4], 0.45, "sulker", 0.22, 4),
  rule("cardinal-fish", "common", ["reef"], [0.03, 0.1, 0.3], 0.1, "darter", 0.1, 2),
  rule("butterfly-fish", "common", ["reef"], [0.1, 0.35, 1], 0.18, "leaper", 0.14, 3),
  rule("tang", "common", ["reef"], [0.2, 0.6, 1.6], 0.25, "darter", 0.16, 3),
  rule("cowfish", "common", ["reef"], [0.2, 0.7, 2], 0.3, "sulker", 0.14, 4),
  rule("flatfish", "common", ["reef", "deep"], [0.4, 1.5, 6], 0.4, "sulker", 0.2, 4),
  rule("blue-goldfish", "uncommon", ["lagoon"], [0.05, 0.25, 1], 0.19, "darter", 0.14, 6),
  rule("betta", "uncommon", ["lagoon"], [0.01, 0.04, 0.12], 0.07, "thrasher", 0.12, 7),
  rule("piranha", "uncommon", ["lagoon"], [0.3, 1.2, 3.5], 0.3, "thrasher", 0.3, 8),
  rule("clownfish", "uncommon", ["reef"], [0.05, 0.15, 0.4], 0.11, "darter", 0.12, 6),
  rule("yellow-tang", "uncommon", ["reef"], [0.1, 0.35, 0.9], 0.2, "darter", 0.14, 6),
  rule("blue-tang", "uncommon", ["reef"], [0.2, 0.6, 1.6], 0.28, "darter", 0.16, 7),
  rule("puffer", "uncommon", ["reef"], [0.3, 1, 3], 0.3, "sulker", 0.16, 8),
  rule("royal-gramma", "uncommon", ["reef"], [0.02, 0.06, 0.15], 0.08, "darter", 0.1, 6),
  rule("red-snapper", "uncommon", ["reef", "deep"], [1, 4, 15], 0.6, "diver", 0.36, 9),
  rule("turbot", "uncommon", ["deep"], [1, 5, 25], 0.6, "sulker", 0.34, 9),
  rule("koi", "rare", ["lagoon"], [1, 4, 20], 0.6, "sulker", 0.3, 18),
  rule("zebra-clown-fish", "rare", ["reef"], [0.06, 0.18, 0.45], 0.12, "darter", 0.14, 16),
  rule("moorish-idol", "rare", ["reef"], [0.2, 0.5, 1.2], 0.22, "leaper", 0.2, 17),
  rule("parrot-fish", "rare", ["reef"], [1, 4, 20], 0.6, "diver", 0.36, 20),
  rule("lionfish", "rare", ["reef"], [0.3, 1, 2.5], 0.35, "thrasher", 0.26, 18),
  rule("coral-grouper", "rare", ["reef", "deep"], [2, 8, 30], 0.75, "diver", 0.44, 22),
  rule("tuna", "rare", ["deep"], [20, 80, 400], 1.6, "diver", 0.58, 25),
  rule("flower-horn", "epic", ["lagoon"], [0.3, 1, 3], 0.3, "thrasher", 0.3, 50),
  rule("mandarin-fish", "epic", ["reef"], [0.02, 0.06, 0.15], 0.07, "darter", 0.14, 48),
  rule("black-lion-fish", "epic", ["reef"], [0.4, 1.2, 3], 0.38, "thrasher", 0.3, 55),
  rule("humphead", "epic", ["reef"], [20, 70, 190], 1.5, "sulker", 0.6, 60),
  rule("swordfish", "epic", ["deep"], [40, 150, 650], 2.8, "leaper", 0.7, 70),
  rule("sunfish", "epic", ["deep"], [150, 600, 2300], 2.2, "sulker", 0.72, 75),
  rule("blobfish", "epic", ["deep"], [1, 3, 9], 0.35, "sulker", 0.3, 65),
  rule("anglerfish", "legendary", ["deep"], [2, 10, 50], 0.7, "thrasher", 0.5, 220),
  rule("goblin-shark", "legendary", ["deep"], [50, 180, 700], 3, "diver", 0.7, 260),
  rule("shark", "legendary", ["deep"], [80, 300, 1100], 3.5, "diver", 0.75, 300),
]);

const FISH_BY_ID = new Map(FARM_FISH_RULES.map((entry) => [entry.id, entry]));
export const FARM_FISH_IDS: readonly string[] = Object.freeze(FARM_FISH_RULES.map((entry) => entry.id));

export function farmFishRule(id: unknown): FishRule | undefined {
  return typeof id === "string" ? FISH_BY_ID.get(id) : undefined;
}

export type RodRule = Readonly<{ id: string; minLevel: number; price: number; line: number; castRange: number; reel: number }>;
export const FARM_RODS: readonly RodRule[] = Object.freeze([
  Object.freeze({ id: "rod.1", minLevel: 1, price: 0, line: 1, castRange: 11, reel: 1.2 }),
  Object.freeze({ id: "rod.2", minLevel: 5, price: 250, line: 1.18, castRange: 14, reel: 1.45 }),
  Object.freeze({ id: "rod.3", minLevel: 12, price: 900, line: 1.36, castRange: 17, reel: 1.7 }),
  Object.freeze({ id: "rod.4", minLevel: 25, price: 2500, line: 1.56, castRange: 21, reel: 2 }),
  Object.freeze({ id: "rod.5", minLevel: 40, price: 6000, line: 1.8, castRange: 24, reel: 2.4 }),
]);
export const STARTER_ROD_ID = "rod.1";

export function farmRodRule(id: unknown): RodRule | undefined {
  return FARM_RODS.find((entry) => entry.id === id);
}

export type LureRule = Readonly<{ id: string; minLevel: number; price: number; rarity: Readonly<Partial<Record<FishRarity, number>>>; favors: readonly string[] }>;
const lure = (index: number, minLevel: number, price: number, rarity: Partial<Record<FishRarity, number>>, favors: readonly string[]): LureRule =>
  Object.freeze({ id: `lure.${index}`, minLevel, price, rarity: Object.freeze({ ...rarity }), favors: Object.freeze([...favors]) });
export const FARM_LURES: readonly LureRule[] = Object.freeze([
  lure(1, 3, 60, { uncommon: 1.5 }, ["fish.blue-goldfish", "fish.betta", "fish.piranha", "fish.koi"]),
  lure(5, 8, 140, { uncommon: 1.3, rare: 1.2 }, ["fish.yellow-tang", "fish.blue-tang", "fish.clownfish", "fish.royal-gramma"]),
  lure(3, 14, 260, { rare: 1.3 }, ["fish.zebra-clown-fish", "fish.lionfish", "fish.moorish-idol", "fish.black-lion-fish"]),
  lure(2, 22, 420, { rare: 1.5, epic: 1.3 }, ["fish.red-snapper", "fish.coral-grouper", "fish.parrot-fish"]),
  lure(4, 30, 700, { epic: 1.6, legendary: 1.3 }, ["fish.mandarin-fish", "fish.flower-horn", "fish.humphead"]),
  lure(6, 42, 1200, { epic: 1.5, legendary: 1.8 }, ["fish.swordfish", "fish.tuna", "fish.anglerfish", "fish.goblin-shark", "fish.shark"]),
]);

export function farmLureRule(id: unknown): LureRule | undefined {
  return FARM_LURES.find((entry) => entry.id === id);
}

export const WORM_ID = "bait.worm";
export const WORM_TUB = Object.freeze({ count: 10, price: 8 });
export const STARTER_WORMS = 20;
export const MAX_WORMS = 200;
export const MAX_LURES_EACH = 9;
export const CREEL_CAPACITY = 40;
export const ZONE_MIN_LEVEL: Readonly<Record<FishZone, number>> = Object.freeze({ lagoon: 1, reef: 3, deep: 15 });

// ---------------------------------------------------------------- the specimen

export const SIZE_CLASSES = Object.freeze(["tiny", "small", "average", "large", "trophy", "record"] as const);
export type SizeClass = (typeof SIZE_CLASSES)[number];
const CLASS_FLOORS: readonly (readonly [SizeClass, number])[] = Object.freeze([
  ["record", 0.997], ["trophy", 0.97], ["large", 0.8], ["average", 0.35], ["small", 0.1], ["tiny", 0],
] as const);

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

export function sizeClassForRank(rank: number): SizeClass {
  const q = clampUnit(rank);
  return CLASS_FLOORS.find(([, floor]) => q >= floor)![0];
}

export function weightGramsAtRank(species: Pick<FishRule, "weightKg">, rank: number): number {
  const u = clampUnit(rank) * 2 - 1;
  const spread = u * u * u;
  const { min, avg, max } = species.weightKg;
  const kg = spread < 0
    ? Math.exp(Math.log(avg) + (Math.log(avg) - Math.log(min)) * spread)
    : Math.exp(Math.log(avg) + (Math.log(max) - Math.log(avg)) * spread);
  return Math.max(1, Math.round(kg * 1000));
}

export function lengthMmForWeight(species: Pick<FishRule, "weightKg" | "lengthM">, weightGrams: number): number {
  const metres = species.lengthM * Math.cbrt(Math.max(1e-6, weightGrams / 1000) / species.weightKg.avg);
  return Math.max(1, Math.round(metres * 1000));
}

export const FISH_VARIANTS = Object.freeze(["normal", "shiny", "golden"] as const);
export type FishVariant = (typeof FISH_VARIANTS)[number];
export const GOLDEN_CHANCE = 1 / 4096;
export const SHINY_CHANCE = 1 / 256;
export const VARIANT_PRICE: Readonly<Record<FishVariant, number>> = Object.freeze({ normal: 1, shiny: 3, golden: 10 });

export function variantForRoll(roll: number): FishVariant {
  const v = clampUnit(roll);
  if (v < GOLDEN_CHANCE) return "golden";
  if (v < GOLDEN_CHANCE + SHINY_CHANCE) return "shiny";
  return "normal";
}

export const FISH_GRADES = Object.freeze(["poor", "normal", "fine", "perfect"] as const);
export type FishGrade = (typeof FISH_GRADES)[number];
export const GRADE_PRICE: Readonly<Record<FishGrade, number>> = Object.freeze({ poor: 0.75, normal: 1, fine: 1.2, perfect: 1.4 });
export const GRADE_XP: Readonly<Record<FishGrade, number>> = Object.freeze({ poor: 0.8, normal: 1, fine: 1.1, perfect: 1.25 });

export function isFishGrade(value: unknown): value is FishGrade {
  return typeof value === "string" && (FISH_GRADES as readonly string[]).includes(value);
}

export const WEIGHT_PRICE_EXPONENT = 0.8;
export const ESCAPE_XP = 2;

export function farmFishValue(speciesId: string, weightG: number, grade: FishGrade, variant: FishVariant): number {
  const species = farmFishRule(speciesId);
  if (!species) return 0;
  const ratio = Math.max(1e-6, weightG / 1000 / species.weightKg.avg);
  return Math.max(1, Math.round(species.value * ratio ** WEIGHT_PRICE_EXPONENT * GRADE_PRICE[grade] * VARIANT_PRICE[variant]));
}

export function farmFishXp(speciesId: string, weightG: number, grade: FishGrade): number {
  const species = farmFishRule(speciesId);
  if (!species) return 0;
  const size = Math.min(2, Math.max(0.5, Math.sqrt(weightG / 1000 / species.weightKg.avg)));
  return Math.max(1, Math.round(RARITY_XP[species.rarity] * size * GRADE_XP[grade]));
}

export function farmFishStrength(speciesId: string, weightG: number): number {
  const species = farmFishRule(speciesId);
  if (!species) return 0.2;
  const ratio = Math.max(1e-6, weightG / 1000 / species.weightKg.avg);
  return Math.min(1.2, Math.max(0.05, species.strength + RARITY_STRENGTH[species.rarity] + Math.log2(ratio) * 0.12));
}

// ---------------------------------------------------------------- the fight's floor

const NET_STAMINA = 0.3;
const STEER_BONUS = 0.5;

export function staminaDrain(style: FightStyle, strength: number): number {
  const base = 0.11 / (0.45 + Math.max(0, strength));
  return style === "sulker" ? base * 0.62 : base;
}

/** The fewest seconds a fight with this fish can take (js/farm-fishing.mts). A landing sooner is refused. */
export function minimumFightSeconds(style: FightStyle, strength: number): number {
  return (1 - NET_STAMINA) / (staminaDrain(style, strength) * (1 + STEER_BONUS));
}

// ---------------------------------------------------------------- what bites

export const BLIND_RARITY_WEIGHTS: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 64, uncommon: 26, rare: 8, epic: 1.8, legendary: 0.2 });
export const SHADOW_RARITY_WEIGHTS: Readonly<Record<FishRarity, number>> = Object.freeze({ common: 34, uncommon: 30, rare: 22, epic: 11, legendary: 3 });

export type BiteOdds = readonly Readonly<{ speciesId: string; weight: number }>[];

export function farmBiteOdds(zone: FishZone, lure: LureRule | null, kind: "blind" | "shadow"): BiteOdds {
  const table = kind === "shadow" ? SHADOW_RARITY_WEIGHTS : BLIND_RARITY_WEIGHTS;
  const pool = FARM_FISH_RULES.filter((entry) => entry.zones.includes(zone));
  const perRarity = new Map<FishRarity, number>();
  for (const entry of pool) perRarity.set(entry.rarity, (perRarity.get(entry.rarity) ?? 0) + 1);
  return pool.map((entry) => {
    const share = table[entry.rarity] * (lure?.rarity[entry.rarity] ?? 1) / (perRarity.get(entry.rarity) ?? 1);
    const favored = lure?.favors.includes(entry.id) ? 2 : 1;
    return Object.freeze({ speciesId: entry.id, weight: share * favored });
  });
}

export function pickFromOdds(odds: BiteOdds, roll: number): string {
  const total = odds.reduce((sum, entry) => sum + entry.weight, 0);
  let left = clampUnit(roll) * total;
  for (const entry of odds) {
    left -= entry.weight;
    if (left < 0) return entry.speciesId;
  }
  return odds[odds.length - 1]!.speciesId;
}

export type BiteRoll = Readonly<{ speciesId: string; rank: number; variant: FishVariant }>;

export function rollFarmBite(zone: FishZone, lure: LureRule | null, kind: "blind" | "shadow", random: () => number): BiteRoll {
  const speciesId = pickFromOdds(farmBiteOdds(zone, lure, kind), random());
  return Object.freeze({ speciesId, rank: clampUnit(random()), variant: variantForRoll(random()) });
}

// ---------------------------------------------------------------- the Cove's waters

export type Rect = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => Object.freeze({ minX, maxX, minZ, maxZ });

export const SHORE_Z = 6;
export const SPIT_HALF = 2;
export const DEEP_Z = -8;
const FAR = 400;
export const LAGOON_FAR = rect(-46, -SPIT_HALF, -44, SHORE_Z);
export const SEA_FAR = rect(SPIT_HALF, FAR, -FAR, SHORE_Z);
export const NORTH_SEA_FAR = rect(-SPIT_HALF, FAR, -FAR, -26);
const CORNER = 3;
export const CAST_SHORE_MARGIN = 0.9;

export const COVE_DOCK_DECKS: readonly Rect[] = Object.freeze([
  rect(-11.2, -8.8, -2, SHORE_Z + 0.8),
  rect(9.8, 12.2, -7, SHORE_Z + 0.8),
  rect(7.6, 14.4, -11, -7),
]);

function insideRect(point: Readonly<{ x: number; z: number }>, box: Rect, margin = 0): boolean {
  return point.x >= box.minX - margin && point.x <= box.maxX + margin && point.z >= box.minZ - margin && point.z <= box.maxZ + margin;
}

export function roundedInside(point: Readonly<{ x: number; z: number }>, box: Rect, radius = CORNER): number {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const hx = (box.maxX - box.minX) / 2 - radius;
  const hz = (box.maxZ - box.minZ) / 2 - radius;
  const qx = Math.abs(point.x - cx) - hx;
  const qz = Math.abs(point.z - cz) - hz;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius;
  return -outside;
}

/** The fishing zone a cast lands in, or null: on land, too close under the bank, or on a dock. */
export function farmCoveZoneAt(point: Readonly<{ x: number; z: number }>): FishZone | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const lagoon = roundedInside(point, LAGOON_FAR);
  const sea = lagoon > 0 ? -1 : Math.max(roundedInside(point, SEA_FAR), roundedInside(point, NORTH_SEA_FAR));
  const inside = Math.max(lagoon, sea);
  if (inside < CAST_SHORE_MARGIN) return null;
  if (COVE_DOCK_DECKS.some((deck) => insideRect(point, deck, 0.3))) return null;
  if (lagoon > 0) return "lagoon";
  return point.z < DEEP_Z ? "deep" : "reef";
}

// ---------------------------------------------------------------- the shadows

export const SHADOW_WINDOW_MS = 5 * 60 * 1000;
export const SHADOWS_PER_ZONE: Readonly<Record<FishZone, number>> = Object.freeze({ lagoon: 5, reef: 4, deep: 3 });
export const SHADOW_REACH = 2.2;
export const SHADOW_SLACK = 1.4;

export const SHADOW_WATERS: Readonly<Record<FishZone, readonly Rect[]>> = Object.freeze({
  lagoon: Object.freeze([rect(-18.5, -12.4, -18.5, 2.6), rect(-8, -3.8, -18.5, 2.6), rect(-12.4, -8, -18.5, -3.4)]),
  reef: Object.freeze([rect(3.6, 8.6, -6.6, 3), rect(13.4, 18.5, -6.6, 3)]),
  deep: Object.freeze([rect(3.6, 18.5, -18.5, -12.4), rect(3.6, 6.4, -12.4, -8.6), rect(15.6, 18.5, -12.4, -8.6)]),
});

export type ShadowSize = "s" | "m" | "l" | "xl";
export function shadowSizeForLength(lengthMm: number): ShadowSize {
  if (lengthMm < 200) return "s";
  if (lengthMm < 500) return "m";
  if (lengthMm < 1200) return "l";
  return "xl";
}

export type ShadowPath = Readonly<{ cx: number; cz: number; rx: number; rz: number; speed: number; phase: number; turn: 1 | -1 }>;
export type PublicShadow = Readonly<{ id: string; zone: FishZone; size: ShadowSize; fin: boolean; path: ShadowPath; bornAt: number; goneAt: number }>;
export type Shadow = PublicShadow & Readonly<{ speciesId: string; rank: number; variant: FishVariant }>;

export function shadowWindow(now: number): number {
  return Math.floor(now / SHADOW_WINDOW_MS);
}

export function shadowAt(shadow: PublicShadow, now: number): Readonly<{ x: number; z: number }> | null {
  if (now < shadow.bornAt || now > shadow.goneAt) return null;
  const { cx, cz, rx, rz, speed, phase, turn } = shadow.path;
  const angle = phase + turn * speed * (now - shadow.bornAt) / 1000;
  return { x: cx + rx * Math.cos(angle), z: cz + rz * Math.sin(angle) };
}

function loopInside(box: Rect, random: () => number): ShadowPath {
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  const rx = Math.max(0.4, Math.min(3.2, width / 2 - 0.3) * (0.4 + random() * 0.6));
  const rz = Math.max(0.4, Math.min(3.2, depth / 2 - 0.3) * (0.4 + random() * 0.6));
  const cx = box.minX + rx + random() * Math.max(0, width - rx * 2);
  const cz = box.minZ + rz + random() * Math.max(0, depth - rz * 2);
  const speed = (0.35 + random() * 0.3) / Math.max(rx, rz);
  return Object.freeze({ cx, cz, rx, rz, speed, phase: random() * Math.PI * 2, turn: random() < 0.5 ? 1 : -1 });
}

export function generateShadows(window: number, paths: () => number, fish: () => number): Shadow[] {
  const start = window * SHADOW_WINDOW_MS;
  const out: Shadow[] = [];
  for (const zone of ["lagoon", "reef", "deep"] as const) {
    const waters = SHADOW_WATERS[zone];
    for (let slot = 0; slot < SHADOWS_PER_ZONE[zone]; slot += 1) {
      const box = waters[Math.floor(paths() * waters.length) % waters.length]!;
      const path = loopInside(box, paths);
      const bite = rollFarmBite(zone, null, "shadow", fish);
      const species = farmFishRule(bite.speciesId)!;
      const lengthMm = lengthMmForWeight(species, weightGramsAtRank(species, bite.rank));
      const bornAt = start + Math.floor(paths() * SHADOW_WINDOW_MS * 0.35);
      const goneAt = Math.min(start + SHADOW_WINDOW_MS * 1.3, bornAt + SHADOW_WINDOW_MS * (0.55 + paths() * 0.45));
      out.push(Object.freeze({
        id: `s${window}-${zone}-${slot}`,
        zone,
        size: shadowSizeForLength(lengthMm),
        fin: species.rarity === "epic" || species.rarity === "legendary",
        path,
        bornAt,
        goneAt,
        speciesId: bite.speciesId,
        rank: bite.rank,
        variant: bite.variant,
      }));
    }
  }
  return out;
}

export function publicShadow(shadow: Shadow): PublicShadow {
  return Object.freeze({ id: shadow.id, zone: shadow.zone, size: shadow.size, fin: shadow.fin, path: shadow.path, bornAt: shadow.bornAt, goneAt: shadow.goneAt });
}

/** The secret the fish are drawn from. Kept off the wire; a missing one falls back so development still works. */
function shadowSecret(env: Record<string, string | undefined> = process.env): string {
  return env.FARM_FISH_SECRET || env.JWT_SECRET || "cove-development-seed";
}

/**
 * The window's shadows as the server knows them. Paths come from a public seed
 * (the window's number); the fish from an HMAC of the secret, so the pool
 * cannot be read ahead of time from anything the clients are shown.
 */
export function farmShadowsForWindow(window: number, env?: Record<string, string | undefined>): Shadow[] {
  const digest = createHmac("sha256", shadowSecret(env)).update(`farm-cove-fish:${window}`).digest();
  return generateShadows(window, farmSeededRandom(farmSeedFor(`farm-cove-shadows:v1:${window}`)), farmSeededRandom(digest.readUInt32BE(0)));
}

/** The shadow a lure landing here at `now` is close enough to, or null (with the server's slack). */
export function farmShadowInReach(shadows: readonly Shadow[], shadowId: string, point: Readonly<{ x: number; z: number }>, now: number): Shadow | null {
  const shadow = shadows.find((entry) => entry.id === shadowId);
  if (!shadow) return null;
  const at = shadowAt(shadow, now);
  if (!at) return null;
  return Math.hypot(at.x - point.x, at.z - point.z) <= SHADOW_REACH + SHADOW_SLACK ? shadow : null;
}

const SHADOW_ID = /^s(\d{1,12})-(lagoon|reef|deep)-(\d{1,2})$/;
export function parseShadowId(value: unknown): Readonly<{ window: number; zone: FishZone }> | null {
  if (typeof value !== "string") return null;
  const match = SHADOW_ID.exec(value);
  return match ? { window: Number(match[1]), zone: match[2] as FishZone } : null;
}

// ---------------------------------------------------------------- what a recipe or an order asks for

/**
 * A fish need: which fish will do, as a small key both sides read the same way
 * (js/farm-fish.mts mirrors it). One of a species, a water or a rarity (that or
 * better), and optionally a size (that class or bigger):
 *   "species=fish.koi"   "zone=reef"   "rarity=rare"   "zone=deep,size=large"
 * A need never names a colour or a grade: any Koi is a Koi to the kitchen.
 */
export type FishNeed = Readonly<{ species?: string; zone?: FishZone; rarity?: FishRarity; size?: SizeClass }>;

const NEED_PART = /^(species|zone|rarity|size)=([a-z0-9.-]+)$/;

export function parseFishNeed(key: unknown): FishNeed | null {
  if (typeof key !== "string" || !key || key.length > 60) return null;
  const need: { species?: string; zone?: FishZone; rarity?: FishRarity; size?: SizeClass } = {};
  for (const part of key.split(",")) {
    const match = NEED_PART.exec(part);
    if (!match) return null;
    const [, field, value] = match;
    if (field === "species" && farmFishRule(value) && !need.species) need.species = value;
    else if (field === "zone" && (FISH_ZONES as readonly string[]).includes(value!) && !need.zone) need.zone = value as FishZone;
    else if (field === "rarity" && (FISH_RARITIES as readonly string[]).includes(value!) && !need.rarity) need.rarity = value as FishRarity;
    else if (field === "size" && (SIZE_CLASSES as readonly string[]).includes(value!) && !need.size) need.size = value as SizeClass;
    else return null;
  }
  if (!need.species && !need.zone && !need.rarity) return null;
  return Object.freeze(need);
}

/** Whether a fish of `speciesId` and `sizeClass` meets the need. */
export function fishMeetsNeed(need: FishNeed, speciesId: string, sizeClass: string): boolean {
  const rule = farmFishRule(speciesId);
  if (!rule) return false;
  if (need.species && need.species !== speciesId) return false;
  if (need.zone && !rule.zones.includes(need.zone)) return false;
  if (need.rarity && FISH_RARITIES.indexOf(rule.rarity) < FISH_RARITIES.indexOf(need.rarity)) return false;
  if (need.size && SIZE_CLASSES.indexOf(sizeClass as SizeClass) < SIZE_CLASSES.indexOf(need.size)) return false;
  return true;
}

/** The species that could meet a need (any size). */
export function fishForNeed(need: FishNeed): FishRule[] {
  return FARM_FISH_RULES.filter((rule) => fishMeetsNeed(need, rule.id, "record"));
}

/** The rank a size class starts at, for pricing a need that asks for one. */
const SIZE_RANK: Readonly<Record<SizeClass, number>> = Object.freeze({ tiny: 0.05, small: 0.2, average: 0.5, large: 0.85, trophy: 0.975, record: 0.998 });

/**
 * What one fish meeting a need is worth, at its cheapest: the least valuable
 * species that would do, at the smallest size the need allows (average when it
 * names none), Normal grade, ordinary colour. It prices a dish's fish and an
 * order's lines, so an order never pays for more fish than it asks for.
 */
export function farmFishNeedValue(need: FishNeed): number {
  const rank = need.size ? SIZE_RANK[need.size] : 0.5;
  const values = fishForNeed(need).map((rule) => farmFishValue(rule.id, weightGramsAtRank(rule, rank), "normal", "normal"));
  return values.length ? Math.min(...values) : 0;
}

/** The Fishing XP one such fish would have paid, at its cheapest (for an order's XP). */
export function farmFishNeedXp(need: FishNeed): number {
  const rank = need.size ? SIZE_RANK[need.size] : 0.5;
  const values = fishForNeed(need).map((rule) => farmFishXp(rule.id, weightGramsAtRank(rule, rank), "normal"));
  return values.length ? Math.min(...values) : 0;
}

/**
 * Pick `count` fish for a need out of a creel, the least valuable first, never
 * a locked one. Null when the creel cannot cover it. Rows are the database's
 * (`species_id`, `size_class`, `weight_g`, `grade`, `variant`, `locked`).
 */
export function pickFishForNeed<T extends { species_id: string; size_class: string; weight_g: number; grade: string; variant: string; locked: boolean }>(
  rows: readonly T[], need: FishNeed, count: number, taken: ReadonlySet<T> = new Set(),
): T[] | null {
  const fits = rows
    .filter((row) => !row.locked && !taken.has(row) && fishMeetsNeed(need, row.species_id, row.size_class))
    .map((row) => ({ row, value: farmFishValue(row.species_id, Number(row.weight_g), isFishGrade(row.grade) ? row.grade : "normal", (FISH_VARIANTS as readonly string[]).includes(row.variant) ? row.variant as FishVariant : "normal") }))
    .sort((left, right) => left.value - right.value);
  return fits.length >= count ? fits.slice(0, count).map((entry) => entry.row) : null;
}

export const FISH_ID = /^fish-[A-Za-z0-9-]{8,64}$/;
/** What a player may keep mounted at once, and what Old Pike charges to mount one. */
export const MAX_MOUNTED_FISH = 30;
export const MOUNT_FEE = 25;
export const TROPHY_MOUNT_ITEM_ID = "decor.prop.trophy-mount";
