export const MENU_BIRD_FRAME_FILES = Object.freeze([
  "assets/scratch/pngs/white1.png",
  "assets/scratch/pngs/white2.png",
  "assets/scratch/pngs/white3.png",
]);

export const MENU_BIRD_FRAME_TICKS = 10;

export const MENU_BIRD_PLACEMENTS = Object.freeze([
  {
    id: "left",
    x: -195,
    y: -35,
    size: 250,
    mirrored: false,
  },
  {
    id: "right",
    x: 195,
    y: -35,
    size: 250,
    mirrored: true,
  },
]);

export function getMenuBirdFrameIndex(tick, frameCount = MENU_BIRD_FRAME_FILES.length) {
  const safeFrameCount = Math.max(1, frameCount | 0);
  const safeTick = Math.max(0, tick | 0);
  return Math.floor(safeTick / MENU_BIRD_FRAME_TICKS) % safeFrameCount;
}

export function advanceMenuBirdState(state = {}) {
  return {
    tick: Math.max(0, state.tick | 0) + 1,
  };
}
