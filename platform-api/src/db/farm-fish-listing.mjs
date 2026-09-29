// Fish on the Exchange Board: a specimen from the Cove's creel waits on the
// board as its own row (`state = 'listed'`), the way a live animal does
// (db/farm-livestock-transfer.mts). Listing takes it out of the creel — only an
// unlocked one, since `locked` is the angler's own "keep this" — buying puts it
// in the buyer's creel if there is room (checked before a ticket moves), and
// taking it down puts it back in the seller's, never refused. A fish that
// changes hands drops the shadow it came from, as at the barter table.
import { CREEL_CAPACITY, FISH_ID } from "../services/farm-fish-catalog.mjs";
import { presentFish } from "./farm-fishing.mjs";
const COLUMNS = `fish_id, player_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at`;
/** The fish as the board shows it: what it is, never where it was caught. */
export function fishListingCard(row) {
    const fish = presentFish(row);
    return { id: fish.id, speciesId: fish.speciesId, weightG: fish.weightG, lengthMm: fish.lengthMm, sizeClass: fish.sizeClass, grade: fish.grade, variant: fish.variant, value: fish.value };
}
/** Take a fish out of the seller's creel onto the board. */
export async function consignFish(client, sellerId, fishId) {
    if (!FISH_ID.test(fishId))
        return { ok: false, error: "not_enough" };
    const result = await client.query(`update farm_fish set state = 'listed' where player_id = $1 and fish_id = $2 and state = 'creel' and locked = false returning ${COLUMNS}`, [sellerId, fishId]);
    const row = result.rows?.[0];
    return row ? { ok: true, card: fishListingCard(row) } : { ok: false, error: "not_enough" };
}
/** Whether `ownerId` can take a listed fish: it is still listed, and (for a buyer) their creel has room. Writes nothing. */
export async function checkListedFishLanding(client, fishId, ownerId, strict) {
    if (!FISH_ID.test(fishId))
        return { ok: false, error: "not_found" };
    const listed = await client.query(`select ${COLUMNS} from farm_fish where fish_id = $1 and state = 'listed' for update`, [fishId]);
    const row = listed.rows?.[0];
    if (!row)
        return { ok: false, error: "not_found" };
    if (strict) {
        const held = await client.query(`select count(*)::int as held from farm_fish where player_id = $1 and state = 'creel'`, [ownerId]);
        if ((Number(held.rows?.[0]?.held) || 0) >= CREEL_CAPACITY)
            return { ok: false, error: "creel_full" };
    }
    return { ok: true, card: fishListingCard(row) };
}
/** Into `ownerId`'s creel. */
export async function landListedFish(client, fishId, ownerId) {
    await client.query(`update farm_fish set player_id = $2, state = 'creel', locked = false, shadow_id = null where fish_id = $1 and state = 'listed'`, [fishId, ownerId]);
}
/** Cards for listed fish by id. */
export async function listedFishCards(client, fishIds) {
    const ids = fishIds.filter((id) => FISH_ID.test(id));
    if (!ids.length)
        return new Map();
    const result = await client.query(`select ${COLUMNS} from farm_fish where fish_id = any($1::text[]) and state = 'listed'`, [ids]);
    return new Map((result.rows ?? []).map((row) => [String(row.fish_id), fishListingCard(row)]));
}
