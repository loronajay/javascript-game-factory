import { normalizeThoughtPost } from "../../../js/platform/thoughts/thoughts.mjs";

function sanitizeThoughtId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToThought(row = {}) {
  return normalizeThoughtPost({
    id: row.id,
    authorPlayerId: row.author_player_id,
    authorDisplayName: row.author_display_name,
    subject: row.subject,
    text: row.text,
    visibility: row.visibility,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    reactionTotals: ensureJsonObject(row.reaction_totals),
    repostOfId: row.repost_of_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  });
}

function buildThoughtParams(thought) {
  return [
    thought.id,
    thought.authorPlayerId,
    thought.authorDisplayName,
    thought.subject,
    thought.text,
    thought.visibility,
    thought.commentCount,
    thought.shareCount,
    JSON.stringify(thought.reactionTotals),
    thought.repostOfId,
    thought.createdAt,
    thought.editedAt,
  ];
}

export async function listThoughts(db, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 40, 100));

  const result = await db.query(`
    select
      id,
      author_player_id,
      author_display_name,
      subject,
      text,
      visibility,
      comment_count,
      share_count,
      reaction_totals,
      repost_of_id,
      created_at,
      edited_at
    from thought_posts
    order by created_at desc, id desc
    limit $1
  `, [limit]);

  return (result?.rows || []).map(mapRowToThought);
}

export async function saveThought(db, thought = {}) {
  const normalized = normalizeThoughtPost(thought);

  const result = await db.query(`
    insert into thought_posts (
      id,
      author_player_id,
      author_display_name,
      subject,
      text,
      visibility,
      comment_count,
      share_count,
      reaction_totals,
      repost_of_id,
      created_at,
      edited_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12
    )
    on conflict (id) do update set
      author_player_id = excluded.author_player_id,
      author_display_name = excluded.author_display_name,
      subject = excluded.subject,
      text = excluded.text,
      visibility = excluded.visibility,
      comment_count = excluded.comment_count,
      share_count = excluded.share_count,
      reaction_totals = excluded.reaction_totals,
      repost_of_id = excluded.repost_of_id,
      created_at = excluded.created_at,
      edited_at = excluded.edited_at
    returning
      id,
      author_player_id,
      author_display_name,
      subject,
      text,
      visibility,
      comment_count,
      share_count,
      reaction_totals,
      repost_of_id,
      created_at,
      edited_at
  `, buildThoughtParams(normalized));

  return mapRowToThought(result?.rows?.[0] || null);
}

export async function deleteThought(db, thoughtId) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  if (!normalizedThoughtId) return false;

  await db.query(`
    delete from thought_posts
    where id = $1
  `, [normalizedThoughtId]);

  return true;
}
