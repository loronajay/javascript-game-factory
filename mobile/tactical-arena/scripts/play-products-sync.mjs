// Creates/updates every Tactical Arena in-app product in the Play Console via the
// Google Play Developer API.
//
// Play Console's CSV import was removed in May 2025, so for a 300+ product catalog
// the API is the only practical route. This derives the product list from the live
// marketplace so the store and the game cannot drift.
//
//   node scripts/play-products-sync.mjs                     # dry run (default)
//   node scripts/play-products-sync.mjs --apply --key=sa.json
//   node scripts/play-products-sync.mjs --apply --key=sa.json --only=ta.unit.monk
//
// The service account needs the `androidpublisher` scope and, in Play Console under
// Users & permissions, at least "Manage store presence" on this app. Auth is a
// signed JWT exchanged for an access token — Node can do RS256 natively, so this
// needs no dependencies.
//
// Every one-time Android product is purchaseType "managedUser"; there is no
// consumable product type. Consumability is decided at runtime by whether the app
// consumes or acknowledges (see playBillingClient.js).

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, "..", "..", "..", "games", "tactical-arena");
const PACKAGE_NAME = "com.jayarcade.tacticalarena";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function arg(name) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : true;
}

const base64url = (buf) => Buffer.from(buf).toString("base64url");

async function accessToken(keyPath) {
  const key = JSON.parse(await readFile(keyPath, "utf8"));
  if (!key.client_email || !key.private_key) {
    throw new Error(`${keyPath} does not look like a service-account key (missing client_email/private_key)`);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(key.private_key));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`token exchange failed: ${body.error_description || body.error || response.status}`);
  return body.access_token;
}

// USD cents -> the micros Google expects.
const micros = (cents) => String(Math.round(cents * 10000));

async function buildProducts() {
  const marketplace = await import(pathToFileURL(path.join(GAME, "src/progression/marketplace.js")).href);
  const { playProductIdForOffer } = await import(
    pathToFileURL(path.join(GAME, "src/platform/playProducts.js")).href
  );
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };

  const out = [];
  const add = (offer, title) => {
    const cents = offer?.price?.cents ?? offer?.premiumPrice?.cents ?? null;
    if (!cents) return;
    const sku = playProductIdForOffer(offer);
    if (!sku) throw new Error(`offer has no legal Play product id: ${offer.sku}`);
    out.push({
      packageName: PACKAGE_NAME,
      sku,
      status: "active",
      purchaseType: "managedUser",
      defaultPrice: { priceMicros: micros(cents), currency: "USD" },
      defaultLanguage: "en-US",
      listings: {
        "en-US": {
          // Play caps the title at 55 characters and the description at 200.
          title: title.slice(0, 55),
          description: (offer.description || title).slice(0, 200),
        },
      },
    });
  };

  for (const o of marketplace.getUnitOffers(storage)) add(o, `Unit — ${o.name}`);
  for (const o of marketplace.getSkinOffers(storage)) add(o, `${o.name} ${o.type} skin`);
  for (const o of marketplace.getSkinPackOffers(storage)) add(o, `${o.name} skin pack`);
  for (const o of marketplace.getConsumableOffers()) add(o, o.name ?? o.id);
  return out;
}

async function upsert(product, token) {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/inappproducts`;
  const query = "?autoConvertMissingPrices=true";

  // Update if it exists, otherwise insert. PUT on a missing sku returns 404.
  let response = await fetch(`${base}/${encodeURIComponent(product.sku)}${query}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(product),
  });
  if (response.status === 404) {
    response = await fetch(`${base}${query}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(product),
    });
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${product.sku}: ${response.status} ${body.slice(0, 200)}`);
  }
  return response.status;
}

async function main() {
  const apply = Boolean(arg("apply"));
  const keyPath = arg("key");
  const only = typeof arg("only") === "string" ? arg("only") : null;

  let products = await buildProducts();
  if (only) products = products.filter((p) => p.sku === only);

  const usd = (m) => `$${(Number(m) / 1000000).toFixed(2)}`;
  console.log(`  ${products.length} product(s) derived from the live catalog`);

  if (!apply) {
    for (const p of products.slice(0, 5)) {
      console.log(`    ${p.sku.padEnd(42)} ${usd(p.defaultPrice.priceMicros).padStart(7)}  ${p.listings["en-US"].title}`);
    }
    if (products.length > 5) console.log(`    ... and ${products.length - 5} more`);
    console.log("\n  DRY RUN — nothing was sent to Google.");
    console.log("  Re-run with --apply --key=<service-account.json> to create them.");
    return;
  }

  if (!keyPath) throw new Error("--apply requires --key=<service-account.json>");
  const token = await accessToken(keyPath);

  let created = 0;
  const failures = [];
  for (const product of products) {
    try {
      await upsert(product, token);
      created += 1;
      if (created % 25 === 0) console.log(`    ${created}/${products.length}...`);
    } catch (error) {
      failures.push(error.message);
    }
  }
  console.log(`\n  ${created}/${products.length} synced`);
  if (failures.length) {
    console.log(`  ${failures.length} failed:`);
    for (const f of failures.slice(0, 10)) console.log(`    ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`play-products-sync failed: ${error.message}`);
  process.exit(1);
});
