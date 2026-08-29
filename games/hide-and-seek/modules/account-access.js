import {
  getOnlineAccountGate,
  readFactoryAccountSession,
  redirectToFactoryAccountSignIn,
} from '../../../js/platform/api/factory-account-gate.mjs';
import { loadFactoryProfile } from '../../../js/platform/identity/factory-profile.mjs';
import { createOnlineIdentityPayload } from '../../../js/platform/identity/match-identity.mjs';

// The cabinet's tie to the factory account, and the repo's Factory-Identity-First rule made
// concrete: this **reads** the shared profile and never writes to it. What goes to the lobby is a
// match alias derived from it — a name to put over a body in a corridor — and nothing that happens
// in this hotel may reach back and change who the player is on the platform.
//
// It is also the online gate. Online play is gated behind a real signed-in account the same way
// every other cabinet gates it, through the one shared seam rather than a second localStorage read.
export function createAccountAccess({
  document,
  readAccount = readFactoryAccountSession,
  redirectToSignIn = redirectToFactoryAccountSignIn,
  readProfile = loadFactoryProfile,
} = {}) {
  const gate = () => getOnlineAccountGate(readAccount());

  return {
    isEligible: () => gate().eligible,

    // Called before the socket opens. A player who is not signed in is sent to sign in rather than
    // dropped into a lobby that cannot name them.
    requireAccount() {
      if (gate().eligible) return true;
      redirectToSignIn();
      return false;
    },

    // The alias. `createOnlineIdentityPayload` is the shared shaper, so the name over a hider's head
    // here is the same name the rest of the factory shows.
    identity() {
      try {
        return createOnlineIdentityPayload(readProfile());
      } catch {
        return null;
      }
    },

    // Paints the online menu entry with what the player can actually do, so the reason a button is
    // refusing is on the button rather than in a console.
    syncMenu() {
      if (!document) return;
      const eligible = gate().eligible;
      const status = document.getElementById('onlineAccount');
      const button = document.getElementById('menuOnline');
      if (button) button.dataset.signedIn = String(eligible);
      if (!status) return;
      status.dataset.signedIn = String(eligible);
      status.textContent = eligible
        ? `SIGNED IN AS ${(this.identity()?.displayName || 'GUEST').toUpperCase()}`
        : 'SIGN IN TO YOUR FACTORY ACCOUNT TO PLAY ONLINE';
    },
  };
}
