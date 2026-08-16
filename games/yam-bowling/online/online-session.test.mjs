import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeOnlineSetupSkin } from "./online-session.mjs";

test("online presentation replaces a stale selection with the currently owned skin", () => {
  const setup = { characterSlug: "reina-sato", skinId: "maid" };
  const seen = [];

  const skinId = sanitizeOnlineSetupSkin(setup, (slug) => {
    seen.push(slug);
    return "canon";
  });

  assert.deepEqual(seen, ["reina-sato"]);
  assert.equal(skinId, "canon");
  assert.equal(setup.skinId, "canon");
});
