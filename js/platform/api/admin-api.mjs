import { resolvePlatformApiBaseUrl } from "./platform-api.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";
async function request(fetchImpl, baseUrl, path, method = "GET", body) {
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
        return { ok: true, status: response.status, data: payload };
    }
    catch {
        return { ok: false, status: 0, error: "network_error" };
    }
}
export function createAdminApiClient(options = {}) {
    const fetchImpl = typeof options?.fetchImpl === "function"
        ? options.fetchImpl
        : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
    const baseUrl = resolvePlatformApiBaseUrl(options);
    const call = (path, method, body) => request(fetchImpl, baseUrl, path, method, body);
    const encode = (value) => encodeURIComponent(String(value ?? "").trim());
    return {
        isConfigured: !!baseUrl && typeof fetchImpl === "function",
        // Doubles as the console's authorization probe: a 403 from this call is how the page
        // learns the signed-in account is not an admin, rather than asking a client-side flag.
        getOverview: () => call("/admin/overview"),
        listBulletins: () => call("/admin/bulletins"),
        createBulletin: (bulletin) => call("/admin/bulletins", "POST", bulletin),
        updateBulletin: (id, bulletin) => call(`/admin/bulletins/${encode(id)}`, "PATCH", bulletin),
        deleteBulletin: (id) => call(`/admin/bulletins/${encode(id)}`, "DELETE"),
        listEvents: () => call("/admin/events"),
        createEvent: (event) => call("/admin/events", "POST", event),
        updateEvent: (id, event) => call(`/admin/events/${encode(id)}`, "PATCH", event),
        deleteEvent: (id) => call(`/admin/events/${encode(id)}`, "DELETE"),
        listCabinets: () => call("/admin/cabinets"),
        saveCabinet: (slug, override) => call(`/admin/cabinets/${encode(slug)}`, "PUT", override),
        resetCabinet: (slug) => call(`/admin/cabinets/${encode(slug)}`, "DELETE"),
        // Wrapped in { value } so a setting can legitimately be a string, number, or null.
        saveSetting: (key, value) => call(`/admin/settings/${encode(key)}`, "PUT", { value }),
        listReports: (status = "open") => call(`/admin/reports?status=${encode(status)}`),
        resolveReport: (id, status = "resolved") => call(`/admin/reports/${encode(id)}/resolve`, "POST", { status }),
        removeContent: (targetType, targetId) => call(`/admin/content/${encode(targetType)}/${encode(targetId)}`, "DELETE"),
        listSuspended: () => call("/admin/accounts/suspended"),
        suspendAccount: (playerId, { days, reason } = {}) => call(`/admin/accounts/${encode(playerId)}/suspend`, "POST", { days, reason }),
        liftSuspension: (playerId) => call(`/admin/accounts/${encode(playerId)}/suspend`, "DELETE"),
        listAdmins: () => call("/admin/admins"),
        grantAdmin: (playerId) => call(`/admin/admins/${encode(playerId)}`, "POST"),
        revokeAdmin: (playerId) => call(`/admin/admins/${encode(playerId)}`, "DELETE"),
        listAudit: (limit = 100) => call(`/admin/audit?limit=${encode(limit)}`),
    };
}
// Console-facing text for the named errors the API returns. Anything unmapped falls back
// to the raw code — an operator seeing `slug_taken` is still better served than by a
// generic "something went wrong", and an unmapped code is a signal to add it here.
const ERROR_MESSAGES = {
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
export function describeAdminError(error) {
    const code = String(error || "").trim();
    if (!code)
        return "Something went wrong.";
    return ERROR_MESSAGES[code] || code;
}
