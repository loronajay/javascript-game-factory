import { loadFactoryProfile, sanitizeFactoryProfileName } from "../../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../../js/platform/identity/match-identity.mjs";

// Who this cabinet says it is when it introduces itself to a lobby.
//
// The factory profile is the canonical name and this module never writes to it —
// a cabinet deriving a match alias must not overwrite the shared profile. What it
// does own is *when* the name is read, and that is the bug this module exists for:
// reading it once at boot published whatever the cache happened to hold at page
// load, so a sign-in, a profile edit or a name written by another tab all arrived
// too late and an opponent saw the "Player" default instead.
//
// The account is the second source, and only ever a fallback. A player who signed
// in on this browser but has not opened their profile page has a real name on the
// server and an empty local cache; `/auth/me` already answers with it. It fills in
// the display name alone — the playerId stays the factory one, because that is the
// id every other Yam surface (progression, garage, ratings) is keyed on.
export function createYamOnlineIdentity({ readProfile = loadFactoryProfile, authApi = null } = {}) {
  let accountName = "";

  function resolve() {
    const payload = createOnlineIdentityPayload(readProfile());
    return payload.displayName ? payload : { ...payload, displayName: accountName };
  }

  // Best effort and never blocking: a failed or unconfigured call just leaves the
  // factory profile as the only answer, which is what it was before.
  async function seedFromAccount() {
    if (!authApi?.isConfigured) return "";
    try {
      const session = await authApi.getSession();
      if (session?.ok) accountName = sanitizeFactoryProfileName(session.profileName || "");
    } catch {
      accountName = "";
    }
    return accountName;
  }

  return {
    resolve,
    seedFromAccount,
    get playerId() { return resolve().playerId; },
    get displayName() { return resolve().displayName; },
  };
}
