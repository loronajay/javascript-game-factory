import { aggregateCareerStats } from "./career-stats.mjs";

function safeCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function progressPercent(value) {
  if (value?.isMaxLevel) return 100;
  const total = safeCount(value?.xpForNextLevel);
  return total ? Math.min(100, Math.round((safeCount(value?.xpIntoLevel) / total) * 100)) : 0;
}

function displayItemId(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  const label = value.split(":").at(-1) || "";
  return label.split("-").filter(Boolean).map((word) => `${word[0]?.toUpperCase() || ""}${word.slice(1)}`).join(" ") || fallback;
}

function emptyPlayer() {
  return { level: 1, xp: 0, xpIntoLevel: 0, xpForNextLevel: 400, isMaxLevel: false, matches: 0 };
}

function emptyMastery(slug) {
  return {
    slug,
    level: 1,
    xp: 0,
    xpIntoLevel: 0,
    xpForNextLevel: 200,
    isMaxLevel: false,
    matches: 0,
    wins: 0,
    draws: 0,
    strikes: 0,
    highGame: 0,
  };
}

function normalizedMastery(slug, value) {
  const fallback = emptyMastery(slug);
  const source = value && typeof value === "object" ? value : {};
  const normalized = {
    ...fallback,
    level: Math.max(1, safeCount(source.level) || 1),
    xp: safeCount(source.xp),
    xpIntoLevel: safeCount(source.xpIntoLevel),
    xpForNextLevel: safeCount(source.xpForNextLevel) || fallback.xpForNextLevel,
    isMaxLevel: source.isMaxLevel === true,
    matches: safeCount(source.matches),
    wins: safeCount(source.wins),
    draws: safeCount(source.draws),
    strikes: safeCount(source.strikes),
    highGame: safeCount(source.highGame),
    progressPercent: progressPercent(source),
  };
  for (const mode of ["quick", "classic"]) {
    for (const suffix of [
      "Games", "TotalScore", "HighGame", "StrikeOpportunities", "Strikes", "SpareOpportunities", "Spares",
    ]) normalized[`${mode}${suffix}`] = safeCount(source[`${mode}${suffix}`]);
  }
  return normalized;
}

function publicTracks(progression, roster) {
  const source = progression?.tracks && typeof progression.tracks === "object" && !Array.isArray(progression.tracks)
    ? progression.tracks
    : {};
  return Object.fromEntries(roster.map((bowler) => [
    bowler.slug,
    normalizedMastery(bowler.slug, source[bowler.slug]),
  ]));
}

function resolveBowler(animation, slug) {
  const roster = Array.isArray(animation?.CANON_BOWLERS) ? animation.CANON_BOWLERS : [];
  return roster.find((entry) => entry.slug === slug)
    || roster[0]
    || { slug: "daisy-monroe", name: "Daisy Monroe" };
}

function resolveSkin(animation, skinId) {
  const skins = Array.isArray(animation?.AVAILABLE_SKINS) ? animation.AVAILABLE_SKINS : [];
  return skins.find((entry) => entry.id === skinId)
    || skins.find((entry) => entry.id === animation?.DEFAULT_SKIN_ID)
    || { id: "canon", name: "Classic" };
}

function roomSlug(roomId) {
  return typeof roomId === "string" && roomId.startsWith("room:")
    ? roomId.slice("room:".length)
    : "default";
}

function normalizeCompetitive(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { available: false, rating: null, label: "--", matches: 0, wins: 0, losses: 0, draws: 0 };
  }
  const wins = safeCount(raw.wins);
  const losses = safeCount(raw.losses);
  const draws = safeCount(raw.draws);
  const matches = wins + losses + draws;
  const parsedRating = Math.round(Number(raw.rating));
  const rating = Number.isFinite(parsedRating) ? Math.max(0, parsedRating) : null;
  return {
    available: true,
    rating,
    label: matches === 0 ? "Unranked" : rating === null ? "--" : `${rating} ELO`,
    matches,
    wins,
    losses,
    draws,
  };
}

export function buildPublicProfileModel({
  playerId,
  profileName,
  loadout,
  progression,
  rating,
  animation,
  roomCore,
}) {
  const presentation = loadout && typeof loadout === "object" ? loadout : {};
  const roster = Array.isArray(animation?.CANON_BOWLERS) ? animation.CANON_BOWLERS : [];
  const bowler = resolveBowler(animation, presentation.featured?.bowlerSlug);
  const skin = resolveSkin(animation, presentation.featured?.skinId);
  const tracksByBowler = publicTracks(progression, roster);
  const tracks = Object.values(tracksByBowler).filter((entry) => entry.matches > 0);
  const career = aggregateCareerStats(tracks);
  const playerSource = progression?.player && typeof progression.player === "object" ? progression.player : {};
  const player = {
    ...emptyPlayer(),
    ...playerSource,
    level: Math.max(1, safeCount(playerSource.level) || 1),
    xp: safeCount(playerSource.xp),
    matches: safeCount(playerSource.matches),
    progressPercent: progressPercent(playerSource),
  };

  return {
    playerId: typeof playerId === "string" ? playerId.trim() : "",
    profileName: typeof profileName === "string" && profileName.trim() ? profileName.trim() : "Factory Bowler",
    title: displayItemId(presentation.titleId, "Rookie"),
    badge: displayItemId(presentation.badgeId, "Founding Bowler"),
    room: roomCore.getRoom(roomSlug(presentation.roomId)),
    player,
    career: { ...career, bowlersUsed: tracks.length },
    competitive: normalizeCompetitive(rating),
    mastery: tracksByBowler[bowler.slug] || emptyMastery(bowler.slug),
    masteryByBowler: tracksByBowler,
    featuredBowler: {
      ...bowler,
      skinId: skin.id,
      skinName: skin.name,
      art: animation.getPortraitAssetPath(bowler, skin.id),
    },
  };
}

export function buildCompactIdentityModel({ profile, matchPlayer, animation, cosmetics = null }) {
  const player = matchPlayer && typeof matchPlayer === "object" ? matchPlayer : {};
  const bowler = resolveBowler(animation, player.characterSlug);
  const skin = resolveSkin(animation, player.skinId);
  const mastery = profile?.masteryByBowler?.[bowler.slug] || emptyMastery(bowler.slug);
  // The identity card quotes the same line the entrance speaks: wheel slot 1.
  const catchLineItem = cosmetics?.getItem?.(player.presentation?.catchLineIds?.[0]);
  const profileIconItem = cosmetics?.getItem?.(player.presentation?.profileIconId);
  return {
    profileAvailable: Boolean(profile),
    playerId: player.accountPlayerId || player.playerId || profile?.playerId || "",
    profileName: player.name || profile?.profileName || "Factory Bowler",
    playerLevel: Math.max(1, safeCount(profile?.player?.level) || 1),
    title: profile?.title || "Rookie",
    badge: profile?.badge || "Founding Bowler",
    competitive: profile?.competitive || normalizeCompetitive(null),
    bowler: {
      ...bowler,
      skinId: skin.id,
      skinName: skin.name,
      art: animation.getPortraitAssetPath(bowler, skin.id),
      level: Math.max(1, safeCount(mastery.level) || 1),
    },
    presentation: player.presentation || {},
    catchLine: catchLineItem?.type === "catch-line" ? catchLineItem.assets?.text || "" : "",
    profileIconArt: profileIconItem?.type === "profile-icon" ? profileIconItem.assets?.art || "" : "",
  };
}
