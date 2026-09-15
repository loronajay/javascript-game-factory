import test from 'node:test';
import assert from 'node:assert/strict';
import { getStageById, getStageSequence } from '../js/stages/stage-registry.js';
import { courseNotes } from '../js/stages/packs/pack-01/pack-01-stage-helpers.js';
import { PHYS, RUNNER, TOOL_DEFS } from '../js/constants.js';
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

function couldReach(a, b, headroom = Infinity) {
  const dy = a.y - b.y;
  if (dy > rise) return false;
  const gap = Math.max(0, b.x - a.x - a.w, a.x - b.x - b.w);
  if (headroom < rise + RUNNER.height) {
    // Under a low ceiling the jump is only as tall as the room allows, and the
    // Runner must not rise above the target either.
    const hop = Math.max(0, Math.min(headroom - RUNNER.height - 20, rise) - Math.max(0, -dy));
    if (dy > hop) return false;
    const flight = Math.sqrt(2 * hop / PHYS.gravity) + Math.sqrt(2 * (hop - dy) / PHYS.gravity);
    return gap <= PHYS.maxRunSpeed * flight + RUNNER.width;
  }
  return gap <= PHYS.maxRunSpeed * (ascent + Math.sqrt(2 * (rise - dy) / PHYS.gravity)) + RUNNER.width;
}

// The lowest lethal or solid underside hanging over the span between a and b,
// measured from the higher of the two surfaces.
function headroomBetween(stage, a, b) {
  const left = Math.min(a.x, b.x), right = Math.max(a.x + a.w, b.x + b.w);
  const top = Math.min(a.y, b.y);
  let room = Infinity;
  for (const c of [...stage.hazards.filter(h => h.facing === 'down'), ...stage.solids]) {
    if (c === a || c === b) continue;
    const bottom = c.y + c.h;
    if (bottom > top) continue;
    const overlap = Math.min(c.x + c.w, right) - Math.max(c.x, left);
    if (overlap >= (right - left) * 0.5) room = Math.min(room, top - bottom);
  }
  return room;
}

function standingSurfaces(stage) {
  return [...stage.solids.filter(s => s.x >= 0), ...stage.oneWays,
    ...stage.climbables.map(w => w.topStand).filter(Boolean)];
}

// A surface whose top is mostly spikes is not somewhere the Runner can stand.
function spiked(stage, s) {
  return stage.hazards.some(h => Math.abs(h.y + h.h - s.y) <= 2
    && Math.min(h.x + h.w, s.x + s.w) - Math.max(h.x, s.x) >= s.w * 0.6);
}

// A floor with solid ceiling over its whole width, within standing height, can
// only be entered sideways from something level with it.
function covered(stage, b) {
  return stage.solids.some(s => s !== b && s.y + s.h <= b.y && b.y - (s.y + s.h) <= 160
    && Math.min(s.x + s.w, b.x + b.w) - Math.max(s.x, b.x) >= b.w * 0.9);
}

function walkIn(a, b) {
  return Math.abs(a.y - b.y) <= 120 && Math.max(0, b.x - a.x - a.w, a.x - b.x - b.w) <= 200;
}

// Everything the Runner can stand on by terrain alone, starting from `seeds`.
function terrainReachable(stage, seeds) {
  const floors = standingSurfaces(stage).filter(s => !spiked(stage, s));
  const reachable = new Set(seeds);
  const reaches = (a, b) => covered(stage, b) ? walkIn(a, b) : couldReach(a, b, headroomBetween(stage, a, b));
  for (let changed = true; changed;) {
    changed = false;
    for (const a of reachable) for (const b of floors) {
      const foot = w => ({ x: w.x, y: w.y + w.h, w: w.w, h: 1 });
      if (!reachable.has(b) && (reaches(a, b) || stage.climbables.some(w => w.topStand.id === b.id && couldReach(a, foot(w), headroomBetween(stage, a, foot(w)))))) { reachable.add(b); changed = true; }
    }
  }
  return reachable;
}

