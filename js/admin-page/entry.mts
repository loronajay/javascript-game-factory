import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { describeAdminError } from "../platform/api/admin-api.mjs";
import { refreshCurrentTab, runAdminAction } from "./actions.mjs";
import {
  createInitialState, loadOverview, loadTabData,
  type AdminState, type AdminTab,
} from "./admin-state.mjs";
import { renderBulletins, renderCabinets, renderEvents, renderOverview } from "./render-content.mjs";
import { renderAccounts, renderAudit, renderModeration } from "./render-moderation.mjs";
import { escapeHtml } from "./render-shared.mjs";

// Boot, authorization gate, tab routing, and event delegation for the admin console.
//
// The console is a single page with one render pass: state changes, the whole panel area
// is rewritten, and because every control talks through `data-action` on a delegated
// document listener, nothing has to be re-bound or torn down.

const TABS: ReadonlyArray<{ key: AdminTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "bulletins", label: "Bulletins" },
  { key: "events", label: "Events" },
  { key: "cabinets", label: "Cabinets" },
  { key: "moderation", label: "Moderation" },
  { key: "accounts", label: "Accounts" },
  { key: "audit", label: "Audit" },
];

const VALID_TABS = new Set<string>(TABS.map((tab) => tab.key));

export function renderTabs(state: AdminState): string {
  return TABS.map((tab) => {
    const isCurrent = tab.key === state.tab;
    return `<button class="admin-tab${isCurrent ? " admin-tab--current" : ""}" type="button"
      data-action="tab" data-value="${escapeHtml(tab.key)}"${isCurrent ? ' aria-current="page"' : ""}
      >${escapeHtml(tab.label)}</button>`;
  }).join("");
}

export function renderPanels(state: AdminState): string {
  if (!state.ready) return `<p class="admin-empty">Loading the console…</p>`;

  // The refusal an unauthorized visitor sees. It is written for the two people who will
  // actually hit it — an operator whose session expired, and a curious signed-in player —
  // and says which one they are rather than showing a bare error code.
  if (!state.authorized) {
    const isAuthProblem = state.authError === "unauthorized" || state.authError === "not_configured";
    return `
      <section class="admin-panel admin-panel--refusal">
        <h2 class="admin-panel__title">${isAuthProblem ? "Sign in required" : "Admin access required"}</h2>
        <p class="admin-empty">${escapeHtml(describeAdminError(state.authError))}</p>
        <p class="admin-empty">
          ${isAuthProblem
            ? "Sign in with an admin account to open the console."
            : "This account is signed in but is not an admin. Ask an existing admin to grant access."}
        </p>
      </section>
    `;
  }

  if (state.tab === "bulletins") return renderBulletins(state);
  if (state.tab === "events") return renderEvents(state);
  if (state.tab === "cabinets") return renderCabinets(state);
  if (state.tab === "moderation") return renderModeration(state);
  if (state.tab === "accounts") return renderAccounts(state);
  if (state.tab === "audit") return renderAudit(state);
  return renderOverview(state);
}

export function renderAdminPage(doc: Document, state: AdminState): void {
  const tabsEl = doc.getElementById("adminTabs");
  if (tabsEl) tabsEl.innerHTML = state.authorized ? renderTabs(state) : "";

  const flashEl = doc.getElementById("adminFlash");
  if (flashEl) {
    flashEl.className = state.flash ? `admin-flash admin-flash--${state.flash.tone}` : "admin-flash";
    flashEl.textContent = state.flash?.message || "";
  }

  const panelsEl = doc.getElementById("adminPanels");
  if (panelsEl) panelsEl.innerHTML = renderPanels(state);
}

// Reads the tab out of the URL hash so a console tab is linkable and survives a reload —
// an operator working through the report queue should not be dropped on Overview every
// time they refresh.
export function readTabFromHash(hash: unknown): AdminTab {
  const candidate = String(hash || "").replace(/^#/, "").trim();
  return VALID_TABS.has(candidate) ? (candidate as AdminTab) : "overview";
}

const doc = globalThis.document;

if (typeof doc?.getElementById === "function") {
  const state = createInitialState();
  state.tab = readTabFromHash(globalThis.location?.hash);

  renderPrimaryAppNav(doc.getElementById("adminPrimaryNav"), {
    basePath: "../",
    currentPage: "",
    linkClass: "admin-stage__portal",
    sessionNavId: "adminAuthNav",
  });
  void initSessionNav(doc.getElementById("adminAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
  });

  const rerender = () => renderAdminPage(doc, state);

  async function switchTab(nextTab: AdminTab): Promise<void> {
    state.tab = nextTab;
    state.flash = null;
    rerender();
    await loadTabData(state);
    rerender();
  }

  // One delegated listener for clicks, one for submits. Submit is handled separately so
  // the primary button in each editor works on Enter as well as on click, and so the
  // browser never navigates away from the console.
  doc.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement | null)?.closest?.("[data-action]") as HTMLElement | null;
    if (!target) return;

    const action = target.getAttribute("data-action") || "";
    if (!action) return;
    // Submit buttons are handled by the submit listener below; letting the click path
    // also fire would run the same action twice.
    if ((target as HTMLButtonElement).type === "submit") return;

    event.preventDefault();
    void dispatch(action, target.getAttribute("data-value") || "", target.closest("form") as HTMLFormElement | null);
  });

  // File inputs fire `change`, not `click`, so they need their own delegated listener.
  // The chosen File is handed to the action directly rather than being re-read later —
  // the input is destroyed by the next render, and its value would be gone with it.
  doc.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.type !== "file") return;

    const action = input.getAttribute("data-action") || "";
    if (!action) return;

    void dispatch(action, "", input.closest("form") as HTMLFormElement | null, input.files?.[0] || null);
  });

  doc.addEventListener("submit", (event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form?.matches?.("[data-form]")) return;
    event.preventDefault();

    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const action = submitter?.getAttribute("data-action") || "";
    if (!action) return;
    void dispatch(action, submitter?.getAttribute("data-value") || "", form);
  });

  async function dispatch(
    action: string,
    value: string,
    form: HTMLFormElement | null,
    file: File | null = null,
  ): Promise<void> {
    if (action === "tab") {
      const nextTab = readTabFromHash(value);
      if (globalThis.location) globalThis.location.hash = nextTab;
      await switchTab(nextTab);
      return;
    }

    const shouldReload = await runAdminAction(action, {
      state,
      form,
      value,
      file,
      rerender,
      confirmFn: (message: string) => globalThis.confirm?.(message) === true,
    });

    if (shouldReload) await refreshCurrentTab(state);
    rerender();
  }

  globalThis.addEventListener?.("hashchange", () => {
    const nextTab = readTabFromHash(globalThis.location?.hash);
    if (nextTab !== state.tab) void switchTab(nextTab);
  });

  // The overview call is also the authorization probe, so it always runs first: until it
  // answers, the page does not know whether to show the console or the refusal.
  void (async () => {
    rerender();
    await loadOverview(state);
    if (state.authorized && state.tab !== "overview") await loadTabData(state);
    rerender();
  })();
}
