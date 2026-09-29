// Livestock on the database (migration 057). Every animal is decided here: the
// Livestock Dealer rolls a young one's sex, coat and stats, stamps its birth at
// the farm's clock and finds it a home, and only then is it a row. The page
// asks for the herd and draws it; it can move an animal between homes and
// rename it, and nothing else.
//
// CARE IS SETTLED HERE TOO (Phase 2). Every care action — a checkup, a feed, a
// collection — sends the farm the way a harvest does; the server verifies its
// clock (real time plus the nap bank), carries every animal's care to that
// minute (`advanceLivestockCare`), and an animal a whole farm day past empty is
// marked dead THERE, with a memorial stone and a history entry written into the
// farm in the same transaction — the pets' memorial, remembering livestock too.
// Only then is the feed or the collection done. Goods land in the harvest
// basket, graded like crops, and nothing on the page can make one.
//
// HUSBANDRY (Phase 3) is earned here too: a collection pays the skill's XP
// into the farm's server-owned `skills.husbandry` in the same transaction that
// puts the goods in the basket, and the Dealer sells a species only at its
// Husbandry level. An animal bought before its gate existed is never taken back.
//
// THE BUTCHER (Phase 4) is here too, and it is the one way an animal leaves the
// farm alive-to-gone by the player's own choice. The Market Square has no
// running farm clock, so the herd is settled at the farm's STORED clock (the
// farm saved itself before the gate let the player out); a grown animal's row
// is closed as `butchered` and its meat — cuts from Yield and age, graded by
// Quality less its lifetime hunger — lands in the basket in the same
// transaction, with the Husbandry XP. A basket with no room for every cut
// refuses: an animal is never cut into meat that is thrown away.
//
// Room is checked against the farm's own buildings, read from the saved farm
// under a row lock, so two tabs cannot squeeze a fifth animal into a pen for
// four. A home that has since been taken down is simply not a home: its
// animals keep their rows and wait on the field (`home_id` stays, and counts
// nowhere) until they are moved.

import { randomUUID } from "node:crypto";
import { spendTicketsInTransaction } from "./tickets.mjs";
import { lockedFarm, saveFarm, transaction, verifiedSubmittedFarm } from "./farm-economy.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { farmProduceKey, takeFarmProduce } from "../services/farm-quality-catalog.mjs";
import { farmingLevelForXp, farmingSummary, normalizeFarmSkillRecords, normalizeHusbandryRecord, recordFarmButcher, recordFarmCollection } from "../services/farm-skill-catalog.mjs";
import { awardServerAchievementsInTransaction } from "./achievements.mjs";
import {
  LIVESTOCK_STATS,
  MAX_HERD,
  clampStat,
  adultAgeDays,
  advanceLivestockCare,
  butcherCuts,
  butcherQuality,
  livestockButcherXp,
  cleanLivestockName,
  farmLivestockHomes,
  feedLivestockCare,
  goodQuality,
  goodsPerCollection,
  livestockCollectXp,
  livestockDeathMinute,
  newLivestockCare,
  normalizeLivestockCare,
  wantsFood,
  type LivestockCare,
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
    care: normalizeLivestockCare(row.care, Number(row.born_minute) || 0),
  };
}

