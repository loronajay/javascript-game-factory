import {
  normalizeFactoryProfile,
  sanitizeFactoryProfileName,
} from "./factory-profile.mjs";

export interface MatchIdentity {
  playerId: string;
  profileName: string;
  runOverrideName: string;
  effectiveMatchName: string;
}

export interface OnlineIdentityPayload {
  playerId: string;
  displayName: string;
}

export function createMatchIdentity(
  factoryProfile: unknown,
  runOverrideName = "",
): MatchIdentity {
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

export function createOnlineIdentityPayload(
  factoryProfile: unknown,
  runOverrideName = "",
): OnlineIdentityPayload {
  const identity = createMatchIdentity(factoryProfile, runOverrideName);

  return {
    playerId: identity.playerId,
    displayName: identity.effectiveMatchName,
  };
}
