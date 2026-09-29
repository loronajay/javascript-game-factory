// Authored puzzle content. The simulation consumes this data without knowing
// which pack or stage it came from, so future packs remain content additions.

const FLOOR_Y = 442;

const FIRST_STEPS = Object.freeze({
  id: 'first-steps',
  number: 1,
  title: 'First Steps',
  description: 'Learn to open the way for each other.',
  stages: Object.freeze([
    Object.freeze({
      id: 'the-handoff',
      packId: 'first-steps',
      number: 1,
      title: 'The Handoff',
      subtitle: 'No one gets out alone.',
      parFrames: 75 * 60,
      minimumClearFrames: 8 * 60,
      player: Object.freeze({ width: 28, height: 44, speed: 3.2, jumpSpeed: 10.5, gravity: 0.62 }),
      starts: Object.freeze({
        boy: Object.freeze({ x: 34, y: FLOOR_Y - 44 }),
        girl: Object.freeze({ x: 34, y: FLOOR_Y - 44 }),
      }),
      signals: Object.freeze({
        'girl-opens-boy': Object.freeze({ name: 'CYAN', color: '#43d9ff' }),
        'boy-opens-girl': Object.freeze({ name: 'GOLD', color: '#ffd166' }),
        'girl-opens-exit': Object.freeze({ name: 'PINK', color: '#ff5ca8' }),
      }),
      solids: Object.freeze({
        boy: Object.freeze([
          Object.freeze({ id: 'boy-floor', x: 0, y: FLOOR_Y, w: 480, h: 98 }),
          Object.freeze({ id: 'boy-crate', x: 104, y: FLOOR_Y - 32, w: 34, h: 32 }),
          Object.freeze({ id: 'boy-ledge', x: 274, y: FLOOR_Y - 82, w: 66, h: 14 }),
        ]),
        girl: Object.freeze([
          Object.freeze({ id: 'girl-floor', x: 0, y: FLOOR_Y, w: 480, h: 98 }),
          Object.freeze({ id: 'girl-step-one', x: 112, y: FLOOR_Y - 24, w: 38, h: 24 }),
          Object.freeze({ id: 'girl-step-two', x: 150, y: FLOOR_Y - 48, w: 38, h: 48 }),
          Object.freeze({ id: 'girl-ledge', x: 282, y: FLOOR_Y - 72, w: 58, h: 12 }),
        ]),
      }),
      switches: Object.freeze([
        Object.freeze({ id: 'girl-opens-boy', side: 'girl', x: 66, y: FLOOR_Y - 5, w: 54, h: 5 }),
        Object.freeze({ id: 'boy-opens-girl', side: 'boy', x: 248, y: FLOOR_Y - 5, w: 56, h: 5 }),
        Object.freeze({ id: 'girl-opens-exit', side: 'girl', x: 318, y: FLOOR_Y - 5, w: 56, h: 5 }),
      ]),
      gates: Object.freeze([
        Object.freeze({ id: 'boy-first-gate', side: 'boy', x: 174, y: 304, w: 18, h: FLOOR_Y - 304, switchId: 'girl-opens-boy' }),
        Object.freeze({ id: 'girl-first-gate', side: 'girl', x: 218, y: 304, w: 18, h: FLOOR_Y - 304, switchId: 'boy-opens-girl' }),
        Object.freeze({ id: 'boy-exit-gate', side: 'boy', x: 362, y: 280, w: 18, h: FLOOR_Y - 280, switchId: 'girl-opens-exit' }),
      ]),
      exits: Object.freeze({
        boy: Object.freeze({ x: 405, y: FLOOR_Y - 60, w: 48, h: 60 }),
        girl: Object.freeze({ x: 405, y: FLOOR_Y - 60, w: 48, h: 60 }),
      }),
      hints: Object.freeze([
        'GIRL: stand on CYAN to open the matching wall.',
        'BOY: cross, then hold GOLD for Girl.',
        'GIRL: reach PINK. Both lovers must enter their exits.',
      ]),
    }),
  ]),
});

const PUZZLE_PACKS = Object.freeze([FIRST_STEPS]);

function getPuzzlePack(packId) {
  return PUZZLE_PACKS.find(pack => pack.id === packId) || null;
}

function getPuzzleStage(packId, stageId) {
  return getPuzzlePack(packId)?.stages.find(stage => stage.id === stageId) || null;
}

export { FLOOR_Y, PUZZLE_PACKS, getPuzzlePack, getPuzzleStage };
