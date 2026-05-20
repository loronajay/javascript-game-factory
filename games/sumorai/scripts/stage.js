// World coordinate system: origin top-left, y increases downward.
// Scratch stage was 480x360 with center origin y-up; we translate to y-down top-left.
// All values are in world units (1 unit ≈ 1 Scratch pixel).

const VIEWPORT_W = 640;
const VIEWPORT_H = 360;

// Player sprite dimensions at Scratch's 250% size
const PLAYER_SCALE = 2.5;
const PLAYER_W = Math.round(15.33 * PLAYER_SCALE);  // 38
const PLAYER_H = Math.round(21.61 * PLAYER_SCALE);  // 54

// Floor: y of the walkable surface (player feet rest here)
// bridge.png is 1062×73; drawn at VIEWPORT_W=640 → height = 73*640/1062 ≈ 44px
// FLOOR_DRAW_Y = top edge of bridge graphic
// FLOOR_Y = where characters physically stand — inside the bridge, below the top rail
const FLOOR_DRAW_Y = 316;   // top of bridge graphic (y = 360 - 44)
const FLOOR_H      = 44;    // bridge drawn height in world units
const FLOOR_Y      = 334;   // stand surface: ~18px below top rail into the plank zone
const FLOOR_LEFT   = -34;   // bridge left edge (~707px wide centered at 320)
const FLOOR_RIGHT  = 674;   // bridge right edge

// Platform layouts are defined in scripts/platforms.js (data-driven, multi-platform).

// Blast zones: well past bridge edges so players can walk/fly off before dying
const BLAST_LEFT   = -250;
const BLAST_RIGHT  = 900;
const BLAST_BOTTOM = 500;
const BLAST_TOP    = -200;

// Spawn positions (player center x, feet y) — inside the visible bridge
const P1_SPAWN_X   = 180;
const P2_SPAWN_X   = 460;
const SPAWN_FEET_Y = FLOOR_Y;

// Physics constants (from original Scratch project)
const GRAVITY    =  1;
const MOVESPEED  =  1.2;
const FRICTION   =  0.8;
const JUMP_FORCE = -15;   // negative = upward; needs ~15 to clear the 75px gap to platform

export {
  VIEWPORT_W, VIEWPORT_H,
  PLAYER_SCALE, PLAYER_W, PLAYER_H,
  FLOOR_Y, FLOOR_DRAW_Y, FLOOR_H, FLOOR_LEFT, FLOOR_RIGHT,
  BLAST_LEFT, BLAST_RIGHT, BLAST_BOTTOM, BLAST_TOP,
  P1_SPAWN_X, P2_SPAWN_X, SPAWN_FEET_Y,
  GRAVITY, MOVESPEED, FRICTION, JUMP_FORCE,
};
