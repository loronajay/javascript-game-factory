import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildActivationBatch,
  buildOneTimeProduct,
  buildUpdateBatch,
  moneyFromCents,
  selectCatalogProducts,
} from "../../../mobile/tactical-arena/scripts/play-products-sync.mjs";

const PRICE_CONVERSION = {
  convertedRegionPrices: {
    US: {
      regionCode: "US",
      price: { currencyCode: "USD", units: "0", nanos: 990_000_000 },
    },
    GB: {
      regionCode: "GB",
      price: { currencyCode: "GBP", units: "0", nanos: 790_000_000 },
    },
  },
  convertedOtherRegionsPrice: {
    usdPrice: { currencyCode: "USD", units: "0", nanos: 990_000_000 },
    eurPrice: { currencyCode: "EUR", units: "0", nanos: 890_000_000 },
  },
  regionVersion: { version: "2026/07" },
};

test("USD cents are encoded as Google Money without floating-point drift", () => {
  assert.deepEqual(moneyFromCents(99), {
    currencyCode: "USD",
    units: "0",
    nanos: 990_000_000,
  });
  assert.deepEqual(moneyFromCents(399), {
    currencyCode: "USD",
    units: "3",
    nanos: 990_000_000,
  });
});

test("a catalog offer becomes a current one-time product with a legacy-compatible buy option", () => {
  const product = buildOneTimeProduct({
    productId: "ta.unit.monk",
    title: "Unit — Monk",
    description: "Unlock Monk.",
  }, PRICE_CONVERSION);

  assert.equal(product.packageName, "com.jayarcade.tacticalarena");
  assert.equal(product.productId, "ta.unit.monk");
  assert.deepEqual(product.listings, [{
    languageCode: "en-US",
    title: "Unit — Monk",
    description: "Unlock Monk.",
  }]);
  assert.deepEqual(product.purchaseOptions[0].buyOption, {
    legacyCompatible: true,
    multiQuantityEnabled: false,
  });
  assert.equal(product.purchaseOptions[0].purchaseOptionId, "buy");
  assert.deepEqual(
    product.purchaseOptions[0].regionalPricingAndAvailabilityConfigs,
    [
      { ...PRICE_CONVERSION.convertedRegionPrices.US, availability: "AVAILABLE" },
      { ...PRICE_CONVERSION.convertedRegionPrices.GB, availability: "AVAILABLE" },
    ],
  );
  assert.deepEqual(product.purchaseOptions[0].newRegionsConfig, {
    ...PRICE_CONVERSION.convertedOtherRegionsPrice,
    availability: "AVAILABLE",
  });
});

test("publishing uses allow-missing one-time-product updates with Google's region version", () => {
  const oneTimeProduct = buildOneTimeProduct({
    productId: "ta.unit.monk",
    title: "Unit — Monk",
    description: "Unlock Monk.",
  }, PRICE_CONVERSION);
  const body = buildUpdateBatch([oneTimeProduct], PRICE_CONVERSION.regionVersion, {
    latencyTolerant: true,
  });

  assert.deepEqual(body.requests[0], {
    oneTimeProduct,
    updateMask: "listings,purchaseOptions",
    regionsVersion: { version: "2026/07" },
    allowMissing: true,
    latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT",
  });
});

test("new draft purchase options are activated in a second current-API batch", () => {
  const body = buildActivationBatch([
    { productId: "ta.unit.monk" },
    { productId: "ta.unit.paladin" },
  ], { latencyTolerant: true });

  assert.deepEqual(body.requests, [
    {
      activatePurchaseOptionRequest: {
        packageName: "com.jayarcade.tacticalarena",
        productId: "ta.unit.monk",
        purchaseOptionId: "buy",
        latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT",
      },
    },
    {
      activatePurchaseOptionRequest: {
        packageName: "com.jayarcade.tacticalarena",
        productId: "ta.unit.paladin",
        purchaseOptionId: "buy",
        latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT",
      },
    },
  ]);
});

test("--only selects the requested current product id", () => {
  const products = [
    { productId: "ta.unit.monk" },
    { productId: "ta.unit.paladin" },
  ];
  assert.deepEqual(selectCatalogProducts(products, "ta.unit.monk"), [products[0]]);
  assert.deepEqual(selectCatalogProducts(products, null), products);
});

test("npm exposes proof and full apply commands without relying on flag forwarding", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../../../mobile/tactical-arena/package.json", import.meta.url),
    "utf8",
  ));
  assert.equal(
    packageJson.scripts["play:sync:proof"],
    "node scripts/play-products-sync.mjs --apply --key=play-service-account.json --only=ta.unit.monk",
  );
  assert.equal(
    packageJson.scripts["play:sync:apply"],
    "node scripts/play-products-sync.mjs --apply --key=play-service-account.json",
  );
});
