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

// The slots the room editor may change, in the order it shows them. Skin, room
// and featured bowler are deliberately absent: they already have their own
// controls, and menu art has its own picker. Everything here is presentation —
// no slot in this list can reach scoring, physics or the wire.
const PLAYER_PRESENTATION_SLOTS = Object.freeze([
  Object.freeze({ key: "ballTrail", scope: "global", type: "ball-trail", label: "Default ball trail" }),
  Object.freeze({ key: "strikeBurst", scope: "global", type: "strike-burst", label: "Default strike burst" }),
  Object.freeze({ key: "title", scope: "global", type: "title", label: "Title" }),
  Object.freeze({ key: "badge", scope: "global", type: "badge", label: "Badge" }),
  // The four stickers thrown on the lane, in the order the match wheel paints
  // them. Global like the two above, because the pool is shared by the whole
  // roster rather than drawn per bowler.
  Object.freeze({ key: "emote", scope: "global", type: "emote", label: "Emote 1" }),
  Object.freeze({ key: "emote2", scope: "global", type: "emote", label: "Emote 2" }),
  Object.freeze({ key: "emote3", scope: "global", type: "emote", label: "Emote 3" }),
  Object.freeze({ key: "emote4", scope: "global", type: "emote", label: "Emote 4" }),
  Object.freeze({ key: "entrance", scope: "global", type: "entrance", label: "Entrance", optional: true }),
  // The catch-line wheel. Slot 1 is also the entrance line, which is why it is
  // labelled for that second job rather than as plain "Catch line 1".
  Object.freeze({ key: "catchLine", scope: "global", type: "catch-line", label: "Catch line 1 (entrance)" }),
  Object.freeze({ key: "catchLine2", scope: "global", type: "catch-line", label: "Catch line 2" }),
  Object.freeze({ key: "catchLine3", scope: "global", type: "catch-line", label: "Catch line 3" }),
  Object.freeze({ key: "catchLine4", scope: "global", type: "catch-line", label: "Catch line 4" }),
  // The two decoration slots have no default, so empty is one of their real
  // answers and has to be offerable — otherwise a frame could be put on but
  // never taken off again.
  Object.freeze({ key: "profileFrame", scope: "global", type: "profile-art", label: "Profile frame", optional: true }),
  Object.freeze({ key: "profileBackground", scope: "global", type: "profile-art", label: "Profile background", optional: true }),
]);

// A bowler popup owns everything that changes when a different bowler is
// selected for a match. Effects are optional overrides of the player's room
// defaults; every other row is intrinsically attached to this bowler.
const BOWLER_CONFIGURATION_SLOTS = Object.freeze([
  Object.freeze({ key: "ballTrail", scope: "bowler", type: "ball-trail", label: "Ball trail", optional: true, inheritGlobal: true, characterItems: false }),
  Object.freeze({ key: "strikeBurst", scope: "bowler", type: "strike-burst", label: "Strike burst", optional: true, inheritGlobal: true, characterItems: false }),
  Object.freeze({ key: "victoryPose", scope: "bowler", type: "victory-pose", label: "Victory pose", characterItems: true }),
  Object.freeze({ key: "defeatPose", scope: "bowler", type: "defeat-pose", label: "Defeat pose", characterItems: true }),
  Object.freeze({ key: "playerCard", scope: "bowler", type: "player-card", label: "Player card", characterItems: true }),
  Object.freeze({ key: "profileIcon", scope: "bowler", type: "profile-icon", label: "Profile icon", optional: true, characterItems: true }),
  Object.freeze({ key: "profileArt", scope: "bowler", type: "profile-art", label: "Profile art", characterItems: true }),
]);

// Locked items stay in the list on purpose: a reward nobody can see is a reward
// nobody plays for. Ownership decides what may be EQUIPPED, never what is shown,
// which is the same rule the skin picker follows.
function buildPresentation({ slots, cosmetics, loadout, bowlerSlug, ownedBowlerSlugs }) {
  return slots.map((slot) => {
    const scopedToBowler = slot.scope === "bowler";
    const itemFilter = slot.characterItems ? { characterSlug: bowlerSlug } : {};
    const items = cosmetics?.listByType?.(slot.type, itemFilter) || [];
    const inheritedId = slot.inheritGlobal ? loadout.getGlobalSlot(slot.key) : null;
    const equippedId = scopedToBowler
      ? loadout.getBowlerSlot(bowlerSlug, slot.key)
      : loadout.getGlobalSlot(slot.key);
    const empty = slot.optional
      ? [{
        id: "",
        name: slot.inheritGlobal ? "Use player default" : "None",
        tier: "standard",
        art: null,
        palette: null,
        owned: true,
      }]
      : [];
    return {
      ...slot,
      optional: Boolean(slot.optional),
      inheritedId,
      equippedId: equippedId || (slot.optional ? "" : null),
      effectiveId: equippedId || inheritedId || null,
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

export function buildBowlerConfigurationModel({
  bowlerSlug,
  loadout,
  progression,
  animation,
  cosmetics = null,
}) {
  const roster = Array.isArray(animation?.CANON_BOWLERS) ? animation.CANON_BOWLERS : [];
  const fallback = roster[0] || { slug: "daisy-monroe", name: "Daisy Monroe" };
  const bowler = roster.find((entry) => entry.slug === bowlerSlug) || fallback;
  const skinId = loadout.getEquippedSkinId(bowler.slug);
  const skins = Array.isArray(animation?.AVAILABLE_SKINS) ? animation.AVAILABLE_SKINS : [];
  const skin = skins.find((entry) => entry.id === skinId)
    || skins.find((entry) => entry.id === animation?.DEFAULT_SKIN_ID)
    || { id: "canon", name: "Classic" };
  const mastery = progression.getBowler(bowler.slug) || emptyMastery(bowler.slug);

  return {
    bowler: {
      ...bowler,
      skinId: skin.id,
      skinName: skin.name,
      art: animation.getPortraitAssetPath(bowler, skin.id),
    },
    mastery: { ...emptyMastery(bowler.slug), ...mastery, progressPercent: progressPercent(mastery) },
    ownedSkins: skins.filter((entry) => loadout.owns(`skin:${bowler.slug}:${entry.id}`)),
    presentation: buildPresentation({
      slots: BOWLER_CONFIGURATION_SLOTS,
      cosmetics,
      loadout,
      bowlerSlug: bowler.slug,
      ownedBowlerSlugs: new Set(loadout.listOwnedBowlerSlugs()),
    }),
  };
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
  const career = aggregateCareerStats(tracks);
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
    career,
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
    playerPresentation: buildPresentation({
      slots: PLAYER_PRESENTATION_SLOTS,
      cosmetics,
      loadout,
      bowlerSlug: bowler.slug,
      ownedBowlerSlugs: new Set(ownedBowlerSlugs),
    }),
  };
}