const HERD_COLUMNS = `animal_id, species_id, name, gender, coat_id, stats, born_minute, home_id, care`;

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
    const level = farmingLevelForXp(normalizeHusbandryRecord(farm.layout.skills?.husbandry).xp);
    if (level < species.minLevel) return { ok: false, error: "level_too_low", minLevel: species.minLevel, level };
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
      // The Dealer's young arrive fed.
      care: newLivestockCare(Math.max(0, Number(farm.layout.clock?.farmMinutes) || 0)),
    };
    await client.query(
      `insert into farm_livestock (animal_id, player_id, species_id, name, gender, coat_id, stats, born_minute, home_id, care, origin)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, 'dealer')`,
      [row.animal_id, playerId, row.species_id, row.name, row.gender, row.coat_id, JSON.stringify(row.stats), row.born_minute, row.home_id, JSON.stringify(row.care)],
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

// ---------------------------------------------------------------- care

const MAX_STACK = 99;
const CARE_ACTIONS = new Set(["checkup", "feed", "collect"]);

function stableUnit(text: string): number {
  let state = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return state / 0x100000000;
}

/** The short ids a memorial uses (a farm row id is at most 40 characters of [a-z0-9-]). */
export function livestockMemorialIds(animalId: string): { memorialId: string; stoneId: string } {
  const tail = animalId.replace(/^stock-/, "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 30);
  return { memorialId: `herd-${tail}`, stoneId: `stone-${tail}` };
}

function subjectOf(row: any) {
  return { speciesId: String(row.species_id), stats: presentLivestock(row).stats as any, bornAt: Number(row.born_minute) || 0 };
}

/**
 * Carry every living animal to the farm's minute `clock`. One a whole farm day
 * past empty is dead at the minute it died: its row is closed, and the farm
 * gains its history entry and a memorial stone (placed as the pets' are).
 * Returns the farm as it now stands, the living rows, and who died.
 */
async function settleHerd(client: any, playerId: string, layout: any, rows: any[], clock: number) {
  const living: any[] = [];
  const deaths: { id: string; name: string; speciesId: string }[] = [];
  let petHistory: any[] = [...(layout.petHistory ?? [])];
  let decor: any[] = [...(layout.decor ?? [])];
  for (const row of rows) {
    const subject = subjectOf(row);
    const care = normalizeLivestockCare(row.care, subject.bornAt);
    const diesAt = livestockDeathMinute(subject, care);
    if (diesAt <= clock) {
      await client.query(
        `update farm_livestock set state = 'died', end_cause = 'starvation', ended_minute = $3, care = $4::jsonb, updated_at = now()
         where player_id = $1 and animal_id = $2`,
        [playerId, row.animal_id, diesAt, JSON.stringify(advanceLivestockCare(subject, care, diesAt))],
      );
      const { memorialId, stoneId } = livestockMemorialIds(String(row.animal_id));
      const ageDays = Math.max(0, (diesAt - subject.bornAt) / (24 * 60));
      const rule = farmLivestockRule(subject.speciesId);
      const grown = rule ? Math.min(1, ageDays / adultAgeDays(rule, subject.stats)) : 1;
      if (!petHistory.some((entry) => entry.id === memorialId)) {
        petHistory.push({
          id: memorialId, instanceId: memorialId, speciesId: subject.speciesId, name: String(row.name), outcome: "starvation",
          departedAtFarmMinute: diesAt, lifespanDays: ageDays,
          finalStats: { gender: row.gender === "male" ? "male" : "female", ageDays, size: 0.55 + 0.45 * grown, hunger: 0, happiness: 0, speed: 0, strength: 0 },
          traits: [], accomplishments: [],
        });
      }
      if (!decor.some((entry) => entry.instanceId === stoneId)) {
        const angle = stableUnit(`${memorialId}:position`) * Math.PI * 2;
        const radius = 2.5 + stableUnit(`${memorialId}:radius`) * 3;
        decor.push({
          instanceId: stoneId, itemId: "decor.prop.pet-tombstone",
          x: Number((Math.cos(angle) * radius).toFixed(4)), z: Number((Math.sin(angle) * radius).toFixed(4)), rotationY: Number(angle.toFixed(4)), length: 0, memorialId,
        });
      }
      deaths.push({ id: String(row.animal_id), name: String(row.name), speciesId: subject.speciesId });
      continue;
    }
    row.care = advanceLivestockCare(subject, care, clock);
    await client.query(`update farm_livestock set care = $3::jsonb, updated_at = now() where player_id = $1 and animal_id = $2`, [playerId, row.animal_id, JSON.stringify(row.care)]);
    living.push(row);
  }
  return { layout: deaths.length ? { ...layout, petHistory, decor } : layout, living, deaths };
}

/**
 * Livestock care, at the farm's verified clock. `checkup` only settles (the
 * page asks when its own sums say an animal is due to die); `feed` gives one
 * serving — the animal's own feed from the supply shop first, else a crop it
 * likes from the basket, plainest grade first; `collect` takes a good that is
 * ready into the basket at the grade its care earned. Whatever the answer,
 * the settled farm and herd are what is now true, and both are returned.
 */
export async function careFarmLivestock(pool: any, input: any, now: number = Date.now()) {
  const playerId = required(input?.playerId, "playerId");
  const action = required(input?.action, "action");
  if (!CARE_ACTIONS.has(action)) throw new TypeError("invalid action");
  if (!input?.layout || typeof input.layout !== "object") throw new TypeError("layout is required");
  const animalId = action === "checkup" ? "" : required(input?.animalId, "animalId");
  if (animalId && !ANIMAL_ID.test(animalId)) return { ok: false, error: "not_found" };
  return transaction(pool, async (client) => {
    const farm = await verifiedSubmittedFarm(client, playerId, input.layout, now);
    if (!farm) return { ok: false, error: "farm_not_initialized" };
    const clock = Math.max(0, Number(farm.verified.clock?.farmMinutes) || 0);
    const rows = await liveHerd(client, playerId, true);
    const settled = await settleHerd(client, playerId, farm.verified, rows, clock);
    let layout = settled.layout;
    const answer = async (result: any) => {
      const saved = normalizeFarmGarage(layout, { ownedEntitlementIds: farm.owned });
      await saveFarm(client, playerId, saved);
      return { ...result, layout: saved, herd: settled.living.map(presentLivestock), deaths: settled.deaths };
    };
    if (action === "checkup") return answer({ ok: true });
    const row = settled.living.find((entry) => entry.animal_id === animalId);
    if (!row) return answer({ ok: false, error: settled.deaths.some((death) => death.id === animalId) ? "died" : "not_found" });
    const rule = farmLivestockRule(row.species_id)!;
    const subject = subjectOf(row);
    const care: LivestockCare = row.care;
    const agriculture = layout.agriculture ?? {};
    const inventory = agriculture.inventory ?? {};
    if (action === "feed") {
      if (!wantsFood(care)) return answer({ ok: false, error: "full" });
      let supplies = { ...(inventory.supplies ?? {}) };
      let produce = { ...(inventory.produce ?? {}) };
      let used = "";
      if ((Number(supplies[rule.feeds.supply]) || 0) > 0) {
        supplies[rule.feeds.supply] = Number(supplies[rule.feeds.supply]) - 1;
        used = rule.feeds.supply;
      } else {
        for (const cropId of rule.feeds.crops) {
          const taken = takeFarmProduce(produce, cropId, 1);
          if (taken) { produce = taken; used = cropId; break; }
        }
      }
      if (!used) return answer({ ok: false, error: "no_feed" });
      row.care = feedLivestockCare(care);
      await client.query(`update farm_livestock set care = $3::jsonb, updated_at = now() where player_id = $1 and animal_id = $2`, [playerId, animalId, JSON.stringify(row.care)]);
      layout = { ...layout, agriculture: { ...agriculture, inventory: { ...inventory, supplies, produce } } };
      return answer({ ok: true, used, animal: presentLivestock(row) });
    }
    // collect
    const wanted = typeof input?.itemId === "string" ? input.itemId : "";
    const product = rule.products.find((entry) => (!wanted || entry.itemId === wanted) && (care.progress[entry.itemId] ?? 0) >= entry.everyDays * 24 * 60);
    if (!product) return answer({ ok: false, error: "not_ready" });
    const cycle = product.everyDays * 24 * 60;
    const quality = goodQuality(subject.stats, care.stress[product.itemId] ?? 0, cycle);
    const quantity = goodsPerCollection(subject.stats);
    const key = farmProduceKey(product.itemId, quality);
    const produce = { ...(inventory.produce ?? {}) };
    const held = Number(produce[key]) || 0;
    if (held >= MAX_STACK) return answer({ ok: false, error: "basket_full" });
    const collected = Math.min(quantity, MAX_STACK - held);
    produce[key] = held + collected;
    // Husbandry: the good's cycle in farm days, less the share of it the animal went hungry.
    const skills = normalizeFarmSkillRecords(layout.skills);
    const xp = livestockCollectXp(product, care.stress[product.itemId] ?? 0);
    const husbandry = recordFarmCollection(skills.husbandry, product.itemId, collected, xp);
    row.care = { ...care, progress: { ...care.progress, [product.itemId]: 0 }, stress: { ...care.stress, [product.itemId]: 0 } };
    await client.query(`update farm_livestock set care = $3::jsonb, updated_at = now() where player_id = $1 and animal_id = $2`, [playerId, animalId, JSON.stringify(row.care)]);
    layout = { ...layout, agriculture: { ...agriculture, inventory: { ...inventory, produce } }, skills: { ...skills, husbandry } };
    const achievements = await awardServerAchievementsInTransaction(client, {
      playerId, gameSlug: "farm", facts: { farming: skills.farming, husbandry }, sourceId: `collect:${animalId}:${Math.round(clock)}`,
    });
    return answer({
      ok: true, itemId: product.itemId, quality, quantity: collected, animal: presentLivestock(row),
      xp, husbandry: farmingSummary(husbandry, skills.husbandry.xp), achievements,
    });
  });
}

// ---------------------------------------------------------------- the Butcher

/**
 * Send a grown animal to the Butcher in the Market Square. The herd is settled
 * at the farm's stored clock first (a death is a death, and is answered as
 * one); a young one is refused, and so is a basket without room for every cut.
 * Otherwise the row closes as `butchered`, the meat goes in the basket at its
 * grade and Husbandry is paid — all in one transaction. The animal's row is
 * kept as its record, like a dead one's.
 */
export async function butcherFarmLivestock(pool: any, input: any) {
  const playerId = required(input?.playerId, "playerId");
  const animalId = required(input?.animalId, "animalId");
  if (!ANIMAL_ID.test(animalId)) return { ok: false, error: "not_found" };
  return transaction(pool, async (client) => {
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete") return { ok: false, error: "farm_not_initialized" };
    const clock = Math.max(0, Number(farm.layout.clock?.farmMinutes) || 0);
    const settled = await settleHerd(client, playerId, farm.layout, await liveHerd(client, playerId, true), clock);
    let layout = settled.layout;
    const answer = async (result: any) => {
      const saved = normalizeFarmGarage(layout, { ownedEntitlementIds: farm.owned });
      if (settled.deaths.length || result.ok) await saveFarm(client, playerId, saved);
      return { ...result, layout: saved, herd: settled.living.filter((row) => row.animal_id !== (result.ok ? animalId : "")).map(presentLivestock), deaths: settled.deaths };
    };
    const row = settled.living.find((entry) => entry.animal_id === animalId);
    if (!row) return answer({ ok: false, error: settled.deaths.some((death) => death.id === animalId) ? "died" : "not_found" });
    const rule = farmLivestockRule(row.species_id)!;
    const subject = subjectOf(row);
    const care: LivestockCare = row.care;
    const lifeMinutes = Math.max(0, clock - subject.bornAt);
    const cuts = butcherCuts(rule, subject.stats, lifeMinutes / (24 * 60));
    if (cuts <= 0) return answer({ ok: false, error: "not_grown" });
    const quality = butcherQuality(subject.stats, care.neglect, lifeMinutes);
    const agriculture = layout.agriculture ?? {};
    const inventory = agriculture.inventory ?? {};
    const produce = { ...(inventory.produce ?? {}) };
    const key = farmProduceKey(rule.meat.itemId, quality);
    const held = Number(produce[key]) || 0;
    if (held + cuts > MAX_STACK) return answer({ ok: false, error: "basket_full", cuts, quality });
    produce[key] = held + cuts;
    const skills = normalizeFarmSkillRecords(layout.skills);
    const xp = livestockButcherXp(rule, care.neglect, lifeMinutes);
    const husbandry = recordFarmButcher(skills.husbandry, rule.meat.itemId, cuts, xp);
    await client.query(
      `update farm_livestock set state = 'butchered', end_cause = 'butcher', ended_minute = $3, care = $4::jsonb, updated_at = now()
       where player_id = $1 and animal_id = $2 and state = 'alive'`,
      [playerId, animalId, clock, JSON.stringify(care)],
    );
    layout = { ...layout, agriculture: { ...agriculture, inventory: { ...inventory, produce } }, skills: { ...skills, husbandry } };
    const achievements = await awardServerAchievementsInTransaction(client, {
      playerId, gameSlug: "farm", facts: { farming: skills.farming, husbandry, butcher: { quality } }, sourceId: `butcher:${animalId}`,
    });
    return answer({
      ok: true, name: String(row.name), speciesId: rule.id, itemId: rule.meat.itemId, quality, quantity: cuts,
      xp, husbandry: farmingSummary(husbandry, skills.husbandry.xp), achievements,
    });
  });
}
