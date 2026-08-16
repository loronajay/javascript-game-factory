import { test } from "node:test";
import assert from "node:assert/strict";

import { ownedSkinsForBowler } from "./character-inspector.mjs";

const animation = {
  DEFAULT_SKIN_ID: "canon",
  AVAILABLE_SKINS: [
    { id: "canon", name: "Classic" },
    { id: "swimsuit", name: "Swimsuit" },
    { id: "maid", name: "Maid Cafe" },
  ],
};

test("character inspection exposes only skins owned for the inspected bowler", () => {
  const owned = new Set(["skin:reina-sato:canon", "skin:reina-sato:maid"]);
  const skins = ownedSkinsForBowler(animation, { owns: (id) => owned.has(id) }, "reina-sato");

  assert.deepEqual(skins.map((skin) => skin.id), ["canon", "maid"]);
});

test("character inspection fails closed to Canon when ownership data is unavailable", () => {
  assert.deepEqual(
    ownedSkinsForBowler(animation, null, "reina-sato").map((skin) => skin.id),
    ["canon"],
  );
});
