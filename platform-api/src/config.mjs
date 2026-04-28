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
  const resendApiKey = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
  const fromEmail = typeof env.RESEND_FROM_EMAIL === "string" ? env.RESEND_FROM_EMAIL.trim() : "";
  const appBaseUrl = typeof env.APP_BASE_URL === "string" ? env.APP_BASE_URL.trim().replace(/\/+$/, "") : "";
  const cloudinaryCloudName = typeof env.CLOUDINARY_CLOUD_NAME === "string" ? env.CLOUDINARY_CLOUD_NAME.trim() : "";
  const cloudinaryApiKey = typeof env.CLOUDINARY_API_KEY === "string" ? env.CLOUDINARY_API_KEY.trim() : "";
  const cloudinaryApiSecret = typeof env.CLOUDINARY_API_SECRET === "string" ? env.CLOUDINARY_API_SECRET.trim() : "";

  return {
    port: parsePort(env.PORT),
    databaseUrl,
    hasDatabaseUrl: Boolean(databaseUrl),
    jwtSecret,
    hasJwtSecret: Boolean(jwtSecret),
    isProduction: nodeEnv === "production",
    resendApiKey,
    fromEmail,
    appBaseUrl,
    cloudinaryCloudName,
    cloudinaryApiKey,
    cloudinaryApiSecret,
    hasCloudinary: Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret),
  };
}
