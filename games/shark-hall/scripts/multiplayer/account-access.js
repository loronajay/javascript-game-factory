// The sign-in gate for online play.
//
// Online matches are played by Factory accounts, not by whatever name someone
// types into a box. That is what makes an opponent the same person twice, and it
// is what a competitive ladder would later be hung off — a rating attached to a
// display name is a rating attached to nobody.
//
// THIS IS THE ONE FILE IN THE CABINET THAT REACHES OUT OF IT. Everything else
// here is self-contained; this imports the shared platform layer at the repo
// root, which is why Shark Hall is served from the root rather than from its own
// folder. Offline play does not touch it: the front door's CPU and hotseat cards
// work signed out exactly as before.

import {
  getOnlineAccountGate,
  readFactoryAccountSession,
  redirectToFactoryAccountSignIn,
} from "../../../../js/platform/api/factory-account-gate.mjs";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../../../js/platform/identity/match-identity.mjs";

export function createAccountAccess({
  readAccount = readFactoryAccountSession,
  redirectToSignIn = redirectToFactoryAccountSignIn,
  readProfile = loadFactoryProfile,
} = {}) {
  const gate = () => getOnlineAccountGate(readAccount());

  return {
    isEligible: () => gate().eligible,

    /**
     * Ask for an account, sending the player to sign in if they have none.
     *
     * Returns whether play may continue. The redirect is deliberately not
     * silent-failing: a button that does nothing is worse than a page change.
     */
    requireAccount() {
      if (gate().eligible) return true;
      redirectToSignIn();
      return false;
    },

    /** The identity a lobby is joined with. The server treats this as canonical. */
    identity() {
      return createOnlineIdentityPayload(readProfile());
    },
  };
}
