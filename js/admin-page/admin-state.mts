import { createAdminApiClient } from "../platform/api/admin-api.mjs";
import { ARCADE_GAME_SLUGS, loadArcadeCatalog } from "../arcade-catalog.mjs";

// The console's in-memory store and its loaders.
//
// One object holds everything the page has fetched; renderers read from it and never
// fetch, actions write through the API and then reload the slice they touched. Keeping
// the reads in one module is what stops the console from growing the "every panel does
// its own fetch and they disagree" problem the platform page controllers were cleaned up
// to avoid.

export type AdminTab = "overview" | "bulletins" | "events" | "cabinets" | "moderation" | "accounts" | "audit";

export interface AdminState {
  tab: AdminTab;
  ready: boolean;
  authorized: boolean;
  authError: string;
  flash: { tone: "ok" | "error"; message: string } | null;
  overview: any;
  bulletins: any[];
  events: any[];
  cabinets: any[];
  catalog: any[];
  settings: Record<string, unknown>;
  reports: any[];
  reportFilter: string;
  suspended: any[];
  admins: any[];
  audit: any[];
  // Which record each editor is currently on. "" means the form is in create mode.
  editingBulletinId: string;
  editingEventId: string;
}

export function createInitialState(): AdminState {
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
export function loadCabinetCatalog(): Promise<any[]> {
  const fetchFromRoot = ((path: string, init?: any) => fetch(`../${path}`, init)) as unknown as typeof fetch;
  return loadArcadeCatalog(fetchFromRoot, ARCADE_GAME_SLUGS).catch(() => []);
}

// The authorization probe. /admin/overview is admin-gated, so its status tells the page
// whether to render the console or a refusal — the client never decides this itself.
export async function loadOverview(state: AdminState): Promise<void> {
  const result = await api.getOverview();
  state.ready = true;
  state.authorized = result.ok;
  state.authError = result.ok ? "" : (result.error || "forbidden");
  state.overview = result.data?.overview || null;
}

export async function loadBulletins(state: AdminState): Promise<void> {
  const result = await api.listBulletins();
  state.bulletins = result.data?.bulletins || [];
}

export async function loadEvents(state: AdminState): Promise<void> {
  const result = await api.listEvents();
  state.events = result.data?.events || [];
}

export async function loadCabinets(state: AdminState): Promise<void> {
  const [result, catalog] = await Promise.all([api.listCabinets(), loadCabinetCatalog()]);
  state.cabinets = result.data?.cabinets || [];
  state.settings = result.data?.settings || {};
  state.catalog = catalog;
}

export async function loadReports(state: AdminState): Promise<void> {
  const result = await api.listReports(state.reportFilter);
  state.reports = result.data?.reports || [];
}

export async function loadAccounts(state: AdminState): Promise<void> {
  const [suspended, admins] = await Promise.all([api.listSuspended(), api.listAdmins()]);
  state.suspended = suspended.data?.accounts || [];
  state.admins = admins.data?.admins || [];
}

export async function loadAudit(state: AdminState): Promise<void> {
  const result = await api.listAudit(150);
  state.audit = result.data?.entries || [];
}

// Loads only what the visible tab needs. The console is one page but seven data sets;
// fetching all of them on every action would make the report queue reload the whole
// cabinet catalog for no reason.
export function loadTabData(state: AdminState): Promise<void> {
  if (state.tab === "bulletins") return loadBulletins(state);
  if (state.tab === "events") return loadEvents(state);
  if (state.tab === "cabinets") return loadCabinets(state);
  if (state.tab === "moderation") return loadReports(state);
  if (state.tab === "accounts") return loadAccounts(state);
  if (state.tab === "audit") return loadAudit(state);
  return loadOverview(state);
}

export function findCabinetOverride(state: AdminState, slug: string): any {
  return state.cabinets.find((entry) => entry?.slug === slug) || null;
}
