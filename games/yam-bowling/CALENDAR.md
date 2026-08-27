# Yam Bowling 2027 Pinup Calendar — As Built

A physical product sold from the arcade, with a promotional bonus paid into Yam Bowling's
existing Skin Voucher inventory. It reuses the platform's commerce, claim and revocation
infrastructure; the only genuinely new thing is the shipping record, because a digital
entitlement never needed an address.

## The product

| | |
|---|---|
| Price | **$29.99** per calendar, shipping and tax added at checkout |
| Type | Physical **preorder** — nothing ships until the first print run exists |
| Bonus | **10 Skin Vouchers**, once per qualifying account |
| Closed | approx. 11 × 8.5 in, landscape |
| Hanging | approx. 11 × 17 in, portrait, top-bound |

`platform-api/src/services/calendar-catalog.mts` is the single source for all of it. The
browser sends a **quantity and nothing else** — never a price, never a bonus size — so a
tampered checkout request can only ask for more calendars, at the price declared server-side.

## The viewer

`calendar/calendar-viewer.mjs` paints one physical object hanging on a wall and turns its
pages. It reads `calendar/calendar-manifest.mjs` and nothing else: it never builds an asset
path and holds no commerce state.

**A page is a month, not a printed side.** The real object is one 11 × 17 hanging spread per
month — artwork above the binding, grid below — and the sheet/duplex construction behind
that is a manufacturing concern the buyer never sees. An earlier prototype exposed "Side 1 of
26"; that is exactly the leak this design removes.

Page ratio is the artwork's own **3375 × 2625** rather than a rounded 11:8.5. The difference
is under 1%, and using the true ratio means no page is ever cropped or letterboxed — `contain`
with a matching slot. Two stacked give the open form at 11:17.1, the "approximately 11 × 17"
the product is sold as.

Closed and open have **independent width caps**, because their heights differ by half again.
Sizing both from one width either shrinks the cover to nothing or pushes the open spread off
the screen.

The box **snaps** between the two geometries rather than tweening. Animating `aspect-ratio`
interpolates unreliably — it can settle on the start value and leave the open spread painted
at closed proportions, which is a broken product preview — and the page-turn above it is what
actually reads as the calendar opening. The turn hinges on the *outgoing* page's geometry: a
cover is the whole closed object and lifts from its top binding, a month sheet is the lower
half and lifts over the mid binding.

Navigation is buttons, a month rail, keyboard (arrows / Home / End) and swipe. **Swipe only
ever supplements** — nothing requires a drag. `prefers-reduced-motion` skips the turn and
navigates instantly; it never removes a control.

### Assets

`tools/build_calendar_assets.py` derives `assets/calendar/*.webp` from the approved PNG
masters. The masters are print resolution (~150 MB for the set); the derived display and
thumb sizes total about 5 MB. It never upscales — January and December art ship at 1426px
wide and stay there.

```powershell
python tools/build_calendar_assets.py [--masters DIR] [--force]
```

Preloading is **adjacent only**. Eagerly loading the whole set would cost more than it saves
on a page most visitors scroll past.

## Commerce

### What was reused, unchanged

- `game_inventory_items` and the regular `skin-voucher` item — no calendar-specific
  voucher type. These vouchers redeem Maid Café skins only; the calendar bonus
  does not grant `swimsuit-voucher` inventory and cannot unlock Swimsuit skins.
- `game_progress_claims` for idempotency, `revokeGameEntitlements` for clawback,
  `findStripeGrant` for tracing, and the existing Stripe signature verification

### What had to be extended

Two pre-existing constraints made a second cabinet's paid grant impossible, and both are now
per-game registries rather than Tactical Arena specifics:

1. **`services/game-inventory-catalog.mts` (new).** Inventory grants used to be validated
   against Tactical Arena's consumable catalog, so a yam-bowling item was *silently dropped*
   — the purchase succeeded and the player got nothing. Grantability is now declared per
   cabinet.
2. **The Stripe webhook dispatches by product.** `fulfillStripeWebhook` called Tactical
   Arena's fulfillment unconditionally. The calendar's handlers are **injected, not
   imported**, because calendar fulfillment builds on the payments module and importing it
   back would close a cycle.

### Two idempotency guarantees, deliberately separate

| | Key | Effect |
|---|---|---|
| The order | unique index on `checkout_session_id` | one paid session ships one order |
| The bonus | `(player, game, "calendar-bonus:<promotion>")` in `game_progress_claims` | ten vouchers per account, ever |

A payment retry collides with **both**. A second *order* by the same player collides only
with the bonus — which is exactly the rule: 1 calendar → 10 vouchers, 5 calendars → still 10,
two separate orders → still 10, and both orders still ship. The bonus claim id names the
**promotion, not the order**, and that is the whole mechanism.

