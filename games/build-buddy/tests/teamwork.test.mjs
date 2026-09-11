import test from 'node:test';
import assert from 'node:assert/strict';
import { getStageById, getStageSequence } from '../js/stages/stage-registry.js';
import { PHYS, RUNNER } from '../js/constants.js';
import { Runner } from '../js/runner.js';
import { ToolRegistry } from '../js/tools.js';

// Deliberately generous upper bounds: full hold, apex double jump, max horizontal
// speed from takeoff. Overestimating reach catches shortcuts rather than hiding them.
const hold = PHYS.maxJumpHold + 1 / 60;
const velocity = -PHYS.jumpVy;
const heldGravity = PHYS.gravity * PHYS.jumpHoldGravityScale;
const rise = velocity * hold - heldGravity * hold ** 2 / 2
  + (velocity - heldGravity * hold) ** 2 / (2 * PHYS.gravity)
  + PHYS.doubleJumpVy ** 2 / (2 * PHYS.gravity) + 20;
const ascent = hold + (velocity - heldGravity * hold) / PHYS.gravity
  - PHYS.doubleJumpVy / PHYS.gravity;

function couldReach(a, b) {
  const dy = a.y - b.y;
  if (dy > rise) return false;
  const gap = Math.max(0, b.x - a.x - a.w, a.x - b.x - b.w);
  return gap <= PHYS.maxRunSpeed * (ascent + Math.sqrt(2 * (rise - dy) / PHYS.gravity)) + RUNNER.width;
}

for (const id of getStageSequence()) {
  test(`${id}: no terrain-only route to the goal, including recovery ledges`, () => {
    const stage = getStageById(id);
    const floors = [...stage.solids.filter(s => s.x >= 0), ...stage.oneWays,
      ...stage.climbables.map(w => w.topStand).filter(Boolean)];
    const reachable = new Set(floors.filter(s => stage.start.x >= s.x && stage.start.x < s.x + s.w
      && Math.abs(s.y - stage.start.y - RUNNER.height) < 10));
    for (let changed = true; changed;) {
      changed = false;
      for (const a of reachable) for (const b of floors) {
        if (!reachable.has(b) && (couldReach(a, b) || stage.climbables.some(w => w.topStand.id === b.id && couldReach(a, { x: w.x, y: w.y + w.h, w: w.w, h: 1 })))) { reachable.add(b); changed = true; }
      }
    }
    // Include jumping into the trigger without landing on its supporting deck.
    const trigger = { ...stage.goal, y: stage.goal.y + stage.goal.h + RUNNER.height };
    assert.ok(![...reachable].some(s => couldReach(s, trigger)), 'Runner can reach goal without Builder');
    assert.ok(!stage.routeSigns?.length, 'No solution signs');
    assert.ok(stage.climbables.length > 0, 'Climbing must be part of each course');
  });
}

test('held jump plus double jump stays below mandatory 480px lifts', () => {
  const stage = getStageById(getStageSequence()[0]);
  const runner = new Runner(stage);
  runner.grounded = true;
  const y = runner.y;
  let highest = y;
  let doubled = false;
  for (let tick = 0; tick < 150; tick++) {
    const double = tick > 0 && runner.vy >= 0 && !doubled;
    if (double) doubled = true;
    runner.updateNormal(1 / 60, { axisX: () => 0 }, tick === 0 || double, true);
    highest = Math.min(highest, runner.y);
  }
  assert.ok(y - highest < 400);
});

