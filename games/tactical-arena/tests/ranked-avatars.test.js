import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  RANKED_AVATARS,
  getRankedAvatar,
  hasRankedAvatar,
  rankedAvatarSpriteStyle,
} from "../src/ui/rankedAvatars.js";

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ranked avatar sheets expose every icon in both 8x8 sheets", () => {
  assert.equal(RANKED_AVATARS.length, 128);
  assert.deepEqual(
    RANKED_AVATARS.slice(0, 2).map(({ id, sheet, row, col }) => ({ id, sheet, row, col })),
    [
      { id: "avatar-001", sheet: "sheet-1", row: 0, col: 0 },
      { id: "avatar-002", sheet: "sheet-1", row: 0, col: 1 },
    ],
  );
  assert.deepEqual(
    RANKED_AVATARS.slice(-2).map(({ id, sheet, row, col }) => ({ id, sheet, row, col })),
    [
      { id: "avatar-127", sheet: "sheet-2", row: 7, col: 6 },
      { id: "avatar-128", sheet: "sheet-2", row: 7, col: 7 },
    ],
  );
});

test("ranked avatar sheets point at converted webp assets", () => {
  for (const avatar of RANKED_AVATARS) {
    assert.ok(avatar.src.startsWith("assets/avatars/"), `${avatar.id} should live under assets/avatars/`);
    assert.ok(avatar.src.endsWith(".webp"), `${avatar.id} should use WebP`);
    assert.ok(existsSync(join(GAME_ROOT, avatar.src)), `${avatar.id} asset is missing: ${avatar.src}`);
  }
});

test("ranked avatar lookup rejects legacy unit ids and unknown ids", () => {
  assert.equal(hasRankedAvatar("avatar-001"), true);
  assert.equal(getRankedAvatar("avatar-001")?.label, "Avatar 001");
  assert.equal(hasRankedAvatar("swordsman"), false);
  assert.equal(getRankedAvatar("dragon"), null);
});

test("ranked avatar sprite styles use prepared sheets without per-sheet nudges", () => {
  const first = rankedAvatarSpriteStyle(getRankedAvatar("avatar-001"));
  const secondSheet = rankedAvatarSpriteStyle(getRankedAvatar("avatar-065"));

  assert.equal(first.backgroundImage, "url(\"assets/avatars/avatar-sheet-1.webp\")");
  assert.equal(first.backgroundSize, "800% 800%");
  assert.equal(first.backgroundPosition, "0% 0%");
  assert.equal(first.nudgeX, "0%");
  assert.equal(secondSheet.nudgeX, "0%");
  assert.equal(first.nudgeY, secondSheet.nudgeY);
});

test("ranked avatar css keeps sprite cells square inside portrait-shaped frames", () => {
  const css = readFileSync(join(GAME_ROOT, "styles/screens/features.css"), "utf8");
  assert.match(
    css,
    /\.ranked-avatar-icon-sprite\s*\{[^}]*width:108%[^}]*aspect-ratio:1\/1[^}]*transform:translate\(calc\(-50% \+ var\(--avatar-nudge-x,0\)\),calc\(-50% \+ var\(--avatar-nudge-y,0\)\)\)/s,
  );
});
