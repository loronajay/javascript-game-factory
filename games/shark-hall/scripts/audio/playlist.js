// The running order.
//
// Pure: an array and a cursor, no element and no clock, so the ordering rules
// can be tested exactly rather than listened to.
//
// THE ORDER IS DRAWN ONCE PER BOOT. Shuffled when the cabinet starts and then
// left alone — the player hears the tracks in one random sequence, and when
// the last one ends the cursor wraps to the FIRST TRACK OF THAT SEQUENCE rather
// than to a fresh shuffle. That is what makes it a playlist instead of a random
// jukebox: the second time through is the same album, so a track cannot repeat
// back-to-back across the wrap and nothing can be heard twice before everything
// has been heard once.
//
// The shuffle is Fisher-Yates, which is the only shuffle that is actually
// uniform; `sort(() => Math.random() - 0.5)` is not, and biases short lists
// hard enough to notice with a handful of tracks.

/**
 * A uniformly shuffled copy.
 *
 * @param ids    the order to draw from; not mutated
 * @param random a 0..1 source, injectable so the tests can be deterministic
 */
export function shuffle(ids, random = Math.random) {
  const order = [...ids];
  for (let at = order.length - 1; at > 0; at--) {
    const swap = Math.floor(random() * (at + 1));
    [order[at], order[swap]] = [order[swap], order[at]];
  }
  return order;
}

/**
 * A cursor over a shuffled order that wraps at the end.
 *
 * Empty is a legitimate state — a cabinet with no soundtrack should be quiet,
 * not broken — so `current()` returns null and `advance()` keeps returning null
 * rather than dividing by a length of zero.
 */
export function createPlaylist({ ids = [], random = Math.random } = {}) {
  const order = shuffle(ids, random);
  let at = 0;

  return {
    /** The whole running order, for anything that wants to show or check it. */
    order: () => [...order],

    /** The track that should be playing, or null if there are none. */
    current() {
      return order.length ? order[at] : null;
    },

    /** Move to the next track, wrapping to the top of the same order. Returns it. */
    advance() {
      if (!order.length) return null;
      at = (at + 1) % order.length;
      return order[at];
    },
  };
}
