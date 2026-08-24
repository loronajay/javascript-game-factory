// Every tuned number the simulation runs on, in one place.
//
// These values are carried over unchanged from the approved prototype. The shot
// feel is the thing players judge this cabinet by, so treat this file as a
// calibration record rather than a set of knobs: changing a value here changes
// how the game plays, and `tests/golden-shot.test.js` exists to make that change
// visible instead of silent.
//
// Two coordinate systems meet in this cabinet and it is worth being explicit:
//
//   WORLD  — the pseudo-3D space the ball actually lives in. `x` runs right,
//            `y` runs up from the floor, `z` runs away from the camera toward
//            the wall. Units are arbitrary but consistent; the ball is
//            BALL_RADIUS_WORLD across and the backboard sits at z = BOARD_Z.
//   SCREEN — canvas pixels in a fixed CANVAS_WIDTH x CANVAS_HEIGHT space.
//
// `sim/projection.js` owns the mapping between them. Nothing else should do that
// arithmetic inline.

// --- Canvas -----------------------------------------------------------------
// The room backdrops are authored at exactly this size, so a backdrop draws 1:1
// with no resampling. Changing these means re-cutting the art.
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 760;

// --- Fixed timestep ---------------------------------------------------------
// Repo rule: game logic runs at 60 ticks/s regardless of display refresh rate.
export const TICK_MS = 1000 / 60;
export const TICK_SECONDS = TICK_MS / 1000;

// Each tick is integrated in smaller slices. The ball crosses the rim fast
// enough that a whole 1/60s step can tunnel straight through the ring; this is
// what stops a made basket from being decided by frame phase.
export const PHYSICS_SUBSTEP_SECONDS = 0.008;

// --- Projection -------------------------------------------------------------
// Screen position of the world origin, and how world units scale into pixels.
export const PROJECTION_ORIGIN_X = 480;
export const PROJECTION_X_SCALE = 390;
export const PROJECTION_Y_SCALE = 350;
// A ground-level point at z=0 sits on this scanline, rising toward the horizon
// as z grows. Together with DEPTH_FALLOFF this is the whole "3D" of the game.
export const FLOOR_SCREEN_Y = 710;
export const FLOOR_SCREEN_Y_PER_Z = 126;
export const DEPTH_FALLOFF = 1.05;

// Draw radius of the ball sprite at z = 0, and the floor it never shrinks past.
export const BALL_SCREEN_RADIUS = 29;
export const BALL_MIN_SCREEN_RADIUS = 12.5;

// --- World geometry ---------------------------------------------------------
export const FLOOR_Y = 0;
export const GRAVITY = 9.0;
export const BALL_RADIUS_WORLD = 0.078;
export const BOARD_Z = 1.0;
export const RIM_CENTER_Z = 0.75;
export const RIM_RADIUS_WORLD = 0.22;
export const RIM_TUBE_RADIUS = 0.026;

// --- Restitution ------------------------------------------------------------
export const RIM_RESTITUTION = 0.62;
export const BOARD_RESTITUTION = 0.68;
export const WALL_RESTITUTION = 0.3;
export const FLOOR_RESTITUTION = 0.43;
// How much tangential speed the rim scrubs off on contact. Low, but non-zero is
// what makes a rattle settle instead of pinballing forever.
export const RIM_FRICTION = 0.07;

// --- Hoop screen geometry ---------------------------------------------------
// The rest position the motion modes oscillate around.
export const HOOP_BASE_X = 480;
export const HOOP_BASE_RIM_Y = 222;
export const RIM_SCREEN_HALF_WIDTH = 42;
export const RIM_DRAW_RADIUS_X = 48;
export const RIM_DRAW_RADIUS_Y = 12;
export const BACKBOARD_WIDTH = 154;
export const BACKBOARD_HEIGHT = 98;
// Vertical gap from the rim up to the top edge of the backboard.
export const BACKBOARD_RISE = 104;

