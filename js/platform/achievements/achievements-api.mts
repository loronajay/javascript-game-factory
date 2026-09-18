// Browser client for the platform achievement routes.
//
// Thin on purpose: the raw verbs on the shared platform client already own the
// bearer header, the credentials mode and the 401-drops-the-token rule, so a
// cabinet must go through here rather than hand-rolling a fetch. Every call
// resolves to null on any failure (offline, signed out, refused run) — a
// cabinet's end-of-run flow must never throw because trophies could not be
// filed.

import { createPlatformApiClient, type PlatformApiClient } from "../api/platform-api.mjs";
import { getStoredAuthToken } from "../api/auth-token.mjs";

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  category: string;
  secret: boolean;
  parentId: string | null;
  tier: number | null;
  points: number;
  icon: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AchievementGameSummary {
  gameSlug: string;
  title: string;
  unlocked: number;
  total: number;
  achievements: AchievementView[];
}

export interface AchievementCollection {
  playerId: string;
  unlocked: number;
  total: number;
  games: AchievementGameSummary[];
}

export interface AchievementRunResponse {
  ok: boolean;
  runId: string;
  unlocked: AchievementView[];
  owned: string[];
  progress: { gameSlug: string; title: string; unlocked: number; total: number };
}

function encode(value: unknown): string {
  return encodeURIComponent(typeof value === "string" ? value.trim() : "");
}

export function createAchievementsApi(client: PlatformApiClient = createPlatformApiClient()) {
  return {
    /** True when a run submission could be attributed to an account at all. */
    canSubmit(): boolean {
      return client.isConfigured && !!getStoredAuthToken();
    },
    /**
     * Files a completed run. Resolves to the server's verdict, or null when
     * the player is signed out, the API is unreachable, or the run was
     * refused — all of which the caller treats the same way: no toast.
     */
    async submitRun(gameSlug: string, run: unknown): Promise<AchievementRunResponse | null> {
      const slug = encode(gameSlug);
      if (!slug || !this.canSubmit()) return null;
      const payload = await client.post(`/achievements/${slug}/runs`, { run });
      return payload && payload.ok === true ? (payload as AchievementRunResponse) : null;
    },
    async fetchCatalog(gameSlug: string): Promise<AchievementGameSummary | null> {
      const slug = encode(gameSlug);
      return slug ? client.get(`/achievements/${slug}`, "game") : null;
    },
    async fetchPlayerCollection(playerId: string, gameSlug = ""): Promise<AchievementCollection | null> {
      const pid = encode(playerId);
      if (!pid) return null;
      const slug = encode(gameSlug);
      return client.get(`/players/${pid}/achievements${slug ? `?game=${slug}` : ""}`, "collection");
    },
  };
}

export type AchievementsApi = ReturnType<typeof createAchievementsApi>;
