import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("release builds default to the next unused Play version code", async () => {
  const buildGradle = await readFile(
    path.join(ROOT, "android", "app", "build.gradle"),
    "utf8",
  );

  assert.match(
    buildGradle,
    /versionCode\s+project\.hasProperty\(['"]taVersionCode['"]\)\s*\?\s*project\.taVersionCode\.toInteger\(\)\s*:\s*8\b/,
  );
});

test("release builds enable the supported R8 optimization pipeline", async () => {
  const buildGradle = await readFile(
    path.join(ROOT, "android", "app", "build.gradle"),
    "utf8",
  );
  const gradleProperties = await readFile(
    path.join(ROOT, "android", "gradle.properties"),
    "utf8",
  );

  assert.match(buildGradle, /\bminifyEnabled\s+true\b/);
  assert.match(buildGradle, /\bshrinkResources\s+true\b/);
  assert.match(
    buildGradle,
    /getDefaultProguardFile\(['"]proguard-android-optimize\.txt['"]\)/,
  );
  assert.match(
    gradleProperties,
    /^android\.r8\.optimizedResourceShrinking=true$/m,
  );
});
