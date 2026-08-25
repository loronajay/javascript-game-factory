import {
  getOnlineAccountGate,
  readFactoryAccountSession,
  redirectToFactoryAccountSignIn,
} from "../../../../js/platform/api/factory-account-gate.mjs";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";

export function createMiniHoopsAccountAccess({
  readAccount = readFactoryAccountSession,
  redirectToSignIn = redirectToFactoryAccountSignIn,
  readProfile = loadFactoryProfile,
} = {}) {
  const gate = () => getOnlineAccountGate(readAccount());
  return {
    isEligible: () => gate().eligible,
    requireAccount() {
      if (gate().eligible) return true;
      redirectToSignIn();
      return false;
    },
    identity() {
      return createOnlineIdentityPayload(readProfile());
    },
    syncButton(button) {
      if (!button) return;
      const eligible = gate().eligible;
      button.dataset.signedIn = String(eligible);
      button.querySelector(".marquee-option-note").textContent = eligible
        ? "Quick search, private rooms, and Factory account records."
        : "Sign in to use Quick Search and private rooms.";
    },
  };
}