// --- Pull gesture -----------------------------------------------------------
// Pull distance in screen pixels. Below PULL_MIN the gesture is treated as a
// tap and nothing is fired; PULL_MAX is 100% power.
export const PULL_MIN = 10;
export const PULL_MAX = 105;
// The ball visually follows most, not all, of the finger travel. The remaining
// stretch is drawn as an elastic segment so the pull reads as tension rather
// than as the ball lagging behind the finger.
export const PULL_VISUAL_GAIN = 0.68;
// How far sideways the aim marker swings for a fully angled pull.
export const PULL_AIM_GAIN = 156;
// Lateral travel is allowed but clamped against backward travel, so the gesture
// always still reads as a pull *back* toward the player.
export const PULL_SIDE_LIMIT = 0.9;
// Even a pull with no backward travel allows a little sideways play, so the
// gesture does not lock up the instant a finger moves horizontally first.
export const PULL_MIN_SIDE = 9;
// Aim angle is read as sideways-over-backward. The floor on the backward term
// stops a barely-started pull from swinging the aim to full lock.
export const PULL_ANGLE_MIN_BACK = 42;
export const PULL_ANGLE_RATIO_LIMIT = 0.8;
// The aim marker cannot leave this horizontal band.
export const AIM_MIN_X = 320;
export const AIM_MAX_X = 640;
// Aim sits marginally below the rim line so a dead-centre shot descends into the
// ring rather than grazing its front edge.
export const AIM_RIM_Y_OFFSET = 2;

// --- Arc / loft -------------------------------------------------------------
// A straight backward pull gives the steepest arc; a lateral pull flattens it.
export const MIN_EXIT_VY = -1.15;
export const MAX_EXIT_VY = -2.05;
// The vertical-ness of the pull is remapped through this window into loft 0..1.
// Below LOFT_RATIO_FLOOR the pull counts as fully flat.
export const LOFT_RATIO_FLOOR = 0.72;
export const LOFT_RATIO_SPAN = 0.28;
// The pull length that counts as the calibrated reference shot. Velocity scales
// linearly against it, which is what makes the displayed power percentage honest.
export const REFERENCE_POWER = 0.8;

// A target at or below the launch point has no ballistic solution. This floor
// keeps the solver defined for a shot aimed absurdly low.
export const LAUNCH_MIN_RISE = 0.08;
// Guard on the depth term when estimating how long the ball takes to reach the
// rim plane, so a shot with almost no forward speed cannot divide by zero.
export const LAUNCH_MIN_DEPTH_SPEED = 0.01;

// --- Spin -------------------------------------------------------------------
// Backspin imparted at launch, as a fraction of the ball's forward roll rate.
export const LAUNCH_SPIN_BASE = 0.68;
export const LAUNCH_SPIN_PER_LOFT = 0.18;
export const SPIN_DECAY_PER_TICK = 0.9985;

// --- Shot resolution --------------------------------------------------------
// A shot is abandoned once it is clearly dead, so a timed run is never held
// hostage by a ball rolling around the floor.
export const SHOT_SETTLE_SECONDS = 0.48;
export const SHOT_MAX_SECONDS = 2.45;
// Two contacts closer together than this are one collision, not two, and only
// announce themselves once.
export const CONTACT_DEBOUNCE_SECONDS = 0.08;

// A ball that never got near the wall was thrown short, rather than simply
// missing — worth saying differently, because the fix is different.
export const SHORT_DEPTH_THRESHOLD = 0.48;
// A contacted ball heading back into the room below rim height can no longer
// recover into a score. These bounds decide when to call it, and they are
// deliberately generous so a bank or a rattle-in is never cut off early.
export const ABORT_DEPTH_SPEED = -0.08;
export const ABORT_DEPTH_MARGIN = 0.3;
export const ABORT_HEIGHT_MARGIN = 0.1;
// Past this depth the ball is behind the camera and out of play.
export const OUT_OF_PLAY_Z = -0.28;

// --- Scoring ----------------------------------------------------------------
export const POINTS_PER_BASKET = 2;
export const ON_FIRE_STREAK = 3;

// --- Round ------------------------------------------------------------------
export const ROUND_DURATIONS = Object.freeze([30, 60]);
export const DEFAULT_DURATION = 30;
export const LEADERBOARD_SIZE = 5;
