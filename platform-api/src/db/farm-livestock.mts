// Livestock on the database (migration 057). Every animal is decided here: the
// Livestock Dealer rolls a young one's sex, coat and stats, stamps its birth at
// the farm's clock and finds it a home, and only then is it a row. The page
// asks for the herd and draws it; it can move an animal between homes and
// rename it, and nothing else.
//
// Room is checked against the farm's own buildings, read from the saved farm
// under a row lock, so two tabs cannot squeeze a fifth animal into a pen for
// four. A home that has since been taken down is simply not a home: its
// animals keep their rows and wait on the field (`home_id` stays, and counts
// nowhere) until they are moved.

import { randomUUID } from "node:crypto";
import { spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, transaction } from "./farm-economy.mjs";
import {
  LIVESTOCK_STATS,
  MAX_HERD,
  clampStat,
  cleanLivestockName,
  farmLivestockHomes,
  farmLivestockRule,
  livestockGrade,
  pickFarmLivestockHome,
  rollFarmLivestock,
} from "../services/farm-livestock-catalog.mjs";

const PURCHASE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ANIMAL_ID = /^stock-[A-Za-z0-9-]{8,64}$/;
const HOME_ID = /^[A-Za-z0-9_-]{1,80}#[a-z0-9-]{1,20}$/;

function required(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

/** One row as the page reads it. */
export function presentLivestock(row: any) {
  const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, clampStat(row?.stats?.[key])]));
  return {
    id: String(row.animal_id),
    speciesId: String(row.species_id),
    name: String(row.name),
    gender: row.gender === "male" ? "male" : "female",
    coatId: String(row.coat_id),
    stats,
    grade: livestockGrade(stats as any),
    bornAt: Number(row.born_minute) || 0,
    homeId: row.home_id ? String(row.home_id) : null,
  };
}

const HERD_COLUMNS = `animal_id, species_id, name, gender, coat_id, stats, born_minute, home_id`;

async function liveHerd(client: any, playerId: string, lock = false): Promise<any[]> {
  const result = await client.query(
    `select ${HERD_COLUMNS} from farm_livestock where player_id = $1 and state = 'alive' order by created_at, animal_id${lock ? " for update" : ""}`,
    [playerId],
  );
  return result.rows ?? [];
}

/** Anyone's herd: a visitor sees the animals in the pens as surely as the owner. Public. */
export async function getFarmLivestock(pool: any, input: any) {
  const playerId = required(input?.playerId, "playerId");
  return { herd: (await liveHerd(pool, playerId)).map(presentLivestock) };
}

/** The Livestock Dealer: a young one for tickets, into the first home with room (or the one asked for). */
export async function buyFarmLivestock(pool: any, input: any, random: () => number = Math.random) {
  const playerId = required(input?.playerId, "playerId");
  const purchaseId = required(input?.purchaseId, "purchaseId");
  if (!PURCHASE_ID.test(purchaseId)) throw new TypeError("invalid purchaseId");
  const species = farmLivestockRule(input?.speciesId);
  if (!species) return { ok: false, error: "unknown_species" };
  const transactionKey = `farm:livestock:${purchaseId}`;
  return transaction(pool, async (client) => {
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete") return { ok: false, error: "farm_not_initialized" };
    const herd = await liveHerd(client, playerId, true);
    const duplicate = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
    if (duplicate.rows?.length) {
      const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
      return { ok: true, duplicate: true, price: 0, balance: Number(wallet.rows[0]?.balance) || 0, herd: herd.map(presentLivestock) };
    }
    if (herd.length >= MAX_HERD) return { ok: false, error: "herd_full" };
    const home = pickFarmLivestockHome(farmLivestockHomes(farm.layout.decor), herd.map((row) => row.home_id ?? null), input?.homeId);
    if (!home) return { ok: false, error: input?.homeId ? "home_full" : "no_room" };
    const spend = await spendTicketsInTransaction(client, {
      playerId, transactionKey, amount: species.price, reason: "farm_livestock_purchase",
      metadata: { speciesId: species.id },
    });
    if (!spend.ok) return { ok: false, error: spend.error, balance: spend.balance, price: species.price };
    const rolled = rollFarmLivestock(species.id, random)!;
    const row = {
      animal_id: `stock-${randomUUID()}`,
      species_id: species.id,
      name: cleanLivestockName(input?.name, rolled.name),
      gender: rolled.gender,
      coat_id: rolled.coatId,
      stats: rolled.stats,
      born_minute: Math.max(0, Number(farm.layout.clock?.farmMinutes) || 0),
      home_id: home.id,
    };
    await client.query(
      `insert into farm_livestock (animal_id, player_id, species_id, name, gender, coat_id, stats, born_minute, home_id, origin)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'dealer')`,
      [row.animal_id, playerId, row.species_id, row.name, row.gender, row.coat_id, JSON.stringify(row.stats), row.born_minute, row.home_id],
    );
    const animal = presentLivestock(row);
    return { ok: true, duplicate: false, price: species.price, balance: spend.balance, animal, herd: [...herd.map(presentLivestock), animal] };
  });
}

/** Lead an animal to another home with room. `homeId: null` turns it out onto the field. */
export async function moveFarmLivestock(pool: any, input: any) {
  const playerId = required(input?.playerId, "playerId");
  const animalId = required(input?.animalId, "animalId");
  if (!ANIMAL_ID.test(animalId)) return { ok: false, error: "not_found" };
  const wanted = input?.homeId === null ? null : required(input?.homeId, "homeId");
  if (wanted !== null && !HOME_ID.test(wanted)) return { ok: false, error: "unknown_home" };
  return transaction(pool, async (client) => {
    const farm = await lockedFarm(client, playerId);
    if (!farm) return { ok: false, error: "farm_not_initialized" };
    const herd = await liveHerd(client, playerId, true);
    const animal = herd.find((row) => row.animal_id === animalId);
    if (!animal) return { ok: false, error: "not_found" };
    if (wanted !== null) {
      const homes = farmLivestockHomes(farm.layout.decor);
      if (!homes.some((entry) => entry.id === wanted)) return { ok: false, error: "unknown_home" };
      const others = herd.filter((row) => row.animal_id !== animalId).map((row) => row.home_id ?? null);
      if (!pickFarmLivestockHome(homes, others, wanted)) return { ok: false, error: "home_full" };
    }
    await client.query(`update farm_livestock set home_id = $3, updated_at = now() where player_id = $1 and animal_id = $2`, [playerId, animalId, wanted]);
    animal.home_id = wanted;
    return { ok: true, animal: presentLivestock(animal), herd: herd.map(presentLivestock) };
  });
}

export async function renameFarmLivestock(pool: any, input: any) {
  const playerId = required(input?.playerId, "playerId");
  const animalId = required(input?.animalId, "animalId");
  if (!ANIMAL_ID.test(animalId)) return { ok: false, error: "not_found" };
  const name = cleanLivestockName(input?.name, "");
  if (!name) return { ok: false, error: "invalid_name" };
  const result = await pool.query(
    `update farm_livestock set name = $3, updated_at = now() where player_id = $1 and animal_id = $2 and state = 'alive'
     returning ${HERD_COLUMNS}`,
    [playerId, animalId, name],
  );
  const row = result.rows?.[0];
  return row ? { ok: true, animal: presentLivestock(row) } : { ok: false, error: "not_found" };
}
