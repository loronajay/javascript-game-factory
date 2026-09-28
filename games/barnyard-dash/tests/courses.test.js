import test from "node:test";
import assert from "node:assert/strict";

import { COURSES, COURSE_IDS, DEFAULT_COURSE_ID, courseForSeed, findCourse } from "../scripts/sim/courses.js";
import { FENCE_OFFSET, DEFAULT_TRACK, closestPointOnRoad, courseLimit, crossesGate, pointAtStation, pointInRect, roadLength, roadStation } from "../scripts/sim/track.js";
import { createRace, racerById, stepRace, withRacer } from "../scripts/sim/race.js";

test("the catalog has five distinct courses and the original keeps its exact geometry", () => {
  assert.equal(COURSES.length, 5);
  assert.equal(new Set(COURSE_IDS).size, COURSES.length);
  assert.deepEqual(findCourse(DEFAULT_COURSE_ID).track.road, DEFAULT_TRACK.road);
  assert.deepEqual(findCourse(DEFAULT_COURSE_ID).track.obstacles, DEFAULT_TRACK.obstacles);
  for (const course of COURSES) {
    assert.ok(course.title && course.blurb, course.id);
    assert.ok(course.laps >= 2 && course.laps <= 4, course.id);
  }
});

test("a quick room's course is a deterministic pick from its seed", () => {
  assert.equal(courseForSeed("abc"), courseForSeed("abc"));
  const picked = new Set(Array.from({ length: 60 }, (_, index) => courseForSeed(`seed-${index}`).id));
  assert.equal(picked.size, COURSES.length, "every course comes up in rotation");
});

for (const course of COURSES) {
  const track = course.track;
  const half = track.roadWidth / 2 + FENCE_OFFSET;

  test(`${course.id}: no two stretches of road come close enough for the fences to touch`, () => {
    const length = roadLength(track);
    for (let a = 0; a < length; a += 10) {
      for (let b = a + 10; b < length; b += 10) {
        const arc = Math.min(b - a, length - (b - a));
        if (arc < half * 4.4) continue;
        const p = pointAtStation(track, a);
        const q = pointAtStation(track, b);
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > half * 2 + 20, `${course.id}: stations ${a} and ${b} are too close`);
      }
    }
  });

  test(`${course.id}: every obstacle stands on the road and no hurdle sits in mud`, () => {
    for (const obstacle of track.obstacles) {
      assert.ok(closestPointOnRoad(obstacle, track).distance < track.roadWidth / 2, `${obstacle.id} is off the road`);
      if (obstacle.kind !== "hurdle") continue;
      // A hurdle in a wallow cannot be hopped out of cleanly: keep the two apart.
      for (const zone of track.mud) assert.equal(pointInRect(obstacle, { ...zone, width: zone.width + 10, height: zone.height + 10 }), false, `${obstacle.id} is in mud`);
    }
  });

  test(`${course.id}: every tree, barn, bale and pond stands clear of the fence`, () => {
    const clear = (point, radius) => closestPointOnRoad(point, track).distance - half - radius;
    for (const tree of course.scenery.trees) assert.ok(clear(tree, 20) > 0, `tree at ${tree.x},${tree.y}`);
    for (const bale of course.scenery.hay) assert.ok(clear(bale, 15) > 0, `bale at ${bale.x},${bale.y}`);
    if (course.scenery.barn) assert.ok(clear(course.scenery.barn, 60) > 0, "barn");
    if (course.scenery.pond) assert.ok(clear(course.scenery.pond, course.scenery.pond.radius) > 0, "pond");
  });

  test(`${course.id}: a lap driven hugging either fence still counts every checkpoint`, () => {
    for (const hug of [-0.92, 0, 0.92]) {
      const bare = { ...track, obstacles: [], mud: [] };
      let race = createRace({ track: bare, entrants: [{ id: "p", pet: { speed: 50, strength: 50, size: 1 } }], countdownSeconds: 0, totalLaps: 1 });
      const radius = racerById(race, "p").profile.radius;
      const limit = courseLimit(track, radius) * hug;
      const length = roadLength(track);
      for (let station = 0; station <= length + 160 && racerById(race, "p").finishedAt === null; station += 4) {
        const centre = pointAtStation(track, station);
        const target = { x: centre.x - Math.sin(centre.angle) * limit, y: centre.y + Math.cos(centre.angle) * limit };
        const me = racerById(race, "p");
        const angle = Math.atan2(target.y - me.y, target.x - me.x);
        const speed = Math.hypot(target.x - me.x, target.y - me.y) * 60;
        race = stepRace(withRacer(race, "p", { angle, speed }), {}, 1 / 60);
      }
      assert.ok(Number.isFinite(racerById(race, "p").finishedAt), `${course.id} hugging ${hug} stopped at checkpoint ${racerById(race, "p").checkpoint}`);
    }
  });

  test(`${course.id}: checkpoints run in order round the lap, the last one on the finish line`, () => {
    const stations = track.checkpoints.map((checkpoint) => roadStation(checkpoint, track));
    const finish = stations.at(-1);
    const length = roadLength(track);
    const ahead = stations.slice(0, -1).map((station) => ((station - finish) % length + length) % length);
    for (let index = 1; index < ahead.length; index += 1) assert.ok(ahead[index] > ahead[index - 1], `${course.id} checkpoint ${index} is out of order`);
    assert.ok(Math.hypot(track.checkpoints.at(-1).x - track.finish.x, track.checkpoints.at(-1).y - track.finish.y) < 2);
    for (const checkpoint of track.checkpoints) {
      const before = { x: checkpoint.x - checkpoint.gate.tangentX * 3, y: checkpoint.y - checkpoint.gate.tangentY * 3 };
      assert.ok(crossesGate(before, checkpoint, checkpoint));
    }
  });
}
