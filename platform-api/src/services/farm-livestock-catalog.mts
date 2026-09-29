// Livestock, the server's copy (planning-docs/FARM_LIVESTOCK_PLAN.md).
//
// The page's catalog (js/farm-catalog/livestock.mts) presents animals; this
// one DECIDES them: what a young one costs at the Livestock Dealer, the range
// its stats are rolled in, its coat, and the homes a farm's buildings give it.
// `platform-api/tests/farm-livestock.test.mjs` holds the two copies equal — the
// prices, stat ranges, coats, growth and the home ids — so neither can drift.
//
// Room comes from buildings, never from a species cap: every Stable stall
// holds one, the Barn floor two, a Small Pen two, a Large Pen four and a
// Chicken Coop six chickens (and nothing but chickens). The ids are the
// page's (`js/farm-livestock-housing.mts`): `<instanceId>#stall-N`,
// `<instanceId>#floor`, `<instanceId>#pen`, `<instanceId>#coop`.

export const LIVESTOCK_STATS = Object.freeze(["yield", "quality", "growth", "hardiness"] as const);
export type LivestockStat = typeof LIVESTOCK_STATS[number];
export type LivestockStats = Record<LivestockStat, number>;
type Range = Readonly<{ min: number; max: number }>;

export const STAT_MIN = 1;
export const STAT_MAX = 100;
export const LIVESTOCK_NAME_MAX = 24;
/** A hard ceiling on one farm's herd, whatever it builds: a guard, not a design number. */
export const MAX_HERD = 60;
export const GRADE_THRESHOLDS = Object.freeze([0, 25, 40, 55, 70] as const);

/** `onlyFrom`: given by that sex only (a hen's eggs); absent, by either. */
export type LivestockGoodRule = Readonly<{ itemId: string; everyDays: number; dayValue: number; onlyFrom?: "female" | "male" }>;
/** What the Butcher cuts a grown one into: one meat per species, `cuts` from an average one at its prime. */
export type LivestockMeatRule = Readonly<{ itemId: string; cuts: number }>;

export type LivestockRule = Readonly<{
  id: string;
  title: string;
  price: number;
  /** The Husbandry level the Livestock Dealer sells this species at. Animals already owned are never taken back. */
  minLevel: number;
  adultDays: number;
  /** Well-fed farm days a mother carries a young one. */
  gestationDays: number;
  /** What it gives once grown; basket ids, graded like crops. */
  products: readonly LivestockGoodRule[];
  meat: LivestockMeatRule;
  /** Its own feed from the supply shop, else these crops from the basket. */
  feeds: Readonly<{ supply: string; crops: readonly string[] }>;
  stats: Readonly<Record<LivestockStat, Range>>;
  coats: readonly Readonly<{ id: string; weight: number }>[];
  names: readonly string[];
}>;

const range = (min: number, max: number): Range => Object.freeze({ min, max });

function rule(variant: string, spec: Omit<LivestockRule, "id">): LivestockRule {
  return Object.freeze({
    ...spec,
    id: `livestock.${variant}`,
    stats: Object.freeze({ ...spec.stats }),
    products: Object.freeze(spec.products.map((product) => Object.freeze({ ...product }))),
    meat: Object.freeze({ ...spec.meat }),
    feeds: Object.freeze({ supply: spec.feeds.supply, crops: Object.freeze([...spec.feeds.crops]) }),
    coats: Object.freeze(spec.coats.map((coat) => Object.freeze({ ...coat }))),
    names: Object.freeze([...spec.names]),
  });
}

