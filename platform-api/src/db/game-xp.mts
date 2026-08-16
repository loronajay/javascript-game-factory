import {
  computeCampaignGrant,
  computeOnlineGrant,
  getProgression,
  inventoryRewardsBetween,
  levelFromXp,
} from "../services/progression-catalog.mjs";

// Earned advancement: XP totals, per-track mastery counters, and the grant
// ledger that makes an award happen exactly once.
//
// The award path (`awardMatchXp`) takes a CLIENT, not a pool, because it runs
// inside the caller's transaction — today the ELO transaction in db/ratings.mts.
// That is the whole point of folding it in: the same rating session id that
// decides "this match settles once" also keys the XP grant, so there is no
// second call for a network drop to lose and no second key to disagree.
//
// Nothing here ever accepts an XP amount. Callers say what was played; the
// catalog says what it is worth. See 038-game-xp-progression.sql for which of
// those reported fields the server can actually check.

const MAX_RETURNED_GRANTS = 400;

function safeInt(value: unknown, fallback = 0): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampCount(value: unknown): number {
  return Math.max(0, safeInt(value, 0));
}

// Merges a grant's per-game extras into the stored ones by the rule the catalog
// declares. A high game is a high-water mark and a strike count is a running
// total; the difference lives in the catalog so this stays generic.
function mergeTrackStats(
  definition: any,
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [key, rule] of Object.entries(definition.trackStats || {})) {
    const previous = clampCount((stored || {})[key]);
    const next = clampCount((incoming || {})[key]);
    merged[key] = rule === "max" ? Math.max(previous, next) : previous + next;
  }
  return merged;
}

// Two reporters of one match should name the same mode. When they do not, one of
// them is lying and there is no way to tell which — so both are paid the LESSER
// of the two payouts. Refusing the later claim instead would have let a griefer
// deny an honest opponent's XP by reporting an inflated mode first; clamping pays
// the honest player for what they actually played and earns the liar nothing.
function resolveDisputedMode(gameSlug: string, params: AwardMatchXpParams) {
  const claimed = computeOnlineGrant(gameSlug, {
    modeId: params.modeId,
    outcome: params.outcome,
    performance: params.performance,
    forfeitRole: params.forfeitRole ?? null,
  });
  const attested = params.attestedModeId;
  if (!attested || attested === params.modeId || !claimed.eligible) return claimed;

  const alternative = computeOnlineGrant(gameSlug, {
    modeId: attested,
    outcome: params.outcome,
    performance: params.performance,
    forfeitRole: params.forfeitRole ?? null,
  });
  if (!alternative.eligible) return claimed;
  return alternative.xp < claimed.xp ? alternative : claimed;
}

export interface AwardMatchXpParams {
  playerId: string;
  gameSlug: string;
  grantId: string;
  trackId: string;
  modeId: string;
  // The mode the FIRST reporter of this match stamped on the rating session, if
  // any. Absent for the first reporter, who is the one doing the stamping.
  attestedModeId?: string | null;
  outcome: string;
  performance?: number;
  forfeitRole?: string | null;
  stats?: Record<string, unknown>;
  source?: string;
}

interface PersistXpParams {
  playerId: string;
  gameSlug: string;
  grantId: string;
  trackId: string;
  source: string;
  isWin: boolean;
  stats?: Record<string, unknown>;
}

async function persistXpAward(client: any, definition: any, params: PersistXpParams, verdict: any): Promise<any> {
  const ledger = await client.query(
    `insert into game_xp_grants (player_id, game_slug, grant_id, track_id, xp, source)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (player_id, game_slug, grant_id) do nothing`,
    [params.playerId, params.gameSlug, params.grantId, params.trackId, verdict.xp, params.source],
  );
  if (ledger.rowCount === 0) return { awarded: false, reason: "already-granted" };

  const profile = await client.query(
    `insert into game_xp_profiles (player_id, game_slug, xp, matches, updated_at)
     values ($1, $2, $3, 1, now())
     on conflict (player_id, game_slug) do update
       set xp = game_xp_profiles.xp + excluded.xp,
           matches = game_xp_profiles.matches + 1,
           updated_at = now()
     returning xp`,
    [params.playerId, params.gameSlug, verdict.xp],
  );
  const nextPlayerXp = clampCount(profile.rows[0]?.xp);
  for (const reward of inventoryRewardsBetween(definition, nextPlayerXp - verdict.xp, nextPlayerXp)) {
    await client.query(
      `insert into game_inventory_items (player_id, game_slug, item_id, quantity)
       values ($1, $2, $3, $4)
       on conflict (player_id, game_slug, item_id) do update
         set quantity = game_inventory_items.quantity + excluded.quantity,
             updated_at = now()`,
      [params.playerId, params.gameSlug, reward.itemId, reward.quantity],
    );
  }

  const existing = await client.query(
    `select stats from game_xp_tracks where player_id = $1 and game_slug = $2 and track_id = $3 for update`,
    [params.playerId, params.gameSlug, params.trackId],
  );
  const stats = mergeTrackStats(definition, existing.rows[0]?.stats || {}, params.stats || {});

  await client.query(
    `insert into game_xp_tracks (player_id, game_slug, track_id, xp, matches, wins, stats, updated_at)
     values ($1, $2, $3, $4, 1, $5, $6, now())
     on conflict (player_id, game_slug, track_id) do update
       set xp = game_xp_tracks.xp + excluded.xp,
           matches = game_xp_tracks.matches + 1,
           wins = game_xp_tracks.wins + excluded.wins,
           stats = excluded.stats,
           updated_at = now()`,
    [params.playerId, params.gameSlug, params.trackId, verdict.xp, params.isWin ? 1 : 0, JSON.stringify(stats)],
  );

  return { awarded: true, reason: "eligible", xp: verdict.xp, trackId: params.trackId, breakdown: verdict.breakdown };
}