for (const id of getStageSequence()) {
  test(`${id}: no terrain-only route to the goal, including recovery ledges`, () => {
    const stage = getStageById(id);
    const floors = standingSurfaces(stage).filter(s => !spiked(stage, s));
    const reachable = terrainReachable(stage, floors.filter(s => stage.start.x >= s.x && stage.start.x < s.x + s.w
      && Math.abs(s.y - stage.start.y - RUNNER.height) < 10));
    // Include jumping into the trigger without landing on its supporting deck.
    const trigger = { ...stage.goal, y: stage.goal.y + stage.goal.h + RUNNER.height };
    assert.ok(![...reachable].some(s => couldReach(s, trigger)), 'Runner can reach goal without Builder');
    assert.ok(!stage.routeSigns?.length, 'No solution signs');
    assert.ok(stage.climbables.length > 0, 'Climbing must be part of each course');
  });

  test(`${id}: no build moment can be bypassed by terrain`, () => {
    const stage = getStageById(id);
    const notes = courseNotes.get(id);
    const surfaces = standingSurfaces(stage);
    const decks = notes.route.map(rid => surfaces.find(s => s.id === rid));
    for (let i = 0; i < decks.length - 1; i++) {
      const reachable = terrainReachable(stage, [decks[i]]);
      let builds = 0;
      for (let j = i + 1; j < decks.length; j++) {
        if (notes.builds[decks[j].id]?.tools.length) builds++;
        if (!builds) continue;
        assert.ok(!reachable.has(decks[j]), `${decks[j].id} is reachable from ${decks[i].id} by terrain alone, skipping a build (via ${[...reachable].map(r => r.id).join(', ')})`);
      }
    }
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

const idle = { consumeReposition: () => false, upHeld: () => false, downHeld: () => false };
const center = r => r.x + r.w / 2;

// One hop: the Runner starts on `from` (dropping onto it when it is a spring),
// steers for `to`, and succeeds by standing on it, bouncing off it when it is a
// spring, or catching it when it is a climbable wall and then climbing out on top.
function hop(stage, registry, from, to, { spring = false, low = false, double = true } = {}) {
  const runner = new Runner(stage);
  const wall = to.topStand ? to : null;
  const dir = Math.sign((wall ? wall.x + wall.w / 2 : center(to)) - center(from)) || 1;
  // A one-way support with the target underneath is left by pressing down.
  const oneWay = from.kind === 'platform' || stage.oneWays.some(p => p.id === from.id);
  const drop = oneWay && !spring && !wall && to.y > from.y + 60 && to.x < from.x + from.w && to.x + to.w > from.x;
  // Aim for the near edge of a wide target, the way a player lands a jump.
  const goalX = wall ? wall.x + wall.w / 2
    : drop ? Math.max(to.x + 30, Math.min(to.x + to.w - 30, center(from)))
    : dir > 0 ? Math.min(center(to), to.x + 90) : Math.max(center(to), to.x + to.w - 90);
  if (spring) {
    runner.x = from.x + 10;
    runner.y = from.y - runner.h - 1;
    runner.grounded = false;
  } else {
    runner.x = Math.max(from.x + 8, Math.min(from.x + from.w - 42, goalX - runner.w / 2 - (drop ? 0 : dir * 200)));
    // A tap-hop is taken from the very edge; there is no height to spare.
    if (low && !drop) runner.x = dir > 0 ? from.x + from.w - runner.w : from.x;
    // A wall hanging over the support is caught by standing at its face and
    // jumping straight up, which is how a player does it under a low ceiling.
    const face = wall && (dir > 0 ? wall.x - runner.w - 2 : wall.x + wall.w + 2);
    const atFace = wall && face >= from.x && face + runner.w <= from.x + from.w;
    if (atFace) runner.x = face;
    runner.y = from.y - runner.h;
    runner.grounded = true;
    runner.onGroundId = from.id;
    // A competent Runner arrives at the edge at speed when there is room to run.
    const runUp = dir > 0 ? runner.x - from.x : from.x + from.w - runner.x - runner.w;
    if (runUp >= 100 && !atFace && !drop) runner.vx = dir * PHYS.maxRunSpeed;
  }
  const lift = wall ? from.y - (wall.y + wall.h) : from.y - to.y;
  const needsDouble = double && !low && (spring || lift > 240 || Math.abs(goalX - center(runner)) > 400);
  let bounced = !spring;
  let doubled = false;
  let caught = false;
  for (let tick = 0; tick < 420; tick++) {
    if (caught) {
      runner.update(1 / 60, { ...idle, axisX: () => 0, consumeJumpPressed: () => false, jumpHeld: () => false, upHeld: () => true }, registry);
      if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
      if (runner.dead || !runner.climbing) return false;
      continue;
    }
    const dx = goalX - center(runner);
    const stop = runner.vx * Math.abs(runner.vx) / (2 * PHYS.airAccel);
    const axis = Math.sign(dx - stop);
    const second = needsDouble && bounced && !doubled && tick > 1 && runner.vy >= -20;
    if (second) doubled = true;
    runner.update(1 / 60, {
      ...idle, axisX: () => axis,
      consumeJumpPressed: () => (!spring && !drop && tick === 0) || second,
      jumpHeld: () => !low && !drop,
      downHeld: () => drop && tick < 4,
    }, registry);
    if (spring && runner.vy < -800) bounced = true;
    if (runner.dead) return false;
    if (wall) {
      if (runner.climbing && runner.climbWall?.id === wall.id) caught = true;
      if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
    } else if (to.kind === 'spring') {
      if (runner.vy < -800 && tick > 1) return true;
    } else if (runner.grounded && runner.onGroundId === to.id) {
      return true;
    }
  }
  return false;
}

// Walk into a wall that rises straight off the deck, hold up, arrive on top.
function climbFrom(stage, registry, from, wall) {
  const fromLeft = from.x + from.w / 2 < wall.x;
  const runner = new Runner(stage);
  runner.x = fromLeft ? wall.x - runner.w - 12 : wall.x + wall.w + 12;
  runner.y = from.y - runner.h;
  runner.grounded = true;
  assert.ok(runner.x >= from.x && runner.x + runner.w <= from.x + from.w, `Approach to ${wall.id} is supported`);
  let attached = false;
  for (let tick = 0; tick < 600; tick++) {
    runner.update(1 / 60, { ...idle, axisX: () => attached ? 0 : (fromLeft ? 1 : -1),
      consumeJumpPressed: () => tick === 0, jumpHeld: () => false, upHeld: () => true }, registry);
    attached ||= runner.climbing;
    if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
  }
  return false;
}

// The camera sits 418px above and 302px below the Runner's centre (VIEW.height
// * 0.58), so from the feet the Builder sees about 440px up and 270px down.
const VIEW_ABOVE = 440;
const VIEW_BELOW = 270;
const VIEW_AHEAD = 1000;

for (const id of getStageSequence()) {
  test(`${id}: every route leg has a legal, physics-tested Builder solution`, () => {
    const stage = getStageById(id);
    const notes = courseNotes.get(id);
    assert.ok(notes, 'Course notes recorded');
    const surfaces = standingSurfaces(stage);
    const decks = notes.route.map(rid => surfaces.find(s => s.id === rid));
    assert.ok(decks.every(Boolean), 'Every route beat is a standing surface');
    const wallOf = deckId => stage.climbables.find(w => w.topStand.id === deckId);

    for (let i = 0; i < decks.length - 1; i++) {
      const from = decks[i], to = decks[i + 1];
      const leg = `Leg ${i + 1} (${from.id} -> ${to.id})`;
      const registry = new ToolRegistry(stage);
      // The Runner waits at the end of the deck they arrived on while the Builder works ahead.
      const waitingRunner = new Runner(stage);
      waitingRunner.x = to.x + to.w / 2 > from.x + from.w / 2 ? from.x + 40 : from.x + from.w - 74;
      waitingRunner.y = from.y - waitingRunner.h;
      const via = notes.builds[to.id];
      const wall = wallOf(to.id);

      if (!via) {
        // Two level surfaces that touch are one floor: the Runner walks across.
        if (Math.abs(from.y - to.y) < 4 && Math.max(from.x, to.x) <= Math.min(from.x + from.w, to.x + to.w)) continue;
        if (wall) {
          assert.ok(climbFrom(stage, registry, from, wall), `${leg}: wall ${wall.id} must be mountable and climbable`);
          continue;
        }
        assert.ok(hop(stage, registry, from, to), `${leg}: free leg must be jumpable`);
        continue;
      }

      const supports = [from];
      for (const t of via.tools) {
        let placed = registry.add(t.toolType, t.x, t.y, waitingRunner);
        // Junk the stage pre-placed is the Builder's to clear when it eats a cap.
        while (!placed.valid && /cap reached/.test(placed.reason)) {
          const junk = registry.tools.find(j => j.active && stage.preplacedTools.some(pre => pre.x === j.x && pre.y === j.y && pre.toolType === j.toolType));
          if (!junk) break;
          assert.ok(registry.deleteAt(junk.x + 1, junk.y + 1).deleted, `${leg}: could not clear junk ${junk.toolType}`);
          placed = registry.add(t.toolType, t.x, t.y, waitingRunner);
        }
        assert.ok(placed.valid, `${leg}: ${t.toolType} at ${t.x},${t.y}: ${placed.reason}`);
        const prev = supports.at(-1);
        const edge = prev.x + prev.w / 2;
        assert.ok(placed.tool.y >= prev.y - VIEW_ABOVE && placed.tool.y <= prev.y + VIEW_BELOW,
          `${leg}: ${t.toolType} at ${t.x},${t.y} is out of the Builder's view vertically from ${prev.id}`);
        assert.ok(Math.abs(placed.tool.x - edge) <= VIEW_AHEAD + prev.w / 2,
          `${leg}: ${t.toolType} at ${t.x},${t.y} is out of the Builder's view horizontally from ${prev.id}`);
        supports.push(placed.tool);
      }
      supports.push(wall ?? to);
      for (let j = 0; j < supports.length - 1; j++) {
        const a = supports[j], b = supports[j + 1];
        const ok = hop(stage, registry, a, b, { spring: a.kind === 'spring', low: via.low, double: b.kind !== 'spring' });
        assert.ok(ok, `${leg}: hop ${j + 1} (${a.id} -> ${b.id}) is unreachable`);
      }
    }
  });
}

// The complaint these guard against: a course that is a walk plus one bridge.
for (const id of getStageSequence()) {
  test(`${id}: the course is a co-op problem set, not a single bridge`, () => {
    const stage = getStageById(id);
    const notes = courseNotes.get(id);
    const builds = Object.values(notes.builds).filter(v => v?.tools.length);
    assert.ok(builds.length >= 4, `Only ${builds.length} build moments; want at least 4`);

    const tools = builds.flatMap(v => v.tools);
    assert.ok(tools.length >= 5, `Only ${tools.length} intended placements; want at least 5`);
    const counts = {};
    for (const t of tools) counts[t.toolType] = (counts[t.toolType] ?? 0) + 1;
    const distinct = Object.keys(counts).length;
    const recycle = Object.entries(counts).some(([type, n]) => n > (stage.builderRules.activeCaps[type] ?? TOOL_DEFS[type].maxActive));
    assert.ok(distinct >= 2 || recycle, 'Course must need more than one tool type, or more of one type than its cap so tools get recycled');

    assert.ok(stage.hazards.length >= 2, 'Course needs hazards beyond the yard floor');
    for (const t of tools) assert.ok(TOOL_DEFS[t.toolType], `Unknown tool ${t.toolType}`);
  });
}
