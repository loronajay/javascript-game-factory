const DEFAULTS = Object.freeze({
  ballTrailId: "ball-trail:none",
  strikeBurstId: "strike-burst:classic",
  emoteId: "emote:wave",
  catchLineId: "catch-line:ready-to-roll",
});

export function buildMatchPresentation({ characterSlug, loadout } = {}) {
  return {
    ballTrailId: loadout?.getGlobalSlot?.("ballTrail") || DEFAULTS.ballTrailId,
    strikeBurstId: loadout?.getGlobalSlot?.("strikeBurst") || DEFAULTS.strikeBurstId,
    victoryPoseId: loadout?.getBowlerSlot?.(characterSlug, "victoryPose")
      || `victory-pose:${characterSlug}:canon`,
    emoteId: loadout?.getGlobalSlot?.("emote") || DEFAULTS.emoteId,
    playerCardId: loadout?.getBowlerSlot?.(characterSlug, "playerCard") || `player-card:${characterSlug}`,
    profileIconId: loadout?.getBowlerSlot?.(characterSlug, "profileIcon") || null,
    entranceId: loadout?.getGlobalSlot?.("entrance") || null,
    catchLineId: loadout?.getGlobalSlot?.("catchLine") || DEFAULTS.catchLineId,
  };
}

function itemOfType(cosmetics, itemId, type) {
  const item = cosmetics?.getItem?.(itemId);
  return item?.type === type ? item : null;
}

export function normalizeMatchPresentation(raw, { characterSlug, cosmetics } = {}) {
  const trail = itemOfType(cosmetics, raw?.ballTrailId, "ball-trail");
  const burst = itemOfType(cosmetics, raw?.strikeBurstId, "strike-burst");
  const emote = itemOfType(cosmetics, raw?.emoteId, "emote");
  const pose = itemOfType(cosmetics, raw?.victoryPoseId, "victory-pose");
  const card = itemOfType(cosmetics, raw?.playerCardId, "player-card");
  const icon = itemOfType(cosmetics, raw?.profileIconId, "profile-icon");
  const entrance = itemOfType(cosmetics, raw?.entranceId, "entrance");
  const catchLine = itemOfType(cosmetics, raw?.catchLineId, "catch-line");
  return {
    ballTrailId: trail?.id || DEFAULTS.ballTrailId,
    strikeBurstId: burst?.id || DEFAULTS.strikeBurstId,
    victoryPoseId: pose?.characterSlug === characterSlug
      ? pose.id
      : `victory-pose:${characterSlug}:canon`,
    emoteId: emote?.id || DEFAULTS.emoteId,
    playerCardId: card?.characterSlug === characterSlug ? card.id : `player-card:${characterSlug}`,
    profileIconId: icon?.characterSlug === characterSlug ? icon.id : null,
    entranceId: entrance?.id || null,
    catchLineId: catchLine?.id || DEFAULTS.catchLineId,
  };
}