// Awards one player's XP for one authoritative match, inside the caller's
// transaction. Idempotent by (player, game, grant): a retry, a reconnect, or a
// double-submitted results screen all land on the same refused insert.
//
// Returns a verdict rather than throwing, because a progression failure must
// never take down the ELO update it rides along with — a lost level is
// recoverable, a lost rating is not.
export async function awardMatchXp(client: any, params: AwardMatchXpParams): Promise<any> {
  const { playerId, gameSlug, grantId, trackId, modeId, outcome } = params || ({} as AwardMatchXpParams);
  if (!client || !playerId || !gameSlug || !grantId || !trackId) {
    return { awarded: false, reason: "incomplete-grant" };
  }

  const definition = getProgression(gameSlug);
  if (!definition) return { awarded: false, reason: "game-not-registered" };

  const verdict = resolveDisputedMode(gameSlug, params);
  if (!verdict.eligible) return { awarded: false, reason: verdict.reason };

  return persistXpAward(client, definition, {
    playerId,
    gameSlug,
    grantId,
    trackId,
    source: params.source || "online-match",
    isWin: outcome === "win",
    stats: params.stats,
  }, verdict);
}

export interface AwardCampaignXpParams {
  playerId: string;
  gameSlug: string;
  grantId: string;
  trackId: string;
  kind: string;
  firstClear?: boolean;
  source?: string;
}

export async function awardCampaignXp(client: any, params: AwardCampaignXpParams): Promise<any> {
  const { playerId, gameSlug, grantId, trackId, kind } = params || ({} as AwardCampaignXpParams);
  if (!client || !playerId || !gameSlug || !grantId || !trackId) {
    return { awarded: false, reason: "incomplete-grant" };
  }
  const definition = getProgression(gameSlug);
  if (!definition) return { awarded: false, reason: "game-not-registered" };
  const verdict = computeCampaignGrant(gameSlug, { kind, firstClear: params.firstClear ?? true });
  if (!verdict.eligible) return { awarded: false, reason: verdict.reason };
  return persistXpAward(client, definition, {
    playerId,
    gameSlug,
    grantId,
    trackId,
    source: params.source || "campaign-clear",
    isWin: true,
    stats: {},
  }, verdict);
}

// The player's whole progression document for one cabinet. Public: a mastery
// level is something a profile exists to show, the same reasoning that makes a
// driver profile publicly readable while a loadout's ownership is not.
export async function getGameXpProgress(pool: any, playerId: any, gameSlug: any): Promise<any> {
  if (!pool || !playerId || !gameSlug) return null;
  const definition = getProgression(gameSlug);
  if (!definition) return null;

  try {
    const [profile, tracks, grants] = await Promise.all([
      pool.query(
        `select xp, matches, updated_at from game_xp_profiles where player_id = $1 and game_slug = $2`,
        [playerId, gameSlug],
      ),
      pool.query(
        `select track_id, xp, matches, wins, stats from game_xp_tracks
         where player_id = $1 and game_slug = $2 order by track_id asc`,
        [playerId, gameSlug],
      ),
      pool.query(
        `select grant_id from game_xp_grants where player_id = $1 and game_slug = $2
         order by granted_at desc limit ${MAX_RETURNED_GRANTS}`,
        [playerId, gameSlug],
      ),
    ]);

    const playerXp = clampCount(profile.rows[0]?.xp);
    const trackDocuments: Record<string, any> = {};
    for (const row of tracks.rows || []) {
      const xp = clampCount(row.xp);
      trackDocuments[String(row.track_id)] = {
        matches: clampCount(row.matches),
        wins: clampCount(row.wins),
        ...(row.stats && typeof row.stats === "object" ? row.stats : {}),
        ...levelFromXp(definition.curves.track, xp),
      };
    }

    return {
      playerId,
      gameSlug,
      player: { matches: clampCount(profile.rows[0]?.matches), ...levelFromXp(definition.curves.player, playerXp) },
      tracks: trackDocuments,
      // Newest first from the query; reversed so the client's own bounded ledger
      // evicts the oldest first when it trims, matching its FIFO cache.
      grants: (grants.rows || []).map((row: any) => String(row.grant_id)).reverse(),
      syncedAt: profile.rows[0]?.updated_at || null,
    };
  } catch (err) {
    process.stderr.write(`[game-xp] getGameXpProgress error: ${(err as any)?.message || err}\n`);
    return null;
  }
}
