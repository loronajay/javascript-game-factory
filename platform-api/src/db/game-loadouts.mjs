// Per-game cosmetic loadout storage: a player's garage, and the resolved car an
// opponent is shown.
//
// Two reads, deliberately different:
//
//   getGarage       — the owner's whole garage, every saved preset. Auth'd to self.
//   getPublicLoadout — one player's *current car*, and nothing else. Public.
//
// The split is the privacy boundary. An opponent needs to draw the car you are
// driving; they have no business knowing how many paints you have saved, what
// you called them, or which cars you have configured. Returning the garage to
// anyone who asks would leak all of that for no gain, so the public path
// resolves to a single `{ modelId, livery }` before it leaves this module.
//
// Validation lives in services/speed-demon-catalog, not here: this module owns
// the rows, the catalog owns what a valid garage means. A second cabinet wanting
// server-backed cosmetics registers its own catalog and reuses this table.
import { SPEED_DEMON_GAME_SLUG, loadoutFromGarage, normalizeGarage, } from "../services/speed-demon-catalog.mjs";
const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
/**
 * Per-game validation. A slug with no catalog cannot store a loadout at all —
 * silently accepting unvalidated JSON from any client that names a new slug is
 * exactly the hole this registry closes.
 */
const CATALOGS = {
    [SPEED_DEMON_GAME_SLUG]: { normalizeGarage, loadoutFromGarage },
};
function cleanText(value, maxLength = 120) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function normalizeGameSlug(value) {
    const slug = cleanText(value, 60).toLowerCase();
    return VALID_GAME_SLUG.test(slug) ? slug : "";
}
export function isValidLoadoutSlug(value) {
    return Boolean(normalizeGameSlug(value)) && Object.hasOwn(CATALOGS, normalizeGameSlug(value));
}
/** The owner's whole garage. Null when the slug is unknown or the read fails. */
export async function getGarage(pool, { playerId, gameSlug } = {}) {
    const normalizedPlayerId = cleanText(playerId);
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    if (!pool || !normalizedPlayerId || !catalog)
        return null;
    try {
        const res = await pool.query(`select garage, updated_at from game_loadouts where player_id = $1 and game_slug = $2`, [normalizedPlayerId, slug]);
        const row = res.rows[0];
        return {
            playerId: normalizedPlayerId,
            gameSlug: slug,
            // Normalized on the way out as well as in. A row written by an older
            // build, or by a catalog that has since tightened a bound, must not be
            // able to hand a client something it would refuse to draw.
            garage: catalog.normalizeGarage(row?.garage ?? null),
            updatedAt: row?.updated_at ?? null,
        };
    }
    catch (err) {
        process.stderr.write(`[game-loadouts] getGarage error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * Replaces a player's garage. Whole-document write rather than a patch: the
 * client owns the garage's shape (ids, ordering, which preset is selected) and a
 * field-by-field merge between two versions of that document would be a source
 * of silent divergence for no benefit.
 */
export async function saveGarage(pool, { playerId, gameSlug, garage } = {}) {
    const normalizedPlayerId = cleanText(playerId);
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    if (!pool || !normalizedPlayerId || !catalog) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const normalized = catalog.normalizeGarage(garage);
    try {
        await pool.query(`insert into game_loadouts (player_id, game_slug, garage, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (player_id, game_slug) do update
         set garage = excluded.garage, updated_at = now()`, [normalizedPlayerId, slug, JSON.stringify(normalized)]);
        return { ok: true, garage: normalized };
    }
    catch (err) {
        process.stderr.write(`[game-loadouts] saveGarage error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "save_failed" };
    }
}
/**
 * What one player is driving, for an opponent to draw. Never the whole garage —
 * see the note at the top of this file.
 *
 * A player who has never opened the garage has no row, and that is not an error:
 * they get the catalog's default car, which is exactly what their own client
 * will be showing. An online race must never fail because someone left their car
 * on factory paint.
 */
export async function getPublicLoadout(pool, { playerId, gameSlug } = {}) {
    const normalizedPlayerId = cleanText(playerId);
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    if (!pool || !normalizedPlayerId || !catalog)
        return null;
    try {
        const res = await pool.query(`select garage from game_loadouts where player_id = $1 and game_slug = $2`, [normalizedPlayerId, slug]);
        return {
            playerId: normalizedPlayerId,
            gameSlug: slug,
            ...catalog.loadoutFromGarage(res.rows[0]?.garage ?? null),
        };
    }
    catch (err) {
        process.stderr.write(`[game-loadouts] getPublicLoadout error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * Several players' cars in one round trip — what a lobby or a results screen
 * wants, rather than N sequential fetches while a countdown is running.
 * Unknown players come back on the default car for the same reason a missing row
 * does.
 */
export async function getPublicLoadouts(pool, { playerIds, gameSlug } = {}) {
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).map((id) => cleanText(id)).filter(Boolean))]
        .slice(0, 16);
    if (!pool || !catalog || !ids.length)
        return [];
    try {
        const res = await pool.query(`select player_id, garage from game_loadouts where game_slug = $1 and player_id = any($2::text[])`, [slug, ids]);
        const byPlayer = new Map(res.rows.map((row) => [row.player_id, row.garage]));
        return ids.map((playerId) => ({
            playerId,
            gameSlug: slug,
            ...catalog.loadoutFromGarage(byPlayer.get(playerId) ?? null),
        }));
    }
    catch (err) {
        process.stderr.write(`[game-loadouts] getPublicLoadouts error: ${err?.message || err}\n`);
        return [];
    }
}
