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
};

root.__JGF_PLATFORM_API_URL__ =
  root.__JGF_PLATFORM_API_URL__ || "https://platform-api-production-3db7.up.railway.app";

export {};
