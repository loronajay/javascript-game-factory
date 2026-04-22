import pg from "pg";

import { readConfig } from "./config.mjs";
import { applyMigrations } from "./db/migrations.mjs";

const { Pool } = pg;

const config = readConfig();

if (!config.hasDatabaseUrl) {
  process.stderr.write("[platform-api] DATABASE_URL is required to run migrations\n");
  process.exit(1);
}

const pool = new Pool({ connectionString: config.databaseUrl });

try {
  const applied = await applyMigrations(pool);
  process.stdout.write(`[platform-api] migrations complete (${applied.length} applied)\n`);
} finally {
  await pool.end();
}

