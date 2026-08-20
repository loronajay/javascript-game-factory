import test from "node:test";
import assert from "node:assert/strict";

import {
  DIRECTIONS,
  decodePng,
  isGuardEditAllowed,
} from "../scripts/build-guard-review.mjs";

const ROOT = new URL("../", import.meta.url);

test("guard v3 preserves Maddie's approved stance and only edits glove and sleeve zones", () => {
  for (const direction of DIRECTIONS) {
    const idle = decodePng(new URL(`assets/characters/maddie-bloom/sprites/idle/${direction}.png`, ROOT));
    const guard = decodePng(new URL(`review/maddie-bloom/sprites/guard-v3/${direction}.png`, ROOT));
    assert.equal(guard.width, idle.width, `${direction} width`);
    assert.equal(guard.height, idle.height, `${direction} height`);
    let changedInsideZone = 0;
    for (let y = 0; y < idle.height; y += 1) {
      for (let x = 0; x < idle.width; x += 1) {
        const index = (y * idle.width + x) * 4;
        const same = idle.pixels.subarray(index, index + 4).equals(guard.pixels.subarray(index, index + 4));
        if (y >= 250) assert.equal(same, true, `${direction} changed stance pixel ${x},${y}`);
        if (isGuardEditAllowed(direction, x, y)) {
          if (!same) changedInsideZone += 1;
        } else {
          assert.equal(same, true, `${direction} changed locked pixel ${x},${y}`);
        }
      }
    }
    if (direction === "right" || direction === "left") {
      assert.equal(changedInsideZone, 0, `${direction} must reuse the approved profile without warping its glove`);
    } else {
      assert.ok(changedInsideZone > 500, `${direction} must visibly change its guard`);
    }
  }
});
