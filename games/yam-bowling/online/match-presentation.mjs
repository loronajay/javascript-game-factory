const DEFAULTS = Object.freeze({
  ballTrailId: "ball-trail:none",
  strikeBurstId: "strike-burst:classic",
});

// The founding fallbacks for each reaction wheel, slot by slot. They restate the
// loadout's own defaults for the wire, because a match snapshot has to resolve a
// wheel with no help from this device's loadout — an opponent's wheel arrives as
// data and there is no local record of it to consult.
//
// `emoteIds` and `catchLineIds` are the two wire fields the reaction channel
// indexes. Adding a third kind means a row here and a row in the loadout's
// `REACTION_WHEEL_SLOTS`; nothing between them learns a new shape.
export const DEFAULT_REACTION_IDS = Object.freeze({
  emote: Object.freeze(["emote:wave", "emote:thumbs-up", "emote:good-luck", "emote:nice-one"]),
  "catch-line": Object.freeze([
    "catch-line:ready-to-roll",
    "catch-line:good-game",
    "catch-line:keep-it-clean",
    "catch-line:find-the-pocket",
  ]),
});

export const REACTION_WHEEL_FIELDS = Object.freeze({ emote: "emoteIds", "catch-line": "catchLineIds" });
export const REACTION_WHEEL_SIZE = DEFAULT_REACTION_IDS.emote.length;

// A wheel is always exactly four resolvable ids: a short, holed or overlong list
// is padded and trimmed rather than rejected, so an old client, a truncated
// snapshot and a wheel whose fifth slot has not shipped yet all still react.
function normalizeWheel(kind, raw, accepts = () => true) {
  return DEFAULT_REACTION_IDS[kind].map((fallback, index) => {
    const candidate = Array.isArray(raw) ? raw[index] : null;
    return typeof candidate === "string" && accepts(candidate) ? candidate : fallback;
  });
}

export function buildMatchPresentation({ characterSlug, loadout } = {}) {
  return {
    ballTrailId: loadout?.getGlobalSlot?.("ballTrail") || DEFAULTS.ballTrailId,
    strikeBurstId: loadout?.getGlobalSlot?.("strikeBurst") || DEFAULTS.strikeBurstId,
    victoryPoseId: loadout?.getBowlerSlot?.(characterSlug, "victoryPose")
      || `victory-pose:${characterSlug}:canon`,
    emoteIds: normalizeWheel("emote", loadout?.getReactionWheel?.("emote")),
    catchLineIds: normalizeWheel("catch-line", loadout?.getReactionWheel?.("catch-line")),
    playerCardId: loadout?.getBowlerSlot?.(characterSlug, "playerCard") || `player-card:${characterSlug}`,
    profileIconId: loadout?.getBowlerSlot?.(characterSlug, "profileIcon") || null,
    entranceId: loadout?.getGlobalSlot?.("entrance") || null,
  };
}

function itemOfType(cosmetics, itemId, type) {
  const item = cosmetics?.getItem?.(itemId);
  return item?.type === type ? item : null;
}

export function normalizeMatchPresentation(raw, { characterSlug, cosmetics } = {}) {
  const trail = itemOfType(cosmetics, raw?.ballTrailId, "ball-trail");
  const burst = itemOfType(cosmetics, raw?.strikeBurstId, "strike-burst");
  const pose = itemOfType(cosmetics, raw?.victoryPoseId, "victory-pose");
  const card = itemOfType(cosmetics, raw?.playerCardId, "player-card");
  const icon = itemOfType(cosmetics, raw?.profileIconId, "profile-icon");
  const entrance = itemOfType(cosmetics, raw?.entranceId, "entrance");
  const wheel = (kind) => normalizeWheel(
    kind,
    raw?.[REACTION_WHEEL_FIELDS[kind]],
    (itemId) => Boolean(itemOfType(cosmetics, itemId, kind)),
  );
  return {
    ballTrailId: trail?.id || DEFAULTS.ballTrailId,
    strikeBurstId: burst?.id || DEFAULTS.strikeBurstId,
    victoryPoseId: pose?.characterSlug === characterSlug
      ? pose.id
      : `victory-pose:${characterSlug}:canon`,
    emoteIds: wheel("emote"),
    catchLineIds: wheel("catch-line"),
    playerCardId: card?.characterSlug === characterSlug ? card.id : `player-card:${characterSlug}`,
    profileIconId: icon?.characterSlug === characterSlug ? icon.id : null,
    entranceId: entrance?.id || null,
  };
}
