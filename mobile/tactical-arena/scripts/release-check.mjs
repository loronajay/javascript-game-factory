// Preflight for a Play upload. Checks the things that fail expensively — after a build,
// or worse, after an upload Play then refuses — rather than the things a build catches.
//
//   node scripts/release-check.mjs
//
// Exits non-zero if anything is wrong, so it can gate a release script.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SOURCE_MANIFEST, hashSources } from "./source-manifest.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ANDROID = path.join(ROOT, "android");
const GAME = path.resolve(ROOT, "..", "..", "games", "tactical-arena");
const WWW = path.join(ROOT, "www");
const PACKAGE_NAME = "com.jayarcade.tacticalarena";

const problems = [];
const notes = [];

const exists = async (target) => {
  try {
    return await stat(target);
  } catch {
    return null;
  }
};

const read = async (target) => {
  try {
    return await readFile(target, "utf8");
  } catch {
    return "";
  }
};

function parseProperties(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return out;
}

async function checkSigning() {
  const propertiesPath = path.join(ANDROID, "keystore.properties");
  if (!(await exists(propertiesPath))) {
    problems.push(
      "android/keystore.properties is missing — the release build would be UNSIGNED and Play "
      + "will reject it. See HANDOFF.md §4b for the keytool command.",
    );
    return;
  }
  const properties = parseProperties(await read(propertiesPath));
  for (const key of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) {
    if (!properties[key]) problems.push(`android/keystore.properties is missing '${key}'`);
  }
  if (properties.storeFile) {
    // Gradle resolves a relative storeFile against android/app/, not android/.
    const resolved = path.resolve(path.join(ANDROID, "app"), properties.storeFile);
    if (!(await exists(resolved))) {
      problems.push(`keystore not found at ${resolved} (storeFile is resolved relative to android/app/)`);
    } else {
      notes.push(`signing keystore: ${resolved}`);
    }
  }
}

async function checkPackageAndVersion() {
  const gradle = await read(path.join(ANDROID, "app", "build.gradle"));
  if (!gradle.includes(`applicationId "${PACKAGE_NAME}"`)) {
    problems.push(`applicationId in app/build.gradle does not match ${PACKAGE_NAME}, which the server and product catalog assume`);
  }
  const versionCode = gradle.match(/taVersionCode.*?:\s*(\d+)/)?.[1];
  const versionName = gradle.match(/taVersionName.*?:\s*"([^"]+)"/)?.[1];
  if (versionCode) {
    notes.push(`default versionCode ${versionCode} / versionName ${versionName || "?"} — override with -PtaVersionCode=N`);
    notes.push("Play refuses a versionCode it has already accepted; bump it for every upload.");
  }
}

async function checkMobileSecurity() {
  const manifest = await read(path.join(ANDROID, "app", "src", "main", "AndroidManifest.xml"));
  if (!/android:allowBackup="false"/.test(manifest)) {
    problems.push("Android app backups must be disabled so WebView account/session data is not copied off-device.");
  }
  if (!/android:usesCleartextTraffic="false"/.test(manifest)) {
    problems.push("Android cleartext traffic must be disabled; the packaged app and API use HTTPS.");
  }

  const capacitor = JSON.parse(await read(path.join(ROOT, "capacitor.config.json")) || "{}");
  if (capacitor?.android?.allowMixedContent !== false) {
    problems.push("capacitor.config.json must keep android.allowMixedContent=false.");
  }
  if (capacitor?.server?.androidScheme !== "https") {
    problems.push("capacitor.config.json must keep server.androidScheme=https.");
  }
}

