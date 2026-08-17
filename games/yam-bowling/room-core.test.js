const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RoomCore = require("./room-core.js");
const cosmetics = require("./cosmetics-core.js");

const { DEFAULT_ROOM_SLUG, ROOMS, getRoom } = RoomCore;
const root = __dirname;

test("every room is a kebab-case slug with art derived from it", () => {
  for (const room of ROOMS) {
    assert.match(room.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${room.slug} should be a kebab-case slug`);
    assert.equal(room.src, `assets/menu-splashes/player-rooms/${room.slug}.webp`);
    assert.ok(room.name.length > 0);
    assert.ok(room.description.length > 0);
  }
});

test("room slugs are unique", () => {
  const slugs = ROOMS.map((room) => room.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("every room's painted backdrop has shipped as WebP", () => {
  for (const room of ROOMS) {
    assert.equal(
      fs.existsSync(path.join(root, room.src)),
      true,
      `${room.slug} is catalogued but its runtime image is missing — rerun tools/optimize_runtime_assets.py`,
    );
  }
});

test("the starter room is the default, and it is the only room a new player owns", () => {
  assert.equal(DEFAULT_ROOM_SLUG, "default");
  const founding = ROOMS.filter((room) => room.unlock.source === "founding");
  assert.deepEqual(founding.map((room) => room.slug), [DEFAULT_ROOM_SLUG]);
});

test("every other room is earned, and names the route it is earned by", () => {
  for (const room of ROOMS.filter((entry) => entry.slug !== DEFAULT_ROOM_SLUG)) {
    assert.notEqual(room.unlock.source, "founding", `${room.slug} should be unlockable`);
    assert.ok(["campaign", "achievement", "tournament", "bowler-level"].includes(room.unlock.source), `${room.slug} has an unroutable unlock source`);
    assert.ok(room.unlock.detail.length > 0);
  }
});

test("the champion room is the rare room prize for tournament winners", () => {
  const room = getRoom("champion-room");
  assert.equal(room.unlock.source, "tournament");
  assert.equal(room.tier, "legendary");
});

test("an unknown or missing slug falls back to the starter room rather than throwing", () => {
  assert.equal(getRoom("not-a-room").slug, DEFAULT_ROOM_SLUG);
  assert.equal(getRoom(undefined).slug, DEFAULT_ROOM_SLUG);
  assert.equal(getRoom("").slug, DEFAULT_ROOM_SLUG);
});

test("rooms own no persistence: the loadout is their only owner", () => {
  const source = fs.readFileSync(path.join(root, "room-core.js"), "utf8");
  assert.doesNotMatch(source, /localStorage|setItem|getItem|STORAGE_KEY/);
  assert.equal("loadRoomSlug" in RoomCore, false);
  assert.equal("saveRoomSlug" in RoomCore, false);
});

test("every room reaches the cosmetic catalog as an item carrying its own unlock", () => {
  for (const room of ROOMS) {
    const item = cosmetics.getItem(cosmetics.buildItemId("room", room.slug));
    assert.notEqual(item, null, `${room.slug} should be catalogued`);
    assert.equal(item.type, "room");
    assert.equal(item.scope, "global");
    assert.equal(item.assets.art, room.src);
    assert.equal(item.tier, room.tier);
    assert.equal(item.unlock.source, room.unlock.source);
  }
  assert.equal(cosmetics.listByType("room").length, ROOMS.length);
});

test("only the starter room is owned by default, so the rest have somewhere to be earned from", () => {
  const ownedByDefault = cosmetics.listByType("room")
    .filter((item) => cosmetics.isOwnedByDefault(item.id))
    .map((item) => item.id);
  assert.deepEqual(ownedByDefault, [cosmetics.buildItemId("room", DEFAULT_ROOM_SLUG)]);
});
