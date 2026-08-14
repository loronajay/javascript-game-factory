// Per-game driver profiles: the name, face and pinned cars a player has set up
// inside one cabinet.
//
// The sibling of `game-loadouts.mts`, over `game_driver_profiles` (037), and the
// two are deliberately separate: that one answers "what car is this player
// driving", this one answers "who is this player, in this cabinet".
//
// **The read is public and the write is self-only**, which is the *opposite*
// asymmetry to the garage's and it is the run records' argument rather than an
// oversight: a garage is private because nobody else's business is how many
// paints you have saved, while a name, a face and five favourite cars exist to
// be shown to somebody. There is nothing in this document to resolve away, so
// the public read returns it whole.
//
// Validation lives in the cabinet's catalog, not here: this module owns the
// rows, the catalog owns what a valid profile means. A second cabinet wanting a
// server-backed driver registers its own catalog and reuses this table.
//
// **Nothing here is identity.** Canonical identity belongs to the factory shell;
// this is the name over the door of one machine. No path in this module may
// write to `player_profiles`, and no caller may treat a name here as
// authenticated.
import { SPEED_DEMON_GAME_SLUG, normalizeDriverProfile, } from "../services/speed-demon-catalog.mjs";
const VALID_GAME_SLUG = /^[a-z0-9-]{1,60}$/;
/**
 * Per-game validation. A slug with no catalog cannot store a profile at all —
 * accepting unvalidated JSON from any client that names a new slug is the hole
 * this registry closes, the same one the loadout catalog registry closes.
 */
const CATALOGS = {
    [SPEED_DEMON_GAME_SLUG]: { normalizeProfile: normalizeDriverProfile },
};
function cleanText(value, maxLength = 120) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function normalizeGameSlug(value) {
    const slug = cleanText(value, 60).toLowerCase();
    return VALID_GAME_SLUG.test(slug) ? slug : "";
}
export function isValidGameProfileSlug(value) {
    return Boolean(normalizeGameSlug(value)) && Object.hasOwn(CATALOGS, normalizeGameSlug(value));
}
/**
 * One player's driver profile. Null when the slug is unknown or the read fails —
 * a *missing row* is not either of those: a player who has never opened the
 * profile screen gets the catalog's defaults, which is exactly what their own
 * client is drawing.
 */
export async function getGameProfile(pool, { playerId, gameSlug } = {}) {
    const normalizedPlayerId = cleanText(playerId);
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    if (!pool || !normalizedPlayerId || !catalog)
        return null;
    try {
        const res = await pool.query(`select profile, updated_at from game_driver_profiles where player_id = $1 and game_slug = $2`, [normalizedPlayerId, slug]);
        const row = res.rows[0];
        return {
            playerId: normalizedPlayerId,
            gameSlug: slug,
            // Normalized on the way out as well as in, for the garage's reason: a row
            // written by an older build, or by a catalog that has since tightened a
            // bound, must not hand a client something it would refuse to draw.
            profile: catalog.normalizeProfile(row?.profile ?? null),
            updatedAt: row?.updated_at ?? null,
        };
    }
    catch (err) {
        process.stderr.write(`[game-profiles] getGameProfile error: ${err?.message || err}\n`);
        return null;
    }
}
/**
 * Replaces a player's driver profile. Whole-document write rather than a patch,
 * the garage's rule: the client owns the document's shape and a field-by-field
 * merge between two versions of it is a source of silent divergence for no gain.
 */
export async function saveGameProfile(pool, { playerId, gameSlug, profile } = {}) {
    const normalizedPlayerId = cleanText(playerId);
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    if (!pool || !normalizedPlayerId || !catalog) {
        return { ok: false, statusCode: 400, error: "invalid_request" };
    }
    const normalized = catalog.normalizeProfile(profile);
    try {
        await pool.query(`insert into game_driver_profiles (player_id, game_slug, profile, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (player_id, game_slug) do update
         set profile = excluded.profile, updated_at = now()`, [normalizedPlayerId, slug, JSON.stringify(normalized)]);
        return { ok: true, profile: normalized };
    }
    catch (err) {
        process.stderr.write(`[game-profiles] saveGameProfile error: ${err?.message || err}\n`);
        return { ok: false, statusCode: 500, error: "save_failed" };
    }
}
/**
 * Several players' drivers in one round trip — what a lobby or a results screen
 * wants rather than N sequential fetches while a countdown runs. The loadout
 * batch's shape and its bound: unknown players come back on the defaults for the
 * same reason a missing row does.
 */
export async function getGameProfiles(pool, { playerIds, gameSlug } = {}) {
    const slug = normalizeGameSlug(gameSlug);
    const catalog = CATALOGS[slug];
    const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).map((id) => cleanText(id)).filter(Boolean))]
        .slice(0, 16);
    if (!pool || !catalog || !ids.length)
        return [];
    try {
        const res = await pool.query(`select player_id, profile from game_driver_profiles where game_slug = $1 and player_id = any($2::text[])`, [slug, ids]);
        const byPlayer = new Map(res.rows.map((row) => [row.player_id, row.profile]));
        return ids.map((playerId) => ({
            playerId,
            gameSlug: slug,
            profile: catalog.normalizeProfile(byPlayer.get(playerId) ?? null),
        }));
    }
    catch (err) {
        process.stderr.write(`[game-profiles] getGameProfiles error: ${err?.message || err}\n`);
        return [];
    }
}
