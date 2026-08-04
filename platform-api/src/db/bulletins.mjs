import { enumValue, httpUrl, singleLine, slugify, textBlock, toIso, toTimestampOrNull } from "./content-shared.mjs";
// Persistence for platform-authored announcements.
//
// The row shape matches the browser contract in js/platform/bulletins/bulletins.mts
// field-for-field, so a row served by the API and a shipped fixture normalize to the
// same object. That equivalence is what lets the bulletins page fall back to its
// built-in defaults when this table is empty without a second rendering path.
const STATUSES = ["draft", "published", "archived"];
const AUDIENCES = ["public", "friends", "private"];
const SELECT_COLUMNS = `
  id, slug, title, summary, body, status, audience, pinned, image_url,
  published_at, created_by, updated_at
`;
function mapRow(row) {
    return {
        id: String(row.id),
        slug: String(row.slug || ""),
        title: String(row.title || ""),
        summary: String(row.summary || ""),
        body: String(row.body || ""),
        status: enumValue(row.status, STATUSES, "draft"),
        audience: enumValue(row.audience, AUDIENCES, "public"),
        pinned: row.pinned === true,
        imageUrl: String(row.image_url || ""),
        publishedAt: toIso(row.published_at),
        createdBy: String(row.created_by || "system"),
        updatedAt: toIso(row.updated_at),
    };
}
// Normalizes an operator-supplied payload into the columns we are willing to write.
// Anything not named here (id, created_at, created_by) is not settable from a request.
function normalizeInput(input = {}) {
    const title = singleLine(input.title, 96) || "Untitled Bulletin";
    const status = enumValue(input.status, STATUSES, "draft");
    return {
        slug: slugify(input.slug || title, ""),
        title,
        summary: textBlock(input.summary, 220),
        body: textBlock(input.body, 4000),
        status,
        audience: enumValue(input.audience, AUDIENCES, "public"),
        pinned: input.pinned === true,
        imageUrl: httpUrl(input.imageUrl),
        // Publishing without an explicit date stamps "now" rather than leaving the board
        // sorted by a null — an operator hitting Publish means "live as of this moment".
        publishedAt: toTimestampOrNull(input.publishedAt) || (status === "published" ? new Date().toISOString() : null),
    };
}
// The public board. Filtering happens in SQL rather than in the browser so a draft is
// never shipped to a client that could read it out of the payload.
export async function listPublicBulletins(pool, options = {}) {
    if (!pool)
        return [];
    const limit = Math.min(Math.max(Number.parseInt(String(options?.limit || "50"), 10) || 50, 1), 200);
    try {
        const result = await pool.query(`select ${SELECT_COLUMNS} from bulletins
        where status = 'published' and audience = 'public'
        order by pinned desc, published_at desc nulls last, title asc
        limit $1`, [limit]);
        return (result?.rows || []).map(mapRow);
    }
    catch {
        return [];
    }
}
// The console list: every bulletin in every state, newest work first.
export async function listAllBulletins(pool) {
    if (!pool)
        return [];
    try {
        const result = await pool.query(`select ${SELECT_COLUMNS} from bulletins
        order by pinned desc, coalesce(published_at, updated_at) desc, title asc`);
        return (result?.rows || []).map(mapRow);
    }
    catch {
        return [];
    }
}
export async function getPublicBulletinBySlug(pool, slug) {
    if (!pool || !slug)
        return null;
    try {
        const result = await pool.query(`select ${SELECT_COLUMNS} from bulletins
        where slug = $1 and status = 'published' and audience = 'public'`, [String(slug)]);
        return result?.rows?.[0] ? mapRow(result.rows[0]) : null;
    }
    catch {
        return null;
    }
}
export async function createBulletin(pool, input, createdBy) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const values = normalizeInput(input);
    if (!values.slug)
        return { ok: false, error: "invalid_slug" };
    try {
        const result = await pool.query(`insert into bulletins (slug, title, summary, body, status, audience, pinned, image_url, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${SELECT_COLUMNS}`, [
            values.slug, values.title, values.summary, values.body,
            values.status, values.audience, values.pinned, values.imageUrl, values.publishedAt,
            String(createdBy || "system"),
        ]);
        return { ok: true, bulletin: mapRow(result.rows[0]) };
    }
    catch (err) {
        // 23505 is Postgres' unique_violation — the slug is already taken. Reported as a
        // named error so the console can say so instead of showing a generic failure.
        if (err?.code === "23505")
            return { ok: false, error: "slug_taken" };
        process.stderr.write(`[bulletins] createBulletin error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
export async function updateBulletin(pool, id, input) {
    if (!pool || !id)
        return { ok: false, error: "invalid_request" };
    const values = normalizeInput(input);
    if (!values.slug)
        return { ok: false, error: "invalid_slug" };
    try {
        const result = await pool.query(`update bulletins
          set slug = $2, title = $3, summary = $4, body = $5, status = $6,
              audience = $7, pinned = $8, image_url = $9, published_at = $10, updated_at = now()
        where id = $1
        returning ${SELECT_COLUMNS}`, [
            String(id), values.slug, values.title, values.summary, values.body,
            values.status, values.audience, values.pinned, values.imageUrl, values.publishedAt,
        ]);
        if (!result?.rowCount)
            return { ok: false, error: "not_found" };
        return { ok: true, bulletin: mapRow(result.rows[0]) };
    }
    catch (err) {
        if (err?.code === "23505")
            return { ok: false, error: "slug_taken" };
        process.stderr.write(`[bulletins] updateBulletin error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
export async function deleteBulletin(pool, id) {
    if (!pool || !id)
        return { ok: false, error: "invalid_request" };
    try {
        const result = await pool.query("delete from bulletins where id = $1", [String(id)]);
        return result?.rowCount ? { ok: true } : { ok: false, error: "not_found" };
    }
    catch {
        return { ok: false, error: "server_error" };
    }
}
