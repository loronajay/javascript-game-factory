import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  CABINET_CATALOG,
  COCKPIT_SWARM_CABINET,
  getCabinetFootprint,
  validateCabinetDefinition,
} from "../arcade-room-cabinet.mjs";
import { createDefaultRoomLayout } from "../arcade-room-layout.mjs";
import {
  COCKPIT_SWARM_CABINET_ART,
  COCKPIT_SWARM_PLAY_VIEW,
} from "../arcade-room-scene.mjs";
import {
  COCKPIT_SWARM_LAYOUT,
  createCockpitSwarmCabinet,
} from "../arcade-room-cockpit-swarm-model.mjs";

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
  DoubleSide: 2,
}, {
  get(target, key) {
    if (key in target) return target[key];
    return class extends Node {};
  },
});

function allNodes(root) {
  return [root, ...root.children.flatMap(allNodes)];
}

test("Cockpit Swarm is cataloged as a wide twin-seat screen cabinet", () => {
  assert.equal(COCKPIT_SWARM_CABINET.id, "cabinet.cockpit-swarm.twin-seat");
  assert.equal(COCKPIT_SWARM_CABINET.gameSlug, "cockpit-swarm");
  assert.equal(COCKPIT_SWARM_CABINET.launchMode, "cabinet-screen");
  assert.deepEqual(COCKPIT_SWARM_CABINET.dimensions, { width: 2.42, depth: 2.75, height: 2.48 });
  assert.deepEqual(getCabinetFootprint(COCKPIT_SWARM_CABINET), { width: 2.58, depth: 2.91 });
  assert.deepEqual(validateCabinetDefinition(COCKPIT_SWARM_CABINET), []);
  assert.equal(CABINET_CATALOG.at(-1), COCKPIT_SWARM_CABINET);
  assert.ok(createDefaultRoomLayout().items.some((item) => item.cabinetId === COCKPIT_SWARM_CABINET.id));
});

test("Cockpit Swarm uses only its canonical game preview and generated derivative decal", () => {
  assert.equal(COCKPIT_SWARM_CABINET_ART.keyArt, "../grid-previews/cockpit-swarm.png");
  assert.equal(COCKPIT_SWARM_CABINET_ART.sideArt, "../room/assets/cabinets/cockpit-swarm-side-panel.png");
  assert.equal(existsSync(resolve("room/assets/cabinets/cockpit-swarm-side-panel.png")), true);
  assert.deepEqual(COCKPIT_SWARM_PLAY_VIEW.screen, { width: 1.88, height: 1.0575, y: 1.68, z: -1.235 });
  assert.equal(COCKPIT_SWARM_PLAY_VIEW.gameAspect, 16 / 9);
});

test("Cockpit Swarm is a presentation-grade twin-seat environmental cabinet", () => {
  const root = createCockpitSwarmCabinet(THREE, COCKPIT_SWARM_CABINET);
  const nodes = allNodes(root);
  const names = nodes.map((node) => node.name).filter(Boolean);

  assert.equal(root.userData.gameSlug, "cockpit-swarm");
  assert.deepEqual(COCKPIT_SWARM_LAYOUT, {
    width: 2.42,
    depth: 2.75,
    height: 2.48,
    screenWidth: 1.88,
    screenHeight: 1.0575,
    rearPanelZ: 1.27,
    seatZ: 0.48,
    entryGapDepth: 1.08,
  });
  for (const required of [
    "shell", "screen", "screen-bezel", "marquee", "seat-left", "seat-right",
    "control-left", "control-right", "side-art-left", "side-art-right", "rear-art",
    "rear-seat-panel", "side-wing-left", "side-wing-right", "rear-platform",
  ]) assert.ok(names.includes(required), `missing ${required}`);
  assert.equal(names.some((name) => name.startsWith("side-pod-")), false, "full-depth side walls block side entry");

  assert.equal(names.filter((name) => name.startsWith("seat-harness-")).length, 4);
  assert.equal(names.filter((name) => name.startsWith("flight-stick-")).length, 2);
  assert.ok(names.filter((name) => name.startsWith("cockpit-light-")).length >= 8);
  assert.ok(nodes.length >= 75, `expected a presentation-grade model, got ${nodes.length} nodes`);

  const leftSeat = nodes.find((node) => node.name === "seat-left");
  const rightSeat = nodes.find((node) => node.name === "seat-right");
  assert.ok(leftSeat.position.x < 0);
  assert.ok(rightSeat.position.x > 0);

  const leftSeatBack = nodes.find((node) => node.name === "seat-back-left");
  const leftControl = nodes.find((node) => node.name === "control-left");
  const rearArt = nodes.find((node) => node.name === "rear-art");
  assert.ok(leftSeatBack.position.z > 0, "seat back belongs behind the occupant, away from the screen");
  assert.ok(leftControl.position.z < leftSeat.position.z, "controls belong between the seats and screen");
  assert.ok(rearArt.position.z > leftSeat.position.z, "rear art panel belongs behind the seats");

  for (const side of ["left", "right"]) {
    const wing = nodes.find((node) => node.name === `side-wing-${side}`);
    assert.ok(wing.args[0].args[2] < 0.8, `${side} art wing must stay short enough to preserve side entry`);
  }
});
