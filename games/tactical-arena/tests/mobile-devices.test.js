import assert from "node:assert/strict";
import test from "node:test";

import { resolveDevice } from "../scripts/mobile-devices.mjs";

test("store-16x9 captures Play-recommended 1920x1080 landscape screenshots", () => {
  const device = resolveDevice("store-16x9");

  assert.equal(device.width, 960);
  assert.equal(device.height, 540);
  assert.equal(device.dsf, 2);
  assert.equal(device.width * device.dsf, 1920);
  assert.equal(device.height * device.dsf, 1080);
});
