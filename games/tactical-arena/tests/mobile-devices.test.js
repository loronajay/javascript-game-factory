import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the screenshot harness waits for the game boot marker instead of network idle", () => {
  const source = readFileSync(new URL("../scripts/mobile-shots.mjs", import.meta.url), "utf8");
  const bootstrap = readFileSync(new URL("../src/bootstrap.js", import.meta.url), "utf8");

  assert.match(source, /waitUntil:\s*["']domcontentloaded["']/);
  assert.doesNotMatch(source, /waitUntil:\s*["']networkidle[02]["']/);
  assert.match(source, /html\[data-game-ready=["']true["']\]/);
  assert.match(bootstrap, /document\.documentElement\.dataset\.gameReady\s*=\s*["']true["']/);
});
