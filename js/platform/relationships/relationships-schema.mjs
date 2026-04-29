import { getPlatformStorageKey } from "../storage/storage.mjs";

export const PROFILE_RELATIONSHIPS_STORAGE_KEY = getPlatformStorageKey("profileRelationships");
export const PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY = getPlatformStorageKey("profileRelationshipLedger");
export const FRIENDSHIP_CREATION_POINTS = 100;
export const SHARED_SESSION_POINTS = 10;
export const SHARED_EVENT_POINTS = 50;
export const DIRECT_INTERACTION_POINTS = 1;
export const DIRECT_INTERACTION_WINDOW_MS = 10 * 60 * 1000;
export const DIRECT_INTERACTION_WINDOW_LIMIT = 5;
