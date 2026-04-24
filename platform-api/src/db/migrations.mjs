import { readFile } from "node:fs/promises";

export const MIGRATION_FILES = Object.freeze([
  "001-initial-schema.sql",
  "002-friend-codes.sql",
  "003-thought-reactions.sql",
  "004-thought-shares.sql",
  "005-thought-comments.sql",
  "006-accounts.sql",
  "007-password-reset-tokens.sql",
]);

export function migrationFileUrl(name) {
  return new URL(`./migrations/${name}`, import.meta.url);
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function loadAppliedMigrationNames(client) {
  const result = await client.query("select name from schema_migrations order by name asc");
  return new Set((result?.rows || []).map((row) => String(row.name || "")));
}

export async function applyMigrations(client) {
  await ensureSchemaMigrationsTable(client);
  const appliedNames = await loadAppliedMigrationNames(client);
  const applied = [];

  for (const name of MIGRATION_FILES) {
    if (appliedNames.has(name)) continue;
    const sql = await readFile(migrationFileUrl(name), "utf8");
    await client.query("begin");

    try {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (name) values ($1)",
        [name],
      );
      await client.query("commit");
      applied.push(name);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  return applied;
}
