import {
  DIRECT_INTERACTION_WINDOW_LIMIT,
  DIRECT_INTERACTION_WINDOW_MS,
  FRIENDSHIP_CREATION_POINTS,
  SHARED_EVENT_POINTS,
  SHARED_SESSION_POINTS,
  buildDefaultProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "../normalize.mjs";
import { loadPlayerMetrics, savePlayerMetrics } from "./metrics.mjs";
import {
  applyDirectInteractionState,
  applyFriendRemovalState,
  applyFriendshipState,
  applySharedEventState,
  applySharedSessionState,
  buildFriendshipResult,
  buildRelationshipPairKey,
  buildRelationshipsParams,
  createEmptyRelationshipResult,
  createTimestamp,
  mapRowToRelationshipsRecord,
} from "./relationships-domain.mjs";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function sanitizeTimestamp(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeGameSlug(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

async function loadRelationshipLedgerEntry(db, ledgerKey) {
  if (!ledgerKey) return null;

  const result = await db.query(`
    select
      ledger_key,
      ledger_type,
      pair_key,
      subject_key,
      value_count,
      occurred_at,
      payload
    from relationship_ledger_entries
    where ledger_key = $1
    limit 1
  `, [ledgerKey]);

  return result?.rows?.[0] || null;
}

async function saveRelationshipLedgerEntry(db, entry = {}) {
  const ledgerKey = typeof entry.ledgerKey === "string" ? entry.ledgerKey.trim() : "";
  if (!ledgerKey) return null;

  const ledgerType = typeof entry.ledgerType === "string" ? entry.ledgerType.trim() : "";
  const pairKey = typeof entry.pairKey === "string" ? entry.pairKey.trim() : "";
  const subjectKey = typeof entry.subjectKey === "string" ? entry.subjectKey.trim() : "";
  const valueCount = sanitizeCount(entry.valueCount);
  const occurredAt = createTimestamp(entry.occurredAt);
  const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
    ? entry.payload
    : {};

  const result = await db.query(`
    insert into relationship_ledger_entries (
      ledger_key,
      ledger_type,
      pair_key,
      subject_key,
      value_count,
      occurred_at,
      payload
    ) values (
      $1, $2, $3, $4, $5, $6, $7::jsonb
    )
    on conflict (ledger_key) do update set
      ledger_type = excluded.ledger_type,
      pair_key = excluded.pair_key,
      subject_key = excluded.subject_key,
      value_count = excluded.value_count,
      occurred_at = excluded.occurred_at,
      payload = excluded.payload
    returning
      ledger_key,
      ledger_type,
      pair_key,
      subject_key,
      value_count,
      occurred_at,
      payload
  `, [
    ledgerKey,
    ledgerType,
    pairKey,
    subjectKey,
    valueCount,
    occurredAt,
    JSON.stringify(payload),
  ]);

  return result?.rows?.[0] || null;
}

export async function loadPlayerRelationships(db, playerId) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return buildDefaultProfileRelationshipsRecord("");

  const result = await db.query(`
    select
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
    from player_relationships
    where player_id = $1
    limit 1
  `, [normalizedPlayerId]);

  if (!result?.rows?.[0]) {
    return buildDefaultProfileRelationshipsRecord(normalizedPlayerId);
  }

  return mapRowToRelationshipsRecord(result.rows[0], normalizedPlayerId);
}

export async function savePlayerRelationships(db, playerId, patch = {}) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const normalized = normalizeProfileRelationshipsRecord({
    ...patch,
    playerId: normalizedPlayerId,
  });

  await db.query(`
    insert into players (player_id)
    values ($1)
    on conflict (player_id) do update
      set updated_at = now()
  `, [normalizedPlayerId]);

  const result = await db.query(`
    insert into player_relationships (
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
    ) values (
      $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
      $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb
    )
    on conflict (player_id) do update set
      main_squeeze_mode = excluded.main_squeeze_mode,
      main_squeeze_player_id = excluded.main_squeeze_player_id,
      friend_rail_mode = excluded.friend_rail_mode,
      manual_friend_slot_player_ids = excluded.manual_friend_slot_player_ids,
      most_played_with_player_id = excluded.most_played_with_player_id,
      last_played_with_player_id = excluded.last_played_with_player_id,
      recently_played_with_player_ids = excluded.recently_played_with_player_ids,
      friend_player_ids = excluded.friend_player_ids,
      friend_points_by_player_id = excluded.friend_points_by_player_id,
      mutual_friend_count_by_player_id = excluded.mutual_friend_count_by_player_id,
      shared_game_count_by_player_id = excluded.shared_game_count_by_player_id,
      shared_session_count_by_player_id = excluded.shared_session_count_by_player_id,
      shared_event_count_by_player_id = excluded.shared_event_count_by_player_id,
      last_shared_session_at_by_player_id = excluded.last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id = excluded.last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id = excluded.last_interaction_at_by_player_id,
      updated_at = now()
    returning
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
  `, buildRelationshipsParams(normalizedPlayerId, normalized));

  return mapRowToRelationshipsRecord(result?.rows?.[0] || null, normalizedPlayerId);
}

export async function createFriendshipBetweenPlayers(db, leftPlayerId, rightPlayerId, options = {}) {
  const normalizedLeftPlayerId = sanitizePlayerId(leftPlayerId);
  const normalizedRightPlayerId = sanitizePlayerId(rightPlayerId);
  const pairKey = buildRelationshipPairKey(normalizedLeftPlayerId, normalizedRightPlayerId);

  if (!pairKey) {
    return createEmptyRelationshipResult("", "");
  }

  const ledgerKey = `friendship:${pairKey}`;
  const occurredAt = createTimestamp(options.createdAt);
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const existingLedgerEntry = await loadRelationshipLedgerEntry(client, ledgerKey);
    const alreadyAwarded = !!existingLedgerEntry;
    const stateResult = applyFriendshipState(leftRecord, rightRecord, {
      leftPlayerId: normalizedLeftPlayerId,
      rightPlayerId: normalizedRightPlayerId,
      alreadyAwarded,
    });
    const savedLeftRecord = await savePlayerRelationships(
      client,
      normalizedLeftPlayerId,
      stateResult.leftRecord,
    );
    const savedRightRecord = await savePlayerRelationships(
      client,
      normalizedRightPlayerId,
      stateResult.rightRecord,
    );

    // Use pre-save in-memory arrays as the authoritative friend list for the profiles sync —
    // RETURNING from savePlayerRelationships can come back null when called on a transaction client,
    // which would overwrite the column with []. The in-memory records are always correct at this point.
    const leftFriendIds = stateResult.leftRecord.friendPlayerIds;
    const rightFriendIds = stateResult.rightRecord.friendPlayerIds;

    await client.query(`
      update player_profiles set friends = $2::jsonb, updated_at = now() where player_id = $1
    `, [normalizedLeftPlayerId, JSON.stringify(leftFriendIds)]);
    await client.query(`
      update player_profiles set friends = $2::jsonb, updated_at = now() where player_id = $1
    `, [normalizedRightPlayerId, JSON.stringify(rightFriendIds)]);

    // Sync friend_count and friend_points into player_metrics for both players
    const leftMetrics = await loadPlayerMetrics(client, normalizedLeftPlayerId);
    await savePlayerMetrics(client, normalizedLeftPlayerId, {
      ...leftMetrics,
      friendCount: leftFriendIds.length,
      friendPoints: stateResult.leftRecord.friendPointsByPlayerId,
    });
    const rightMetrics = await loadPlayerMetrics(client, normalizedRightPlayerId);
    await savePlayerMetrics(client, normalizedRightPlayerId, {
      ...rightMetrics,
      friendCount: rightFriendIds.length,
      friendPoints: stateResult.rightRecord.friendPointsByPlayerId,
    });

    if (!alreadyAwarded) {
      await saveRelationshipLedgerEntry(client, {
        ledgerKey,
        ledgerType: "friendship_created",
        pairKey,
        subjectKey: "",
        valueCount: FRIENDSHIP_CREATION_POINTS,
        occurredAt,
        payload: {},
      });
    }

    await client.query("commit");
    return buildFriendshipResult(
      savedLeftRecord,
      savedRightRecord,
      stateResult.awarded,
      stateResult.awardedPoints,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}

export async function recordSharedSessionBetweenPlayers(db, leftPlayerId, rightPlayerId, options = {}) {
  const normalizedLeftPlayerId = sanitizePlayerId(leftPlayerId);
  const normalizedRightPlayerId = sanitizePlayerId(rightPlayerId);
  const pairKey = buildRelationshipPairKey(normalizedLeftPlayerId, normalizedRightPlayerId);
  const sessionId = sanitizeTimestamp(options.sessionId).slice(0, 120);
  const gameSlug = sanitizeGameSlug(options.gameSlug);
  const startedTogether = !!options.startedTogether;
  const reachedResults = !!options.reachedResults;

  if (!pairKey || !sessionId || !startedTogether || !reachedResults) {
    return createEmptyRelationshipResult(normalizedLeftPlayerId, normalizedRightPlayerId);
  }

  const ledgerKey = `shared-session:${pairKey}::${sessionId}`;
  const sharedGameLedgerKey = gameSlug ? `shared-game:${pairKey}::${gameSlug}` : "";
  const occurredAt = createTimestamp(options.occurredAt);
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const existingLedgerEntry = await loadRelationshipLedgerEntry(client, ledgerKey);
    const existingSharedGameLedgerEntry = sharedGameLedgerKey
      ? await loadRelationshipLedgerEntry(client, sharedGameLedgerKey)
      : null;
    const alreadyAwarded = !!existingLedgerEntry;
    const alreadyCountedGame = !!existingSharedGameLedgerEntry;
    const stateResult = applySharedSessionState(leftRecord, rightRecord, {
      leftPlayerId: normalizedLeftPlayerId,
      rightPlayerId: normalizedRightPlayerId,
      occurredAt,
      gameSlug,
      alreadyAwarded,
      alreadyCountedGame,
    });
    const savedLeftRecord = await savePlayerRelationships(
      client,
      normalizedLeftPlayerId,
      stateResult.leftRecord,
    );
    const savedRightRecord = await savePlayerRelationships(
      client,
      normalizedRightPlayerId,
      stateResult.rightRecord,
    );

    if (!alreadyAwarded) {
      await saveRelationshipLedgerEntry(client, {
        ledgerKey,
        ledgerType: "shared_session",
        pairKey,
        subjectKey: sessionId,
        valueCount: SHARED_SESSION_POINTS,
        occurredAt,
        payload: {
          gameSlug,
          startedTogether,
          reachedResults,
        },
      });

      if (sharedGameLedgerKey && !alreadyCountedGame) {
        await saveRelationshipLedgerEntry(client, {
          ledgerKey: sharedGameLedgerKey,
          ledgerType: "shared_game",
          pairKey,
          subjectKey: gameSlug,
          valueCount: 1,
          occurredAt,
          payload: {
            sessionId,
          },
        });
      }
    }

    await client.query("commit");
    return buildFriendshipResult(
      savedLeftRecord,
      savedRightRecord,
      stateResult.awarded,
      stateResult.awardedPoints,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}

export async function recordSharedEventBetweenPlayers(db, leftPlayerId, rightPlayerId, options = {}) {
  const normalizedLeftPlayerId = sanitizePlayerId(leftPlayerId);
  const normalizedRightPlayerId = sanitizePlayerId(rightPlayerId);
  const pairKey = buildRelationshipPairKey(normalizedLeftPlayerId, normalizedRightPlayerId);
  const eventId = sanitizeTimestamp(options.eventId).slice(0, 120);
  const isLinkedEntry = !!options.isLinkedEntry;

  if (!pairKey || !eventId || !isLinkedEntry) {
    return createEmptyRelationshipResult(normalizedLeftPlayerId, normalizedRightPlayerId);
  }

  const ledgerKey = `shared-event:${pairKey}::${eventId}`;
  const occurredAt = createTimestamp(options.occurredAt);
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const existingLedgerEntry = await loadRelationshipLedgerEntry(client, ledgerKey);
    const alreadyAwarded = !!existingLedgerEntry;
    const stateResult = applySharedEventState(leftRecord, rightRecord, {
      leftPlayerId: normalizedLeftPlayerId,
      rightPlayerId: normalizedRightPlayerId,
      occurredAt,
      alreadyAwarded,
    });
    const savedLeftRecord = await savePlayerRelationships(
      client,
      normalizedLeftPlayerId,
      stateResult.leftRecord,
    );
    const savedRightRecord = await savePlayerRelationships(
      client,
      normalizedRightPlayerId,
      stateResult.rightRecord,
    );

    if (!alreadyAwarded) {
      await saveRelationshipLedgerEntry(client, {
        ledgerKey,
        ledgerType: "shared_event",
        pairKey,
        subjectKey: eventId,
        valueCount: SHARED_EVENT_POINTS,
        occurredAt,
        payload: {
          isLinkedEntry,
        },
      });
    }

    await client.query("commit");
    return buildFriendshipResult(
      savedLeftRecord,
      savedRightRecord,
      stateResult.awarded,
      stateResult.awardedPoints,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}

export async function removeFriendBetweenPlayers(db, leftPlayerId, rightPlayerId) {
  const normalizedLeftPlayerId = sanitizePlayerId(leftPlayerId);
  const normalizedRightPlayerId = sanitizePlayerId(rightPlayerId);
  const pairKey = buildRelationshipPairKey(normalizedLeftPlayerId, normalizedRightPlayerId);

  if (!pairKey) return { removed: false };

  const ledgerKey = `friendship:${pairKey}`;
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const stateResult = applyFriendRemovalState(leftRecord, rightRecord, {
      leftPlayerId: normalizedLeftPlayerId,
      rightPlayerId: normalizedRightPlayerId,
    });

    await savePlayerRelationships(client, normalizedLeftPlayerId, stateResult.leftRecord);
    await savePlayerRelationships(client, normalizedRightPlayerId, stateResult.rightRecord);

    // Sync friends column and remove the unfriended player from friends_preview for both sides
    const leftFriendIds = stateResult.leftRecord.friendPlayerIds;
    const rightFriendIds = stateResult.rightRecord.friendPlayerIds;

    await client.query(`
      update player_profiles
      set friends = $2::jsonb,
          friends_preview = (
            select coalesce(jsonb_agg(entry), '[]'::jsonb)
            from jsonb_array_elements(coalesce(friends_preview, '[]'::jsonb)) as entry
            where entry->>'playerId' != $3
          ),
          updated_at = now()
      where player_id = $1
    `, [normalizedLeftPlayerId, JSON.stringify(leftFriendIds), normalizedRightPlayerId]);

    await client.query(`
      update player_profiles
      set friends = $2::jsonb,
          friends_preview = (
            select coalesce(jsonb_agg(entry), '[]'::jsonb)
            from jsonb_array_elements(coalesce(friends_preview, '[]'::jsonb)) as entry
            where entry->>'playerId' != $3
          ),
          updated_at = now()
      where player_id = $1
    `, [normalizedRightPlayerId, JSON.stringify(rightFriendIds), normalizedLeftPlayerId]);

    // Sync friend_count into player_metrics for both players
    const leftMetrics = await loadPlayerMetrics(client, normalizedLeftPlayerId);
    await savePlayerMetrics(client, normalizedLeftPlayerId, {
      ...leftMetrics,
      friendCount: leftFriendIds.length,
    });
    const rightMetrics = await loadPlayerMetrics(client, normalizedRightPlayerId);
    await savePlayerMetrics(client, normalizedRightPlayerId, {
      ...rightMetrics,
      friendCount: rightFriendIds.length,
    });

    await client.query(`delete from relationship_ledger_entries where ledger_key = $1`, [ledgerKey]);

    await client.query("commit");
    return { removed: true };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}

export async function recordDirectInteractionBetweenPlayers(db, leftPlayerId, rightPlayerId, options = {}) {
  const normalizedLeftPlayerId = sanitizePlayerId(leftPlayerId);
  const normalizedRightPlayerId = sanitizePlayerId(rightPlayerId);
  const pairKey = buildRelationshipPairKey(normalizedLeftPlayerId, normalizedRightPlayerId);

  if (!pairKey) {
    return createEmptyRelationshipResult(normalizedLeftPlayerId, normalizedRightPlayerId);
  }

  const occurredAt = createTimestamp(options.occurredAt);
  const windowMs = Math.max(1, sanitizeCount(options.windowMs) || DIRECT_INTERACTION_WINDOW_MS);
  const windowLimit = Math.max(1, sanitizeCount(options.windowLimit) || DIRECT_INTERACTION_WINDOW_LIMIT);
  const bucket = Math.floor((Date.parse(occurredAt) || 0) / windowMs);
  const ledgerKey = `direct-interaction:${pairKey}::${bucket}`;
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const existingLedgerEntry = await loadRelationshipLedgerEntry(client, ledgerKey);
    const windowCount = sanitizeCount(existingLedgerEntry?.value_count);
    const canAward = windowCount < windowLimit;
    const stateResult = applyDirectInteractionState(leftRecord, rightRecord, {
      leftPlayerId: normalizedLeftPlayerId,
      rightPlayerId: normalizedRightPlayerId,
      occurredAt,
      canAward,
    });
    const savedLeftRecord = await savePlayerRelationships(
      client,
      normalizedLeftPlayerId,
      stateResult.leftRecord,
    );
    const savedRightRecord = await savePlayerRelationships(
      client,
      normalizedRightPlayerId,
      stateResult.rightRecord,
    );

    if (canAward) {
      await saveRelationshipLedgerEntry(client, {
        ledgerKey,
        ledgerType: "direct_interaction_window",
        pairKey,
        subjectKey: String(bucket),
        valueCount: windowCount + 1,
        occurredAt,
        payload: {
          windowMs,
          windowLimit,
        },
      });
    }

    await client.query("commit");
    return buildFriendshipResult(
      savedLeftRecord,
      savedRightRecord,
      stateResult.awarded,
      stateResult.awardedPoints,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}
