import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReleaseAudit, formatBytes } from "../scripts/release-audit.mjs";

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("release audit reports package-weight buckets and top files", async () => {
  const audit = await buildReleaseAudit({ root: GAME_ROOT, topCount: 5 });

  assert.ok(audit.totalBytes > 0);
  assert.ok(audit.buckets.music.bytes > 0, "music bucket should include mp3 tracks");
  assert.ok(audit.buckets.unitArt.bytes > 0, "unit art bucket should include portraits and skins");
  assert.ok(audit.buckets.source.bytes > 0, "source bucket should include JS/CSS/HTML");
  assert.equal(audit.topFiles.length, 5);
  assert.ok(audit.topFiles[0].bytes >= audit.topFiles[1].bytes);
});

test("release audit flags known oversized release assets", async () => {
  const audit = await buildReleaseAudit({ root: GAME_ROOT, topCount: 5 });
  const warningText = audit.warnings.map((warning) => warning.path).join("\n");

  assert.match(warningText, /sounds\/summoner-battle\.mp3/);
  assert.match(warningText, /assets\/campaign-map\.png/);
});

test("formatBytes uses readable binary units", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MiB");
});
