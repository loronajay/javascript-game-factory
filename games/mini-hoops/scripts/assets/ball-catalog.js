// The registry of throwable balls.
//
// Adding a ball should be a data change, never a code change: drop its frames in
// `assets/balls/<id>/roll-NN.png`, add a row here, and the setup screen, the
// preloader, the renderer and the roll animation all pick it up. Nothing outside
// this file may assume how many frames a ball has — the basketball has 12 and the
// paper wad has 8, and a future ball will have some third number.
//
// FRAME COUNT IS LOAD-BEARING, not decoration. The renderer does not tick an
// animation timer; it derives the frame from the ball's real angular position, so
// one full 2*PI rotation advances exactly `frameCount` frames. Declare the wrong
// count and the ball visibly slips against its own roll.
//
// BALLS ARE COSMETIC ONLY, and that is a constraint rather than a shrug: a
// leaderboard entry is keyed on hoop mode and round length, not on ball. The
// moment a ball changed mass, bounce or size it would make those boards
// meaningless — a paper-wad 40 and a basketball 40 would no longer be the same
// achievement. If a ball should ever play differently, it has to become part of
// the board key first. See `store/boards.js`.
//
// The snowball SPLATS, and that constraint is exactly why it splats where it
// does. See SPLAT_SURFACES below: the two surfaces it bursts on are the two a
// shot is already dead on, so nothing it does can turn a miss into a make or a
// make into a miss. It does not even end the shot sooner — `sim/physics.js`
// refuses to report a splatted ball as settled, because a ball whose misses
// finished early would fit more shots into a 30-second round.

/** Where a ball's frames live, relative to the cabinet root. */
const BALL_ASSET_ROOT = "assets/balls";

/** Authored size of every roll frame and splat decal, in pixels. `tools/resize-ball-frames.mjs` enforces it. */
export const BALL_FRAME_SIZE = 512;

/**
 * The surfaces a splatting ball is destroyed by.
 *
 * DELIBERATELY GLOBAL, and deliberately short. This list is the whole reason a
 * ball that splats is still cosmetic, so it is not a per-ball knob: bare wall
 * and floor are the two contacts a shot is ALREADY dead on — `sim/shot.js`
 * calls the miss the instant either happens, because there is no route back
 * through the hoop from either one. The rim and the backboard are pointedly
 * absent. A snowball that burst on the rim would lose every rattle-in, and one
 * that burst on the board would lose the bank-in, and both of those are
 * outcomes — which would make a snowball 40 and a basketball 40 different
 * achievements on a board keyed only on `mode:duration`.
 *
 * Adding a surface here is therefore not a cosmetic change. See CLAUDE.md.
 */
export const SPLAT_SURFACES = Object.freeze(["wall", "floor"]);

export const BALLS = Object.freeze([
  Object.freeze({
    id: "basketball",
    label: "Basketball",
    blurb: "The house ball. Twelve frames of honest orange leather.",
    frameCount: 12,
  }),
  Object.freeze({
    id: "paper",
    label: "Paper Wad",
    blurb: "Yesterday's memo, balled up and ready for the bin.",
    frameCount: 8,
  }),
  Object.freeze({
    id: "snowball",
    label: "Snowball",
    blurb: "Packed hard, indoors, against all advice.",
    frameCount: 8,
    // A ball that does not survive its own landing. Presence of this block is
    // what makes it splat; the fields are only how the splat LOOKS. Which
    // surfaces end it is SPLAT_SURFACES above, and is not negotiable per ball.
    splat: Object.freeze({
      // Thrown-off powder at the moment of impact.
      color: "#eef5ff",
      // How wide the decal sits, in ball diameters — before the projection
      // shrinks it for depth, which it does the same way it shrinks the ball.
      scale: 2.7,
    }),
  }),
]);

export const DEFAULT_BALL = "basketball";

export function ballIds() {
  return BALLS.map((ball) => ball.id);
}

/** Resolve a ball id, falling back to the default rather than throwing. */
export function ballById(id) {
  return BALLS.find((ball) => ball.id === id) || BALLS.find((ball) => ball.id === DEFAULT_BALL);
}

/** The frame filenames for a ball, in roll order. */
export function ballFramePaths(id) {
  const ball = ballById(id);
  return Array.from(
    { length: ball.frameCount },
    (_, index) => `${BALL_ASSET_ROOT}/${ball.id}/roll-${String(index).padStart(2, "0")}.png`,
  );
}

/**
 * Which frame to draw for a given roll phase.
 *
 * `rollPhase` is a continuous frame position accumulated from angular velocity,
 * so it is fractional and it goes negative whenever the ball rolls backward —
 * a plain `%` would return a negative index for exactly that case.
 */
export function ballFrameIndex(id, rollPhase) {
  const { frameCount } = ballById(id);
  if (!Number.isFinite(rollPhase)) return 0;
  const index = Math.floor(rollPhase) % frameCount;
  return index < 0 ? index + frameCount : index;
}

/**
 * The splat cosmetics for a ball, or null if it survives its landings.
 *
 * Callers test this for truthiness to know whether a ball splats at all, so it
 * returns null rather than an empty object — "this ball is fragile" and "this
 * ball is fragile in no particular way" are not the same statement.
 */
export function ballSplat(id) {
  return ballById(id).splat || null;
}

/** Whether this ball is destroyed by a contact with `surface`. */
export function ballSplatsOn(id, surface) {
  return Boolean(ballById(id).splat) && SPLAT_SURFACES.includes(surface);
}

/**
 * The two decals a splatting ball leaves behind, or null.
 *
 * Same convention as the roll frames: art at a known path under the ball's own
 * folder, so adding a fragile ball stays a data change.
 */
export function ballSplatPaths(id) {
  const ball = ballById(id);
  if (!ball.splat) return null;
  return Object.freeze({
    wall: `${BALL_ASSET_ROOT}/${ball.id}/splat-wall.png`,
    ground: `${BALL_ASSET_ROOT}/${ball.id}/splat-ground.png`,
  });
}

/**
 * How much roll phase one radian of rotation is worth for this ball.
 *
 * This is the whole reason frame count cannot be a global: the physics reports
 * radians, and each ball converts them into its own frame space.
 */
export function rollPhasePerRadian(id) {
  return ballById(id).frameCount / (Math.PI * 2);
}