export const FARM_LIVESTOCK_RULES: readonly LivestockRule[] = Object.freeze([
  rule("chicken", {
    title: "Chicken", price: 120, minLevel: 1, adultDays: 2, gestationDays: 1,
    products: [{ itemId: "egg", everyDays: 1, dayValue: 10, onlyFrom: "female" }],
    meat: { itemId: "chicken-meat", cuts: 3 },
    feeds: { supply: "food.chicken-feed", crops: ["corn", "sunflower", "bean", "blueberry"] },
    stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(25, 70) },
    coats: [{ id: "standard", weight: 50 }, { id: "buff", weight: 25 }, { id: "black", weight: 20 }, { id: "speckled", weight: 5 }],
    names: ["Henny", "Nugget", "Ginger", "Biscuit", "Popcorn", "Peaches", "Dumpling", "Sunny", "Pepper", "Goldie"],
  }),
  rule("sheep", {
    title: "Sheep", price: 350, minLevel: 1, adultDays: 2, gestationDays: 2,
    products: [{ itemId: "milk-sheep", everyDays: 1, dayValue: 14 }, { itemId: "wool", everyDays: 3, dayValue: 12 }],
    meat: { itemId: "mutton", cuts: 4 },
    feeds: { supply: "food.hay", crops: ["cabbage", "carrot", "radish", "beetroot"] },
    stats: { yield: range(15, 60), quality: range(15, 60), growth: range(25, 70), hardiness: range(30, 75) },
    coats: [{ id: "standard", weight: 60 }, { id: "black", weight: 20 }, { id: "moorit", weight: 15 }, { id: "silver", weight: 5 }],
    names: ["Clover", "Woolly", "Dolly", "Bramble", "Fleecy", "Lambert", "Willow", "Pip", "Nutmeg", "Snowdrop"],
  }),
  rule("pig", {
    title: "Pig", price: 400, minLevel: 5, adultDays: 2, gestationDays: 2,
    products: [],
    meat: { itemId: "pork", cuts: 6 },
    feeds: { supply: "food.pig-feed", crops: ["potato", "pumpkin", "corn", "beetroot", "watermelon", "apple"] },
    stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(30, 75) },
    coats: [{ id: "standard", weight: 55 }, { id: "berkshire", weight: 20 }, { id: "tamworth", weight: 20 }, { id: "spotted", weight: 5 }],
    names: ["Truffle", "Hamlet", "Porkchop", "Rosie", "Wilbur", "Peony", "Babe", "Mudge", "Oinkers", "Bacon"],
  }),
  rule("cow", {
    title: "Cow", price: 750, minLevel: 10, adultDays: 3, gestationDays: 3,
    products: [{ itemId: "milk", everyDays: 1, dayValue: 28 }],
    meat: { itemId: "beef", cuts: 8 },
    feeds: { supply: "food.hay", crops: ["corn", "cabbage", "pumpkin"] },
    stats: { yield: range(15, 60), quality: range(15, 60), growth: range(20, 65), hardiness: range(35, 80) },
    coats: [{ id: "standard", weight: 50 }, { id: "jersey", weight: 25 }, { id: "angus", weight: 20 }, { id: "highland", weight: 5 }],
    names: ["Bessie", "Daisy", "Buttercup", "Clementine", "Moolan", "Hazel", "Marigold", "Duchess", "Bluebell", "Caramel"],
  }),
  rule("llama", {
    title: "Llama", price: 650, minLevel: 15, adultDays: 3, gestationDays: 3,
    products: [{ itemId: "wool-llama", everyDays: 3, dayValue: 22 }],
    meat: { itemId: "llama-meat", cuts: 5 },
    feeds: { supply: "food.hay", crops: ["carrot", "corn", "cabbage"] },
    stats: { yield: range(15, 60), quality: range(20, 65), growth: range(20, 65), hardiness: range(40, 85) },
    coats: [{ id: "standard", weight: 50 }, { id: "cream", weight: 25 }, { id: "charcoal", weight: 20 }, { id: "appaloosa", weight: 5 }],
    names: ["Dolly", "Kuzco", "Paco", "Pisco", "Andes", "Machu", "Tina", "Quinoa", "Chewie", "Fernando"],
  }),
]);

