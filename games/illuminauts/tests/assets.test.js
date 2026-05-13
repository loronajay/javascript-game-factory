import assert from 'node:assert/strict';

import { createSpriteCatalog, drawScreenSpriteContain, drawSprite, getScreenSpriteContainRect, loadImageSource, spriteAssetDefs } from '../scripts/assets.js';

function testSpriteAssetDefsUseIndividualPngs() {
  assert.equal(spriteAssetDefs.playerDown.src, './assets/player-down.png');
  assert.equal(spriteAssetDefs.accessChip.src, './assets/access-chip.png');
  assert.equal(spriteAssetDefs.laserDoorActiveWide.src, './assets/closed-door.png');
  assert.equal(spriteAssetDefs.beacon00.src, './assets/beacon-core.png');
  assert.equal(spriteAssetDefs.menuSplash.src, './assets/menu-splash1.png');
  assert.equal(spriteAssetDefs.lobbySplash.src, './assets/lobby-splash.png');
  assert.equal(spriteAssetDefs.playerDown.src.endsWith('/player-down.png'), true);
  assert.equal(spriteAssetDefs.accessChip.src.endsWith('/access-chip.png'), true);
  assert.equal(spriteAssetDefs.laserDoorActiveWide.src.endsWith('/closed-door.png'), true);
  assert.equal(spriteAssetDefs.beacon00.src.endsWith('/beacon-core.png'), true);
  assert.deepEqual(spriteAssetDefs.beacon00.slice, { cols: 3, rows: 3, col: 0, row: 0 });
  assert.deepEqual(spriteAssetDefs.beacon11.slice, { cols: 3, rows: 3, col: 1, row: 1 });
  assert.deepEqual(spriteAssetDefs.beacon22.slice, { cols: 3, rows: 3, col: 2, row: 2 });
}

function testCreateSpriteCatalogReadsImageDimensions() {
  const catalog = createSpriteCatalog({
    [spriteAssetDefs.playerDown.src]: { width: 119, height: 154 },
    [spriteAssetDefs.beacon00.src]: { width: 300, height: 330 }
  });

  assert.deepEqual(catalog.playerDown, {
    image: { width: 119, height: 154 },
    w: 119,
    h: 154
  });
  assert.deepEqual(catalog.beacon11, {
    image: { width: 300, height: 330 },
    sx: 100,
    sy: 110,
    sw: 100,
    sh: 110,
    w: 100,
    h: 110
  });
}

function testDrawSpriteUsesWholeImageForIndividualPngs() {
  const calls = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage(...args) {
      calls.push(args);
    }
  };

  const ok = drawSprite(ctx, 'playerDown', 10, 20, 30, 40, createSpriteCatalog({
    [spriteAssetDefs.playerDown.src]: { width: 119, height: 154 }
  }));

  assert.equal(ok, true);
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.deepEqual(calls, [
    [{ width: 119, height: 154 }, 10, 20, 30, 40]
  ]);
}

function testDrawSpriteUsesBeaconSliceWhenPresent() {
  const calls = [];
  const ctx = {
    imageSmoothingEnabled: true,
    drawImage(...args) {
      calls.push(args);
    }
  };

  const ok = drawSprite(ctx, 'beacon11', 5, 6, 7, 8, createSpriteCatalog({
    [spriteAssetDefs.beacon00.src]: { width: 300, height: 330 }
  }));

  assert.equal(ok, true);
  assert.deepEqual(calls, [
    [{ width: 300, height: 330 }, 100, 110, 100, 110, 5, 6, 7, 8]
  ]);
}

function testDrawScreenSpriteContainCentersAndShowsFullImage() {
  const calls = [];
  const ctx = {
    drawImage(...args) {
      calls.push(args);
    }
  };

  const ok = drawScreenSpriteContain(ctx, 'menuSplash', 800, 600, {
    menuSplash: { image: { width: 1600, height: 900 }, w: 1600, h: 900 }
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].width, 1600);
  assert.equal(calls[0][0].height, 900);
  assert.equal(calls[0][1], 0);
  assert.ok(Math.abs(calls[0][2] - 75) < 0.00001);
  assert.equal(calls[0][3], 800);
  assert.ok(Math.abs(calls[0][4] - 450) < 0.00001);
}

function testGetScreenSpriteContainRectReportsLetterboxBounds() {
  assert.deepEqual(
    getScreenSpriteContainRect('menuSplash', 800, 600, {
      menuSplash: { image: { width: 1600, height: 900 }, w: 1600, h: 900 }
    }),
    { x: 0, y: 75, w: 800, h: 450 }
  );
}

async function testLoadImageSourceDoesNotMissImmediateLoad() {
  class ImmediateImage {
    set src(value) {
      this._src = value;
      this.onload();
    }

    get src() {
      return this._src;
    }
  }

  const image = await loadImageSource('./assets/menu-splash1.png', ImmediateImage);
  assert.equal(image.src, './assets/menu-splash1.png');
}

async function run() {
  testSpriteAssetDefsUseIndividualPngs();
  testCreateSpriteCatalogReadsImageDimensions();
  testDrawSpriteUsesWholeImageForIndividualPngs();
  testDrawSpriteUsesBeaconSliceWhenPresent();
  testDrawScreenSpriteContainCentersAndShowsFullImage();
  testGetScreenSpriteContainRectReportsLetterboxBounds();
  await testLoadImageSourceDoesNotMissImmediateLoad();
  console.log('Illuminauts asset tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
