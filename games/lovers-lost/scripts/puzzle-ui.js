const MAIN_MENU_RECTS = Object.freeze({
  solo:   Object.freeze({ x: 300, y: 104, w: 360, h: 46 }),
  local:  Object.freeze({ x: 300, y: 158, w: 360, h: 46 }),
  online: Object.freeze({ x: 300, y: 212, w: 360, h: 46 }),
  puzzle: Object.freeze({ x: 300, y: 266, w: 360, h: 46 }),
  help:   Object.freeze({ x: 360, y: 328, w: 240, h: 40 }),
});

const PUZZLE_MENU_RECTS = Object.freeze({
  local:  Object.freeze({ x: 250, y: 330, w: 220, h: 54 }),
  online: Object.freeze({ x: 490, y: 330, w: 220, h: 54 }),
  back:  Object.freeze({ x: 380, y: 408, w: 200, h: 42 }),
});

const PUZZLE_LOCAL_RECTS = Object.freeze({
  solo:  Object.freeze({ x: 250, y: 330, w: 220, h: 54 }),
  local: Object.freeze({ x: 490, y: 330, w: 220, h: 54 }),
  back:  Object.freeze({ x: 380, y: 408, w: 200, h: 42 }),
});

const PUZZLE_PLAY_RECTS = Object.freeze({
  menu:  Object.freeze({ x: 746, y: 12, w: 94, h: 32 }),
  reset: Object.freeze({ x: 850, y: 12, w: 94, h: 32 }),
});

const PUZZLE_COMPLETE_RECTS = Object.freeze({
  retry: Object.freeze({ x: 270, y: 404, w: 200, h: 50 }),
  menu:  Object.freeze({ x: 490, y: 404, w: 200, h: 50 }),
});

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export {
  MAIN_MENU_RECTS,
  PUZZLE_MENU_RECTS,
  PUZZLE_LOCAL_RECTS,
  PUZZLE_PLAY_RECTS,
  PUZZLE_COMPLETE_RECTS,
  pointInRect,
};
