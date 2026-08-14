const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cabinetRoot = __dirname;
const repoRoot = path.resolve(cabinetRoot, "..", "..");

test("Yam Bowling satisfies the arcade grid registration contract", () => {
  const metadataPath = path.join(cabinetRoot, "game.json");
  assert.equal(fs.existsSync(metadataPath), true, "game.json should exist beside the cabinet entry point");

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert.equal(metadata.title, "Yam Bowling");
  assert.equal(metadata.order, 14);

  const catalog = fs.readFileSync(path.join(repoRoot, "js", "arcade-catalog.mts"), "utf8");
  assert.match(catalog, /["']yam-bowling["']/, "the shared arcade catalog should include yam-bowling");

  const previewPath = path.join(repoRoot, "grid-previews", "yam-bowling.png");
  assert.equal(fs.existsSync(previewPath), true, "the grid preview should exist at the canonical slug path");
});