// The payload is generated, gitignored, and easy to forget. Shipping a stale one is the
// single most expensive mistake in this pipeline (see HANDOFF.md §5 on `cap sync`).
async function checkPayload() {
  const payloadIndex = path.join(ROOT, "www", "games", "tactical-arena", "index.html");
  const payload = await exists(payloadIndex);
  if (!payload) {
    problems.push("www/ has not been built — run `npm run build:www` (the release scripts do this for you).");
    return;
  }
  // Comparing only index.html was too narrow to catch anything real: index.html barely ever
  // changes, while the code that does — src/, styles/, and the shared js/platform modules the
  // game imports — could all be stale with the check still green.
  //
  // build-www writes a content fingerprint of everything it copied to www/.build-sources.json.
  // Re-hash the sources and compare. Content, not timestamps: `npm test` regenerates the skin
  // and badge manifests on every run, so an mtime gate flagged the payload stale after every
  // test run — a gate that always fires is a gate nobody reads.
  const manifestPath = path.join(WWW, SOURCE_MANIFEST);
  if (!(await exists(manifestPath))) {
    problems.push(`www/${SOURCE_MANIFEST} is missing — rebuild the payload with \`npm run build:www\`.`);
    return;
  }

  let manifest = null;
  try {
    manifest = JSON.parse(await read(manifestPath));
  } catch {
    problems.push(`www/${SOURCE_MANIFEST} is unreadable — rebuild the payload.`);
    return;
  }

  const current = await hashSources();
  const recorded = manifest?.files ?? {};
  const changed = [];
  for (const [rel, hash] of Object.entries(current.files)) {
    if (recorded[rel] !== hash) changed.push(rel);
  }
  const removed = Object.keys(recorded).filter((rel) => !(rel in current.files));

  if (changed.length || removed.length) {
    const sample = [...changed, ...removed.map((r) => `${r} (deleted)`)].slice(0, 4).join(", ");
    problems.push(
      `www/ does not match the sources — ${changed.length + removed.length} file(s) changed since it `
      + `was built. Rebuild with \`npm run sync\`. First few: ${sample}`,
    );
  } else {
    notes.push(`payload built ${manifest.builtAt} — matches all ${Object.keys(current.files).length} copied sources`);
  }
}

// Every product the shop can offer has to exist in the Play Console, or the purchase
// dialog fails with PRODUCT_NOT_FOUND at the worst possible moment.
async function checkProducts() {
  try {
    const { playProductIdForOffer } = await import(pathToFileURL(path.join(GAME, "src/platform/playProducts.js")).href);
    const marketplace = await import(pathToFileURL(path.join(GAME, "src/progression/marketplace.js")).href);
    const storage = { getItem: () => null, setItem() {}, removeItem() {} };
    const offers = [
      ...marketplace.getUnitOffers(storage),
      ...marketplace.getSkinOffers(storage),
      ...marketplace.getSkinPackOffers(storage),
      ...marketplace.getConsumableOffers(),
    ].filter((offer) => offer?.price?.cents ?? offer?.premiumPrice?.cents);
    const ids = offers.map((offer) => playProductIdForOffer(offer));
    const illegal = offers.filter((_, i) => !ids[i]);
    if (illegal.length) problems.push(`${illegal.length} offer(s) have no legal Play product id`);
    notes.push(`${ids.length} premium products must exist in the Play Console (npm run play:sync)`);

    // Offer names and descriptions BECOME the Play Console titles (play-products-sync.mjs), so
    // an unfilled template placeholder would be published to the store as literal text.
    const placeholders = offers
      .flatMap((offer) => ["name", "description", "packName", "donationNote"]
        .map((field) => ({ sku: offer.sku || offer.id, field, text: offer?.[field] })))
      .filter(({ text }) => typeof text === "string" && /<[A-Z][A-Z _]+>|TODO|TBD|FIXME/.test(text));
    if (placeholders.length) {
      const first = placeholders[0];
      problems.push(
        `${placeholders.length} store-facing string(s) still contain a placeholder and would be `
        + `published to Play verbatim — e.g. ${first.sku}.${first.field}: "${first.text}"`,
      );
    }
  } catch (error) {
    problems.push(`could not derive the product catalog: ${error.message}`);
  }
}

async function main() {
  await checkSigning();
  await checkPackageAndVersion();
  await checkMobileSecurity();
  await checkPayload();
  await checkProducts();

  for (const note of notes) console.log(`  - ${note}`);
  if (problems.length) {
    console.log("");
    for (const problem of problems) console.log(`  BLOCKED: ${problem}`);
    console.log(`\n  ${problems.length} problem(s) — not ready to upload.`);
    process.exitCode = 1;
    return;
  }
  console.log("\n  Ready. Build with `npm run bundle:release` and upload android/app/build/outputs/bundle/release/app-release.aab");
  console.log("  Server side: platform-api needs GOOGLE_PLAY_SERVICE_ACCOUNT_KEY set, or purchases return 503.");
}

main().catch((error) => {
  console.error(`release-check failed: ${error.message}`);
  process.exit(1);
});
