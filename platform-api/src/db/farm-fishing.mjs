// Fishing at the Cove, on the database (migration 056). Every fish is decided
// here: a cast rolls the bite (from a shadow's pre-drawn fish, or from the
// zone's odds for a blind cast), a landing measures and mints the specimen,
// and the Fishmonger pays for it. The client's minigame decides only whether
// the fish was landed and how cleanly (its grade), and even that is held to
// the clock: a landing sooner than the fight could possibly have taken is
// refused (services/farm-fish-catalog `minimumFightSeconds`).
//
// The angler row (tackle + the Fishing record) is locked for every change,
// so two tabs cannot spend the same worm or land the same cast twice.
import { randomUUID } from "node:crypto";
import { awardTicketsInTransaction, spendTicketsInTransaction } from "./tickets.mjs";
import { awardServerAchievementsInTransaction } from "./achievements.mjs";
import { transaction } from "./farm-economy.mjs";
import { farmingLevelForXp, farmingSummary, FARMING_MAX_XP } from "../services/farm-skill-catalog.mjs";
import { CREEL_CAPACITY, ESCAPE_XP, FISH_ID as FISH_ROW_ID, MAX_MOUNTED_FISH, MOUNT_FEE, FARM_FISH_IDS, FARM_LURES, FARM_RODS, MAX_LURES_EACH, MAX_WORMS, SHADOW_WINDOW_MS, STARTER_ROD_ID, STARTER_WORMS, WORM_ID, WORM_TUB, ZONE_MIN_LEVEL, farmCoveZoneAt, farmFishRule, farmFishStrength, farmFishValue, farmFishXp, farmLureRule, farmRodRule, farmShadowInReach, farmShadowsForWindow, isFishGrade, lengthMmForWeight, minimumFightSeconds, parseShadowId, publicShadow, rollFarmBite, shadowSizeForLength, shadowWindow, sizeClassForRank, weightGramsAtRank, } from "../services/farm-fish-catalog.mjs";
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FISH_ID = /^fish-[A-Za-z0-9-]{8,64}$/;
/** A cast left in the water this long is gone. */
export const CAST_TTL_MS = 10 * 60 * 1000;
/** Casts per rolling hour: well past a quick human (about one a minute), short of a script. */
export const CASTS_PER_HOUR = 150;
/** Fish handled per sale or release. */
export const MAX_FISH_PER_REQUEST = 60;
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
export function starterTackle() {
    return { rods: [STARTER_ROD_ID], lures: {}, worms: STARTER_WORMS };
}
export function emptyFishingRecord() {
    return { xp: 0, catches: 0, escapes: 0, species: {}, shiny: 0, golden: 0, trophies: 0 };
}
function count(value, limit = 100_000_000) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(limit, Math.max(0, Math.floor(number))) : 0;
}
export function normalizeTackle(value) {
    const source = value && typeof value === "object" ? value : {};
    const rods = new Set([STARTER_ROD_ID]);
    for (const id of Array.isArray(source.rods) ? source.rods : [])
        if (farmRodRule(id))
            rods.add(id);
    const lures = {};
    for (const entry of FARM_LURES) {
        const held = count(source.lures?.[entry.id], MAX_LURES_EACH);
        if (held > 0)
            lures[entry.id] = held;
    }
    return { rods: FARM_RODS.map((entry) => entry.id).filter((id) => rods.has(id)), lures, worms: count(source.worms, MAX_WORMS) };
}
export function normalizeFishingRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    const species = {};
    for (const id of FARM_FISH_IDS) {
        const caught = count(source.species?.[id]);
        if (caught > 0)
            species[id] = caught;
    }
    return {
        xp: count(source.xp, FARMING_MAX_XP), catches: count(source.catches), escapes: count(source.escapes),
        species, shiny: count(source.shiny), golden: count(source.golden), trophies: count(source.trophies),
    };
}
/** The angler row, locked; a player who has never fished gets the starter tackle. */
export async function lockedAngler(client, playerId) {
    await client.query(`insert into farm_anglers (player_id, tackle, fishing) values ($1, $2::jsonb, $3::jsonb)
     on conflict (player_id) do nothing`, [playerId, JSON.stringify(starterTackle()), JSON.stringify(emptyFishingRecord())]);
    const result = await client.query(`select tackle, fishing from farm_anglers where player_id = $1 for update`, [playerId]);
    const row = result.rows?.[0] ?? {};
    return { tackle: normalizeTackle(row.tackle ?? starterTackle()), fishing: normalizeFishingRecord(row.fishing) };
}
export async function saveAngler(client, playerId, tackle, fishing) {
    await client.query(`update farm_anglers set tackle = $2::jsonb, fishing = $3::jsonb, updated_at = now() where player_id = $1`, [playerId, JSON.stringify(tackle), JSON.stringify(fishing)]);
}
function fishingLevel(fishing) {
    return farmingLevelForXp(fishing.xp);
}
// ---------------------------------------------------------------- presenting fish
export function presentFish(row) {
    const species = farmFishRule(row.species_id);
    const grade = (isFishGrade(row.grade) ? row.grade : "normal");
    const variant = (row.variant === "shiny" || row.variant === "golden" ? row.variant : "normal");
    const weightG = Number(row.weight_g) || 1;
    return {
        id: String(row.fish_id),
        speciesId: String(row.species_id),
        weightG,
        lengthMm: Number(row.length_mm) || 1,
        sizeClass: String(row.size_class),
        grade,
        variant,
        zone: String(row.zone),
        state: String(row.state),
        locked: Boolean(row.locked),
        caughtAt: row.caught_at ? new Date(row.caught_at).getTime() : 0,
        value: species ? farmFishValue(row.species_id, weightG, grade, variant) : 0,
    };
}
async function creelCount(client, playerId) {
    const result = await client.query(`select count(*)::int as held from farm_fish where player_id = $1 and state = 'creel'`, [playerId]);
    return Number(result.rows?.[0]?.held) || 0;
}
// ---------------------------------------------------------------- reads
/** The shadows swimming now and in the next window: what anyone may be shown of them. */
export function getFarmFishShadows(input = {}) {
    const now = Number.isFinite(input?.now) ? Number(input.now) : Date.now();
    const window = shadowWindow(now);
    // The window before can still have shadows swimming (they outlive their window a little).
    const shadows = [window - 1, window, window + 1].flatMap((entry) => farmShadowsForWindow(entry, input?.env))
        .filter((shadow) => shadow.goneAt >= now && shadow.bornAt <= now + SHADOW_WINDOW_MS * 1.5)
        .map(publicShadow);
    return { now, window, windowMs: SHADOW_WINDOW_MS, shadows };
}
/** Everything the Cove shows a signed-in angler: tackle, level, the creel, the Fishdex, and the shadows caught this hour. */
export async function getFarmFishing(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const now = Number.isFinite(input?.now) ? Number(input.now) : Date.now();
    const angler = await pool.query(`select tackle, fishing from farm_anglers where player_id = $1`, [playerId]);
    const row = angler.rows?.[0];
    const tackle = row ? normalizeTackle(row.tackle) : starterTackle();
    const fishing = row ? normalizeFishingRecord(row.fishing) : emptyFishingRecord();
    const creel = await pool.query(`select fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
     from farm_fish where player_id = $1 and state = 'creel' order by caught_at desc limit 200`, [playerId]);
    const dex = await pool.query(`select species_id, count(*)::int as caught, max(weight_g)::int as best_g, min(caught_at) as first_at,
            bool_or(variant = 'shiny') as shiny, bool_or(variant = 'golden') as golden
     from farm_fish where player_id = $1 group by species_id`, [playerId]);
    const mounted = await pool.query(`select fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
     from farm_fish where player_id = $1 and state = 'mounted' order by caught_at desc limit 100`, [playerId]);
    const caughtShadows = await pool.query(`select shadow_id from farm_fish where player_id = $1 and shadow_id is not null and caught_at > $2`, [playerId, new Date(now - SHADOW_WINDOW_MS * 3)]);
    return {
        tackle,
        fishing: { ...farmingSummary(fishing, fishing.xp), catches: fishing.catches, escapes: fishing.escapes },
        creel: (creel.rows ?? []).map(presentFish),
        capacity: CREEL_CAPACITY,
        dex: Object.fromEntries((dex.rows ?? []).filter((entry) => farmFishRule(entry.species_id)).map((entry) => [entry.species_id, {
                caught: Number(entry.caught) || 0,
                bestG: Number(entry.best_g) || 0,
                firstAt: entry.first_at ? new Date(entry.first_at).getTime() : 0,
                shiny: Boolean(entry.shiny),
                golden: Boolean(entry.golden),
            }])),
        caughtShadows: (caughtShadows.rows ?? []).map((entry) => String(entry.shadow_id)),
        mounted: (mounted.rows ?? []).map(presentFish),
    };
}
/**
 * Fish by id, for anyone: what a trading partner put on the table, what a
 * trophy mount on someone's farm holds. A fish's species, size and colour are
 * not secrets; who holds it and where it is (`state`) come with it, so a mount
 * shows its fish only while that fish is mounted and still the farm owner's.
 */
