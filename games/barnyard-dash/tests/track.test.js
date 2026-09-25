import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_TRACK, closestPointOnRoad, roadEdgeSegments, segmentCapsuleIntersection, startLineTiles } from "../scripts/track.js";

test("the course exposes a continuous pair of shortened edge segments without corner barriers", () => {
  const edges = roadEdgeSegments(DEFAULT_TRACK);

  assert.equal(edges.length, (DEFAULT_TRACK.road.length - 1) * 2);
  for (const edge of edges) {
    assert.ok(Number.isFinite(edge.start.x));
    assert.ok(Number.isFinite(edge.end.y));
    assert.ok(edge.length > 0);
    assert.ok(edge.length < edge.sourceLength);
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
