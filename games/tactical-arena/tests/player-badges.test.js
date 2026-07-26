import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  badgeArtSrc,
  badgeTooltip,
  findBadgeById,
  normalizeBadge,
  normalizeBadges,
} from "../src/ui/playerBadges.js";
import { BADGE_ART_MANIFEST } from "../src/ui/badgeManifest.generated.js";
import { listGameBadgeCatalog } from "../../../platform-api/src/services/game-badge-catalog.mjs";

const TA_SLUG = "tactical-arena";

test("normalizeBadge keeps the display fields and rejects anything without an id", () => {
  const badge = normalizeBadge({
    badgeId: "og-commander",
    label: "OG Commander",
    description: "Fought in the opening days.",
    art: "og-commander",
    icon: "assets/player-badges/og-commander.webp",
    earn: "awarded",
    earnedAt: "2026-07-26T00:00:00.000Z",
  });
  assert.equal(badge.badgeId, "og-commander");
  assert.equal(badge.label, "OG Commander");
  assert.equal(badge.earn, "awarded");

  assert.equal(normalizeBadge(null), null);
  assert.equal(normalizeBadge({ label: "No id" }), null);
  assert.deepEqual(normalizeBadges([{ badgeId: "a" }, null, { label: "x" }]).map((b) => b.badgeId), ["a"]);
});

test("a badge with no label falls back to its id rather than rendering blank", () => {
  assert.equal(normalizeBadge({ badgeId: "mystery" }).label, "mystery");
});

test("badge art resolves from the local manifest, ignoring the server's path", () => {
  // The manifest is generated from the files that shipped, so it wins: a server pointing at
  // an asset this build doesn't have would otherwise render a broken image.
  const src = badgeArtSrc({ badgeId: "blood-moon-collector", art: "blood-moon", icon: "assets/player-badges/nope.png" });
  assert.match(src, /assets\/player-badges\/blood-moon\.webp$/);
});

test("badge art falls back to the server's icon path when the art isn't in this build", () => {
  const src = badgeArtSrc({ badgeId: "future-badge", art: "not-shipped-yet", icon: "assets/player-badges/future.webp" });
  assert.match(src, /assets\/player-badges\/future\.webp$/);
  assert.equal(badgeArtSrc({ badgeId: "no-art-at-all" }), "");
});

test("the tooltip pairs label and description, and survives a missing description", () => {
  assert.equal(badgeTooltip({ badgeId: "x", label: "Blood Moon", description: "Owns the set." }), "Blood Moon — Owns the set.");
  assert.equal(badgeTooltip({ badgeId: "x", label: "Blood Moon" }), "Blood Moon");
  assert.equal(badgeTooltip(null), "");
});

test("findBadgeById only matches an exact id", () => {
  const badges = [{ badgeId: "og-commander", label: "OG" }, { badgeId: "blood-moon-collector", label: "BM" }];
  assert.equal(findBadgeById(badges, "blood-moon-collector").label, "BM");
  assert.equal(findBadgeById(badges, "blood-moon"), null);
  assert.equal(findBadgeById(badges, ""), null);
  assert.equal(findBadgeById([], "og-commander"), null);
});

// The pipeline's real guarantee: adding a badge to the server catalog without adding its art
// (or without running `npm run badges:art` / `npm run badges`) fails here rather than
// shipping a badge that renders as a broken image.
test("every badge in the server catalog has art in this build", () => {
  const artIds = new Set(BADGE_ART_MANIFEST.map((entry) => entry.id));
  for (const badge of listGameBadgeCatalog(TA_SLUG)) {
    assert.ok(badge.art, `${badge.id} must name its art`);
    assert.ok(artIds.has(badge.art), `${badge.id} names art "${badge.art}" that is not in the badge manifest`);
    assert.notEqual(badgeArtSrc({ badgeId: badge.id, art: badge.art }), "", `${badge.id} must resolve to an image`);
  }
});

test("every manifest entry points at a file that exists, preferring the runtime WebP", () => {
  for (const entry of BADGE_ART_MANIFEST) {
    const url = new URL(`../assets/player-badges/${entry.file}`, import.meta.url);
    assert.ok(existsSync(url), `${entry.file} is in the manifest but not on disk`);
    // A .png entry means the art was never converted; the runtime would then ship the
    // full-size source, which is the thing the pipeline exists to prevent.
    assert.match(entry.file, /\.webp$/, `${entry.id} should ship as WebP — run \`npm run badges:art\``);
  }
});