### Timing

A created checkout session is not a purchase. Nothing ships and no voucher is paid until
Stripe reports `payment_status: "paid"`. The webhook is the authority; the buyer's return to
the success page settles the same rows so someone who lands back first still sees a confirmed
order. Whichever arrives first wins and the other is a no-op.

### Authentication

Checkout is signed-in only. The bonus needs an authoritative recipient and **a typed-in
checkout email is not one** — the vouchers go to the authenticated Factory player ID. A
signed-out buyer is routed through the existing sign-in flow and returned to the page.

## Refunds and chargebacks

A refund or dispute names a payment intent, not a product. The calendar is asked first: if a
physical order matches, that order owns the outcome — it closes the shipment and revokes its
own promotional vouchers — and the generic entitlement revocation does not also fire.

`premium-calendar-preorder` is deliberately **excluded** from `PREMIUM_GRANT_CLAIM_KINDS`.
The bonus claim is promotion-scoped, so the payment intent recorded on it belongs to whichever
order happened to trigger it first; matching refunds against it would double-revoke and would
attribute the bonus to the wrong order once a player buys twice. `calendar_orders` records
which order actually paid, so revocation traces from there.

### Documented limit — spent vouchers are not clawed back

Revocation is clamped at zero, so only the **unspent** remainder returns. Quantity already
redeemed for a skin stays redeemed, and the entitlement it bought is left alone. Reversing a
redeemed cosmetic would need an entitlement clawback system across the reward ladders, and per
the feature scope that is **documented rather than half-built**. It needs explicit approval
before anyone starts it.

### Open policy question — account deletion

`calendar_orders` is retained when an account is deleted, and is listed in the account-deletion
test's `RETAINED` set as a *commercial and shipping record*: a paid preorder that has not
shipped is an obligation still owed, and a shipped one is an accounting record a chargeback
may be raised against months later. Deleting it would strand a paid shipment with no way to
trace it.

**Retention of the shipping name and address that ride on that row is a policy decision for
the operator, not a code default.** If they should be scrubbed after fulfillment completes,
that is a deliberate change to `deletePlayerAccount` and should be made on purpose.

## Files

| Path | Owns |
|---|---|
| `calendar/calendar-manifest.mjs` | the ordered calendar; the only place an asset path is built |
| `calendar/calendar-viewer.mjs` | the wall-calendar object and its page turns |
| `calendar/calendar-page.mjs` | the product page: quantity, checkout hand-off, order status |
| `calendar/calendar.css` / `calendar-page.css` | viewer geometry / page presentation |
| `tools/build_calendar_assets.py` | PNG masters → runtime WebP |
| `calendar-viewer.test.mjs` | manifest + viewer behaviour (18 tests) |
| `platform-api/src/services/calendar-catalog.mts` | price, bonus size, the per-account rule |
| `platform-api/src/services/calendar-payments.mts` | checkout, fulfillment, refund closure |
| `platform-api/src/services/game-inventory-catalog.mts` | which items each cabinet may grant |
| `platform-api/src/db/calendar-orders.mts` | the shipping record |
| `platform-api/src/db/migrations/046-calendar-orders.sql` | its table |
| `platform-api/src/routes/calendar-routes.mts` | offer, quote, checkout, my orders |
| `platform-api/src/routes/admin-calendar-routes.mts` | fulfillment, metrics, CSV export |
| `js/admin-page/render-calendar.mts` | the console's Calendar tab |
| `platform-api/tests/calendar-preorder.test.mjs` | commerce behaviour (26 tests) |

## Admin

`/admin/` → **Calendar**. Preorder totals count **orders and calendars separately**, because
one customer may buy several and it is the calendar count that sizes a print run. Orders can
be filtered and searched, fulfillment state and tracking updated (audited), and paid orders
exported as CSV with every field production needs to pack and post — addresses are RFC 4180
escaped, because an unescaped comma silently shifts every later column and ships calendars to
the wrong place.

The CSV is **fetched with the admin bearer token and turned into a download**, not linked: a
plain `<a href>` cannot carry the token and would save a 401 page to disk.

## Deployment checklist

- [ ] Run migration `046-calendar-orders.sql`
- [ ] Confirm `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` are set
- [ ] Subscribe the webhook to `checkout.session.completed`,
      `checkout.session.async_payment_succeeded`, `charge.refunded`,
      `charge.dispute.created`, `charge.dispute.closed`
- [ ] Enable Stripe Tax, and configure **shipping rates** — postage is quoted by Stripe and
      deliberately never computed here
- [ ] Confirm `APP_BASE_URL` matches the serving origin (the success/cancel URLs derive from it)
- [ ] Decide the manufacturing quantity from the admin metrics — nothing commits a print run
      automatically
