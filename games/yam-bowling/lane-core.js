(function exposeLaneCore(root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.YamLaneCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLaneCore(root) {
  "use strict";

  const DEFAULT_LANE_SLUG = "crimson-crown";
  const LANE_STORAGE_KEY = "yam-bowling.lane";
  const EDGE_DEPTHS = [0, 1];

  function measuredEdges(values) {
    return Object.freeze(values.map(([left, right], index) => Object.freeze({
      z: EDGE_DEPTHS[index], left, right,
    })));
  }

  // Inner edges of the painted gutters, fitted to each 1024x1536 lane asset by
  // reading the wood boundary at every depth the renderer draws. Every backdrop
  // paints the boards as a straight taper under the renderer's depth-to-row
  // mapping, so two endpoints describe the whole lane exactly -- and a straight
  // taper is the point: sampling the same line at extra depths only invites a
  // mismeasured knot, which is what once put a visible elbow at z = 0.8 in the
  // aim guide and in any ball travelling off the centerline.
  //
  // This is the only lane geometry there is. The painted trough sits at a fixed
  // board offset outside these edges, so the renderer reaches it by projecting
  // past x = 1 rather than through a second table: a separate trough path drifts
  // out of step with this one, which is how captured balls once ended up riding
  // the capping mid-lane and climbing back onto the wood at the pin deck.
  const LANE_EDGES = Object.freeze({
    "crimson-crown": measuredEdges([[44, 978], [461, 559]]),
    "blue-circuit": measuredEdges([[40, 975], [462, 557]]),
    "emerald-vault": measuredEdges([[45, 978], [461, 559]]),
    "royal-gold": measuredEdges([[60, 956], [450, 572]]),
    "sunset-strip": measuredEdges([[57, 961], [465, 560]]),
    "neon-carnival": measuredEdges([[45, 973], [458, 560]]),
    "cosmic-bowl": measuredEdges([[48, 976], [465, 560]]),
    "liberty-lanes": measuredEdges([[58, 964], [458, 565]]),
    "oak-and-onyx": measuredEdges([[41, 977], [455, 562]]),
  });

  // A lane is pure presentation: its small pin-deck offset compensates for the
  // painted horizon in that backdrop and never changes rack layout or physics.
  const LANES = Object.freeze([
    ["Crimson Crown", "crimson-crown", "The house lane. Red neon crests over black lacquer.", 0],
    ["Blue Circuit", "blue-circuit", "Cool electric blue chevrons down a clean modern hall.", 0],
    ["Emerald Vault", "emerald-vault", "Deep green light in a quiet, locked-away room.", 0],
    ["Royal Gold", "royal-gold", "Violet velvet and a gilded crown above the pin deck.", 39],
    ["Sunset Strip", "sunset-strip", "Palms, magenta haze, and a synth sun that never sets.", 18],
    ["Neon Carnival", "neon-carnival", "Every colour at once, like a midway that took over the alley.", 18],
    ["Cosmic Bowl", "cosmic-bowl", "Blacklight planets and starfield walls over glowing gutters.", 21],
    ["Liberty Lanes", "liberty-lanes", "Stars, stripes, and a trophy case that remembers everything.", 38],
    ["Oak & Onyx", "oak-and-onyx", "Dark timber and low blue light in a members-only room.", 18],
  ].map(([name, slug, description, pinDeckOffsetY]) => Object.freeze({
    name,
    slug,
    description,
    pinDeckOffsetY,
    laneEdges: LANE_EDGES[slug],
    src: `assets/lanes/${slug}.webp`,
    thumbnailSrc: `assets/lanes/thumbs/${slug}.webp`,
    alt: `${name} bowling lane`,
  })));

  function getLane(slug) {
    return LANES.find((lane) => lane.slug === slug)
      || LANES.find((lane) => lane.slug === DEFAULT_LANE_SLUG);
  }

  // Online matches are dealt a lane by the Factory Network server, which sends an
  // opaque roll rather than a slug so it never has to carry this catalog. Both
  // clients run the same catalog, so the same roll seats them in the same house.
  function laneFromRoll(roll) {
    if (!Number.isInteger(roll) || roll < 0) return getLane(DEFAULT_LANE_SLUG);
    return LANES[roll % LANES.length];
  }

  function defaultStorage() {
    try {
      return root.localStorage;
    } catch (_error) {
      return null;
    }
  }

  function loadLaneSlug(storage = defaultStorage()) {
    try {
      return getLane(storage?.getItem(LANE_STORAGE_KEY)).slug;
    } catch (_error) {
      return DEFAULT_LANE_SLUG;
    }
  }

  function saveLaneSlug(slug, storage = defaultStorage()) {
    const normalizedSlug = getLane(slug).slug;
    try {
      storage?.setItem(LANE_STORAGE_KEY, normalizedSlug);
    } catch (_error) {
      // The choice still applies for this visit when storage is unavailable.
    }
    return normalizedSlug;
  }

  return {
    DEFAULT_LANE_SLUG,
    LANE_STORAGE_KEY,
    LANES,
    getLane,
    laneFromRoll,
    loadLaneSlug,
    saveLaneSlug,
  };
});
