// Livestock changing hands (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 6): the
// one place an animal's row moves from one player to another. The barter table
// (db/farm-trades.mts) and the Exchange Board (db/farm-listings.mts) both call
// here, inside their own transactions, so the rules are the same either way:
//
//   - An animal leaves ALIVE at its farm's STORED clock: its care is carried to
//     that minute first, and one a whole day past empty there is refused (it is
//     dead; its own farm marks it at its next settle, with its memorial).
//   - It arrives only where the receiver may keep it: their Husbandry at the
//     Dealer's level for the species, the herd under its ceiling, and a home
//     with room. All or nothing (`placeArrivingLivestock`).
//   - Every farm-minute stamp on it moves onto the receiver's clock
//     (`rebaseLivestockCare`), so it arrives the age it left, as hungry as it
//     left, carrying what it carried. A pregnancy travels; the young one is
//     born on the new farm and is the new owner's.
//   - Listed on the Exchange Board, it waits as `state = 'listed'` on clock zero
//     (no owner's farm runs for it), and comes home or goes to its buyer rebased
//     onto theirs.
//
// Herds are locked (FOR UPDATE, alive rows) in player-id order, after the farms,
// the same order every caller takes its other locks in.

import {
  advanceLivestockCare,
  clampStat,
  farmHerdHomes,
  farmLivestockHomes,
  farmLivestockRule,
  livestockCard,
  livestockDeathMinute,
  normalizeLivestockCare,
  pickFarmLivestockHome,
  placeArrivingLivestock,
  rebaseLivestockCare,
  LIVESTOCK_STATS,
  type LivestockCare,
  type LivestockStats,
} from "../services/farm-livestock-catalog.mjs";
import { farmingLevelForXp, normalizeHusbandryRecord } from "../services/farm-skill-catalog.mjs";

export const LIVESTOCK_ANIMAL_ID = /^stock-[A-Za-z0-9-]{8,64}$/;

const COLUMNS = `animal_id, player_id, species_id, name, gender, coat_id, stats, born_minute, home_id, care, origin, state`;

/** A farm's clock as saved: the minute its animals are carried to when they leave or arrive. */
export function storedFarmClock(layout: any): number {
  return Math.max(0, Number(layout?.clock?.farmMinutes) || 0);
}

function husbandryLevel(layout: any): number {
  return farmingLevelForXp(normalizeHusbandryRecord(layout?.skills?.husbandry).xp);
}

function statsOf(row: any): LivestockStats {
  return Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, clampStat(row?.stats?.[key])])) as LivestockStats;
}

function careOf(row: any): LivestockCare {
  return normalizeLivestockCare(row.care, Number(row.born_minute) || 0);
}

/** A row as its card, on the clock it lives by. */
export function livestockRowCard(row: any, clock: number) {
  return livestockCard({
    id: String(row.animal_id), speciesId: String(row.species_id), name: String(row.name), gender: String(row.gender),
    coatId: String(row.coat_id), stats: statsOf(row), bornAt: Number(row.born_minute) || 0, care: careOf(row), origin: String(row.origin ?? ""),
  }, clock);
}

/** The ids a player could put on a table: every animal alive on their farm. */
export async function tradeableLivestockIds(client: any, playerId: string): Promise<string[]> {
  const result = await client.query(`select animal_id from farm_livestock where player_id = $1 and state = 'alive'`, [playerId]);
  return (result.rows ?? []).map((row: any) => String(row.animal_id));
}

/** A player's living herd, locked for the exchange. */
async function lockedLivingHerd(client: any, playerId: string): Promise<any[]> {
  const result = await client.query(`select ${COLUMNS} from farm_livestock where player_id = $1 and state = 'alive' order by created_at, animal_id for update`, [playerId]);
  return result.rows ?? [];
}

/** The animal carried to the minute it leaves: its care at `clock`, or null if it died before then. */
function leaving(row: any, clock: number): { care: LivestockCare; bornAt: number } | null {
  const bornAt = Number(row.born_minute) || 0;
  const subject = { speciesId: String(row.species_id), stats: statsOf(row), bornAt };
  const care = careOf(row);
  if (livestockDeathMinute(subject, care) <= clock) return null;
  return { care: advanceLivestockCare(subject, care, clock), bornAt };
}

/** One animal's new place: whose it is, where it lives, and its stamps on its new clock. */
export type LivestockMove = Readonly<{ animalId: string; to: string; homeId: string | null; bornMinute: number; care: LivestockCare }>;

export type TradeSideFarm = Readonly<{ playerId: string; layout: any }>;

