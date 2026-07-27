// Prints every in-app product that must exist in the Play Console, derived from the
// live marketplace catalog so the two cannot drift.
//
//   node scripts/play-products-report.mjs            # human-readable table
//   node scripts/play-products-report.mjs --tsv      # paste-able TSV
//
// Every one-time Android product is a "managed product" in Play's own model
// (purchaseType: managedUser). There is NO consumable product type on Android —
// consumability is decided at runtime by whether the app calls consumeAsync instead
// of acknowledgePurchase. The column below therefore describes OUR settle behaviour,
// not a Play Console setting:
//   MANAGED    — units, skins, skin packs. Acknowledged, owned forever.
//   CONSUMABLE — Valor boosts, random-skin grants. Consumed, re-purchasable.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, "..", "..", "..", "games", "tactical-arena");

const marketplace = await import(pathToFileURL(path.join(GAME, "src/progression/marketplace.js")).href);
const { playProductIdForOffer } = await import(
  pathToFileURL(path.join(GAME, "src/platform/playProducts.js")).href
);

const storage = { getItem: () => null, setItem() {}, removeItem() {} };
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

function rows() {
  const out = [];
  const push = (offer, type, name) => {
    const cents = offer?.price?.cents ?? offer?.premiumPrice?.cents ?? null;
    if (!cents) return; // Valor-only offers are not Play products.
    const id = playProductIdForOffer(offer);
    if (!id) throw new Error(`offer has no legal Play product id: ${offer.sku}`);
    out.push({ id, type, name, price: usd(cents), sku: offer.sku });
  };

  for (const offer of marketplace.getUnitOffers(storage)) push(offer, "MANAGED", `Unit — ${offer.name}`);
  for (const offer of marketplace.getSkinOffers(storage)) {
    push(offer, "MANAGED", `Skin — ${offer.name} ${offer.type}`);
  }
  for (const offer of marketplace.getSkinPackOffers(storage)) {
    push(offer, "MANAGED", `Skin Pack — ${offer.name}`);
  }
  for (const offer of marketplace.getConsumableOffers()) push(offer, "CONSUMABLE", offer.name ?? offer.id);
  return out;
}

const list = rows();
const tsv = process.argv.includes("--tsv");

if (tsv) {
  console.log(["product_id", "type", "title", "price_usd"].join("\t"));
  for (const r of list) console.log([r.id, r.type, r.name, r.price].join("\t"));
} else {
  const width = Math.max(...list.map((r) => r.id.length));
  let lastType = null;
  for (const r of list) {
    if (r.type !== lastType) {
      console.log(`\n--- ${r.type} ---`);
      lastType = r.type;
    }
    console.log(`  ${r.id.padEnd(width)}  ${r.price.padStart(8)}  ${r.name}`);
  }
  const managed = list.filter((r) => r.type === "MANAGED").length;
  console.log(`\n  ${list.length} products total — ${managed} managed, ${list.length - managed} consumable`);
  console.log("  Re-run with --tsv for a paste-able list.");
}
