export const DEMO_WORLD = Object.freeze({
  floorY: 690,
  blastLeft: -1120,
  blastRight: 1120,
  blastTop: 40,
  blastBottom: 1720,
});

export const DEMO_PLATFORM_STAGE = Object.freeze({
  main: Object.freeze({ id: 'main', x: -360, y: 690, w: 720, h: 46, kind: 'solid' }),
  platforms: Object.freeze([
    Object.freeze({ id: 'left-platform', x: -300, y: 535, w: 220, h: 18, kind: 'semisolid' }),
    Object.freeze({ id: 'right-platform', x: 80, y: 535, w: 220, h: 18, kind: 'semisolid' }),
    Object.freeze({ id: 'top-platform', x: -110, y: 415, w: 220, h: 18, kind: 'semisolid' }),
  ]),
  blastBounds: Object.freeze({
    left: DEMO_WORLD.blastLeft,
    right: DEMO_WORLD.blastRight,
    top: DEMO_WORLD.blastTop,
    bottom: DEMO_WORLD.blastBottom,
  }),
});

export function getStagePlatforms(stage = DEMO_PLATFORM_STAGE) {
  return [stage.main, ...(stage.platforms ?? [])];
}

export function getPlatformById(stage, platformId) {
  return getStagePlatforms(stage).find(platform => platform.id === platformId) ?? null;
}

export function getMainLedges(stage = DEMO_PLATFORM_STAGE) {
  return [
    { id: 'main-left', side: -1, x: stage.main.x, y: stage.main.y },
    { id: 'main-right', side: 1, x: stage.main.x + stage.main.w, y: stage.main.y },
  ];
}

export function clonePlatformStage(stage = DEMO_PLATFORM_STAGE) {
  return {
    main: { ...stage.main },
    platforms: (stage.platforms ?? []).map(platform => ({ ...platform })),
    blastBounds: { ...stage.blastBounds },
  };
}
