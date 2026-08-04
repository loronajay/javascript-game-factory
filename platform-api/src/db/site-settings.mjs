import { singleLine, slugify, toIso } from "./content-shared.mjs";
function mapOverrideRow(row) {
    return {
        slug: String(row.slug || ""),
        hidden: row.hidden === true,
        featured: row.featured === null || row.featured === undefined ? null : row.featured === true,
        sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : null,
        title: row.title === null || row.title === undefined ? null : String(row.title),
        tagline: row.tagline === null || row.tagline === undefined ? null : String(row.tagline),
        statusLabel: row.status_label === null || row.status_label === undefined ? null : String(row.status_label),
        updatedAt: toIso(row.updated_at),
    };
}
// An empty string from a cleared form field means "stop overriding this", not "override
// with empty". Without this, blanking a field in the console would erase the cabinet's
// real title on the grid instead of restoring it.
function optionalText(value, maxLength) {
    const text = singleLine(value, maxLength);
    return text ? text : null;
}
function optionalNumber(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) ? parsed : null;
}
function optionalBoolean(value) {
    if (value === true)
        return true;
    if (value === false)
        return false;
    return null;
}
export async function listCabinetOverrides(pool) {
    if (!pool)
        return [];
    try {
        const result = await pool.query(`select slug, hidden, featured, sort_order, title, tagline, status_label, updated_at
         from cabinet_overrides order by slug asc`);
        return (result?.rows || []).map(mapOverrideRow);
    }
    catch {
        return [];
    }
}
export async function saveCabinetOverride(pool, slug, input, updatedBy) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const cabinetSlug = slugify(slug, "");
    if (!cabinetSlug)
        return { ok: false, error: "invalid_slug" };
    try {
        const result = await pool.query(`insert into cabinet_overrides (slug, hidden, featured, sort_order, title, tagline, status_label, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (slug) do update
         set hidden = excluded.hidden,
             featured = excluded.featured,
             sort_order = excluded.sort_order,
             title = excluded.title,
             tagline = excluded.tagline,
             status_label = excluded.status_label,
             updated_by = excluded.updated_by,
             updated_at = now()
       returning slug, hidden, featured, sort_order, title, tagline, status_label, updated_at`, [
            cabinetSlug,
            input?.hidden === true,
            optionalBoolean(input?.featured),
            optionalNumber(input?.sortOrder),
            optionalText(input?.title, 96),
            optionalText(input?.tagline, 160),
            optionalText(input?.statusLabel, 160),
            String(updatedBy || "system"),
        ]);
        return { ok: true, override: mapOverrideRow(result.rows[0]) };
    }
    catch (err) {
        process.stderr.write(`[site-settings] saveCabinetOverride error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
// Deleting is how an operator undoes everything they changed about a cabinet. It is a
// success even when no row existed, because "this cabinet has no overrides" is the
// desired end state either way.
export async function deleteCabinetOverride(pool, slug) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const cabinetSlug = slugify(slug, "");
    if (!cabinetSlug)
        return { ok: false, error: "invalid_slug" };
    try {
        await pool.query("delete from cabinet_overrides where slug = $1", [cabinetSlug]);
        return { ok: true };
    }
    catch {
        return { ok: false, error: "server_error" };
    }
}
// Keyed JSON settings. Returns a plain object of key -> value; a missing key is simply
// absent, and callers supply their own defaults rather than relying on a seeded row.
export async function listSiteSettings(pool) {
    if (!pool)
        return {};
    try {
        const result = await pool.query("select key, value from site_settings");
        const settings = {};
        for (const row of result?.rows || []) {
            settings[String(row.key)] = row.value;
        }
        return settings;
    }
    catch {
        return {};
    }
}
export async function saveSiteSetting(pool, key, value, updatedBy) {
    if (!pool)
        return { ok: false, error: "database_unavailable" };
    const settingKey = singleLine(key, 80);
    if (!settingKey)
        return { ok: false, error: "invalid_key" };
    try {
        await pool.query(`insert into site_settings (key, value, updated_by, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (key) do update
         set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [settingKey, JSON.stringify(value === undefined ? null : value), String(updatedBy || "system")]);
        return { ok: true };
    }
    catch (err) {
        process.stderr.write(`[site-settings] saveSiteSetting error: ${err?.message || err}\n`);
        return { ok: false, error: "server_error" };
    }
}
