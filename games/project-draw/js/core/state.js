export function createState() {
  const world = {
    width: 1800,
    height: 1350,
    floorColor: '#1f2937'
  };

  const player = {
    x: world.width / 2,
    y: world.height / 2,
    width: 50,
    height: 78,
    speed: 185,
    facingX: 0,
    facingY: 1,
    facingName: 'down',
    drawing: false,
    activeStroke: null,
    drawCursorX: null,
    drawCursorY: null,
    prevX: world.width / 2,
    prevY: world.height / 2,
    sprayAccumulator: 0
  };

  return {
    world,
    player,
    camera: { x: 0, y: 0 },
    drawing: {
      strokes: [],
      color: '#ecf1ff',
      smooth: false,
      activeTool: 'pencil'
    },
    input: {
      keys: new Set(),
      stickX: 0,
      stickY: 0,
      activePointerId: null,
      drawPointerId: null
    },
    fullView: false,
    selectedFloorPreset: 'slate'
  };
}