function flyTo(stage, registry, from, to, spring = false) {
  const runner = new Runner(stage);
  const dir = Math.sign(to.x + to.w / 2 - from.x - from.w / 2);
  runner.x = spring ? from.x + 10 : dir > 0 ? from.x + from.w - 42 : from.x + 8;
  runner.y = from.y - runner.h - (spring ? 1 : 0);
  runner.grounded = !spring;
  runner.onGroundId = from.id;
  let bounced = !spring;
  let doubled = false;
  for (let tick = 0; tick < 240; tick++) {
    const dx = to.x + to.w / 2 - runner.x - runner.w / 2;
    const stop = runner.vx * Math.abs(runner.vx) / (2 * PHYS.airAccel);
    const axis = Math.sign(dx - stop);
    const needsDouble = spring || from.y - to.y > 240 || Math.abs(to.x - from.x) > 500;
    const second = needsDouble && bounced && !doubled && tick > 1 && runner.vy >= -20;
    if (second) doubled = true;
    const input = {
      axisX: () => axis, consumeJumpPressed: () => (!spring && tick === 0) || second,
      jumpHeld: () => true, consumeReposition: () => false,
      upHeld: () => false, downHeld: () => false,
    };
    runner.update(1 / 60, input, registry);
    if (spring && runner.vy < -1200) bounced = true;
    if (runner.onGroundId === to.id && runner.grounded) return true;
    if (runner.dead) return false;
  }
  return false;
}

for (const id of getStageSequence()) {
  test(`${id}: every route leg has a legal, physics-tested Builder solution`, () => {
    const stage = getStageById(id);
    const decks = [...stage.solids.filter(s => s.x >= 0), ...stage.oneWays, ...stage.climbables.map(w => w.topStand)]
      .sort((a, b) => Number(a.id.split('_')[2]) - Number(b.id.split('_')[2]));
    for (let i = 0; i < decks.length - 1; i++) {
      const from = decks[i], to = decks[i + 1];
      const registry = new ToolRegistry(stage);
      const waitingRunner = new Runner(stage);
      waitingRunner.x = from.x + from.w / 2;
      waitingRunner.y = from.y - waitingRunner.h;
      const wall = stage.climbables.find(w => w.topStand.id === to.id);
      if (wall) {
        const runner = new Runner(stage);
        runner.x = wall.x - runner.w - 12;
        runner.y = from.y - runner.h;
        runner.grounded = true;
        assert.ok(runner.x >= from.x && runner.x + runner.w <= from.x + from.w, 'Wall approach is supported');
        let attached = false;
        for (let tick = 0; tick < 600; tick++) {
          runner.update(1 / 60, { axisX: () => attached ? 0 : 1,
            consumeJumpPressed: () => tick === 0, jumpHeld: () => false,
            consumeReposition: () => false, upHeld: () => true, downHeld: () => false }, registry);
          attached ||= runner.climbing;
          if (runner.grounded && runner.onGroundId === to.id) break;
        }
        assert.ok(attached && runner.onGroundId === to.id, `Wall ${wall.id} must be mountable and climbable`);
        continue;
      }
      if (flyTo(stage, registry, from, to)) continue;
      const dir = Math.sign(to.x - from.x);
      if (!registry.toolEnabled('platform')) {
        const sx = dir > 0 ? from.x + from.w - 80 : from.x + 40;
        const placed = registry.add('springBlue', sx, from.y - 40, waitingRunner);
        assert.ok(placed.valid, placed.reason);
        assert.ok(flyTo(stage, registry, placed.tool, to, true), `Spring leg ${i + 1} is unreachable`);
      } else {
        const rise = from.y - to.y;
        const start = dir > 0 ? from.x + from.w : from.x;
        const end = dir > 0 ? to.x : to.x + to.w;
        const supports = [from];
        for (let j = 1; j <= 2; j++) {
          const x = Math.round((start + (end - start) * j / 3 - 80) / 40) * 40;
          const y = Math.round((from.y - rise * j / 3) / 40) * 40;
          const placed = registry.add('platform', x, y, waitingRunner);
          assert.ok(placed.valid, `Leg ${i + 1}: ${placed.reason}`);
          supports.push(placed.tool);
        }
        supports.push(to);
        for (let j = 0; j < supports.length - 1; j++) {
          assert.ok(flyTo(stage, registry, supports[j], supports[j + 1]), `Leg ${i + 1}, hop ${j + 1} is unreachable`);
        }
      }
    }
  });
}
