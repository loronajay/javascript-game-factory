const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const Animation = require("./animation-core.js");
const MenuSplash = require("./menu-splash-core.js");
const runtimeManifest = require("./runtime-assets.json");

const root = __dirname;
const imageBudgetBytes = runtimeManifest.budgets.runtimeImageBytes;

function runtimeImagePaths() {
  const images = ["assets/lanes/1.webp", "assets/pins/1.webp"];
  for (const splash of MenuSplash.MENU_SPLASHES) {
    images.push(splash.src, splash.thumbnailSrc);
  }
  for (const bowler of Animation.CANON_BOWLERS) {
    images.push(Animation.getPortraitAssetPath(bowler));
    images.push(Animation.getResultPortraitAssetPath(bowler, "victory"));
    images.push(Animation.getResultPortraitAssetPath(bowler, "defeat"));
    for (const skin of Animation.AVAILABLE_SKINS) {
      images.push(Animation.getPortraitAssetPath(bowler, skin.id));
      for (let frame = 1; frame <= Animation.THROW_FRAME_COUNT; frame += 1) {
        images.push(Animation.getFrameAssetPath(bowler, frame, skin.id));
      }
    }
  }
  return [...new Set(images)];
}

test("every player-facing image is WebP and the complete runtime set stays under budget", () => {
  const images = runtimeImagePaths();
  assert.equal(images.length, 482);
  assert.equal(images.every((imagePath) => imagePath.endsWith(".webp")), true);
  assert.deepEqual(images.filter((imagePath) => !fs.existsSync(path.join(root, imagePath))), []);

  const bytes = images.reduce(
    (total, imagePath) => total + fs.statSync(path.join(root, imagePath)).size,
    0,
  );
  assert.ok(bytes <= imageBudgetBytes, `runtime images use ${(bytes / 1024 / 1024).toFixed(2)} MB`);
});