export function farmLivestockRule(id: unknown): LivestockRule | null {
  return typeof id === "string" ? FARM_LIVESTOCK_RULES.find((entry) => entry.id === id) ?? null : null;
}

/** The goods one animal gives: its species' goods, less those only the other sex gives (a rooster lays no eggs). */
export function farmLivestockProductsFor(entry: Pick<LivestockRule, "products">, gender: unknown): readonly LivestockGoodRule[] {
  return entry.products.filter((product) => !product.onlyFrom || product.onlyFrom === gender);
}

function unit(random: () => number): number {
  const sample = random();
  return Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0));
}

export function clampStat(value: unknown): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(STAT_MAX, Math.max(STAT_MIN, number)) : STAT_MIN;
}

/** The page's `rollStat`: uniform, whole, inside the range. */
export function rollStat(bounds: Range, random: () => number): number {
  return clampStat(bounds.min + Math.floor(unit(random) * (bounds.max - bounds.min + 1)));
}

export function livestockGrade(stats: LivestockStats): number {
  const mean = Math.round((LIVESTOCK_STATS.reduce((sum, key) => sum + stats[key], 0) / LIVESTOCK_STATS.length) * 10) / 10;
  let grade = 1;
  GRADE_THRESHOLDS.forEach((threshold, index) => { if (mean >= threshold) grade = index + 1; });
  return grade;
}

/** A Dealer's young one: its sex, coat, stats and a name off the species' list. Order of draws is fixed so a seeded test is stable. */
export function rollFarmLivestock(speciesId: unknown, random: () => number = Math.random): { gender: "female" | "male"; coatId: string; stats: LivestockStats; name: string } | null {
  const entry = farmLivestockRule(speciesId);
  if (!entry) return null;
  const gender = unit(random) < 0.5 ? "female" : "male";
  const total = entry.coats.reduce((sum, coat) => sum + coat.weight, 0);
  const roll = unit(random) * total;
  let cursor = 0;
  const coatId = (entry.coats.find((coat) => (cursor += coat.weight) > roll) ?? entry.coats[0]!).id;
  const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, rollStat(entry.stats[key], random)])) as LivestockStats;
  const name = entry.names[Math.floor(unit(random) * entry.names.length)]!;
  return { gender, coatId, stats, name };
}

export function cleanLivestockName(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, LIVESTOCK_NAME_MAX) : "";
  return text || fallback;
}

// ---------------------------------------------------------------- homes

const STABLE_STALLS = 3;
const BARN_SLOTS = 2;
const COOP_SLOTS = 6;
/** The coop is for chickens only. */
const COOP_SPECIES: readonly string[] = Object.freeze(["livestock.chicken"]);
const PEN_SLOTS: Readonly<Record<string, number>> = Object.freeze({
  "decor.building.pen-small": 2,
  "decor.building.pen-large": 4,
});

/** `species`: the only species it takes; absent, any. */
export type FarmLivestockHome = Readonly<{ id: string; slots: number; species?: readonly string[] }>;

export function farmHomeTakes(home: FarmLivestockHome, speciesId: unknown): boolean {
  return !home.species || (typeof speciesId === "string" && home.species.includes(speciesId));
}

/** Every home a farm's decor rows make, in row order — the page's `livestockHomes` without the geometry. */
export function farmLivestockHomes(decor: unknown): FarmLivestockHome[] {
  const homes: FarmLivestockHome[] = [];
  for (const row of Array.isArray(decor) ? decor : []) {
    const itemId = String(row?.itemId ?? "");
    const instanceId = String(row?.instanceId ?? "");
    if (!instanceId) continue;
    if (itemId === "decor.building.stable") {
      for (let index = 1; index <= STABLE_STALLS; index += 1) homes.push({ id: `${instanceId}#stall-${index}`, slots: 1 });
    } else if (itemId === "decor.building.barn") {
      homes.push({ id: `${instanceId}#floor`, slots: BARN_SLOTS });
    } else if (PEN_SLOTS[itemId]) {
      homes.push({ id: `${instanceId}#pen`, slots: PEN_SLOTS[itemId]! });
    } else if (itemId === "decor.building.coop") {
      homes.push({ id: `${instanceId}#coop`, slots: COOP_SLOTS, species: COOP_SPECIES });
    }
  }
  return homes;
}

