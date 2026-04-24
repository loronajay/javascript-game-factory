const DEFAULT_PORT = 3001;

function parsePort(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function readConfig(options = {}) {
  const env = options?.env && typeof options.env === "object" ? options.env : process.env;
  const databaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  const jwtSecret = typeof env.JWT_SECRET === "string" ? env.JWT_SECRET.trim() : "";
  const nodeEnv = typeof env.NODE_ENV === "string" ? env.NODE_ENV.trim() : "";

  return {
    port: parsePort(env.PORT),
    databaseUrl,
    hasDatabaseUrl: Boolean(databaseUrl),
    jwtSecret,
    hasJwtSecret: Boolean(jwtSecret),
    isProduction: nodeEnv === "production",
  };
}
