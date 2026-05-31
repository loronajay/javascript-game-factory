import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMpBulletView,
  buildMpOpponentView,
} from "./js/render/mp-scene.mjs";

function nearlyEqual(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test("opponent ship projects from the same far depth as a newly fired incoming shot", () => {
  const localPlayerX = 180;
  const opponentX = -180;

  const opponent = buildMpOpponentView({ opponentX, localPlayerX, t: 0 });
  const bullet = buildMpBulletView({
    bullet: { owner: "p2", x: opponentX, z: 6.85, kind: "laser" },
    side: "p1",
    localPlayerX,
  });

  nearlyEqual(opponent.x, bullet.x, 0.75);
  assert.equal(opponent.visualZ, bullet.viewZ);
});

test("friendly and incoming projectile views use distinct readable combat cues", () => {
  const localPlayerX = 0;

  const friendly = buildMpBulletView({
    bullet: { owner: "p1", x: 20, z: 1.4, kind: "laser" },
    side: "p1",
    localPlayerX,
  });
  const incoming = buildMpBulletView({
    bullet: { owner: "p2", x: 0, z: 2.1, kind: "lob" },
    side: "p1",
    localPlayerX,
  });

  assert.equal(friendly.isIncoming, false);
  assert.equal(friendly.palette.role, "friendly");
  assert.equal(friendly.threatAlpha, 0);
  assert.equal(incoming.isIncoming, true);
  assert.equal(incoming.palette.role, "incoming");
  assert.ok(incoming.threatAlpha > 0.4);
  assert.ok(incoming.radius > friendly.radius);
});
