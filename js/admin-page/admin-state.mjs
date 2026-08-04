import { createAdminApiClient } from "../platform/api/admin-api.mjs";
import { ARCADE_GAME_SLUGS, loadArcadeCatalog } from "../arcade-catalog.mjs";
export function createInitialState() {
    return {
        tab: "overview",
        ready: false,
        authorized: false,
        authError: "",
        flash: null,
        overview: null,
        bulletins: [],
        events: [],
        cabinets: [],
        catalog: [],
        settings: {},
        reports: [],
        reportFilter: "open",
        suspended: [],
        admins: [],
        audit: [],
        editingBulletinId: "",
        editingEventId: "",
    };
}
export const api = createAdminApiClient();
// The cabinet list comes from the same place the grid gets it — each game's own
// game.json — so the console can only ever offer overrides for cabinets that actually
// exist. The fetcher is prefixed because loadArcadeCatalog builds paths relative to the
// page, and this page lives one folder deep.
export function loadCabinetCatalog() {
    const fetchFromRoot = ((path, init) => fetch(`../${path}`, init));
    return loadArcadeCatalog(fetchFromRoot, ARCADE_GAME_SLUGS).catch(() => []);
}
// The authorization probe. /admin/overview is admin-gated, so its status tells the page
// whether to render the console or a refusal — the client never decides this itself.
export async function loadOverview(state) {
    const result = await api.getOverview();
    state.ready = true;
    state.authorized = result.ok;
    state.authError = result.ok ? "" : (result.error || "forbidden");
    state.overview = result.data?.overview || null;
}
export async function loadBulletins(state) {
    const result = await api.listBulletins();
    state.bulletins = result.data?.bulletins || [];
}
export async function loadEvents(state) {
    const result = await api.listEvents();
    state.events = result.data?.events || [];
}
export async function loadCabinets(state) {
    const [result, catalog] = await Promise.all([api.listCabinets(), loadCabinetCatalog()]);
    state.cabinets = result.data?.cabinets || [];
    state.settings = result.data?.settings || {};
    state.catalog = catalog;
}
export async function loadReports(state) {
    const result = await api.listReports(state.reportFilter);
    state.reports = result.data?.reports || [];
}
export async function loadAccounts(state) {
    const [suspended, admins] = await Promise.all([api.listSuspended(), api.listAdmins()]);
    state.suspended = suspended.data?.accounts || [];
    state.admins = admins.data?.admins || [];
}
export async function loadAudit(state) {
    const result = await api.listAudit(150);
    state.audit = result.data?.entries || [];
}
// Loads only what the visible tab needs. The console is one page but seven data sets;
// fetching all of them on every action would make the report queue reload the whole
// cabinet catalog for no reason.
export function loadTabData(state) {
    if (state.tab === "bulletins")
        return loadBulletins(state);
    if (state.tab === "events")
        return loadEvents(state);
    if (state.tab === "cabinets")
        return loadCabinets(state);
    if (state.tab === "moderation")
        return loadReports(state);
    if (state.tab === "accounts")
        return loadAccounts(state);
    if (state.tab === "audit")
        return loadAudit(state);
    return loadOverview(state);
}
export function findCabinetOverride(state, slug) {
    return state.cabinets.find((entry) => entry?.slug === slug) || null;
}
