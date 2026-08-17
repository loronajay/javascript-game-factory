const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const Animation = require("./animation-core.js");
const MenuSplash = require("./menu-splash-core.js");
const LaneCore = require("./lane-core.js");
const RoomCore = require("./room-core.js");
const Cosmetics = require("./cosmetics-core.js");
const runtimeManifest = require("./runtime-assets.json");

const root = __dirname;
const imageBudgetBytes = runtimeManifest.budgets.runtimeImageBytes;

function runtimeImagePaths() {
  const images = ["assets/pins/1.webp"];
  for (const lane of LaneCore.LANES) {
    images.push(lane.src, lane.thumbnailSrc);
  }
  for (const splash of MenuSplash.MENU_SPLASHES) {
    images.push(splash.src, splash.thumbnailSrc);
  }
  // Full-screen backdrops with no picker thumbnail. A locked room still ships:
  // ownership decides who may equip one, never whether the art is published.
  for (const room of RoomCore.ROOMS) {
    images.push(room.src);
  }
  for (const type of ["title", "badge"]) {
    for (const item of Cosmetics.listByType(type)) {
      if (item.assets.art) images.push(item.assets.art);
    }
  }
  for (const bowler of Animation.CANON_BOWLERS) {
    images.push(Animation.getPortraitAssetPath(bowler));
    images.push(Animation.getResultPortraitAssetPath(bowler, "victory"));
    images.push(Animation.getResultPortraitAssetPath(bowler, "defeat"));
    for (const skin of Animation.AVAILABLE_SKINS) {
      images.push(Animation.getPortraitAssetPath(bowler, skin.id));
      images.push(Animation.getResultPortraitAssetPath(bowler, "victory", skin.id));
      images.push(Animation.getResultPortraitAssetPath(bowler, "defeat", skin.id));
      for (let frame = 1; frame <= Animation.THROW_FRAME_COUNT; frame += 1) {
        images.push(Animation.getFrameAssetPath(bowler, frame, skin.id));
      }
    }
  }
  return [...new Set(images)];
}

test("every player-facing image is WebP and the complete runtime set stays under budget", () => {
  const images = runtimeImagePaths();
  assert.equal(images.length, 1071);
  assert.equal(images.every((imagePath) => imagePath.endsWith(".webp")), true);
  assert.deepEqual(images.filter((imagePath) => !fs.existsSync(path.join(root, imagePath))), []);

  const bytes = images.reduce(
    (total, imagePath) => total + fs.statSync(path.join(root, imagePath)).size,
    0,
  );
  assert.ok(bytes <= imageBudgetBytes, `runtime images use ${(bytes / 1024 / 1024).toFixed(2)} MB`);
});
