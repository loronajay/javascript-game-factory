import test from 'node:test';
import assert from 'node:assert/strict';
import { getStageById, getStageSequence, listPacks } from '../js/stages/stage-registry.js';
import { courseNotes } from '../js/stages/course-helpers.js';
import { KIT_TOOL_TYPES } from '../js/stages/stage-authoring.js';
import { PHYS, RUNNER, TOOL_DEFS } from '../js/constants.js';
import { Runner } from '../js/runner.js';
import { ToolRegistry } from '../js/tools.js';
import { updateMovingHazards, spikeBallHits } from '../js/hazards.js';

const ALL_STAGE_IDS = listPacks().flatMap(pack => getStageSequence(pack.id));

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

for (const id of ALL_STAGE_IDS) {
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

// Moving hazards run on stage time. A Runner picks their moment, so a leg is
// playable if it works from at least one of these start times; a course with
// no moving hazards is tried once.
const START_TIMES = Array.from({ length: 24 }, (_, i) => i * 0.25);
function startTimes(stage) {
  return stage.movingHazards?.length ? START_TIMES : [0];
}

// Which balls killed the Runner on the intended route at the wrong moment,
// per stage. A ball that never does is decoration, and the pack test says so.
const threats = new Map();
function recordThreat(stage, runner) {
  const ball = stage.movingHazards.find(b => spikeBallHits(b, runner.hazardHurtRect()));
  if (!ball) return;
  if (!threats.has(stage.id)) threats.set(stage.id, new Set());
  threats.get(stage.id).add(ball.id);
}

// One hop: the Runner starts on `from` (dropping onto it when it is a spring),
// steers for `to`, and succeeds by standing on it, bouncing off it when it is a
// spring, or catching it when it is a climbable wall and then climbing out on top.
function hop(stage, registry, from, to, options = {}) {
  // Off a spring a Runner either steers for the target at once, or rides the
  // bounce straight up and only moves across once above it (an elevator).
  // Every start time is played, not just until one works, so the threat
  // record above sees each ball at its worst moment.
  const strategies = options.spring ? [false, true] : [false];
  return strategies.flatMap(riseFirst => startTimes(stage).map(t0 => hopAt(stage, registry, from, to, { ...options, riseFirst }, t0))).some(Boolean);
}

function hopAt(stage, registry, from, to, { spring = false, low = false, double = true, riseFirst = false } = {}, t0 = 0) {
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
    updateMovingHazards(stage, t0 + tick / 60);
    if (caught) {
      runner.update(1 / 60, { ...idle, axisX: () => 0, consumeJumpPressed: () => false, jumpHeld: () => false, upHeld: () => true }, registry);
      if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
      if (runner.dead) recordThreat(stage, runner);
      if (runner.dead || !runner.climbing) return false;
      continue;
    }
    const dx = goalX - center(runner);
    const stop = runner.vx * Math.abs(runner.vx) / (2 * PHYS.airAccel);
    const holdBack = riseFirst && !wall && runner.y + runner.h > to.y + 4;
    const axis = holdBack ? 0 : Math.sign(dx - stop);
    const second = needsDouble && bounced && !doubled && tick > 1 && runner.vy >= -20;
    if (second) doubled = true;
    runner.update(1 / 60, {
      ...idle, axisX: () => axis,
      consumeJumpPressed: () => (!spring && !drop && tick === 0) || second,
      jumpHeld: () => !low && !drop,
      downHeld: () => drop && tick < 4,
    }, registry);
    if (spring && runner.vy < -800) bounced = true;
    if (runner.dead) { recordThreat(stage, runner); return false; }
    if (wall) {
      if (runner.climbing && runner.climbWall?.id === wall.id) caught = true;
      if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
    } else if (to.kind === 'spring') {
      // A bounce sets the feet exactly on the spring's top for one frame, so a
      // bounce off the target is told apart from the launch off `from`.
      if (runner.vy === to.bounceVy && runner.y + runner.h === to.y
        && runner.x < to.x + to.w && runner.x + runner.w > to.x && tick > 1) return true;
    } else if (runner.grounded && runner.onGroundId === to.id) {
      return true;
    }
  }
  return false;
}

// Walk into a wall that rises straight off the deck, hold up, arrive on top.
function climbFrom(stage, registry, from, wall) {
  return startTimes(stage).map(t0 => climbFromAt(stage, registry, from, wall, t0)).some(Boolean);
}

function climbFromAt(stage, registry, from, wall, t0 = 0) {
  const fromLeft = from.x + from.w / 2 < wall.x;
  const runner = new Runner(stage);
  runner.x = fromLeft ? wall.x - runner.w - 12 : wall.x + wall.w + 12;
  runner.y = from.y - runner.h;
  runner.grounded = true;
  assert.ok(runner.x >= from.x && runner.x + runner.w <= from.x + from.w, `Approach to ${wall.id} is supported`);
  let attached = false;
  for (let tick = 0; tick < 600; tick++) {
    updateMovingHazards(stage, t0 + tick / 60);
    runner.update(1 / 60, { ...idle, axisX: () => attached ? 0 : (fromLeft ? 1 : -1),
      consumeJumpPressed: () => tick === 0, jumpHeld: () => false, upHeld: () => true }, registry);
    attached ||= runner.climbing;
    if (runner.dead) { recordThreat(stage, runner); return false; }
    if (runner.grounded && runner.onGroundId === wall.topStand.id) return true;
  }
  return false;
}

