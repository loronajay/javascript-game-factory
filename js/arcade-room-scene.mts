export const PLAYER_ROOM_SHELL = Object.freeze({
  width: 20,
  depth: 20,
  height: 4.8,
  wallThickness: 0.24,
  faces: Object.freeze(["north", "south", "east", "west", "ceiling"] as const),
});

export const BIRD_DUTY_CABINET_ART = Object.freeze({
  keyArt: "../grid-previews/bird-duty.png",
  sideArt: "../room/assets/cabinets/bird-duty-side-panel.png",
  marqueeLogo: "../games/bird-duty/assets/scratch/9975cce3f6a8bdf643c205b1bab14fce.svg",
  titleFont: "../games/bird-duty/assets/scratch/703ed40436eb83edf9d93fd02a70a6a2.ttf",
  birdSprite: "../games/bird-duty/assets/scratch/pngs/white1.png",
});

export const LOVERS_LOST_CABINET_ART = Object.freeze({
  keyArt: "../grid-previews/lovers-lost.png",
  sideArt: "../room/assets/cabinets/lovers-lost-side-panel.png",
  boySprite: "../games/lovers-lost/images/boy.png",
  girlSprite: "../games/lovers-lost/images/girl.png",
  heartSprite: "../games/lovers-lost/images/red1.png",
  spriteSheet: Object.freeze({ frameWidth: 16, frameHeight: 16, frameCount: 6 }),
});

export const CABINET_CONTROL_SURFACE = Object.freeze({
  tiltRadians: -0.105,
  buttonAxis: "panel-normal" as const,
  // Keep the playable edge close to the body. Deep, over-wide boxes read as
  // disconnected bars when a cabinet is viewed from the side.
  singleDeck: Object.freeze({ width: 0.82, depth: 0.3, centerZ: 0.285, faceZ: 0.43 }),
  dualDeck: Object.freeze({ width: 0.88, depth: 0.32, centerZ: 0.295, faceZ: 0.45 }),
  joystick: Object.freeze({
    shaftY: 1.165,
    shaftHeight: 0.09,
    ballY: 1.215,
    ballRadius: 0.05,
  }),
});

export const CABINET_PLAY_VIEW = Object.freeze({
  position: Object.freeze({ x: 0, y: 1.49, z: 1.52 }),
  fov: 34,
  screen: Object.freeze({ width: 0.625, height: 0.42, y: 1.49, z: 0.255 }),
  gameAspect: 666 / 368,
});

export const LOVERS_LOST_PLAY_VIEW = Object.freeze({
  position: Object.freeze({ x: 0, y: 1.49, z: 1.52 }),
  fov: 34,
  screen: Object.freeze({ width: 0.68, height: 0.3825, y: 1.5, z: 0.285 }),
  gameAspect: 16 / 9,
});
