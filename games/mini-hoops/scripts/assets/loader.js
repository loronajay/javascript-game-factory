// Image loading and caching.
//
// Deliberately NON-BLOCKING. There is no loading screen: `image()` hands back an
// `Image` immediately and starts fetching it, and every draw call already checks
// `complete && naturalWidth` and falls back to a painted placeholder. So the game
// is playable on the first frame and the art fades in as it arrives.
//
// That matters here more than it sounds: the eight rooms and four balls together
// are several megabytes, and a player who only ever picks the bedroom should
// never wait on the warehouse.
//
// `onLoad` exists because the menu and the paused game are static — they draw
// once and stop, so they need to be told to redraw when a late image lands.

import { ballFramePaths, ballSplatPaths } from "./ball-catalog.js";
import { locationBackdropPath } from "./location-catalog.js";

export function createAssetLibrary({ onLoad = () => {} } = {}) {
  const cache = new Map();

  /** The image for a path, fetched on first request and cached after. */
  function image(path) {
    const cached = cache.get(path);
    if (cached) return cached;

    const img = new Image();
    // Decoding off the main thread keeps a late 512px frame from hitching the
    // loop when it lands mid-shot.
    img.decoding = "async";
    img.addEventListener("load", () => onLoad(path));
    // A failed image is left in the cache as a permanently-incomplete Image, so
    // the draw guards keep using the placeholder rather than retrying forever.
    img.addEventListener("error", () => onLoad(path));
    img.src = path;
    cache.set(path, img);
    return img;
  }

  return {
    image,

    /** The backdrop for a room. */
    backdrop(locationId) {
      return image(locationBackdropPath(locationId));
    },

    /** Every roll frame for a ball, in order. */
    ballFrames(ballId) {
      return ballFramePaths(ballId).map(image);
    },

    /**
     * The two decals a splatting ball leaves, or null for a ball that survives.
     *
     * Null rather than a pair of broken images: most balls never
     * splat, and asking the browser for art that does not exist would put a 404
     * in the console on every run with a basketball.
     */
    ballSplats(ballId) {
      const paths = ballSplatPaths(ballId);
      if (!paths) return null;
      return { wall: image(paths.wall), ground: image(paths.ground) };
    },

    /**
     * Start fetching something the player is about to need.
     *
     * Fire-and-forget: warming the next room while they are still on the setup
     * screen is worth doing, but nothing should ever wait on it.
     */
    warm(paths) {
      for (const path of paths) image(path);
    },
  };
}
