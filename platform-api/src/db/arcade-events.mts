import { enumValue, singleLine, slugify, stringList, textBlock, toIso, toTimestampOrNull } from "./content-shared.mjs";

// Persistence for the arcade event calendar.
//
// Mirrors js/platform/events/events.mts field-for-field for the same reason bulletins
// does: a stored row and a shipped fixture must normalize identically so the calendar
// has exactly one rendering path whether or not the table has rows.

const STATUSES = ["scheduled", "live", "completed", "cancelled"] as const;

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  startsAt: string;
  endsAt: string;
  relatedGames: string[];
  bulletinIds: string[];
  status: (typeof STATUSES)[number];
  createdBy: string;
  updatedAt: string;
}

const SELECT_COLUMNS = `
  id, slug, title, summary, body, starts_at, ends_at,
  related_games, bulletin_ids, status, created_by, updated_at
`;

function mapRow(row: any): EventRecord {
  return {
    id: String(row.id),
    slug: String(row.slug || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    body: String(row.body || ""),
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    relatedGames: stringList(row.related_games),
    bulletinIds: stringList(row.bulletin_ids),
    status: enumValue(row.status, STATUSES, "scheduled"),
    createdBy: String(row.created_by || "system"),
    updatedAt: toIso(row.updated_at),
  };
}

function normalizeInput(input: any = {}) {
  const title = singleLine(input.title, 96) || "Untitled Event";
  return {
    slug: slugify(input.slug || title, ""),
    title,
    summary: textBlock(input.summary, 220),
    body: textBlock(input.body, 4000),
    startsAt: toTimestampOrNull(input.startsAt),
    endsAt: toTimestampOrNull(input.endsAt),
    relatedGames: stringList(input.relatedGames),
    bulletinIds: stringList(input.bulletinIds),
    status: enumValue(input.status, STATUSES, "scheduled"),
  };
}

// The public calendar. Cancelled events are filtered in SQL to match the existing
// buildPublicEventFeed contract, which has always hidden them.
export async function listPublicEvents(pool: any, options: any = {}): Promise<EventRecord[]> {
  if (!pool) return [];
  const limit = Math.min(Math.max(Number.parseInt(String(options?.limit || "50"), 10) || 50, 1), 200);
  try {
    const result = await pool.query(
      `select ${SELECT_COLUMNS} from arcade_events
        where status <> 'cancelled'
        order by starts_at asc nulls last, title asc
        limit $1`,
      [limit],
    );
    return (result?.rows || []).map(mapRow);
  } catch {
    return [];
  }
}

export async function listAllEvents(pool: any): Promise<EventRecord[]> {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `select ${SELECT_COLUMNS} from arcade_events order by starts_at desc nulls last, title asc`,
    );
    return (result?.rows || []).map(mapRow);
  } catch {
    return [];
  }
}

export async function getPublicEventBySlug(pool: any, slug: any): Promise<EventRecord | null> {
  if (!pool || !slug) return null;
  try {
    const result = await pool.query(
      `select ${SELECT_COLUMNS} from arcade_events where slug = $1 and status <> 'cancelled'`,
      [String(slug)],
    );
    return result?.rows?.[0] ? mapRow(result.rows[0]) : null;
  } catch {
    return null;
  }
}

export async function createEvent(pool: any, input: any, createdBy: any): Promise<{ ok: boolean; error?: string; event?: EventRecord }> {
  if (!pool) return { ok: false, error: "database_unavailable" };
  const values = normalizeInput(input);
  if (!values.slug) return { ok: false, error: "invalid_slug" };

  try {
    const result = await pool.query(
      `insert into arcade_events
         (slug, title, summary, body, starts_at, ends_at, related_games, bulletin_ids, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
       returning ${SELECT_COLUMNS}`,
      [
        values.slug, values.title, values.summary, values.body,
        values.startsAt, values.endsAt,
        JSON.stringify(values.relatedGames), JSON.stringify(values.bulletinIds),
        values.status, String(createdBy || "system"),
      ],
    );
    return { ok: true, event: mapRow(result.rows[0]) };
  } catch (err) {
    if ((err as any)?.code === "23505") return { ok: false, error: "slug_taken" };
    process.stderr.write(`[arcade-events] createEvent error: ${(err as any)?.message || err}\n`);
    return { ok: false, error: "server_error" };
  }
}

export async function updateEvent(pool: any, id: any, input: any): Promise<{ ok: boolean; error?: string; event?: EventRecord }> {
  if (!pool || !id) return { ok: false, error: "invalid_request" };
  const values = normalizeInput(input);
  if (!values.slug) return { ok: false, error: "invalid_slug" };

  try {
    const result = await pool.query(
      `update arcade_events
          set slug = $2, title = $3, summary = $4, body = $5, starts_at = $6, ends_at = $7,
              related_games = $8::jsonb, bulletin_ids = $9::jsonb, status = $10, updated_at = now()
        where id = $1
        returning ${SELECT_COLUMNS}`,
      [
        String(id), values.slug, values.title, values.summary, values.body,
        values.startsAt, values.endsAt,
        JSON.stringify(values.relatedGames), JSON.stringify(values.bulletinIds),
        values.status,
      ],
    );
    if (!result?.rowCount) return { ok: false, error: "not_found" };
    return { ok: true, event: mapRow(result.rows[0]) };
  } catch (err) {
    if ((err as any)?.code === "23505") return { ok: false, error: "slug_taken" };
    process.stderr.write(`[arcade-events] updateEvent error: ${(err as any)?.message || err}\n`);
    return { ok: false, error: "server_error" };
  }
}

export async function deleteEvent(pool: any, id: any): Promise<{ ok: boolean; error?: string }> {
  if (!pool || !id) return { ok: false, error: "invalid_request" };
  try {
    const result = await pool.query("delete from arcade_events where id = $1", [String(id)]);
    return result?.rowCount ? { ok: true } : { ok: false, error: "not_found" };
  } catch {
    return { ok: false, error: "server_error" };
  }
}
