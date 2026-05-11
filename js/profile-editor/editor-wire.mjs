import { initProfileEditorPanel } from "./panel.mjs";
import { bindFactoryProfileToSession } from "../platform/identity/factory-profile.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { buildAppUrl } from "../arcade-paths.mjs";
import { PROFILE_UPDATED_EVENT } from "./constants.mjs";

const doc = globalThis.document;

if (doc?.getElementById) {
  renderPrimaryAppNav(doc.getElementById("meEditPrimaryNav"), {
    basePath: "../../",
    currentPage: "me",
    linkClass: "grid-stage__portal",
    sessionNavId: "meEditAuthNav",
  });

  let session = null;
  try { session = await createAuthApiClient().getSession(); } catch { /* network down */ }

  if (!session?.ok || !session?.playerId) {
    const signInUrl = new URL(buildAppUrl("sign-in/index.html"));
    signInUrl.searchParams.set("next", "/me/edit/index.html");
    window.location.replace(signInUrl.toString());
  } else {
    const storage = getDefaultPlatformStorage();
    bindFactoryProfileToSession(session.playerId, storage);
    const apiClient = createPlatformApiClient();

    initSessionNav(doc.getElementById("meEditAuthNav"), {
      signInPath: "../../sign-in/index.html",
      signUpPath: "../../sign-up/index.html",
      homeOnLogout: "../../index.html",
      preloadedSession: session,
    });

    const dirtyFlag = doc.getElementById("meEditDirtyFlag");
    let isDirty = false;

    function markDirty() {
      if (!isDirty) {
        isDirty = true;
        if (dirtyFlag) dirtyFlag.hidden = false;
      }
    }

    function clearDirty() {
      isDirty = false;
      if (dirtyFlag) dirtyFlag.hidden = true;
    }

    const form = doc.getElementById("playerProfileForm");
    form?.addEventListener("input", markDirty);
    form?.addEventListener("change", markDirty);

    initProfileEditorPanel({
      doc,
      storage,
      options: { apiClient },
      onSaved() {
        clearDirty();
        window.location.href = "../";
      },
    });

    doc.addEventListener(PROFILE_UPDATED_EVENT, (event) => {
      if (event?.detail?.action === "cleared") {
        clearDirty();
      }
    });
  }
}
