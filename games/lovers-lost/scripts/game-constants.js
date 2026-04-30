const HARD_CUTOFF_FRAMES    = 90 * 60;  // 5400 frames
const END_PHASE_HOLD_FRAMES = 480;      // 8 seconds (5s walk + 3s heart)
const JUMP_VY               = 8;        // pixels/frame initial upward velocity
const JUMP_GRAVITY          = 0.5;      // pixels/frame² downward acceleration

const SPIKE_WIDTH_PX        = 36;
const SPIKE_TRI_WIDTH_PX    = 12;
const SPIKE_HEIGHT_PX       = 20;
const BOY_CONTACT_REL_PX    = 42;
const GIRL_CONTACT_REL_PX   = 6;
const SPIKE_RESOLVE_ACTION  = 'spikes';
const BIRD_RESOLVE_ACTION   = 'bird';
const ARROWWALL_RESOLVE_ACTION = 'arrowwall';
const GOBLIN_RESOLVE_ACTION = 'goblin';

const PLAYER_BOX_TOP_PX     = 6;
const PLAYER_BOX_BOTTOM_PX  = 47;
const GIRL_VISIBLE_LEFT_PX  = 6;
const GIRL_VISIBLE_RIGHT_PX = 35;
const CROUCH_Y_OFFSET_PX    = 24;
const CROUCH_SCALE          = 0.5;
const JUMP_BOTTOM_PROFILE   = [
  null, null, null, null,
  8, 15, 15, 15, 15, 15, 15, 13, 12, 9,
  null, null,
];
const PLAYER_VISIBLE_LEFT_PX  = 12;
const PLAYER_VISIBLE_RIGHT_PX = 41;
const PLAYER_RENDER_Y         = 412;

export {
  HARD_CUTOFF_FRAMES,
  END_PHASE_HOLD_FRAMES,
  JUMP_VY,
  JUMP_GRAVITY,
  SPIKE_WIDTH_PX,
  SPIKE_TRI_WIDTH_PX,
  SPIKE_HEIGHT_PX,
  BOY_CONTACT_REL_PX,
  GIRL_CONTACT_REL_PX,
  SPIKE_RESOLVE_ACTION,
  BIRD_RESOLVE_ACTION,
  ARROWWALL_RESOLVE_ACTION,
  GOBLIN_RESOLVE_ACTION,
  PLAYER_BOX_TOP_PX,
  PLAYER_BOX_BOTTOM_PX,
  GIRL_VISIBLE_LEFT_PX,
  GIRL_VISIBLE_RIGHT_PX,
  CROUCH_Y_OFFSET_PX,
  CROUCH_SCALE,
  JUMP_BOTTOM_PROFILE,
  PLAYER_VISIBLE_LEFT_PX,
  PLAYER_VISIBLE_RIGHT_PX,
  PLAYER_RENDER_Y,
};
