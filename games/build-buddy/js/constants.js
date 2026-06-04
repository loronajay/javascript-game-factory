export const VIEW = {
  width: 1280,
  height: 720,
};

export const PHYS = {
  gravity: 2300,
  maxFallSpeed: 1650,
  maxRunSpeed: 560,
  groundAccel: 1900,
  airAccel: 1050,
  groundFriction: 2100,
  brakeAccel: 3300,
  jumpVy: -880,
  shortHopCut: 0.48,
  maxJumpHold: 0.18,
  jumpHoldGravityScale: 0.44,
  doubleJumpVy: -720,
  climbSpeed: 220,
  climbJumpVy: -340,
  climbJumpVx: 340,
  safeStateInterval: 1.15,
};

export const RUNNER = {
  width: 34,
  height: 58,
  respawnDelay: 0.45,
};

export const GRID = {
  size: 40,
};

export const TOOL_DEFS = {
  platform: {
    label: 'Platform',
    color: '#8fd3ff',
    kind: 'platform',
    width: 160,
    height: 18,
    maxActive: 5,
  },
  springYellow: {
    label: 'Yellow Spring',
    color: '#ffd84a',
    kind: 'spring',
    width: 54,
    height: 28,
    bounceVy: -920,
    maxActive: 5,
  },
  springGreen: {
    label: 'Green Spring',
    color: '#58e06f',
    kind: 'spring',
    width: 54,
    height: 28,
    bounceVy: -1130,
    maxActive: 5,
  },
  springBlue: {
    label: 'Blue Spring',
    color: '#69a7ff',
    kind: 'spring',
    width: 54,
    height: 28,
    bounceVy: -1360,
    maxActive: 5,
  },
  checkpoint: {
    label: 'Checkpoint',
    color: '#ff79d8',
    kind: 'checkpoint',
    width: 44,
    height: 70,
    maxActive: 1,
  },
};
