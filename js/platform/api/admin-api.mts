import { resolvePlatformApiBaseUrl, type PlatformApiClientOptions } from "./platform-api.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";

// The admin console's API client.
//
// Unlike the rest of js/platform/api/, this one SURFACES ERRORS instead of collapsing
// them to null. The other clients feed pages that should degrade quietly when the
// backend is unhappy; the console is the opposite — an operator who presses Publish and
// sees nothing happen has no idea whether the slug collided, the session expired, or the
// database is down. Every call resolves to { ok, error, status, data } and the console
// renders the reason.
//
// This client also never assumes authority. A 403 here is a normal, expected response
// (an account was demoted between page load and this click), not an exception.

type FetchImpl = typeof fetch | null;

export interface AdminResult<T = any> {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
}

async function request<T = any>(
  fetchImpl: FetchImpl,
  baseUrl: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<AdminResult<T>> {
  if (typeof fetchImpl !== "function" || !baseUrl) {
    return { ok: false, status: 0, error: "not_configured" };
  }

  const token = getStoredAuthToken();
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, error: payload?.error || `http_${response.status}` };
    }
    return { ok: true, status: response.status, data: payload as T };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export function createAdminApiClient(options: PlatformApiClientOptions = {}) {
  const fetchImpl: FetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);
  const call = <T = any,>(path: string, method?: string, body?: unknown) =>
    request<T>(fetchImpl, baseUrl, path, method, body);

  const encode = (value: unknown) => encodeURIComponent(String(value ?? "").trim());

  return {
    isConfigured: !!baseUrl && typeof fetchImpl === "function",

    // Doubles as the console's authorization probe: a 403 from this call is how the page
    // learns the signed-in account is not an admin, rather than asking a client-side flag.
    getOverview: () => call("/admin/overview"),

    // Attachment upload. Reuses the platform's existing /upload/photo endpoint rather than
    // adding an admin-only one: it already validates by magic bytes (not the client's
    // declared MIME type) and caps the long edge at 1200px with crop:"limit", so a portrait
    // flyer is scaled down whole instead of being cropped to a landscape box.
    //
    // Multipart, so it cannot go through `call` — no JSON content-type, and the browser
    // must set its own boundary.
    async uploadImage(file: File | Blob | null): Promise<AdminResult<{ assetId: string; url: string }>> {
      if (typeof fetchImpl !== "function" || !baseUrl) return { ok: false, status: 0, error: "not_configured" };
      if (!file) return { ok: false, status: 0, error: "invalid_request" };

      const formData = new FormData();
      formData.append("file", file);
      const token = getStoredAuthToken();

      try {
        const response = await fetchImpl(`${baseUrl}/upload/photo`, {
          method: "POST",
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          return { ok: false, status: response.status, error: payload?.error || `http_${response.status}` };
        }
        return { ok: true, status: response.status, data: payload };
      } catch {
        return { ok: false, status: 0, error: "network_error" };
      }
    },

    listBulletins: () => call("/admin/bulletins"),
    createBulletin: (bulletin: any) => call("/admin/bulletins", "POST", bulletin),
    updateBulletin: (id: unknown, bulletin: any) => call(`/admin/bulletins/${encode(id)}`, "PATCH", bulletin),
    deleteBulletin: (id: unknown) => call(`/admin/bulletins/${encode(id)}`, "DELETE"),

    listEvents: () => call("/admin/events"),
    createEvent: (event: any) => call("/admin/events", "POST", event),
    updateEvent: (id: unknown, event: any) => call(`/admin/events/${encode(id)}`, "PATCH", event),
    deleteEvent: (id: unknown) => call(`/admin/events/${encode(id)}`, "DELETE"),

    listCabinets: () => call("/admin/cabinets"),
    saveCabinet: (slug: unknown, override: any) => call(`/admin/cabinets/${encode(slug)}`, "PUT", override),
    resetCabinet: (slug: unknown) => call(`/admin/cabinets/${encode(slug)}`, "DELETE"),

    // Wrapped in { value } so a setting can legitimately be a string, number, or null.
    saveSetting: (key: unknown, value: unknown) => call(`/admin/settings/${encode(key)}`, "PUT", { value }),

    listReports: (status = "open") => call(`/admin/reports?status=${encode(status)}`),
    resolveReport: (id: unknown, status = "resolved") => call(`/admin/reports/${encode(id)}/resolve`, "POST", { status }),
    removeContent: (targetType: unknown, targetId: unknown) =>
      call(`/admin/content/${encode(targetType)}/${encode(targetId)}`, "DELETE"),

    listSuspended: () => call("/admin/accounts/suspended"),
    suspendAccount: (playerId: unknown, { days, reason }: any = {}) =>
      call(`/admin/accounts/${encode(playerId)}/suspend`, "POST", { days, reason }),
    liftSuspension: (playerId: unknown) => call(`/admin/accounts/${encode(playerId)}/suspend`, "DELETE"),

    listAdmins: () => call("/admin/admins"),
    grantAdmin: (playerId: unknown) => call(`/admin/admins/${encode(playerId)}`, "POST"),
    revokeAdmin: (playerId: unknown) => call(`/admin/admins/${encode(playerId)}`, "DELETE"),

    listAudit: (limit = 100) => call(`/admin/audit?limit=${encode(limit)}`),

    // Physical calendar fulfillment.
    listCalendarOrders: (filters: { paymentState?: string; fulfillmentState?: string; search?: string } = {}) => {
      const query = new URLSearchParams();
      if (filters.paymentState) query.set("paymentState", filters.paymentState);
      if (filters.fulfillmentState) query.set("fulfillmentState", filters.fulfillmentState);
      if (filters.search) query.set("search", filters.search);
      const suffix = query.toString();
      return call(`/admin/calendar/orders${suffix ? `?${suffix}` : ""}`);
    },
    getCalendarMetrics: () => call("/admin/calendar/metrics"),
    updateCalendarOrder: (orderId: string, patch: unknown) =>
      call(`/admin/calendar/orders/${encode(orderId)}`, "PATCH", patch),
    // Fetched rather than linked: /admin/ is gated by a bearer token, and a plain <a href>
    // cannot carry one -- the link would come back 401 as an HTML error page saved to disk.
    // The caller turns this text into a download.
    async fetchCalendarOrdersCsv(paymentState = "paid"): Promise<AdminResult<string>> {
      if (typeof fetchImpl !== "function" || !baseUrl) return { ok: false, status: 0, error: "not_configured" };
      const token = getStoredAuthToken();
      try {
        const response = await fetchImpl(
          `${baseUrl}/admin/calendar/orders.csv?paymentState=${encode(paymentState)}`,
          { headers: token ? { authorization: `Bearer ${token}` } : {} },
        );
        if (!response.ok) return { ok: false, status: response.status, error: "export_failed" };
        return { ok: true, status: response.status, data: await response.text() };
      } catch {
        return { ok: false, status: 0, error: "network_error" };
      }
    },
  };
}

