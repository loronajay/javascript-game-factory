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

// The slots the room editor may change, in the order it shows them. Skin, room
// and featured bowler are deliberately absent: they already have their own
// controls, and menu art has its own picker. Everything here is presentation —
// no slot in this list can reach scoring, physics or the wire.
const PRESENTATION_SLOTS = Object.freeze([
  Object.freeze({ key: "ballTrail", scope: "global", type: "ball-trail", label: "Ball trail" }),
  Object.freeze({ key: "strikeBurst", scope: "global", type: "strike-burst", label: "Strike burst" }),
  Object.freeze({ key: "victoryPose", scope: "bowler", type: "victory-pose", label: "Victory pose" }),
  Object.freeze({ key: "defeatPose", scope: "bowler", type: "defeat-pose", label: "Defeat pose" }),
  Object.freeze({ key: "playerCard", scope: "bowler", type: "player-card", label: "Player card" }),
  Object.freeze({ key: "profileArt", scope: "bowler", type: "profile-art", label: "Profile art" }),
  Object.freeze({ key: "title", scope: "global", type: "title", label: "Title" }),
  Object.freeze({ key: "badge", scope: "global", type: "badge", label: "Badge" }),
  // The sticker thrown on the lane. Global like the two above, because the pool
  // is shared by the whole roster rather than drawn per bowler.
  Object.freeze({ key: "emote", scope: "global", type: "emote", label: "Emote" }),
  // The two decoration slots have no default, so empty is one of their real
  // answers and has to be offerable — otherwise a frame could be put on but
  // never taken off again.
  Object.freeze({ key: "profileFrame", scope: "global", type: "profile-art", label: "Profile frame", optional: true }),
  Object.freeze({ key: "profileBackground", scope: "global", type: "profile-art", label: "Profile background", optional: true }),
]);

// Locked items stay in the list on purpose: a reward nobody can see is a reward
// nobody plays for. Ownership decides what may be EQUIPPED, never what is shown,
// which is the same rule the skin picker follows.
function buildPresentation({ cosmetics, loadout, bowlerSlug, ownedBowlerSlugs }) {
  if (!cosmetics?.listByType) return [];
  return PRESENTATION_SLOTS.map((slot) => {
    const scopedToBowler = slot.scope === "bowler";
    const items = cosmetics.listByType(slot.type, scopedToBowler ? { characterSlug: bowlerSlug } : {});
    const empty = slot.optional
      ? [{ id: "", name: "None", tier: "standard", art: null, palette: null, owned: true }]
      : [];
    return {
      ...slot,
      optional: Boolean(slot.optional),
      equippedId: (scopedToBowler
        ? loadout.getBowlerSlot(bowlerSlug, slot.key)
        : loadout.getGlobalSlot(slot.key)) || (slot.optional ? "" : null),
      options: empty.concat(items.map((item) => ({
        id: item.id,
        name: item.name,
        tier: item.tier,
        art: item.assets?.thumbnail || item.assets?.art || null,
        palette: item.assets?.palette || null,
        // A global slot filled with a bowler's own art is gated by that bowler,
        // not by the art: the profile frame is earned by earning the bowler.
        owned: loadout.owns(item.id)
          && (scopedToBowler || !item.characterSlug || ownedBowlerSlugs.has(item.characterSlug)),
      }))),
    };
  });
}

// The player ladder, derived from the authoritative level rather than from any
// stored unlock record -- there is nothing here to fall out of step with the
// account. `synced` is carried alongside it so the screen can say plainly that
// an unsynced device is showing a cache instead of dressing level 1 up as fact.
function buildRewardTrack({ playerRewards, loadout, level, sync }) {
  if (!playerRewards?.buildRewardTree) return null;
  const tree = playerRewards.buildRewardTree({ currentLevel: level, loadout });
  return {
    nodes: tree.nodes,
    nextReward: tree.nextReward,
    currentLevel: tree.currentLevel,
    voucherLevels: playerRewards.SKIN_VOUCHER_LEVELS,
    synced: !sync.stale,
  };
}

export function buildProfileModel({
  profileName,
  loadout,
  progression,
  animation,
  roomCore,
  cosmetics = null,
  playerRewards = null,
}) {
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
  const sync = progression.getSyncState?.() || { stale: true, pendingCount: 0, syncedAt: null };

  return {
    sync,
    rewardTrack: buildRewardTrack({ playerRewards, loadout, level: player.level, sync }),
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
    presentation: buildPresentation({
      cosmetics,
      loadout,
      bowlerSlug: bowler.slug,
      ownedBowlerSlugs: new Set(ownedBowlerSlugs),
    }),
  };
}
