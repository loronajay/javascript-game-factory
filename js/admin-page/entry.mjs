import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { describeAdminError } from "../platform/api/admin-api.mjs";
import { refreshCurrentTab, runAdminAction } from "./actions.mjs";
import { createInitialState, loadOverview, loadTabData, } from "./admin-state.mjs";
import { renderBulletins, renderCabinets, renderEvents, renderOverview } from "./render-content.mjs";
import { renderAccounts, renderAudit, renderModeration } from "./render-moderation.mjs";
import { escapeHtml } from "./render-shared.mjs";
// Boot, authorization gate, tab routing, and event delegation for the admin console.
//
// The console is a single page with one render pass: state changes, the whole panel area
// is rewritten, and because every control talks through `data-action` on a delegated
// document listener, nothing has to be re-bound or torn down.
const TABS = [
    { key: "overview", label: "Overview" },
    { key: "bulletins", label: "Bulletins" },
    { key: "events", label: "Events" },
    { key: "cabinets", label: "Cabinets" },
    { key: "moderation", label: "Moderation" },
    { key: "accounts", label: "Accounts" },
    { key: "audit", label: "Audit" },
];
const VALID_TABS = new Set(TABS.map((tab) => tab.key));
export function renderTabs(state) {
    return TABS.map((tab) => {
        const isCurrent = tab.key === state.tab;
        return `<button class="admin-tab${isCurrent ? " admin-tab--current" : ""}" type="button"
      data-action="tab" data-value="${escapeHtml(tab.key)}"${isCurrent ? ' aria-current="page"' : ""}
      >${escapeHtml(tab.label)}</button>`;
    }).join("");
}
export function renderPanels(state) {
    if (!state.ready)
        return `<p class="admin-empty">Loading the console…</p>`;
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
    if (state.tab === "bulletins")
        return renderBulletins(state);
    if (state.tab === "events")
        return renderEvents(state);
    if (state.tab === "cabinets")
        return renderCabinets(state);
    if (state.tab === "moderation")
        return renderModeration(state);
    if (state.tab === "accounts")
        return renderAccounts(state);
    if (state.tab === "audit")
        return renderAudit(state);
    return renderOverview(state);
}
export function renderAdminPage(doc, state) {
    const tabsEl = doc.getElementById("adminTabs");
    if (tabsEl)
        tabsEl.innerHTML = state.authorized ? renderTabs(state) : "";
    const flashEl = doc.getElementById("adminFlash");
    if (flashEl) {
        flashEl.className = state.flash ? `admin-flash admin-flash--${state.flash.tone}` : "admin-flash";
        flashEl.textContent = state.flash?.message || "";
    }
    const panelsEl = doc.getElementById("adminPanels");
    if (panelsEl)
        panelsEl.innerHTML = renderPanels(state);
}
// Reads the tab out of the URL hash so a console tab is linkable and survives a reload —
// an operator working through the report queue should not be dropped on Overview every
// time they refresh.
export function readTabFromHash(hash) {
    const candidate = String(hash || "").replace(/^#/, "").trim();
    return VALID_TABS.has(candidate) ? candidate : "overview";
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
    async function switchTab(nextTab) {
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
        const target = event.target?.closest?.("[data-action]");
        if (!target)
            return;
        const action = target.getAttribute("data-action") || "";
        if (!action)
            return;
        // Submit buttons are handled by the submit listener below; letting the click path
        // also fire would run the same action twice.
        if (target.type === "submit")
            return;
        event.preventDefault();
        void dispatch(action, target.getAttribute("data-value") || "", target.closest("form"));
    });
    doc.addEventListener("submit", (event) => {
        const form = event.target;
        if (!form?.matches?.("[data-form]"))
            return;
        event.preventDefault();
        const submitter = event.submitter;
        const action = submitter?.getAttribute("data-action") || "";
        if (!action)
            return;
        void dispatch(action, submitter?.getAttribute("data-value") || "", form);
    });
    async function dispatch(action, value, form) {
        if (action === "tab") {
            const nextTab = readTabFromHash(value);
            if (globalThis.location)
                globalThis.location.hash = nextTab;
            await switchTab(nextTab);
            return;
        }
        const shouldReload = await runAdminAction(action, {
            state,
            form,
            value,
            confirmFn: (message) => globalThis.confirm?.(message) === true,
        });
        if (shouldReload)
            await refreshCurrentTab(state);
        rerender();
    }
    globalThis.addEventListener?.("hashchange", () => {
        const nextTab = readTabFromHash(globalThis.location?.hash);
        if (nextTab !== state.tab)
            void switchTab(nextTab);
    });
    // The overview call is also the authorization probe, so it always runs first: until it
    // answers, the page does not know whether to show the console or the refusal.
    void (async () => {
        rerender();
        await loadOverview(state);
        if (state.authorized && state.tab !== "overview")
            await loadTabData(state);
        rerender();
    })();
}
