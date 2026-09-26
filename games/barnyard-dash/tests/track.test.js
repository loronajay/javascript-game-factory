import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_TRACK, closestPointOnRoad, courseLimit, crossesGate, roadEdgeSegments, segmentCapsuleIntersection, startLineTiles } from "../scripts/track.js";
import { createRace, stepRace } from "../scripts/race.js";

test("the course fence is one unbroken line on each side, bends included", () => {
  const edges = roadEdgeSegments(DEFAULT_TRACK);

  assert.equal(edges.length, (DEFAULT_TRACK.road.length - 1) * 2);
  for (const side of [-1, 1]) {
    const run = edges.filter((edge) => edge.side === side);
    run.forEach((edge, index) => {
      const next = run[(index + 1) % run.length];
      assert.ok(edge.length > 0);
      assert.ok(Math.hypot(edge.end.x - next.start.x, edge.end.y - next.start.y) < 1e-9, `gap in side ${side} fence after run ${index}`);
    });
  }
});

test("the fence is a wall: a racer driving straight off the course is held inside it", () => {
  const PET = { speed: 100, strength: 50, size: 1 };
  let race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets: [], countdownSeconds: 0 });
  // Face due west off the first straight at full tilt, jumping all the way.
  race = { ...race, player: { ...race.player, angle: Math.PI, speed: 180 } };
  for (let tick = 0; tick < 240; tick += 1) {
    race = stepRace(race, { throttle: true, jump: tick % 20 === 0 }, 1 / 60);
    const distance = closestPointOnRoad(race.player, DEFAULT_TRACK).distance;
    assert.ok(distance <= courseLimit(DEFAULT_TRACK, race.player.profile.radius) + 1e-6, `escaped the course at tick ${tick}: ${distance}`);
  }
});

test("every checkpoint is a gate across the whole fenced course", () => {
  for (const [index, checkpoint] of DEFAULT_TRACK.checkpoints.entries()) {
    assert.ok(checkpoint.gate, `checkpoint ${index} has no gate`);
    const across = { x: -checkpoint.gate.tangentY, y: checkpoint.gate.tangentX };
    const ahead = { x: checkpoint.gate.tangentX, y: checkpoint.gate.tangentY };
    // Sweep the gate at every lateral offset a racer can reach — both fences included.
    for (let offset = -110; offset <= 110; offset += 2) {
      const point = { x: checkpoint.x + across.x * offset, y: checkpoint.y + across.y * offset };
      if (closestPointOnRoad(point, DEFAULT_TRACK).distance > courseLimit(DEFAULT_TRACK, 0)) continue;
      const before = { x: point.x - ahead.x * 3, y: point.y - ahead.y * 3 };
      const after = { x: point.x + ahead.x * 3, y: point.y + ahead.y * 3 };
      assert.ok(crossesGate(before, after, checkpoint), `checkpoint ${index} missed at lateral offset ${offset}`);
      assert.equal(crossesGate(after, before, checkpoint), false, "driving backwards never counts");
    }
  }
});

