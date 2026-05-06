import { normalizeThoughtPost } from "../normalize.mjs";
import {
  buildCommentRecord,
  buildCommentResult,
  buildReactedThought,
  buildShareResult,
  buildThoughtParams,
  createSharedThought,
  deriveNextViewerReaction,
  mapReactionTotalsByThoughtId,
  mapRowToComment,
  mapRowToThought,
  mapViewerReactionByThoughtId,
  mapViewerShareByOriginalThoughtId,
  sanitizeReactionId,
  sanitizeThoughtId,
  sanitizeViewerAuthorDisplayName,
  sanitizeViewerPlayerId,
} from "./thoughts-domain.mjs";

export async function listThoughts(db, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 40, 100));
  const viewerPlayerId = sanitizeViewerPlayerId(options.viewerPlayerId);

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
      image_url,
      created_at,
      edited_at
    from thought_posts
    order by created_at desc, id desc
    limit $1
  `, [limit]);

  const rows = result?.rows || [];
  const thoughtIds = rows.map((row) => sanitizeThoughtId(row.id)).filter(Boolean);
  if (thoughtIds.length === 0) {
    return [];
  }

  const reactionTotalsResult = await db.query(`
    select
      thought_id,
      reaction_id,
      count(*)::int as reaction_count
    from thought_post_reactions
    where thought_id = any($1)
    group by thought_id, reaction_id
  `, [thoughtIds]);

  let viewerReactionRows = [];
  let viewerShareRows = [];
  if (viewerPlayerId) {
    const viewerResult = await db.query(`
      select
        thought_id,
        reaction_id
      from thought_post_reactions
      where player_id = $1
        and thought_id = any($2)
    `, [viewerPlayerId, thoughtIds]);
    viewerReactionRows = viewerResult?.rows || [];

    const shareResult = await db.query(`
      select
        original_thought_id,
        shared_thought_id
      from thought_post_shares
      where player_id = $1
        and original_thought_id = any($2)
    `, [viewerPlayerId, thoughtIds]);
    viewerShareRows = shareResult?.rows || [];
  }

  const reactionTotalsByThoughtId = mapReactionTotalsByThoughtId(
    reactionTotalsResult?.rows || [],
    rows.map((row) => ({ thought_id: row.id, reaction_totals: row.reaction_totals })),
  );
  const viewerReactionByThoughtId = mapViewerReactionByThoughtId(viewerReactionRows);
  const viewerShareByOriginalThoughtId = mapViewerShareByOriginalThoughtId(viewerShareRows);

  return rows.map((row) => mapRowToThought(row, {
    reactionTotals: reactionTotalsByThoughtId.get(row.id) || ensureJsonObject(row.reaction_totals),
    viewerReaction: viewerReactionByThoughtId.get(row.id) || "",
    viewerSharedThoughtId: viewerShareByOriginalThoughtId.get(row.id)
      || (viewerPlayerId && sanitizeThoughtId(row.author_player_id) === viewerPlayerId && sanitizeThoughtId(row.repost_of_id) ? sanitizeThoughtId(row.id) : ""),
  }));
}

export async function listThoughtComments(db, thoughtId, options = {}) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 200));
  if (!normalizedThoughtId) {
    return [];
  }

  const result = await db.query(`
    select
      id,
      thought_id,
      author_player_id,
      author_display_name,
      text,
      created_at,
      edited_at
    from thought_post_comments
    where thought_id = $1
    order by created_at asc, id asc
    limit $2
  `, [normalizedThoughtId, limit]);

  return (result?.rows || []).map((row) => mapRowToComment(row));
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
      image_url,
      created_at,
      edited_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13
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
      image_url = excluded.image_url,
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
      image_url,
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

export async function reactToThought(db, thoughtId, viewerPlayerId, reactionId) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const normalizedReactionId = sanitizeReactionId(reactionId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedReactionId) {
    return null;
  }

  await db.query("begin");

  try {
    const thoughtResult = await db.query(`
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
        image_url,
        created_at,
        edited_at
      from thought_posts
      where id = $1
    `, [normalizedThoughtId]);
    const thoughtRow = thoughtResult?.rows?.[0];
    if (!thoughtRow) {
      await db.query("rollback");
      return null;
    }

    const existingReactionResult = await db.query(`
      select
        thought_id,
        player_id,
        reaction_id
      from thought_post_reactions
      where thought_id = $1
        and player_id = $2
    `, [normalizedThoughtId, normalizedViewerPlayerId]);
    const existingReactionId = sanitizeReactionId(existingReactionResult?.rows?.[0]?.reaction_id);
    const nextViewerReaction = deriveNextViewerReaction(existingReactionId, normalizedReactionId);

    if (!nextViewerReaction) {
      await db.query(`
        delete from thought_post_reactions
        where thought_id = $1
          and player_id = $2
      `, [normalizedThoughtId, normalizedViewerPlayerId]);
    } else {
      await db.query(`
        insert into thought_post_reactions (
          thought_id,
          player_id,
          reaction_id
        ) values (
          $1, $2, $3
        )
        on conflict (thought_id, player_id) do update set
          reaction_id = excluded.reaction_id
      `, [normalizedThoughtId, normalizedViewerPlayerId, nextViewerReaction]);
    }

    const reactionTotalsResult = await db.query(`
      select
        thought_id,
        reaction_id,
        count(*)::int as reaction_count
      from thought_post_reactions
      where thought_id = any($1)
      group by thought_id, reaction_id
    `, [[normalizedThoughtId]]);
    const reactionTotals = mapReactionTotalsByThoughtId(
      reactionTotalsResult?.rows || [],
      [],
    ).get(normalizedThoughtId) || {};

    await db.query(`
      update thought_posts
      set reaction_totals = $2::jsonb
      where id = $1
    `, [normalizedThoughtId, JSON.stringify(reactionTotals)]);

    await db.query("commit");
    return buildReactedThought(thoughtRow, reactionTotals, nextViewerReaction);
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function shareThought(db, thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", options = {}) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId) {
    return null;
  }

  await db.query("begin");

  try {
    let insertedSharedThought = null;
    const thoughtResult = await db.query(`
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
        image_url,
        created_at,
        edited_at
      from thought_posts
      where id = $1
    `, [normalizedThoughtId]);
    const originalThoughtRow = thoughtResult?.rows?.[0];
    if (!originalThoughtRow) {
      await db.query("rollback");
      return null;
    }

    const existingShareResult = await db.query(`
      select
        original_thought_id,
        player_id,
        shared_thought_id
      from thought_post_shares
      where original_thought_id = $1
        and player_id = $2
    `, [normalizedThoughtId, normalizedViewerPlayerId]);
    const existingShareRow = existingShareResult?.rows?.[0] || null;

    if (existingShareRow?.shared_thought_id) {
      await db.query(`
        delete from thought_post_shares
        where original_thought_id = $1
          and player_id = $2
      `, [normalizedThoughtId, normalizedViewerPlayerId]);
      await db.query(`
        delete from thought_posts
        where id = $1
      `, [existingShareRow.shared_thought_id]);
    } else {
      const normalizedViewerDisplayName = sanitizeViewerAuthorDisplayName(viewerAuthorDisplayName);
      insertedSharedThought = createSharedThought(
        originalThoughtRow,
        normalizedViewerPlayerId,
        normalizedViewerDisplayName || normalizedViewerPlayerId,
        {
          caption: options?.caption,
          createdAt: new Date().toISOString(),
        },
      );

      await db.query(`
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
          image_url,
          created_at,
          edited_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13
        )
      `, buildThoughtParams(insertedSharedThought));

      await db.query(`
        insert into thought_post_shares (
          original_thought_id,
          player_id,
          shared_thought_id
        ) values (
          $1, $2, $3
        )
      `, [normalizedThoughtId, normalizedViewerPlayerId, insertedSharedThought.id]);
    }

    const shareCountResult = await db.query(`
      select count(*)::int as share_count
      from thought_post_shares
      where original_thought_id = $1
    `, [normalizedThoughtId]);
    const shareCount = Math.max(0, Number(shareCountResult?.rows?.[0]?.share_count) || 0);

    await db.query(`
      update thought_posts
      set share_count = $2
      where id = $1
    `, [normalizedThoughtId, shareCount]);

    await db.query("commit");
    return buildShareResult(originalThoughtRow, shareCount, {
      viewerSharedThoughtId: existingShareRow?.shared_thought_id ? "" : insertedSharedThought?.id || "",
      sharedThought: insertedSharedThought,
      removedSharedThoughtId: existingShareRow?.shared_thought_id || "",
    });
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function commentOnThought(db, thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", text = "") {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const normalizedViewerDisplayName = sanitizeViewerAuthorDisplayName(viewerAuthorDisplayName);
  const insertedComment = buildCommentRecord(
    normalizedThoughtId,
    normalizedViewerPlayerId,
    normalizedViewerDisplayName,
    text,
    {
      createdAt: new Date().toISOString(),
    },
  );
  if (
    !normalizedThoughtId
    || !normalizedViewerPlayerId
    || !normalizedViewerDisplayName
    || !insertedComment.text
  ) {
    return null;
  }

  await db.query("begin");

  try {
    const thoughtResult = await db.query(`
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
        image_url,
        created_at,
        edited_at
      from thought_posts
      where id = $1
    `, [normalizedThoughtId]);
    const thoughtRow = thoughtResult?.rows?.[0];
    if (!thoughtRow) {
      await db.query("rollback");
      return null;
    }

    const insertedCommentResult = await db.query(`
      insert into thought_post_comments (
        id,
        thought_id,
        author_player_id,
        author_display_name,
        text,
        created_at
      ) values (
        $1, $2, $3, $4, $5, $6
      )
      returning
        id,
        thought_id,
        author_player_id,
        author_display_name,
        text,
        created_at,
        edited_at
    `, [
      insertedComment.id,
      insertedComment.thoughtId,
      insertedComment.authorPlayerId,
      insertedComment.authorDisplayName,
      insertedComment.text,
      insertedComment.createdAt,
    ]);
    const savedComment = mapRowToComment(insertedCommentResult?.rows?.[0] || {});

    const commentCountResult = await db.query(`
      select count(*)::int as comment_count
      from thought_post_comments
      where thought_id = $1
    `, [normalizedThoughtId]);
    const commentCount = Math.max(0, Number(commentCountResult?.rows?.[0]?.comment_count) || 0);

    await db.query(`
      update thought_posts
      set comment_count = $2
      where id = $1
    `, [normalizedThoughtId, commentCount]);

    await db.query("commit");
    return buildCommentResult(thoughtRow, commentCount, savedComment);
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
