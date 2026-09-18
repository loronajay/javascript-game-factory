// /achievements/ — a player's trophy case.
//
//   /achievements/            the signed-in viewer's own collection
//   /achievements/?id=<pid>   another player's, read-only
//
// Reached from the chips on /me and /player. Boot, session, and data loading
// live here; the tree shaping is view-model.mts and the markup render.mts,
// both pure.
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { createAchievementsApi } from "../platform/achievements/achievements-api.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { buildAchievementsPageModel } from "./view-model.mjs";
import { renderAchievementsPage } from "./render.mjs";
export function requestedPlayerIdFromSearch(search) {
    try {
        return (new URLSearchParams(search || "").get("id") || "").trim();
    }
    catch {
        return "";
    }
}
async function run() {
    renderPrimaryAppNav(document.getElementById("achPrimaryNav"), {
        basePath: "../",
        currentPage: "achievements",
        linkClass: "search-stage__portal",
        sessionNavId: "achPageNav",
    });
    const titleEl = document.getElementById("achStageTitle");
    const subtitleEl = document.getElementById("achStageSubtitle");
    const rootEl = document.getElementById("achPageRoot");
    const backEl = document.getElementById("achBackLink");
    const session = await initSessionNav(document.getElementById("achPageNav"), {
        signInPath: "../sign-in/index.html",
        signUpPath: "../sign-up/index.html",
        homeOnLogout: "../index.html",
    });
    const viewerId = session?.playerId || "";
    const requestedId = requestedPlayerIdFromSearch(globalThis.location?.search || "");
    const playerId = requestedId || viewerId;
    const isOwner = !!playerId && playerId === viewerId;
    if (backEl)
        backEl.href = isOwner || !playerId ? "../me/" : `../player/?id=${encodeURIComponent(playerId)}`;
    const client = createPlatformApiClient();
    const api = createAchievementsApi(client);
    let collection = null;
    let playerName = "";
    if (playerId && client.isConfigured) {
        const [loaded, profile] = await Promise.all([
            api.fetchPlayerCollection(playerId),
            isOwner ? Promise.resolve(null) : client.loadPlayerProfile(playerId).catch(() => null),
        ]);
        collection = loaded;
        playerName = profile?.profileName || "";
    }
    const model = buildAchievementsPageModel(collection, { playerId, playerName, isOwner, signedOut: !viewerId });
    if (titleEl)
        titleEl.textContent = model.heading.toUpperCase();
    if (subtitleEl)
        subtitleEl.textContent = model.subheading;
    if (rootEl)
        rootEl.innerHTML = renderAchievementsPage(model);
}
if (typeof document !== "undefined" && document.getElementById("achPageRoot")) {
    run().catch((error) => {
        console.error("[achievements]", error);
        const rootEl = document.getElementById("achPageRoot");
        if (rootEl)
            rootEl.innerHTML = '<p class="ach-page__flash">Achievements could not be loaded right now.</p>';
    });
}