test("a lap driven hugging either fence still counts every checkpoint", () => {
  const PET = { speed: 50, strength: 50, size: 1 };
  for (const hug of [-1, 1]) {
    // Hurdles and mud stripped: this is about where the gates are, not jumping.
    const track = { ...DEFAULT_TRACK, obstacles: [], mud: [] };
    let race = createRace({ track, playerPet: PET, cpuPets: [], countdownSeconds: 0, totalLaps: 1 });
    // Walk a racer along the course, pinned right against one fence, a small step per tick.
    const points = DEFAULT_TRACK.road;
    for (let segment = 0; segment < points.length - 1; segment += 1) {
      const from = points[segment];
      const to = points[segment + 1];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const normal = { x: -(to.y - from.y) / length * hug, y: (to.x - from.x) / length * hug };
      const limit = courseLimit(DEFAULT_TRACK, race.player.profile.radius) - 0.5;
      for (let step = 0; step <= length; step += 4) {
        const x = from.x + (to.x - from.x) * step / length + normal.x * limit;
        const y = from.y + (to.y - from.y) * step / length + normal.y * limit;
        const angle = Math.atan2(y - race.player.y, x - race.player.x);
        const speed = Math.hypot(x - race.player.x, y - race.player.y) * 60;
        race = stepRace({ ...race, player: { ...race.player, angle, speed } }, {}, 1 / 60);
      }
    }
    // One more stretch up the home straight to the finish gate.
    for (let tick = 0; tick < 90 && race.player.finishedAt === null; tick += 1) {
      race = stepRace({ ...race, player: { ...race.player, angle: -Math.PI / 2, speed: 240 } }, {}, 1 / 60);
    }
    assert.ok(Number.isFinite(race.player.finishedAt), `hugging side ${hug} stopped at checkpoint ${race.player.checkpoint}`);
  }
});

test("closestPointOnRoad returns the nearest road point and outward correction direction", () => {
  const track = {
    road: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    roadWidth: 20,
  };
  const nearest = closestPointOnRoad({ x: 40, y: 18 }, track);

  assert.deepEqual({ x: nearest.x, y: nearest.y }, { x: 40, y: 0 });
  assert.equal(nearest.distance, 18);
  assert.deepEqual({ x: nearest.normalX, y: nearest.normalY }, { x: 0, y: 1 });
});

test("track-spanning obstacles declare their visual orientation", () => {
  for (const obstacle of DEFAULT_TRACK.obstacles.filter(({ kind }) => kind !== "hay")) {
    assert.ok(Number.isFinite(obstacle.angle), `${obstacle.id} needs a course-aligned angle`);
    assert.ok(obstacle.length > 0, `${obstacle.id} needs a visible collider length`);
    assert.ok(obstacle.thickness > 0, `${obstacle.id} needs a visible collider thickness`);
  }
});

test("the course has seven full-width hurdle fences instead of two token barriers", () => {
  const hurdles = DEFAULT_TRACK.obstacles.filter(({ kind }) => kind === "hurdle");
  assert.equal(hurdles.length, 7);
  assert.equal(new Set(hurdles.map(({ id }) => id)).size, 7);
  for (const hurdle of hurdles) {
    assert.ok(hurdle.length >= DEFAULT_TRACK.roadWidth * 0.84, `${hurdle.id} only spans ${hurdle.length} of ${DEFAULT_TRACK.roadWidth}`);
  }
});

test("the start and finish marking is a full-width checkered band aligned to the starting heading", () => {
  const tiles = startLineTiles(DEFAULT_TRACK);
  const across = new Set(tiles.map(({ column }) => column));
  const rows = new Set(tiles.map(({ row }) => row));
  const xs = tiles.map(({ x }) => x);
  const ys = tiles.map(({ y }) => y);

  assert.ok(across.size >= 10);
  assert.equal(rows.size, 3);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= DEFAULT_TRACK.roadWidth * 0.82);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 30, "northbound start line should cross the road, not run along it");
  assert.ok(DEFAULT_TRACK.start.y > DEFAULT_TRACK.checkpoints[0].y, "the first checkpoint must be ahead of the starting grid");
});

test("a fence collider follows its thin visible segment instead of a large invisible circle", () => {
  const barrierStart = { x: 35, y: -22 };
  const barrierEnd = { x: 35, y: 22 };
  const hit = segmentCapsuleIntersection({ x: 0, y: 0 }, { x: 30, y: 0 }, barrierStart, barrierEnd, 14);
  const miss = segmentCapsuleIntersection({ x: 0, y: 40 }, { x: 50, y: 40 }, barrierStart, barrierEnd, 14);

  assert.ok(hit);
  assert.ok(hit.x >= 20, `collision should occur at the visible barrier, not at x=${hit.x}`);
  assert.equal(miss, null);
});