/**
 * The first home with room for one of `speciesId`, or `wanted` if it has room
 * and takes that species; null when the farm is full for it. `herdHomes` are
 * the homes the live herd names.
 */
export function pickFarmLivestockHome(homes: readonly FarmLivestockHome[], herdHomes: readonly (string | null)[], wanted: unknown, speciesId: unknown): FarmLivestockHome | null {
  const counts = new Map<string, number>();
  for (const id of herdHomes) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const hasRoom = (entry: FarmLivestockHome): boolean => (counts.get(entry.id) ?? 0) < entry.slots && farmHomeTakes(entry, speciesId);
  if (typeof wanted === "string" && wanted) {
    const chosen = homes.find((entry) => entry.id === wanted);
    return chosen && hasRoom(chosen) ? chosen : null;
  }
  return homes.find(hasRoom) ?? null;
}

// ---------------------------------------------------------------- goods and feed

/** Every good livestock give (basket ids): the Produce Merchant buys them, graded like crops. */
export const FARM_LIVESTOCK_GOODS: readonly LivestockGoodRule[] = Object.freeze(FARM_LIVESTOCK_RULES.flatMap((entry) => entry.products));
export const AVERAGE_GOODS_PER_COLLECTION = 1.5;

export function farmLivestockGood(itemId: unknown): LivestockGoodRule | null {
  return FARM_LIVESTOCK_GOODS.find((good) => good.itemId === itemId) ?? null;
}

/** A good's Normal price: its day value over its cycle, per piece (the page's `livestockGoodPrice`). */
export function farmLivestockGoodPrice(good: Pick<LivestockGoodRule, "dayValue" | "everyDays">): number {
  return Math.ceil((good.dayValue * good.everyDays) / AVERAGE_GOODS_PER_COLLECTION);
}

/** Livestock feed in the supply shop, by price (the page's LIVESTOCK_FEEDS; services/farm-economy-catalog sells the same three). */
export const FARM_LIVESTOCK_FEED_PRICES: Readonly<Record<string, number>> = Object.freeze({ "food.hay": 8, "food.pig-feed": 8, "food.chicken-feed": 6 });

// ---------------------------------------------------------------- care (js/farm-livestock-care.mts, rule for rule)

const DAY = 24 * 60;
export const HUNGER_PER_DAY = 25;
export const HARDINESS_SPREAD = 0.6;
export const GROWTH_SPREAD = 0.6;
export const SERVING = 35;
export const FULL = 100;
export const HUNGRY_AT = 40;
export const STARVE_GRACE_MINUTES = DAY;
export const YIELD_STEP = 40;
export const STRESS_WEIGHT = 60;
export const GOOD_GRADE_SCORES = Object.freeze({ perfect: 70, fine: 45, normal: 20 } as const);

/** `neglect`: lifetime farm minutes spent hungry (at or below HUNGRY_AT), at any age — what the Butcher's grade reads. */
/** A mother carrying a young one (Phase 5): the sire as he was at the pairing, well-fed minutes carried, and the minute it came due. */
export type LivestockPregnancy = { sireId: string; sireName: string; sireStats: LivestockStats; sireCoatId: string; conceivedAt: number; progress: number; dueAt: number | null };
export type LivestockCare = {
  hunger: number; at: number; starvedAt: number | null; progress: Record<string, number>; stress: Record<string, number>; neglect: number;
  pregnancy: LivestockPregnancy | null;
  /** She rests after a birth: no pairing before this farm minute. */
  restUntil: number;
};
export type CareSubject = Readonly<{ speciesId: string; stats: LivestockStats; bornAt: number }>;
export type GoodQuality = "poor" | "normal" | "fine" | "perfect";

