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
  const EDGE_DEPTHS = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1];

  function measuredEdges(values) {
    return Object.freeze(values.map(([left, right], index) => Object.freeze({
      z: EDGE_DEPTHS[index], left, right,
    })));
  }

  // Inner edges of the painted gutters, measured directly from each 1024x1536
  // lane asset at the same depth samples used by the renderer. Keeping these
  // with the artwork prevents a generic perspective guess from drifting across
  // the wood, trough, and outer rail as the ball travels down-lane.
  const LANE_EDGES = Object.freeze({
    "crimson-crown": measuredEdges([[43, 979], [127, 895], [212, 811], [294, 727], [377, 645], [389, 634], [389, 634]]),
    "blue-circuit": measuredEdges([[40, 976], [124, 891], [209, 807], [292, 724], [376, 648], [389, 635], [389, 635]]),
    "emerald-vault": measuredEdges([[44, 978], [128, 895], [212, 810], [298, 726], [379, 645], [390, 634], [390, 634]]),
    "royal-gold": measuredEdges([[54, 963], [138, 879], [221, 797], [297, 721], [369, 651], [382, 636], [382, 636]]),
    "sunset-strip": measuredEdges([[53, 965], [138, 882], [223, 799], [303, 720], [381, 643], [391, 633], [391, 633]]),
    "neon-carnival": measuredEdges([[42, 975], [127, 890], [212, 805], [294, 723], [373, 645], [388, 631], [388, 631]]),
    "cosmic-bowl": measuredEdges([[45, 979], [131, 893], [217, 808], [298, 726], [379, 645], [390, 634], [390, 634]]),
    "liberty-lanes": measuredEdges([[54, 967], [138, 884], [222, 800], [300, 722], [376, 647], [390, 634], [390, 634]]),
    "oak-and-onyx": measuredEdges([[38, 979], [123, 895], [208, 809], [290, 726], [370, 648], [387, 633], [387, 633]]),
  });

  // Centers of the dark painted troughs. These are deliberately separate from
  // the board edges above: gutter width changes with perspective, so deriving a
  // center from the ball radius makes the ball cling to the wood down-lane.
  const GUTTER_CENTERS = Object.freeze({
    "crimson-crown": measuredEdges([[-98, 1118], [14, 1007], [126, 896], [238, 785], [347, 676], [382, 641], [389, 634]]),
    "blue-circuit": measuredEdges([[-80, 1095], [26, 990], [132, 885], [238, 780], [351, 672], [382, 642], [389, 635]]),
    "emerald-vault": measuredEdges([[-96, 1116], [15, 1006], [126, 896], [237, 786], [348, 676], [383, 641], [390, 634]]),
    "royal-gold": measuredEdges([[-32, 1048], [55, 962], [142, 876], [229, 790], [334, 686], [375, 643], [382, 636]]),
    "sunset-strip": measuredEdges([[-72, 1090], [34, 986], [140, 882], [246, 778], [350, 675], [384, 640], [391, 633]]),
    "neon-carnival": measuredEdges([[-95, 1111], [16, 1000], [127, 889], [238, 778], [342, 676], [381, 638], [388, 631]]),
    "cosmic-bowl": measuredEdges([[-77, 1107], [30, 998], [137, 889], [244, 780], [349, 676], [383, 641], [390, 634]]),
    "liberty-lanes": measuredEdges([[-56, 1078], [46, 976], [148, 874], [250, 772], [347, 677], [383, 641], [390, 634]]),
    "oak-and-onyx": measuredEdges([[-86, 1104], [19, 999], [124, 894], [229, 789], [338, 680], [380, 640], [387, 633]]),
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
    gutterCenters: GUTTER_CENTERS[slug],
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
