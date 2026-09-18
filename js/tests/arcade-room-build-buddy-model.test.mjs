import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  BUILD_BUDDY_CABINET,
  CABINET_CATALOG,
  getCabinetFootprint,
  validateCabinetDefinition,
} from "../arcade-room-cabinet.mjs";
import { createDefaultRoomLayout } from "../arcade-room-layout.mjs";
import {
  BUILD_BUDDY_CABINET_ART,
  BUILD_BUDDY_PLAY_VIEW,
} from "../arcade-room-scene.mjs";
import { createBuildBuddyCabinet } from "../arcade-room-build-buddy-model.mjs";

class Node {
  constructor(...args) {
    this.args = args;
    this.children = [];
    this.position = { set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { set: (x, y, z) => Object.assign(this.scale, { x, y, z }) };
    this.userData = {};
  }
  add(...children) { this.children.push(...children); }
}

const THREE = new Proxy({
  Group: Node,
  Mesh: Node,
  PointLight: Node,
  TextureLoader: class { load(src) { return { src }; } },
  DoubleSide: 2,
  SRGBColorSpace: "srgb",
  NearestFilter: "nearest",
}, {
  get(target, key) {
    if (key in target) return target[key];
    return class extends Node {};
  },
});

function allNodes(root) {
  return [root, ...root.children.flatMap(allNodes)];
}

test("Build Buddy is a standard two-player upright in the room catalog", () => {
  assert.equal(BUILD_BUDDY_CABINET.id, "cabinet.build-buddy.standard");
  assert.equal(BUILD_BUDDY_CABINET.gameSlug, "build-buddy");
  assert.equal(BUILD_BUDDY_CABINET.launchMode, "cabinet-screen");
  assert.deepEqual(BUILD_BUDDY_CABINET.dimensions, { width: 0.92, depth: 0.98, height: 2.3 });
  assert.deepEqual(getCabinetFootprint(BUILD_BUDDY_CABINET), { width: 1.04, depth: 1.1 });
  assert.deepEqual(validateCabinetDefinition(BUILD_BUDDY_CABINET), []);
  assert.ok(CABINET_CATALOG.includes(BUILD_BUDDY_CABINET));
  assert.ok(createDefaultRoomLayout().items.some((item) => item.cabinetId === BUILD_BUDDY_CABINET.id));
});

test("Build Buddy uses canonical game art plus a generated portrait cabinet decal", () => {
  assert.equal(BUILD_BUDDY_CABINET_ART.keyArt, "../grid-previews/build-buddy.png");
  assert.equal(BUILD_BUDDY_CABINET_ART.crewArt, "../games/build-buddy/assets/art/menu-custom-crew.png");
  assert.equal(BUILD_BUDDY_CABINET_ART.sideArt, "../room/assets/cabinets/build-buddy-side-panel.png");
  assert.equal(existsSync(resolve("room/assets/cabinets/build-buddy-side-panel.png")), true);
  assert.deepEqual(BUILD_BUDDY_PLAY_VIEW.screen, { width: 0.68, height: 0.3825, y: 1.5, z: 0.285 });
  assert.equal(BUILD_BUDDY_PLAY_VIEW.gameAspect, 16 / 9);
});

test("Build Buddy has runner and builder controls on a detailed standard cabinet", () => {
  const root = createBuildBuddyCabinet(THREE, BUILD_BUDDY_CABINET);
  const nodes = allNodes(root);
  const names = nodes.map((node) => node.name).filter(Boolean);

  assert.equal(root.userData.gameSlug, "build-buddy");
  for (const required of [
    "shell", "upper-shell", "marquee", "screen", "screen-bezel", "control-deck",
    "runner-joystick", "builder-trackball", "builder-tool-button-1", "builder-tool-button-2",
    "side-art-left", "side-art-right", "coin-door", "hard-hat-topper",
  ]) assert.ok(names.includes(required), `missing ${required}`);
  assert.ok(nodes.length >= 25, `expected a presentation-grade upright, got ${nodes.length} nodes`);

  const runner = nodes.find((node) => node.name === "runner-joystick");
  const builder = nodes.find((node) => node.name === "builder-trackball");
  assert.ok(runner.position.x < 0, "runner controls belong on the left");
  assert.ok(builder.position.x > 0, "builder controls belong on the right");
});
