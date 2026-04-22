import { createServer } from "node:http";

import pg from "pg";

import { createApp } from "./app.mjs";
import { listActivityItems, saveActivityItem } from "./db/activity.mjs";
import { readConfig } from "./config.mjs";
import { loadPlayerMetrics, savePlayerMetrics } from "./db/metrics.mjs";
import { applyMigrations } from "./db/migrations.mjs";
import { loadPlayerProfile, loadPlayerProfileByFriendCode, savePlayerProfile } from "./db/profiles.mjs";
import {
  createFriendshipBetweenPlayers,
  loadPlayerRelationships,
  recordDirectInteractionBetweenPlayers,
  recordSharedEventBetweenPlayers,
  recordSharedSessionBetweenPlayers,
  savePlayerRelationships,
} from "./db/relationships.mjs";
import { deleteThought, listThoughts, saveThought } from "./db/thoughts.mjs";

const { Pool } = pg;

function createDatabaseCheck(pool) {
  if (!pool) {
    return async () => false;
  }

  return async function checkDatabase() {
    try {
      await pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  };
}

async function closePool(pool) {
  if (!pool) return;

  try {
    await pool.end();
  } catch {
    // Shutdown should stay best-effort for the first scaffold.
  }
}

async function bootstrap() {
  const config = readConfig();
  const pool = config.hasDatabaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;

  if (pool) {
    await applyMigrations(pool);
  }

  const app = createApp({
    config,
    checkDatabase: createDatabaseCheck(pool),
    loadPlayerProfile: (playerId) => loadPlayerProfile(pool, playerId),
    loadPlayerProfileByFriendCode: (friendCode) => loadPlayerProfileByFriendCode(pool, friendCode),
    savePlayerProfile: (playerId, patch) => savePlayerProfile(pool, playerId, patch),
    loadPlayerMetrics: (playerId) => loadPlayerMetrics(pool, playerId),
    savePlayerMetrics: (playerId, patch) => savePlayerMetrics(pool, playerId, patch),
    loadPlayerRelationships: (playerId) => loadPlayerRelationships(pool, playerId),
    createFriendshipBetweenPlayers: (leftPlayerId, rightPlayerId, options) => createFriendshipBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordSharedSessionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedSessionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordSharedEventBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordSharedEventBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    recordDirectInteractionBetweenPlayers: (leftPlayerId, rightPlayerId, options) => recordDirectInteractionBetweenPlayers(pool, leftPlayerId, rightPlayerId, options),
    savePlayerRelationships: (playerId, patch) => savePlayerRelationships(pool, playerId, patch),
    listActivityItems: () => listActivityItems(pool),
    saveActivityItem: (item) => saveActivityItem(pool, item),
    listThoughts: () => listThoughts(pool),
    saveThought: (thought) => saveThought(pool, thought),
    deleteThought: (thoughtId) => deleteThought(pool, thoughtId),
  });
  const server = createServer(app);

  async function shutdown(signal) {
    server.close(async () => {
      await closePool(pool);
      process.exit(0);
    });

    setTimeout(async () => {
      await closePool(pool);
      process.exit(1);
    }, 5000).unref();

    if (signal) {
      process.stdout.write(`[platform-api] received ${signal}, shutting down\n`);
    }
  }

  server.listen(config.port, () => {
    process.stdout.write(`[platform-api] listening on port ${config.port}\n`);
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

await bootstrap();