// The camera sits 418px above and 302px below the Runner's centre (VIEW.height
// * 0.58), so from the feet the Builder sees about 440px up and 270px down.
const VIEW_ABOVE = 440;
const VIEW_BELOW = 270;
const VIEW_AHEAD = 1000;

for (const id of ALL_STAGE_IDS) {
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
for (const id of ALL_STAGE_IDS) {
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

// The kit is the puzzle: a course hands out only what its own solution needs,
// so the Builder chooses between tools instead of reaching for a platform
// every time. Tools are recalled between legs, so the need is the most of a
// type any one leg places at once. Two spares across the whole kit is the
// most generosity allowed; a type the route never uses may only be a spare.
const KIT_SPARES = 2;
for (const id of ALL_STAGE_IDS) {
  test(`${id}: the kit is tight against the intended route`, () => {
    const stage = getStageById(id);
    const notes = courseNotes.get(id);
    assert.equal(stage.builderRules.ruleId, 'kit', 'Course must author a kit, not a preset');
    const need = {};
    for (const via of Object.values(notes.builds)) {
      const leg = {};
      for (const t of via?.tools ?? []) leg[t.toolType] = (leg[t.toolType] ?? 0) + 1;
      for (const [type, n] of Object.entries(leg)) need[type] = Math.max(need[type] ?? 0, n);
    }
    let spares = 0;
    for (const type of KIT_TOOL_TYPES) {
      const cap = stage.builderRules.activeCaps[type];
      const needed = need[type] ?? 0;
      assert.ok(cap >= needed, `${type}: kit gives ${cap} but one leg needs ${needed}`);
      assert.ok(needed > 0 || cap <= 1, `${type}: the route never uses it, so at most one may be a spare (kit gives ${cap})`);
      spares += cap - needed;
    }
    assert.ok(spares <= KIT_SPARES, `Kit carries ${spares} spare tools beyond the route's need; at most ${KIT_SPARES}`);
    assert.equal(stage.builderRules.totalActiveToolCap, KIT_TOOL_TYPES.reduce((sum, t) => sum + stage.builderRules.activeCaps[t], 0));
    assert.ok(KIT_TOOL_TYPES.some(type => stage.builderRules.activeCaps[type] === 0 || stage.builderRules.activeCaps[type] === need[type]),
      'At least one tool is locked or exactly rationed');
  });
}

// Spike balls are a timing problem, never a rendering glitch: a ball must ride
// its whole cable without passing through terrain, and every deck the Runner
// waits on must keep a spot the ball never reaches.
for (const id of ALL_STAGE_IDS) {
  test(`${id}: spike balls sweep clear of terrain and leave the Runner somewhere to wait`, () => {
    const stage = getStageById(id);
    const notes = courseNotes.get(id);
    const surfaces = standingSurfaces(stage);
    const decks = notes.route.map(rid => surfaces.find(s => s.id === rid));
    for (const ball of stage.movingHazards) {
      assert.ok(ball.lane.x >= 0 && ball.lane.y >= 0 && ball.lane.x + ball.lane.w <= stage.width && ball.lane.y + ball.lane.h <= stage.deathY,
        `${ball.id} leaves the stage`);
      assert.ok(ball.period >= 1.5 && ball.period <= 8, `${ball.id} period ${ball.period}s is unreadable`);
      for (let t = 0; t <= ball.period; t += ball.period / 48) {
        updateMovingHazards(stage, t);
        for (const c of [...stage.solids, ...stage.climbables.map(w => w.topStand)]) {
          assert.ok(!spikeBallHits(ball, c, 0), `${ball.id} passes through ${c.id} at t=${t.toFixed(2)}`);
        }
      }
    }
    for (const deck of decks) {
      const body = { x: 0, y: deck.y - RUNNER.height + 6, w: RUNNER.width - 14, h: RUNNER.height - 12 };
      let safe = false;
      for (let x = deck.x + 7; x + body.w <= deck.x + deck.w - 7 && !safe; x += 20) {
        body.x = x;
        safe = !stage.movingHazards.some(ball => rectsOverlapLane(ball.lane, body));
      }
      assert.ok(safe, `${deck.id} is swept end to end; the Runner has nowhere to wait`);
    }
  });
}

function rectsOverlapLane(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Runs after the solution tests above have played every leg at every start
// time, so `threats` is complete by the time this reads it.
for (const id of ALL_STAGE_IDS) {
  test(`${id}: every spike ball threatens the intended route at the wrong moment`, () => {
    const stage = getStageById(id);
    const seen = threats.get(id) ?? new Set();
    const idle = stage.movingHazards.filter(ball => !seen.has(ball.id)).map(ball => ball.id);
    assert.deepEqual(idle, [], `${idle.join(', ')} never touched a Runner playing the intended route; decoration`);
  });
}
