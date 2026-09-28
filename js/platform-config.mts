// Sets the global platform API base URL that js/platform/api/platform-api.mts
// reads lazily (at request time) via `root.__JGF_PLATFORM_API_URL__`.
//
// Loaded as a module <script> on every page before the page's entry module, so
// the global is in place well before any API call fires. Migrated from the old
// classic `platform-config.js` in Phase 8 of the TypeScript migration; it keeps
// the same global-attach side effect rather than exporting a value, because no
// consumer imports it — they all read the global.

const root = globalThis as typeof globalThis & {
  __JGF_PLATFORM_API_URL__?: string;
  JGF_PLATFORM_API_URL?: string;
};

export const LOCAL_PLATFORM_API_URL = "http://127.0.0.1:3001";
export const PRODUCTION_PLATFORM_API_URL = "https://platform-api-production-3db7.up.railway.app";

function isLocalHostname(value: unknown): boolean {
  const hostname = typeof value === "string" ? value.trim().toLowerCase() : "";
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "[::1]"
    || hostname === "::1";
}

/** Keep a locally served frontend on the local database and ticket wallet. */
export function defaultPlatformApiUrl(location: { hostname?: string } | null | undefined): string {
  return isLocalHostname(location?.hostname) ? LOCAL_PLATFORM_API_URL : PRODUCTION_PLATFORM_API_URL;
}

type PlatformApiRoot = Readonly<{
  location?: { hostname?: string } | null;
  __JGF_PLATFORM_API_URL__?: string;
  JGF_PLATFORM_API_URL?: string;
}>;

function cleanUrl(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function isLocalUrl(value: string): boolean {
  try { return isLocalHostname(new URL(value).hostname); } catch { return false; }
}

/** Resolve bootstrap overrides without ever letting a local page select a remote account API. */
export function configuredPlatformApiUrl(source: PlatformApiRoot): string {
  const override = cleanUrl(source.__JGF_PLATFORM_API_URL__ || source.JGF_PLATFORM_API_URL);
  if (isLocalHostname(source.location?.hostname)) return override && isLocalUrl(override) ? override : LOCAL_PLATFORM_API_URL;
  return override || PRODUCTION_PLATFORM_API_URL;
}

root.__JGF_PLATFORM_API_URL__ = configuredPlatformApiUrl(root);

export {};