export function newLivestockCare(at: number): LivestockCare {
  return { hunger: FULL, at: Math.max(0, at), starvedAt: null, progress: {}, stress: {}, neglect: 0, pregnancy: null, restUntil: 0 };
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const STOCK_ID = /^stock-[A-Za-z0-9-]{8,64}$/;

export function normalizeLivestockPregnancy(value: unknown): LivestockPregnancy | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, any>;
  const sireId = typeof source.sireId === "string" && STOCK_ID.test(source.sireId) ? source.sireId : "";
  if (!sireId) return null;
  const stats = source.sireStats && typeof source.sireStats === "object" ? source.sireStats : {};
  return {
    sireId,
    sireName: typeof source.sireName === "string" ? source.sireName.slice(0, 40) : "",
    sireStats: Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, clampStat(stats[key])])) as LivestockStats,
    sireCoatId: typeof source.sireCoatId === "string" ? source.sireCoatId.slice(0, 40) : "",
    conceivedAt: Math.max(0, finite(source.conceivedAt)),
    progress: Math.max(0, finite(source.progress)),
    dueAt: source.dueAt === null || source.dueAt === undefined ? null : Math.max(0, finite(source.dueAt)),
  };
}

export function normalizeLivestockCare(value: unknown, fallbackAt: number): LivestockCare {
  if (!value || typeof value !== "object") return newLivestockCare(fallbackAt);
  const source = value as Record<string, any>;
  const minutes = (table: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (table && typeof table === "object") {
      for (const [id, raw] of Object.entries(table as Record<string, unknown>).slice(0, 8)) {
        if (/^[a-z0-9-]{1,40}$/.test(id)) out[id] = Math.max(0, finite(raw));
      }
    }
    return out;
  };
  return {
    hunger: Math.min(FULL, Math.max(0, finite(source.hunger, FULL))),
    at: Math.max(0, finite(source.at, fallbackAt)),
    starvedAt: source.starvedAt === null || source.starvedAt === undefined ? null : Math.max(0, finite(source.starvedAt)),
    progress: minutes(source.progress),
    stress: minutes(source.stress),
    neglect: Math.max(0, finite(source.neglect)),
    pregnancy: normalizeLivestockPregnancy(source.pregnancy),
    restUntil: Math.max(0, finite(source.restUntil)),
  };
}

export function hungerPerMinute(stats: LivestockStats): number {
  return (HUNGER_PER_DAY * (1 + HARDINESS_SPREAD * (0.5 - stats.hardiness / STAT_MAX))) / DAY;
}

export function adultAgeDays(entry: Pick<LivestockRule, "adultDays">, stats: LivestockStats): number {
  return entry.adultDays * (1 + GROWTH_SPREAD * (0.5 - stats.growth / STAT_MAX));
}

export function adultMinute(subject: CareSubject, entry: LivestockRule): number {
  return subject.bornAt + adultAgeDays(entry, subject.stats) * DAY;
}

function overlap(start: number, end: number, from: number): number {
  return Math.max(0, end - Math.max(start, from));
}

export function advanceLivestockCare(subject: CareSubject, care: LivestockCare, now: number): LivestockCare {
  const entry = farmLivestockRule(subject.speciesId);
  if (!entry || !(now > care.at)) return care;
  const start = care.at;
  const end = now;
  const rate = hungerPerMinute(subject.stats);
  const wellUntil = Math.min(end, care.hunger > HUNGRY_AT ? start + (care.hunger - HUNGRY_AT) / rate : start);
  const grownFrom = adultMinute(subject, entry);
  const well = overlap(start, wellUntil, grownFrom);
  const hungry = overlap(Math.max(start, wellUntil), end, grownFrom);
  const progress: Record<string, number> = { ...care.progress };
  const stress: Record<string, number> = { ...care.stress };
  for (const product of entry.products) {
    const cycle = product.everyDays * DAY;
    const before = progress[product.itemId] ?? 0;
    if (before < cycle) stress[product.itemId] = Math.min(cycle, (stress[product.itemId] ?? 0) + hungry);
    progress[product.itemId] = Math.min(cycle, before + well);
  }
  const hunger = Math.max(0, care.hunger - rate * (end - start));
  const emptyAt = start + care.hunger / rate;
  const starvedAt = hunger > 0 ? null : care.starvedAt ?? Math.min(end, emptyAt);
  const neglect = care.neglect + Math.max(0, end - Math.max(start, wellUntil));
  const pregnancy = carryPregnancy(care.pregnancy, entry.gestationDays * DAY, Math.max(start, grownFrom), well);
  return { ...care, hunger, at: end, starvedAt, progress, stress, neglect, pregnancy };
}

