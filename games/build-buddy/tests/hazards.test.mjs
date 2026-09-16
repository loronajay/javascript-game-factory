import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStageBlueprint } from '../js/stages/stage-authoring.js';
import { spikeBall, deck, tool } from '../js/stages/course-helpers.js';
import { spikeBallCenter, spikeBallLane, updateMovingHazards, spikeBallHits } from '../js/hazards.js';
import { Runner } from '../js/runner.js';
import { ToolRegistry } from '../js/tools.js';
import { SafeStateSystem } from '../js/systems/safe-state-system.js';

function stageWithBall(ball = spikeBall('ball', 400, 1260, 800, 1260, { r: 28, period: 2 })) {
  return compileStageBlueprint({
    packId: 'pack_test',
    stageNumber: 1,
    width: 2000,
    height: 2000,
    start: { x: 100, y: 1240 },
    goal: { x: 1700, y: 1100, w: 100, h: 160 },
    route: [
      deck('floor', 0, 1300, 2000, 64),
      ball,
    ],
  });
}

test('a spike ball eases along its cable and back once per period', () => {
  const ball = spikeBall('b', 0, 0, 400, 300, { period: 4 });
  assert.deepEqual(spikeBallCenter(ball, 0), { x: 0, y: 0 });
  const mid = spikeBallCenter(ball, 1);
  assert.ok(Math.abs(mid.x - 200) < 1e-9 && Math.abs(mid.y - 150) < 1e-9);
  const far = spikeBallCenter(ball, 2);
  assert.ok(Math.abs(far.x - 400) < 1e-9 && Math.abs(far.y - 300) < 1e-9);
  const back = spikeBallCenter(ball, 4);
  assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.y) < 1e-9);
  // Eased: it is slower near the ends than in the middle.
  const nearEnd = spikeBallCenter(ball, 0.2).x;
  const nearMid = spikeBallCenter(ball, 1.2).x - spikeBallCenter(ball, 1).x;
  assert.ok(nearEnd < nearMid);
  // Phase starts the ball part-way round.
  const offset = spikeBall('c', 0, 0, 400, 0, { period: 4, phase: 0.5 });
  assert.ok(Math.abs(spikeBallCenter(offset, 0).x - 400) < 1e-9);
});

test('the lane is the swept bounding box including the radius, and it compiles onto the stage', () => {
  const stage = stageWithBall(spikeBall('ball', 400, 1200, 800, 1000, { r: 30 }));
  assert.equal(stage.movingHazards.length, 1);
  const [ball] = stage.movingHazards;
  assert.equal(ball.id, 'stage_01_ball');
  assert.deepEqual(ball.lane, spikeBallLane(ball));
  assert.deepEqual(ball.lane, { x: 370, y: 970, w: 460, h: 260 });
  assert.deepEqual({ cx: ball.cx, cy: ball.cy }, { cx: 400, cy: 1200 });
});

test('the Builder cannot place anything in a spike ball lane', () => {
  const stage = stageWithBall();
  const registry = new ToolRegistry(stage);
  const runner = new Runner(stage);
  const blocked = registry.add('platform', 520, 1240, runner);
  assert.equal(blocked.valid, false);
  assert.match(blocked.reason, /spike ball lane/);
  const above = registry.add('platform', 520, 1160, runner);
  assert.equal(above.valid, true);
});

test('the Runner dies when the ball reaches them and lives when it has passed', () => {
  const stage = stageWithBall();
  const registry = new ToolRegistry(stage);
  const runner = new Runner(stage);
  runner.x = 780;
  runner.y = 1300 - runner.h;
  runner.grounded = true;
  const input = { axisX: () => 0, upHeld: () => false, downHeld: () => false, jumpHeld: () => false, consumeJumpPressed: () => false, consumeReposition: () => false };
  // t=0: ball at x=400, well clear of a Runner at 780.
  updateMovingHazards(stage, 0);
  runner.update(1 / 60, input, registry);
  assert.equal(runner.dead, false);
  // t=1: ball at x=800, on top of the Runner's body.
  updateMovingHazards(stage, 1);
  runner.update(1 / 60, input, registry);
  assert.equal(runner.dead, true);
});

test('the kill circle is inset so a graze past the spike tips does not count', () => {
  const ball = { cx: 100, cy: 100, r: 28 };
  assert.equal(spikeBallHits(ball, { x: 124, y: 90, w: 20, h: 20 }), false);
  assert.equal(spikeBallHits(ball, { x: 118, y: 90, w: 20, h: 20 }), true);
});

test('a safe state inside a spike ball lane is never a reposition target', () => {
  const stage = stageWithBall();
  const registry = new ToolRegistry(stage);
  const runner = new Runner(stage);
  const safe = new SafeStateSystem(stage, runner);
  assert.equal(safe.isStateStillValid({ x: 600, y: 1300 - runner.h, supportId: 'stage_01_floor' }, registry), false);
  assert.equal(safe.isStateStillValid({ x: 1200, y: 1300 - runner.h, supportId: 'stage_01_floor' }, registry), true);
});

test('tool() and spikeBall() authoring stay plain data', () => {
  assert.deepEqual(tool('platform', 1, 2), { toolType: 'platform', x: 1, y: 2 });
  assert.deepEqual(spikeBall('b', 1, 2, 3, 4), { id: 'b', kind: 'spikeBall', from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, r: 28, period: 3, phase: 0 });
});
