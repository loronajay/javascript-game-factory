import { resolvePlatformApiBaseUrl, type PlatformApiClientOptions } from "./platform-api.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";

// Public reads of admin-authored content: the bulletin board, the event calendar, and
// the grid's cabinet overrides. Also carries report filing, which is the one write an
// ordinary player makes into the moderation system.
//
// EVERY READ HERE RETURNS null ON ANY FAILURE — offline, 500, cold database, API not
// configured. `null` means "the platform has nothing to say", which callers translate
// into their shipped fixtures. This is the mechanism that keeps the site rendering
// exactly as it did before the admin console existed whenever the backend is unreachable,
// so nothing here should ever be changed to throw or to return a partial payload.

type FetchImpl = typeof fetch | null;

function buildAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function readJson(fetchImpl: FetchImpl, baseUrl: string, path: string): Promise<any> {
  if (typeof fetchImpl !== "function" || !baseUrl) return null;
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      credentials: "include",
      headers: buildAuthHeaders(),
    });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function createContentApiClient(options: PlatformApiClientOptions = {}) {
  const fetchImpl: FetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  return {
    isConfigured: !!baseUrl && typeof fetchImpl === "function",

    // Resolves to null when the platform has nothing to serve, and to an array — possibly
    // empty — when it does. Callers must distinguish the two: an empty array is a real
    // answer ("no bulletins are published"), null is an absent one ("ask the fixtures").
    async listBulletins(): Promise<any[] | null> {
      const payload = await readJson(fetchImpl, baseUrl, "/bulletins");
      return Array.isArray(payload?.bulletins) ? payload.bulletins : null;
    },

    async getBulletin(slug: unknown): Promise<any | null> {
      const encoded = encodeURIComponent(String(slug || "").trim());
      if (!encoded) return null;
      const payload = await readJson(fetchImpl, baseUrl, `/bulletins/${encoded}`);
      return payload?.bulletin || null;
    },

    async listEvents(): Promise<any[] | null> {
      const payload = await readJson(fetchImpl, baseUrl, "/events");
      return Array.isArray(payload?.events) ? payload.events : null;
    },

    async getEvent(slug: unknown): Promise<any | null> {
      const encoded = encodeURIComponent(String(slug || "").trim());
      if (!encoded) return null;
      const payload = await readJson(fetchImpl, baseUrl, `/events/${encoded}`);
      return payload?.event || null;
    },

    // The grid's presentation overrides. Null here means the grid renders purely from
    // each cabinet's game.json, which is the pre-console behavior.
    async getSiteConfig(): Promise<{ cabinets: any[]; settings: Record<string, unknown> } | null> {
      const payload = await readJson(fetchImpl, baseUrl, "/site-config");
      if (!payload) return null;
      return {
        cabinets: Array.isArray(payload.cabinets) ? payload.cabinets : [],
        settings: payload.settings && typeof payload.settings === "object" ? payload.settings : {},
      };
    },

    async fileReport(report: any = {}): Promise<{ ok: boolean; error?: string }> {
      if (typeof fetchImpl !== "function" || !baseUrl) return { ok: false, error: "not_configured" };
      try {
        const response = await fetchImpl(`${baseUrl}/reports`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json; charset=utf-8", ...buildAuthHeaders() },
          body: JSON.stringify(report),
        });
        if (!response?.ok) {
          const payload = await response.json().catch(() => null);
          return { ok: false, error: payload?.error || `http_${response?.status || 0}` };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "network_error" };
      }
    },
  };
}
