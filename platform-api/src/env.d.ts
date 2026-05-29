// Ambient typing for the backend environment variables read in src/config.mjs.
// Phase 0 stub: gives the platform-api tsconfig a typed input and starts the
// process.env contract that config.mts will rely on in Phase 9.

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    JWT_SECRET?: string;
    NODE_ENV?: string;
    PORT?: string;
    APP_BASE_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
  }
}
