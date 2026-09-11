import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner } from '../js/runner.js';
import { ToolRegistry } from '../js/tools.js';
import { getStageById } from '../js/stages/stage-registry.js';

for (const side of [-1, 1]) test(`grounded wall grab and full ascent from side ${side}`, () => {
  const stage = getStageById('pack_01_stage_01');
  const runner = new Runner(stage), registry = new ToolRegistry(stage);
  const wall = stage.climbables[0];
  runner.x = side < 0 ? wall.x - runner.w : wall.x + wall.w;
  runner.y = wall.y + wall.h - runner.h;
  runner.grounded = true;
  const input = { axisX: () => 0, upHeld: () => true, downHeld: () => false, jumpHeld: () => false, consumeJumpPressed: () => false, consumeReposition: () => false };
  runner.update(1 / 60, input, registry);
  assert.equal(runner.climbing, true);
  assert.equal(runner.grounded, false);
  for (let i = 0; i < 360 && runner.climbing; i++) runner.update(1 / 60, input, registry);
  assert.equal(runner.grounded, true);
  assert.equal(runner.y, wall.topStand.y - runner.h);
  assert.equal(runner.dead, false);
});
