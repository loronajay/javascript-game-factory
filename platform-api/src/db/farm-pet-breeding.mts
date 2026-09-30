// Pet breeding (services/farm-pet-breeding-policy.mts): one transaction that
// reads the STORED farm, checks the pair at its stored clock, takes the fee and
// writes the young one plus both parents' rest stamp. Nothing the client says
// about the parents is trusted — it names two instance ids and a name.

import { spendTicketsInTransaction } from "./tickets.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { findFarmSpecies } from "../services/farm-economy-catalog.mjs";
import { FARM_BREEDING_PRICE, breedFarmPetProfile, farmBreedingRefusal, farmPetLineage } from "../services/farm-pet-breeding-policy.mjs";
import { lockedFarm, nextPetId, saveFarm, transaction } from "./farm-economy.mjs";

/** The Pets panel's adoption cap (js/farm-layout.mts MAX_PETS): a young one takes a place like an adoption does. */
const MAX_PETS = 12;
const BREED_ID = /^[A-Za-z0-9_-]{1,80}$/;

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 20) || fallback;
}

export async function breedFarmPets(pool: any, input: any, random: () => number = Math.random) {
  const playerId = typeof input?.playerId === "string" ? input.playerId.trim() : "";
  const breedId = typeof input?.breedId === "string" ? input.breedId.trim() : "";
  if (!playerId) throw new TypeError("playerId is required");
  if (!BREED_ID.test(breedId)) throw new TypeError("invalid breedId");
  const motherId = typeof input?.motherId === "string" ? input.motherId : "";
  const fatherId = typeof input?.fatherId === "string" ? input.fatherId : "";
  const transactionKey = `farm:breeding:${breedId}`;
  return transaction(pool, async (client) => {
    const farm = await lockedFarm(client, playerId);
    if (!farm || farm.layout.onboarding?.status !== "complete") return { ok: false, error: "farm_not_initialized" };
    const done = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
    if (done.rows?.length) {
      const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
      return { ok: true, duplicate: true, price: 0, balance: Number(wallet.rows[0]?.balance) || 0, layout: farm.layout };
    }
    const pets: any[] = farm.layout.pets ?? [];
    const mother = pets.find((row) => row.instanceId === motherId);
    const father = pets.find((row) => row.instanceId === fatherId);
    if (!mother || !father) return { ok: false, error: "unknown_pet", layout: farm.layout };
    const farmMinutes = Number(farm.layout.clock?.farmMinutes) || 0;
    const refusal = farmBreedingRefusal(mother, father, farmMinutes, pets.length, MAX_PETS);
    if (refusal) return { ok: false, error: refusal, layout: farm.layout };
    const bred = breedFarmPetProfile(mother.speciesId, mother.profile, father.profile, random);
    const species = findFarmSpecies(mother.speciesId);
    if (!bred || !species) return { ok: false, error: "not_breedable", layout: farm.layout };
    const spend = await spendTicketsInTransaction(client, {
      playerId, transactionKey, amount: FARM_BREEDING_PRICE, reason: "farm_pet_breeding",
      metadata: { speciesId: species.id, motherId, fatherId },
    });
    if (!spend.ok) return { ok: false, error: spend.error, balance: spend.balance, price: FARM_BREEDING_PRICE, layout: farm.layout };
    const pet = {
      instanceId: nextPetId(farm.layout, species.id),
      speciesId: species.id,
      name: cleanName(input?.name, species.title),
      profile: bred.profile,
      lineage: farmPetLineage(mother, father),
    };
    const rested = pets.map((row) => row === mother || row === father ? { ...row, bredAt: Math.floor(farmMinutes) } : row);
    const next = normalizeFarmGarage({ ...farm.layout, pets: [...rested, pet] }, { ownedEntitlementIds: farm.owned });
    await saveFarm(client, playerId, next);
    return { ok: true, duplicate: false, price: FARM_BREEDING_PRICE, balance: spend.balance, pet, inherited: bred.inherited, layout: next };
  });
}
