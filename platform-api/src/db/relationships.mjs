import {
  DIRECT_INTERACTION_POINTS,
  DIRECT_INTERACTION_WINDOW_LIMIT,
  DIRECT_INTERACTION_WINDOW_MS,
  FRIENDSHIP_CREATION_POINTS,
  SHARED_EVENT_POINTS,
  SHARED_SESSION_POINTS,
  buildDefaultProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "../normalize.mjs";

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

function ensureJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToRelationshipsRecord(row = {}, fallbackPlayerId = "") {
  return normalizeProfileRelationshipsRecord({
    playerId: row.player_id || fallbackPlayerId,
    mainSqueezeMode: row.main_squeeze_mode,
    mainSqueezePlayerId: row.main_squeeze_player_id,
    friendRailMode: row.friend_rail_mode,
    manualFriendSlotPlayerIds: ensureJsonArray(row.manual_friend_slot_player_ids),
    mostPlayedWithPlayerId: row.most_played_with_player_id,
    lastPlayedWithPlayerId: row.last_played_with_player_id,
    recentlyPlayedWithPlayerIds: ensureJsonArray(row.recently_played_with_player_ids),
    friendPlayerIds: ensureJsonArray(row.friend_player_ids),
    friendPointsByPlayerId: ensureJsonObject(row.friend_points_by_player_id),
    mutualFriendCountByPlayerId: ensureJsonObject(row.mutual_friend_count_by_player_id),
    sharedGameCountByPlayerId: ensureJsonObject(row.shared_game_count_by_player_id),
    sharedSessionCountByPlayerId: ensureJsonObject(row.shared_session_count_by_player_id),
    sharedEventCountByPlayerId: ensureJsonObject(row.shared_event_count_by_player_id),
    lastSharedSessionAtByPlayerId: ensureJsonObject(row.last_shared_session_at_by_player_id),
    lastSharedEventAtByPlayerId: ensureJsonObject(row.last_shared_event_at_by_player_id),
    lastInteractionAtByPlayerId: ensureJsonObject(row.last_interaction_at_by_player_id),
  });
}

function buildRelationshipsParams(playerId, relationships) {
  return [
    playerId,
    relationships.mainSqueezeMode,
    relationships.mainSqueezePlayerId,
    relationships.friendRailMode,
    JSON.stringify(relationships.manualFriendSlotPlayerIds),
    relationships.mostPlayedWithPlayerId,
    relationships.lastPlayedWithPlayerId,
    JSON.stringify(relationships.recentlyPlayedWithPlayerIds),
    JSON.stringify(relationships.friendPlayerIds),
    JSON.stringify(relationships.friendPointsByPlayerId),
    JSON.stringify(relationships.mutualFriendCountByPlayerId),
    JSON.stringify(relationships.sharedGameCountByPlayerId),
    JSON.stringify(relationships.sharedSessionCountByPlayerId),
    JSON.stringify(relationships.sharedEventCountByPlayerId),
    JSON.stringify(relationships.lastSharedSessionAtByPlayerId),
    JSON.stringify(relationships.lastSharedEventAtByPlayerId),
    JSON.stringify(relationships.lastInteractionAtByPlayerId),
  ];
}

function createTimestamp(value) {
  return sanitizeTimestamp(value) || new Date().toISOString();
}

function buildRelationshipPairKey(leftPlayerId, rightPlayerId) {
  const left = sanitizePlayerId(leftPlayerId);
  const right = sanitizePlayerId(rightPlayerId);
  if (!left || !right || left === right) return "";
  return [left, right].sort((a, b) => a.localeCompare(b)).join("::");
}

function incrementRecordMapCount(record, field, playerId, amount) {
  const key = sanitizePlayerId(playerId);
  const increment = sanitizeCount(amount);
  if (!key || increment <= 0) return;

  const current = sanitizeCount(record[field]?.[key]);
  record[field] = {
    ...(record[field] || {}),
    [key]: current + increment,
  };
}

function setRecordMapTimestamp(record, field, playerId, timestamp) {
  const key = sanitizePlayerId(playerId);
  const value = sanitizeTimestamp(timestamp);
  if (!key || !value) return;

  record[field] = {
    ...(record[field] || {}),
    [key]: value,
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(sanitizeTimestamp(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pushRecentlyPlayedWith(record, playerId) {
  const key = sanitizePlayerId(playerId);
  if (!key) return;

  const current = Array.isArray(record.recentlyPlayedWithPlayerIds)
    ? record.recentlyPlayedWithPlayerIds
    : [];
  record.recentlyPlayedWithPlayerIds = [
    key,
    ...current.filter((entry) => entry !== key),
  ].slice(0, 8);
}

function compareRelationshipPriority(record, leftPlayerId, rightPlayerId) {
  const leftPoints = sanitizeCount(record.friendPointsByPlayerId?.[leftPlayerId]);
  const rightPoints = sanitizeCount(record.friendPointsByPlayerId?.[rightPlayerId]);
  if (leftPoints !== rightPoints) return rightPoints - leftPoints;

  const leftSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[leftPlayerId]);
  const rightSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[rightPlayerId]);
  if (leftSessions !== rightSessions) return rightSessions - leftSessions;

  const leftEvents = sanitizeCount(record.sharedEventCountByPlayerId?.[leftPlayerId]);
  const rightEvents = sanitizeCount(record.sharedEventCountByPlayerId?.[rightPlayerId]);
  if (leftEvents !== rightEvents) return rightEvents - leftEvents;

  const leftRecent = Math.max(
    parseTimestamp(record.lastSharedSessionAtByPlayerId?.[leftPlayerId]),
    parseTimestamp(record.lastSharedEventAtByPlayerId?.[leftPlayerId]),
    parseTimestamp(record.lastInteractionAtByPlayerId?.[leftPlayerId]),
  );
  const rightRecent = Math.max(
    parseTimestamp(record.lastSharedSessionAtByPlayerId?.[rightPlayerId]),
    parseTimestamp(record.lastSharedEventAtByPlayerId?.[rightPlayerId]),
    parseTimestamp(record.lastInteractionAtByPlayerId?.[rightPlayerId]),
  );
  if (leftRecent !== rightRecent) return rightRecent - leftRecent;

  return leftPlayerId.localeCompare(rightPlayerId);
}

function reorderFriendPlayerIds(record) {
  const current = Array.isArray(record.friendPlayerIds) ? record.friendPlayerIds : [];
  record.friendPlayerIds = [...current].sort((leftPlayerId, rightPlayerId) => (
    compareRelationshipPriority(record, leftPlayerId, rightPlayerId)
  ));
}

function deriveMostPlayedWithPlayerId(record) {
  return Object.keys(record.sharedSessionCountByPlayerId || {})
    .sort((leftPlayerId, rightPlayerId) => {
      const leftSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[leftPlayerId]);
      const rightSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[rightPlayerId]);
      if (leftSessions !== rightSessions) return rightSessions - leftSessions;

      const leftRecent = parseTimestamp(record.lastSharedSessionAtByPlayerId?.[leftPlayerId]);
      const rightRecent = parseTimestamp(record.lastSharedSessionAtByPlayerId?.[rightPlayerId]);
      if (leftRecent !== rightRecent) return rightRecent - leftRecent;

      return compareRelationshipPriority(record, leftPlayerId, rightPlayerId);
    })[0] || "";
}

function ensureFriendPlayer(record, otherPlayerId) {
  const key = sanitizePlayerId(otherPlayerId);
  if (!key) return;

  const current = Array.isArray(record.friendPlayerIds) ? record.friendPlayerIds : [];
  if (!current.includes(key)) {
    record.friendPlayerIds = [...current, key];
  }
  reorderFriendPlayerIds(record);
}

function awardFriendPoints(record, otherPlayerId, points) {
  incrementRecordMapCount(record, "friendPointsByPlayerId", otherPlayerId, points);
}

function buildFriendshipResult(leftRecord, rightRecord, awarded, awardedPoints) {
  return {
    awarded,
    awardedPoints,
    leftRecord: normalizeProfileRelationshipsRecord(leftRecord),
    rightRecord: normalizeProfileRelationshipsRecord(rightRecord),
  };
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
    return buildFriendshipResult(
      buildDefaultProfileRelationshipsRecord(""),
      buildDefaultProfileRelationshipsRecord(""),
      false,
      0,
    );
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

    ensureFriendPlayer(leftRecord, normalizedRightPlayerId);
    ensureFriendPlayer(rightRecord, normalizedLeftPlayerId);

    if (!alreadyAwarded) {
      awardFriendPoints(leftRecord, normalizedRightPlayerId, FRIENDSHIP_CREATION_POINTS);
      awardFriendPoints(rightRecord, normalizedLeftPlayerId, FRIENDSHIP_CREATION_POINTS);
    }

    const savedLeftRecord = await savePlayerRelationships(client, normalizedLeftPlayerId, leftRecord);
    const savedRightRecord = await savePlayerRelationships(client, normalizedRightPlayerId, rightRecord);

    // Keep player_profiles.friends in sync so the profiles table reflects the relationship
    await client.query(`
      update player_profiles set friends = $2::jsonb, updated_at = now() where player_id = $1
    `, [normalizedLeftPlayerId, JSON.stringify(savedLeftRecord.friendPlayerIds)]);
    await client.query(`
      update player_profiles set friends = $2::jsonb, updated_at = now() where player_id = $1
    `, [normalizedRightPlayerId, JSON.stringify(savedRightRecord.friendPlayerIds)]);

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
      !alreadyAwarded,
      alreadyAwarded ? 0 : FRIENDSHIP_CREATION_POINTS,
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
    return buildFriendshipResult(
      buildDefaultProfileRelationshipsRecord(normalizedLeftPlayerId),
      buildDefaultProfileRelationshipsRecord(normalizedRightPlayerId),
      false,
      0,
    );
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

    leftRecord.lastPlayedWithPlayerId = normalizedRightPlayerId;
    rightRecord.lastPlayedWithPlayerId = normalizedLeftPlayerId;
    pushRecentlyPlayedWith(leftRecord, normalizedRightPlayerId);
    pushRecentlyPlayedWith(rightRecord, normalizedLeftPlayerId);
    setRecordMapTimestamp(leftRecord, "lastSharedSessionAtByPlayerId", normalizedRightPlayerId, occurredAt);
    setRecordMapTimestamp(rightRecord, "lastSharedSessionAtByPlayerId", normalizedLeftPlayerId, occurredAt);

    if (!alreadyAwarded) {
      incrementRecordMapCount(leftRecord, "sharedSessionCountByPlayerId", normalizedRightPlayerId, 1);
      incrementRecordMapCount(rightRecord, "sharedSessionCountByPlayerId", normalizedLeftPlayerId, 1);
      awardFriendPoints(leftRecord, normalizedRightPlayerId, SHARED_SESSION_POINTS);
      awardFriendPoints(rightRecord, normalizedLeftPlayerId, SHARED_SESSION_POINTS);

      if (gameSlug && !alreadyCountedGame) {
        incrementRecordMapCount(leftRecord, "sharedGameCountByPlayerId", normalizedRightPlayerId, 1);
        incrementRecordMapCount(rightRecord, "sharedGameCountByPlayerId", normalizedLeftPlayerId, 1);
      }
    }

    leftRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(leftRecord);
    rightRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(rightRecord);
    reorderFriendPlayerIds(leftRecord);
    reorderFriendPlayerIds(rightRecord);

    const savedLeftRecord = await savePlayerRelationships(client, normalizedLeftPlayerId, leftRecord);
    const savedRightRecord = await savePlayerRelationships(client, normalizedRightPlayerId, rightRecord);

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
      !alreadyAwarded,
      alreadyAwarded ? 0 : SHARED_SESSION_POINTS,
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
    return buildFriendshipResult(
      buildDefaultProfileRelationshipsRecord(normalizedLeftPlayerId),
      buildDefaultProfileRelationshipsRecord(normalizedRightPlayerId),
      false,
      0,
    );
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

    setRecordMapTimestamp(leftRecord, "lastSharedEventAtByPlayerId", normalizedRightPlayerId, occurredAt);
    setRecordMapTimestamp(rightRecord, "lastSharedEventAtByPlayerId", normalizedLeftPlayerId, occurredAt);

    if (!alreadyAwarded) {
      incrementRecordMapCount(leftRecord, "sharedEventCountByPlayerId", normalizedRightPlayerId, 1);
      incrementRecordMapCount(rightRecord, "sharedEventCountByPlayerId", normalizedLeftPlayerId, 1);
      awardFriendPoints(leftRecord, normalizedRightPlayerId, SHARED_EVENT_POINTS);
      awardFriendPoints(rightRecord, normalizedLeftPlayerId, SHARED_EVENT_POINTS);
    }

    reorderFriendPlayerIds(leftRecord);
    reorderFriendPlayerIds(rightRecord);

    const savedLeftRecord = await savePlayerRelationships(client, normalizedLeftPlayerId, leftRecord);
    const savedRightRecord = await savePlayerRelationships(client, normalizedRightPlayerId, rightRecord);

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
      !alreadyAwarded,
      alreadyAwarded ? 0 : SHARED_EVENT_POINTS,
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

    leftRecord.friendPlayerIds = (leftRecord.friendPlayerIds || []).filter((id) => id !== normalizedRightPlayerId);
    rightRecord.friendPlayerIds = (rightRecord.friendPlayerIds || []).filter((id) => id !== normalizedLeftPlayerId);

    if (leftRecord.mainSqueezePlayerId === normalizedRightPlayerId) leftRecord.mainSqueezePlayerId = "";
    if (rightRecord.mainSqueezePlayerId === normalizedLeftPlayerId) rightRecord.mainSqueezePlayerId = "";

    leftRecord.manualFriendSlotPlayerIds = (leftRecord.manualFriendSlotPlayerIds || []).filter((id) => id !== normalizedRightPlayerId);
    rightRecord.manualFriendSlotPlayerIds = (rightRecord.manualFriendSlotPlayerIds || []).filter((id) => id !== normalizedLeftPlayerId);

    await savePlayerRelationships(client, normalizedLeftPlayerId, leftRecord);
    await savePlayerRelationships(client, normalizedRightPlayerId, rightRecord);

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
    return buildFriendshipResult(
      buildDefaultProfileRelationshipsRecord(normalizedLeftPlayerId),
      buildDefaultProfileRelationshipsRecord(normalizedRightPlayerId),
      false,
      0,
    );
  }

  const occurredAt = createTimestamp(options.occurredAt);
  const windowMs = Math.max(1, sanitizeCount(options.windowMs) || DIRECT_INTERACTION_WINDOW_MS);
  const windowLimit = Math.max(1, sanitizeCount(options.windowLimit) || DIRECT_INTERACTION_WINDOW_LIMIT);
  const bucket = Math.floor((parseTimestamp(occurredAt) || 0) / windowMs);
  const ledgerKey = `direct-interaction:${pairKey}::${bucket}`;
  const client = typeof db?.connect === "function" ? await db.connect() : db;

  await client.query("begin");

  try {
    const leftRecord = await loadPlayerRelationships(client, normalizedLeftPlayerId);
    const rightRecord = await loadPlayerRelationships(client, normalizedRightPlayerId);
    const existingLedgerEntry = await loadRelationshipLedgerEntry(client, ledgerKey);
    const windowCount = sanitizeCount(existingLedgerEntry?.value_count);
    const canAward = windowCount < windowLimit;

    setRecordMapTimestamp(leftRecord, "lastInteractionAtByPlayerId", normalizedRightPlayerId, occurredAt);
    setRecordMapTimestamp(rightRecord, "lastInteractionAtByPlayerId", normalizedLeftPlayerId, occurredAt);

    if (canAward) {
      awardFriendPoints(leftRecord, normalizedRightPlayerId, DIRECT_INTERACTION_POINTS);
      awardFriendPoints(rightRecord, normalizedLeftPlayerId, DIRECT_INTERACTION_POINTS);
    }

    reorderFriendPlayerIds(leftRecord);
    reorderFriendPlayerIds(rightRecord);

    const savedLeftRecord = await savePlayerRelationships(client, normalizedLeftPlayerId, leftRecord);
    const savedRightRecord = await savePlayerRelationships(client, normalizedRightPlayerId, rightRecord);

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
      canAward,
      canAward ? DIRECT_INTERACTION_POINTS : 0,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client?.release?.();
  }
}
