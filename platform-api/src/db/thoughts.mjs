import {
  normalizeThoughtComment,
  THOUGHT_REACTION_IDS,
  normalizeThoughtPost,
} from "../normalize.mjs";

function sanitizeThoughtId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeViewerPlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeViewerAuthorDisplayName(value) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

function sanitizeCommentText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, 500) : "";
}

function sanitizeReactionId(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().slice(0, 24) : "";
  return THOUGHT_REACTION_IDS.includes(normalized) ? normalized : "";
}

function mapRowToThought(row = {}, options = {}) {
  return normalizeThoughtPost({
    id: row.id,
    authorPlayerId: row.author_player_id,
    authorDisplayName: row.author_display_name,
    subject: row.subject,
    text: row.text,
    visibility: row.visibility,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    reactionTotals: options.reactionTotals ?? ensureJsonObject(row.reaction_totals),
    viewerReaction: options.viewerReaction ?? "",
    viewerSharedThoughtId: options.viewerSharedThoughtId ?? "",
    repostOfId: row.repost_of_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  });
}

function mapRowToComment(row = {}) {
  return normalizeThoughtComment({
    id: row.id,
    thoughtId: row.thought_id,
    authorPlayerId: row.author_player_id,
    authorDisplayName: row.author_display_name,
    text: row.text,
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

function mapReactionTotalsByThoughtId(reactionRows = [], fallbackRows = []) {
  const totalsByThoughtId = new Map();

  for (const fallbackRow of fallbackRows) {
    if (!fallbackRow?.thought_id) continue;
    totalsByThoughtId.set(
      fallbackRow.thought_id,
      {
        ...ensureJsonObject(totalsByThoughtId.get(fallbackRow.thought_id)),
        ...normalizeThoughtPost({ reactionTotals: fallbackRow.reaction_totals }).reactionTotals,
      },
    );
  }

  for (const reactionRow of reactionRows) {
    const thoughtId = sanitizeThoughtId(reactionRow?.thought_id);
    const reactionId = sanitizeReactionId(reactionRow?.reaction_id);
    if (!thoughtId || !reactionId) continue;

    totalsByThoughtId.set(thoughtId, {
      ...ensureJsonObject(totalsByThoughtId.get(thoughtId)),
      [reactionId]: Math.max(0, Math.floor(Number(reactionRow?.reaction_count) || 0)),
    });
  }

  return totalsByThoughtId;
}

function mapViewerReactionByThoughtId(rows = []) {
  const viewerReactionByThoughtId = new Map();

  for (const row of rows) {
    const thoughtId = sanitizeThoughtId(row?.thought_id);
    const reactionId = sanitizeReactionId(row?.reaction_id);
    if (!thoughtId) continue;
    viewerReactionByThoughtId.set(thoughtId, reactionId);
  }

  return viewerReactionByThoughtId;
}

function mapViewerShareByOriginalThoughtId(rows = []) {
  const viewerShareByOriginalThoughtId = new Map();

  for (const row of rows) {
    const originalThoughtId = sanitizeThoughtId(row?.original_thought_id);
    const sharedThoughtId = sanitizeThoughtId(row?.shared_thought_id);
    if (!originalThoughtId || !sharedThoughtId) continue;
    viewerShareByOriginalThoughtId.set(originalThoughtId, sharedThoughtId);
  }

  return viewerShareByOriginalThoughtId;
}

function createSharedThoughtId(originalThoughtId, viewerPlayerId) {
  return sanitizeThoughtId(
    `thought-share-${sanitizeThoughtId(viewerPlayerId).slice(0, 24)}-${sanitizeThoughtId(originalThoughtId).slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

function createCommentId(thoughtId, viewerPlayerId) {
  return sanitizeThoughtId(
    `comment-${sanitizeThoughtId(viewerPlayerId).slice(0, 24)}-${sanitizeThoughtId(thoughtId).slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

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
    const nextViewerReaction = existingReactionId === normalizedReactionId ? "" : normalizedReactionId;

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
    return mapRowToThought({
      ...thoughtRow,
      reaction_totals: reactionTotals,
    }, {
      reactionTotals,
      viewerReaction: nextViewerReaction,
    });
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function shareThought(db, thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", options = {}) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const caption = typeof options?.caption === "string"
    ? options.caption.replace(/\r\n?/g, "\n").trim().slice(0, 500)
    : "";
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
      insertedSharedThought = normalizeThoughtPost({
        id: createSharedThoughtId(normalizedThoughtId, normalizedViewerPlayerId),
        authorPlayerId: normalizedViewerPlayerId,
        authorDisplayName: normalizedViewerDisplayName || normalizedViewerPlayerId,
        subject: "",
        text: caption,
        visibility: originalThoughtRow.visibility,
        commentCount: 0,
        shareCount: 0,
        reactionTotals: {},
        repostOfId: normalizedThoughtId,
        createdAt: new Date().toISOString(),
        editedAt: "",
      });

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
          created_at,
          edited_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12
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

    const updatedOriginalThought = mapRowToThought({
      ...originalThoughtRow,
      share_count: shareCount,
    }, {
      viewerSharedThoughtId: existingShareRow?.shared_thought_id ? "" : insertedSharedThought?.id || "",
    });

    await db.query("commit");
    return {
      originalThought: normalizeThoughtPost({
        ...updatedOriginalThought,
        viewerSharedThoughtId: insertedSharedThought?.id || "",
      }),
      sharedThought: insertedSharedThought,
      removedSharedThoughtId: existingShareRow?.shared_thought_id || "",
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function commentOnThought(db, thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", text = "") {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const normalizedViewerDisplayName = sanitizeViewerAuthorDisplayName(viewerAuthorDisplayName);
  const normalizedText = sanitizeCommentText(text);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedViewerDisplayName || !normalizedText) {
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
        created_at,
        edited_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7
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
      createCommentId(normalizedThoughtId, normalizedViewerPlayerId),
      normalizedThoughtId,
      normalizedViewerPlayerId,
      normalizedViewerDisplayName,
      normalizedText,
      new Date().toISOString(),
      "",
    ]);
    const insertedComment = mapRowToComment(insertedCommentResult?.rows?.[0] || {});

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
    return {
      thought: mapRowToThought({
        ...thoughtRow,
        comment_count: commentCount,
      }),
      comment: insertedComment,
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
