import { singleLine, slugify, toIso } from "./content-shared.mjs";
function mapOverrideRow(row) {
    return {
        slug: String(row.slug || ""),
        hidden: row.hidden === true,
        featured: row.featured === null || row.featured === undefined ? null : row.featured === true,
        sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : null,
        title: row.title === null || row.title === undefined ? null : String(row.title),
        tagline: row.tagline === null || row.tagline === undefined ? null : String(row.tagline),
        description: row.description === null || row.description === undefined ? null : String(row.description),
        statusLabel: row.status_label === null || row.status_label === undefined ? null : String(row.status_label),
        categories: Array.isArray(row.categories) ? row.categories.map(String) : null,
        dimensions: Array.isArray(row.dimensions) ? row.dimensions.map(String) : null,
        playModes: Array.isArray(row.play_modes) ? row.play_modes.map(String) : null,
        previewVideo: row.preview_video === null || row.preview_video === undefined ? null : String(row.preview_video),
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
function optionalList(value, { maxItems = 8, maxLength = 32, allowed = null, lowercase = false } = {}) {
    if (!Array.isArray(value))
        return null;
    const normalized = [];
    for (const item of value) {
        let entry = singleLine(item, maxLength);
        if (lowercase)
            entry = entry.toLowerCase();
        if (!entry || allowed?.has(entry) === false || normalized.includes(entry))
            continue;
        normalized.push(entry);
        if (normalized.length >= maxItems)
            break;
    }
    return normalized.length ? normalized : null;
}
function optionalPreviewVideo(value) {
    const path = singleLine(value, 240);
    return /^grid-previews\/[a-z0-9][a-z0-9._/-]*\.(?:webm|mp4)$/i.test(path) ? path : null;
}
export async function listCabinetOverrides(pool) {
    if (!pool)
        return [];
    try {
        const result = await pool.query(`select slug, hidden, featured, sort_order, title, tagline, description, status_label,
              categories, dimensions, play_modes, preview_video, updated_at
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
        const result = await pool.query(`insert into cabinet_overrides (
         slug, hidden, featured, sort_order, title, tagline, description, status_label,
         categories, dimensions, play_modes, preview_video, updated_by, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, now())
       on conflict (slug) do update
         set hidden = excluded.hidden,
             featured = excluded.featured,
             sort_order = excluded.sort_order,
             title = excluded.title,
             tagline = excluded.tagline,
             description = excluded.description,
             status_label = excluded.status_label,
             categories = excluded.categories,
             dimensions = excluded.dimensions,
             play_modes = excluded.play_modes,
             preview_video = excluded.preview_video,
             updated_by = excluded.updated_by,
             updated_at = now()
       returning slug, hidden, featured, sort_order, title, tagline, description, status_label,
                 categories, dimensions, play_modes, preview_video, updated_at`, [
            cabinetSlug,
            input?.hidden === true,
            optionalBoolean(input?.featured),
            optionalNumber(input?.sortOrder),
            optionalText(input?.title, 96),
            optionalText(input?.tagline, 160),
            optionalText(input?.description, 1200),
            optionalText(input?.statusLabel, 160),
            JSON.stringify(optionalList(input?.categories) || null),
            JSON.stringify(optionalList(input?.dimensions, {
                allowed: new Set(["2d", "3d"]), lowercase: true,
            }) || null),
            JSON.stringify(optionalList(input?.playModes, {
                allowed: new Set(["solo", "local", "online"]), lowercase: true,
            }) || null),
            optionalPreviewVideo(input?.previewVideo),
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
