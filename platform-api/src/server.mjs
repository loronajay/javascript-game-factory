import { createServer } from "node:http";

import pg from "pg";

import { createApp } from "./app.mjs";
import { readConfig } from "./config.mjs";

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

const config = readConfig();
const pool = config.hasDatabaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;
const app = createApp({
  config,
  checkDatabase: createDatabaseCheck(pool),
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

