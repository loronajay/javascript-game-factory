import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import type { PlatformApiClient, PlatformApiClientOptions } from "../platform/api/platform-api.mjs";
import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import type { FactoryProfile } from "../platform/identity/factory-profile.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import type { StorageLike } from "../platform/storage/storage.mjs";
import {
  buildThoughtCardItems,
  loadThoughtFeed,
  syncThoughtFeedFromApi,
} from "../platform/thoughts/thoughts.mjs";
import type { ThoughtCardItem } from "../platform/thoughts/thoughts.mjs";

export interface ThoughtsPageViewModel {
  heroTitle: string;
  heroKicker: string;
  heroSummary: string;
  heroCountLabel: string;
  items: ThoughtCardItem[];
}

export interface ThoughtsPageDataOptions extends PlatformApiClientOptions {
  storage?: StorageLike | null;
  apiClient?: PlatformApiClient;
  currentProfile?: FactoryProfile | null;
  thoughtFeed?: unknown[];
}

export interface ThoughtsPageData {
  storage: StorageLike | null;
  currentProfile: FactoryProfile;
  apiClient: PlatformApiClient;
  thoughtFeed: unknown[];
}

function formatCountLabel(count: number): string {
  return `${count} POST${count === 1 ? "" : "S"}`;
}

export function buildThoughtsPageViewModel(thoughtFeed: unknown = loadThoughtFeed()): ThoughtsPageViewModel {
  const items = Array.isArray(thoughtFeed) ? thoughtFeed : [];

  return {
    heroTitle: "ARCADE THOUGHTS",
    heroKicker: "STATUS FEED",
    heroSummary: "This is the first scaffold for the future player-status feed: short posts, visible engagement counts, and a scrollable social lane that can later grow comments and sharing.",
    heroCountLabel: formatCountLabel(items.length),
    items: buildThoughtCardItems(items, {
      placeholderTitle: "No posts yet",
      placeholderSummary: "The thought feed is still warming up. No thoughts have been shared yet. Be the first to post.",
    }),
  };
}

export async function loadThoughtsPageData(options: ThoughtsPageDataOptions = {}): Promise<ThoughtsPageData> {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient(options);
  const currentProfile = options.currentProfile || loadFactoryProfile(storage);
  const thoughtFeed = Array.isArray(options?.thoughtFeed)
    ? options.thoughtFeed
    : await syncThoughtFeedFromApi(storage, apiClient, currentProfile?.playerId || "");

  return {
    storage,
    currentProfile,
    apiClient,
    thoughtFeed,
  };
}