/**
 * The animals on a barter table, checked and placed: each side's must still be
 * alive on its farm, and each receiver must be able to keep what it is handed.
 * Nothing is written. `side` names whose farm the refusal is about.
 */
export async function planLivestockTrade(client: any, a: TradeSideFarm, b: TradeSideFarm, fromA: readonly string[], fromB: readonly string[]): Promise<
  | { ok: true; moves: LivestockMove[] }
  | { ok: false; error: "offer_gone" | "husbandry_too_low" | "herd_full" | "no_room"; side: "a" | "b" }
> {
  if (!fromA.length && !fromB.length) return { ok: true, moves: [] };
  const herds = new Map<string, any[]>();
  for (const id of [a.playerId, b.playerId].sort()) herds.set(id, await lockedLivingHerd(client, id));
  const sides = { a: { farm: a, out: fromA }, b: { farm: b, out: fromB } } as const;
  // What leaves each side, carried to its own clock.
  const departing: Record<"a" | "b", { row: any; care: LivestockCare; bornAt: number }[]> = { a: [], b: [] };
  for (const key of ["a", "b"] as const) {
    const { farm, out } = sides[key];
    const herd = herds.get(farm.playerId)!;
    const clock = storedFarmClock(farm.layout);
    for (const animalId of out) {
      const row = herd.find((entry) => entry.animal_id === animalId);
      const carried = row ? leaving(row, clock) : null;
      if (!row || !carried) return { ok: false, error: "offer_gone", side: key };
      departing[key].push({ row, ...carried });
    }
  }
  const moves: LivestockMove[] = [];
  for (const [receiver, sender] of [["a", "b"], ["b", "a"]] as const) {
    const arriving = departing[sender];
    if (!arriving.length) continue;
    const farm = sides[receiver].farm;
    const staying = herds.get(farm.playerId)!.filter((row) => !sides[receiver].out.includes(row.animal_id));
    const placed = placeArrivingLivestock({
      homes: farmHerdHomes(farm.layout),
      herdHomes: staying.map((row) => (row.home_id ? String(row.home_id) : null)),
      level: husbandryLevel(farm.layout),
      arriving: arriving.map((entry) => ({ speciesId: String(entry.row.species_id) })),
    });
    if (!placed.ok) return { ok: false, error: placed.error, side: receiver };
    const delta = storedFarmClock(farm.layout) - storedFarmClock(sides[sender].farm.layout);
    arriving.forEach((entry, index) => moves.push({
      animalId: String(entry.row.animal_id),
      to: farm.playerId,
      homeId: placed.homeIds[index]!,
      bornMinute: entry.bornAt + delta,
      care: rebaseLivestockCare(entry.care, delta),
    }));
  }
  return { ok: true, moves };
}

/** Write planned moves: each row changes owner, home and clock, only while it is still alive. */
export async function applyLivestockMoves(client: any, moves: readonly LivestockMove[]): Promise<void> {
  for (const move of moves) {
    await client.query(
      `update farm_livestock set player_id = $2, home_id = $3, born_minute = $4, care = $5::jsonb, updated_at = now() where animal_id = $1 and state = 'alive'`,
      [move.animalId, move.to, move.homeId, move.bornMinute, JSON.stringify(move.care)],
    );
  }
}

// ---------------------------------------------------------------- the Exchange Board

/**
 * Put an animal up: it leaves the seller's farm (alive at the farm's stored
 * clock) and waits on clock zero as `listed`. Answers its card, or why not.
 */
export async function consignLivestock(client: any, sellerId: string, layout: any, animalId: string): Promise<{ ok: true; card: ReturnType<typeof livestockRowCard> } | { ok: false; error: "not_enough" | "died" }> {
  if (!LIVESTOCK_ANIMAL_ID.test(animalId)) return { ok: false, error: "not_enough" };
  const herd = await lockedLivingHerd(client, sellerId);
  const row = herd.find((entry) => entry.animal_id === animalId);
  if (!row) return { ok: false, error: "not_enough" };
  const clock = storedFarmClock(layout);
  const carried = leaving(row, clock);
  if (!carried) return { ok: false, error: "died" };
  const care = rebaseLivestockCare(carried.care, -clock);
  const bornMinute = carried.bornAt - clock;
  await client.query(
    `update farm_livestock set state = 'listed', home_id = null, born_minute = $3, care = $4::jsonb, updated_at = now() where player_id = $1 and animal_id = $2 and state = 'alive'`,
    [sellerId, animalId, bornMinute, JSON.stringify(care)],
  );
  return { ok: true, card: livestockRowCard({ ...row, born_minute: bornMinute, care, home_id: null }, 0) };
}

