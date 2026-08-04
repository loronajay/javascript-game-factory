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
    /versionCode\s+project\.hasProperty\(['"]taVersionCode['"]\)\s*\?\s*project\.taVersionCode\.toInteger\(\)\s*:\s*9\b/,
  );
});

// A bare `gradlew.bat` only resolves because cmd.exe searches the current directory, and
// that search is off whenever NoDefaultCurrentDirectoryInExePath=1 (a hardening setting
// present in some agent/CI shells) — the script then dies with "not recognized". Worse, it
// fails *after* `npm run sync` prints a wall of success, so it reads as a good build. Keep
// the explicit `.\` prefix. (cmd.exe accepts `.\` and rejects `./`; Git Bash is the
// reverse, and npm defaults to cmd.exe on Windows.)
test("gradle npm scripts invoke gradlew by explicit relative path", async () => {
  const { scripts } = JSON.parse(
    await readFile(path.join(ROOT, "package.json"), "utf8"),
  );

  const gradleScripts = Object.entries(scripts).filter(([, body]) =>
    body.includes("gradlew"),
  );
  assert.ok(gradleScripts.length > 0, "expected at least one gradlew script");

  for (const [name, body] of gradleScripts) {
    assert.match(
      body,
      /\.\\gradlew\.bat\b/,
      `${name} must call .\\gradlew.bat, not a bare or ./-prefixed gradlew.bat`,
    );
    assert.doesNotMatch(
      body,
      /(?<![.\\])\bgradlew\.bat/,
      `${name} has an unprefixed gradlew.bat`,
    );
  }
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