// Console-facing text for the named errors the API returns. Anything unmapped falls back
// to the raw code — an operator seeing `slug_taken` is still better served than by a
// generic "something went wrong", and an unmapped code is a signal to add it here.
const ERROR_MESSAGES: Record<string, string> = {
  unsupported_file_type: "That file isn't an image the arcade accepts — use PNG, JPEG, GIF, or WEBP.",
  file_too_large: "That image is too large to upload.",
  upload_not_configured: "Image hosting isn't configured on the server.",
  slug_taken: "That slug is already in use by another item.",
  invalid_slug: "That title does not produce a usable slug — try adding some letters or numbers.",
  invalid_key: "That setting key is not valid.",
  invalid_request: "The request was missing something required.",
  not_found: "That item no longer exists — it may have been deleted in another tab.",
  last_admin: "You cannot remove the last admin. Grant admin to someone else first.",
  not_suspendable: "That account cannot be suspended. Admins must be demoted first.",
  unsupported_target: "That kind of content cannot be removed from here.",
  forbidden: "Your account no longer has admin access.",
  unauthorized: "Your session has expired — sign in again.",
  account_suspended: "This account is suspended.",
  database_unavailable: "The database is not reachable right now.",
  not_configured: "The platform API is not configured for this page.",
  network_error: "Could not reach the platform API.",
  server_error: "The server hit an unexpected error.",
};

export function describeAdminError(error: unknown): string {
  const code = String(error || "").trim();
  if (!code) return "Something went wrong.";
  return ERROR_MESSAGES[code] || code;
}