/** A listed animal, locked. */
async function lockedListedAnimal(client: any, animalId: string): Promise<any | null> {
  const result = await client.query(`select ${COLUMNS} from farm_livestock where animal_id = $1 and state = 'listed' for update`, [animalId]);
  return result.rows?.[0] ?? null;
}

/** A listed animal's landing, decided but not written: where it will live on its new owner's farm. */
export type ListedLanding = Readonly<{ animalId: string; owner: string; homeId: string | null; bornMinute: number; care: LivestockCare; card: ReturnType<typeof livestockRowCard> }>;

/**
 * Where a listed animal would land: on its buyer's farm (`strict`: the farm must
 * be able to keep it, else it is refused) or its seller's own, taking it home
 * (never refused — the first home with room, or the field if there is none, as
 * a homeless animal waits). Locks the herd and the row; writes nothing, so a
 * caller can spend the tickets between deciding and landing.
 */
export async function planListedLanding(client: any, animalId: string, owner: TradeSideFarm, strict: boolean): Promise<{ ok: true; landing: ListedLanding } | { ok: false; error: "not_found" | "husbandry_too_low" | "herd_full" | "no_room" }> {
  if (!LIVESTOCK_ANIMAL_ID.test(animalId)) return { ok: false, error: "not_found" };
  const herd = await lockedLivingHerd(client, owner.playerId);
  const row = await lockedListedAnimal(client, animalId);
  if (!row) return { ok: false, error: "not_found" };
  const herdHomes = herd.map((entry) => (entry.home_id ? String(entry.home_id) : null));
  const homes = farmHerdHomes(owner.layout);
  let homeId: string | null;
  if (strict) {
    const placed = placeArrivingLivestock({ homes, herdHomes, level: husbandryLevel(owner.layout), arriving: [{ speciesId: String(row.species_id) }] });
    if (!placed.ok) return { ok: false, error: placed.error };
    homeId = placed.homeIds[0]!;
  } else {
    homeId = farmLivestockRule(row.species_id) ? pickFarmLivestockHome(homes, herdHomes, undefined, row.species_id)?.id ?? null : null;
  }
  const clock = storedFarmClock(owner.layout);
  return {
    ok: true,
    landing: {
      animalId, owner: owner.playerId, homeId,
      bornMinute: (Number(row.born_minute) || 0) + clock,
      care: rebaseLivestockCare(careOf(row), clock),
      card: livestockRowCard(row, 0),
    },
  };
}

/** Land it: the row is alive again, on its owner's farm and clock. */
export async function writeListedLanding(client: any, landing: ListedLanding): Promise<void> {
  await client.query(
    `update farm_livestock set state = 'alive', player_id = $2, home_id = $3, born_minute = $4, care = $5::jsonb, updated_at = now() where animal_id = $1 and state = 'listed'`,
    [landing.animalId, landing.owner, landing.homeId, landing.bornMinute, JSON.stringify(landing.care)],
  );
}

/** Cards for listed animals by id (the board's rows), on clock zero. */
export async function listedLivestockCards(client: any, animalIds: readonly string[]): Promise<Map<string, ReturnType<typeof livestockRowCard>>> {
  const ids = animalIds.filter((id) => LIVESTOCK_ANIMAL_ID.test(id));
  if (!ids.length) return new Map();
  const result = await client.query(`select ${COLUMNS} from farm_livestock where animal_id = any($1::text[]) and state = 'listed'`, [ids]);
  return new Map((result.rows ?? []).map((row: any) => [String(row.animal_id), livestockRowCard(row, 0)]));
}

/**
 * GET /games/farm/livestock/cards?ids= — living animals by id, as cards on
 * their own farm's stored clock: what a trading table shows of the other
 * side's animals. Public, like the herd itself.
 */
export async function getFarmLivestockCards(pool: any, input: any) {
  const ids = (Array.isArray(input?.ids) ? input.ids : []).filter((id: unknown): id is string => typeof id === "string" && LIVESTOCK_ANIMAL_ID.test(id)).slice(0, 24);
  if (!ids.length) return { animals: [] };
  const result = await pool.query(
    `select l.animal_id, l.player_id, l.species_id, l.name, l.gender, l.coat_id, l.stats, l.born_minute, l.home_id, l.care, l.origin, l.state, g.garage
     from farm_livestock l left join game_loadouts g on g.player_id = l.player_id and g.game_slug = 'farm'
     where l.animal_id = any($1::text[]) and l.state = 'alive'`,
    [ids],
  );
  return { animals: (result.rows ?? []).map((row: any) => livestockRowCard(row, storedFarmClock(row.garage))) };
}
