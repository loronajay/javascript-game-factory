// Every character image path the UI asks for is resolved here, so no screen
// module builds an asset path of its own. `animation-core.js` still owns the
// path shapes; this is the browser-side lookup seam over the canon roster.
//
// Injected rather than reaching for `window.YamBowlingCore` directly so the
// resolver can be unit-tested without a DOM or the classic script tags.
export function createCharacterAssets({ animation, roster, loadout, cosmetics = null }) {
  const bowlerBySlug = (slug) => roster.find((bowler) => bowler.slug === slug) || roster[0];

  return {
    bowlerBySlug,

    // The equipped skin comes from the presentation loadout, which owns both
    // the equipment record and the migration off the old per-skin storage key.
    storedSkinId: (slug) => loadout.getEquippedSkinId(bowlerBySlug(slug).slug),

    characterPortrait: (slug, skinId = animation.DEFAULT_SKIN_ID) => animation
      .getPortraitAssetPath({ slug }, skinId),

    // The outcome portrait a finished match shows. A victory or defeat pose is
    // its own equippable slot, so the pose is not always the skin worn on the
    // lane — but a REMOTE bowler's look arrived over the wire, and this device's
    // equipment has no say over it.
    resultPortrait: (slug, outcome, skinId = animation.DEFAULT_SKIN_ID, { remote = false, poseId = null } = {}) => {
      const bowlerSlug = bowlerBySlug(slug).slug;
      const slotName = outcome === "victory" ? "victoryPose" : "defeatPose";
      const equipped = remote ? poseId : loadout.getBowlerSlot(bowlerSlug, slotName);
      const equippedItem = cosmetics?.getItem?.(equipped);
      if (equippedItem?.type === `${outcome}-pose` && equippedItem.characterSlug === bowlerSlug && equippedItem.assets?.art) {
        return equippedItem.assets.art;
      }
      // `<type>:<bowler>:<skin>`. Another bowler's pose is not wearable here, so
      // anything that does not name this one falls back to the equipped skin.
      const [, poseSlug, poseSkinId] = typeof equipped === "string" ? equipped.split(":") : [];
      const resolvedSkinId = poseSlug === bowlerSlug && poseSkinId
        ? animation.normalizeSkinId(poseSkinId)
        : skinId;
      return animation.getResultPortraitAssetPath({ slug: bowlerSlug }, outcome, resolvedSkinId);
    },

    calloutPose: (slug, outcomeCue, skinId = animation.DEFAULT_SKIN_ID) => animation
      .getCalloutPoseAssetPath({ slug }, outcomeCue, skinId),

    // Remote looks arrive over the wire, so an unknown id normalizes back to
    // canon rather than being trusted into an asset path.
    normalizeSkinId: (skinId) => animation.normalizeSkinId(skinId),
  };
}
