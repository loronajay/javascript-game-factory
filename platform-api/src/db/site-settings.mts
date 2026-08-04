import { singleLine, slugify, toIso } from "./content-shared.mjs";

// Site configuration: keyed JSON settings plus per-cabinet grid overrides.
//
// STABILITY CONTRACT — read before changing anything here.
// Neither table is a source of truth for a cabinet. `games/<slug>/game.json` remains
// the authority for what a game IS; a row in `cabinet_overrides` only says how the GRID
// should present it. Every override column except `hidden` is nullable, and null means
// "inherit from the file". Deleting a row restores the shipped presentation exactly.
// Nothing here is readable by game code, and no value written here reaches a cabinet's
// runtime — the merge happens in the browser catalog loader, over data already loaded
// from game.json, and is skipped entirely if this API is unreachable.

export interface CabinetOverride {
  slug: string;
  hidden: boolean;
  featured: boolean | null;
  sortOrder: number | null;
  title: string | null;
  tagline: string | null;
  statusLabel: string | null;
  updatedAt: string;
}

function mapOverrideRow(row: any): CabinetOverride {
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
function optionalText(value: unknown, maxLength: number): string | null {
  const text = singleLine(value, maxLength);
  return text ? text : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export async function listCabinetOverrides(pool: any): Promise<CabinetOverride[]> {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `select slug, hidden, featured, sort_order, title, tagline, status_label, updated_at
         from cabinet_overrides order by slug asc`,
    );
    return (result?.rows || []).map(mapOverrideRow);
  } catch {
    return [];
  }
}

export async function saveCabinetOverride(pool: any, slug: any, input: any, updatedBy: any): Promise<{ ok: boolean; error?: string; override?: CabinetOverride }> {
  if (!pool) return { ok: false, error: "database_unavailable" };
  const cabinetSlug = slugify(slug, "");
  if (!cabinetSlug) return { ok: false, error: "invalid_slug" };

  try {
    const result = await pool.query(
      `insert into cabinet_overrides (slug, hidden, featured, sort_order, title, tagline, status_label, updated_by, updated_at)
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
       returning slug, hidden, featured, sort_order, title, tagline, status_label, updated_at`,
      [
        cabinetSlug,
        input?.hidden === true,
        optionalBoolean(input?.featured),
        optionalNumber(input?.sortOrder),
        optionalText(input?.title, 96),
        optionalText(input?.tagline, 160),
        optionalText(input?.statusLabel, 160),
        String(updatedBy || "system"),
      ],
    );
    return { ok: true, override: mapOverrideRow(result.rows[0]) };
  } catch (err) {
    process.stderr.write(`[site-settings] saveCabinetOverride error: ${(err as any)?.message || err}\n`);
    return { ok: false, error: "server_error" };
  }
}

// Deleting is how an operator undoes everything they changed about a cabinet. It is a
// success even when no row existed, because "this cabinet has no overrides" is the
// desired end state either way.
export async function deleteCabinetOverride(pool: any, slug: any): Promise<{ ok: boolean; error?: string }> {
  if (!pool) return { ok: false, error: "database_unavailable" };
  const cabinetSlug = slugify(slug, "");
  if (!cabinetSlug) return { ok: false, error: "invalid_slug" };
  try {
    await pool.query("delete from cabinet_overrides where slug = $1", [cabinetSlug]);
    return { ok: true };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

// Keyed JSON settings. Returns a plain object of key -> value; a missing key is simply
// absent, and callers supply their own defaults rather than relying on a seeded row.
export async function listSiteSettings(pool: any): Promise<Record<string, unknown>> {
  if (!pool) return {};
  try {
    const result = await pool.query("select key, value from site_settings");
    const settings: Record<string, unknown> = {};
    for (const row of result?.rows || []) {
      settings[String(row.key)] = row.value;
    }
    return settings;
  } catch {
    return {};
  }
}

export async function saveSiteSetting(pool: any, key: any, value: unknown, updatedBy: any): Promise<{ ok: boolean; error?: string }> {
  if (!pool) return { ok: false, error: "database_unavailable" };
  const settingKey = singleLine(key, 80);
  if (!settingKey) return { ok: false, error: "invalid_key" };

  try {
    await pool.query(
      `insert into site_settings (key, value, updated_by, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (key) do update
         set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [settingKey, JSON.stringify(value === undefined ? null : value), String(updatedBy || "system")],
    );
    return { ok: true };
  } catch (err) {
    process.stderr.write(`[site-settings] saveSiteSetting error: ${(err as any)?.message || err}\n`);
    return { ok: false, error: "server_error" };
  }
}
