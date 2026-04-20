import {
  normalizeFactoryProfile,
  sanitizeFactoryProfileName,
} from "./factory-profile.mjs";

export function createMatchIdentity(factoryProfile, runOverrideName = "") {
  const profile = normalizeFactoryProfile(factoryProfile);
  const override = sanitizeFactoryProfileName(runOverrideName);
  const effectiveMatchName = override || profile.profileName;

  return {
    playerId: profile.playerId,
    profileName: profile.profileName,
    runOverrideName: override,
    effectiveMatchName,
  };
}

export function createOnlineIdentityPayload(factoryProfile, runOverrideName = "") {
  const identity = createMatchIdentity(factoryProfile, runOverrideName);

  return {
    playerId: identity.playerId,
    displayName: identity.effectiveMatchName,
  };
}
