import test from "node:test";
import assert from "node:assert/strict";

import {
  countdownLabel,
  createRoundCountdown,
  isCountdownBlocking,
  stepRoundCountdown,
} from "../scripts/countdown.js";

test("a round countdown blocks play while showing three, two, one", () => {
  const countdown = createRoundCountdown();

  assert.equal(countdownLabel(countdown), "3");
  assert.equal(isCountdownBlocking(countdown), true);

  stepRoundCountdown(countdown, 1);
  assert.equal(countdownLabel(countdown), "2");
  assert.equal(isCountdownBlocking(countdown), true);

  stepRoundCountdown(countdown, 1);
  assert.equal(countdownLabel(countdown), "1");
  assert.equal(isCountdownBlocking(countdown), true);
});

test("the label advances exactly on a 60 Hz second boundary", () => {
  const countdown = createRoundCountdown();

  for (let tick = 0; tick < 60; tick += 1) stepRoundCountdown(countdown, 1 / 60);

  assert.equal(countdownLabel(countdown), "2");
});

test("play unlocks on GO and the banner clears after its display window", () => {
  const countdown = createRoundCountdown();

  stepRoundCountdown(countdown, 3);
  assert.equal(countdownLabel(countdown), "GO!");
  assert.equal(isCountdownBlocking(countdown), false);

  stepRoundCountdown(countdown, 0.64);
  assert.equal(countdownLabel(countdown), "GO!");

  stepRoundCountdown(countdown, 0.02);
  assert.equal(countdownLabel(countdown), "");
  assert.equal(countdown.complete, true);
});

test("a large fixed step carries through countdown phases without losing time", () => {
  const countdown = createRoundCountdown();

  stepRoundCountdown(countdown, 3.7);

  assert.equal(countdownLabel(countdown), "");
  assert.equal(countdown.complete, true);
  assert.equal(isCountdownBlocking(countdown), false);
});
