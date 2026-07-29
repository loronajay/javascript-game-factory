// Creates/updates every Tactical Arena one-time product in the Play Console via the
// current Google Play Developer Publishing API.
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
// Google retired legacy `inappproducts` creation for apps on the new one-time-product
// model. Products now need a localized listing, regional prices, a buy purchase option,
// and a separate activation call. Consumability is still decided at runtime by whether
// the app consumes or acknowledges (see playBillingClient.js).

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, "..", "..", "..", "games", "tactical-arena");
const PACKAGE_NAME = "com.jayarcade.tacticalarena";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const PURCHASE_OPTION_ID = "buy";
const LATENCY_TOLERANT = "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT";

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

export function moneyFromCents(cents) {
  const amount = Number(cents);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new TypeError("price cents must be a positive integer");
  }
  return {
    currencyCode: "USD",
    units: String(Math.floor(amount / 100)),
    nanos: (amount % 100) * 10_000_000,
  };
}

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
      productId: sku,
      cents,
      // Play caps the title at 55 characters and the description at 200.
      title: title.slice(0, 55),
      description: (offer.description || title).slice(0, 200),
    });
  };

  for (const o of marketplace.getUnitOffers(storage)) add(o, `Unit — ${o.name}`);
  for (const o of marketplace.getSkinOffers(storage)) add(o, `${o.name} ${o.type} skin`);
  for (const o of marketplace.getSkinPackOffers(storage)) add(o, `${o.name} skin pack`);
  for (const o of marketplace.getConsumableOffers()) add(o, o.name ?? o.id);
  return out;
}

async function apiRequest(url, { token, method = "POST", body, label = "Google Play request" }) {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function convertRegionPrices(cents, token) {
  return apiRequest(
    `${API_ROOT}/applications/${PACKAGE_NAME}/pricing:convertRegionPrices`,
    {
      token,
      body: { price: moneyFromCents(cents) },
      label: `regional price conversion for $${(cents / 100).toFixed(2)}`,
    },
  );
}

export function buildOneTimeProduct(product, conversion) {
  const regionalPricingAndAvailabilityConfigs = Object.values(conversion?.convertedRegionPrices ?? {})
    .map(({ regionCode, price }) => ({
      regionCode,
      price,
      availability: "AVAILABLE",
    }));
  const otherRegions = conversion?.convertedOtherRegionsPrice;
  if (!regionalPricingAndAvailabilityConfigs.length || !otherRegions?.usdPrice || !otherRegions?.eurPrice) {
    throw new Error(`Google returned no regional prices for ${product.productId}`);
  }
  return {
    packageName: PACKAGE_NAME,
    productId: product.productId,
    listings: [{
      languageCode: "en-US",
      title: product.title,
      description: product.description,
    }],
    purchaseOptions: [{
      purchaseOptionId: PURCHASE_OPTION_ID,
      regionalPricingAndAvailabilityConfigs,
      newRegionsConfig: {
        usdPrice: otherRegions.usdPrice,
        eurPrice: otherRegions.eurPrice,
        availability: "AVAILABLE",
      },
      buyOption: {
        legacyCompatible: true,
        multiQuantityEnabled: false,
      },
    }],
  };
}

export function buildUpdateBatch(products, regionsVersion, { latencyTolerant = false } = {}) {
  return {
    requests: products.map((oneTimeProduct) => ({
      oneTimeProduct,
      updateMask: "listings,purchaseOptions",
      regionsVersion,
      allowMissing: true,
      ...(latencyTolerant ? { latencyTolerance: LATENCY_TOLERANT } : {}),
    })),
  };
}

export function buildActivationBatch(products, { latencyTolerant = false } = {}) {
  return {
    requests: products.map((product) => ({
      activatePurchaseOptionRequest: {
        packageName: PACKAGE_NAME,
        productId: product.productId,
        purchaseOptionId: PURCHASE_OPTION_ID,
        ...(latencyTolerant ? { latencyTolerance: LATENCY_TOLERANT } : {}),
      },
    })),
  };
}

function chunks(items, size = 100) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

export function selectCatalogProducts(products, only) {
  return only
    ? products.filter((product) => product.productId === only)
    : products;
}

function purchaseOptionIsActive(product) {
  return product?.purchaseOptions?.some(
    (option) => option.purchaseOptionId === PURCHASE_OPTION_ID && option.state === "ACTIVE",
  ) === true;
}

async function syncProducts(products, token, { latencyTolerant = false } = {}) {
  const conversions = new Map();
  for (const cents of new Set(products.map((product) => product.cents))) {
    conversions.set(cents, await convertRegionPrices(cents, token));
  }
  const regionVersion = conversions.values().next().value?.regionVersion;
  if (!regionVersion) throw new Error("Google's price conversion returned no region version");

  const currentProducts = products.map((product) =>
    buildOneTimeProduct(product, conversions.get(product.cents)));
  let synced = 0;
  for (const batch of chunks(currentProducts)) {
    const updateResult = await apiRequest(
      `${API_ROOT}/applications/${PACKAGE_NAME}/oneTimeProducts:batchUpdate`,
      {
        token,
        body: buildUpdateBatch(batch, regionVersion, { latencyTolerant }),
        label: `one-time product batch update (${batch[0].productId}…${batch.at(-1).productId})`,
      },
    );
    const updated = Array.isArray(updateResult?.oneTimeProducts)
      ? updateResult.oneTimeProducts
      : [];
    if (updated.length !== batch.length) {
      throw new Error(`Google updated ${updated.length}/${batch.length} products in a batch`);
    }

    const needsActivation = updated.filter((product) => !purchaseOptionIsActive(product));
    if (needsActivation.length) {
      await apiRequest(
        `${API_ROOT}/applications/${PACKAGE_NAME}/oneTimeProducts/-/purchaseOptions:batchUpdateStates`,
        {
          token,
          body: buildActivationBatch(needsActivation, { latencyTolerant }),
          label: `purchase-option activation (${needsActivation[0].productId}…${needsActivation.at(-1).productId})`,
        },
      );
    }
    synced += updated.length;
    console.log(`    ${synced}/${currentProducts.length}...`);
  }
  return synced;
}

async function main() {
  const apply = Boolean(arg("apply"));
  const keyPath = arg("key");
  const only = typeof arg("only") === "string" ? arg("only") : null;

  let products = selectCatalogProducts(await buildProducts(), only);

  console.log(`  ${products.length} product(s) derived from the live catalog`);

  if (!apply) {
    for (const p of products.slice(0, 5)) {
      console.log(`    ${p.productId.padEnd(42)} ${`$${(p.cents / 100).toFixed(2)}`.padStart(7)}  ${p.title}`);
    }
    if (products.length > 5) console.log(`    ... and ${products.length - 5} more`);
    console.log("\n  DRY RUN — nothing was sent to Google.");
    console.log("  Re-run with --apply --key=<service-account.json> to create them.");
    return;
  }

  if (!keyPath) throw new Error("--apply requires --key=<service-account.json>");
  if (!products.length) throw new Error(`no catalog product matched --only=${only}`);
  const token = await accessToken(keyPath);

  // A single `--only` proof should propagate quickly. Full catalog sync uses Google's
  // high-throughput mode; its updates can take up to 24 hours to reach devices.
  const latencyTolerant = !only && products.length > 100;
  const synced = await syncProducts(products, token, { latencyTolerant });
  console.log(`\n  ${synced}/${products.length} synced and active`);
  if (latencyTolerant) console.log("  Google may take up to 24 hours to propagate the full catalog.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`play-products-sync failed: ${error.message}`);
    process.exit(1);
  });
}
