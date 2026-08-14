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

test("Yam Bowling online results use the shared account-bound ELO ladder", () => {
  const ladderCatalog = fs.readFileSync(path.join(repoRoot, "platform-api", "src", "services", "ladder-catalog.mts"), "utf8");
  assert.match(
    ladderCatalog,
    /gameSlug:\s*["']yam-bowling["'][\s\S]*?source:\s*["']game-ratings["'][\s\S]*?unitLabel:\s*["']ELO["']/,
    "yam-bowling should persist online records through the shared game_ratings ladder",
  );
});
