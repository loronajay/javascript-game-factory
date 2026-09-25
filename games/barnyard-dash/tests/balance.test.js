import test from "node:test";
import assert from "node:assert/strict";

import { racePetProfile } from "../scripts/balance.js";

test("speed only spans the locked 90% to 110% movement band", () => {
  assert.equal(racePetProfile({ speed: 0, strength: 50, size: 1 }).speedMultiplier, 0.9);
  assert.equal(racePetProfile({ speed: 50, strength: 50, size: 1 }).speedMultiplier, 1);
  assert.equal(racePetProfile({ speed: 100, strength: 50, size: 1 }).speedMultiplier, 1.1);
});

test("strength improves obstacle and mud recovery without changing top speed", () => {
  const light = racePetProfile({ speed: 50, strength: 0, size: 1 });
  const strong = racePetProfile({ speed: 50, strength: 100, size: 1 });

  assert.equal(light.speedMultiplier, strong.speedMultiplier);
  assert.ok(strong.impactRetention > light.impactRetention);
  assert.ok(strong.mudGrip > light.mudGrip);
  assert.ok(strong.gatePower > light.gatePower);
});

test("hostile pet values are clamped and size changes the visible collision radius", () => {
  const tiny = racePetProfile({ speed: -20, strength: 400, size: 0.62 });
  const large = racePetProfile({ speed: Number.NaN, strength: null, size: 1.12 });

  assert.equal(tiny.speed, 0);
  assert.equal(tiny.strength, 100);
  assert.ok(tiny.radius < large.radius);
  assert.equal(large.speed, 50);
  assert.equal(large.strength, 50);
});
