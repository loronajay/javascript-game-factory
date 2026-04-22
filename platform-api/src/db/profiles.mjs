import { normalizeFactoryProfile } from "../../../js/platform/identity/factory-profile.mjs";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function ensureJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function normalizeRecentActivity(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

function normalizeStoredProfile(source = {}) {
  const normalized = normalizeFactoryProfile(source, {
    playerIdGenerator: () => source.playerId || "",
  });

  return {
    ...normalized,
    featuredGames: normalizeStringList(source.featuredGames),
    recentActivity: normalizeRecentActivity(source.recentActivity),
    thoughtCount: sanitizeCount(source.thoughtCount),
  };
}

function mapRowToFactoryProfile(row = {}) {
  if (!row?.player_id) return null;

  return normalizeStoredProfile({
    playerId: row.player_id,
    profileName: row.profile_name,
    realName: row.real_name,
    bio: row.bio,
    tagline: row.tagline,
    avatarAssetId: row.avatar_asset_id,
    backgroundImageUrl: row.background_image_url,
    presence: row.presence,
    favoriteGameSlug: row.favorite_game_slug,
    ladderPlacements: ensureJsonArray(row.ladder_placements),
    friendsPreview: ensureJsonArray(row.friends_preview),
    mainSqueeze: ensureJsonObject(row.main_squeeze),
    badgeIds: ensureJsonArray(row.badge_ids),
    favorites: ensureJsonArray(row.favorites),
    friends: ensureJsonArray(row.friends),
    recentPartners: ensureJsonArray(row.recent_partners),
    links: ensureJsonArray(row.links),
    preferences: ensureJsonObject(row.preferences),
    featuredGames: ensureJsonArray(row.featured_games),
    recentActivity: ensureJsonArray(row.recent_activity),
    thoughtCount: Number(row.thought_count) || 0,
  });
}

function buildProfileParams(playerId, profile) {
  return [
    playerId,
    profile.profileName,
    profile.realName,
    profile.bio,
    profile.tagline,
    profile.avatarAssetId,
    profile.backgroundImageUrl,
    profile.presence,
    profile.favoriteGameSlug,
    JSON.stringify(profile.ladderPlacements),
    JSON.stringify(profile.friendsPreview),
    profile.mainSqueeze?.playerId || profile.mainSqueeze?.profileName ? JSON.stringify(profile.mainSqueeze) : null,
    JSON.stringify(profile.badgeIds),
    JSON.stringify(profile.favorites),
    JSON.stringify(profile.friends),
    JSON.stringify(profile.recentPartners),
    JSON.stringify(profile.links),
    JSON.stringify(profile.preferences),
    JSON.stringify(profile.featuredGames || []),
    JSON.stringify(profile.recentActivity || []),
    Number(profile.thoughtCount) || 0,
  ];
}

export async function loadPlayerProfile(db, playerId) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const result = await db.query(`
    select
      p.player_id,
      pp.profile_name,
      pp.real_name,
      pp.bio,
      pp.tagline,
      pp.avatar_asset_id,
      pp.background_image_url,
      pp.presence,
      pp.favorite_game_slug,
      pp.ladder_placements,
      pp.friends_preview,
      pp.main_squeeze,
      pp.badge_ids,
      pp.favorites,
      pp.friends,
      pp.recent_partners,
      pp.links,
      pp.preferences,
      pp.featured_games,
      pp.recent_activity,
      pp.thought_count
    from players p
    left join player_profiles pp on pp.player_id = p.player_id
    where p.player_id = $1
    limit 1
  `, [normalizedPlayerId]);

  return mapRowToFactoryProfile(result?.rows?.[0] || null);
}

export async function savePlayerProfile(db, playerId, patch = {}) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const normalized = normalizeFactoryProfile({
    ...patch,
    playerId: normalizedPlayerId,
  });
  const normalizedProfile = normalizeStoredProfile({
    ...patch,
    ...normalized,
    playerId: normalizedPlayerId,
  });

  await db.query(`
    insert into players (player_id)
    values ($1)
    on conflict (player_id) do update
      set updated_at = now()
  `, [normalizedPlayerId]);

  const result = await db.query(`
    insert into player_profiles (
      player_id,
      profile_name,
      real_name,
      bio,
      tagline,
      avatar_asset_id,
      background_image_url,
      presence,
      favorite_game_slug,
      ladder_placements,
      friends_preview,
      main_squeeze,
      badge_ids,
      favorites,
      friends,
      recent_partners,
      links,
      preferences,
      featured_games,
      recent_activity,
      thought_count
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
      $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21
    )
    on conflict (player_id) do update set
      profile_name = excluded.profile_name,
      real_name = excluded.real_name,
      bio = excluded.bio,
      tagline = excluded.tagline,
      avatar_asset_id = excluded.avatar_asset_id,
      background_image_url = excluded.background_image_url,
      presence = excluded.presence,
      favorite_game_slug = excluded.favorite_game_slug,
      ladder_placements = excluded.ladder_placements,
      friends_preview = excluded.friends_preview,
      main_squeeze = excluded.main_squeeze,
      badge_ids = excluded.badge_ids,
      favorites = excluded.favorites,
      friends = excluded.friends,
      recent_partners = excluded.recent_partners,
      links = excluded.links,
      preferences = excluded.preferences,
      featured_games = excluded.featured_games,
      recent_activity = excluded.recent_activity,
      thought_count = excluded.thought_count,
      updated_at = now()
    returning
      player_id,
      profile_name,
      real_name,
      bio,
      tagline,
      avatar_asset_id,
      background_image_url,
      presence,
      favorite_game_slug,
      ladder_placements,
      friends_preview,
      main_squeeze,
      badge_ids,
      favorites,
      friends,
      recent_partners,
      links,
      preferences,
      featured_games,
      recent_activity,
      thought_count
  `, buildProfileParams(normalizedPlayerId, normalizedProfile));

  return mapRowToFactoryProfile(result?.rows?.[0] || null);
}
