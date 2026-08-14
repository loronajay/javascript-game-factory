const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { BALLS, profileStats } = require("./ball-core.js");

describe("bowling ball profiles", () => {
  test("gives every ball named, player-facing properties", () => {
    assert.equal(BALLS.length, 8);
    for (const ball of BALLS) {
      assert.match(ball.name, /\S/);
      assert.match(ball.archetype, /\S/);
      assert.match(ball.description, /\S/);
      for (const property of ["hookScale", "speedScale", "massScale", "meterSpeed", "aimSpeed", "chargeSpeed"]) {
        assert.equal(Number.isFinite(ball[property]), true, `${ball.name} needs ${property}`);
        assert.ok(ball[property] > 0, `${ball.name} ${property} must affect play`);
      }
    }
  });

  test("offers genuinely different aim and charge handling choices", () => {
    assert.ok(new Set(BALLS.map((ball) => ball.aimSpeed)).size >= 4);
    assert.ok(new Set(BALLS.map((ball) => ball.chargeSpeed)).size >= 4);
    assert.ok(Math.max(...BALLS.map((ball) => ball.aimSpeed)) / Math.min(...BALLS.map((ball) => ball.aimSpeed)) >= 1.5);
    assert.ok(Math.max(...BALLS.map((ball) => ball.chargeSpeed)) / Math.min(...BALLS.map((ball) => ball.chargeSpeed)) >= 1.5);
  });

  test("formats every gameplay property for the visible UI", () => {
    const stats = profileStats(BALLS[0]);
    assert.deepEqual(stats.map((stat) => stat.label), ["Hook", "Speed", "Impact", "Aim", "Spin", "Charge"]);
    assert.equal(stats.every((stat) => /\S/.test(stat.value)), true);
  });
});