export async function getFarmFishDetails(pool, input) {
    const ids = Array.from(new Set((Array.isArray(input?.ids) ? input.ids : []).map(String))).filter((id) => FISH_ROW_ID.test(id)).slice(0, 60);
    if (!ids.length)
        return { fish: [] };
    const result = await pool.query(`select fish_id, player_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
     from farm_fish where fish_id = any($1::text[])`, [ids]);
    return { fish: (result.rows ?? []).map((row) => ({ ...presentFish(row), playerId: String(row.player_id) })) };
}
/**
 * Mount a fish (out of the creel onto a trophy plaque, for Old Pike's fee) or
 * take one down (back into the creel, free, if there is room). A mounted fish
 * cannot be sold, cooked, ordered or traded; the farm's build mode places it
 * on a Trophy Mount (`decor.prop.trophy-mount`, whose row names the fish).
 */
export async function mountFarmFish(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const fishId = required(input?.fishId, "fishId");
    if (!FISH_ID.test(fishId))
        throw new TypeError("invalid fishId");
    const mount = input?.mounted !== false;
    const purchaseId = mount ? required(input?.purchaseId, "purchaseId") : "";
    if (mount && !ID.test(purchaseId))
        throw new TypeError("invalid purchaseId");
    return transaction(pool, async (client) => {
        const found = await client.query(`select fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
       from farm_fish where player_id = $1 and fish_id = $2 for update`, [playerId, fishId]);
        const row = found.rows?.[0];
        if (!row)
            return { ok: false, error: "not_found" };
        if (!mount) {
            if (row.state !== "mounted")
                return { ok: false, error: "not_mounted" };
            if (await creelCount(client, playerId) >= CREEL_CAPACITY)
                return { ok: false, error: "creel_full", capacity: CREEL_CAPACITY };
            await client.query(`update farm_fish set state = 'creel', settled_at = null where player_id = $1 and fish_id = $2`, [playerId, fishId]);
            return { ok: true, mounted: false, fish: presentFish({ ...row, state: "creel" }) };
        }
        if (row.state !== "creel")
            return { ok: false, error: row.state === "mounted" ? "already_mounted" : "not_in_creel" };
        const held = await client.query(`select count(*)::int as held from farm_fish where player_id = $1 and state = 'mounted'`, [playerId]);
        if ((Number(held.rows?.[0]?.held) || 0) >= MAX_MOUNTED_FISH)
            return { ok: false, error: "too_many_mounted", max: MAX_MOUNTED_FISH };
        const spend = await spendTicketsInTransaction(client, {
            playerId, transactionKey: `farm:mount:${purchaseId}`, amount: MOUNT_FEE, reason: "farm_fish_mount", metadata: { fishId },
        });
        if (!spend.ok)
            return { ok: false, error: spend.error, balance: spend.balance, price: MOUNT_FEE };
        await client.query(`update farm_fish set state = 'mounted', locked = false, settled_at = now() where player_id = $1 and fish_id = $2`, [playerId, fishId]);
        return { ok: true, mounted: true, price: spend.duplicate ? 0 : MOUNT_FEE, balance: spend.balance, fish: presentFish({ ...row, state: "mounted" }) };
    });
}
/** The Cove Records board: the heaviest of every species caught today (UTC) and ever, with who caught it. */
export async function getFarmFishRecords(pool, input = {}) {
    const now = Number.isFinite(input?.now) ? Number(input.now) : Date.now();
    const day = new Date(Math.floor(now / 86_400_000) * 86_400_000);
    const query = (since) => pool.query(`select distinct on (f.species_id) f.species_id, f.weight_g, f.length_mm, f.variant, f.caught_at, f.player_id,
            coalesce(p.profile_name, '') as profile_name
     from farm_fish f left join player_profiles p on p.player_id = f.player_id
     ${since ? "where f.caught_at >= $1" : ""}
     order by f.species_id, f.weight_g desc, f.caught_at asc`, since ? [since] : []);
    const present = (rows) => rows.filter((row) => farmFishRule(row.species_id)).map((row) => ({
        speciesId: String(row.species_id),
        weightG: Number(row.weight_g) || 0,
        lengthMm: Number(row.length_mm) || 0,
        variant: String(row.variant),
        caughtAt: row.caught_at ? new Date(row.caught_at).getTime() : 0,
        playerId: String(row.player_id),
        name: String(row.profile_name || "").slice(0, 40) || "An angler",
    }));
    const [today, ever] = await Promise.all([query(day), query(null)]);
    return { day: day.getTime(), today: present(today.rows ?? []), allTime: present(ever.rows ?? []) };
}
// ---------------------------------------------------------------- a cast
/**
 * Put a line in the water. The server decides where it landed means (the
 * zone, from the Cove's own shape), whether a shadow there is close enough to
 * take it, what bites and when, and spends the worm. The client is told only
 * when the bite comes and how the fish will fight — not what it is.
 */
