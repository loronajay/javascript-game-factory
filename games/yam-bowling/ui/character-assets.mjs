// Every character image path the UI asks for is resolved here, so no screen
// module builds an asset path of its own. `animation-core.js` still owns the
// path shapes; this is the browser-side lookup seam over the canon roster.
//
// Injected rather than reaching for `window.YamBowlingCore` directly so the
// resolver can be unit-tested without a DOM or the classic script tags.
export function createCharacterAssets({ animation, roster }) {
  const bowlerBySlug = (slug) => roster.find((bowler) => bowler.slug === slug) || roster[0];

  return {
    bowlerBySlug,

    // The equipped skin persisted for a bowler, normalized through the catalog.
    storedSkinId: (slug) => animation.getEquippedSkinId(bowlerBySlug(slug)),

    characterPortrait: (slug, skinId = animation.DEFAULT_SKIN_ID) => animation
      .getPortraitAssetPath({ slug }, skinId),

    resultPortrait: (slug, outcome, skinId = animation.DEFAULT_SKIN_ID) => animation
      .getResultPortraitAssetPath({ slug }, outcome, skinId),

    calloutPose: (slug, outcomeCue, skinId = animation.DEFAULT_SKIN_ID) => animation
      .getCalloutPoseAssetPath({ slug }, outcomeCue, skinId),

    // Remote looks arrive over the wire, so an unknown id normalizes back to
    // canon rather than being trusted into an asset path.
    normalizeSkinId: (skinId) => animation.normalizeSkinId(skinId),
  };
}