/** The page's `carryPregnancy`: well-fed minutes toward the gestation, and the exact minute it came due. */
function carryPregnancy(pregnancy: LivestockPregnancy | null, gestation: number, from: number, well: number): LivestockPregnancy | null {
  if (!pregnancy || pregnancy.dueAt !== null || !(well > 0)) return pregnancy;
  const reached = pregnancy.progress + well >= gestation;
  return {
    ...pregnancy,
    progress: Math.min(gestation, pregnancy.progress + well),
    dueAt: reached ? from + Math.max(0, gestation - pregnancy.progress) : null,
  };
}

export function livestockDeathMinute(subject: CareSubject, care: LivestockCare): number {
  if (care.hunger > 0 && care.starvedAt === null) return care.at + care.hunger / hungerPerMinute(subject.stats) + STARVE_GRACE_MINUTES;
  return (care.starvedAt ?? care.at) + STARVE_GRACE_MINUTES;
}

export function feedLivestockCare(care: LivestockCare): LivestockCare {
  const hunger = Math.min(FULL, care.hunger + SERVING);
  return { ...care, hunger, starvedAt: hunger > 0 ? null : care.starvedAt };
}

export function wantsFood(care: LivestockCare): boolean {
  return care.hunger < FULL - 0.5;
}

export function goodsPerCollection(stats: LivestockStats): number {
  return 1 + Math.floor(stats.yield / YIELD_STEP);
}

export function goodQuality(stats: LivestockStats, stressMinutes: number, cycleMinutes: number): GoodQuality {
  const score = stats.quality - STRESS_WEIGHT * Math.min(1, Math.max(0, stressMinutes) / Math.max(1, cycleMinutes));
  if (score >= GOOD_GRADE_SCORES.perfect) return "perfect";
  if (score >= GOOD_GRADE_SCORES.fine) return "fine";
  if (score >= GOOD_GRADE_SCORES.normal) return "normal";
  return "poor";
}

// ---------------------------------------------------------------- Husbandry (js/farm-livestock-care.mts, rule for rule)

/** Husbandry XP a collection earns per farm day of its good's cycle — the same rate a crop pays Farming per growing day. */
export const HUSBANDRY_XP_PER_CYCLE_DAY = 60;

/**
 * A collection's Husbandry XP: the good's cycle in farm days, less the share
 * of that cycle the animal spent hungry — the same stress that cut the good's
 * grade — never below one. How many pieces a high-Yield animal gives does not
 * change it: XP rewards keeping the animal, not its luck.
 */
export function livestockCollectXp(good: Pick<LivestockGoodRule, "everyDays">, stressMinutes: number): number {
  const cycle = good.everyDays * DAY;
  const share = Math.min(1, Math.max(0, Number(stressMinutes) || 0) / Math.max(1, cycle));
  return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * good.everyDays * (1 - share)));
}

// ---------------------------------------------------------------- the Butcher (js/farm-livestock-butcher.mts, rule for rule)