export async function castFarmLine(pool, input, now = Date.now(), random = Math.random) {
    const playerId = required(input?.playerId, "playerId");
    const castId = required(input?.castId, "castId");
    if (!ID.test(castId))
        throw new TypeError("invalid castId");
    const point = { x: Number(input?.point?.x), z: Number(input?.point?.z) };
    const zone = farmCoveZoneAt(point);
    if (!zone)
        return { ok: false, error: "not_water" };
    const rod = farmRodRule(input?.rodId);
    if (!rod)
        return { ok: false, error: "unknown_rod" };
    const bait = String(input?.bait ?? "");
    const lure = bait === WORM_ID ? null : farmLureRule(bait);
    if (bait !== WORM_ID && !lure)
        return { ok: false, error: "unknown_bait" };
    return transaction(pool, async (client) => {
        const angler = await lockedAngler(client, playerId);
        const level = fishingLevel(angler.fishing);
        if (level < ZONE_MIN_LEVEL[zone])
            return { ok: false, error: "zone_locked", zone, minLevel: ZONE_MIN_LEVEL[zone], level };
        if (!angler.tackle.rods.includes(rod.id))
            return { ok: false, error: "rod_not_owned" };
        if (lure ? (angler.tackle.lures[lure.id] ?? 0) < 1 : angler.tackle.worms < 1)
            return { ok: false, error: "no_bait", tackle: angler.tackle };
        if (await creelCount(client, playerId) >= CREEL_CAPACITY)
            return { ok: false, error: "creel_full", capacity: CREEL_CAPACITY };
        const recent = await client.query(`select count(*)::int as casts from farm_fish_casts where player_id = $1 and created_at > $2`, [playerId, new Date(now - 60 * 60 * 1000)]);
        if ((Number(recent.rows?.[0]?.casts) || 0) >= CASTS_PER_HOUR)
            return { ok: false, error: "too_many_casts" };
        const duplicate = await client.query(`select status from farm_fish_casts where player_id = $1 and cast_id = $2`, [playerId, castId]);
        if (duplicate.rows?.length)
            return { ok: false, error: "duplicate_cast" };
        // One line in the water: a new cast reels the old one in.
        await client.query(`update farm_fish_casts set status = 'abandoned', settled_at = $2 where player_id = $1 and status = 'open'`, [playerId, new Date(now)]);
        // A shadow the lure landed near, in this zone, that this angler has not already caught.
        let shadowId = null;
        let bite = null;
        const claimed = parseShadowId(input?.shadowId);
        if (claimed && claimed.zone === zone && Math.abs(claimed.window - shadowWindow(now)) <= 1) {
            const shadow = farmShadowInReach(farmShadowsForWindow(claimed.window, input?.env), String(input.shadowId), point, now);
            if (shadow) {
                const caught = await client.query(`select 1 from farm_fish where player_id = $1 and shadow_id = $2`, [playerId, shadow.id]);
                if (!caught.rows?.length) {
                    shadowId = shadow.id;
                    bite = { speciesId: shadow.speciesId, rank: shadow.rank, variant: shadow.variant };
                }
            }
        }
        if (!bite)
            bite = rollFarmBite(zone, lure ?? null, "blind", random);
        const species = farmFishRule(bite.speciesId);
        const weightG = weightGramsAtRank(species, bite.rank);
        const strength = farmFishStrength(species.id, weightG);
        // A shadow comes straight to the lure; open water takes longer to find it. A lure hurries both.
        const waitSeconds = (shadowId ? 1.2 + random() * 2.3 : 3 + random() * 8) * (lure ? 0.85 : 1);
        const biteAt = new Date(now + Math.round(waitSeconds * 1000));
        await client.query(`insert into farm_fish_casts (cast_id, player_id, zone, shadow_id, species_id, rank, variant, bait, rod_id, strength, bite_at, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [castId, playerId, zone, shadowId, species.id, bite.rank, bite.variant, bait, rod.id, strength, biteAt, new Date(now + CAST_TTL_MS), new Date(now)]);
        const tackle = lure ? angler.tackle : { ...angler.tackle, worms: angler.tackle.worms - 1 };
        await saveAngler(client, playerId, tackle, angler.fishing);
        return {
            ok: true,
            cast: {
                id: castId,
                zone,
                shadowId,
                biteDelay: waitSeconds,
                fight: { style: species.fight, strength },
                hint: shadowSizeForLength(lengthMmForWeight(species, weightG)),
            },
            tackle,
        };
    });
}
const OUTCOMES = new Set(["landed", "escaped", "snapped", "missed"]);
/**
 * How a cast ended. `landed` mints the fish — measured from the rank the bite
 * rolled, graded as the client says but never sooner than the fight could
 * take — and pays its Fishing XP. `escaped` (hooked, then lost) pays a little
 * XP for the fight; `snapped` does the same and costs the lure on the line;
 * `missed` (struck too early or too late) pays nothing.
 */
export async function landFarmCast(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const castId = required(input?.castId, "castId");
    if (!ID.test(castId))
        throw new TypeError("invalid castId");
    const outcome = String(input?.outcome ?? "");
    if (!OUTCOMES.has(outcome))
        return { ok: false, error: "invalid_outcome" };
    const grade = isFishGrade(input?.grade) ? input.grade : "normal";
    return transaction(pool, async (client) => {
        const angler = await lockedAngler(client, playerId);
        const found = await client.query(`select cast_id, zone, shadow_id, species_id, rank, variant, bait, rod_id, strength, bite_at, expires_at, status
       from farm_fish_casts where player_id = $1 and cast_id = $2 for update`, [playerId, castId]);
        const cast = found.rows?.[0];
        if (!cast)
            return { ok: false, error: "not_found" };
        if (cast.status !== "open")
            return { ok: false, error: "cast_closed", status: cast.status };
        const biteAt = new Date(cast.bite_at).getTime();
        if (now > new Date(cast.expires_at).getTime()) {
            await client.query(`update farm_fish_casts set status = 'expired', settled_at = $3 where player_id = $1 and cast_id = $2`, [playerId, castId, new Date(now)]);
            return { ok: false, error: "cast_expired" };
        }
        const species = farmFishRule(cast.species_id);
        const before = angler.fishing;
        let fishing = before;
        let tackle = angler.tackle;
        let fish = null;
        let xp = 0;
        if (outcome === "landed") {
            const fightFloor = minimumFightSeconds(species.fight, Number(cast.strength)) * 1000 * 0.9;
            if (now < biteAt + fightFloor)
                return { ok: false, error: "too_soon" };
            if (await creelCount(client, playerId) >= CREEL_CAPACITY)
                return { ok: false, error: "creel_full", capacity: CREEL_CAPACITY };
            const weightG = weightGramsAtRank(species, Number(cast.rank));
            const lengthMm = lengthMmForWeight(species, weightG);
            const sizeClass = sizeClassForRank(Number(cast.rank));
            const variant = cast.variant;
            const fishId = `fish-${randomUUID()}`;
            const inserted = await client.query(`insert into farm_fish (fish_id, player_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, shadow_id, cast_id, caught_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict do nothing
         returning fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at`, [fishId, playerId, species.id, weightG, lengthMm, sizeClass, grade, variant, cast.zone, cast.shadow_id, castId, new Date(now)]);
            // The only conflict is a shadow this angler already caught (another tab): nothing is minted twice.
            if (!inserted.rows?.length) {
                await client.query(`update farm_fish_casts set status = 'escaped', settled_at = $3 where player_id = $1 and cast_id = $2`, [playerId, castId, new Date(now)]);
                return { ok: false, error: "already_caught" };
            }
            fish = presentFish(inserted.rows[0]);
            xp = farmFishXp(species.id, weightG, grade);
            fishing = {
                ...before,
                xp: Math.min(FARMING_MAX_XP, before.xp + xp),
                catches: before.catches + 1,
                species: { ...before.species, [species.id]: (before.species[species.id] ?? 0) + 1 },
                shiny: before.shiny + (variant === "shiny" ? 1 : 0),
                golden: before.golden + (variant === "golden" ? 1 : 0),
                trophies: before.trophies + (sizeClass === "trophy" || sizeClass === "record" ? 1 : 0),
            };
        }
        else {
            // Only a fish that was actually on the line earns anything for getting away.
            const hooked = now >= biteAt && outcome !== "missed";
            xp = hooked ? ESCAPE_XP : 0;
            fishing = { ...before, xp: Math.min(FARMING_MAX_XP, before.xp + xp), escapes: before.escapes + (hooked ? 1 : 0) };
            const lureId = String(cast.bait);
            if (outcome === "snapped" && lureId !== WORM_ID && (tackle.lures[lureId] ?? 0) > 0) {
                const lures = { ...tackle.lures, [lureId]: tackle.lures[lureId] - 1 };
                if (lures[lureId] === 0)
                    delete lures[lureId];
                tackle = { ...tackle, lures };
            }
        }
        await client.query(`update farm_fish_casts set status = $3, settled_at = $4 where player_id = $1 and cast_id = $2`, [playerId, castId, outcome, new Date(now)]);
        await saveAngler(client, playerId, tackle, fishing);
        const achievements = fish
            ? await awardServerAchievementsInTransaction(client, {
                playerId, gameSlug: "farm",
                facts: { farming: { xp: 0, harvests: 0, orders: 0, crops: {}, fruit: {} }, fishing, catch: { rarity: species.rarity, sizeClass: fish.sizeClass, variant: fish.variant } },
                sourceId: `fish:${fish.id}`,
            })
            : [];
        return { ok: true, outcome, fish, xp, fishing: { ...farmingSummary(fishing, before.xp), catches: fishing.catches, escapes: fishing.escapes }, tackle, achievements };
    });
}
// ---------------------------------------------------------------- the creel
/**
 * Every fish in a player's creel, locked for the rest of the transaction: what
 * a cook, an order or a trade takes fish from. Locked fish come back too (flagged);
 * the callers never take one.
 */
export async function lockedCreel(client, playerId) {
    const result = await client.query(`select fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
     from farm_fish where player_id = $1 and state = 'creel' order by caught_at for update`, [playerId]);
    return result.rows ?? [];
}
/** Move fish out of the creel: cooked, into an order, mounted, sold... */
export async function settleFish(client, playerId, ids, state) {
    if (!ids.length)
        return;
    await client.query(`update farm_fish set state = $3, settled_at = now() where player_id = $1 and fish_id = any($2::text[])`, [playerId, [...ids], state]);
}
function fishIds(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FISH_PER_REQUEST)
        return null;
    const ids = Array.from(new Set(value.map((entry) => String(entry))));
    return ids.every((id) => FISH_ID.test(id)) ? ids : null;
}
async function heldFish(client, playerId, ids) {
    const result = await client.query(`select fish_id, species_id, weight_g, length_mm, size_class, grade, variant, zone, state, locked, caught_at
     from farm_fish where player_id = $1 and fish_id = any($2::text[]) and state = 'creel' for update`, [playerId, ids]);
    return result.rows ?? [];
}
/**
 * The Fishmonger buys fish out of the creel: each at its own price (species,
 * weight, grade, colour — services/farm-fish-catalog `farmFishValue`), all or
 * nothing, and a locked fish is never sold. A retried sale pays once.
 */
export async function sellFarmFish(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const saleId = required(input?.saleId, "saleId");
    if (!ID.test(saleId))
        throw new TypeError("invalid saleId");
    const ids = fishIds(input?.fishIds);
    if (!ids)
        return { ok: false, error: "invalid_sale" };
    const transactionKey = `farm:fish-sale:${saleId}`;
    return transaction(pool, async (client) => {
        const duplicate = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
        if (duplicate.rows?.length) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, earned: 0, sold: [], balance: Number(wallet.rows?.[0]?.balance) || 0 };
        }
        const rows = await heldFish(client, playerId, ids);
        if (rows.length !== ids.length)
            return { ok: false, error: "not_in_creel" };
        if (rows.some((row) => row.locked))
            return { ok: false, error: "fish_locked" };
        const fish = rows.map(presentFish);
        const earned = fish.reduce((sum, entry) => sum + entry.value, 0);
        const award = await awardTicketsInTransaction(client, {
            playerId, transactionKey, amount: earned, reason: "farm_fish_sale",
            metadata: { fish: fish.map((entry) => ({ id: entry.id, speciesId: entry.speciesId, weightG: entry.weightG, grade: entry.grade, variant: entry.variant, value: entry.value })) },
        });
        await client.query(`update farm_fish set state = 'sold', settled_at = now() where player_id = $1 and fish_id = any($2::text[])`, [playerId, ids]);
        return { ok: true, duplicate: false, earned, sold: ids, balance: award.balance };
    });
}
/** Let fish go: out of the creel, back to the Cove. Frees room; pays nothing. */
export async function releaseFarmFish(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const ids = fishIds(input?.fishIds);
    if (!ids)
        return { ok: false, error: "invalid_release" };
    return transaction(pool, async (client) => {
        const rows = await heldFish(client, playerId, ids);
        if (rows.length !== ids.length)
            return { ok: false, error: "not_in_creel" };
        if (rows.some((row) => row.locked))
            return { ok: false, error: "fish_locked" };
        await client.query(`update farm_fish set state = 'released', settled_at = now() where player_id = $1 and fish_id = any($2::text[])`, [playerId, ids]);
        return { ok: true, released: ids };
    });
}
/** Lock a fish (it cannot be sold or released until unlocked), or unlock it. */
export async function lockFarmFish(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const fishId = required(input?.fishId, "fishId");
    if (!FISH_ID.test(fishId))
        throw new TypeError("invalid fishId");
    const result = await pool.query(`update farm_fish set locked = $3 where player_id = $1 and fish_id = $2 and state = 'creel' returning fish_id`, [playerId, fishId, input?.locked === true]);
    if (!result.rows?.length)
        return { ok: false, error: "not_in_creel" };
    return { ok: true, fishId, locked: input?.locked === true };
}
// ---------------------------------------------------------------- Bait & Tackle
/**
 * Buy a rod (once, level-gated), lures (kept until a snapped line takes one;
 * up to nine of each) or a tub of worms. Tickets come off in the same
 * transaction the tackle goes into the box; a retried purchase buys once.
 */
export async function buyFarmTackle(pool, input) {
    const playerId = required(input?.playerId, "playerId");
    const purchaseId = required(input?.purchaseId, "purchaseId");
    if (!ID.test(purchaseId))
        throw new TypeError("invalid purchaseId");
    const itemId = String(input?.itemId ?? "");
    const quantity = Number(input?.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9)
        return { ok: false, error: "invalid_quantity" };
    const rod = farmRodRule(itemId);
    const lure = farmLureRule(itemId);
    if (!rod && !lure && itemId !== WORM_ID)
        return { ok: false, error: "unknown_item" };
    const transactionKey = `farm:tackle:${purchaseId}`;
    return transaction(pool, async (client) => {
        const angler = await lockedAngler(client, playerId);
        const level = fishingLevel(angler.fishing);
        const duplicate = await client.query(`select 1 from ticket_transactions where player_id = $1 and transaction_key = $2`, [playerId, transactionKey]);
        if (duplicate.rows?.length) {
            const wallet = await client.query(`select balance from ticket_wallets where player_id = $1`, [playerId]);
            return { ok: true, duplicate: true, price: 0, balance: Number(wallet.rows?.[0]?.balance) || 0, tackle: angler.tackle };
        }
        let tackle = angler.tackle;
        let price = 0;
        if (rod) {
            if (tackle.rods.includes(rod.id))
                return { ok: false, error: "already_owned", tackle };
            if (level < rod.minLevel)
                return { ok: false, error: "level_too_low", minLevel: rod.minLevel, level, tackle };
            if (quantity !== 1)
                return { ok: false, error: "invalid_quantity" };
            price = rod.price;
            tackle = { ...tackle, rods: FARM_RODS.map((entry) => entry.id).filter((id) => id === rod.id || tackle.rods.includes(id)) };
        }
        else if (lure) {
            if (level < lure.minLevel)
                return { ok: false, error: "level_too_low", minLevel: lure.minLevel, level, tackle };
            const held = tackle.lures[lure.id] ?? 0;
            if (held + quantity > MAX_LURES_EACH)
                return { ok: false, error: "tackle_full", tackle };
            price = lure.price * quantity;
            tackle = { ...tackle, lures: { ...tackle.lures, [lure.id]: held + quantity } };
        }
        else {
            if (tackle.worms + WORM_TUB.count * quantity > MAX_WORMS)
                return { ok: false, error: "tackle_full", tackle };
            price = WORM_TUB.price * quantity;
            tackle = { ...tackle, worms: tackle.worms + WORM_TUB.count * quantity };
        }
        let balance = null;
        if (price > 0) {
            const spend = await spendTicketsInTransaction(client, {
                playerId, transactionKey, amount: price, reason: "farm_tackle_purchase", metadata: { itemId, quantity },
            });
            if (!spend.ok)
                return { ok: false, error: spend.error, balance: spend.balance, price, tackle: angler.tackle };
            balance = spend.balance;
        }
        await saveAngler(client, playerId, tackle, angler.fishing);
        return { ok: true, duplicate: false, price, balance, tackle };
    });
}
export const FARM_FISHING_LIMITS = Object.freeze({ CAST_TTL_MS, CASTS_PER_HOUR, MAX_FISH_PER_REQUEST });
