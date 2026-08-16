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
    strikes: 0,
    highGame: 0,
  };
}

export function buildProfileModel({ profileName, loadout, progression, animation, roomCore }) {
  const roster = Array.isArray(animation?.CANON_BOWLERS) ? animation.CANON_BOWLERS : [];
  const defaultBowler = roster[0] || { slug: "daisy-monroe", name: "Daisy Monroe" };
  const featured = loadout.getFeatured();
  const bowler = roster.find((entry) => entry.slug === featured?.bowlerSlug) || defaultBowler;
  const availableSkins = Array.isArray(animation?.AVAILABLE_SKINS) ? animation.AVAILABLE_SKINS : [];
  const skin = availableSkins.find((entry) => entry.id === featured?.skinId)
    || availableSkins.find((entry) => entry.id === animation?.DEFAULT_SKIN_ID)
    || { id: "canon", name: "Classic" };
  const player = progression.getPlayer() || { level: 1, xp: 0, xpIntoLevel: 0, xpForNextLevel: 400, isMaxLevel: false };
  const mastery = progression.getBowler(bowler.slug) || emptyMastery(bowler.slug);
  const tracks = progression.listBowlers();
  const matches = tracks.reduce((total, entry) => total + safeCount(entry?.matches), 0);
  const wins = tracks.reduce((total, entry) => total + safeCount(entry?.wins), 0);
  const strikes = tracks.reduce((total, entry) => total + safeCount(entry?.strikes), 0);
  const highGame = tracks.reduce((best, entry) => Math.max(best, safeCount(entry?.highGame)), 0);
  const room = roomCore.getRoom(loadout.getRoomSlug());
  const ownedRoomSlugs = new Set(loadout.listOwned("room").map((item) => item.id.split(":")[1]));
  const ownedBowlerSlugs = loadout.listOwnedBowlerSlugs();

  return {
    profileName: typeof profileName === "string" && profileName.trim() ? profileName.trim() : "Factory Bowler",
    title: displayItemId(loadout.getGlobalSlot("title"), "Rookie"),
    badge: displayItemId(loadout.getGlobalSlot("badge"), "Founding Bowler"),
    room,
    player: { ...player, progressPercent: progressPercent(player) },
    career: {
      matches,
      wins,
      losses: Math.max(0, matches - wins),
      winRate: matches ? Math.round((wins / matches) * 100) : 0,
      strikes,
      highGame,
    },
    mastery: { ...emptyMastery(bowler.slug), ...mastery, progressPercent: progressPercent(mastery) },
    featuredBowler: {
      ...bowler,
      skinId: skin.id,
      skinName: skin.name,
      art: animation.getPortraitAssetPath(bowler, skin.id),
    },
    ownedBowlers: ownedBowlerSlugs.map((slug) => roster.find((entry) => entry.slug === slug)).filter(Boolean),
    ownedRooms: roomCore.ROOMS.filter((entry) => ownedRoomSlugs.has(entry.slug)),
    ownedSkins: availableSkins.filter((entry) => loadout.owns(`skin:${bowler.slug}:${entry.id}`)),
  };
}