/** Every meat the Butcher cuts (basket ids), graded like milk. */
export const FARM_LIVESTOCK_MEATS: readonly LivestockMeatRule[] = Object.freeze(FARM_LIVESTOCK_RULES.map((entry) => entry.meat));
/** Everything the herd puts in the basket: its goods and its meat. */
export const FARM_LIVESTOCK_BASKET_IDS: readonly string[] = Object.freeze([...FARM_LIVESTOCK_GOODS.map((good) => good.itemId), ...FARM_LIVESTOCK_MEATS.map((meat) => meat.itemId)]);

export function farmLivestockMeatRule(itemId: unknown): LivestockRule | null {
  return FARM_LIVESTOCK_RULES.find((entry) => entry.meat.itemId === itemId) ?? null;
}

export const MEAT_MARGIN_PER_DAY = 30;
export const PRIME_AGE = 2;
/** Just grown, an animal cuts to this share of its prime. */
export const GROWN_CUT_SHARE = 0.75;

/** A meat's Normal price per cut: the young one's price plus the margin for its days to prime, over its cuts. */
export function farmLivestockMeatPrice(entry: Pick<LivestockRule, "price" | "adultDays" | "meat">): number {
  return Math.ceil((entry.price + MEAT_MARGIN_PER_DAY * PRIME_AGE * entry.adultDays) / entry.meat.cuts);
}

/**
 * How many cuts the Butcher makes of an animal `ageDays` old: none while it
 * is young; from GROWN_CUT_SHARE of its prime the day it is grown, rising to
 * all of it at PRIME_AGE times its grown age; and Yield scales the whole, from
 * 0.6× at Yield 0 to 1.4× at 100. Never fewer than one from a grown one.
 */
export function butcherCuts(entry: LivestockRule, stats: LivestockStats, ageDays: number): number {
  const grownAt = adultAgeDays(entry, stats);
  if (!(ageDays >= grownAt)) return 0;
  const toPrime = Math.min(1, (ageDays - grownAt) / (grownAt * (PRIME_AGE - 1)));
  const age = GROWN_CUT_SHARE + (1 - GROWN_CUT_SHARE) * toPrime;
  const yieldShare = 0.6 + 0.8 * (stats.yield / STAT_MAX);
  return Math.max(1, Math.round(entry.meat.cuts * yieldShare * age));
}

/** The meat's grade: the Quality stat, less the share of its whole life it spent hungry — the goods' rule over a lifetime. */
export function butcherQuality(stats: LivestockStats, neglectMinutes: number, lifeMinutes: number): GoodQuality {
  return goodQuality(stats, neglectMinutes, lifeMinutes);
}

/** Husbandry XP for an animal raised and sent to the Butcher: its species' days to grown, less the share of its life spent hungry. */
export function livestockButcherXp(entry: Pick<LivestockRule, "adultDays">, neglectMinutes: number, lifeMinutes: number): number {
  const share = Math.min(1, Math.max(0, Number(neglectMinutes) || 0) / Math.max(1, lifeMinutes));
  return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * entry.adultDays * (1 - share)));
}

// ---------------------------------------------------------------- Breeding (js/farm-livestock-breeding.mts, rule for rule)

export const BREEDING_MIN_LEVEL = 3;
export const REST_DAYS = 1;
export const INHERIT_SPREAD = 5;
export const JUMP_CHANCE = 0.1;
export const JUMP_MIN = 6;
export const JUMP_MAX = 12;
export const MOTHER_COAT_SHARE = 0.45;
export const SIRE_COAT_SHARE = 0.45;

export type BreedingSubject = { speciesId: string; gender: "female" | "male"; stats: LivestockStats; bornAt: number; homeId: string | null; care: LivestockCare };
export type BreedingRefusal =
  | "level_too_low" | "not_female" | "not_male" | "other_species" | "not_grown"
  | "not_together" | "pregnant" | "resting" | "hungry" | "no_room";

