// Builds the Capacitor web payload from the live web sources.
//
// This is a COPY step, not a fork. The web app under games/tactical-arena/ stays
// the single source of truth; nothing here edits it. Run it before `cap sync`.
//
// The critical constraint is layout. Tactical Arena reaches the shared platform
// modules with `../../../../js/platform/**` from inside src/, so the payload has
// to preserve the repo-relative shape:
//
//   www/games/tactical-arena/...   (the game)
//   www/js/platform/...            (shared platform modules)
//   www/js/platform-config.mjs     (sets the API base URL)
//
// Capacitor loads www/index.html, so a tiny root redirect hands off to the game.
// Preserving the paths exactly is what lets the app run the real web code with
// zero source changes.

import { cp, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { optimizeImages } from "./optimize-images.mjs";
import { optimizeAudio } from "./optimize-audio.mjs";
import { bundleFonts } from "./bundle-fonts.mjs";
import { enableTouchCss } from "./enable-touch-css.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
// mobile/tactical-arena -> mobile -> javascript-games
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");
const WWW = path.join(APP_ROOT, "www");

const GAME_SRC = path.join(REPO_ROOT, "games", "tactical-arena");
const GAME_DEST = path.join(WWW, "games", "tactical-arena");

// Excluded from the shipped payload. `promo-material` alone is 33MB of store art
// that the game never loads at runtime.
const GAME_EXCLUDES = new Set([
  "assets/promo-material",
  // 12.9MB of source art (UUID-named `*_removalai_preview.png` exports). An audit of
  // every src/styles/html reference found zero uses — the title mark is a pure CSS
  // gradient, not an image. Kept in the repo as source, never shipped.
  "assets/logos",
  // Balance-simulation output: raw per-match records plus the fitted analysis, read only
  // by scripts/ and the docs tests, never by anything in src/ or a page. It was worth
  // 9.2MB of a 58MB bundle — and because `sim-*.json` is gitignored, whether the shipped
  // artifact carried it depended on whether whoever cut the release happened to have run
  // `npm run sim` on that machine. Exclude it so the payload can't vary that way.
  "balance-data",
  "tests",
  "scripts",
  "platform-api",
  "node_modules",
  ".mobile-shots",
  "sandbox.html",
  "vfx-gallery.html",
  "package.json",
  "package-lock.json",
  "skills-lock.json",
  "game.json",
]);

function makeFilter(root, excludes) {
  return (source) => {
    const rel = path.relative(root, source).split(path.sep).join("/");
    if (!rel) return true;
    // Markdown is documentation, never loaded at runtime.
    if (rel.endsWith(".md")) return false;
    // A PNG that has a WebP sibling is the authoring master, not the runtime asset —
    // the repo's convention (see the badge pipeline) is PNG source, WebP runtime, and
    // an audit found zero .png references outside badgeManifest.generated.js. Badges
    // whose WebP has not been generated yet keep their PNG, so in-progress art still
    // ships rather than turning into a broken image.
    if (rel.endsWith(".png") && existsSync(source.replace(/\.png$/i, ".webp"))) return false;
    // TypeScript sources; the browser loads the emitted .mjs siblings.
    if (rel.endsWith(".mts") || rel.endsWith(".ts")) return false;
    if (rel.includes(".test.")) return false;
    for (const excluded of excludes) {
      if (rel === excluded || rel.startsWith(`${excluded}/`)) return false;
    }
    return true;
  };
}

// Pure Node rather than shelling out to `du`: this script runs from PowerShell as
// often as from Git Bash, and `du` does not exist there.
async function dirSize(target) {
  const { readdir, stat } = await import("node:fs/promises");
  let total = 0;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    }
  }
  try {
    await walk(target);
    return `${Math.round(total / (1024 * 1024))} MB`;
  } catch {
    return "unknown";
  }
}

const ROOT_REDIRECT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Tactical Arena</title>
    <style>
      html, body { margin: 0; height: 100%; background: #140d06; }
    </style>
    <script>
      // Capacitor always loads the webDir root. The game itself must stay at its
      // repo-relative path so its ../../../../js/platform imports resolve, so this
      // hands off immediately. replace() keeps it out of the history stack, which
      // matters for Android hardware-back behaviour.
      location.replace("games/tactical-arena/index.html" + location.search);
    </script>
  </head>
  <body></body>
</html>
`;

async function main() {
  await rm(WWW, { recursive: true, force: true });
  await mkdir(WWW, { recursive: true });

  await cp(GAME_SRC, GAME_DEST, {
    recursive: true,
    filter: makeFilter(GAME_SRC, GAME_EXCLUDES),
  });

  const platformSrc = path.join(REPO_ROOT, "js", "platform");
  await cp(platformSrc, path.join(WWW, "js", "platform"), {
    recursive: true,
    filter: makeFilter(platformSrc, new Set()),
  });

  await cp(
    path.join(REPO_ROOT, "js", "platform-config.mjs"),
    path.join(WWW, "js", "platform-config.mjs"),
  );

  await writeFile(path.join(WWW, "index.html"), ROOT_REDIRECT, "utf8");

  // Fail loudly here rather than as a blank screen on the device.
  const entry = path.join(GAME_DEST, "index.html");
  await stat(entry);
  await stat(path.join(WWW, "js", "platform", "api", "platform-api.mjs"));

  const raw = await dirSize(WWW);
  const optimized = await optimizeImages(WWW, {
    onProgress: ({ total, toEncode, fromCache }) =>
      console.log(`  images:    ${total} (${toEncode} to encode, ${fromCache} cached)`),
  });
  const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  console.log(`  image art: ${mb(optimized.bytesBefore)} -> ${mb(optimized.bytesAfter)}`);
  if (optimized.failed.length) {
    console.log(`  WARNING: ${optimized.failed.length} image(s) failed to optimize`);
    for (const failure of optimized.failed.slice(0, 5)) {
      console.log(`    ${failure.src}: ${failure.error}`);
    }
  }

  const audio = await optimizeAudio(WWW, {
    onProgress: ({ total }) => console.log(`  audio:     ${total} files`),
  });
  if (audio.skipped) {
    console.log(`  audio:     skipped (${audio.skipped})`);
  } else {
    console.log(
      `  audio:     ${mb(audio.bytesBefore)} -> ${mb(audio.bytesAfter)}` +
        `  (${audio.encoded} encoded, ${audio.fromCache} cached, ${audio.replaced} refs repointed)`,
    );
  }

  const fonts = await bundleFonts(WWW, {
    onProgress: ({ total }) => console.log(`  fonts:     ${total} faces (latin + latin-ext)`),
  });
  if (fonts.skipped) {
    console.log(`  fonts:     skipped (${fonts.skipped})`);
  } else {
    console.log(
      `  fonts:     ${mb(fonts.bytes)} bundled` +
        `  (${fonts.downloaded} downloaded, ${fonts.cached} cached)`,
    );
  }

  const touch = await enableTouchCss(WWW);
  console.log(`  touch css: ${touch.queries} media queries un-gated across ${touch.files} file(s)`);

  console.log(`  www built: ${raw} -> ${await dirSize(WWW)}`);
  console.log(`  entry:     www/games/tactical-arena/index.html`);
}

main().catch((error) => {
  console.error(`build-www failed: ${error.message}`);
  process.exit(1);
});
