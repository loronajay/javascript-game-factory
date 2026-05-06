// Backend-local normalizers extracted into domain modules.
// This file remains the stable import surface for callers.

export {
  ACTIVITY_FEED_LIMIT,
  normalizeActivityItem,
} from "./normalize-activity.mjs";

export {
  buildDefaultProfileMetricsRecord,
  normalizeProfileMetricsRecord,
} from "./normalize-metrics.mjs";

export {
  buildDefaultFriendCode,
  normalizeFactoryProfile,
  sanitizeProfileFriendCode,
} from "./normalize-profiles.mjs";

export {
  DIRECT_INTERACTION_POINTS,
  DIRECT_INTERACTION_WINDOW_LIMIT,
  DIRECT_INTERACTION_WINDOW_MS,
  FRIENDSHIP_CREATION_POINTS,
  SHARED_EVENT_POINTS,
  SHARED_SESSION_POINTS,
  buildDefaultProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "./normalize-relationships.mjs";

export {
  THOUGHT_REACTION_IDS,
  normalizeThoughtComment,
  normalizeThoughtPost,
} from "./normalize-thoughts.mjs";
