import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../scripts/sim/constants.js";
import {
  DEFAULT_LOCATION,
  LOCATIONS,
  locationBackdropPath,
  locationById,
  locationIds,
} from "../scripts/assets/location-catalog.js";

suite("location catalog — the rooms, which are cosmetic and must stay that way");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every location is uniquely identified and carries the copy the picker needs", () => {
  const ids = LOCATIONS.map((location) => location.id);
  assertEqual(new Set(ids).size, ids.length, "an id is what a saved preference stores");
  for (const location of LOCATIONS) {
    assert(location.label, `${location.id} has no label`);
    assert(location.blurb, `${location.id} has no blurb`);
  }
});

test("the default location exists in the catalog", () => {
  assert(locationIds().includes(DEFAULT_LOCATION));
});

test("the spec-authored hall, gym and arena rooms ship in the picker", () => {
  for (const id of ["rec-hall", "school-gym", "fieldhouse"]) {
    assert(locationIds().includes(id), `${id} is missing from the location catalog`);
  }
});

test("an unknown location id falls back to the default instead of throwing", () => {
  assertEqual(locationById("moon-base").id, DEFAULT_LOCATION);
  assertEqual(locationById(undefined).id, DEFAULT_LOCATION);
});

test("a location carries no geometry, physics or scoring fields", () => {
  // The guard against someone quietly making a room matter. If a room ever
  // should matter, it has to join the leaderboard key first — see store/boards.js.
  const allowed = new Set(["id", "label", "blurb"]);
  for (const location of LOCATIONS) {
    for (const key of Object.keys(location)) {
      assert(allowed.has(key), `${location.id} carries unexpected field "${key}"`);
    }
  }
});

test("every backdrop exists on disk", () => {
  for (const location of LOCATIONS) {
    const relative = locationBackdropPath(location.id);
    assert(fs.existsSync(path.join(gameRoot, relative)), `missing ${relative}`);
  }
});

test("no stray backdrops sit unclaimed in the asset folder", () => {
  const dir = path.join(gameRoot, "assets", "backgrounds");
  const onDisk = fs.readdirSync(dir).filter((name) => name.endsWith(".jpg"));
  assertEqual(onDisk.length, LOCATIONS.length, `${onDisk.length} backdrops for ${LOCATIONS.length} locations`);
});

test("every backdrop is authored at exactly canvas size, so it blits 1:1", () => {
  for (const location of LOCATIONS) {
    const buffer = fs.readFileSync(path.join(gameRoot, locationBackdropPath(location.id)));
    const size = jpegSize(buffer);
    assert(size, `${location.id} is not a readable JPEG`);
    assertEqual(size.width, CANVAS_WIDTH, `${location.id} width`);
    assertEqual(size.height, CANVAS_HEIGHT, `${location.id} height`);
  }
});

/** Read width/height out of a JPEG's start-of-frame marker. */
function jpegSize(buffer) {
  for (let i = 2; i < buffer.length; ) {
    if (buffer[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buffer[i + 1];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

finish();
