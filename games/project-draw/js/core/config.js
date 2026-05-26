export const CAMERA_LERP = 0.18;
export const DRAW_AXIS_SNAP_PRIMARY = 0.68;
export const DRAW_AXIS_SNAP_SECONDARY = 0.34;

export const SIZE_PRESETS = {
  small: { width: 1200, height: 900 },
  medium: { width: 1800, height: 1350 },
  large: { width: 2400, height: 1800 }
};

export const FLOOR_PRESETS = {
  slate: '#1f2937',
  paper: '#dde5f0',
  concrete: '#6b7280',
  grass: '#4d7c0f',
  sand: '#b78339'
};

export const TOOL_CONFIG = {
  pencil: {
    kind: 'path',
    width: 5,
    cursor: 8,
    snap: true,
    alpha: 1,
    smoothable: true
  },
  brush: {
    kind: 'path',
    width: 10,
    cursor: 11,
    snap: false,
    alpha: 0.95,
    smoothable: true
  },
  spray: {
    kind: 'spray',
    cursor: 18,
    snap: false,
    alpha: 0.18,
    radius: 18,
    stampInterval: 0.012,
    stampsPerBurst: 4,
    softness: 0.72
  },
  eraser: {
    kind: 'eraser',
    cursor: 18,
    snap: false,
    radius: 20
  }
};
