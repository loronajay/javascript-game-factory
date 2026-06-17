import { FIGHTER_ARCHETYPES } from '../characters/archetypes.js';
import { getActiveHitbubbles, resolveCombat } from '../engine/combat.js';
import { createFighter, tickFighterState } from '../engine/fighter-state.js';
import { createInputBuffer, normalizeInputFrame } from '../engine/input-buffer.js';
import { applyFighterPhysics, integrateFighter, resolveStageCollision } from '../engine/physics.js';
import { clonePlatformStage } from '../engine/platform-stage.js';

export function createTrainingMatch({
  p1Archetype = FIGHTER_ARCHETYPES.falcon,
  p2Archetype = FIGHTER_ARCHETYPES.falcon,
} = {}) {
  const stage = clonePlatformStage();
  const fighters = {
    p1: createFighter({ id: 'p1', archetype: p1Archetype, position: { x: -210, y: stage.main.y }, facing: 1 }),
    p2: createFighter({ id: 'p2', archetype: p2Archetype, position: { x: 210, y: stage.main.y }, facing: -1 }),
  };
  fighters.p1.groundPlatformId = stage.main.id;
  fighters.p1.groundPlatformKind = stage.main.kind;
  fighters.p2.groundPlatformId = stage.main.id;
  fighters.p2.groundPlatformKind = stage.main.kind;
  const input = {
    p1: createInputBuffer(),
    p2: createInputBuffer(),
  };
  let lastHits = [];
  let hitDisplayFrames = 0;
  let debugHitbubbles = [];
  let debugHitbubbleFrames = 0;

  function tick() {
    for (const side of ['p1', 'p2']) {
      const fighter = fighters[side];
      const frame = input[side].current ?? normalizeInputFrame();
      tickFighterState(fighter, input[side]);
      applyFighterPhysics(fighter, frame, input[side]);
      integrateFighter(fighter);
      resolveStageCollision(fighter, stage, frame);
    }
    const activeHitbubbles = [
      ...getActiveHitbubbles(fighters.p1),
      ...getActiveHitbubbles(fighters.p2),
    ];
    if (activeHitbubbles.length > 0) {
      debugHitbubbles = activeHitbubbles;
      debugHitbubbleFrames = 10;
    } else if (debugHitbubbleFrames > 0) {
      debugHitbubbleFrames -= 1;
    } else {
      debugHitbubbles = [];
    }

    const hits = resolveCombat([fighters.p1, fighters.p2]);
    if (hits.length > 0) {
      lastHits = hits;
      hitDisplayFrames = 8;
    } else if (hitDisplayFrames > 0) {
      hitDisplayFrames -= 1;
    } else {
      lastHits = [];
    }
  }

  return {
    fighters,
    input,
    get lastHits() {
      return lastHits;
    },
    get debugHitbubbles() {
      return debugHitbubbles;
    },
    stage,
    tick,
  };
}