/** Empty slots in standing homes that take `speciesId` (every home, without one), less the places other mothers' young are owed. */
export function freePlacesForYoung(homes: readonly FarmLivestockHome[], herd: readonly { homeId: string | null; pregnant: boolean }[], speciesId?: string): number {
  const counts = new Map<string, number>(homes.map((home) => [home.id, 0]));
  for (const animal of herd) if (animal.homeId && counts.has(animal.homeId)) counts.set(animal.homeId, counts.get(animal.homeId)! + 1);
  const empty = homes.filter((home) => speciesId === undefined || farmHomeTakes(home, speciesId)).reduce((sum, home) => sum + Math.max(0, home.slots - (counts.get(home.id) ?? 0)), 0);
  return Math.max(0, empty - herd.filter((animal) => animal.pregnant).length);
}

/** Why this pair cannot be bred now, or null — the page's `breedingRefusal`, reason for reason, in the same order. */
export function breedingRefusal(mother: BreedingSubject, sire: BreedingSubject, context: { clock: number; level: number; freePlaces: number }): BreedingRefusal | null {
  const entry = farmLivestockRule(mother.speciesId);
  if (!entry) return "other_species";
  if (context.level < BREEDING_MIN_LEVEL) return "level_too_low";
  if (mother.gender !== "female") return "not_female";
  if (sire.gender !== "male") return "not_male";
  if (sire.speciesId !== mother.speciesId) return "other_species";
  const grown = (animal: BreedingSubject) => (context.clock - animal.bornAt) / DAY >= adultAgeDays(entry, animal.stats);
  if (!grown(mother) || !grown(sire)) return "not_grown";
  if (!mother.homeId || mother.homeId !== sire.homeId) return "not_together";
  if (mother.care.pregnancy) return "pregnant";
  if (mother.care.restUntil > context.clock) return "resting";
  if (!(mother.care.hunger > HUNGRY_AT) || !(sire.care.hunger > HUNGRY_AT)) return "hungry";
  if (context.freePlaces < 1) return "no_room";
  return null;
}

export function livestockBirthXp(entry: Pick<LivestockRule, "gestationDays">): number {
  return HUSBANDRY_XP_PER_CYCLE_DAY * entry.gestationDays;
}

export function inheritStat(motherValue: number, sireValue: number, random: () => number): number {
  const spread = Math.floor(unit(random) * (INHERIT_SPREAD * 2 + 1)) - INHERIT_SPREAD;
  const leaps = unit(random) < JUMP_CHANCE;
  const leap = JUMP_MIN + Math.floor(unit(random) * (JUMP_MAX - JUMP_MIN + 1));
  return clampStat(Math.round((motherValue + sireValue) / 2) + spread + (leaps ? leap : 0));
}

/** The young one: sex, coat source, species coat, three draws per stat, name — the page's order. */
export function inheritLivestock(
  entry: Pick<LivestockRule, "coats" | "names">,
  mother: { coatId: string; stats: LivestockStats },
  sire: { coatId: string; stats: LivestockStats },
  random: () => number,
): { gender: "female" | "male"; coatId: string; stats: LivestockStats; name: string } {
  const gender = unit(random) < 0.5 ? "female" : "male";
  const source = unit(random);
  const total = entry.coats.reduce((sum, coat) => sum + coat.weight, 0);
  const roll = unit(random) * total;
  let cursor = 0;
  const drawn = (entry.coats.find((coat) => (cursor += coat.weight) > roll) ?? entry.coats[0]!).id;
  const known = (id: string) => entry.coats.some((coat) => coat.id === id);
  const coatId = source < MOTHER_COAT_SHARE && known(mother.coatId) ? mother.coatId
    : source >= MOTHER_COAT_SHARE && source < MOTHER_COAT_SHARE + SIRE_COAT_SHARE && known(sire.coatId) ? sire.coatId
      : drawn;
  const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, inheritStat(mother.stats[key], sire.stats[key], random)])) as LivestockStats;
  const name = entry.names[Math.floor(unit(random) * entry.names.length)]!;
  return { gender, coatId, stats, name };
}
