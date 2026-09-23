import test from "node:test";
import assert from "node:assert/strict";

import { celestialOrbit, generateStarField } from "../farm-sky.mjs";

test("the star field is deterministic, irregular, and distributed over the upper sky", () => {
  const first = generateStarField(420, 20260922);
  const again = generateStarField(420, 20260922);
  const other = generateStarField(420, 20260923);

  assert.deepEqual(first, again);
  assert.notDeepEqual(first, other);
  assert.equal(first.length, 420);
  assert.ok(first.every((star) => Math.abs(Math.hypot(star.x, star.y, star.z) - 1) < 1e-10));
  assert.ok(first.every((star) => star.y >= 0.06));
  assert.ok(new Set(first.map((star) => star.y.toFixed(5))).size > 400, "altitudes must not repeat in visible bands");
  assert.ok(first.some((star) => star.size === "bright"));
  assert.ok(first.some((star) => star.size === "faint"));
});

test("the sun and moon follow opposite halves of one continuous tilted orbit", () => {
  const sunrise = celestialOrbit(6 * 60);
  const noon = celestialOrbit(12 * 60);
  const sunset = celestialOrbit(18 * 60);
  const midnight = celestialOrbit(0);

  assert.ok(sunrise.sun.x > 0.99 && Math.abs(sunrise.sun.y) < 1e-10);
  assert.ok(noon.sun.y > 0.85 && noon.sun.z > 0.2);
  assert.ok(sunset.sun.x < -0.99 && Math.abs(sunset.sun.y) < 1e-10);
  assert.ok(midnight.sun.y < -0.85);

  for (const sample of [sunrise, noon, sunset, midnight, celestialOrbit(22 * 60 + 45)]) {
    assert.deepEqual(sample.moon, {
      x: -sample.sun.x,
      y: -sample.sun.y,
      z: -sample.sun.z,
    });
  }
  assert.deepEqual(celestialOrbit(0), celestialOrbit(24 * 60));
});
